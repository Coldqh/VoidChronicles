import type { PlanetEcologyState } from './types';

const integer = (value: number, min = 0, max = 100): number =>
  Math.round(Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)));

const nonNegativeInteger = (value: number): number =>
  Math.max(0, Math.round(Number.isFinite(value) ? value : 0));

export function normalizeEcologyState(input: PlanetEcologyState): PlanetEcologyState {
  return {
    ...input,
    climateStability: integer(input.climateStability),
    biomass: integer(input.biomass),
    biodiversity: integer(input.biodiversity),
    resilience: integer(input.resilience),
    contamination: integer(input.contamination),
    carryingCapacity: nonNegativeInteger(input.carryingCapacity),
    resources: {
      biomass: integer(input.resources.biomass),
      medicinal: integer(input.resources.medicinal),
      organics: integer(input.resources.organics),
      rareCompounds: integer(input.resources.rareCompounds)
    },
    biomes: input.biomes.map((biome) => ({
      ...biome,
      coverage: integer(biome.coverage),
      temperature: Math.round(Number.isFinite(biome.temperature) ? biome.temperature : 0),
      humidity: integer(biome.humidity),
      productivity: integer(biome.productivity),
      hazard: integer(biome.hazard)
    })),
    species: input.species.map((species) => ({
      ...species,
      abundance: integer(species.abundance),
      resilience: integer(species.resilience),
      mobility: integer(species.mobility),
      aggression: integer(species.aggression),
      toxicity: integer(species.toxicity)
    })),
    pathogens: input.pathogens.map((pathogen) => ({
      ...pathogen,
      virulence: integer(pathogen.virulence),
      spread: integer(pathogen.spread),
      lethality: integer(pathogen.lethality)
    })),
    cycle: nonNegativeInteger(input.cycle),
    lastUpdatedHour: nonNegativeInteger(input.lastUpdatedHour)
  };
}
