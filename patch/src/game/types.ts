export type DangerLevel = 'safe' | 'caution' | 'danger' | 'extreme';
export type StarClass = 'M' | 'K' | 'G' | 'F' | 'A' | 'B' | 'O' | 'WHITE_DWARF' | 'NEUTRON' | 'BLACK_HOLE';
export type PlanetType = 'rocky' | 'ocean' | 'desert' | 'ice' | 'gas' | 'toxic' | 'jungle' | 'artificial' | 'anomalous';
export type CivilizationStatus = 'living' | 'dead' | 'hidden';
export type DiscoveryKind = 'signal' | 'ruin' | 'biosphere' | 'artifact' | 'settlement' | 'anomaly';

export interface GalaxySettings {
  seed: string;
  systemCount: number;
  historyYears: number;
  civilizationCount: number;
  lifeFrequency: number;
  anomalyFrequency: number;
  difficulty: 'explorer' | 'standard' | 'brutal';
}

export interface Coordinates { x: number; y: number; }

export interface Planet {
  id: string;
  name: string;
  type: PlanetType;
  orbit: number;
  moons: number;
  habitability: number;
  danger: DangerLevel;
  hasLife: boolean;
  civilizationId?: string;
  pointsOfInterest: number;
  scanned: boolean;
  imageKey: string;
}

export interface StarSystem {
  id: string;
  name: string;
  coordinates: Coordinates;
  starClass: StarClass;
  starCount: number;
  planets: Planet[];
  neighbors: string[];
  danger: DangerLevel;
  factionId?: string;
  civilizationIds: string[];
  known: boolean;
  visited: boolean;
  scanned: boolean;
  anomaly: boolean;
  region: 'core' | 'frontier' | 'deep';
}

export interface Civilization {
  id: string;
  name: string;
  speciesName: string;
  status: CivilizationStatus;
  techLevel: number;
  ideology: string;
  homeSystemId: string;
  controlledSystems: string[];
  foundedYear: number;
  endedYear?: number;
  traits: string[];
}

export interface HistoricalFigure {
  id: string;
  name: string;
  civilizationId: string;
  role: string;
  bornYear: number;
  diedYear?: number;
  importance: number;
  achievements: string[];
}

export interface HistoricalEvent {
  id: string;
  year: number;
  title: string;
  summary: string;
  civilizationIds: string[];
  systemIds: string[];
  figureIds: string[];
  consequences: string[];
}

export interface Artifact {
  id: string;
  name: string;
  kind: string;
  civilizationId: string;
  createdYear: number;
  creatorId?: string;
  ownerHistory: string[];
  value: number;
  danger: number;
  truth: string;
  publicDescription: string;
  discovered: boolean;
}

export interface Galaxy {
  id: string;
  seed: string;
  createdAt: string;
  currentYear: number;
  settings: GalaxySettings;
  systems: StarSystem[];
  civilizations: Civilization[];
  figures: HistoricalFigure[];
  history: HistoricalEvent[];
  artifacts: Artifact[];
  startSystemId: string;
}

export interface Injury {
  id: string;
  bodyPart: 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
  type: 'bruise' | 'bleeding' | 'fracture' | 'burn' | 'organ' | 'lostLimb';
  severity: number;
  permanent: boolean;
}

export interface Captain {
  id: string;
  name: string;
  level: number;
  xp: number;
  health: number;
  maxHealth: number;
  credits: number;
  reputation: number;
  skills: Record<'research' | 'archaeology' | 'trade' | 'combat' | 'crime', number>;
  injuries: Injury[];
  alive: boolean;
}

export interface ShipModule {
  id: string;
  name: string;
  slot: 'engine' | 'scanner' | 'cargo' | 'weapon' | 'utility';
  rarity: number;
  effect: string;
}

export interface Ship {
  id: string;
  name: string;
  hull: number;
  maxHull: number;
  fuel: number;
  maxFuel: number;
  jumpRange: number;
  cargoCapacity: number;
  cargo: CargoItem[];
  modules: ShipModule[];
  statuses: string[];
}

export interface CargoItem {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  value: number;
  artifactId?: string;
}

export interface Discovery {
  id: string;
  kind: DiscoveryKind;
  name: string;
  systemId: string;
  planetId?: string;
  description: string;
  confidence: number;
  year: number;
  tags: string[];
  artifactId?: string;
}

export interface GameLogEntry {
  id: string;
  year: number;
  title: string;
  text: string;
  tone: 'info' | 'good' | 'warning' | 'danger';
}


export interface SaveMetadata {
  savedAt: string;
  appVersion: string;
  sequence: number;
  reason: string;
  checksum: string;
}

export interface GameStateSnapshot {
  schemaVersion: number;
  saveMeta?: SaveMetadata;
  galaxy: Galaxy;
  captain: Captain;
  ship: Ship;
  currentSystemId: string;
  gameYear: number;
  discoveries: Discovery[];
  logs: GameLogEntry[];
}
