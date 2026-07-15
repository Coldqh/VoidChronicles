import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import { generateMarket, initializeLivingGalaxy } from '../world/livingGalaxy';

async function galaxy() {
  return generateGalaxy({
    seed: 'LIVING-GALAXY-TEST', systemCount: 40, historyYears: 100_000,
    civilizationCount: 5, lifeFrequency: 0.35, anomalyFrequency: 0.04, difficulty: 'standard'
  });
}

describe('living galaxy layer', () => {
  it('creates factions, civilian hubs and contracts', async () => {
    const world = await galaxy();
    const living = initializeLivingGalaxy(world);
    expect(living.factions.length).toBeGreaterThanOrEqual(6);
    expect(living.hubs.length).toBeGreaterThan(0);
    const spacefaringIds = new Set(
      world.civilizations
        .filter((civilization) => civilization.development?.spaceAccess && civilization.development.spaceAccess !== 'none')
        .map((civilization) => civilization.id)
    );
    expect(
      living.hubs.every((hub) => !hub.civilizationId || spacefaringIds.has(hub.civilizationId))
    ).toBe(true);
    expect(living.hubs.some((hub) => hub.systemId === world.startSystemId)).toBe(true);
    expect(living.hubs.some((hub) => hub.safety !== 'danger')).toBe(true);
    expect(living.contracts.length).toBeGreaterThan(0);
  });

  it('creates deterministic local markets including legal and illegal goods', async () => {
    const world = await galaxy();
    const living = initializeLivingGalaxy(world);
    const hub = living.hubs[0]!;
    const first = generateMarket(hub, 4);
    const second = generateMarket(hub, 4);
    expect(first).toEqual(second);
    expect(first.some((good) => good.illegal)).toBe(true);
    expect(first.some((good) => !good.illegal)).toBe(true);
  });
});
