import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import { initializeLivingGalaxy } from '../world/livingGalaxy';
import { advanceSimulation, initializeSimulation, upgradeSimulationEcosystems } from '../simulation/kernel';

async function world(seed: string) {
  const galaxy = await generateGalaxy({
    seed,
    systemCount: 40,
    historyYears: 100_000,
    civilizationCount: 6,
    lifeFrequency: 0.62,
    anomalyFrequency: 0.05,
    difficulty: 'standard'
  });
  const living = initializeLivingGalaxy(galaxy);
  return { galaxy, living, context: { seed: galaxy.seed, galaxy, factions: living.factions, hubs: living.hubs } };
}

describe('planetary ecosystems', () => {
  it('generates deterministic biomes, species and food-web links', async () => {
    const first = await world('ECO-DETERMINISTIC');
    const second = await world('ECO-DETERMINISTIC');
    const a = initializeSimulation(first.context);
    const b = initializeSimulation(second.context);
    expect(Object.keys(a.ecosystems).length).toBeGreaterThan(0);
    expect(a.ecosystems).toEqual(b.ecosystems);
    const ecology = Object.values(a.ecosystems)[0]!;
    expect(ecology.biomes.length).toBeGreaterThan(0);
    expect(ecology.species.length).toBeGreaterThan(0);
    expect(ecology.species.some((entry) => entry.preyIds.length > 0 || entry.predatorIds.length > 0)).toBe(true);
  });

  it('advances ecology independently and preserves future cycles', async () => {
    const generated = await world('ECO-CYCLE');
    const initial = initializeSimulation(generated.context);
    const ecologyId = Object.keys(initial.ecosystems)[0]!;
    const before = initial.ecosystems[ecologyId]!;
    const advanced = advanceSimulation(initial, generated.context, 500 * 24, 'ecology-test');
    const after = advanced.simulation.ecosystems[ecologyId]!;
    expect(after.cycle).toBeGreaterThan(before.cycle);
    expect(after.lastUpdatedHour).toBeGreaterThan(before.lastUpdatedHour);
    expect(advanced.simulation.scheduledEvents.some((entry) => entry.kind === 'ecology-cycle' && entry.entityId === ecologyId)).toBe(true);
  });

  it('upgrades a v1 simulation with ecological state without changing its clock', async () => {
    const generated = await world('ECO-UPGRADE');
    const current = initializeSimulation(generated.context, 12_345);
    const { ecosystems: _ecosystems, ...legacyData } = current;
    const legacy = { ...legacyData, version: 1 as const, scheduledEvents: legacyData.scheduledEvents.filter((entry) => entry.kind !== 'ecology-cycle') };
    const upgraded = upgradeSimulationEcosystems(legacy, generated.context);
    expect(upgraded.version).toBe(3);
    expect(upgraded.clock.absoluteHour).toBe(12_345);
    expect(Object.keys(upgraded.ecosystems).length).toBeGreaterThan(0);
    expect(upgraded.scheduledEvents.some((entry) => entry.kind === 'ecology-cycle')).toBe(true);
  });
});
