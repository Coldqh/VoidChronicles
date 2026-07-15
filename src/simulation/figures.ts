import type { Civilization, Faction } from '../game/types';
import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import { economyForCivilization } from './economy';
import { livePolities } from './polities';
import { liveSocieties } from './population';
import type { SimulationState, WorldEvent, WorldEventDraft } from './types';
import { liveWars } from './war';

const HOURS_PER_YEAR = 365 * 24;
const FIGURE_STATE_TAG = 'living-figure-state';
const INSTITUTION_STATE_TAG = 'living-institution-state';
const SEP = '|';

export type FigureDomain =
  | 'ruler'
  | 'military'
  | 'science'
  | 'faith'
  | 'commerce'
  | 'exploration'
  | 'revolution';

export type LiveFigureStatus = 'active' | 'dead' | 'missing' | 'retired';

export interface LiveHistoricalFigure {
  id: string;
  civilizationId: string;
  name: string;
  role: string;
  domain: FigureDomain;
  bornYear: number;
  diedYear?: number;
  status: LiveFigureStatus;
  importance: number;
  influence: number;
  competence: number;
  ambition: number;
  loyalty: number;
  polityId?: string;
  institutionId?: string;
  systemId: string;
  achievements: string[];
  rivals: string[];
  lastUpdatedHour: number;
}

export type InstitutionKind =
  | 'government'
  | 'military'
  | 'academy'
  | 'religious'
  | 'trade'
  | 'intelligence'
  | 'medical'
  | 'archive';

export type InstitutionStatus = 'active' | 'dissolved' | 'exiled' | 'destroyed';

export interface LiveInstitutionState {
  id: string;
  civilizationId: string;
  name: string;
  kind: InstitutionKind;
  headquartersSystemId: string;
  polityId?: string;
  influence: number;
  wealth: number;
  membership: number;
  cohesion: number;
  corruption: number;
  research: number;
  status: InstitutionStatus;
  foundedYear: number;
  lastUpdatedHour: number;
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function split(value: unknown): string[] {
  return typeof value === 'string'
    ? [...new Set(value.split(SEP).map((entry) => entry.trim()).filter(Boolean))]
    : [];
}

function join(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(SEP);
}

function domainForRole(role: string): FigureDomain {
  const text = role.toLowerCase();
  if (text.includes('прав') || text.includes('корол') || text.includes('президент')) return 'ruler';
  if (text.includes('генера') || text.includes('адмирал') || text.includes('воен')) return 'military';
  if (text.includes('учён') || text.includes('инжен') || text.includes('изобрет')) return 'science';
  if (text.includes('жрец') || text.includes('пророк') || text.includes('религ')) return 'faith';
  if (text.includes('торг') || text.includes('купец') || text.includes('директор')) return 'commerce';
  if (text.includes('исслед') || text.includes('путеше')) return 'exploration';
  return 'revolution';
}

function generatedName(civilization: Civilization, seed: string, index: number): string {
  const rng = createRng(`${seed}:figure-name:${civilization.id}:${index}`);
  const first = ['Ара', 'Вел', 'Кир', 'Нер', 'Саэл', 'Тар', 'Има', 'Рун', 'Лис', 'Орт'];
  const second = ['дан', 'мер', 'хал', 'рис', 'вен', 'тор', 'кеш', 'лин', 'сар', 'дек'];
  const family = ['Астэр', 'Коран', 'Вейр', 'Талос', 'Мерид', 'Оррен', 'Сарин', 'Кейл'];
  return `${first[rng.int(0, first.length - 1)]}${second[rng.int(0, second.length - 1)]} ${family[rng.int(0, family.length - 1)]}`;
}

function roleForIndex(index: number): { role: string; domain: FigureDomain } {
  const roles: Array<{ role: string; domain: FigureDomain }> = [
    { role: 'глава государства', domain: 'ruler' },
    { role: 'верховный командующий', domain: 'military' },
    { role: 'ведущий исследователь', domain: 'science' },
    { role: 'глава торгового союза', domain: 'commerce' },
    { role: 'хранитель традиции', domain: 'faith' },
    { role: 'исследователь дальних рубежей', domain: 'exploration' }
  ];
  return roles[index % roles.length]!;
}

function figureFromHistorical(
  figure: SimulationContext['galaxy']['figures'][number],
  civilization: Civilization,
  state: SimulationState,
  context: SimulationContext
): LiveHistoricalFigure {
  const currentYear = state.clock.epochYear + Math.floor(state.clock.absoluteHour / HOURS_PER_YEAR);
  const status: LiveFigureStatus = figure.diedYear !== undefined && figure.diedYear <= currentYear
    ? 'dead'
    : 'active';
  return {
    id: figure.id,
    civilizationId: figure.civilizationId,
    name: figure.name,
    role: figure.role,
    domain: domainForRole(figure.role),
    bornYear: figure.bornYear,
    diedYear: figure.diedYear,
    status,
    importance: clamp(figure.importance),
    influence: clamp(figure.importance * 0.8 + 15),
    competence: clamp(45 + figure.importance * 0.45),
    ambition: clamp(30 + figure.importance * 0.35),
    loyalty: 60,
    polityId: livePolities(state, context).find(
      (polity) => polity.civilizationId === figure.civilizationId && polity.status === 'active'
    )?.id,
    systemId: civilization.homeSystemId,
    achievements: [...figure.achievements],
    rivals: [],
    lastUpdatedHour: state.clock.absoluteHour
  };
}

function fallbackFigures(
  civilization: Civilization,
  state: SimulationState,
  context: SimulationContext
): LiveHistoricalFigure[] {
  const polity = livePolities(state, context).find(
    (entry) => entry.civilizationId === civilization.id && entry.status === 'active'
  );
  const currentYear = state.clock.epochYear + Math.floor(state.clock.absoluteHour / HOURS_PER_YEAR);
  return Array.from({ length: Math.min(6, Math.max(3, civilization.techLevel)) }, (_, index) => {
    const rng = createRng(`${context.seed}:figure:${civilization.id}:${index}`);
    const role = roleForIndex(index);
    return {
      id: `figure_living_${civilization.id}_${index}`,
      civilizationId: civilization.id,
      name: generatedName(civilization, context.seed, index),
      role: role.role,
      domain: role.domain,
      bornYear: currentYear - rng.int(28, 75),
      status: 'active' as const,
      importance: rng.int(35, 78),
      influence: rng.int(30, 75),
      competence: rng.int(38, 84),
      ambition: rng.int(24, 88),
      loyalty: rng.int(35, 82),
      polityId: polity?.id,
      systemId: polity?.capitalSystemId ?? civilization.homeSystemId,
      achievements: [],
      rivals: [],
      lastUpdatedHour: state.clock.absoluteHour
    };
  });
}

function figureFromEvent(event: WorldEvent, fallback?: LiveHistoricalFigure): LiveHistoricalFigure | undefined {
  const id = stringValue(event.data?.figureId);
  const civilizationId = stringValue(event.data?.figureCivilizationId, event.civilizationIds[0] ?? '');
  if (!id || !civilizationId) return undefined;
  return {
    id,
    civilizationId,
    name: stringValue(event.data?.figureName, fallback?.name ?? id),
    role: stringValue(event.data?.figureRole, fallback?.role ?? 'общественный деятель'),
    domain: stringValue(event.data?.figureDomain, fallback?.domain ?? 'ruler') as FigureDomain,
    bornYear: numberValue(event.data?.figureBornYear, fallback?.bornYear ?? 0),
    diedYear: typeof event.data?.figureDiedYear === 'number'
      ? event.data.figureDiedYear
      : fallback?.diedYear,
    status: stringValue(event.data?.figureStatus, fallback?.status ?? 'active') as LiveFigureStatus,
    importance: clamp(numberValue(event.data?.figureImportance, fallback?.importance ?? 40)),
    influence: clamp(numberValue(event.data?.figureInfluence, fallback?.influence ?? 40)),
    competence: clamp(numberValue(event.data?.figureCompetence, fallback?.competence ?? 50)),
    ambition: clamp(numberValue(event.data?.figureAmbition, fallback?.ambition ?? 50)),
    loyalty: clamp(numberValue(event.data?.figureLoyalty, fallback?.loyalty ?? 50)),
    polityId: stringValue(event.data?.figurePolityId, fallback?.polityId ?? '') || undefined,
    institutionId: stringValue(event.data?.figureInstitutionId, fallback?.institutionId ?? '') || undefined,
    systemId: stringValue(event.data?.figureSystemId, fallback?.systemId ?? ''),
    achievements: split(event.data?.figureAchievements).length
      ? split(event.data?.figureAchievements)
      : [...(fallback?.achievements ?? [])],
    rivals: split(event.data?.figureRivals).length
      ? split(event.data?.figureRivals)
      : [...(fallback?.rivals ?? [])],
    lastUpdatedHour: numberValue(event.data?.figureLastUpdatedHour, event.atHour)
  };
}

function kindForFaction(faction: Faction): InstitutionKind {
  if (faction.kind === 'government') return 'government';
  if (faction.kind === 'university') return 'academy';
  if (faction.kind === 'religious') return 'religious';
  if (faction.kind === 'tradeHouse' || faction.kind === 'corporation') return 'trade';
  if (faction.kind === 'cartel' || faction.kind === 'pirates') return 'intelligence';
  return 'government';
}

function institutionFromFaction(
  faction: Faction,
  civilization: Civilization,
  state: SimulationState,
  context: SimulationContext
): LiveInstitutionState {
  const polity = livePolities(state, context).find(
    (entry) => entry.civilizationId === civilization.id && entry.status === 'active'
  );
  const simulation = state.factions[faction.id];
  return {
    id: `institution_${faction.id}`,
    civilizationId: civilization.id,
    name: faction.name,
    kind: kindForFaction(faction),
    headquartersSystemId: polity?.capitalSystemId ?? civilization.homeSystemId,
    polityId: polity?.id,
    influence: clamp(simulation?.influence ?? faction.reputation + 45),
    wealth: clamp(simulation?.wealth ?? faction.wealth),
    membership: Math.max(100, Math.round((civilization.development?.population ?? 50_000) * 0.01)),
    cohesion: clamp(65 - (simulation?.tension ?? 20) * 0.3),
    corruption: clamp((simulation?.tension ?? 20) * 0.45 + (100 - faction.reputation) * 0.15),
    research: clamp(simulation?.research ?? faction.research),
    status: 'active',
    foundedYear: civilization.foundedYear,
    lastUpdatedHour: state.clock.absoluteHour
  };
}

function institutionFromEvent(
  event: WorldEvent,
  fallback?: LiveInstitutionState
): LiveInstitutionState | undefined {
  const id = stringValue(event.data?.institutionId);
  const civilizationId = stringValue(
    event.data?.institutionCivilizationId,
    event.civilizationIds[0] ?? ''
  );
  if (!id || !civilizationId) return undefined;
  return {
    id,
    civilizationId,
    name: stringValue(event.data?.institutionName, fallback?.name ?? id),
    kind: stringValue(event.data?.institutionKind, fallback?.kind ?? 'government') as InstitutionKind,
    headquartersSystemId: stringValue(
      event.data?.institutionHeadquartersSystemId,
      fallback?.headquartersSystemId ?? ''
    ),
    polityId: stringValue(event.data?.institutionPolityId, fallback?.polityId ?? '') || undefined,
    influence: clamp(numberValue(event.data?.institutionInfluence, fallback?.influence ?? 40)),
    wealth: clamp(numberValue(event.data?.institutionWealth, fallback?.wealth ?? 40)),
    membership: Math.max(0, Math.round(numberValue(event.data?.institutionMembership, fallback?.membership ?? 0))),
    cohesion: clamp(numberValue(event.data?.institutionCohesion, fallback?.cohesion ?? 50)),
    corruption: clamp(numberValue(event.data?.institutionCorruption, fallback?.corruption ?? 20)),
    research: clamp(numberValue(event.data?.institutionResearch, fallback?.research ?? 30)),
    status: stringValue(event.data?.institutionStatus, fallback?.status ?? 'active') as InstitutionStatus,
    foundedYear: numberValue(event.data?.institutionFoundedYear, fallback?.foundedYear ?? 0),
    lastUpdatedHour: numberValue(event.data?.institutionLastUpdatedHour, event.atHour)
  };
}

export function liveHistoricalFigures(
  state: SimulationState,
  context: SimulationContext
): LiveHistoricalFigure[] {
  const byId = new Map<string, LiveHistoricalFigure>();
  for (const civilization of context.galaxy.civilizations) {
    const historical = context.galaxy.figures.filter(
      (figure) => figure.civilizationId === civilization.id
    );
    for (const figure of historical) {
      const projected = figureFromHistorical(figure, civilization, state, context);
      byId.set(projected.id, projected);
    }
    if (![...byId.values()].some((figure) => figure.civilizationId === civilization.id && figure.status === 'active')) {
      for (const figure of fallbackFigures(civilization, state, context)) byId.set(figure.id, figure);
    }
  }
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(FIGURE_STATE_TAG)) continue;
    const id = stringValue(event.data?.figureId);
    const projected = figureFromEvent(event, id ? byId.get(id) : undefined);
    if (projected) byId.set(projected.id, projected);
  }
  return [...byId.values()].sort((a, b) => b.influence - a.influence);
}

export function liveInstitutions(
  state: SimulationState,
  context: SimulationContext
): LiveInstitutionState[] {
  const byId = new Map<string, LiveInstitutionState>();
  for (const civilization of context.galaxy.civilizations) {
    for (const faction of context.factions.filter((entry) => entry.civilizationId === civilization.id)) {
      const institution = institutionFromFaction(faction, civilization, state, context);
      byId.set(institution.id, institution);
    }
    const archiveId = `institution_archive_${civilization.id}`;
    if (!byId.has(archiveId)) {
      byId.set(archiveId, {
        id: archiveId,
        civilizationId: civilization.id,
        name: `${civilization.name} · Центральный архив`,
        kind: 'archive',
        headquartersSystemId: civilization.homeSystemId,
        polityId: livePolities(state, context).find(
          (entry) => entry.civilizationId === civilization.id && entry.status === 'active'
        )?.id,
        influence: 35,
        wealth: 30,
        membership: Math.max(80, Math.round((civilization.development?.population ?? 20_000) * 0.001)),
        cohesion: 70,
        corruption: 12,
        research: clamp(civilization.development?.literacy ?? civilization.techLevel * 10),
        status: 'active',
        foundedYear: civilization.foundedYear,
        lastUpdatedHour: state.clock.absoluteHour
      });
    }
  }
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(INSTITUTION_STATE_TAG)) continue;
    const id = stringValue(event.data?.institutionId);
    const projected = institutionFromEvent(event, id ? byId.get(id) : undefined);
    if (projected) byId.set(projected.id, projected);
  }
  return [...byId.values()].sort((a, b) => b.influence - a.influence);
}

function writeFigureSnapshot(state: SimulationState, figure: LiveHistoricalFigure, atHour: number): void {
  const event: WorldEvent = {
    id: `state_figure_${figure.id}`,
    atHour,
    kind: 'politics',
    title: 'Состояние исторической личности',
    summary: 'Служебный снимок личности.',
    severity: 0,
    visibility: 'hidden',
    systemIds: [figure.systemId],
    civilizationIds: [figure.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', FIGURE_STATE_TAG, 'state-snapshot'],
    data: {
      figureId: figure.id,
      figureCivilizationId: figure.civilizationId,
      figureName: figure.name,
      figureRole: figure.role,
      figureDomain: figure.domain,
      figureBornYear: figure.bornYear,
      figureDiedYear: figure.diedYear ?? false,
      figureStatus: figure.status,
      figureImportance: figure.importance,
      figureInfluence: figure.influence,
      figureCompetence: figure.competence,
      figureAmbition: figure.ambition,
      figureLoyalty: figure.loyalty,
      figurePolityId: figure.polityId ?? '',
      figureInstitutionId: figure.institutionId ?? '',
      figureSystemId: figure.systemId,
      figureAchievements: join(figure.achievements),
      figureRivals: join(figure.rivals),
      figureLastUpdatedHour: atHour
    }
  };
  state.events = [
    event,
    ...state.events.filter(
      (entry) => !(entry.tags.includes(FIGURE_STATE_TAG) && entry.data?.figureId === figure.id)
    )
  ].slice(0, 8_500);
}

function writeInstitutionSnapshot(
  state: SimulationState,
  institution: LiveInstitutionState,
  atHour: number
): void {
  const event: WorldEvent = {
    id: `state_institution_${institution.id}`,
    atHour,
    kind: 'politics',
    title: 'Состояние института',
    summary: 'Служебный снимок института.',
    severity: 0,
    visibility: 'hidden',
    systemIds: [institution.headquartersSystemId],
    civilizationIds: [institution.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', INSTITUTION_STATE_TAG, 'state-snapshot'],
    data: {
      institutionId: institution.id,
      institutionCivilizationId: institution.civilizationId,
      institutionName: institution.name,
      institutionKind: institution.kind,
      institutionHeadquartersSystemId: institution.headquartersSystemId,
      institutionPolityId: institution.polityId ?? '',
      institutionInfluence: institution.influence,
      institutionWealth: institution.wealth,
      institutionMembership: institution.membership,
      institutionCohesion: institution.cohesion,
      institutionCorruption: institution.corruption,
      institutionResearch: institution.research,
      institutionStatus: institution.status,
      institutionFoundedYear: institution.foundedYear,
      institutionLastUpdatedHour: atHour
    }
  };
  state.events = [
    event,
    ...state.events.filter(
      (entry) => !(
        entry.tags.includes(INSTITUTION_STATE_TAG) &&
        entry.data?.institutionId === institution.id
      )
    )
  ].slice(0, 8_500);
}

function recentEvent(
  state: SimulationState,
  civilizationId: string,
  tag: string,
  atHour: number,
  years: number
): boolean {
  return state.events.some(
    (event) =>
      event.visibility !== 'hidden' &&
      event.civilizationIds.includes(civilizationId) &&
      event.tags.includes(tag) &&
      atHour - event.atHour < years * HOURS_PER_YEAR
  );
}

export function simulateHistoricalFiguresCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const figures = liveHistoricalFigures(state, context).filter(
    (figure) => figure.civilizationId === civilization.id && figure.status === 'active'
  );
  const institutions = liveInstitutions(state, context).filter(
    (institution) => institution.civilizationId === civilization.id && institution.status === 'active'
  );
  if (!figures.length || !institutions.length) return null;
  const lastUpdated = Math.max(
    ...figures.map((figure) => figure.lastUpdatedHour),
    ...institutions.map((institution) => institution.lastUpdatedHour)
  );
  if (atHour - lastUpdated < 180 * 24) return null;

  const economy = economyForCivilization(state, context, civilization.id);
  const society = liveSocieties(state, context).find((entry) => entry.civilizationId === civilization.id);
  const activeWar = liveWars(state).find(
    (war) =>
      war.status === 'active' &&
      war.civilizationIds.includes(civilization.id)
  );
  const polity = livePolities(state, context).find(
    (entry) => entry.civilizationId === civilization.id && entry.status === 'active'
  );
  const rng = createRng(`${context.seed}:figures:${civilization.id}:${Math.floor(atHour / HOURS_PER_YEAR)}`);

  for (const institution of institutions) {
    const next: LiveInstitutionState = {
      ...institution,
      influence: clamp(
        institution.influence +
        (economy?.growth ?? 0) * 0.08 -
        (society?.classTension ?? 20) * 0.015 +
        rng.int(-2, 2)
      ),
      wealth: clamp(institution.wealth + (economy?.treasuryFlow ?? 35) * 0.06 - institution.corruption * 0.025),
      cohesion: clamp(institution.cohesion - (society?.radicalization ?? 10) * 0.025 + rng.int(-1, 2)),
      corruption: clamp(institution.corruption + rng.int(-2, 2) + ((economy?.inequality ?? 20) > 65 ? 2 : -1)),
      research: clamp(institution.research + (institution.kind === 'academy' ? 2 : 0) + (economy?.growth ?? 0) * 0.03),
      membership: Math.max(25, Math.round(institution.membership * (1 + rng.int(-5, 8) / 1_000))),
      polityId: polity?.id ?? institution.polityId,
      headquartersSystemId: polity?.capitalSystemId ?? institution.headquartersSystemId,
      lastUpdatedHour: atHour
    };
    writeInstitutionSnapshot(state, next, atHour);
  }

  const currentYear = state.clock.epochYear + Math.floor(atHour / HOURS_PER_YEAR);
  const lifespan = (civilization as Civilization & { speciesProfile?: { lifespan: number } }).speciesProfile?.lifespan ?? 85;
  const updated: LiveHistoricalFigure[] = [];
  for (const figure of figures) {
    const age = currentYear - figure.bornYear;
    const deathChance = age > lifespan
      ? Math.min(0.75, 0.08 + (age - lifespan) / Math.max(20, lifespan))
      : age > lifespan * 0.8
        ? 0.025
        : 0.003;
    const died = rng.chance(deathChance);
    const matchingInstitution = institutions.find((institution) => {
      if (figure.domain === 'science') return institution.kind === 'academy';
      if (figure.domain === 'military') return institution.kind === 'military' || institution.kind === 'government';
      if (figure.domain === 'faith') return institution.kind === 'religious';
      if (figure.domain === 'commerce') return institution.kind === 'trade';
      if (figure.domain === 'exploration') return institution.kind === 'academy' || institution.kind === 'archive';
      return institution.kind === 'government';
    }) ?? institutions[0];
    const next: LiveHistoricalFigure = {
      ...figure,
      status: died ? 'dead' : figure.status,
      diedYear: died ? currentYear : figure.diedYear,
      influence: clamp(figure.influence + rng.int(-3, 4) + (matchingInstitution?.influence ?? 40) * 0.015),
      importance: clamp(figure.importance + (activeWar && figure.domain === 'military' ? 2 : 0) + rng.int(0, 1)),
      loyalty: clamp(figure.loyalty - (society?.classTension ?? 20) * 0.012 + rng.int(-2, 2)),
      institutionId: matchingInstitution?.id,
      polityId: polity?.id ?? figure.polityId,
      systemId: polity?.capitalSystemId ?? figure.systemId,
      lastUpdatedHour: atHour
    };
    writeFigureSnapshot(state, next, atHour);
    updated.push(next);
  }

  const dead = updated.find((figure) => figure.status === 'dead' && figure.diedYear === currentYear);
  if (dead && !recentEvent(state, civilization.id, 'figure-death', atHour, 1)) {
    return {
      kind: 'politics',
      title: `${civilization.name}: умер ${dead.name}`,
      summary: `${dead.role} умер в возрасте ${currentYear - dead.bornYear}. Его влияние и незавершённые дела переходят к институтам и соперникам.`,
      severity: Math.max(4, Math.round(dead.importance / 12)),
      visibility: dead.importance >= 65 ? 'public' : 'local',
      systemIds: [dead.systemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'historical-figure', 'figure-death'],
      data: { figureId: dead.id, figureName: dead.name, institutionId: dead.institutionId ?? '' }
    };
  }

  const scientist = updated
    .filter((figure) => figure.status === 'active' && figure.domain === 'science')
    .sort((a, b) => b.competence + b.influence - (a.competence + a.influence))[0];
  if (
    scientist &&
    scientist.competence + scientist.influence >= 135 &&
    rng.chance(0.35) &&
    !recentEvent(state, civilization.id, 'institutional-breakthrough', atHour, 3)
  ) {
    const simulation = state.civilizations[civilization.id];
    if (simulation) simulation.research = clamp(simulation.research + 4);
    return {
      kind: 'research',
      title: `${scientist.name}: институциональный прорыв`,
      summary: `${scientist.role} завершил крупную программу исследований. Результат закреплён институтом и не исчезнет вместе с одним человеком.`,
      severity: 6,
      visibility: 'public',
      systemIds: [scientist.systemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'historical-figure', 'institutional-breakthrough'],
      data: { figureId: scientist.id, institutionId: scientist.institutionId ?? '', researchGain: 4 }
    };
  }

  const corrupt = institutions.sort((a, b) => b.corruption - a.corruption)[0];
  if (
    corrupt &&
    corrupt.corruption >= 72 &&
    rng.chance(0.42) &&
    !recentEvent(state, civilization.id, 'institution-scandal', atHour, 2)
  ) {
    return {
      kind: 'politics',
      title: `${corrupt.name}: коррупционный скандал`,
      summary: `Внутренние документы раскрыли злоупотребления. Коррупция ${Math.round(corrupt.corruption)}/100, сплочённость ${Math.round(corrupt.cohesion)}/100.`,
      severity: 7,
      visibility: 'public',
      systemIds: [corrupt.headquartersSystemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'institution', 'institution-scandal'],
      data: { institutionId: corrupt.id, corruption: corrupt.corruption }
    };
  }
  return null;
}
