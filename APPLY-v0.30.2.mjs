import { readFileSync, writeFileSync } from 'node:fs';

const surfacePath = 'src/generation/surface.ts';
const versionPath = 'src/version.ts';

const oldSupportLine =
  "  const supportCount = tutorialMap ? 0 : Math.max(1, Math.min(3, mission.requiredEvidence - 1));";

const newSupportBlock = `  const supportBase = Math.max(1, Math.min(3, mission.requiredEvidence - 1));
  const supportVariation = Array.from(point.id).reduce(
    (value, character) => (Math.imul(value, 33) + character.charCodeAt(0)) >>> 0,
    point.possibleRewards.length
  ) % 3;
  const supportCount = tutorialMap ? 0 : Math.min(4, supportBase + supportVariation);`;

let surface = readFileSync(surfacePath, 'utf8');

if (surface.includes(newSupportBlock)) {
  console.log('v0.30.2: surface variation already applied.');
} else {
  if (!surface.includes(oldSupportLine)) {
    throw new Error(
      'v0.30.2: expected supportCount line was not found in src/generation/surface.ts. ' +
      'Make sure v0.30.0 is installed before applying this hotfix.'
    );
  }
  surface = surface.replace(oldSupportLine, newSupportBlock);
  writeFileSync(surfacePath, surface, 'utf8');
  console.log('v0.30.2: varied secondary expedition evidence counts applied.');
}

let version = readFileSync(versionPath, 'utf8');
if (!version.includes("export const APP_VERSION = '0.30.2';")) {
  version = version.replace(
    /export const APP_VERSION = '0\.30\.[0-9]+';/,
    "export const APP_VERSION = '0.30.2';"
  );
  version = version.replace(
    /export const APP_CODENAME = '[^']+';/,
    "export const APP_CODENAME = 'LOREBOUND_OFFLINE_STABLE';"
  );
  writeFileSync(versionPath, version, 'utf8');
  console.log('v0.30.2: version metadata updated.');
}
