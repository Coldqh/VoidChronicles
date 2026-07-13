import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import { generatePointsOfInterest } from '../exploration/pointsOfInterest';
import { buildHypothesis } from '../exploration/hypotheses';
import type { Evidence } from '../game/types';

describe('deep discovery generation', () => {
  it('creates deterministic causal points of interest', async () => {
    const galaxy = await generateGalaxy({
      seed: 'DISCOVERY-TEST', systemCount: 20, historyYears: 100_000,
      civilizationCount: 4, lifeFrequency: 0.35, anomalyFrequency: 0.04, difficulty: 'standard'
    });
    const system = galaxy.systems[0]!;
    const planet = system.planets[0]!;
    const first = generatePointsOfInterest(galaxy, system, planet);
    const second = generatePointsOfInterest(galaxy, system, planet);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((point) => point.origin.length > 10 && point.truth.length > point.origin.length)).toBe(true);
  });

  it('raises hypothesis confidence from independent evidence', async () => {
    const galaxy = await generateGalaxy({
      seed: 'HYPOTHESIS-TEST', systemCount: 20, historyYears: 100_000,
      civilizationCount: 4, lifeFrequency: 0.35, anomalyFrequency: 0.04, difficulty: 'standard'
    });
    const system = galaxy.systems[0]!;
    const planet = system.planets[0]!;
    const point = generatePointsOfInterest(galaxy, system, planet)[0]!;
    const one: Evidence[] = [{ id: 'e1', pointOfInterestId: point.id, systemId: system.id, planetId: planet.id, kind: 'record', title: 'A', description: 'A', reliability: 60, discoveredYear: 0, tags: [] }];
    const many: Evidence[] = [...one, { id: 'e2', pointOfInterestId: point.id, systemId: system.id, planetId: planet.id, kind: 'damage', title: 'B', description: 'B', reliability: 88, discoveredYear: 0, tags: [] }];
    expect(buildHypothesis(point, many, 0).confidence).toBeGreaterThan(buildHypothesis(point, one, 0).confidence);
  });
});
