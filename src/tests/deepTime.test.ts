import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import { eraIndex, isSpacefaringEra } from '../deeptime/eras';

const settings = {
  seed: 'DEEP-TIME-FOUNDATION',
  systemCount: 90,
  historyYears: 2_000_000,
  civilizationCount: 30,
  lifeFrequency: 0.42,
  anomalyFrequency: 0.03,
  difficulty: 'standard' as const,
  tutorialEnabled: false
};

describe('deep time foundation', () => {
  it('generates deterministic eras, technologies, cultures and polities', async () => {
    const first = await generateGalaxy(settings);
    const second = await generateGalaxy(settings);

    expect(first.deepTime).toEqual(second.deepTime);
    expect(first.deepTime?.version).toBe(1);
    expect(first.deepTime?.species).toHaveLength(first.civilizations.length);
    expect(first.deepTime?.cultures.length).toBeGreaterThan(first.civilizations.length);
    expect(first.deepTime?.polities.length).toBeGreaterThan(0);
    expect(first.deepTime?.events.length).toBeGreaterThan(first.civilizations.length);
  });

  it('keeps civilizations at different eras instead of creating only space empires', async () => {
    const galaxy = await generateGalaxy(settings);
    const eras = new Set(galaxy.civilizations.map((civilization) => civilization.era));

    expect(eras.size).toBeGreaterThanOrEqual(4);
    expect(
      galaxy.civilizations.some(
        (civilization) =>
          civilization.era !== undefined &&
          eraIndex(civilization.era) <= eraIndex('medieval')
      )
    ).toBe(true);
    expect(
      galaxy.civilizations.some(
        (civilization) =>
          civilization.era !== undefined &&
          eraIndex(civilization.era) >= eraIndex('industrial')
      )
    ).toBe(true);
  });

  it('derives death, territory and space access from simulated development', async () => {
    const galaxy = await generateGalaxy(settings);

    for (const civilization of galaxy.civilizations) {
      expect(civilization.era).toBeDefined();
      expect(civilization.development?.era).toBe(civilization.era);
      expect(civilization.technology).toBeDefined();

      if (civilization.era && !isSpacefaringEra(civilization.era)) {
        expect(civilization.controlledSystems).toEqual([civilization.homeSystemId]);
        expect(civilization.development?.spaceAccess).toBe('none');
      }

      if (civilization.status === 'dead') {
        expect(civilization.development?.extinct).toBe(true);
        expect(civilization.endedYear).toBeDefined();
        expect(
          galaxy.deepTime?.events.some(
            (event) =>
              event.kind === 'extinction' &&
              event.civilizationIds.includes(civilization.id)
          )
        ).toBe(true);
      }
    }
  });

  it('projects simulated milestones into the public historical chronicle', async () => {
    const galaxy = await generateGalaxy(settings);
    expect(galaxy.history.length).toBe(galaxy.deepTime?.events.length);
    expect(galaxy.history.some((event) => event.id.includes('era-transition'))).toBe(true);
    expect(galaxy.history.every((event) => event.year <= 0)).toBe(true);
  });
});
