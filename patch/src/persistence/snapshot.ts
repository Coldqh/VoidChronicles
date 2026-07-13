import { z } from 'zod';
import type { GameStateSnapshot, SaveMetadata } from '../game/types';

export const CURRENT_SCHEMA_VERSION = 2;
export const APP_VERSION = '0.1.1';

const finiteNumber = z.number().finite();
const dangerSchema = z.enum(['safe', 'caution', 'danger', 'extreme']);
const planetTypeSchema = z.enum(['rocky', 'ocean', 'desert', 'ice', 'gas', 'toxic', 'jungle', 'artificial', 'anomalous']);

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
  artifactId: z.string().optional()
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
  artifactId: z.string().optional()
});

const logSchema = z.object({
  id: z.string(),
  year: finiteNumber,
  title: z.string(),
  text: z.string(),
  tone: z.enum(['info', 'good', 'warning', 'danger'])
});

const payloadSchema = z.object({
  galaxy: galaxySchema,
  captain: captainSchema,
  ship: shipSchema,
  currentSystemId: z.string().min(1),
  gameYear: finiteNumber,
  discoveries: z.array(discoverySchema),
  logs: z.array(logSchema)
});

const saveMetadataSchema = z.object({
  savedAt: z.string().datetime(),
  appVersion: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  reason: z.string().min(1),
  checksum: z.string().regex(/^[0-9a-f]{8}$/)
});

const snapshotV1Schema = payloadSchema.extend({
  schemaVersion: z.literal(1)
});

const snapshotV2Schema = payloadSchema.extend({
  schemaVersion: z.literal(2),
  saveMeta: saveMetadataSchema
});

type SnapshotV2 = z.infer<typeof snapshotV2Schema>;

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function checksumInput(snapshot: SnapshotV2): string {
  return JSON.stringify({
    ...snapshot,
    saveMeta: { ...snapshot.saveMeta, checksum: '00000000' }
  });
}

export function computeSnapshotChecksum(snapshot: SnapshotV2): string {
  return hashText(checksumInput(snapshot));
}

function normalizeSnapshot(snapshot: SnapshotV2): SnapshotV2 {
  const systemIds = new Set(snapshot.galaxy.systems.map((system) => system.id));
  const fallbackSystemId = systemIds.has(snapshot.galaxy.startSystemId)
    ? snapshot.galaxy.startSystemId
    : snapshot.galaxy.systems[0]?.id;

  if (!fallbackSystemId) throw new Error('В сохранении отсутствуют звёздные системы');

  const normalized: SnapshotV2 = {
    ...snapshot,
    currentSystemId: systemIds.has(snapshot.currentSystemId) ? snapshot.currentSystemId : fallbackSystemId,
    discoveries: snapshot.discoveries.filter((entry) => systemIds.has(entry.systemId)).slice(0, 5_000),
    logs: snapshot.logs.slice(0, 500)
  };

  if (normalized.ship.hull < 0 || normalized.ship.hull > normalized.ship.maxHull) {
    normalized.ship.hull = Math.max(0, Math.min(normalized.ship.maxHull, normalized.ship.hull));
  }
  if (normalized.ship.fuel < 0 || normalized.ship.fuel > normalized.ship.maxFuel) {
    normalized.ship.fuel = Math.max(0, Math.min(normalized.ship.maxFuel, normalized.ship.fuel));
  }
  normalized.captain.health = Math.max(0, Math.min(normalized.captain.maxHealth, normalized.captain.health));

  return normalized;
}

export interface ParseSnapshotOptions {
  verifyChecksum?: boolean;
}

export function parseSnapshot(input: unknown, options: ParseSnapshotOptions = {}): GameStateSnapshot {
  const header = z.object({ schemaVersion: z.number().int() }).passthrough().parse(input);
  let migrated: SnapshotV2;

  if (header.schemaVersion === 1) {
    const legacy = snapshotV1Schema.parse(input);
    migrated = {
      ...legacy,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      saveMeta: {
        savedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        sequence: 0,
        reason: 'migration-v1',
        checksum: '00000000'
      }
    };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {
    migrated = snapshotV2Schema.parse(input);
    if (options.verifyChecksum !== false) {
      const expected = computeSnapshotChecksum(migrated);
      if (migrated.saveMeta.checksum !== expected) {
        throw new Error('Контрольная сумма сохранения не совпадает');
      }
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

export function prepareSnapshotForSave(
  input: GameStateSnapshot,
  reason: string,
  previous?: SaveMetadata
): GameStateSnapshot {
  const safe = parseSnapshot(input, { verifyChecksum: false }) as SnapshotV2;
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
