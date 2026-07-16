import { readFileSync, writeFileSync } from 'node:fs';

const consequencesPath = 'src/simulation/planetaryConsequences.ts';
const versionPath = 'src/version.ts';

let source = readFileSync(consequencesPath, 'utf8');

const typeImport = "import type { PlanetEcologyState } from '../ecology/types';";
const integrityImport = "import { normalizeEcologyState } from '../ecology/integrity';";

if (!source.includes(integrityImport)) {
  if (!source.includes(typeImport)) {
    throw new Error('v0.31.2: PlanetEcologyState import not found.');
  }
  source = source.replace(typeImport, `${typeImport}\n${integrityImport}`);
}

const oldAssignment =
  '    const nextEcology = applyImpact(ecology, impact, rng, atHour);';
const safeAssignment =
  '    const nextEcology = normalizeEcologyState(applyImpact(ecology, impact, rng, atHour));';

if (source.includes(safeAssignment)) {
  console.log('v0.31.2: state-boundary ecology normalization already applied.');
} else {
  if (!source.includes(oldAssignment)) {
    throw new Error(
      'v0.31.2: expected nextEcology assignment was not found. ' +
      'Install v0.31.0 before applying this hotfix.'
    );
  }
  source = source.replace(oldAssignment, safeAssignment);
  writeFileSync(consequencesPath, source, 'utf8');
  console.log('v0.31.2: ecology is normalized before state assignment.');
}

let version = readFileSync(versionPath, 'utf8');
if (!version.includes("export const APP_VERSION = '0.31.2';")) {
  version = version.replace(
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.31.2';"
  );
  version = version.replace(
    /export const APP_CODENAME = '[^']+';/,
    "export const APP_CODENAME = 'LIVING_CONTACTS_INTEGER_SAFE';"
  );
  writeFileSync(versionPath, version, 'utf8');
  console.log('v0.31.2: version metadata updated.');
}
