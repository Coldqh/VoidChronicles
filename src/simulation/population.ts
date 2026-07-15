import type { Civilization } from '../game/types';
import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import { socialConflictCooldownYears } from './stability';
import { cultureSummaryForCivilization } from './culture';
import { economyForCivilization } from './economy';
import type {
  PopulationGroupState,
  SettlementResource,
  SettlementState,
  SimulationState,
  WorldEvent,
  WorldEventDraft
} from './types';

const HOURS_PER_YEAR = 365 * 24;
const STATE_TAG = 'living-society-state';
const VITAL_RESOURCES: SettlementResource[] = ['food', 'water', 'energy', 'medicine'];

export interface LiveSocietyState {
  civilizationId: string;
  population: number;
  birthRate: number;
  deathRate: number;
  naturalGrowth: number;
  unemployment: number;
  inequality: number;
  classTension: number;
  culturalTension: number;
  radicalization: number;
  loyalty: number;
  migrationPressure: number;
  specialistShare: number;
  eliteShare: number;
  lastUpdatedHour: number;
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function groupsForCivilization(
  state: SimulationState,
  civilizationId: string
): PopulationGroupState[] {
  return Object.values(state.populationGroups).filter(
    (group) => group.civilizationId === civilizationId && group.population > 0
  );
}

function settlementsForCivilization(
  state: SimulationState,
  civilizationId: string
): SettlementState[] {
  return Object.values(state.settlements).filter(
    (settlement) => settlement.civilizationId === civilizationId && !settlement.abandoned
  );
}

function weightedAverage(
  groups: PopulationGroupState[],
  selector: (group: PopulationGroupState) => number,
  fallback: number
): number {
  const population = groups.reduce((sum, group) => sum + group.population, 0);
  return population > 0
    ? groups.reduce((sum, group) => sum + selector(group) * group.population, 0) / population
    : fallback;
}

function stockDays(settlement: SettlementState, resource: SettlementResource): number {
  return settlement.stocks[resource] / Math.max(0.01, settlement.consumption[resource]);
}

function societyFromEvent(event: WorldEvent): LiveSocietyState | undefined {
  const civilizationId = typeof event.data?.societyCivilizationId === 'string'
    ? event.data.societyCivilizationId
    : event.civilizationIds[0];
  if (!civilizationId) return undefined;
  return {
    civilizationId,
    population: Math.max(0, Math.round(numberValue(event.data?.societyPopulation, 0))),
    birthRate: numberValue(event.data?.birthRate, 0),
    deathRate: numberValue(event.data?.deathRate, 0),
    naturalGrowth: numberValue(event.data?.naturalGrowth, 0),
    unemployment: clamp(numberValue(event.data?.societyUnemployment, 20)),
    inequality: clamp(numberValue(event.data?.societyInequality, 25)),
    classTension: clamp(numberValue(event.data?.classTension, 20)),
    culturalTension: clamp(numberValue(event.data?.culturalTension, 20)),
    radicalization: clamp(numberValue(event.data?.societyRadicalization, 15)),
    loyalty: clamp(numberValue(event.data?.societyLoyalty, 55)),
    migrationPressure: clamp(numberValue(event.data?.societyMigrationPressure, 20)),
    specialistShare: clamp(numberValue(event.data?.specialistShare, 20)),
    eliteShare: clamp(numberValue(event.data?.eliteShare, 2)),
    lastUpdatedHour: numberValue(event.data?.societyLastUpdatedHour, event.atHour)
  };
}

function deriveSociety(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  birthRate: number,
  deathRate: number
): LiveSocietyState {
  const groups = groupsForCivilization(state, civilization.id);
  const population = groups.reduce((sum, group) => sum + group.population, 0);
  const economy = economyForCivilization(state, context, civilization.id);
  const culture = cultureSummaryForCivilization(state, context, civilization.id);
  const radicalization = weightedAverage(groups, (group) => group.radicalization, 15);
  const loyalty = weightedAverage(groups, (group) => group.loyalty, 55);
  const migrationPressure = weightedAverage(groups, (group) => group.migrationDesire, 20);
  const specialistPopulation = groups
    .filter((group) => group.socialClass === 'specialists')
    .reduce((sum, group) => sum + group.population, 0);
  const elitePopulation = groups
    .filter((group) => group.socialClass === 'elite')
    .reduce((sum, group) => sum + group.population, 0);
  const inequality = economy?.inequality ?? 25;
  const unemployment = economy?.unemployment ?? 20;
  const classTension = clamp(
    unemployment * 0.34 +
    inequality * 0.3 +
    radicalization * 0.24 +
    (100 - loyalty) * 0.12
  );
  return {
    civilizationId: civilization.id,
    population,
    birthRate,
    deathRate,
    naturalGrowth: birthRate - deathRate,
    unemployment,
    inequality,
    classTension,
    culturalTension: culture.tension,
    radicalization,
    loyalty,
    migrationPressure,
    specialistShare: population > 0 ? specialistPopulation / population * 100 : 0,
    eliteShare: population > 0 ? elitePopulation / population * 100 : 0,
    lastUpdatedHour: state.clock.absoluteHour
  };
}

export function liveSocieties(
  state: SimulationState,
  context: SimulationContext
): LiveSocietyState[] {
  const byCivilization = new Map<string, LiveSocietyState>();
  for (const civilization of context.galaxy.civilizations) {
    byCivilization.set(civilization.id, deriveSociety(state, civilization, context, 0, 0));
  }
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(STATE_TAG)) continue;
    const society = societyFromEvent(event);
    if (society) byCivilization.set(society.civilizationId, society);
  }
  return [...byCivilization.values()];
}

export function societyForCivilization(
  state: SimulationState,
  context: SimulationContext,
  civilizationId: string
): LiveSocietyState | undefined {
  return liveSocieties(state, context).find((entry) => entry.civilizationId === civilizationId);
}

function writeSocietySnapshot(
  state: SimulationState,
  society: LiveSocietyState,
  systemIds: string[],
  atHour: number
): void {
  const event: WorldEvent = {
    id: `state_society_${society.civilizationId}`,
    atHour,
    kind: 'demography',
    title: 'Состояние общества',
    summary: 'Служебный снимок демографии, классов и общественного напряжения.',
    severity: 0,
    visibility: 'hidden',
    systemIds,
    civilizationIds: [society.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', STATE_TAG, 'state-snapshot'],
    data: {
      societyCivilizationId: society.civilizationId,
      societyPopulation: society.population,
      birthRate: society.birthRate,
      deathRate: society.deathRate,
      naturalGrowth: society.naturalGrowth,
      societyUnemployment: society.unemployment,
      societyInequality: society.inequality,
      classTension: society.classTension,
      culturalTension: society.culturalTension,
      societyRadicalization: society.radicalization,
      societyLoyalty: society.loyalty,
      societyMigrationPressure: society.migrationPressure,
      specialistShare: society.specialistShare,
      eliteShare: society.eliteShare,
      societyLastUpdatedHour: atHour
    }
  };
  state.events = [
    event,
    ...state.events.filter(
      (entry) => !(entry.tags.includes(STATE_TAG) && entry.data?.societyCivilizationId === society.civilizationId)
    )
  ].slice(0, 8_500);
}

function shortagePressure(settlement: SettlementState): number {
  return clamp(VITAL_RESOURCES.reduce((sum, resource) => {
    const days = stockDays(settlement, resource);
    return sum + (days < 7 ? 25 : days < 20 ? 12 : days < 45 ? 4 : 0);
  }, 0));
}

function updateGroup(
  group: PopulationGroupState,
  settlement: SettlementState,
  annualGrowth: number,
  years: number,
  unemployment: number,
  inequality: number,
  culturalTension: number
): PopulationGroupState {
  const classGrowth = group.socialClass === 'migrants'
    ? annualGrowth * 0.5
    : group.socialClass === 'elite'
      ? annualGrowth * 0.7
      : annualGrowth;
  const population = Math.max(0, Math.round(group.population * (1 + classGrowth * years)));
  const classWealthDelta = group.socialClass === 'elite'
    ? inequality * 0.035
    : group.socialClass === 'specialists'
      ? -unemployment * 0.015 + 0.8
      : -unemployment * 0.04 - inequality * 0.018;
  const pressure = unemployment * 0.16 + inequality * 0.08 + culturalTension * 0.08;
  const protection = group.health * 0.08 + group.loyalty * 0.05;
  return {
    ...group,
    population,
    wealth: clamp(group.wealth + classWealthDelta),
    health: clamp(group.health + (settlement.health - group.health) * 0.16),
    loyalty: clamp(
      group.loyalty +
      (settlement.security - settlement.unrest - group.loyalty) * 0.08 -
      unemployment * 0.025 -
      culturalTension * 0.018
    ),
    radicalization: clamp(group.radicalization + pressure * 0.06 - protection * 0.035),
    migrationDesire: clamp(
      group.migrationDesire +
      settlement.unrest * 0.05 +
      unemployment * 0.05 +
      shortagePressure(settlement) * 0.08 -
      settlement.housing * 0.035
    )
  };
}

function applyClassMobility(
  state: SimulationState,
  settlement: SettlementState,
  civilization: Civilization,
  atHour: number
): void {
  const workers = Object.values(state.populationGroups).find(
    (group) => group.settlementId === settlement.id && group.socialClass === 'workers'
  );
  const specialists = Object.values(state.populationGroups).find(
    (group) => group.settlementId === settlement.id && group.socialClass === 'specialists'
  );
  const research = state.civilizations[civilization.id]?.research ?? 30;
  if (workers && specialists && research >= 55 && settlement.infrastructure >= 55) {
    const move = Math.min(
      workers.population,
      Math.max(0, Math.round(workers.population * (research - 50) / 1_200))
    );
    if (move > 0) {
      workers.population -= move;
      specialists.population += move;
      specialists.wealth = clamp(specialists.wealth + 0.5);
      state.populationGroups[workers.id] = workers;
      state.populationGroups[specialists.id] = specialists;
    }
  }

  const existingElite = Object.values(state.populationGroups).find(
    (group) => group.settlementId === settlement.id && group.socialClass === 'elite'
  );
  if (!existingElite && specialists && settlement.population >= 25_000 && settlement.infrastructure >= 62) {
    const elitePopulation = Math.max(50, Math.round(settlement.population * 0.012));
    const transferred = Math.min(specialists.population, elitePopulation);
    if (transferred > 0) {
      specialists.population -= transferred;
      state.populationGroups[specialists.id] = specialists;
      const elite: PopulationGroupState = {
        id: `population_${settlement.id}_elite`,
        settlementId: settlement.id,
        civilizationId: civilization.id,
        species: specialists.species,
        culture: specialists.culture,
        socialClass: 'elite',
        profession: 'управление, собственность и высшие институты',
        population: transferred,
        wealth: 88,
        health: clamp(settlement.health + 10),
        loyalty: clamp(70 - settlement.unrest * 0.35),
        radicalization: clamp(settlement.unrest * 0.28),
        migrationDesire: clamp(20 + settlement.unrest * 0.18)
      };
      state.populationGroups[elite.id] = elite;
    }
  }

  state.settlements[settlement.id] = {
    ...state.settlements[settlement.id]!,
    lastUpdatedHour: atHour
  };
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

function damageProduction(
  state: SimulationState,
  civilizationId: string,
  multiplier: number,
  atHour: number
): void {
  for (const settlement of settlementsForCivilization(state, civilizationId)) {
    state.settlements[settlement.id] = {
      ...settlement,
      production: Object.fromEntries(
        Object.entries(settlement.production).map(([resource, value]) => [resource, Math.max(0, value * multiplier)])
      ) as SettlementState['production'],
      unrest: clamp(settlement.unrest + (1 - multiplier) * 35),
      security: clamp(settlement.security - (1 - multiplier) * 18),
      infrastructure: clamp(settlement.infrastructure - (1 - multiplier) * 10),
      lastUpdatedHour: atHour
    };
  }
}

export function simulatePopulationCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const previous = societyForCivilization(state, context, civilization.id);
  if (previous && previous.lastUpdatedHour > 0 && atHour - previous.lastUpdatedHour < 120 * 24) {
    return null;
  }
  const settlements = settlementsForCivilization(state, civilization.id);
  if (!settlements.length) return null;
  const economy = economyForCivilization(state, context, civilization.id);
  const culture = cultureSummaryForCivilization(state, context, civilization.id);
  const elapsedYears = clamp(
    (atHour - (previous?.lastUpdatedHour ?? state.clock.absoluteHour)) / HOURS_PER_YEAR,
    0.02,
    0.75
  );

  let weightedBirthRate = 0;
  let weightedDeathRate = 0;
  let weight = 0;
  for (const settlement of settlements) {
    const pressure = shortagePressure(settlement);
    const birthRate = clamp(
      9 + settlement.health * 0.11 + settlement.housing * 0.08 +
      (economy?.consumerSupply ?? 40) * 0.025 - pressure * 0.08,
      3,
      34
    );
    const deathRate = clamp(
      4 + (100 - settlement.health) * 0.12 + pressure * 0.13 + settlement.unrest * 0.035,
      2,
      48
    );
    const annualGrowth = (birthRate - deathRate) / 1_000;
    weightedBirthRate += birthRate * settlement.population;
    weightedDeathRate += deathRate * settlement.population;
    weight += settlement.population;

    const groupIds = Object.values(state.populationGroups)
      .filter((group) => group.settlementId === settlement.id)
      .map((group) => group.id);
    for (const groupId of groupIds) {
      const group = state.populationGroups[groupId];
      if (!group) continue;
      state.populationGroups[groupId] = updateGroup(
        group,
        settlement,
        annualGrowth,
        elapsedYears,
        economy?.unemployment ?? 20,
        economy?.inequality ?? 25,
        culture.tension
      );
    }
    applyClassMobility(state, settlement, civilization, atHour);
    const population = Object.values(state.populationGroups)
      .filter((group) => group.settlementId === settlement.id)
      .reduce((sum, group) => sum + group.population, 0);
    state.settlements[settlement.id] = {
      ...state.settlements[settlement.id]!,
      population,
      health: clamp(settlement.health - pressure * 0.025 + (economy?.consumerSupply ?? 40) * 0.01),
      housing: clamp(settlement.housing - Math.max(0, annualGrowth) * 25 + Math.max(0, -annualGrowth) * 8),
      abandoned: population <= 0,
      lastUpdatedHour: atHour
    };
  }

  const birthRate = weight > 0 ? weightedBirthRate / weight : 0;
  const deathRate = weight > 0 ? weightedDeathRate / weight : 0;
  const society = {
    ...deriveSociety(state, civilization, context, birthRate, deathRate),
    lastUpdatedHour: atHour
  };
  const systems = [...new Set(settlements.map((settlement) => settlement.systemId))];
  writeSocietySnapshot(state, society, systems, atHour);

  const civilizationState = state.civilizations[civilization.id];
  if (civilizationState) {
    civilizationState.population = society.population;
    civilizationState.cohesion = clamp(
      civilizationState.cohesion - society.classTension * 0.025 - society.culturalTension * 0.02 + society.loyalty * 0.025
    );
    civilizationState.stability = clamp(
      civilizationState.stability - Math.max(0, society.classTension - 55) * 0.035
    );
    civilizationState.expansionPressure = clamp(
      civilizationState.expansionPressure + society.migrationPressure * 0.035
    );
    civilizationState.lastUpdatedHour = atHour;
  }

  const government = context.factions.find(
    (faction) => faction.civilizationId === civilization.id && faction.kind === 'government'
  ) ?? context.factions.find((faction) => faction.civilizationId === civilization.id);
  const rng = createRng(`${context.seed}:population:${civilization.id}:${Math.floor(atHour / HOURS_PER_YEAR)}`);

  if (
    society.classTension >= 88 &&
    society.radicalization >= 72 &&
    society.loyalty <= 32 &&
    !recentPublicEvent(state, civilization.id, 'social-revolt', atHour, socialConflictCooldownYears('social-revolt'))
  ) {
    damageProduction(state, civilization.id, 0.68, atHour);
    return {
      kind: 'conflict',
      title: `${civilization.name}: массовое восстание`,
      summary: `Классовое напряжение ${Math.round(society.classTension)}/100; радикализация ${Math.round(society.radicalization)}/100. Часть городов перестала подчиняться центральной власти.`,
      severity: 9,
      visibility: 'public',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: government ? [government.id] : [],
      tags: ['simulation', 'living-history', 'living-society', 'social-revolt', 'civil-conflict'],
      data: {
        classTension: society.classTension,
        radicalization: society.radicalization,
        loyalty: society.loyalty,
        population: society.population
      }
    };
  }

  if (
    (society.classTension >= 72 || society.radicalization >= 68) &&
    !recentPublicEvent(state, civilization.id, 'urban-riots', atHour, socialConflictCooldownYears('urban-riots'))
  ) {
    damageProduction(state, civilization.id, 0.82, atHour);
    return {
      kind: 'conflict',
      title: `${civilization.name}: городские беспорядки`,
      summary: `Безработица ${Math.round(society.unemployment)}/100; неравенство ${Math.round(society.inequality)}/100; лояльность ${Math.round(society.loyalty)}/100.`,
      severity: 7,
      visibility: 'local',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: government ? [government.id] : [],
      tags: ['simulation', 'living-history', 'living-society', 'urban-riots', 'social-conflict'],
      data: {
        classTension: society.classTension,
        unemployment: society.unemployment,
        inequality: society.inequality,
        radicalization: society.radicalization
      }
    };
  }

  if (
    society.unemployment >= 20 &&
    society.classTension >= 55 &&
    rng.chance(0.4) &&
    !recentPublicEvent(state, civilization.id, 'general-strike', atHour, socialConflictCooldownYears('general-strike'))
  ) {
    damageProduction(state, civilization.id, 0.9, atHour);
    return {
      kind: 'economy',
      title: `${civilization.name}: всеобщая забастовка`,
      summary: `Рабочие остановили часть производства. Безработица ${Math.round(society.unemployment)}/100; классовое напряжение ${Math.round(society.classTension)}/100.`,
      severity: 6,
      visibility: 'local',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: government ? [government.id] : [],
      tags: ['simulation', 'living-history', 'living-society', 'general-strike', 'social-conflict'],
      data: {
        classTension: society.classTension,
        unemployment: society.unemployment,
        inequality: society.inequality
      }
    };
  }

  if (
    previous &&
    previous.classTension >= 60 &&
    society.classTension <= 48 &&
    society.loyalty >= 55 &&
    !recentPublicEvent(state, civilization.id, 'social-reform', atHour, socialConflictCooldownYears('social-reform'))
  ) {
    for (const group of groupsForCivilization(state, civilization.id)) {
      if (group.socialClass === 'workers' || group.socialClass === 'migrants') {
        group.wealth = clamp(group.wealth + 5);
        group.loyalty = clamp(group.loyalty + 7);
        group.radicalization = clamp(group.radicalization - 8);
        state.populationGroups[group.id] = group;
      }
    }
    return {
      kind: 'politics',
      title: `${civilization.name}: социальная реформа`,
      summary: `Государство снизило классовое напряжение до ${Math.round(society.classTension)}/100 и расширило доступ к образованию, медицине и труду.`,
      severity: 5,
      visibility: 'public',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: government ? [government.id] : [],
      tags: ['simulation', 'living-history', 'living-society', 'social-reform'],
      data: {
        classTension: society.classTension,
        specialistShare: society.specialistShare,
        loyalty: society.loyalty
      }
    };
  }

  if (
    society.deathRate - society.birthRate >= 8 &&
    !recentPublicEvent(state, civilization.id, 'demographic-decline', atHour, socialConflictCooldownYears('demographic-decline'))
  ) {
    return {
      kind: 'demography',
      title: `${civilization.name}: демографический спад`,
      summary: `Рождаемость ${society.birthRate.toFixed(1)}‰; смертность ${society.deathRate.toFixed(1)}‰. Население сокращается.`,
      severity: 6,
      visibility: 'local',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: government ? [government.id] : [],
      tags: ['simulation', 'living-history', 'living-society', 'demographic-decline'],
      data: {
        birthRate: society.birthRate,
        deathRate: society.deathRate,
        naturalGrowth: society.naturalGrowth,
        population: society.population
      }
    };
  }

  return null;
}
