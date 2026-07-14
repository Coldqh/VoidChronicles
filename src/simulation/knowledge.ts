import type { Galaxy, KnowledgeRecord, KnowledgeSource, ScanLevel } from '../game/types';

const mergeFields = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));

export function revealKnowledge(
  records: KnowledgeRecord[],
  input: {
    entityId: string;
    entityType: KnowledgeRecord['entityType'];
    fields: string[];
    confidence: number;
    atHour: number;
    source: KnowledgeSource;
  }
): KnowledgeRecord[] {
  const existing = records.find((entry) => entry.entityId === input.entityId);
  const next: KnowledgeRecord = existing ? {
    ...existing,
    confidence: Math.max(existing.confidence, input.confidence),
    lastConfirmedAtHour: input.atHour,
    source: input.source,
    fieldsKnown: mergeFields(existing.fieldsKnown, input.fields)
  } : {
    entityId: input.entityId,
    entityType: input.entityType,
    confidence: input.confidence,
    discoveredAtHour: input.atHour,
    lastConfirmedAtHour: input.atHour,
    source: input.source,
    fieldsKnown: [...input.fields]
  };
  return [next, ...records.filter((entry) => entry.entityId !== input.entityId)];
}

export function migrateLegacyKnowledge(galaxy: Galaxy): KnowledgeRecord[] {
  let records: KnowledgeRecord[] = [];
  for (const system of galaxy.systems) {
    if (system.known || system.visited || system.scanned) {
      records = revealKnowledge(records, {
        entityId: system.id,
        entityType: 'system',
        fields: system.scanned ? ['position', 'star', 'planets', 'routes', 'danger'] : system.visited ? ['position', 'star', 'routes'] : ['position'],
        confidence: system.scanned ? 95 : system.visited ? 82 : 55,
        atHour: 0,
        source: system.visited ? 'direct' : 'archive'
      });
    }
    for (const planet of system.planets) {
      const level = (planet.scanLevel ?? (planet.scanned ? 1 : 0)) as ScanLevel;
      if (level > 0) {
        records = revealKnowledge(records, {
          entityId: planet.id,
          entityType: 'planet',
          fields: level >= 2 ? ['orbit', 'type', 'danger', 'habitability', 'signals'] : ['orbit', 'type'],
          confidence: level >= 2 ? 90 : 68,
          atHour: 0,
          source: 'scan'
        });
      }
    }
  }
  return records;
}

export function knows(records: KnowledgeRecord[], entityId: string, field?: string): boolean {
  const record = records.find((entry) => entry.entityId === entityId);
  return Boolean(record && (!field || record.fieldsKnown.includes(field)));
}
