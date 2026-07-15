import type { SimulationContext } from './context';
import { causalLinksForEvent } from './causality';
import type { SimulationState, WorldEvent } from './types';

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
