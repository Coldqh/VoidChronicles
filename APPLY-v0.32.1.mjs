import { readFileSync, writeFileSync } from 'node:fs';

const versionPath = 'src/version.ts';
let version = readFileSync(versionPath, 'utf8');

if (!version.includes("export const APP_VERSION = '0.32.1';")) {
  version = version.replace(
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.32.1';"
  );
  version = version.replace(
    /export const APP_CODENAME = '[^']+';/,
    "export const APP_CODENAME = 'PLAYER_OPERATIONS_TESTED';"
  );
  writeFileSync(versionPath, version, 'utf8');
  console.log('v0.32.1: version metadata updated.');
} else {
  console.log('v0.32.1: already applied.');
}
