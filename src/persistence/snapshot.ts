import { z } from 'zod';
import type { GameStateSnapshot, SaveMetadata } from '../game/types';
import { APP_VERSION, SAVE_SCHEMA_VERSION } from '../version';
import { initializeLivingGalaxy } from '../world/livingGalaxy';

export const CURRENT_SCHEMA_VERSION = SAVE_SCHEMA_VERSION;
export { APP_VERSION };

const finiteNumber = z.number().finite();
const dangerSchema = z.enum(['safe', 'caution', 'danger', 'extreme']);
const planetTypeSchema = z.enum(['rocky', 'ocean', 'desert', 'ice', 'gas', 'toxic', 'jungle', 'artificial', 'anomalous']);
const scanLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const planetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: planetTypeSchema,
  orbit: finiteNumber,
  moons: finiteNumber,
  habitability: finiteNumber,
  danger: dangerSchema,
  hasLife: z.boolean(),
  civilizationId: z.string().optional(),
  pointsOfInterest: finiteNumber,
  scanned: z.boolean(),
  scanLevel: scanLevelSchema.optional(),
  lastScanYear: finiteNumber.optional(),
  imageKey: z.string()
});

const systemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  coordinates: z.object({ x: finiteNumber, y: finiteNumber }),
  starClass: z.enum(['M', 'K', 'G', 'F', 'A', 'B', 'O', 'WHITE_DWARF', 'NEUTRON', 'BLACK_HOLE']),
  starCount: finiteNumber,
  planets: z.array(planetSchema),
  neighbors: z.array(z.string()),
  danger: dangerSchema,
  factionId: z.string().optional(),
  civilizationIds: z.array(z.string()),
  known: z.boolean(),
  visited: z.boolean(),
  scanned: z.boolean(),
  anomaly: z.boolean(),
  region: z.enum(['core', 'frontier', 'deep'])
});

const civilizationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  speciesName: z.string(),
  status: z.enum(['living', 'dead', 'hidden']),
  techLevel: finiteNumber,
  ideology: z.string(),
  homeSystemId: z.string(),
  controlledSystems: z.array(z.string()),
  foundedYear: finiteNumber,
  endedYear: finiteNumber.optional(),
  traits: z.array(z.string())
});

const figureSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  civilizationId: z.string(),
  role: z.string(),
  bornYear: finiteNumber,
  diedYear: finiteNumber.optional(),
  importance: finiteNumber,
  achievements: z.array(z.string())
});

const historySchema = z.object({
  id: z.string().min(1),
  year: finiteNumber,
  title: z.string(),
  summary: z.string(),
  civilizationIds: z.array(z.string()),
  systemIds: z.array(z.string()),
  figureIds: z.array(z.string()),
  consequences: z.array(z.string())
});

const artifactSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.string(),
  civilizationId: z.string(),
  createdYear: finiteNumber,
  creatorId: z.string().optional(),
  ownerHistory: z.array(z.string()),
  value: finiteNumber,
  danger: finiteNumber,
  truth: z.string(),
  publicDescription: z.string(),
  discovered: z.boolean()
});

const galaxySettingsSchema = z.object({
  seed: z.string().min(1),
  systemCount: z.number().int().min(1),
  historyYears: z.number().int().min(1),
  civilizationCount: z.number().int().min(0),
  lifeFrequency: finiteNumber,
  anomalyFrequency: finiteNumber,
  difficulty: z.enum(['explorer', 'standard', 'brutal'])
});

const galaxySchema = z.object({
  id: z.string().min(1),
  seed: z.string().min(1),
  createdAt: z.string(),
  currentYear: finiteNumber,
  settings: galaxySettingsSchema,
  systems: z.array(systemSchema).min(1),
  civilizations: z.array(civilizationSchema),
  figures: z.array(figureSchema),
  history: z.array(historySchema),
  artifacts: z.array(artifactSchema),
  startSystemId: z.string().min(1)
});

const injurySchema = z.object({
  id: z.string(),
  bodyPart: z.enum(['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']),
  type: z.enum(['bruise', 'bleeding', 'fracture', 'burn', 'organ', 'lostLimb']),
  severity: finiteNumber,
  permanent: z.boolean()
});

const captainSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  level: finiteNumber,
  xp: finiteNumber,
  health: finiteNumber,
  maxHealth: finiteNumber,
  credits: finiteNumber,
  reputation: finiteNumber,
  skills: z.object({
    research: finiteNumber,
    archaeology: finiteNumber,
    trade: finiteNumber,
    combat: finiteNumber,
    crime: finiteNumber
  }),
  injuries: z.array(injurySchema),
  alive: z.boolean()
});

const cargoSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  quantity: finiteNumber,
  value: finiteNumber,
  artifactId: z.string().optional(),
  commodityId: z.string().optional(),
  contractId: z.string().optional(),
  illegal: z.boolean().optional()
});

const moduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  slot: z.enum(['engine', 'scanner', 'cargo', 'weapon', 'utility']),
  rarity: finiteNumber,
  effect: z.string()
});

const shipSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  hull: finiteNumber,
  maxHull: finiteNumber,
  fuel: finiteNumber,
  maxFuel: finiteNumber,
  jumpRange: finiteNumber,
  cargoCapacity: finiteNumber,
  cargo: z.array(cargoSchema),
  modules: z.array(moduleSchema),
  statuses: z.array(z.string())
});

const discoverySchema = z.object({
  id: z.string(),
  kind: z.enum(['signal', 'ruin', 'biosphere', 'artifact', 'settlement', 'anomaly']),
  name: z.string(),
  systemId: z.string(),
  planetId: z.string().optional(),
  description: z.string(),
  confidence: finiteNumber,
  year: finiteNumber,
  tags: z.array(z.string()),
  artifactId: z.string().optional(),
  pointOfInterestId: z.string().optional()
});

const logSchema = z.object({
  id: z.string(),
  year: finiteNumber,
  title: z.string(),
  text: z.string(),
  tone: z.enum(['info', 'good', 'warning', 'danger'])
});

const pointTypeSchema = z.enum(['ruin', 'wreck', 'settlement', 'laboratory', 'cave', 'ancientFactory', 'graveyard', 'smugglerCamp', 'anomaly', 'biosphere', 'distress']);
const equipmentSchema = z.enum(['pistol', 'rifle', 'armor', 'medkit', 'scanner', 'cutter', 'translator', 'sampleContainer', 'explosives', 'oxygen']);
const evidenceKindSchema = z.enum(['record', 'body', 'weapon', 'architecture', 'sample', 'terminal', 'damage', 'signal']);

const scanReportSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  planetId: z.string().optional(),
  level: scanLevelSchema,
  confidence: finiteNumber,
  createdYear: finiteNumber,
  summary: z.string(),
  warnings: z.array(z.string()),
  detectedPointOfInterestIds: z.array(z.string())
});

const pointOfInterestSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  planetId: z.string(),
  name: z.string(),
  type: pointTypeSchema,
  status: z.enum(['detected', 'visited', 'blocked', 'resolved']),
  danger: dangerSchema,
  age: finiteNumber,
  civilizationId: z.string().optional(),
  origin: z.string(),
  publicSummary: z.string(),
  truth: z.string(),
  requiredEquipment: z.array(equipmentSchema),
  possibleRewards: z.array(z.string()),
  scanConfidence: finiteNumber,
  visits: finiteNumber,
  discoveredYear: finiteNumber,
  lastVisitedYear: finiteNumber.optional()
});

const evidenceSchema = z.object({
  id: z.string(),
  pointOfInterestId: z.string(),
  systemId: z.string(),
  planetId: z.string(),
  kind: evidenceKindSchema,
  title: z.string(),
  description: z.string(),
  reliability: finiteNumber,
  discoveredYear: finiteNumber,
  tags: z.array(z.string())
});

const hypothesisSchema = z.object({
  id: z.string(),
  pointOfInterestId: z.string(),
  title: z.string(),
  summary: z.string(),
  confidence: finiteNumber,
  status: z.enum(['tentative', 'supported', 'confirmed', 'disproved']),
  evidenceIds: z.array(z.string()),
  updatedYear: finiteNumber
});

const artifactKnowledgeSchema = z.object({
  artifactId: z.string(),
  level: finiteNumber,
  knownFields: z.array(z.string()),
  notes: z.array(z.string()),
  revealedTruth: z.string().optional()
});

const crewRoleSchema = z.enum(['pilot', 'engineer', 'doctor', 'scientist', 'archaeologist', 'soldier', 'diplomat', 'biologist', 'smuggler']);
const crewMemorySchema = z.object({
  id: z.string(),
  year: finiteNumber,
  kind: z.enum(['hired', 'expedition', 'injury', 'payment', 'betrayal', 'discovery']),
  text: z.string(),
  impact: finiteNumber
});
const crewMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string(),
  culture: z.string(),
  primaryRole: crewRoleSchema,
  secondaryRole: crewRoleSchema.optional(),
  level: finiteNumber,
  health: finiteNumber,
  maxHealth: finiteNumber,
  morale: finiteNumber,
  loyalty: finiteNumber,
  salary: finiteNumber,
  sharePercent: finiteNumber,
  contractYears: finiteNumber,
  joinedYear: finiteNumber,
  paidUntilYear: finiteNumber,
  traits: z.array(z.string()),
  belief: z.string(),
  status: z.enum(['active', 'injured', 'unpaid', 'missing']),
  injuries: z.array(injurySchema),
  memories: z.array(crewMemorySchema)
});
const crewCandidateSchema = crewMemberSchema.extend({
  signingCost: finiteNumber,
  originSystemId: z.string()
});


const factionMemorySchema = z.object({ id: z.string(), year: finiteNumber, action: z.string(), impact: finiteNumber, text: z.string() });
const factionSchema = z.object({
  id: z.string(), name: z.string(), kind: z.enum(['government','corporation','university','cartel','tradeHouse','religious','pirates']),
  civilizationId: z.string().optional(), disposition: z.enum(['friendly','neutral','wary','hostile']), reputation: finiteNumber,
  wealth: finiteNumber, military: finiteNumber, research: finiteNumber, laws: z.array(z.string()), allies: z.array(z.string()), enemies: z.array(z.string()), memories: z.array(factionMemorySchema)
});
const hubSchema = z.object({
  id: z.string(), systemId: z.string(), factionId: z.string(), civilizationId: z.string().optional(), name: z.string(),
  kind: z.enum(['station','colony','freeport','settlement']), population: finiteNumber, safety: dangerSchema,
  services: z.array(z.enum(['contracts','trade','repair','fuel','crew','news','blackMarket'])), description: z.string(),
  visited: z.boolean(), docked: z.boolean(), inspectionLevel: finiteNumber, marketSeed: z.string()
});
const contractSchema = z.object({
  id: z.string(), type: z.enum(['survey','recovery','delivery','bounty','smuggling','rescue']), status: z.enum(['available','active','completed','failed','expired']),
  issuerHubId: z.string(), issuerFactionId: z.string(), title: z.string(), description: z.string(), reward: finiteNumber, advance: finiteNumber,
  deadlineYear: finiteNumber, acceptedYear: finiteNumber.optional(), completedYear: finiteNumber.optional(), targetSystemId: z.string(),
  targetPointOfInterestId: z.string().optional(), progress: finiteNumber, requiredProgress: finiteNumber, illegal: z.boolean(), hiddenClause: z.string().optional(), cargoId: z.string().optional()
});
const newsSchema = z.object({
  id: z.string(), year: finiteNumber, sourceHubId: z.string().optional(), headline: z.string(), text: z.string(),
  category: z.enum(['security','discovery','trade','politics']), reliability: finiteNumber, systemIds: z.array(z.string())
});
const locationEnemySchema = z.object({ id: z.string(), health: finiteNumber, x: finiteNumber, y: finiteNumber });
const locationStateSchema = z.object({
  pointOfInterestId: z.string(), visitCount: finiteNumber, enemyStates: z.array(locationEnemySchema), resolvedObjectIds: z.array(z.string()),
  collectedEvidenceKeys: z.array(z.string()), revealedTileKeys: z.array(z.string()), artifactTaken: z.boolean(),
  lastOutcome: z.enum(['evacuated','resolved','failed']), lastVisitedYear: finiteNumber
});

const legacyPayloadSchema = z.object({
  galaxy: galaxySchema,
  captain: captainSchema,
  ship: shipSchema,
  currentSystemId: z.string().min(1),
  gameYear: finiteNumber,
  discoveries: z.array(discoverySchema),
  logs: z.array(logSchema)
});

const v3PayloadSchema = legacyPayloadSchema.extend({
  scanReports: z.array(scanReportSchema),
  pointsOfInterest: z.array(pointOfInterestSchema),
  evidence: z.array(evidenceSchema),
  hypotheses: z.array(hypothesisSchema),
  artifactKnowledge: z.array(artifactKnowledgeSchema)
});

const v4PayloadSchema = v3PayloadSchema.extend({
  crew: z.array(crewMemberSchema),
  crewCandidates: z.array(crewCandidateSchema)
});
const v5PayloadSchema = v4PayloadSchema.extend({
  factions: z.array(factionSchema),
  hubs: z.array(hubSchema),
  contracts: z.array(contractSchema),
  news: z.array(newsSchema),
  locationStates: z.array(locationStateSchema),
  currentHubId: z.string().nullable()
});

const saveMetadataSchema = z.object({
  savedAt: z.string().datetime(),
  appVersion: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  reason: z.string().min(1),
  checksum: z.string().regex(/^[0-9a-f]{8}$/)
});

const snapshotV1Schema = legacyPayloadSchema.extend({ schemaVersion: z.literal(1) });
const snapshotV2Schema = legacyPayloadSchema.extend({ schemaVersion: z.literal(2), saveMeta: saveMetadataSchema });
const snapshotV3Schema = v3PayloadSchema.extend({ schemaVersion: z.literal(3), saveMeta: saveMetadataSchema });
const snapshotV4Schema = v4PayloadSchema.extend({ schemaVersion: z.literal(4), saveMeta: saveMetadataSchema });
const snapshotV5Schema = v5PayloadSchema.extend({ schemaVersion: z.literal(5), saveMeta: saveMetadataSchema });

type SnapshotCurrent = z.infer<typeof snapshotV5Schema>;

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function checksumInput(snapshot: SnapshotCurrent): string {
  return JSON.stringify({ ...snapshot, saveMeta: { ...snapshot.saveMeta, checksum: '00000000' } });
}

export function computeSnapshotChecksum(snapshot: SnapshotCurrent): string {
  return hashText(checksumInput(snapshot));
}

function emptyExploration() {
  return { scanReports: [], pointsOfInterest: [], evidence: [], hypotheses: [], artifactKnowledge: [] };
}
function emptyCrew() { return { crew: [], crewCandidates: [] }; }
function livingState(galaxy: z.infer<typeof galaxySchema>) {
  const living = initializeLivingGalaxy(galaxy);
  return { ...living, locationStates: [], currentHubId: null };
}

function normalizeSnapshot(snapshot: SnapshotCurrent): SnapshotCurrent {
  const systemIds = new Set(snapshot.galaxy.systems.map((system) => system.id));
  const planetIds = new Set(snapshot.galaxy.systems.flatMap((system) => system.planets.map((planet) => planet.id)));
  const fallbackSystemId = systemIds.has(snapshot.galaxy.startSystemId) ? snapshot.galaxy.startSystemId : snapshot.galaxy.systems[0]?.id;
  if (!fallbackSystemId) throw new Error('В сохранении отсутствуют звёздные системы');

  snapshot.galaxy.systems.forEach((system) => system.planets.forEach((planet) => {
    planet.scanLevel = planet.scanLevel ?? (planet.scanned ? 1 : 0);
  }));

  const pointIds = new Set(snapshot.pointsOfInterest.map((point) => point.id));
  const evidenceIds = new Set(snapshot.evidence.map((entry) => entry.id));
  const crewIds = new Set<string>();
  const crew = snapshot.crew.filter((entry) => {
    if (crewIds.has(entry.id)) return false;
    crewIds.add(entry.id);
    return true;
  }).slice(0, 20).map((entry) => ({
    ...entry,
    health: Math.max(0, Math.min(entry.maxHealth, entry.health)),
    morale: Math.max(0, Math.min(100, entry.morale)),
    loyalty: Math.max(0, Math.min(100, entry.loyalty)),
    memories: entry.memories.slice(-20)
  }));

  const normalized: SnapshotCurrent = {
    ...snapshot,
    currentSystemId: systemIds.has(snapshot.currentSystemId) ? snapshot.currentSystemId : fallbackSystemId,
    discoveries: snapshot.discoveries.filter((entry) => systemIds.has(entry.systemId)).slice(0, 7_500),
    logs: snapshot.logs.slice(0, 750),
    scanReports: snapshot.scanReports.filter((entry) => systemIds.has(entry.systemId) && (!entry.planetId || planetIds.has(entry.planetId))).slice(0, 3_000),
    pointsOfInterest: snapshot.pointsOfInterest.filter((entry) => systemIds.has(entry.systemId) && planetIds.has(entry.planetId)).slice(0, 5_000),
    evidence: snapshot.evidence.filter((entry) => pointIds.has(entry.pointOfInterestId)).slice(0, 10_000),
    hypotheses: snapshot.hypotheses.filter((entry) => pointIds.has(entry.pointOfInterestId)).map((entry) => ({ ...entry, evidenceIds: entry.evidenceIds.filter((id) => evidenceIds.has(id)) })).slice(0, 5_000),
    artifactKnowledge: snapshot.artifactKnowledge.filter((entry) => snapshot.galaxy.artifacts.some((artifact) => artifact.id === entry.artifactId)).slice(0, 2_000),
    crew,
    crewCandidates: snapshot.crewCandidates.filter((entry) => systemIds.has(entry.originSystemId) && !crewIds.has(entry.id)).slice(0, 12),
    factions: snapshot.factions.slice(0, 100),
    hubs: snapshot.hubs.filter((hub) => systemIds.has(hub.systemId)).slice(0, 250),
    contracts: snapshot.contracts.filter((contract) => systemIds.has(contract.targetSystemId)).slice(0, 500),
    news: snapshot.news.filter((entry) => entry.systemIds.every((id) => systemIds.has(id))).slice(0, 500),
    locationStates: snapshot.locationStates.filter((entry) => pointIds.has(entry.pointOfInterestId)).slice(0, 5_000),
    currentHubId: snapshot.currentHubId && snapshot.hubs.some((hub) => hub.id === snapshot.currentHubId) ? snapshot.currentHubId : null
  };

  normalized.ship.hull = Math.max(0, Math.min(normalized.ship.maxHull, normalized.ship.hull));
  normalized.ship.fuel = Math.max(0, Math.min(normalized.ship.maxFuel, normalized.ship.fuel));
  normalized.captain.health = Math.max(0, Math.min(normalized.captain.maxHealth, normalized.captain.health));
  return normalized;
}

export interface ParseSnapshotOptions { verifyChecksum?: boolean; }

export function parseSnapshot(input: unknown, options: ParseSnapshotOptions = {}): GameStateSnapshot {
  const header = z.object({ schemaVersion: z.number().int() }).passthrough().parse(input);
  let migrated: SnapshotCurrent;

  if (header.schemaVersion === 1) {
    const legacy = snapshotV1Schema.parse(input);
    migrated = { ...legacy, ...emptyExploration(), ...emptyCrew(), ...livingState(legacy.galaxy), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { savedAt: new Date().toISOString(), appVersion: APP_VERSION, sequence: 0, reason: 'migration-v1', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 2) {
    const legacy = snapshotV2Schema.parse(input);
    migrated = { ...legacy, ...emptyExploration(), ...emptyCrew(), ...livingState(legacy.galaxy), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...legacy.saveMeta, appVersion: APP_VERSION, reason: 'migration-v2', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 3) {
    const previous = snapshotV3Schema.parse(input);
    migrated = { ...previous, ...emptyCrew(), ...livingState(previous.galaxy), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v3', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 4) {
    const previous = snapshotV4Schema.parse(input);
    migrated = { ...previous, ...livingState(previous.galaxy), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v4', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {
    migrated = snapshotV5Schema.parse(input);
    if (options.verifyChecksum !== false) {
      const expected = computeSnapshotChecksum(migrated);
      if (migrated.saveMeta.checksum !== expected) throw new Error('Контрольная сумма сохранения не совпадает');
    }
  } else if (header.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Сохранение создано более новой версией игры: v${header.schemaVersion}`);
  } else {
    throw new Error(`Неподдерживаемая версия сохранения: v${header.schemaVersion}`);
  }

  const normalized = normalizeSnapshot(migrated);
  normalized.saveMeta.checksum = computeSnapshotChecksum(normalized);
  return normalized as GameStateSnapshot;
}

export function prepareSnapshotForSave(input: GameStateSnapshot, reason: string, previous?: SaveMetadata): GameStateSnapshot {
  const safe = parseSnapshot(input, { verifyChecksum: false }) as SnapshotCurrent;
  safe.schemaVersion = CURRENT_SCHEMA_VERSION;
  safe.saveMeta = {
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    sequence: (previous?.sequence ?? safe.saveMeta.sequence ?? 0) + 1,
    reason,
    checksum: '00000000'
  };
  safe.saveMeta.checksum = computeSnapshotChecksum(safe);
  return safe as GameStateSnapshot;
}

export function getSnapshotVersion(input: unknown): number | null {
  const result = z.object({ schemaVersion: z.number().int() }).passthrough().safeParse(input);
  return result.success ? result.data.schemaVersion : null;
}

export function snapshotErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return `Сохранение повреждено или устарело: ${first?.path.join('.') || 'неизвестное поле'} — ${first?.message || 'ошибка данных'}`;
  }
  return error instanceof Error ? error.message : 'Не удалось прочитать сохранение';
}
