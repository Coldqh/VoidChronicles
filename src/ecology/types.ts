export type BiomeType =
  | 'oceanic'
  | 'coastal'
  | 'forest'
  | 'grassland'
  | 'desert'
  | 'tundra'
  | 'wetland'
  | 'cavern'
  | 'volcanic'
  | 'toxic'
  | 'crystal'
  | 'aerial'
  | 'artificial';

export type TrophicLevel = 'producer' | 'grazer' | 'predator' | 'scavenger' | 'decomposer' | 'parasite';
export type SpeciesStatus = 'thriving' | 'stable' | 'declining' | 'threatened' | 'extinct';

export interface EcosystemBiome {
  id: string;
  name: string;
  type: BiomeType;
  coverage: number;
  temperature: number;
  humidity: number;
  productivity: number;
  hazard: number;
  resourceTags: string[];
}

export interface EcosystemSpecies {
  id: string;
  name: string;
  biomeIds: string[];
  trophicLevel: TrophicLevel;
  abundance: number;
  resilience: number;
  mobility: number;
  aggression: number;
  toxicity: number;
  traits: string[];
  preyIds: string[];
  predatorIds: string[];
  status: SpeciesStatus;
}

export interface EcosystemPathogen {
  id: string;
  name: string;
  hostSpeciesIds: string[];
  virulence: number;
  spread: number;
  lethality: number;
  active: boolean;
}

export interface EcosystemResources {
  biomass: number;
  medicinal: number;
  organics: number;
  rareCompounds: number;
}

export interface PlanetEcologyState {
  planetId: string;
  climateStability: number;
  biomass: number;
  biodiversity: number;
  resilience: number;
  contamination: number;
  carryingCapacity: number;
  resources: EcosystemResources;
  biomes: EcosystemBiome[];
  species: EcosystemSpecies[];
  pathogens: EcosystemPathogen[];
  extinctSpeciesIds: string[];
  invasiveSpeciesIds: string[];
  cycle: number;
  lastUpdatedHour: number;
}
