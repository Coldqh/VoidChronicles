import kernelSource from '../simulation/kernel.ts?raw';
import playerConsequencesSource from '../simulation/playerConsequences.ts?raw';
import { normalizeEcologyState } from '../ecology/integrity';
import { formatInteger } from '../ui/format';
import type { PlanetEcologyState } from '../ecology/types';
import { describe, expect, it } from 'vitest';

const ecology = {
  planetId: 'planet_test',
  climateStability: 67.999999999,
  biomass: 70.68999999998,
  biodiversity: 58.49999999,
  resilience: 44.333333333,
  contamination: 12.89999999,
  carryingCapacity: 1200.5000001,
  resources: { biomass: 64.7, medicinal: 30.2, organics: 51.9, rareCompounds: 17.1 },
  biomes: [{ id: 'b', name: 'Тест', type: 'forest', coverage: 51.4, temperature: 18.8, humidity: 62.2, productivity: 55.6, hazard: 4.1, resourceTags: [] }],
  species: [{ id: 's', name: 'Вид', biomeIds: ['b'], trophicLevel: 'producer', abundance: 73.6, resilience: 60.4, mobility: 15.2, aggression: 2.8, toxicity: 1.2, traits: [], preyIds: [], predatorIds: [], status: 'stable' }],
  pathogens: [{ id: 'p', name: 'Патоген', hostSpeciesIds: ['s'], virulence: 20.4, spread: 31.6, lethality: 8.2, active: false }],
  extinctSpeciesIds: [],
  invasiveSpeciesIds: [],
  cycle: 3.2,
  lastUpdatedHour: 100.8
} satisfies PlanetEcologyState;

describe('integer ecology boundaries', () => {
  it('normalizes every public ecology number', () => {
    const normalized = normalizeEcologyState(ecology);
    expect(normalized.biomass).toBe(71);
    expect(formatInteger(ecology.biomass)).toBe('71');
    expect([
      normalized.biomass,
      normalized.biodiversity,
      normalized.resilience,
      normalized.contamination,
      normalized.climateStability,
      normalized.carryingCapacity,
      ...Object.values(normalized.resources),
      ...normalized.biomes.flatMap((entry) => [entry.coverage, entry.temperature, entry.humidity, entry.productivity, entry.hazard]),
      ...normalized.species.flatMap((entry) => [entry.abundance, entry.resilience, entry.mobility, entry.aggression, entry.toxicity]),
      ...normalized.pathogens.flatMap((entry) => [entry.virulence, entry.spread, entry.lethality])
    ].every(Number.isInteger)).toBe(true);
  });

  it('normalizes simulation writes and old saves at the state boundary', () => {
    expect(kernelSource).toContain('normalizeEcologyState(result.ecology)');
    expect(kernelSource).toContain('[planetId]: normalizeEcologyState(next)');
    expect(kernelSource).toContain('Object.entries(');
    expect(kernelSource).toContain('normalizeEcologyState(ecology)');
    expect(playerConsequencesSource).toContain("import { normalizeEcologyState } from '../ecology/integrity';");
    expect(playerConsequencesSource).toContain('state.ecosystems[resolvedPlanetId] = normalizeEcologyState(ecology)');
  });
});
