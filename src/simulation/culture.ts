import type {
  Civilization,
  CivilizationCulture,
  CivilizationLanguage,
  CivilizationReligion
} from '../game/types';
import type { DeepTimeCultureState } from '../deeptime/types';
import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import type {
  PopulationGroupState,
  SimulationState,
  WorldEvent,
  WorldEventDraft
} from './types';

const HOURS_PER_YEAR = 365 * 24;
const STATE_TAG = 'living-culture-state';
const SEPARATOR = '|';

export type LiveCultureStatus = 'living' | 'absorbed' | 'extinct';

export interface LiveCultureState {
  id: string;
  civilizationId: string;
  name: string;
  status: LiveCultureStatus;
  originYear: number;
  parentCultureId?: string;
  values: string[];
  languageId?: string;
  religionIds: string[];
  population: number;
  share: number;
  influence: number;
  cohesion: number;
  assimilationPressure: number;
  radicalization: number;
  lastUpdatedHour: number;
}

export interface CivilizationCultureSummary {
  civilizationId: string;
  dominantCulture?: LiveCultureState;
  dominantLanguage?: CivilizationLanguage;
  dominantReligions: CivilizationReligion[];
  diversity: number;
  tension: number;
  assimilation: number;
  cultures: LiveCultureState[];
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
  if (typeof value !== 'string' || !value) return [];
  return [...new Set(value.split(SEPARATOR).map((entry) => entry.trim()).filter(Boolean))];
}

function join(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(SEPARATOR);
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}

function groupsForCivilization(
  state: SimulationState,
  civilizationId: string
): PopulationGroupState[] {
  return Object.values(state.populationGroups).filter(
    (group) => group.civilizationId === civilizationId && group.population > 0
  );
}

function staticCultureForName(
  civilization: Civilization,
  name: string
): CivilizationCulture | undefined {
  const normalized = normalizeName(name);
  return civilization.cultures?.find(
    (culture) => normalizeName(culture.name) === normalized
  );
}

function cultureFromDeepTime(
  culture: DeepTimeCultureState,
  civilization: Civilization,
  groups: PopulationGroupState[],
  totalPopulation: number
): LiveCultureState {
  const staticCulture = staticCultureForName(civilization, culture.name);
  const population = groups
    .filter((group) => normalizeName(group.culture) === normalizeName(culture.name))
    .reduce((sum, group) => sum + group.population, 0);
  const radicalization = population > 0
    ? groups
      .filter((group) => normalizeName(group.culture) === normalizeName(culture.name))
      .reduce((sum, group) => sum + group.radicalization * group.population, 0) / population
    : 15;
  const share = totalPopulation > 0 ? population / totalPopulation * 100 : 0;
  return {
    id: culture.id,
    civilizationId: culture.civilizationId,
    name: culture.name,
    status: culture.status,
    originYear: culture.originYear,
    parentCultureId: culture.parentCultureId,
    values: [...culture.values],
    languageId: staticCulture?.languageId,
    religionIds: [...(staticCulture?.religionIds ?? [])],
    population,
    share,
    influence: clamp(share * 0.7 + (culture.status === 'living' ? 20 : 0)),
    cohesion: clamp(75 - radicalization * 0.35 + share * 0.15),
    assimilationPressure: clamp(40 + share * 0.35),
    radicalization: clamp(radicalization),
    lastUpdatedHour: 0
  };
}

function cultureFromStatic(
  civilization: Civilization,
  culture: CivilizationCulture,
  groups: PopulationGroupState[],
  totalPopulation: number
): LiveCultureState {
  const related = groups.filter(
    (group) => normalizeName(group.culture) === normalizeName(culture.name)
  );
  const population = related.reduce((sum, group) => sum + group.population, 0);
  const share = totalPopulation > 0 ? population / totalPopulation * 100 : 0;
  const radicalization = population > 0
    ? related.reduce((sum, group) => sum + group.radicalization * group.population, 0) / population
    : 12;
  return {
    id: culture.id,
    civilizationId: civilization.id,
    name: culture.name,
    status: 'living',
    originYear: civilization.foundedYear,
    values: [...culture.values],
    languageId: culture.languageId,
    religionIds: [...culture.religionIds],
    population,
    share,
    influence: clamp(share * 0.75 + 18),
    cohesion: clamp(72 - radicalization * 0.32 + share * 0.18),
    assimilationPressure: clamp(35 + share * 0.4),
    radicalization: clamp(radicalization),
    lastUpdatedHour: 0
  };
}

function cultureFromGroup(
  civilization: Civilization,
  group: PopulationGroupState,
  totalPopulation: number
): LiveCultureState {
  return {
    id: `culture_live_${civilization.id}_${normalizeName(group.culture).replace(/[^a-zа-я0-9]+/gi, '_')}`,
    civilizationId: civilization.id,
    name: group.culture,
    status: 'living',
    originYear: civilization.foundedYear,
    values: [civilization.ideology],
    languageId: civilization.languages?.[0]?.id,
    religionIds: civilization.religions?.slice(0, 1).map((entry) => entry.id) ?? [],
    population: group.population,
    share: totalPopulation > 0 ? group.population / totalPopulation * 100 : 0,
    influence: clamp(group.population / Math.max(1, totalPopulation) * 80 + 12),
    cohesion: clamp(70 - group.radicalization * 0.3),
    assimilationPressure: 35,
    radicalization: clamp(group.radicalization),
    lastUpdatedHour: 0
  };
}

function cultureFromEvent(event: WorldEvent): LiveCultureState | undefined {
  const cultureId = stringValue(event.data?.cultureId);
  const civilizationId = stringValue(event.data?.cultureCivilizationId, event.civilizationIds[0]);
  if (!cultureId || !civilizationId) return undefined;
  return {
    id: cultureId,
    civilizationId,
    name: stringValue(event.data?.cultureName, cultureId),
    status: stringValue(event.data?.cultureStatus, 'living') as LiveCultureStatus,
    originYear: numberValue(event.data?.cultureOriginYear, 0),
    parentCultureId: stringValue(event.data?.parentCultureId) || undefined,
    values: split(event.data?.cultureValues),
    languageId: stringValue(event.data?.cultureLanguageId) || undefined,
    religionIds: split(event.data?.cultureReligionIds),
    population: Math.max(0, Math.round(numberValue(event.data?.culturePopulation, 0))),
    share: clamp(numberValue(event.data?.cultureShare, 0)),
    influence: clamp(numberValue(event.data?.cultureInfluence, 0)),
    cohesion: clamp(numberValue(event.data?.cultureCohesion, 50)),
    assimilationPressure: clamp(numberValue(event.data?.assimilationPressure, 40)),
    radicalization: clamp(numberValue(event.data?.cultureRadicalization, 10)),
    lastUpdatedHour: numberValue(event.data?.cultureLastUpdatedHour, event.atHour)
  };
}

export function liveCultures(
  state: SimulationState,
  context: SimulationContext,
  civilizationId?: string
): LiveCultureState[] {
  const byId = new Map<string, LiveCultureState>();
  const civilizations = civilizationId
    ? context.galaxy.civilizations.filter((entry) => entry.id === civilizationId)
    : context.galaxy.civilizations;

  for (const civilization of civilizations) {
    const groups = groupsForCivilization(state, civilization.id);
    const totalPopulation = groups.reduce((sum, group) => sum + group.population, 0);
    const deepCultures = context.galaxy.deepTime?.cultures.filter(
      (culture) => culture.civilizationId === civilization.id
    ) ?? [];
    for (const culture of deepCultures) {
      byId.set(culture.id, cultureFromDeepTime(culture, civilization, groups, totalPopulation));
    }
    for (const culture of civilization.cultures ?? []) {
      if ([...byId.values()].some(
        (entry) => entry.civilizationId === civilization.id && normalizeName(entry.name) === normalizeName(culture.name)
      )) continue;
      byId.set(culture.id, cultureFromStatic(civilization, culture, groups, totalPopulation));
    }
    for (const culture of byId.values()) {
      if (culture.civilizationId !== civilization.id) continue;
      culture.population = 0;
      culture.share = 0;
    }
    for (const group of groups) {
      const existing = [...byId.values()].find(
        (entry) => entry.civilizationId === civilization.id && normalizeName(entry.name) === normalizeName(group.culture)
      );
      if (existing) {
        existing.population += group.population;
        existing.share = totalPopulation > 0 ? existing.population / totalPopulation * 100 : 0;
        continue;
      }
      const generated = cultureFromGroup(civilization, group, totalPopulation);
      byId.set(generated.id, generated);
    }
  }

  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(STATE_TAG)) continue;
    const culture = cultureFromEvent(event);
    if (!culture) continue;
    if (civilizationId && culture.civilizationId !== civilizationId) continue;
    byId.set(culture.id, culture);
  }

  return [...byId.values()].sort((a, b) => b.population - a.population);
}

function languageForCulture(
  civilization: Civilization,
  culture?: LiveCultureState
): CivilizationLanguage | undefined {
  return civilization.languages?.find((language) => language.id === culture?.languageId) ??
    civilization.languages?.[0];
}

function religionsForCulture(
  civilization: Civilization,
  culture?: LiveCultureState
): CivilizationReligion[] {
  const ids = new Set(culture?.religionIds ?? []);
  const selected = civilization.religions?.filter((religion) => ids.has(religion.id)) ?? [];
  return selected.length ? selected : civilization.religions?.slice(0, 2) ?? [];
}

export function cultureSummaryForCivilization(
  state: SimulationState,
  context: SimulationContext,
  civilizationId: string
): CivilizationCultureSummary {
  const civilization = context.galaxy.civilizations.find((entry) => entry.id === civilizationId);
  const cultures = liveCultures(state, context, civilizationId).filter((culture) => culture.status === 'living');
  const dominantCulture = cultures[0];
  const dominantShare = dominantCulture?.share ?? 100;
  const weightedRadicalization = cultures.length
    ? cultures.reduce((sum, culture) => sum + culture.radicalization * Math.max(0.01, culture.share), 0) /
      cultures.reduce((sum, culture) => sum + Math.max(0.01, culture.share), 0)
    : 0;
  const diversity = clamp(100 - dominantShare);
  const tension = clamp(
    diversity * 0.42 +
    weightedRadicalization * 0.42 +
    (state.civilizations[civilizationId]?.cohesion !== undefined
      ? 100 - state.civilizations[civilizationId]!.cohesion
      : 20) * 0.25
  );
  const assimilation = clamp(
    (dominantCulture?.assimilationPressure ?? 35) * 0.65 + dominantShare * 0.35
  );
  return {
    civilizationId,
    dominantCulture,
    dominantLanguage: civilization ? languageForCulture(civilization, dominantCulture) : undefined,
    dominantReligions: civilization ? religionsForCulture(civilization, dominantCulture) : [],
    diversity,
    tension,
    assimilation,
    cultures
  };
}

function writeCultureSnapshot(
  state: SimulationState,
  culture: LiveCultureState,
  systemIds: string[],
  atHour: number
): void {
  const snapshot: WorldEvent = {
    id: `state_culture_${culture.id}`,
    atHour,
    kind: 'politics',
    title: `${culture.name}: состояние культуры`,
    summary: 'Служебный снимок культурного влияния, языка и религии.',
    severity: 0,
    visibility: 'hidden',
    systemIds,
    civilizationIds: [culture.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', STATE_TAG, 'state-snapshot'],
    data: {
      cultureId: culture.id,
      cultureCivilizationId: culture.civilizationId,
      cultureName: culture.name,
      cultureStatus: culture.status,
      cultureOriginYear: culture.originYear,
      parentCultureId: culture.parentCultureId ?? '',
      cultureValues: join(culture.values),
      cultureLanguageId: culture.languageId ?? '',
      cultureReligionIds: join(culture.religionIds),
      culturePopulation: culture.population,
      cultureShare: culture.share,
      cultureInfluence: culture.influence,
      cultureCohesion: culture.cohesion,
      assimilationPressure: culture.assimilationPressure,
      cultureRadicalization: culture.radicalization,
      cultureLastUpdatedHour: atHour
    }
  };
  state.events = [
    snapshot,
    ...state.events.filter(
      (event) => !(event.tags.includes(STATE_TAG) && event.data?.cultureId === culture.id)
    )
  ].slice(0, 1_000);
}

function recentPublicEvent(
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

function chooseSyncreticGroup(groups: PopulationGroupState[]): PopulationGroupState | undefined {
  return [...groups]
    .filter((group) => group.socialClass === 'migrants' || group.radicalization < 45)
    .sort((a, b) => a.population - b.population)[0];
}

export function simulateCultureCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const previousCultures = liveCultures(state, context, civilization.id);
  const lastUpdated = previousCultures.reduce(
    (max, culture) => Math.max(max, culture.lastUpdatedHour),
    0
  );
  if (lastUpdated > 0 && atHour - lastUpdated < 120 * 24) return null;

  const groups = groupsForCivilization(state, civilization.id);
  if (!groups.length) return null;
  const totalPopulation = groups.reduce((sum, group) => sum + group.population, 0);
  const systems = [...new Set(groups
    .map((group) => state.settlements[group.settlementId]?.systemId)
    .filter((id): id is string => Boolean(id)))];
  const byName = new Map<string, LiveCultureState>();
  for (const culture of previousCultures) {
    byName.set(normalizeName(culture.name), { ...culture, population: 0, share: 0 });
  }
  for (const group of groups) {
    const key = normalizeName(group.culture);
    let culture = byName.get(key);
    if (!culture) {
      culture = cultureFromGroup(civilization, group, totalPopulation);
      byName.set(key, culture);
    }
    culture.population += group.population;
  }

  const cultures: LiveCultureState[] = [...byName.values()].map((culture): LiveCultureState => {
    const related = groups.filter((group) => normalizeName(group.culture) === normalizeName(culture.name));
    const population = related.reduce((sum, group) => sum + group.population, 0);
    const radicalization = population > 0
      ? related.reduce((sum, group) => sum + group.radicalization * group.population, 0) / population
      : culture.radicalization;
    const share = totalPopulation > 0 ? population / totalPopulation * 100 : 0;
    return {
      ...culture,
      status: population <= 0 ? 'absorbed' as const : 'living' as const,
      population,
      share,
      influence: clamp(culture.influence + (share - culture.influence) * 0.28),
      cohesion: clamp(culture.cohesion + ((100 - radicalization) - culture.cohesion) * 0.2),
      assimilationPressure: clamp(35 + share * 0.45 + (state.civilizations[civilization.id]?.cohesion ?? 50) * 0.15),
      radicalization: clamp(radicalization),
      lastUpdatedHour: atHour
    };
  }).sort((a, b) => b.population - a.population);

  const dominant = cultures[0];
  const second = cultures[1];
  const diversity = clamp(100 - (dominant?.share ?? 100));
  const weightedRadicalization = cultures.reduce(
    (sum, culture) => sum + culture.radicalization * culture.share / 100,
    0
  );
  const tension = clamp(
    diversity * 0.42 + weightedRadicalization * 0.45 +
    (100 - (state.civilizations[civilization.id]?.cohesion ?? 50)) * 0.25
  );
  const rng = createRng(`${context.seed}:culture:${civilization.id}:${Math.floor(atHour / HOURS_PER_YEAR)}`);

  let createdCulture: LiveCultureState | undefined;
  if (
    dominant && second &&
    dominant.share <= 72 &&
    second.share >= 12 &&
    tension <= 58 &&
    rng.chance(0.45)
  ) {
    const group = chooseSyncreticGroup(groups.filter(
      (entry) =>
        normalizeName(entry.culture) === normalizeName(dominant.name) ||
        normalizeName(entry.culture) === normalizeName(second.name)
    ));
    if (group) {
      const name = `${dominant.name}—${second.name}`;
      group.culture = name;
      group.loyalty = clamp(group.loyalty + 8);
      group.radicalization = clamp(group.radicalization - 6);
      state.populationGroups[group.id] = group;
      createdCulture = {
        id: `culture_syncretic_${civilization.id}_${Math.floor(atHour / HOURS_PER_YEAR)}`,
        civilizationId: civilization.id,
        name,
        status: 'living',
        originYear: context.galaxy.currentYear + Math.floor(atHour / HOURS_PER_YEAR),
        parentCultureId: dominant.id,
        values: [...new Set([...dominant.values, ...second.values])].slice(0, 6),
        languageId: dominant.languageId ?? second.languageId,
        religionIds: [...new Set([...dominant.religionIds, ...second.religionIds])],
        population: group.population,
        share: totalPopulation > 0 ? group.population / totalPopulation * 100 : 0,
        influence: 18,
        cohesion: 68,
        assimilationPressure: 24,
        radicalization: group.radicalization,
        lastUpdatedHour: atHour
      };
      cultures.push(createdCulture);
    }
  }

  for (const culture of cultures) writeCultureSnapshot(state, culture, systems, atHour);

  const civilizationState = state.civilizations[civilization.id];
  if (civilizationState) {
    civilizationState.cohesion = clamp(
      civilizationState.cohesion - tension * 0.035 + (dominant?.cohesion ?? 50) * 0.025
    );
    civilizationState.stability = clamp(
      civilizationState.stability - Math.max(0, tension - 55) * 0.03
    );
    civilizationState.lastUpdatedHour = atHour;
  }

  if (
    createdCulture &&
    !recentPublicEvent(state, civilization.id, 'cultural-syncretism', atHour, 4)
  ) {
    return {
      kind: 'politics',
      title: `${createdCulture.name}: возникла новая культура`,
      summary: `Смешанное население сформировало устойчивую культурную традицию. Численность: ${createdCulture.population.toLocaleString('ru-RU')}.`,
      severity: 5,
      visibility: 'local',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: context.factions.filter((faction) => faction.civilizationId === civilization.id).map((faction) => faction.id),
      tags: ['simulation', 'living-history', 'living-culture', 'cultural-syncretism', 'culture-formation'],
      data: {
        cultureId: createdCulture.id,
        cultureName: createdCulture.name,
        culturePopulation: createdCulture.population,
        culturalDiversity: diversity,
        culturalTension: tension
      }
    };
  }

  if (
    tension >= 72 &&
    !recentPublicEvent(state, civilization.id, 'cultural-conflict', atHour, 2)
  ) {
    for (const group of groups) {
      if (dominant && normalizeName(group.culture) !== normalizeName(dominant.name)) {
        group.radicalization = clamp(group.radicalization + 8);
        group.loyalty = clamp(group.loyalty - 6);
        state.populationGroups[group.id] = group;
      }
    }
    return {
      kind: 'politics',
      title: `${civilization.name}: культурный конфликт`,
      summary: `Культурное напряжение достигло ${Math.round(tension)}/100. Доминирующая традиция контролирует ${Math.round(dominant?.share ?? 0)}% населения.`,
      severity: tension >= 86 ? 8 : 6,
      visibility: 'public',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: context.factions.filter((faction) => faction.civilizationId === civilization.id).map((faction) => faction.id),
      tags: ['simulation', 'living-history', 'living-culture', 'cultural-conflict'],
      data: {
        dominantCultureId: dominant?.id ?? '',
        culturalDiversity: diversity,
        culturalTension: tension,
        dominantCultureShare: dominant?.share ?? 0
      }
    };
  }

  const previousDominant = previousCultures.sort((a, b) => b.share - a.share)[0];
  if (
    dominant &&
    dominant.share >= 82 &&
    (previousDominant?.share ?? 0) < 82 &&
    !recentPublicEvent(state, civilization.id, 'language-standardization', atHour, 5)
  ) {
    const language = languageForCulture(civilization, dominant);
    return {
      kind: 'politics',
      title: `${civilization.name}: языковая стандартизация`,
      summary: language
        ? `Язык «${language.name}» закреплён в управлении, образовании и торговле.`
        : `Язык доминирующей культуры закреплён в управлении, образовании и торговле.`,
      severity: 4,
      visibility: 'local',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'living-culture', 'language-standardization'],
      data: {
        cultureId: dominant.id,
        languageId: dominant.languageId ?? '',
        dominantCultureShare: dominant.share
      }
    };
  }

  const dominantReligion = religionsForCulture(civilization, dominant)[0];
  if (
    dominantReligion &&
    tension >= 55 &&
    weightedRadicalization >= 48 &&
    rng.chance(0.3) &&
    !recentPublicEvent(state, civilization.id, 'religious-reform', atHour, 6)
  ) {
    return {
      kind: 'politics',
      title: `${dominantReligion.name}: религиозная реформа`,
      summary: `Духовные институты изменили толкование доктрины на фоне общественного напряжения ${Math.round(tension)}/100.`,
      severity: 5,
      visibility: 'local',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: context.factions.filter((faction) => faction.civilizationId === civilization.id && faction.kind === 'religious').map((faction) => faction.id),
      tags: ['simulation', 'living-history', 'living-culture', 'religious-reform'],
      data: {
        religionId: dominantReligion.id,
        culturalTension: tension,
        cultureRadicalization: weightedRadicalization
      }
    };
  }

  return null;
}
