import type { CivilizationContact } from '../game/types';
import type {
  KnowledgeRecord,
  KnowledgeSource,
  PlayerKnowledgeState,
  SimulationEntityType,
  WorldEvent
} from './types';

const HOURS_PER_YEAR = 365 * 24;

export type IntelligenceLevel = 'unknown' | 'rumor' | 'observed' | 'confirmed' | 'verified';

export interface EntityIntelligence {
  entityId: string;
  entityType: SimulationEntityType;
  level: IntelligenceLevel;
  confidence: number;
  source?: KnowledgeSource;
  knownFields: string[];
  staleYears: number;
}

const rank: Record<IntelligenceLevel, number> = {
  unknown: 0,
  rumor: 1,
  observed: 2,
  confirmed: 3,
  verified: 4
};

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

function levelForConfidence(confidence: number): IntelligenceLevel {
  if (confidence <= 0) return 'unknown';
  if (confidence < 45) return 'rumor';
  if (confidence < 70) return 'observed';
  if (confidence < 90) return 'confirmed';
  return 'verified';
}

function lowerLevel(level: IntelligenceLevel, steps: number): IntelligenceLevel {
  const entries: IntelligenceLevel[] = ['unknown', 'rumor', 'observed', 'confirmed', 'verified'];
  return entries[Math.max(0, rank[level] - Math.max(0, steps))] ?? 'unknown';
}

function recordIntelligence(
  record: KnowledgeRecord | undefined,
  entityType: SimulationEntityType,
  entityId: string,
  nowHour: number
): EntityIntelligence {
  if (!record || record.entityType !== entityType) {
    return { entityId, entityType, level: 'unknown', confidence: 0, knownFields: [], staleYears: 0 };
  }
  const staleYears = Math.max(0, Math.floor((nowHour - record.lastConfirmedAtHour) / HOURS_PER_YEAR));
  const decay = record.source === 'archive' ? 0 : staleYears >= 50 ? 2 : staleYears >= 15 ? 1 : 0;
  const confidence = clamp(record.confidence - decay * 18);
  return {
    entityId,
    entityType,
    level: levelForConfidence(confidence),
    confidence,
    source: record.source,
    knownFields: unique(record.knownFields),
    staleYears
  };
}

export function intelligenceFor(
  knowledge: PlayerKnowledgeState,
  entityType: SimulationEntityType,
  entityId: string,
  nowHour: number
): EntityIntelligence {
  return recordIntelligence(knowledge.records[entityId], entityType, entityId, nowHour);
}

export function combineIntelligence(...entries: EntityIntelligence[]): EntityIntelligence {
  const valid = entries.filter(Boolean);
  const strongest = [...valid].sort((a, b) => rank[b.level] - rank[a.level] || b.confidence - a.confidence)[0];
  if (!strongest) {
    return { entityId: '', entityType: 'system', level: 'unknown', confidence: 0, knownFields: [], staleYears: 0 };
  }
  return {
    ...strongest,
    confidence: Math.max(...valid.map((entry) => entry.confidence)),
    knownFields: unique(valid.flatMap((entry) => entry.knownFields)),
    staleYears: Math.min(...valid.map((entry) => entry.staleYears))
  };
}

function contactProfile(contact: CivilizationContact | undefined, civilizationId: string): EntityIntelligence {
  if (!contact || contact.stage === 'unknown') {
    return { entityId: civilizationId, entityType: 'civilization', level: 'unknown', confidence: 0, knownFields: [], staleYears: 0 };
  }
  const profiles: Record<CivilizationContact['stage'], { confidence: number; fields: string[]; source: KnowledgeSource }> = {
    unknown: { confidence: 0, fields: [], source: 'rumor' },
    observed: { confidence: 34, fields: ['presence'], source: 'scan' },
    signals: { confidence: 48, fields: ['presence', 'signals'], source: 'scan' },
    translated: { confidence: 72, fields: ['presence', 'signals', 'identity', 'language', 'culture'], source: 'contact' },
    contacted: { confidence: 84, fields: ['presence', 'signals', 'identity', 'language', 'culture', 'politics', 'territory', 'economy'], source: 'contact' },
    trusted: { confidence: 96, fields: ['presence', 'signals', 'identity', 'language', 'culture', 'politics', 'territory', 'economy', 'population', 'military', 'society', 'history', 'figures', 'institutions'], source: 'contact' },
    failed: { confidence: 58, fields: ['presence', 'signals', 'identity'], source: 'contact' }
  };
  const profile = profiles[contact.stage];
  return {
    entityId: civilizationId,
    entityType: 'civilization',
    level: levelForConfidence(profile.confidence),
    confidence: profile.confidence,
    source: profile.source,
    knownFields: profile.fields,
    staleYears: 0
  };
}

export function civilizationIntelligence(
  knowledge: PlayerKnowledgeState,
  contact: CivilizationContact | undefined,
  civilizationId: string,
  nowHour: number,
  observedThroughKnownSystem: IntelligenceLevel = 'unknown'
): EntityIntelligence {
  const record = intelligenceFor(knowledge, 'civilization', civilizationId, nowHour);
  const contactIntel = contactProfile(contact, civilizationId);
  const systemFallback: EntityIntelligence = {
    entityId: civilizationId,
    entityType: 'civilization',
    level: observedThroughKnownSystem,
    confidence: observedThroughKnownSystem === 'observed' ? 55 : observedThroughKnownSystem === 'rumor' ? 30 : 0,
    source: observedThroughKnownSystem === 'unknown' ? undefined : 'scan',
    knownFields: observedThroughKnownSystem === 'observed' ? ['presence'] : [],
    staleYears: 0
  };
  return combineIntelligence(record, contactIntel, systemFallback);
}

export function intelligenceAtLeast(intelligence: EntityIntelligence, minimum: IntelligenceLevel): boolean {
  return rank[intelligence.level] >= rank[minimum];
}

export function intelligenceFieldKnown(intelligence: EntityIntelligence, field: string): boolean {
  return intelligence.level === 'verified' || intelligence.knownFields.includes(field);
}

export function intelligenceLabel(level: IntelligenceLevel): string {
  return {
    unknown: 'неизвестно',
    rumor: 'слух',
    observed: 'наблюдение',
    confirmed: 'подтверждено',
    verified: 'проверено'
  }[level];
}

export function intelligenceSourceLabel(source?: KnowledgeSource): string {
  if (!source) return 'источник отсутствует';
  return {
    direct: 'личное наблюдение',
    scan: 'сканирование',
    contact: 'контакт',
    news: 'новостной канал',
    archive: 'архив',
    rumor: 'непроверенный источник'
  }[source];
}

function magnitude(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return 'миллиарды';
  if (absolute >= 1_000_000) return 'миллионы';
  if (absolute >= 100_000) return 'сотни тысяч';
  if (absolute >= 10_000) return 'десятки тысяч';
  if (absolute >= 1_000) return 'тысячи';
  if (absolute >= 100) return 'сотни';
  if (absolute >= 10) return 'десятки';
  return 'единицы';
}

function roundedEstimate(value: number): number {
  const absolute = Math.abs(value);
  const step = absolute >= 1_000_000 ? 100_000 : absolute >= 100_000 ? 10_000 : absolute >= 10_000 ? 1_000 : absolute >= 1_000 ? 100 : absolute >= 100 ? 10 : 1;
  return Math.round(value / step) * step;
}

export function intelligenceNumber(
  value: number,
  intelligence: EntityIntelligence,
  field: string,
  formatter: (value: number) => string = (entry) => entry.toLocaleString('ru-RU')
): string {
  if (!intelligenceFieldKnown(intelligence, field) && !intelligenceAtLeast(intelligence, 'verified')) return 'нет данных';
  if (intelligence.level === 'unknown') return 'нет данных';
  if (intelligence.level === 'rumor') return magnitude(value);
  if (intelligence.level === 'observed') return `около ${formatter(roundedEstimate(value))}`;
  if (intelligence.level === 'confirmed') return `≈${formatter(roundedEstimate(value))}`;
  return formatter(value);
}

export function intelligenceMetric(value: number, intelligence: EntityIntelligence, field: string): string {
  if (!intelligenceFieldKnown(intelligence, field) && !intelligenceAtLeast(intelligence, 'verified')) return 'нет данных';
  const safe = clamp(value);
  if (intelligence.level === 'rumor') return safe < 34 ? 'низкое' : safe < 67 ? 'среднее' : 'высокое';
  if (intelligence.level === 'observed') return safe < 25 ? 'низкое' : safe < 50 ? 'умеренное' : safe < 75 ? 'повышенное' : 'высокое';
  if (intelligence.level === 'confirmed') return `≈${Math.round(safe / 5) * 5}`;
  if (intelligence.level === 'verified') return `${Math.round(safe)}`;
  return 'нет данных';
}

export function intelligenceName(name: string, intelligence: EntityIntelligence, fallback: string): string {
  return intelligenceFieldKnown(intelligence, 'identity') || intelligenceAtLeast(intelligence, 'confirmed') ? name : fallback;
}

export function redactExactFigures(text: string): string {
  return text.replace(/\b\d[\d\s.,]*\b/g, 'неуточнённое значение');
}

function eventRelatedIntelligence(
  event: WorldEvent,
  knowledge: PlayerKnowledgeState,
  contacts: CivilizationContact[],
  nowHour: number
): EntityIntelligence {
  const contactByCivilization = new Map(contacts.map((contact) => [contact.civilizationId, contact]));
  const entries: EntityIntelligence[] = [];
  for (const systemId of event.systemIds) entries.push(intelligenceFor(knowledge, 'system', systemId, nowHour));
  for (const civilizationId of event.civilizationIds) entries.push(civilizationIntelligence(knowledge, contactByCivilization.get(civilizationId), civilizationId, nowHour));
  for (const factionId of event.factionIds) entries.push(intelligenceFor(knowledge, 'faction', factionId, nowHour));
  return combineIntelligence(...entries);
}

export function eventIntelligence(
  event: WorldEvent,
  knowledge: PlayerKnowledgeState,
  contacts: CivilizationContact[],
  nowHour: number
): EntityIntelligence {
  if (event.tags.includes('player-world-consequence') || event.tags.includes('player-action')) {
    return {
      entityId: event.id,
      entityType: 'system',
      level: 'verified',
      confidence: 100,
      source: 'direct',
      knownFields: ['identity', 'details', 'causes', 'results', 'entities'],
      staleYears: 0
    };
  }
  const related = eventRelatedIntelligence(event, knowledge, contacts, nowHour);
  if (related.level === 'unknown') return { ...related, entityId: event.id };
  const hasEventAccess = related.knownFields.some((field) => ['events', 'history', 'news', 'visited'].includes(field));
  let level: IntelligenceLevel = related.level;
  if (!hasEventAccess) {
    level = event.visibility === 'public'
      ? (level === 'rumor' ? 'rumor' : lowerLevel(level, 1))
      : event.visibility === 'local'
        ? lowerLevel(level, 2)
        : 'unknown';
  }
  if (event.visibility === 'local' && rank[level] < rank.observed) level = 'unknown';
  if (event.visibility === 'hidden' && rank[level] < rank.verified) level = 'unknown';
  return {
    ...related,
    entityId: event.id,
    level,
    confidence: level === 'unknown' ? 0 : related.confidence,
    knownFields: level === 'verified' ? unique([...related.knownFields, 'details', 'causes', 'results', 'entities']) : related.knownFields
  };
}

export function publicRumor(entityType: SimulationEntityType, entityId: string, confidence = 30): EntityIntelligence {
  return {
    entityId,
    entityType,
    level: levelForConfidence(confidence),
    confidence: clamp(confidence),
    source: 'rumor',
    knownFields: [],
    staleYears: 0
  };
}
