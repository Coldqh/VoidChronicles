import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import { initializeSimulation } from '../simulation/kernel';
import {
  liveEraForCivilization,
  liveSpaceAccessForCivilization,
  simulateCivilizationDevelopmentCycle
} from '../simulation/development';
import { initializeLivingGalaxy } from '../world/livingGalaxy';
import { initializeCivilizationLayer } from '../world/civilizations';

const settings = {
  seed: 'LIVING-HISTORY-CONTINUITY',
  systemCount: 90,
  historyYears: 3_000_000,
  civilizationCount: 24,
  lifeFrequency: 0.42,
  anomalyFrequency: 0.03,
  difficulty: 'standard' as const,
  tutorialEnabled: false
};

async function fixture() {
  const generated = await generateGalaxy(settings);
  const living = initializeLivingGalaxy(generated);
  const layer = initializeCivilizationLayer(generated, living.hubs);
  const context = {
    seed: layer.galaxy.seed,
    galaxy: layer.galaxy,
    factions: living.factions,
    hubs: layer.hubs
  };
  return { context, simulation: initializeSimulation(context) };
}

describe('living history continuity', () => {
  it('projects active deep-history settlements into the live simulation', async () => {
    const { context, simulation } = await fixture();
    const activeHistorical = context.galaxy.deepTime?.historicalSettlements?.filter(
      (settlement) => settlement.status === 'active' && settlement.endedYear === undefined
    ) ?? [];

    expect(activeHistorical.length).toBeGreaterThan(0);
    for (const historical of activeHistorical) {
      const live = Object.values(simulation.settlements).find(
        (settlement) => settlement.id === `settlement_history_${historical.id}`
      );
      expect(live).toBeDefined();
      expect(live?.systemId).toBe(historical.systemId);
      expect(live?.foundedHour).toBe(historical.foundedYear * 365 * 24);
    }
  });

  it('keeps pre-space civilizations alive as planetary societies', async () => {
    const { context, simulation } = await fixture();
    const primitive = context.galaxy.civilizations.filter(
      (civilization) =>
        civilization.status === 'living' && civilization.development?.spaceAccess === 'none'
    );

    expect(primitive.length).toBeGreaterThan(0);
    for (const civilization of primitive) {
      const settlements = Object.values(simulation.settlements).filter(
        (settlement) => settlement.civilizationId === civilization.id && !settlement.abandoned
      );
      expect(settlements.length).toBeGreaterThan(0);
      expect(settlements.every((settlement) => settlement.systemId === civilization.homeSystemId)).toBe(true);
      expect(settlements.every((settlement) => settlement.kind !== 'orbital')).toBe(true);
    }
  });

  it('advances a civilization into a new era from live economic conditions', async () => {
    const { context, simulation } = await fixture();
    const civilization = context.galaxy.civilizations.find(
      (entry) => entry.status === 'living' && Object.values(simulation.settlements).some(
        (settlement) => settlement.civilizationId === entry.id
      )
    );
    expect(civilization).toBeDefined();
    if (!civilization) return;

    civilization.era = 'medieval';
    if (civilization.development) {
      civilization.development.era = 'medieval';
      civilization.development.spaceAccess = 'none';
    }
    const state = simulation.civilizations[civilization.id]!;
    state.research = 100;
    state.economy = 100;
    state.stability = 100;
    state.cohesion = 100;
    for (const settlement of Object.values(simulation.settlements)) {
      if (settlement.civilizationId !== civilization.id) continue;
      settlement.infrastructure = 100;
      settlement.health = 100;
      settlement.security = 100;
      settlement.unrest = 0;
      if (settlement.planetId && simulation.ecosystems[settlement.planetId]) {
        simulation.ecosystems[settlement.planetId]!.contamination = 0;
      }
    }

    const event = simulateCivilizationDevelopmentCycle(
      simulation,
      civilization,
      context,
      100 * 365 * 24
    );

    expect(event?.tags).toContain('era-transition');
    expect(event?.data?.previousEra).toBe('medieval');
    expect(event?.data?.era).toBe('gunpowder');
  });

  it('reads a new era and space access from persisted world events', async () => {
    const { context, simulation } = await fixture();
    const civilization = context.galaxy.civilizations.find((entry) => entry.status === 'living');
    expect(civilization).toBeDefined();
    if (!civilization) return;

    simulation.events.unshift({
      id: 'world_test_living_history',
      atHour: 200,
      kind: 'research',
      title: 'Переход эпохи',
      summary: 'Тестовая запись непрерывности.',
      severity: 8,
      visibility: 'public',
      systemIds: [civilization.homeSystemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'living-history-era', 'era-transition'],
      data: {
        era: 'interstellar',
        previousEra: 'interplanetary',
        spaceAccess: 'interstellar',
        techLevel: 10,
        regression: false
      }
    });

    expect(liveEraForCivilization(simulation, civilization)).toBe('interstellar');
    expect(liveSpaceAccessForCivilization(simulation, civilization)).toBe('interstellar');
  });

  it('can regress after a real systemic collapse', async () => {
    const { context, simulation } = await fixture();
    const civilization = context.galaxy.civilizations.find(
      (entry) => entry.status === 'living' && Object.values(simulation.settlements).some(
        (settlement) => settlement.civilizationId === entry.id
      )
    );
    expect(civilization).toBeDefined();
    if (!civilization) return;

    civilization.era = 'atomic';
    if (civilization.development) {
      civilization.development.era = 'atomic';
      civilization.development.spaceAccess = 'none';
    }
    const state = simulation.civilizations[civilization.id]!;
    state.stability = 0;
    state.cohesion = 0;
    state.research = 70;
    for (const settlement of Object.values(simulation.settlements)) {
      if (settlement.civilizationId !== civilization.id) continue;
      settlement.health = 0;
      settlement.unrest = 100;
      settlement.infrastructure = 10;
      if (settlement.planetId && simulation.ecosystems[settlement.planetId]) {
        simulation.ecosystems[settlement.planetId]!.contamination = 100;
      }
    }

    let event = null;
    for (let year = 2; year <= 40 && !event; year += 1) {
      event = simulateCivilizationDevelopmentCycle(
        simulation,
        civilization,
        context,
        year * 365 * 24
      );
    }

    expect(event?.tags).toContain('regression');
    expect(event?.data?.era).toBe('modern');
  });
});
