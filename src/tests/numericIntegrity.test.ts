import { describe, expect, it } from 'vitest';
import { normalizeEcologyState } from '../ecology/integrity';
import type { PlanetEcologyState } from '../ecology/types';

const ecology: PlanetEcologyState = {
  planetId: 'planet-test',
  climateStability: 70.68999999999998,
  biomass: 70.68999999999998,
  biodiversity: 61.20000000000001,
  resilience: 58.5,
  contamination: 12.899999999,
  carryingCapacity: 1234.56,
  resources: { biomass: 65.4, medicinal: 42.9, organics: 77.1, rareCompounds: 18.8 },
  biomes: [{ id: 'biome', name: 'Test', type: 'forest', coverage: 44.5, temperature: 21.8, humidity: 77.7, productivity: 63.2, hazard: 8.9, resourceTags: [] }],
  species: [{ id: 'species', name: 'Test', biomeIds: ['biome'], trophicLevel: 'producer', abundance: 70.6, resilience: 61.4, mobility: 15.8, aggression: 2.2, toxicity: 1.7, traits: [], preyIds: [], predatorIds: [], status: 'stable' }],
  pathogens: [{ id: 'pathogen', name: 'Test', hostSpeciesIds: ['species'], virulence: 31.2, spread: 44.7, lethality: 12.8, active: false }],
  extinctSpeciesIds: [],
  invasiveSpeciesIds: [],
  cycle: 2.4,
  lastUpdatedHour: 1000.8
};

describe('ecology numeric integrity', () => {
  it('removes floating point tails from every public ecology metric', () => {
    const normalized = normalizeEcologyState(ecology);
    expect(normalized.biomass).toBe(71);
    expect(normalized.climateStability).toBe(71);
    expect(normalized.carryingCapacity).toBe(1235);
    expect(normalized.resources.medicinal).toBe(43);
    expect(normalized.biomes[0]?.coverage).toBe(45);
    expect(normalized.species[0]?.abundance).toBe(71);
    expect(normalized.pathogens[0]?.spread).toBe(45);
    expect(Object.values(normalized.resources).every(Number.isInteger)).toBe(true);
  });

  it('clamps invalid values and remains idempotent', () => {
    const broken = { ...ecology, biomass: Number.NaN, contamination: 900 };
    const once = normalizeEcologyState(broken);
    const twice = normalizeEcologyState(once);
    expect(once.biomass).toBe(0);
    expect(once.contamination).toBe(100);
    expect(twice).toEqual(once);
  });
});
