import { describe, expect, it } from 'vitest';
import type { Civilization, Galaxy } from '../game/types';
import { causalLinksForEvent } from '../simulation/causality';
import type { SimulationContext } from '../simulation/context';
import {
  cultureSummaryForCivilization,
  liveCultures,
  simulateCultureCycle
} from '../simulation/culture';
import { simulateCivilizationDevelopmentCycle } from '../simulation/development';
import {
  economyForCivilization,
  liveEconomies,
  simulateEconomyCycle
} from '../simulation/economy';
import {
  liveSocieties,
  simulatePopulationCycle
} from '../simulation/population';
import type {
  PopulationGroupState,
  SettlementState,
  SimulationState,
  WorldEvent,
  WorldEventDraft
} from '../simulation/types';

const stockpile = (value: number) => ({
  food: value,
  water: value,
  energy: value,
  medicine: value,
  parts: value,
  weapons: value,
  luxury: value,
  rareMaterials: value
});

function settlement(id: string, population: number): SettlementState {
  return {
    id,
    name: id,
    kind: 'city',
    systemId: 'sys_home',
    civilizationId: 'civ_society',
    population,
    infrastructure: 68,
    security: 62,
    unrest: 18,
    housing: 72,
    health: 76,
    production: stockpile(35),
    consumption: stockpile(6),
    stocks: stockpile(1_200),
    foundedHour: 0,
    abandoned: false,
    lastUpdatedHour: 0
  };
}

function group(params: {
  id: string;
  settlementId: string;
  culture: string;
  socialClass: PopulationGroupState['socialClass'];
  population: number;
  wealth: number;
  loyalty?: number;
  radicalization?: number;
}): PopulationGroupState {
  return {
    id: params.id,
    settlementId: params.settlementId,
    civilizationId: 'civ_society',
    species: 'Тестовый вид',
    culture: params.culture,
    socialClass: params.socialClass,
    profession: params.socialClass === 'workers'
      ? 'производство и обслуживание'
      : params.socialClass === 'specialists'
        ? 'инженерия и медицина'
        : 'охрана и администрация',
    population: params.population,
    wealth: params.wealth,
    health: 70,
    loyalty: params.loyalty ?? 60,
    radicalization: params.radicalization ?? 15,
    migrationDesire: 20
  };
}

function fixture(): {
  civilization: Civilization;
  context: SimulationContext;
  simulation: SimulationState;
} {
  const civilization: Civilization = {
    id: 'civ_society',
    name: 'Содружество Эхо',
    speciesName: 'Эхоиды',
    status: 'living',
    techLevel: 7,
    ideology: 'гражданский федерализм',
    homeSystemId: 'sys_home',
    controlledSystems: ['sys_home'],
    foundedYear: -2_400,
    traits: ['adaptive'],
    era: 'interplanetary',
    languages: [
      { id: 'lang_echo', name: 'Эхор', script: 'линейное письмо', complexity: 62 },
      { id: 'lang_rim', name: 'Римский говор', script: 'узловая запись', complexity: 55 }
    ],
    religions: [
      { id: 'rel_sky', name: 'Небесный Завет', doctrine: 'единство общин', taboos: [], sacredObjects: [] }
    ],
    cultures: [
      { id: 'culture_echo', name: 'Эхорская культура', values: ['община', 'знание'], taboos: [], artForms: ['хоровая память'], languageId: 'lang_echo', religionIds: ['rel_sky'] },
      { id: 'culture_rim', name: 'Римская культура', values: ['автономия', 'ремесло'], taboos: [], artForms: ['резьба'], languageId: 'lang_rim', religionIds: ['rel_sky'] }
    ],
    development: {
      civilizationId: 'civ_society',
      era: 'interplanetary',
      eraStartedYear: -300,
      technology: {
        subsistence: 70,
        agriculture: 72,
        materials: 70,
        writing: 75,
        governance: 72,
        medicine: 76,
        navigation: 70,
        military: 62,
        industry: 74,
        energy: 72,
        computing: 68,
        biology: 65,
        spaceflight: 75,
        ftl: 0
      },
      population: 100_000,
      urbanization: 72,
      literacy: 82,
      industrialization: 74,
      energyUse: 68,
      ecologicalPressure: 18,
      stability: 66,
      innovation: 72,
      spaceAccess: 'interplanetary',
      regressionCount: 0,
      collapseRisk: 8,
      extinct: false
    }
  };

  const galaxy = {
    id: 'galaxy_society',
    seed: 'ECONOMY-CULTURE-SOCIETY',
    createdAt: new Date(0).toISOString(),
    currentYear: 0,
    settings: {
      seed: 'ECONOMY-CULTURE-SOCIETY',
      systemCount: 1,
      historyYears: 10_000,
      civilizationCount: 1,
      lifeFrequency: 1,
      anomalyFrequency: 0,
      difficulty: 'standard'
    },
    systems: [{
      id: 'sys_home',
      name: 'Эхо',
      coordinates: { x: 0, y: 0 },
      starClass: 'G',
      starCount: 1,
      planets: [],
      neighbors: [],
      danger: 'safe',
      civilizationIds: ['civ_society'],
      known: true,
      visited: true,
      scanned: true,
      anomaly: false,
      region: 'core'
    }],
    civilizations: [civilization],
    figures: [],
    history: [],
    artifacts: [],
    startSystemId: 'sys_home',
    deepTime: {
      version: 1,
      startYear: -10_000,
      endYear: 0,
      species: [],
      cultures: [
        { id: 'culture_echo', civilizationId: 'civ_society', name: 'Эхорская культура', originYear: -2_400, status: 'living', values: ['община', 'знание'], adaptation: 'города' },
        { id: 'culture_rim', civilizationId: 'civ_society', name: 'Римская культура', originYear: -1_300, status: 'living', values: ['автономия', 'ремесло'], adaptation: 'пограничье' }
      ],
      polities: [{
        id: 'polity_echo',
        civilizationId: 'civ_society',
        name: 'Содружество Эхо',
        form: 'interplanetary-state',
        status: 'active',
        formedYear: -600,
        capitalSystemId: 'sys_home',
        territorySystemIds: ['sys_home'],
        cultureIds: ['culture_echo', 'culture_rim'],
        population: 100_000,
        stability: 66,
        legitimacy: 64,
        military: 60
      }],
      civilizations: {},
      transitions: [],
      events: [],
      historicalSettlements: [],
      wars: [],
      migrations: [],
      discoveries: [],
      ruins: [],
      statistics: {
        generatedCivilizations: 1,
        livingCivilizations: 1,
        extinctCivilizations: 0,
        hiddenCivilizations: 0,
        preSpaceCivilizations: 0,
        spacefaringCivilizations: 1,
        transitions: 0,
        regressions: 0,
        events: 0
      }
    }
  } as Galaxy;

  const context: SimulationContext = {
    seed: galaxy.seed,
    galaxy,
    factions: [{
      id: 'faction_government',
      name: 'Федеральный совет',
      kind: 'government',
      civilizationId: 'civ_society',
      disposition: 'neutral',
      reputation: 0,
      wealth: 65,
      military: 55,
      research: 68,
      laws: [],
      allies: [],
      enemies: [],
      memories: []
    }],
    hubs: []
  };

  const settlementA = settlement('settlement_a', 60_000);
  const settlementB = settlement('settlement_b', 40_000);
  const populationGroups: Record<string, PopulationGroupState> = {
    group_a_workers: group({ id: 'group_a_workers', settlementId: 'settlement_a', culture: 'Эхорская культура', socialClass: 'workers', population: 36_000, wealth: 38 }),
    group_a_specialists: group({ id: 'group_a_specialists', settlementId: 'settlement_a', culture: 'Эхорская культура', socialClass: 'specialists', population: 18_000, wealth: 62 }),
    group_a_security: group({ id: 'group_a_security', settlementId: 'settlement_a', culture: 'Римская культура', socialClass: 'security', population: 6_000, wealth: 52 }),
    group_b_workers: group({ id: 'group_b_workers', settlementId: 'settlement_b', culture: 'Римская культура', socialClass: 'workers', population: 25_000, wealth: 35 }),
    group_b_specialists: group({ id: 'group_b_specialists', settlementId: 'settlement_b', culture: 'Эхорская культура', socialClass: 'specialists', population: 10_000, wealth: 58 }),
    group_b_migrants: group({ id: 'group_b_migrants', settlementId: 'settlement_b', culture: 'Римская культура', socialClass: 'migrants', population: 5_000, wealth: 24 })
  };

  const simulation: SimulationState = {
    version: 3,
    clock: { absoluteHour: 0, epochYear: 0 },
    systems: {
      sys_home: {
        systemId: 'sys_home',
        population: 100_000,
        prosperity: 68,
        security: 65,
        supply: 72,
        tradePressure: 28,
        migrationPressure: 16,
        lastUpdatedHour: 0
      }
    },
    civilizations: {
      civ_society: {
        civilizationId: 'civ_society',
        population: 100_000,
        stability: 66,
        economy: 68,
        military: 60,
        research: 72,
        cohesion: 64,
        expansionPressure: 24,
        alive: true,
        lastUpdatedHour: 0
      }
    },
    factions: {
      faction_government: {
        factionId: 'faction_government',
        wealth: 65,
        military: 55,
        research: 68,
        influence: 64,
        tension: 22,
        lastUpdatedHour: 0
      }
    },
    ecosystems: {},
    settlements: {
      settlement_a: settlementA,
      settlement_b: settlementB
    },
    populationGroups,
    tradeRoutes: {
      route_internal: {
        id: 'route_internal',
        originSettlementId: 'settlement_a',
        destinationSettlementId: 'settlement_b',
        pathSystemIds: ['sys_home'],
        cargo: ['food', 'energy', 'parts'],
        capacity: 80,
        traffic: 70,
        danger: 5,
        disrupted: false,
        lastUpdatedHour: 0
      }
    },
    scheduledEvents: [],
    events: [],
    nextSequence: 1,
    lastAdvanceReason: 'test'
  };

  return { civilization, context, simulation };
}

function materialize(
  simulation: SimulationState,
  draft: WorldEventDraft,
  id: string,
  atHour: number
): WorldEvent {
  const event: WorldEvent = { ...draft, id, atHour };
  simulation.events.unshift(event);
  simulation.nextSequence += 1;
  return event;
}

describe('economy, culture and society', () => {
  it('builds industrial sectors and persists an event-sourced economy', () => {
    const { civilization, context, simulation } = fixture();
    const before = simulation.settlements.settlement_a?.production.parts ?? 0;
    simulateEconomyCycle(simulation, civilization, context, 120 * 24);
    const economy = economyForCivilization(simulation, context, civilization.id);
    expect(economy).toBeDefined();
    expect(economy?.sectors.length).toBe(9);
    expect(economy?.industrialCapacity).toBeGreaterThan(0);
    expect(simulation.events.some((event) => event.id === 'state_economy_civ_society')).toBe(true);
    expect(simulation.settlements.settlement_a?.production.parts).toBeGreaterThan(0);
    expect(simulation.settlements.settlement_a?.production.parts === before).toBe(false);
  });

  it('turns broken imports into a real supply-chain crisis', () => {
    const { civilization, context, simulation } = fixture();
    for (const settlementState of Object.values(simulation.settlements)) {
      settlementState.production = stockpile(0.1);
      settlementState.consumption = stockpile(20);
      settlementState.stocks = stockpile(2);
    }
    simulation.tradeRoutes.route_internal!.disrupted = true;
    const crisis = simulateEconomyCycle(simulation, civilization, context, 120 * 24);
    expect(crisis).toBeDefined();
    expect(crisis?.tags).toContain('industrial-blockade');
    expect(crisis?.kind).toBe('shortage');
    expect(liveEconomies(simulation, context)[0]?.importDependence).toBeGreaterThan(68);
  });

  it('keeps languages, religions and cultural tension inside the live simulation', () => {
    const { civilization, context, simulation } = fixture();
    for (const groupState of Object.values(simulation.populationGroups)) {
      groupState.radicalization = 92;
      groupState.loyalty = 18;
    }
    simulation.civilizations.civ_society!.cohesion = 10;
    const event = simulateCultureCycle(simulation, civilization, context, 150 * 24);
    const cultures = liveCultures(simulation, context, civilization.id);
    const summary = cultureSummaryForCivilization(simulation, context, civilization.id);
    expect(cultures.length).toBeGreaterThan(1);
    expect(cultures.reduce((sum, culture) => sum + culture.population, 0)).toBe(100_000);
    expect(summary.dominantLanguage?.id).toBeDefined();
    expect(summary.dominantReligions.length).toBeGreaterThan(0);
    expect(summary.tension).toBeGreaterThan(70);
    expect(event?.tags).toContain('cultural-conflict');
    expect(simulation.events.some((entry) => entry.id.startsWith('state_culture_'))).toBe(true);
  });

  it('updates demography, class mobility and settlement population consistently', () => {
    const { civilization, context, simulation } = fixture();
    const beforeSpecialists = simulation.populationGroups.group_a_specialists?.population ?? 0;
    simulatePopulationCycle(simulation, civilization, context, 180 * 24);
    const society = liveSocieties(simulation, context)[0];
    const settlementPopulation = Object.values(simulation.populationGroups)
      .filter((groupState) => groupState.settlementId === 'settlement_a')
      .reduce((sum, groupState) => sum + groupState.population, 0);
    expect(society).toBeDefined();
    expect(simulation.settlements.settlement_a?.population).toBe(settlementPopulation);
    expect((simulation.populationGroups.group_a_specialists?.population ?? 0)).toBeGreaterThan(beforeSpecialists);
    expect(simulation.events.some((entry) => entry.id === 'state_society_civ_society')).toBe(true);
  });

  it('creates strikes, riots or revolt from unemployment, inequality and radicalization', () => {
    const { civilization, context, simulation } = fixture();
    simulation.events.unshift({
      id: 'state_economy_civ_society',
      atHour: 1,
      kind: 'economy',
      title: 'Кризисная экономика',
      summary: 'Служебный снимок.',
      severity: 0,
      visibility: 'hidden',
      systemIds: ['sys_home'],
      civilizationIds: ['civ_society'],
      factionIds: [],
      tags: ['living-economy-state', 'state-snapshot'],
      data: {
        economyCivilizationId: 'civ_society',
        grossProduct: 20,
        economicGrowth: -25,
        employment: 8,
        unemployment: 92,
        inequality: 94,
        importDependence: 82,
        consumerSupply: 8,
        industrialCapacity: 20,
        treasuryFlow: 10,
        industrySectors: '',
        economyLastUpdatedHour: 1
      }
    });
    for (const groupState of Object.values(simulation.populationGroups)) {
      groupState.radicalization = 96;
      groupState.loyalty = 5;
      groupState.wealth = groupState.socialClass === 'specialists' ? 90 : 5;
    }
    simulation.civilizations.civ_society!.cohesion = 5;
    const beforeProduction = simulation.settlements.settlement_a?.production.parts ?? 0;
    const conflict = simulatePopulationCycle(simulation, civilization, context, 220 * 24);
    expect(conflict).toBeDefined();
    expect(conflict?.tags).toContain('social-revolt');
    expect(simulation.settlements.settlement_a?.production.parts).toBeLessThan(beforeProduction);
    expect(liveSocieties(simulation, context)[0]?.classTension).toBeGreaterThan(80);
  });

  it('emits one causal public event while all three societal layers advance', () => {
    const { civilization, context, simulation } = fixture();
    for (const settlementState of Object.values(simulation.settlements)) {
      settlementState.production = stockpile(0.1);
      settlementState.consumption = stockpile(20);
      settlementState.stocks = stockpile(2);
    }
    simulation.tradeRoutes.route_internal!.disrupted = true;
    const cause: WorldEvent = {
      id: 'world_war_disruption',
      atHour: 20,
      kind: 'conflict',
      title: 'Война перерезала маршрут',
      summary: 'Поставки остановлены.',
      severity: 8,
      visibility: 'public',
      systemIds: ['sys_home'],
      civilizationIds: ['civ_society'],
      factionIds: [],
      tags: ['living-war', 'logistics']
    };
    simulation.events.unshift(cause);
    const draft = simulateCivilizationDevelopmentCycle(
      simulation,
      civilization,
      context,
      240 * 24
    );
    expect(draft).toBeDefined();
    expect(draft?.tags).toContain('causal-history');
    const event = materialize(simulation, draft!, 'world_society_result', 240 * 24);
    expect(causalLinksForEvent(event).causedByEventIds).toContain('world_war_disruption');
    expect(simulation.events.some((entry) => entry.id === 'state_economy_civ_society')).toBe(true);
    expect(simulation.events.some((entry) => entry.id.startsWith('state_culture_'))).toBe(true);
    expect(simulation.events.some((entry) => entry.id === 'state_society_civ_society')).toBe(true);
  });
});
