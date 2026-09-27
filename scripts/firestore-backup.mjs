// Daily backup of the Crackle Cart Firestore data.
//
// Reads the public "siteData/catalog" document over Firestore's REST API
// (allowed by our security rules: anyone can read siteData, only the admin
// can write it) using the non-secret web apiKey, converts it from Firestore's
// wire format into plain JSON, and writes it to backups/<date>.json and
// backups/latest.json so it can be restored by hand if anything ever goes
// wrong with the live database.
import fs from "node:fs";
import path from "node:path";

const apiKey = process.env.FIREBASE_API_KEY;
const projectId = process.env.FIREBASE_PROJECT_ID;

if (!apiKey || !projectId) {
  console.error("Missing FIREBASE_API_KEY or FIREBASE_PROJECT_ID environment variables.");
  process.exit(1);
}

const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/siteData/catalog?key=${apiKey}`;

function fromFirestoreValue(value) {
  if (value == null) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields || {});
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  return null;
}

function fromFirestoreFields(fields) {
  const out = {};
  for (const key of Object.keys(fields || {})) {
    out[key] = fromFirestoreValue(fields[key]);
  }
  return out;
}

async function main() {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore fetch failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  const json = await res.json();

  if (!json.fields) {
    console.log("siteData/catalog does not exist yet in Firestore — nothing to back up today.");
    return;
  }

  const data = fromFirestoreFields(json.fields);
  const dir = "backups";
  fs.mkdirSync(dir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const pretty = JSON.stringify(data, null, 2);

  fs.writeFileSync(path.join(dir, `${today}.json`), pretty);
  fs.writeFileSync(path.join(dir, "latest.json"), pretty);

  console.log(`Backup written: backups/${today}.json (and updated backups/latest.json)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
