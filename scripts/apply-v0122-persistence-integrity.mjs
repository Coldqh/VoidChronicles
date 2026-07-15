import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(cwd, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(cwd, relativePath), content, 'utf8');
}

function replaceRequired(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) {
    throw new Error(`v0.12.2: marker not found — ${label}`);
  }
  return text.replace(search, replacement);
}

function replaceRegexRequired(text, regex, replacement, label) {
  if (regex.test(text)) return text.replace(regex, replacement);
  throw new Error(`v0.12.2: regex marker not found — ${label}`);
}

// Version and save schema.
{
  let text = read('src/version.ts');
  text = replaceRegexRequired(
    text,
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.12.2';",
    'APP_VERSION'
  );
  text = replaceRegexRequired(
    text,
    /export const SAVE_SCHEMA_VERSION = \d+;/,
    'export const SAVE_SCHEMA_VERSION = 13;',
    'SAVE_SCHEMA_VERSION'
  );
  write('src/version.ts', text);
}

// SimulationState v3.
{
  let text = read('src/simulation/types.ts');
  text = replaceRequired(
    text,
    'export interface SimulationState {\n  version: 2;',
    'export interface SimulationState {\n  version: 3;',
    'SimulationState version'
  );
  write('src/simulation/types.ts', text);
}

// Kernel creates and upgrades to v3.
{
  let text = read('src/simulation/kernel.ts');
  text = replaceRequired(
    text,
    '    version: 2,',
    '    version: 3,',
    'kernel initialization version'
  );
  text = replaceRequired(
    text,
    "type LegacySimulation = Omit<Partial<SimulationState>, 'version'> & { version?: 1 | 2 }",
    "type LegacySimulation = Omit<Partial<SimulationState>, 'version'> & { version?: 1 | 2 | 3 }",
    'legacy simulation union'
  );
  text = replaceRequired(
    text,
    '    version: 2 as const,',
    '    version: 3 as const,',
    'kernel upgrade version'
  );
  text = replaceRequired(
    text,
    'export function adjustEcosystem(',
    'export const upgradeSimulationPersistence = upgradeSimulationEcosystems;\n\nexport function adjustEcosystem(',
    'upgrade alias'
  );
  write('src/simulation/kernel.ts', text);
}

// Snapshot v13 + v3 integrity.
{
  let text = read('src/persistence/snapshot.ts');

  text = replaceRequired(
    text,
    "import { initializeSimulation, upgradeSimulationEcosystems } from '../simulation/kernel';",
    "import { initializeSimulation, upgradeSimulationPersistence } from '../simulation/kernel';\nimport { repairSimulationPersistence } from '../simulation/integrity';",
    'snapshot kernel import'
  );
  text = text.replaceAll('upgradeSimulationEcosystems(', 'upgradeSimulationPersistence(');

  text = replaceRequired(
    text,
    "const knowledgeRecordSchema = z.object({\n  entityId: z.string(), entityType: z.enum(['system','planet','civilization','faction','hub','artifact','ecosystem','species']),",
    "const simulationStateV3Schema = simulationStateV2Schema.extend({\n  version: z.literal(3),\n  settlements: z.record(z.string(), settlementStateSchema),\n  populationGroups: z.record(z.string(), populationGroupStateSchema),\n  tradeRoutes: z.record(z.string(), tradeRouteStateSchema),\n  scheduledEvents: z.array(scheduledEventV2Schema)\n});\nconst knowledgeRecordSchema = z.object({\n  entityId: z.string(), entityType: z.enum(['system','planet','civilization','faction','hub','artifact','ecosystem','species','settlement','populationGroup','tradeRoute']),",
    'simulationStateV3Schema and knowledge entities'
  );

  text = replaceRequired(
    text,
    "const v12PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateV2Schema, knowledge: playerKnowledgeSchema });",
    "const v12PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateV2Schema, knowledge: playerKnowledgeSchema });\nconst v13PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateV3Schema, knowledge: playerKnowledgeSchema });",
    'v13 payload'
  );

  text = replaceRequired(
    text,
    "const snapshotV12Schema = v12PayloadSchema.extend({ schemaVersion: z.literal(12), saveMeta: saveMetadataSchema });\n\ntype SnapshotCurrent = z.infer<typeof snapshotV12Schema>;",
    "const snapshotV12Schema = v12PayloadSchema.extend({ schemaVersion: z.literal(12), saveMeta: saveMetadataSchema });\nconst snapshotV13Schema = v13PayloadSchema.extend({ schemaVersion: z.literal(13), saveMeta: saveMetadataSchema });\n\ntype SnapshotCurrent = z.infer<typeof snapshotV13Schema>;",
    'snapshot v13 current type'
  );

  text = replaceRequired(
    text,
    "  const civilizationLayer = initializeCivilizationLayer(enrichGalaxyCivilizations(snapshot.galaxy as GameStateSnapshot['galaxy']), snapshot.hubs as GameStateSnapshot['hubs']);\n  const validEntityIds = new Set<string>([",
    "  const civilizationLayer = initializeCivilizationLayer(enrichGalaxyCivilizations(snapshot.galaxy as GameStateSnapshot['galaxy']), snapshot.hubs as GameStateSnapshot['hubs']);\n  snapshot = {\n    ...snapshot,\n    simulation: repairSimulationPersistence(snapshot.simulation, {\n      galaxy: civilizationLayer.galaxy,\n      factions: snapshot.factions,\n      hubs: civilizationLayer.hubs\n    })\n  };\n  const validEntityIds = new Set<string>([",
    'normalize integrity hook'
  );

  text = replaceRequired(
    text,
    "  } else if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {\n    migrated = snapshotV12Schema.parse(input);",
    "  } else if (header.schemaVersion === 12) {\n    const previous = snapshotV12Schema.parse(input);\n    const simulation = upgradeSimulationPersistence(previous.simulation as any, {\n      seed: previous.galaxy.seed,\n      galaxy: previous.galaxy as GameStateSnapshot['galaxy'],\n      factions: previous.factions as GameStateSnapshot['factions'],\n      hubs: previous.hubs as GameStateSnapshot['hubs']\n    });\n    migrated = {\n      ...previous,\n      simulation,\n      schemaVersion: CURRENT_SCHEMA_VERSION,\n      saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v12-persistence-v3', checksum: '00000000' }\n    };\n  } else if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {\n    migrated = snapshotV13Schema.parse(input);",
    'schema v12 migration branch'
  );

  text = replaceRequired(
    text,
    "  if (migrated.simulation?.version !== 2 || !migrated.simulation?.ecosystems || Object.keys(migrated.simulation?.settlements ?? {}).length === 0) {",
    "  if (migrated.simulation?.version !== 3 || !migrated.simulation?.ecosystems || Object.keys(migrated.simulation?.settlements ?? {}).length === 0) {",
    'v3 upgrade condition'
  );

  text = replaceRequired(
    text,
    '  const normalized = normalizeSnapshot(snapshotV12Schema.parse(migrated));',
    '  const normalized = normalizeSnapshot(snapshotV13Schema.parse(migrated));',
    'final v13 parse'
  );

  write('src/persistence/snapshot.ts', text);
}

// Existing tests now expect v3.
function updateTests(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      updateTests(full);
      continue;
    }
    if (!entry.name.endsWith('.test.ts')) continue;
    let text = fs.readFileSync(full, 'utf8');
    text = text.replaceAll(
      'expect(result.simulation.version).toBe(2);',
      'expect(result.simulation.version).toBe(3);'
    );
    text = text.replaceAll(
      'expect(migrated.simulation.version).toBe(2);',
      'expect(migrated.simulation.version).toBe(3);'
    );
    fs.writeFileSync(full, text, 'utf8');
  }
}
updateTests(path.join(cwd, 'src'));

console.log('v0.12.2 Simulation Persistence Integrity applied');
