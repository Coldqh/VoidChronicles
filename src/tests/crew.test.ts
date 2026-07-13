import { describe, expect, it } from 'vitest';
import { generateCrewCandidates } from '../crew/generateCrew';
import { generateGalaxy } from '../generation/generateGalaxy';

const settings = { seed: 'CREW-TEST', systemCount: 30, historyYears: 100000, civilizationCount: 4, lifeFrequency: 0.3, anomalyFrequency: 0.02, difficulty: 'standard' as const };

describe('crew generation', () => {
  it('is deterministic for the same system and time window', async () => {
    const galaxy = await generateGalaxy(settings);
    const system = galaxy.systems[0];
    expect(generateCrewCandidates(galaxy.seed, system, 4)).toEqual(generateCrewCandidates(galaxy.seed, system, 4));
  });

  it('creates valid contracts and distinct candidate ids', async () => {
    const galaxy = await generateGalaxy(settings);
    const candidates = generateCrewCandidates(galaxy.seed, galaxy.systems[0], 8, 4);
    expect(new Set(candidates.map((entry) => entry.id)).size).toBe(4);
    expect(candidates.every((entry) => entry.salary > 0 && entry.signingCost >= entry.salary)).toBe(true);
  });
});
