import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => writeFileSync(path, content, 'utf8');

function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`v0.34.1: anchor not found: ${label}`);
  return source.replace(anchor, `${anchor}${addition}`);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v0.34.1: fragment not found: ${label}`);
  return source.replace(before, after);
}

function patchApp() {
  const path = 'src/App.tsx';
  let source = read(path);
  source = insertAfter(
    source,
    "import { formatInteger } from './ui/format';",
    "\nimport { contactStageLabel } from './world/civilizations';",
    'contact stage label import'
  );
  write(path, source);
}

function patchSnapshotTest() {
  const path = 'src/tests/snapshot.test.ts';
  let source = read(path);
  source = replaceOnce(
    source,
    "localNpcs: [], civilizationContacts: [], archaeologyChains: [], researchProjects: [], technologyBlueprints: [], equipmentInventory: [], worldThreads: [], storyScenes: [], pendingConsequences: [], objectives: [], tutorial:",
    "localNpcs: [], civilizationContacts: [], archaeologyChains: [], researchProjects: [], technologyBlueprints: [], equipmentInventory: [], worldThreads: [], storyScenes: [], pendingConsequences: [], objectives: [], navigation: { history: [], knownSectorIds: [] }, tutorial:",
    'snapshot fixture navigation'
  );
  write(path, source);
}

function patchSimulationPersistenceTest() {
  const path = 'src/tests/simulationPersistence.test.ts';
  let source = read(path);
  source = replaceOnce(
    source,
    "    objectives: [],\n    tutorial:",
    "    objectives: [],\n    navigation: { history: [], knownSectorIds: [] },\n    tutorial:",
    'simulation persistence fixture navigation'
  );
  write(path, source);
}

function patchVersion() {
  const path = 'src/version.ts';
  let source = read(path);
  source = source.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.34.1';");
  source = source.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'GALACTIC_GEOGRAPHY_STABLE';");
  write(path, source);
}

patchApp();
patchSnapshotTest();
patchSimulationPersistenceTest();
patchVersion();
console.log('Void Chronicles v0.34.1 installed: navigation fixtures and contact label import fixed.');
