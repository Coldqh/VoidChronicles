import type { CivilizationContact } from '../game/types';
import type { SimulationContext } from './context';
import { causalLinksForEvent } from './causality';
import type { PlayerKnowledgeState, SimulationState, WorldEvent } from './types';
import {
  civilizationIntelligence,
  combineIntelligence,
  eventIntelligence,
  intelligenceAtLeast,
  intelligenceFor,
  intelligenceLabel,
  intelligenceSourceLabel,
  publicRumor,
  redactExactFigures,
  type EntityIntelligence,
  type IntelligenceLevel
} from './intelligence';

const HOURS_PER_YEAR = 365 * 24;

export type ChronicleDomain =
  | 'politics'
  | 'war'
  | 'economy'
  | 'society'
  | 'culture'
  | 'science'
  | 'ecology'
  | 'heritage'
  | 'demography'
  | 'player'
  | 'other';

export interface ChronicleRecord {
  id: string;
  atHour: number;
  year: number;
  domain: ChronicleDomain;
  title: string;
  summary: string;
  severity: number;
  visibility: WorldEvent['visibility'] | 'historical';
  systemIds: string[];
  civilizationIds: string[];
  factionIds: string[];
  figureIds: string[];
  causedByEventIds: string[];
  resultedInEventIds: string[];
  createdEntityIds: string[];
  changedEntityIds: string[];
  destroyedEntityIds: string[];
  playerInvolved: boolean;
  tags: string[];
  source: 'deep-history' | 'live-simulation';
}

export interface ChronicleQuery {
  domains?: ChronicleDomain[];
  systemIds?: string[];
  civilizationIds?: string[];
  factionIds?: string[];
  entityId?: string;
  fromYear?: number;
  toYear?: number;
  includeHidden?: boolean;
  playerOnly?: boolean;
  limit?: number;
}

export interface ChronicleComparison {
  fromYear: number;
  toYear: number;
  events: number;
  severeEvents: number;
  wars: number;
  crises: number;
  discoveries: number;
  playerInterventions: number;
  recordedPopulationDelta: number;
  recordedCasualties: number;
  createdEntities: number;
  destroyedEntities: number;
  changedSystemIds: string[];
  changedCivilizationIds: string[];
  headline: string;
}

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

function eventYear(state: SimulationState, atHour: number): number {
  return state.clock.epochYear + Math.floor(atHour / HOURS_PER_YEAR);
}

function domainFor(kind: WorldEvent['kind'], tags: string[]): ChronicleDomain {
  if (tags.includes('player-world-consequence') || tags.includes('player-action')) return 'player';
  if (tags.some((tag) => tag.includes('heritage') || tag.includes('artifact') || tag.includes('archive') || tag.includes('ruin'))) return 'heritage';
  if (tags.some((tag) => tag.includes('war') || tag.includes('battle') || tag.includes('occupation')) || kind === 'conflict') return 'war';
  if (kind === 'economy' || kind === 'shortage') return 'economy';
  if (kind === 'demography' || kind === 'migration') return 'demography';
  if (kind === 'ecology' || tags.some((tag) => tag.includes('planetary') || tag.includes('ecosystem'))) return 'ecology';
  if (kind === 'research' || kind === 'discovery') return 'science';
  if (tags.some((tag) => tag.includes('culture') || tag.includes('religion') || tag.includes('language'))) return 'culture';
  if (tags.some((tag) => tag.includes('society') || tag.includes('class') || tag.includes('strike') || tag.includes('revolt'))) return 'society';
  if (kind === 'politics') return 'politics';
  if (kind === 'disaster') return 'society';
  return 'other';
}

function deepHistoryDomain(title: string, summary: string, consequences: string[]): ChronicleDomain {
  const text = `${title} ${summary} ${consequences.join(' ')}`.toLowerCase();
  if (/войн|сраж|вторжен|оккупац|арм/.test(text)) return 'war';
  if (/эколог|климат|биосфер|вымиран/.test(text)) return 'ecology';
  if (/изобрет|открыт|наук|технолог/.test(text)) return 'science';
  if (/религи|культур|язык|традиц/.test(text)) return 'culture';
  if (/государ|правител|революц|переворот|реформ/.test(text)) return 'politics';
  if (/голод|миграц|населен|эпидем/.test(text)) return 'demography';
  if (/торгов|эконом|промышлен|дефицит/.test(text)) return 'economy';
  if (/артефакт|архив|руин|наслед/.test(text)) return 'heritage';
  return 'other';
}

function liveRecord(state: SimulationState, event: WorldEvent): ChronicleRecord {
  const links = causalLinksForEvent(event);
  return {
    id: event.id,
    atHour: event.atHour,
    year: eventYear(state, event.atHour),
    domain: domainFor(event.kind, event.tags),
    title: event.title,
    summary: event.summary,
    severity: event.severity,
    visibility: event.visibility,
    systemIds: unique(event.systemIds),
    civilizationIds: unique(event.civilizationIds),
    factionIds: unique(event.factionIds),
    figureIds: typeof event.data?.figureId === 'string' ? [event.data.figureId] : [],
    causedByEventIds: links.causedByEventIds,
    resultedInEventIds: links.resultedInEventIds,
    createdEntityIds: links.createdEntityIds,
    changedEntityIds: links.changedEntityIds,
    destroyedEntityIds: links.destroyedEntityIds,
    playerInvolved: event.tags.includes('player-world-consequence') || event.tags.includes('player-action'),
    tags: [...event.tags],
    source: 'live-simulation'
  };
}

function historicalRecords(context: SimulationContext): ChronicleRecord[] {
  return context.galaxy.history.map((event) => {
    const consequences = Array.isArray(event.consequences) ? event.consequences : [];
    const year = Number.isFinite(event.year) ? event.year : context.galaxy.currentYear;
    return {
      id: `deep_${event.id}`,
      atHour: (year - context.galaxy.currentYear) * HOURS_PER_YEAR,
      year,
      domain: deepHistoryDomain(event.title, event.summary, consequences),
      title: event.title,
      summary: consequences.length ? `${event.summary} Последствия: ${consequences.join('; ')}.` : event.summary,
      severity: Math.min(10, Math.max(3, consequences.length + 3)),
      visibility: 'historical' as const,
      systemIds: unique(event.systemIds ?? []),
      civilizationIds: unique(event.civilizationIds ?? []),
      factionIds: [],
      figureIds: unique(event.figureIds ?? []),
      causedByEventIds: [],
      resultedInEventIds: [],
      createdEntityIds: [],
      changedEntityIds: [],
      destroyedEntityIds: [],
      playerInvolved: false,
      tags: ['deep-history'],
      source: 'deep-history' as const
    };
  });
}

function intersects(left: string[], right: Set<string>): boolean {
  return right.size === 0 || left.some((entry) => right.has(entry));
}

export function buildChronicle(
  state: SimulationState,
  context: SimulationContext,
  query: ChronicleQuery = {}
): ChronicleRecord[] {
  const domains = new Set(query.domains ?? []);
  const systemIds = new Set(query.systemIds ?? []);
  const civilizationIds = new Set(query.civilizationIds ?? []);
  const factionIds = new Set(query.factionIds ?? []);
  const records = [
    ...state.events
      .filter((event) => query.includeHidden || (event.visibility !== 'hidden' && !event.tags.includes('state-snapshot')))
      .map((event) => liveRecord(state, event)),
    ...historicalRecords(context)
  ];

  return records
    .filter((record) => domains.size === 0 || domains.has(record.domain))
    .filter((record) => intersects(record.systemIds, systemIds))
    .filter((record) => intersects(record.civilizationIds, civilizationIds))
    .filter((record) => intersects(record.factionIds, factionIds))
    .filter((record) => query.fromYear === undefined || record.year >= query.fromYear)
    .filter((record) => query.toYear === undefined || record.year <= query.toYear)
    .filter((record) => !query.playerOnly || record.playerInvolved)
    .filter((record) => {
      if (!query.entityId) return true;
      return [
        ...record.systemIds,
        ...record.civilizationIds,
        ...record.factionIds,
        ...record.figureIds,
        ...record.createdEntityIds,
        ...record.changedEntityIds,
        ...record.destroyedEntityIds
      ].includes(query.entityId);
    })
    .sort((a, b) => b.year - a.year || b.atHour - a.atHour || b.severity - a.severity)
    .slice(0, Math.max(1, query.limit ?? 1_000));
}

export function traceCausalChain(
  state: SimulationState,
  eventId: string,
  direction: 'causes' | 'results' | 'both' = 'both',
  maxDepth = 6
): WorldEvent[] {
  const byId = new Map(state.events.map((event) => [event.id, event]));
  const visited = new Set<string>();
  const result: WorldEvent[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: eventId, depth: 0 }];

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.id) || current.depth > maxDepth) continue;
    visited.add(current.id);
    const event = byId.get(current.id);
    if (!event) continue;
    result.push(event);
    const links = causalLinksForEvent(event);
    const next = direction === 'causes'
      ? links.causedByEventIds
      : direction === 'results'
        ? links.resultedInEventIds
        : [...links.causedByEventIds, ...links.resultedInEventIds];
    for (const id of next) queue.push({ id, depth: current.depth + 1 });
  }

  return result.sort((a, b) => a.atHour - b.atHour);
}

export function compareChroniclePeriods(
  state: SimulationState,
  context: SimulationContext,
  fromYear: number,
  toYear: number
): ChronicleComparison {
  const records = buildChronicle(state, context, { fromYear, toYear, limit: 10_000 });
  const eventById = new Map(state.events.map((event) => [event.id, event]));
  const recordedPopulationDelta = records.reduce((sum, record) => {
    const event = eventById.get(record.id);
    const value = event?.data?.populationDelta;
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
  const recordedCasualties = records.reduce((sum, record) => {
    const event = eventById.get(record.id);
    const values = [event?.data?.casualties, event?.data?.warCasualties, event?.data?.playerCasualtiesAvoided];
    return sum + values.reduce<number>((inner, value) => inner + (typeof value === 'number' ? value : 0), 0);
  }, 0);
  const changedSystemIds = unique(records.flatMap((record) => record.systemIds));
  const changedCivilizationIds = unique(records.flatMap((record) => record.civilizationIds));
  const severeEvents = records.filter((record) => record.severity >= 7).length;
  const playerInterventions = records.filter((record) => record.playerInvolved).length;
  const wars = records.filter((record) => record.domain === 'war').length;
  const crises = records.filter((record) => ['economy', 'society', 'ecology', 'demography'].includes(record.domain) && record.severity >= 6).length;
  const discoveries = records.filter((record) => record.domain === 'science' || record.domain === 'heritage').length;
  const createdEntities = unique(records.flatMap((record) => record.createdEntityIds)).length;
  const destroyedEntities = unique(records.flatMap((record) => record.destroyedEntityIds)).length;
  return {
    fromYear,
    toYear,
    events: records.length,
    severeEvents,
    wars,
    crises,
    discoveries,
    playerInterventions,
    recordedPopulationDelta,
    recordedCasualties,
    createdEntities,
    destroyedEntities,
    changedSystemIds,
    changedCivilizationIds,
    headline: records.length === 0
      ? 'За выбранный период подтверждённых изменений нет.'
      : `${records.length} событий: ${wars} военных, ${crises} кризисных, ${discoveries} исследовательских. Игрок вмешался ${playerInterventions} раз.`
  };
}

export function chronicleDomainLabel(domain: ChronicleDomain): string {
  return {
    politics: 'Политика',
    war: 'Война',
    economy: 'Экономика',
    society: 'Общество',
    culture: 'Культура',
    science: 'Наука',
    ecology: 'Экология',
    heritage: 'Наследие',
    demography: 'Население',
    player: 'Действие игрока',
    other: 'Другое'
  }[domain];
}


export interface ChronicleIntelligenceContext {
  knowledge: PlayerKnowledgeState;
  contacts: CivilizationContact[];
  currentHour: number;
  archiveCivilizationIds?: string[];
}

export interface KnownChronicleRecord extends ChronicleRecord {
  intelligenceLevel: IntelligenceLevel;
  confidence: number;
  intelligenceSource: string;
  staleYears: number;
  redacted: boolean;
  unknownCauseLinks: boolean;
  unknownResultLinks: boolean;
}

export interface KnownChronicleQuery extends ChronicleQuery {
  minimumIntelligence?: IntelligenceLevel;
}

function historicalIntelligence(
  record: ChronicleRecord,
  access: ChronicleIntelligenceContext
): EntityIntelligence {
  const contactByCivilization = new Map(access.contacts.map((contact) => [contact.civilizationId, contact]));
  const entries: EntityIntelligence[] = [];
  for (const systemId of record.systemIds) {
    entries.push(intelligenceFor(access.knowledge, 'system', systemId, access.currentHour));
  }
  for (const civilizationId of record.civilizationIds) {
    entries.push(civilizationIntelligence(access.knowledge, contactByCivilization.get(civilizationId), civilizationId, access.currentHour));
    if (access.archiveCivilizationIds?.includes(civilizationId)) {
      entries.push({
        entityId: civilizationId,
        entityType: 'civilization',
        level: 'confirmed',
        confidence: 88,
        source: 'archive',
        knownFields: ['identity', 'history', 'events'],
        staleYears: 0
      });
    }
  }
  const combined = entries.length ? combineIntelligence(...entries) : publicRumor('system', record.id, 0);
  if (combined.level === 'unknown') return combined;
  const hasHistoricalAccess = combined.source === 'archive' || combined.knownFields.includes('history') || combined.knownFields.includes('events');
  if (hasHistoricalAccess) return combined;
  return {
    ...combined,
    level: combined.level === 'verified' ? 'confirmed' : combined.level === 'confirmed' ? 'observed' : 'rumor',
    confidence: Math.min(combined.confidence, 62)
  };
}

function recordIntelligence(
  record: ChronicleRecord,
  state: SimulationState,
  access: ChronicleIntelligenceContext
): EntityIntelligence {
  if (record.source === 'deep-history') return historicalIntelligence(record, access);
  const event = state.events.find((entry) => entry.id === record.id);
  return event
    ? eventIntelligence(event, access.knowledge, access.contacts, access.currentHour)
    : publicRumor('system', record.id, 0);
}

function knownEntityIds(
  record: ChronicleRecord,
  access: ChronicleIntelligenceContext,
  minimum: IntelligenceLevel
): Pick<ChronicleRecord, 'systemIds' | 'civilizationIds' | 'factionIds'> {
  const contacts = new Map(access.contacts.map((contact) => [contact.civilizationId, contact]));
  return {
    systemIds: record.systemIds.filter((id) => intelligenceAtLeast(intelligenceFor(access.knowledge, 'system', id, access.currentHour), minimum)),
    civilizationIds: record.civilizationIds.filter((id) => intelligenceAtLeast(civilizationIntelligence(access.knowledge, contacts.get(id), id, access.currentHour), minimum)),
    factionIds: record.factionIds.filter((id) => intelligenceAtLeast(intelligenceFor(access.knowledge, 'faction', id, access.currentHour), minimum))
  };
}

function genericRecordTitle(record: ChronicleRecord): string {
  return record.source === 'deep-history'
    ? `Фрагмент прошлого: ${chronicleDomainLabel(record.domain)}`
    : `Непроверенные сведения: ${chronicleDomainLabel(record.domain)}`;
}

function projectKnownRecord(
  record: ChronicleRecord,
  intelligence: EntityIntelligence,
  access: ChronicleIntelligenceContext
): KnownChronicleRecord {
  const visibleEntities = knownEntityIds(record, access, intelligence.level === 'rumor' ? 'observed' : 'rumor');
  const rumor = intelligence.level === 'rumor';
  const observed = intelligence.level === 'observed';
  const verified = intelligence.level === 'verified';
  return {
    ...record,
    title: rumor ? genericRecordTitle(record) : record.title,
    summary: rumor
      ? 'Получен обрывочный сигнал. Место, участники и масштаб события не подтверждены.'
      : observed
        ? redactExactFigures(record.summary)
        : record.summary,
    severity: rumor ? Math.max(1, Math.min(5, record.severity - 2)) : observed ? Math.max(1, record.severity - 1) : record.severity,
    systemIds: visibleEntities.systemIds,
    civilizationIds: visibleEntities.civilizationIds,
    factionIds: visibleEntities.factionIds,
    figureIds: verified ? record.figureIds : [],
    causedByEventIds: intelligenceAtLeast(intelligence, 'confirmed') ? record.causedByEventIds : [],
    resultedInEventIds: verified ? record.resultedInEventIds : [],
    createdEntityIds: verified ? record.createdEntityIds : [],
    changedEntityIds: verified ? record.changedEntityIds : [],
    destroyedEntityIds: verified ? record.destroyedEntityIds : [],
    intelligenceLevel: intelligence.level,
    confidence: Math.round(intelligence.confidence),
    intelligenceSource: intelligenceSourceLabel(intelligence.source),
    staleYears: intelligence.staleYears,
    redacted: !verified,
    unknownCauseLinks: record.causedByEventIds.length > 0 && !intelligenceAtLeast(intelligence, 'confirmed'),
    unknownResultLinks: record.resultedInEventIds.length > 0 && !verified
  };
}

export function buildKnownChronicle(
  state: SimulationState,
  context: SimulationContext,
  access: ChronicleIntelligenceContext,
  query: KnownChronicleQuery = {}
): KnownChronicleRecord[] {
  const minimum = query.minimumIntelligence ?? 'observed';
  const base = buildChronicle(state, context, { ...query, includeHidden: true, limit: Math.max(query.limit ?? 1_000, 10_000) });
  const projected = base
    .map((record) => {
      const intelligence = recordIntelligence(record, state, access);
      return intelligenceAtLeast(intelligence, minimum) ? projectKnownRecord(record, intelligence, access) : null;
    })
    .filter((record): record is KnownChronicleRecord => Boolean(record));
  const visibleIds = new Set(projected.map((record) => record.id));
  return projected.map((record) => ({
    ...record,
    causedByEventIds: record.causedByEventIds.filter((id) => visibleIds.has(id)),
    resultedInEventIds: record.resultedInEventIds.filter((id) => visibleIds.has(id)),
    unknownCauseLinks: record.unknownCauseLinks || record.causedByEventIds.some((id) => !visibleIds.has(id)),
    unknownResultLinks: record.unknownResultLinks || record.resultedInEventIds.some((id) => !visibleIds.has(id))
  })).slice(0, Math.max(1, query.limit ?? 1_000));
}

export function traceKnownCausalChain(
  state: SimulationState,
  eventId: string,
  access: ChronicleIntelligenceContext,
  minimum: IntelligenceLevel = 'observed',
  maxDepth = 6
): WorldEvent[] {
  return traceCausalChain(state, eventId, 'both', maxDepth).filter((event) =>
    intelligenceAtLeast(eventIntelligence(event, access.knowledge, access.contacts, access.currentHour), minimum)
  );
}

export function compareKnownChroniclePeriods(
  state: SimulationState,
  context: SimulationContext,
  access: ChronicleIntelligenceContext,
  fromYear: number,
  toYear: number,
  minimumIntelligence: IntelligenceLevel = 'observed'
): ChronicleComparison {
  const records = buildKnownChronicle(state, context, access, { fromYear, toYear, minimumIntelligence, limit: 10_000 });
  const eventById = new Map(state.events.map((event) => [event.id, event]));
  const recordedPopulationDelta = records.reduce((sum, record) => {
    if (!intelligenceAtLeast({ entityId: record.id, entityType: 'system', level: record.intelligenceLevel, confidence: record.confidence, knownFields: [], staleYears: record.staleYears }, 'confirmed')) return sum;
    const value = eventById.get(record.id)?.data?.populationDelta;
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
  const recordedCasualties = records.reduce((sum, record) => {
    if (record.intelligenceLevel !== 'verified') return sum;
    const event = eventById.get(record.id);
    const values = [event?.data?.casualties, event?.data?.warCasualties, event?.data?.playerCasualtiesAvoided];
    return sum + values.reduce<number>((inner, value) => inner + (typeof value === 'number' ? value : 0), 0);
  }, 0);
  const changedSystemIds = unique(records.flatMap((record) => record.systemIds));
  const changedCivilizationIds = unique(records.flatMap((record) => record.civilizationIds));
  const severeEvents = records.filter((record) => record.severity >= 7).length;
  const playerInterventions = records.filter((record) => record.playerInvolved).length;
  const wars = records.filter((record) => record.domain === 'war').length;
  const crises = records.filter((record) => ['economy', 'society', 'ecology', 'demography'].includes(record.domain) && record.severity >= 6).length;
  const discoveries = records.filter((record) => record.domain === 'science' || record.domain === 'heritage').length;
  const createdEntities = unique(records.flatMap((record) => record.createdEntityIds)).length;
  const destroyedEntities = unique(records.flatMap((record) => record.destroyedEntityIds)).length;
  return {
    fromYear,
    toYear,
    events: records.length,
    severeEvents,
    wars,
    crises,
    discoveries,
    playerInterventions,
    recordedPopulationDelta,
    recordedCasualties,
    createdEntities,
    destroyedEntities,
    changedSystemIds,
    changedCivilizationIds,
    headline: records.length === 0
      ? 'За выбранный период доступных сведений нет.'
      : `${records.length} известных событий: ${wars} военных, ${crises} кризисных, ${discoveries} исследовательских. Часть истории остаётся скрытой.`
  };
}

export function knownChronicleStatus(record: KnownChronicleRecord): string {
  return `${intelligenceLabel(record.intelligenceLevel)} · ${record.confidence}% · ${record.intelligenceSource}`;
}
