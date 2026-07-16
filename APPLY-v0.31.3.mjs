import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const integrityPath = 'src/ecology/integrity.ts';
const versionPath = 'src/version.ts';

if (!existsSync(integrityPath)) {
  throw new Error(
    'v0.31.3: src/ecology/integrity.ts is missing after extraction. ' +
    'Extract the ZIP into C:\\VoidChronicles with directory structure preserved.'
  );
}

const integrity = readFileSync(integrityPath, 'utf8');
if (!integrity.includes('export function normalizeEcologyState')) {
  throw new Error('v0.31.3: ecology integrity module is incomplete.');
}

let version = readFileSync(versionPath, 'utf8');
if (!version.includes("export const APP_VERSION = '0.31.3';")) {
  version = version.replace(
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.31.3';"
  );
  version = version.replace(
    /export const APP_CODENAME = '[^']+';/,
    "export const APP_CODENAME = 'LIVING_CONTACTS_INTEGRITY_RESTORED';"
  );
  writeFileSync(versionPath, version, 'utf8');
  console.log('v0.31.3: version metadata updated.');
}

console.log('v0.31.3: ecology integrity module restored.');
