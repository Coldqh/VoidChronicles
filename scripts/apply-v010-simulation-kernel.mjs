import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, text) => fs.writeFileSync(path.join(root, file), text.replace(/\r\n/g, '\n'), 'utf8');

function replace(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error(`v0.10 patch: marker not found: ${label}`);
  return text.replace(before, after);
}

function insertBefore(text, marker, addition, label) {
  if (text.includes(addition.trim())) return text;
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`v0.10 patch: marker not found: ${label}`);
  return text.slice(0, index) + addition + text.slice(index);
}

function insertAfter(text, marker, addition, label) {
  if (text.includes(addition.trim())) return text;
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`v0.10 patch: marker not found: ${label}`);
  return text.slice(0, index + marker.length) + addition + text.slice(index + marker.length);
}

// types.ts
{
  const file = 'src/game/types.ts';
  let text = read(file);
  const definitions = `

export interface WorldTime {
  absoluteHour: number;
  day: number;
  year: number;
}

export type SimulationEventKind = 'trade' | 'shortage' | 'migration' | 'conflict' | 'discovery' | 'politics' | 'population' | 'research' | 'disaster';
export type KnowledgeSource = 'direct' | 'scan' | 'archive' | 'news' | 'rumor' | 'trade';

export interface SimulationEvent {
  id: string;
  kind: SimulationEventKind;
  hour: number;
  year: number;
  title: string;
  summary: string;
  severity: number;
  reliability: number;
  systemId?: string;
  factionIds: string[];
  visibleToPublic: boolean;
  causes: string[];
  effects: string[];
}

export interface ScheduledSimulationEvent {
  id: string;
  dueHour: number;
  kind: SimulationEventKind;
  systemId?: string;
  factionId?: string;
  payload: Record<string, string | number | boolean>;
}

export interface SimulationState {
  seed: string;
  time: WorldTime;
  queue: ScheduledSimulationEvent[];
  events: SimulationEvent[];
  revision: number;
  lastProcessedHour: number;
}

export interface KnowledgeRecord {
  entityId: string;
  entityType: 'system' | 'planet' | 'civilization' | 'faction' | 'hub' | 'artifact' | 'event';
  confidence: number;
  discoveredAtHour: number;
  lastConfirmedAtHour: number;
  source: KnowledgeSource;
  fieldsKnown: string[];
}
`;
  text = insertBefore(text, "export interface SaveMetadata {", definitions + "\n", 'simulation type definitions');
  text = replace(text,
    "  gameYear: number;\n  discoveries: Discovery[];",
    "  gameYear: number;\n  simulation: SimulationState;\n  knowledge: KnowledgeRecord[];\n  discoveries: Discovery[];",
    'snapshot simulation fields');
  write(file, text);
}

// snapshot.ts
{
  const file = 'src/persistence/snapshot.ts';
  let text = read(file);
  text = insertAfter(text,
    "import { createInitialLegacy } from '../world/legacy';",
    "\nimport { initializeSimulation, migrateLegacyKnowledge } from '../simulation';",
    'snapshot simulation import');
  const schemas = `
const worldTimeSchema = z.object({ absoluteHour: finiteNumber, day: finiteNumber, year: finiteNumber });
const simulationEventKindSchema = z.enum(['trade','shortage','migration','conflict','discovery','politics','population','research','disaster']);
const simulationEventSchema = z.object({
  id: z.string(), kind: simulationEventKindSchema, hour: finiteNumber, year: finiteNumber,
  title: z.string(), summary: z.string(), severity: finiteNumber, reliability: finiteNumber,
  systemId: z.string().optional(), factionIds: z.array(z.string()), visibleToPublic: z.boolean(),
  causes: z.array(z.string()), effects: z.array(z.string())
});
const scheduledSimulationEventSchema = z.object({
  id: z.string(), dueHour: finiteNumber, kind: simulationEventKindSchema,
  systemId: z.string().optional(), factionId: z.string().optional(),
  payload: z.record(z.union([z.string(), finiteNumber, z.boolean()]))
});
const simulationStateSchema = z.object({
  seed: z.string(), time: worldTimeSchema, queue: z.array(scheduledSimulationEventSchema),
  events: z.array(simulationEventSchema), revision: finiteNumber, lastProcessedHour: finiteNumber
});
const knowledgeRecordSchema = z.object({
  entityId: z.string(), entityType: z.enum(['system','planet','civilization','faction','hub','artifact','event']),
  confidence: finiteNumber, discoveredAtHour: finiteNumber, lastConfirmedAtHour: finiteNumber,
  source: z.enum(['direct','scan','archive','news','rumor','trade']), fieldsKnown: z.array(z.string())
});
`;
  text = insertBefore(text, "const v10PayloadSchema = v9PayloadSchema.extend({ legacy: legacyStateSchema });", schemas + '\n', 'simulation schemas');
  text = insertAfter(text, "const v10PayloadSchema = v9PayloadSchema.extend({ legacy: legacyStateSchema });", `\nconst v11PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateSchema, knowledge: z.array(knowledgeRecordSchema) });`, 'v11 payload');
  text = insertAfter(text, "const snapshotV10Schema = v10PayloadSchema.extend({ schemaVersion: z.literal(10), saveMeta: saveMetadataSchema });", "\nconst snapshotV11Schema = v11PayloadSchema.extend({ schemaVersion: z.literal(11), saveMeta: saveMetadataSchema });", 'v11 schema');
  text = replace(text, "type SnapshotCurrent = z.infer<typeof snapshotV10Schema>;", "type SnapshotCurrent = z.infer<typeof snapshotV11Schema>;", 'current snapshot type');
  text = replace(text,
    "  } else if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {\n    migrated = snapshotV10Schema.parse(input);",
    "  } else if (header.schemaVersion === 10) {\n    const previous = snapshotV10Schema.parse(input);\n    migrated = { ...previous, simulation: initializeSimulation(previous.galaxy.seed), knowledge: migrateLegacyKnowledge(previous.galaxy), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v10', checksum: '00000000' } };\n    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);\n  } else if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {\n    migrated = snapshotV11Schema.parse(input);",
    'v10 migration');
  text = replace(text, "const normalized = normalizeSnapshot(snapshotV10Schema.parse(migrated));", "migrated.simulation ??= initializeSimulation(migrated.galaxy.seed);\n  migrated.knowledge ??= migrateLegacyKnowledge(migrated.galaxy);\n  migrated.schemaVersion = CURRENT_SCHEMA_VERSION;\n  const normalized = normalizeSnapshot(snapshotV11Schema.parse(migrated));", 'v11 normalize');
  text = replace(text,
    "    legacy: {\n      ...snapshot.legacy,",
    "    simulation: { ...snapshot.simulation, events: snapshot.simulation.events.slice(0, 1200), queue: snapshot.simulation.queue.slice(0, 2000) },\n    knowledge: snapshot.knowledge.slice(0, 12000),\n    legacy: {\n      ...snapshot.legacy,",
    'normalize simulation');
  write(file, text);
}

// store.ts
{
  const file = 'src/game/store.ts';
  let text = read(file);
  text = replace(text, "  WorldThread\n} from './types';", "  WorldThread,\n  SimulationState,\n  KnowledgeRecord\n} from './types';", 'store simulation types');
  text = insertAfter(text,
    "import { generateHubScene, generateScanScene, generateTravelScene, initializeNarrative, processDueConsequences } from '../narrative/encounters';",
    "\nimport { advanceSimulation, initializeSimulation, migrateLegacyKnowledge, revealKnowledge } from '../simulation';",
    'store simulation import');
  text = replace(text,
    "  gameYear: number;\n  discoveries: Discovery[];",
    "  gameYear: number;\n  simulation: SimulationState;\n  knowledge: KnowledgeRecord[];\n  discoveries: Discovery[];",
    'store fields');
  text = replace(text,
    "  setGenerationActive(active: boolean): void;\n  advanceTutorial(expectedStep?: number): Promise<void>;",
    "  setGenerationActive(active: boolean): void;\n  advanceWorld(hours: number, reason: string): Promise<void>;\n  advanceTutorial(expectedStep?: number): Promise<void>;",
    'store advanceWorld interface');
  text = replace(text,
    "  setGenerationActive: (generationActive) => set({ generationActive }),\n  async advanceTutorial(expectedStep) {",
    "  setGenerationActive: (generationActive) => set({ generationActive }),\n  async advanceWorld(hours, reason) {\n    const galaxy = get().galaxy;\n    if (!galaxy || hours <= 0) return;\n    const result = advanceSimulation({ galaxy, factions: get().factions, hubs: get().hubs, warFronts: get().warFronts, contracts: get().contracts, news: get().news, simulation: get().simulation }, hours);\n    const eventLogs = result.generatedEvents.map((event) => makeLog(event.year, event.title, event.summary, event.severity >= 70 ? 'danger' as const : event.severity >= 40 ? 'warning' as const : 'info' as const));\n    set({ simulation: result.simulation, gameYear: result.simulation.time.year, factions: result.factions, hubs: result.hubs, warFronts: result.warFronts, contracts: result.contracts, news: result.news, logs: [...eventLogs, ...get().logs].slice(0, 750) });\n    await persist(set, get, `world-time-${reason}`);\n  },\n  async advanceTutorial(expectedStep) {",
    'store advanceWorld implementation');
  text = replace(text,
    "  gameYear: 0,\n  discoveries: [],",
    "  gameYear: 0,\n  simulation: initializeSimulation('VOID'),\n  knowledge: [],\n  discoveries: [],",
    'store initial simulation');
  text = replace(text,
    "          gameYear: safe.gameYear,\n          discoveries: safe.discoveries,",
    "          gameYear: safe.simulation.time.year,\n          simulation: safe.simulation,\n          knowledge: safe.knowledge,\n          discoveries: safe.discoveries,",
    'hydrate simulation');
  text = replace(text,
    "      const captain = initialCaptain();\n      const ship = initialShip();\n      set({",
    "      const captain = initialCaptain();\n      const ship = initialShip();\n      const simulation = initializeSimulation(enrichedGalaxy.seed);\n      const knowledge = migrateLegacyKnowledge(enrichedGalaxy);\n      set({",
    'start simulation creation');
  text = replace(text,
    "        gameYear: 0,\n        discoveries: [],",
    "        gameYear: simulation.time.year,\n        simulation,\n        knowledge,\n        discoveries: [],",
    'start simulation state');
  text = replace(text,
    "selectedSystemId: null, gameYear: 0, discoveries: [], logs: [],",
    "selectedSystemId: null, gameYear: 0, simulation: initializeSimulation('VOID'), knowledge: [], discoveries: [], logs: [],",
    'clear simulation');
  text = replace(text,
    "      const updatedShip = { ...ship, systems: normalizeShipSystems(ship.systems), fuel: ship.fuel - fuelCost };\n      const nextYear = gameYear + Math.max(1, Math.round(jumpDistance / 50));\n      const logs = [makeLog(nextYear, 'Прыжок завершён', `${current.name} → ${target.name}. Потрачено ${fuelCost} топлива.`, 'info'), ...get().logs];\n      const warFronts = advanceWarFronts(updatedGalaxy.seed, get().warFronts, nextYear);",
    "      const updatedShip = { ...ship, systems: normalizeShipSystems(ship.systems), fuel: ship.fuel - fuelCost };\n      const travelHours = Math.max(8, Math.round(jumpDistance * 1.8));\n      const simulationResult = advanceSimulation({ galaxy: updatedGalaxy, factions: get().factions, hubs: get().hubs, warFronts: get().warFronts, contracts: get().contracts, news: get().news, simulation: get().simulation }, travelHours);\n      const nextYear = simulationResult.simulation.time.year;\n      const logs = [makeLog(nextYear, 'Прыжок завершён', `${current.name} → ${target.name}. Потрачено ${fuelCost} топлива. Мир прожил ещё ${travelHours} ч.`, 'info'), ...get().logs];\n      const warFronts = simulationResult.warFronts;",
    'travel simulation advance');
  text = replace(text,
    "      const contracts = get().contracts.map((contract) => contract.status === 'active' && nextYear > contract.deadlineYear ? { ...contract, status: 'expired' as const } : contract);\n      const newsItem = generateNews(updatedGalaxy.seed, updatedGalaxy.systems, get().hubs, nextYear, get().news.length);\n      const nextNews = [newsItem, ...get().news].slice(0, 500);",
    "      const contracts = simulationResult.contracts.map((contract) => contract.status === 'active' && nextYear > contract.deadlineYear ? { ...contract, status: 'expired' as const } : contract);\n      const newsItem = generateNews(updatedGalaxy.seed, updatedGalaxy.systems, simulationResult.hubs, nextYear, simulationResult.news.length);\n      const nextNews = [newsItem, ...simulationResult.news].slice(0, 500);",
    'travel projections');
  text = replace(text,
    "      set({ galaxy: updatedGalaxy, ship: updatedShip, currentSystemId: target.id, selectedSystemId: target.id, currentHubId: null, gameYear: nextYear, logs, contracts, news: nextNews, worldThreads, storyScenes, activeStorySceneId: generatedScene?.id ?? null, pendingConsequences: processedConsequences.consequences, objectives, activeShipEncounter, pursuits, warFronts });",
    "      const knowledge = revealKnowledge(get().knowledge, { entityId: target.id, entityType: 'system', fields: ['position', 'star', 'routes'], confidence: 82, atHour: simulationResult.simulation.time.absoluteHour, source: 'direct' });\n      set({ galaxy: updatedGalaxy, ship: updatedShip, currentSystemId: target.id, selectedSystemId: target.id, currentHubId: null, gameYear: nextYear, simulation: simulationResult.simulation, knowledge, factions: simulationResult.factions, hubs: simulationResult.hubs, logs, contracts, news: nextNews, worldThreads, storyScenes, activeStorySceneId: generatedScene?.id ?? null, pendingConsequences: processedConsequences.consequences, objectives, activeShipEncounter, pursuits, warFronts });",
    'travel set simulation');
  text = replace(text,
    "          gameYear: safe.gameYear,\n          discoveries: safe.discoveries,",
    "          gameYear: safe.simulation.time.year,\n          simulation: safe.simulation,\n          knowledge: safe.knowledge,\n          discoveries: safe.discoveries,",
    'restore simulation');
  text = replace(text,
    "      galaxy, captain, ship, currentSystemId, gameYear, discoveries, logs, saveMeta,",
    "      galaxy, captain, ship, currentSystemId, gameYear, simulation, knowledge, discoveries, logs, saveMeta,",
    'snapshot destructure');
  text = replace(text,
    "      gameYear,\n      discoveries,",
    "      gameYear: simulation.time.year,\n      simulation,\n      knowledge,\n      discoveries,",
    'snapshot fields');
  write(file, text);
}

// version and package
{
  const file = 'src/version.ts';
  let text = read(file);
  text = text.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.10.0';");
  text = text.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'SIMULATION KERNEL';");
  text = text.replace(/export const SAVE_SCHEMA_VERSION = \d+;/, 'export const SAVE_SCHEMA_VERSION = 11;');
  write(file, text);
}
{
  const file = 'package.json';
  const data = JSON.parse(read(file));
  data.version = '0.10.0';
  data.scripts['apply:v010'] = 'node scripts/apply-v010-simulation-kernel.mjs';
  write(file, JSON.stringify(data, null, 2) + '\n');
}

console.log('v0.10 Simulation Kernel applied.');
