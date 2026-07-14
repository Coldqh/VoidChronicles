import type { Galaxy, ScanLevel } from '../game/types';
import type {
  KnowledgeRecord,
  KnowledgeSource,
  PlayerKnowledgeState,
  SimulationEntityType
} from './types';

const mergeFields = (a: string[], b: string[]): string[] => Array.from(new Set([...a, ...b]));

export function emptyKnowledge(): PlayerKnowledgeState {
  return { version: 1, records: {} };
}

export function revealKnowledge(
  state: PlayerKnowledgeState,
  entityType: SimulationEntityType,
  entityId: string,
  fields: string[],
  atHour: number,
  source: KnowledgeSource,
  confidence: number
): PlayerKnowledgeState {
  const safeHour = Number.isFinite(atHour) ? Math.max(0, Math.floor(atHour)) : 0;
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0;
  const existing = state.records[entityId];
  const next: KnowledgeRecord = existing ? {
    ...existing,
    entityType,
    confidence: Math.max(existing.confidence, safeConfidence),
    lastConfirmedAtHour: safeHour,
    source,
    knownFields: mergeFields(existing.knownFields, fields)
  } : {
    entityId,
    entityType,
    confidence: safeConfidence,
    discoveredAtHour: safeHour,
    lastConfirmedAtHour: safeHour,
    source,
    knownFields: Array.from(new Set(fields))
  };

  return {
    version: 1,
    records: { ...state.records, [entityId]: next }
  };
}

export function knowsEntity(
  state: PlayerKnowledgeState,
  entityType: SimulationEntityType,
  entityId: string,
  field?: string
): boolean {
  const record = state.records[entityId];
  return Boolean(record && record.entityType === entityType && (!field || record.knownFields.includes(field)));
}

export function createKnowledgeFromLegacy(galaxy: Galaxy, atHour = 0): PlayerKnowledgeState {
  let state = emptyKnowledge();
  for (const system of galaxy.systems) {
    if (system.known || system.visited || system.scanned) {
      const fields = system.scanned
        ? ['identity', 'coordinates', 'star', 'planets', 'routes', 'danger', 'civilizations', 'fullScan']
        : system.visited
          ? ['identity', 'coordinates', 'star', 'routes', 'visited']
          : ['identity', 'coordinates'];
      state = revealKnowledge(
        state,
        'system',
        system.id,
        fields,
        atHour,
        system.visited ? 'direct' : 'archive',
        system.scanned ? 95 : system.visited ? 82 : 55
      );
    }

    for (const planet of system.planets) {
      const level = (planet.scanLevel ?? (planet.scanned ? 1 : 0)) as ScanLevel;
      if (level <= 0) continue;
      const fields = level >= 2
        ? ['identity', 'orbit', 'type', 'danger', 'habitability', 'signals', 'life', 'civilization']
        : ['identity', 'orbit', 'type'];
      state = revealKnowledge(state, 'planet', planet.id, fields, atHour, 'scan', level >= 2 ? 90 : 68);
    }
  }
  return state;
}

export function projectKnowledgeToGalaxy(galaxy: Galaxy, knowledge: PlayerKnowledgeState): Galaxy {
  const projected = structuredClone(galaxy);
  for (const system of projected.systems) {
    const systemRecord = knowledge.records[system.id];
    const systemFields = new Set(systemRecord?.knownFields ?? []);
    system.known = Boolean(systemRecord && (systemFields.has('identity') || systemFields.has('coordinates')));
    system.visited = Boolean(systemRecord && systemFields.has('visited'));
    system.scanned = Boolean(systemRecord && (systemFields.has('fullScan') || systemFields.has('planets')));

    for (const planet of system.planets) {
      const planetRecord = knowledge.records[planet.id];
      const planetFields = new Set(planetRecord?.knownFields ?? []);
      const basic = Boolean(planetRecord && (planetFields.has('identity') || planetFields.has('orbit') || planetFields.has('type')));
      const detailed = Boolean(planetRecord && (planetFields.has('signals') || planetFields.has('habitability') || planetFields.has('danger')));
      const existingLevel = planet.scanLevel ?? 0;
      planet.scanned = basic;
      planet.scanLevel = detailed ? (Math.max(2, existingLevel) as ScanLevel) : basic ? 1 : 0;
    }
  }
  return projected;
}

export const migrateLegacyKnowledge = createKnowledgeFromLegacy;
