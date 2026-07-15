import { describe, expect, it } from 'vitest';
import type { Civilization, Galaxy } from '../game/types';
import {
  causalChain,
  causalLinksForEvent,
  causalizeDraft
} from '../simulation/causality';
import type { SimulationContext } from '../simulation/context';
import { simulateCivilizationDevelopmentCycle } from '../simulation/development';
import {
  livePolities,
  simulateLivingPolityCycle
} from '../simulation/polities';
import {
  projectContractsFromEvents,
  projectNewsFromEvents
} from '../simulation/projections';
import type {
  SettlementState,
  SimulationState,
  WorldEvent,
  WorldEventDraft
} from '../simulation/types';
import {
  liveWars,
  simulateLivingWarCycle,
  startLivingWar
} from '../simulation/war';

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

function settlement(params: {
  id: string;
  systemId: string;
  civilizationId: string;
  population: number;
}): SettlementState {
  return {
    id: params.id,
    name: params.id,
    kind: 'city',
    systemId: params.systemId,
    civilizationId: params.civilizationId,
    population: params.population,
    infrastructure: 72,
    security: 68,
    unrest: 14,
    housing: 70,
    health: 75,
    production: stockpile(30),
    consumption: stockpile(5),
    stocks: stockpile(1_000),
    foundedHour: 0,
    abandoned: false,
    lastUpdatedHour: 0
  };
}

function fixture(): {
  context: SimulationContext;
  simulation: SimulationState;
  civilizations: [Civilization, Civilization];
} {
  const civilizations = [
    {
      id: 'civ_a',
      name: 'Альфа',
      speciesName: 'Альфийцы',
      status: 'living',
      techLevel: 7,
      ideology: 'централизм',
      homeSystemId: 'sys_a',
      controlledSystems: ['sys_a'],
      foundedYear: -2_000,
      traits: ['expansionist'],
      era: 'interplanetary',
      development: {
        civilizationId: 'civ_a', era: 'interplanetary', eraStartedYear: -400,
        technology: { subsistence: 70, agriculture: 70, materials: 70, writing: 70, governance: 70, medicine: 70, navigation: 70, military: 80, industry: 70, energy: 70, computing: 70, biology: 60, spaceflight: 80, ftl: 0 },
        population: 500_000, urbanization: 70, literacy: 80, industrialization: 75, energyUse: 70,
        ecologicalPressure: 20, stability: 65, innovation: 70, spaceAccess: 'interplanetary',
        regressionCount: 0, collapseRisk: 10, extinct: false
      }
    },
    {
      id: 'civ_b',
      name: 'Бета',
      speciesName: 'Бетанцы',
      status: 'living',
      techLevel: 7,
      ideology: 'республика',
      homeSystemId: 'sys_b',
      controlledSystems: ['sys_b'],
      foundedYear: -1_800,
      traits: ['defensive'],
      era: 'interplanetary',
      development: {
        civilizationId: 'civ_b', era: 'interplanetary', eraStartedYear: -350,
        technology: { subsistence: 70, agriculture: 70, materials: 70, writing: 70, governance: 70, medicine: 70, navigation: 70, military: 75, industry: 70, energy: 70, computing: 70, biology: 60, spaceflight: 80, ftl: 0 },
        population: 450_000, urbanization: 70, literacy: 80, industrialization: 75, energyUse: 70,
        ecologicalPressure: 20, stability: 62, innovation: 68, spaceAccess: 'interplanetary',
        regressionCount: 0, collapseRisk: 12, extinct: false
      }
    }
  ] as [Civilization, Civilization];

  const galaxy = {
    id: 'galaxy_test',
    seed: 'CAUSAL-POLITY-WAR',
    createdAt: new Date(0).toISOString(),
    currentYear: 0,
    settings: {
      seed: 'CAUSAL-POLITY-WAR', systemCount: 2, historyYears: 10_000,
      civilizationCount: 2, lifeFrequency: 1, anomalyFrequency: 0,
      difficulty: 'standard'
    },
    systems: [
      {
        id: 'sys_a', name: 'А', coordinates: { x: 0, y: 0 }, starClass: 'G', starCount: 1,
        planets: [], neighbors: ['sys_b'], danger: 'caution', civilizationIds: ['civ_a'],
        known: true, visited: true, scanned: true, anomaly: false, region: 'core'
      },
      {
        id: 'sys_b', name: 'Б', coordinates: { x: 1, y: 0 }, starClass: 'K', starCount: 1,
        planets: [], neighbors: ['sys_a'], danger: 'caution', civilizationIds: ['civ_b'],
        known: true, visited: true, scanned: true, anomaly: false, region: 'core'
      }
    ],
    civilizations,
    figures: [], history: [], artifacts: [], startSystemId: 'sys_a',
    deepTime: {
      version: 1, startYear: -10_000, endYear: 0, species: [], cultures: [],
      civilizations: {}, transitions: [], events: [], historicalSettlements: [], wars: [], migrations: [], discoveries: [], ruins: [],
      polities: [
        {
          id: 'polity_a', civilizationId: 'civ_a', name: 'Держава Альфа', form: 'interplanetary-state',
          status: 'active', formedYear: -500, capitalSystemId: 'sys_a', territorySystemIds: ['sys_a'],
          cultureIds: [], population: 500_000, stability: 65, legitimacy: 67, military: 78
        },
        {
          id: 'polity_b', civilizationId: 'civ_b', name: 'Союз Бета', form: 'interplanetary-state',
          status: 'active', formedYear: -450, capitalSystemId: 'sys_b', territorySystemIds: ['sys_b'],
          cultureIds: [], population: 450_000, stability: 62, legitimacy: 64, military: 74
        }
      ],
      statistics: {
        generatedCivilizations: 2, livingCivilizations: 2, extinctCivilizations: 0,
        hiddenCivilizations: 0, preSpaceCivilizations: 0, spacefaringCivilizations: 2,
        transitions: 0, regressions: 0, events: 0
      }
    }
  } as Galaxy;

  const context: SimulationContext = {
    seed: galaxy.seed,
    galaxy,
    factions: [
      { id: 'faction_a', name: 'Правительство Альфы', kind: 'government', civilizationId: 'civ_a', disposition: 'hostile', reputation: 0, wealth: 70, military: 80, research: 60, laws: [], allies: [], enemies: ['faction_b'], memories: [] },
      { id: 'faction_b', name: 'Совет Беты', kind: 'government', civilizationId: 'civ_b', disposition: 'hostile', reputation: 0, wealth: 65, military: 75, research: 60, laws: [], allies: [], enemies: ['faction_a'], memories: [] }
    ],
    hubs: []
  };

  const simulation: SimulationState = {
    version: 3,
    clock: { absoluteHour: 0, epochYear: 0 },
    systems: {
      sys_a: { systemId: 'sys_a', population: 500_000, prosperity: 70, security: 70, supply: 78, tradePressure: 25, migrationPressure: 10, lastUpdatedHour: 0 },
      sys_b: { systemId: 'sys_b', population: 450_000, prosperity: 68, security: 68, supply: 74, tradePressure: 25, migrationPressure: 10, lastUpdatedHour: 0 }
    },
    civilizations: {
      civ_a: { civilizationId: 'civ_a', population: 500_000, stability: 65, economy: 72, military: 82, research: 70, cohesion: 66, expansionPressure: 35, alive: true, lastUpdatedHour: 0 },
      civ_b: { civilizationId: 'civ_b', population: 450_000, stability: 62, economy: 68, military: 76, research: 68, cohesion: 64, expansionPressure: 30, alive: true, lastUpdatedHour: 0 }
    },
    factions: {
      faction_a: { factionId: 'faction_a', wealth: 70, military: 80, research: 60, influence: 70, tension: 92, lastUpdatedHour: 0 },
      faction_b: { factionId: 'faction_b', wealth: 65, military: 75, research: 60, influence: 65, tension: 90, lastUpdatedHour: 0 }
    },
    ecosystems: {},
    settlements: {
      settlement_a: settlement({ id: 'settlement_a', systemId: 'sys_a', civilizationId: 'civ_a', population: 500_000 }),
      settlement_b: settlement({ id: 'settlement_b', systemId: 'sys_b', civilizationId: 'civ_b', population: 450_000 })
    },
    populationGroups: {},
    tradeRoutes: {
      route_ab: {
        id: 'route_ab', originSettlementId: 'settlement_a', destinationSettlementId: 'settlement_b',
        pathSystemIds: ['sys_a', 'sys_b'], cargo: ['food', 'parts'], capacity: 70,
        traffic: 75, danger: 10, disrupted: false, lastUpdatedHour: 0
      }
    },
    scheduledEvents: [],
    events: [],
    nextSequence: 1,
    lastAdvanceReason: 'test'
  };

  return { context, simulation, civilizations };
}

function materializeDraft(
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

describe('causal history, living polities and war', () => {
  it('projects active deep-time states into live polity records', () => {
    const { context, simulation } = fixture();
    const polities = livePolities(simulation, context);
    expect(polities.map((entry) => entry.id)).toEqual(expect.arrayContaining(['polity_a', 'polity_b']));
    expect(polities.every((entry) => entry.status === 'active')).toBe(true);
    expect(polities.find((entry) => entry.id === 'polity_a')?.capitalSystemId).toBe('sys_a');
  });

  it('stores bidirectional cause and result links without changing the save schema', () => {
    const { simulation } = fixture();
    const cause: WorldEvent = {
      id: 'world_cause', atHour: 10, kind: 'shortage', title: 'Дефицит', summary: 'Снабжение нарушено.',
      severity: 7, visibility: 'public', systemIds: ['sys_a'], civilizationIds: ['civ_a'], factionIds: [],
      tags: ['simulation', 'shortage']
    };
    simulation.events.push(cause);
    const draft = causalizeDraft(simulation, {
      kind: 'politics', title: 'Кризис власти', summary: 'Дефицит вызвал кризис.', severity: 8,
      visibility: 'public', systemIds: ['sys_a'], civilizationIds: ['civ_a'], factionIds: [], tags: ['living-polity']
    }, {
      causeEventIds: [cause.id], changedEntityIds: ['polity_a'], prospectiveEventId: 'world_result'
    });
    const result = materializeDraft(simulation, draft, 'world_result', 20);
    expect(causalLinksForEvent(result).causedByEventIds).toEqual(['world_cause']);
    expect(causalLinksForEvent(cause).resultedInEventIds).toEqual(['world_result']);
    expect(causalChain(simulation, result.id, 'causes').map((entry) => entry.id)).toEqual(['world_cause']);
  });

  it('persists live polity metrics as hidden event-sourced snapshots', () => {
    const { context, simulation, civilizations } = fixture();
    simulateLivingPolityCycle(simulation, civilizations[0], context, 90 * 24);
    const projected = livePolities(simulation, context).find((entry) => entry.id === 'polity_a');
    expect(projected).toBeDefined();
    expect(simulation.events.some((event) => event.id === 'state_polity_polity_a')).toBe(true);
    expect(projected?.lastUpdatedHour).toBe(90 * 24);
    expect(projected?.treasury).toBeGreaterThan(0);
  });


  it('keeps hidden state snapshots out of news and generated contracts', () => {
    const { simulation } = fixture();
    const hidden: WorldEvent = {
      id: 'state_polity_polity_a', atHour: 40, kind: 'politics', title: 'Снимок государства', summary: 'Внутреннее состояние.',
      severity: 0, visibility: 'hidden', systemIds: ['sys_a'], civilizationIds: ['civ_a'], factionIds: [],
      tags: ['living-polity-state', 'state-snapshot']
    };
    const publicConflict: WorldEvent = {
      id: 'world_public_conflict', atHour: 50, kind: 'conflict', title: 'Бой на границе', summary: 'Фронт перешёл в активную фазу.',
      severity: 7, visibility: 'public', systemIds: ['sys_b'], civilizationIds: ['civ_a', 'civ_b'], factionIds: [],
      tags: ['living-war', 'battle']
    };
    const news = projectNewsFromEvents(
      [hidden, publicConflict],
      { version: 1, records: {} },
      [],
      'sys_a'
    );
    const contracts = projectContractsFromEvents({
      events: [hidden, publicConflict],
      existing: [],
      hubs: [{ id: 'hub_a', systemId: 'sys_a', factionId: 'faction_a', safety: 'safe' }],
      year: 0
    });
    expect(news.map((entry) => entry.id)).toEqual(['news_from_world_public_conflict']);
    expect(contracts.map((entry) => entry.id)).toEqual(['contract_from_world_public_conflict']);
    expect(simulation.events).toEqual([]);
  });

  it('creates a war, damages the front and disrupts logistics', () => {
    const { context, simulation, civilizations } = fixture();
    const [attacker, defender] = livePolities(simulation, context);
    expect(attacker).toBeDefined();
    expect(defender).toBeDefined();
    if (!attacker || !defender) return;
    attacker.military = 100;
    attacker.mobilization = 100;
    defender.military = 30;

    const declaration = startLivingWar(simulation, attacker, defender, context, 100, []);
    const declarationEvent = materializeDraft(simulation, declaration, 'world_declaration', 100);
    expect(declarationEvent.tags).toContain('war-declaration');
    expect(liveWars(simulation)[0]?.status).toBe('active');

    const beforePopulation = simulation.settlements.settlement_b?.population ?? 0;
    const defenderTick = simulateLivingWarCycle(simulation, civilizations[1], context, 100 + 50 * 24);
    expect(defenderTick).toBe(null);
    expect(simulation.settlements.settlement_b?.population).toBe(beforePopulation);
    const battle = simulateCivilizationDevelopmentCycle(simulation, civilizations[0], context, 100 + 50 * 24);
    expect(battle?.tags).toContain('living-war');
    const activeWar = liveWars(simulation)[0];
    expect(activeWar?.casualties).toBeGreaterThan(0);
    expect(simulation.settlements.settlement_b?.population).toBeLessThan(beforePopulation);
    expect(simulation.tradeRoutes.route_ab?.disrupted).toBe(true);
    expect(simulation.systems.sys_b?.supply).toBeLessThan(74);
    if (battle) materializeDraft(simulation, battle, 'world_battle_1', 100 + 50 * 24);
    for (let step = 2; step <= 8 && simulation.settlements.settlement_b?.ownerFactionId !== 'faction_a'; step += 1) {
      const atHour = 100 + step * 50 * 24;
      const nextBattle = simulateCivilizationDevelopmentCycle(simulation, civilizations[0], context, atHour);
      if (nextBattle) materializeDraft(simulation, nextBattle, `world_battle_${step}`, atHour);
    }
    expect(simulation.settlements.settlement_b?.ownerFactionId).toBe('faction_a');
    expect(livePolities(simulation, context).find((entry) => entry.id === attacker.id)?.territorySystemIds).toContain('sys_b');
  });
});
