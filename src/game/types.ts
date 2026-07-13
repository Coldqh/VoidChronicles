export type DangerLevel = 'safe' | 'caution' | 'danger' | 'extreme';
export type StarClass = 'M' | 'K' | 'G' | 'F' | 'A' | 'B' | 'O' | 'WHITE_DWARF' | 'NEUTRON' | 'BLACK_HOLE';
export type PlanetType = 'rocky' | 'ocean' | 'desert' | 'ice' | 'gas' | 'toxic' | 'jungle' | 'artificial' | 'anomalous';
export type CivilizationStatus = 'living' | 'dead' | 'hidden';
export type DiscoveryKind = 'signal' | 'ruin' | 'biosphere' | 'artifact' | 'settlement' | 'anomaly';
export type ScanLevel = 0 | 1 | 2 | 3;
export type PointOfInterestType = 'ruin' | 'wreck' | 'settlement' | 'laboratory' | 'cave' | 'ancientFactory' | 'graveyard' | 'smugglerCamp' | 'anomaly' | 'biosphere' | 'distress';
export type PointOfInterestStatus = 'detected' | 'visited' | 'blocked' | 'resolved';
export type EquipmentId = 'pistol' | 'rifle' | 'armor' | 'medkit' | 'scanner' | 'cutter' | 'translator' | 'sampleContainer' | 'explosives' | 'oxygen';
export type EvidenceKind = 'record' | 'body' | 'weapon' | 'architecture' | 'sample' | 'terminal' | 'damage' | 'signal';
export type HypothesisStatus = 'tentative' | 'supported' | 'confirmed' | 'disproved';
export type CrewRole = 'pilot' | 'engineer' | 'doctor' | 'scientist' | 'archaeologist' | 'soldier' | 'diplomat' | 'biologist' | 'smuggler';
export type CrewStatus = 'active' | 'injured' | 'unpaid' | 'missing';

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
  scanLevel?: ScanLevel;
  lastScanYear?: number;
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


export interface CrewMemory {
  id: string;
  year: number;
  kind: 'hired' | 'expedition' | 'injury' | 'payment' | 'betrayal' | 'discovery';
  text: string;
  impact: number;
}

export interface CrewMember {
  id: string;
  name: string;
  species: string;
  culture: string;
  primaryRole: CrewRole;
  secondaryRole?: CrewRole;
  level: number;
  health: number;
  maxHealth: number;
  morale: number;
  loyalty: number;
  salary: number;
  sharePercent: number;
  contractYears: number;
  joinedYear: number;
  paidUntilYear: number;
  traits: string[];
  belief: string;
  status: CrewStatus;
  injuries: Injury[];
  memories: CrewMemory[];
}

export interface CrewCandidate extends CrewMember {
  signingCost: number;
  originSystemId: string;
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
  pointOfInterestId?: string;
}

export interface ScanReport {
  id: string;
  systemId: string;
  planetId?: string;
  level: ScanLevel;
  confidence: number;
  createdYear: number;
  summary: string;
  warnings: string[];
  detectedPointOfInterestIds: string[];
}

export interface PointOfInterest {
  id: string;
  systemId: string;
  planetId: string;
  name: string;
  type: PointOfInterestType;
  status: PointOfInterestStatus;
  danger: DangerLevel;
  age: number;
  civilizationId?: string;
  origin: string;
  publicSummary: string;
  truth: string;
  requiredEquipment: EquipmentId[];
  possibleRewards: string[];
  scanConfidence: number;
  visits: number;
  discoveredYear: number;
  lastVisitedYear?: number;
}

export interface ExpeditionLoadout {
  selected: EquipmentId[];
  capacity: number;
}

export interface Evidence {
  id: string;
  pointOfInterestId: string;
  systemId: string;
  planetId: string;
  kind: EvidenceKind;
  title: string;
  description: string;
  reliability: number;
  discoveredYear: number;
  tags: string[];
}

export interface EvidenceDraft {
  key: string;
  kind: EvidenceKind;
  title: string;
  description: string;
  reliability: number;
  tags: string[];
}

export interface Hypothesis {
  id: string;
  pointOfInterestId: string;
  title: string;
  summary: string;
  confidence: number;
  status: HypothesisStatus;
  evidenceIds: string[];
  updatedYear: number;
}

export interface ArtifactKnowledge {
  artifactId: string;
  level: number;
  knownFields: string[];
  notes: string[];
  revealedTruth?: string;
}

export interface ExpeditionResult {
  pointOfInterestId: string;
  crewIds: string[];
  artifact?: Artifact;
  injury?: { bodyPart: 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'; severity: number };
  evidence: EvidenceDraft[];
  outcome: 'evacuated' | 'resolved' | 'failed';
  turnsSpent: number;
  blockedReason?: string;
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
  scanReports: ScanReport[];
  pointsOfInterest: PointOfInterest[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  artifactKnowledge: ArtifactKnowledge[];
  crew: CrewMember[];
  crewCandidates: CrewCandidate[];
}
