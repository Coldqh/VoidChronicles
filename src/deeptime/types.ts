export type CivilizationalEra =
  | 'pre-sapient'
  | 'tribal'
  | 'neolithic'
  | 'urban'
  | 'bronze'
  | 'iron'
  | 'medieval'
  | 'gunpowder'
  | 'industrial'
  | 'modern'
  | 'atomic'
  | 'early-space'
  | 'interplanetary'
  | 'interstellar'
  | 'advanced';

export type DeepTechnologyField =
  | 'subsistence'
  | 'agriculture'
  | 'materials'
  | 'writing'
  | 'governance'
  | 'medicine'
  | 'navigation'
  | 'military'
  | 'industry'
  | 'energy'
  | 'computing'
  | 'biology'
  | 'spaceflight'
  | 'ftl';

export type CivilizationTechnologyProfile = Record<DeepTechnologyField, number>;

export type CivilizationSpaceAccess =
  | 'none'
  | 'orbital'
  | 'interplanetary'
  | 'interstellar'
  | 'ftl';

export interface CivilizationDevelopmentState {
  civilizationId: string;
  era: CivilizationalEra;
  eraStartedYear: number;
  technology: CivilizationTechnologyProfile;
  population: number;
  urbanization: number;
  literacy: number;
  industrialization: number;
  energyUse: number;
  ecologicalPressure: number;
  stability: number;
  innovation: number;
  spaceAccess: CivilizationSpaceAccess;
  regressionCount: number;
  collapseRisk: number;
  extinct: boolean;
  extinctionYear?: number;
}

export interface DeepTimeSpeciesState {
  id: string;
  civilizationId: string;
  name: string;
  originPlanetId: string;
  biologicalOriginYear: number;
  sapienceYear: number;
  status: 'extant' | 'extinct' | 'diaspora';
  population: number;
  adaptability: number;
  cooperation: number;
  aggression: number;
  cognition: number;
  homeEnvironment: string;
}

export interface DeepTimeCultureState {
  id: string;
  civilizationId: string;
  name: string;
  originYear: number;
  endedYear?: number;
  status: 'living' | 'absorbed' | 'extinct';
  values: string[];
  adaptation: string;
  parentCultureId?: string;
}

export type DeepTimePolityForm =
  | 'band'
  | 'tribal-confederation'
  | 'city-state'
  | 'kingdom'
  | 'empire'
  | 'republic'
  | 'theocracy'
  | 'industrial-state'
  | 'planetary-union'
  | 'orbital-polity'
  | 'interplanetary-state'
  | 'stellar-state';

export interface DeepTimePolityState {
  id: string;
  civilizationId: string;
  name: string;
  form: DeepTimePolityForm;
  status: 'active' | 'collapsed' | 'absorbed' | 'exiled';
  formedYear: number;
  endedYear?: number;
  capitalSystemId: string;
  territorySystemIds: string[];
  cultureIds: string[];
  population: number;
  stability: number;
  legitimacy: number;
  military: number;
}

export interface EraTransition {
  id: string;
  civilizationId: string;
  from: CivilizationalEra;
  to: CivilizationalEra;
  year: number;
  reason: string;
  regression: boolean;
}

export type DeepTimeEventKind =
  | 'biological-origin'
  | 'sapience'
  | 'era-transition'
  | 'state-formation'
  | 'state-collapse'
  | 'settlement-founded'
  | 'settlement-destroyed'
  | 'first-contact'
  | 'technology-transfer'
  | 'trade'
  | 'war'
  | 'migration'
  | 'discovery'
  | 'regression'
  | 'collapse'
  | 'extinction';

export interface DeepTimeEvent {
  id: string;
  year: number;
  kind: DeepTimeEventKind;
  title: string;
  summary: string;
  severity: number;
  civilizationIds: string[];
  polityIds: string[];
  systemIds: string[];
  settlementIds?: string[];
  figureIds?: string[];
  artifactIds?: string[];
  tags: string[];
}

export type DeepHistoricalSettlementKind =
  | 'camp'
  | 'village'
  | 'town'
  | 'city'
  | 'capital'
  | 'fortress'
  | 'port'
  | 'industrial-city'
  | 'metropolis'
  | 'orbital-habitat'
  | 'planetary-colony'
  | 'stellar-colony';

export interface DeepHistoricalSettlement {
  id: string;
  civilizationId: string;
  polityId?: string;
  name: string;
  kind: DeepHistoricalSettlementKind;
  systemId: string;
  planetId?: string;
  foundedYear: number;
  endedYear?: number;
  status: 'active' | 'abandoned' | 'ruined' | 'conquered';
  populationPeak: number;
  populationAtEnd: number;
  cultureIds: string[];
  foundingCause: string;
  endCause?: string;
}

export interface DeepTimeWar {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  attackerPolityIds: string[];
  defenderPolityIds: string[];
  civilizationIds: string[];
  systemIds: string[];
  cause: string;
  outcome: string;
  casualties: number;
  settlementIds: string[];
  endedPolityIds: string[];
}

export interface DeepTimeMigration {
  id: string;
  civilizationId: string;
  year: number;
  sourceSettlementId?: string;
  destinationSettlementId?: string;
  population: number;
  cause: string;
  cultureIds: string[];
  createdCultureId?: string;
}

export interface DeepTechnologyDiscovery {
  id: string;
  civilizationId: string;
  polityId?: string;
  settlementId?: string;
  field: DeepTechnologyField;
  year: number;
  name: string;
  method: 'independent' | 'trade' | 'war' | 'recovery';
  sourceCivilizationId?: string;
  impact: number;
}

export interface DeepTimeRuin {
  id: string;
  settlementId: string;
  civilizationId: string;
  systemId: string;
  planetId?: string;
  createdYear: number;
  cause: string;
  integrity: number;
  remains: string[];
  artifactIds: string[];
}

export interface DeepTimeStatistics {
  generatedCivilizations: number;
  livingCivilizations: number;
  extinctCivilizations: number;
  hiddenCivilizations: number;
  preSpaceCivilizations: number;
  spacefaringCivilizations: number;
  transitions: number;
  regressions: number;
  events: number;
  settlements?: number;
  wars?: number;
  migrations?: number;
  discoveries?: number;
  ruins?: number;
  figures?: number;
  artifacts?: number;
}

export interface DeepTimeState {
  version: 1;
  startYear: number;
  endYear: number;
  species: DeepTimeSpeciesState[];
  cultures: DeepTimeCultureState[];
  polities: DeepTimePolityState[];
  civilizations: Record<string, CivilizationDevelopmentState>;
  transitions: EraTransition[];
  events: DeepTimeEvent[];
  historicalSettlements?: DeepHistoricalSettlement[];
  wars?: DeepTimeWar[];
  migrations?: DeepTimeMigration[];
  discoveries?: DeepTechnologyDiscovery[];
  ruins?: DeepTimeRuin[];
  statistics: DeepTimeStatistics;
}
