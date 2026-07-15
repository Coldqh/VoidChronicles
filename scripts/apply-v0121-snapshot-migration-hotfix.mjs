import fs from 'node:fs';
import path from 'node:path';

const snapshotPath = path.join(process.cwd(), 'src/persistence/snapshot.ts');
const versionPath = path.join(process.cwd(), 'src/version.ts');

let snapshot = fs.readFileSync(snapshotPath, 'utf8');

const oldV1 = "kind: z.enum(['civilization-cycle','faction-cycle','system-cycle','war-cycle'])";
const oldV2 = "kind: z.enum(['civilization-cycle','faction-cycle','system-cycle','war-cycle','ecology-cycle'])";
const expanded = "kind: z.enum(['civilization-cycle','faction-cycle','system-cycle','war-cycle','ecology-cycle','settlement-cycle','trade-cycle','migration-cycle'])";

let changed = false;

if (snapshot.includes(oldV1)) {
  snapshot = snapshot.replace(oldV1, expanded);
  changed = true;
} else if (!snapshot.includes(expanded)) {
  throw new Error('v0.12.1: scheduledEventV1Schema marker not found');
}

if (snapshot.includes(oldV2)) {
  snapshot = snapshot.replace(oldV2, expanded);
  changed = true;
}

if (changed) {
  fs.writeFileSync(snapshotPath, snapshot, 'utf8');
  console.log('v0.12.1: legacy and current scheduled-event schemas updated');
} else {
  console.log('v0.12.1: scheduled-event schemas already updated');
}

if (fs.existsSync(versionPath)) {
  let version = fs.readFileSync(versionPath, 'utf8');
  const nextVersion = version.replace(
    /export const APP_VERSION = '0\.12(?:\.0)?';/,
    "export const APP_VERSION = '0.12.1';"
  );
  if (nextVersion !== version) {
    fs.writeFileSync(versionPath, nextVersion, 'utf8');
    console.log('v0.12.1: application version updated');
  }
}
