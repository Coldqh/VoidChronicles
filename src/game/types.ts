import type { PlayerKnowledgeState, SimulationState } from '../simulation/types';
import type {
  CivilizationDevelopmentState,
  CivilizationTechnologyProfile,
  CivilizationalEra,
  DeepTimeState
} from '../deeptime/types';

export type DangerLevel = 'safe' | 'caution' | 'danger' | 'extreme';
export type StarClass = 'M' | 'K' | 'G' | 'F' | 'A' | 'B' | 'O' | 'WHITE_DWARF' | 'NEUTRON' | 'BLACK_HOLE';
export type PlanetType = 'rocky' | 'ocean' | 'desert' | 'ice' | 'gas' | 'toxic' | 'jungle' | 'artificial' | 'anomalous';
export type CivilizationStatus = 'living' | 'dead' | 'hidden';
export type DiscoveryKind = 'signal' | 'ruin' | 'biosphere' | 'artifact' | 'settlement' | 'anomaly';
export type ScanLevel = 0 | 1 | 2 | 3;
export type PointOfInterestType = 'ruin' | 'wreck' | 'settlement' | 'laboratory' | 'cave' | 'ancientFactory' | 'graveyard' | 'smugglerCamp' | 'anomaly' | 'biosphere' | 'distress';
export type PointOfInterestStatus = 'detected' | 'visited' | 'blocked' | 'resolved';
export type PointOfInterestAccess = 'surface' | 'orbital' | 'remote';
export type EquipmentId = 'pistol' | 'rifle' | 'armor' | 'medkit' | 'scanner' | 'cutter' | 'translator' | 'sampleContainer' | 'explosives' | 'oxygen';
export type EvidenceKind = 'record' | 'body' | 'weapon' | 'architecture' | 'sample' | 'terminal' | 'damage' | 'signal';
export type HypothesisStatus = 'tentative' | 'supported' | 'confirmed' | 'disproved';
export type CrewRole = 'pilot' | 'engineer' | 'doctor' | 'scientist' | 'archaeologist' | 'soldier' | 'diplomat' | 'biologist' | 'smuggler';
export type CrewStatus = 'active' | 'injured' | 'unpaid' | 'missing' | 'deceased';
export type CaptainCondition = 'active' | 'dead' | 'missing' | 'captured' | 'coma' | 'stranded' | 'retired';
export type CommandIdentity = 'organic';
export type LegacyMode = 'active' | 'succession' | 'chronicle';
export type ContactStage = 'unknown' | 'observed' | 'signals' | 'translated' | 'contacted' | 'trusted' | 'failed';
export type LocalNpcRole = 'administrator' | 'merchant' | 'scientist' | 'doctor' | 'fixer' | 'priest' | 'guard' | 'resident';
export type HypothesisDisposition = 'private' | 'published' | 'sold' | 'suppressed';
export type TechnologyDomain = 'energy' | 'propulsion' | 'medicine' | 'materials' | 'computing' | 'weapons' | 'biology' | 'anomaly';
export type ResearchStatus = 'queued' | 'active' | 'completed' | 'failed';
export type BlueprintStatus = 'discovered' | 'available' | 'installed' | 'restricted';
export type WorldThreadCategory = 'politics' | 'discovery' | 'conflict' | 'culture' | 'research' | 'crew' | 'ecology';
export type WorldThreadStatus = 'emerging' | 'active' | 'escalating' | 'resolved' | 'lost';
export type EquipmentCategory = 'weapon' | 'armor' | 'tool' | 'medical' | 'implant' | 'relic';
export type StorySceneCategory = 'distress' | 'negotiation' | 'crew' | 'mystery' | 'travel' | 'hub' | 'consequence';
export type StorySceneStatus = 'available' | 'resolved' | 'expired';
export type ObjectiveStatus = 'active' | 'completed' | 'failed';
export type ConsequenceStatus = 'pending' | 'resolved';

export interface GalaxySettings {
  seed: string;
  systemCount: number;
  historyYears: number;
  civilizationCount: number;
  lifeFrequency: number;
  anomalyFrequency: number;
  difficulty: 'explorer' | 'standard' | 'brutal';
  tutorialEnabled?: boolean;
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

export interface SpeciesProfile {
  bodyPlan: string;
  metabolism: string;
  reproduction: string;
  lifespan: number;
  homeAdaptation: string;
  unusualTrait: string;
}

export interface CivilizationLanguage {
  id: string;
  name: string;
  script: string;
  complexity: number;
}

export interface CivilizationReligion {
  id: string;
  name: string;
  doctrine: string;
  taboos: string[];
  sacredObjects: string[];
}

export interface CivilizationCulture {
  id: string;
  name: string;
  values: string[];
  taboos: string[];
  artForms: string[];
  languageId: string;
  religionIds: string[];
}

export interface CivilizationState {
  id: string;
  name: string;
  government: string;
  capitalSystemId: string;
  status: 'active' | 'collapsed' | 'exiled';
  outsiderPolicy: string;
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
  speciesProfile?: SpeciesProfile;
  languages?: CivilizationLanguage[];
  religions?: CivilizationReligion[];
  cultures?: CivilizationCulture[];
  states?: CivilizationState[];
  socialClasses?: string[];
  outsiderPolicy?: string;
  originMystery?: string;
  extinctionCause?: string;
  era?: CivilizationalEra;
  technology?: CivilizationTechnologyProfile;
  development?: CivilizationDevelopmentState;
  deepTimeCultureIds?: string[];
  deepTimePolityIds?: string[];
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
  deepTime?: DeepTimeState;
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
  condition: CaptainCondition;
  commandIdentity: CommandIdentity;
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

export type ShipSystemId = 'engine' | 'reactor' | 'weapons' | 'sensors' | 'comms' | 'lifeSupport' | 'cargo';

export interface ShipSystemState {
  id: ShipSystemId;
  label: string;
  integrity: number;
  maxIntegrity: number;
  disabled: boolean;
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
  systems: ShipSystemState[];
  transponder: string;
  registration: string;
}


export type ShipContactKind = 'patrol' | 'pirate' | 'trader' | 'bountyHunter' | 'military' | 'smuggler' | 'refugee' | 'wreck' | 'researcher' | 'unknown';
export type ShipContactIntent = 'inspection' | 'robbery' | 'trade' | 'distress' | 'hunt' | 'escort' | 'unknown';
export type ShipEncounterPhase = 'contact' | 'combat' | 'boarding' | 'resolved';
export type ShipEncounterOutcome = 'victory' | 'escaped' | 'captured' | 'surrendered' | 'destroyed' | 'boarded' | 'peaceful';

export interface ShipContact {
  id: string;
  kind: ShipContactKind;
  intent: ShipContactIntent;
  name: string;
  factionId?: string;
  systemId: string;
  threat: number;
  demand: string;
  description: string;
  knowsIdentity: boolean;
  knowsTransponder: boolean;
  hostile: boolean;
}

export interface EnemyShipState {
  name: string;
  hull: number;
  maxHull: number;
  systems: ShipSystemState[];
  crew: number;
  morale: number;
  cargoValue: number;
}

export interface ShipEncounterState {
  id: string;
  phase: ShipEncounterPhase;
  contact: ShipContact;
  range: 1 | 2 | 3 | 4;
  turn: number;
  playerInitiative: boolean;
  enemy: EnemyShipState;
  combatLog: string[];
  brace: boolean;
  evasion: number;
  canBoard: boolean;
  boardingProgress: number;
  stationAssignments: Partial<Record<ShipSystemId, string>>;
  outcome?: ShipEncounterOutcome;
}

export interface PursuitRecord {
  id: string;
  sourceFactionId?: string;
  sourceName: string;
  reason: string;
  intensity: number;
  knownIdentity: boolean;
  knownTransponder: boolean;
  knownShipProfile: boolean;
  lastKnownSystemId: string;
  createdYear: number;
  lastUpdateYear: number;
  status: 'active' | 'cold' | 'resolved';
}

export interface WarFront {
  id: string;
  attackerFactionId: string;
  defenderFactionId: string;
  systemIds: string[];
  intensity: number;
  startedYear: number;
  lastUpdateYear: number;
  status: 'cold' | 'active' | 'ceasefire' | 'resolved';
  attackerScore: number;
  defenderScore: number;
  playerSide?: string;
}

export interface CargoItem {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  value: number;
  artifactId?: string;
  commodityId?: string;
  contractId?: string;
  illegal?: boolean;
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
  access: PointOfInterestAccess;
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
  disposition?: HypothesisDisposition;
  beneficiaryFactionId?: string;
  resolvedYear?: number;
}

export interface ArtifactKnowledge {
  artifactId: string;
  level: number;
  knownFields: string[];
  notes: string[];
  revealedTruth?: string;
}

export interface ResearchProject {
  id: string;
  artifactId: string;
  title: string;
  domain: TechnologyDomain;
  status: ResearchStatus;
  progress: number;
  requiredProgress: number;
  risk: number;
  assignedCrewIds: string[];
  startedYear: number;
  updatedYear: number;
  completedYear?: number;
  complication?: string;
  log: string[];
}

export interface TechnologyBlueprint {
  id: string;
  sourceArtifactId: string;
  name: string;
  domain: TechnologyDomain;
  status: BlueprintStatus;
  rarity: number;
  description: string;
  benefit: string;
  drawback: string;
  installCost: number;
  moduleSlot: ShipModule['slot'];
  factionInterest: string[];
  discoveredYear: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: EquipmentCategory;
  rarity: number;
  description: string;
  effect: string;
  assignedToId?: string;
  sourceArtifactId?: string;
  condition: number;
}

export interface WorldThreadUpdate {
  id: string;
  year: number;
  text: string;
  tone: GameLogEntry['tone'];
}

export interface WorldThread {
  id: string;
  category: WorldThreadCategory;
  status: WorldThreadStatus;
  title: string;
  summary: string;
  urgency: number;
  progress: number;
  systemIds: string[];
  civilizationIds: string[];
  factionIds: string[];
  relatedArtifactIds: string[];
  playerInvolved: boolean;
  nextAction?: string;
  updates: WorldThreadUpdate[];
}


export type FactionKind = 'government' | 'corporation' | 'university' | 'cartel' | 'tradeHouse' | 'religious' | 'pirates';
export type FactionDisposition = 'friendly' | 'neutral' | 'wary' | 'hostile';

export interface StoryChoiceEffect {
  credits?: number;
  reputation?: number;
  factionId?: string;
  factionReputation?: number;
  crewMorale?: number;
  objectiveTitle?: string;
  objectiveDescription?: string;
  objectiveSystemId?: string;
  consequenceDelay?: number;
  consequenceTitle?: string;
  consequenceText?: string;
  consequenceTone?: GameLogEntry['tone'];
}

export interface StoryChoice {
  id: string;
  label: string;
  summary: string;
  risk: 'low' | 'medium' | 'high' | 'unknown';
  requires?: string[];
  effect: StoryChoiceEffect;
}

export interface StoryScene {
  id: string;
  category: StorySceneCategory;
  status: StorySceneStatus;
  title: string;
  summary: string;
  body: string;
  source: string;
  systemId: string;
  hubId?: string;
  npcIds: string[];
  factionIds: string[];
  createdYear: number;
  expiresYear?: number;
  choices: StoryChoice[];
  resolvedChoiceId?: string;
}

export interface PendingConsequence {
  id: string;
  status: ConsequenceStatus;
  createdYear: number;
  triggerYear: number;
  title: string;
  text: string;
  tone: GameLogEntry['tone'];
  systemId?: string;
  factionId?: string;
  sourceSceneId?: string;
}

export interface PlayerObjective {
  id: string;
  title: string;
  description: string;
  kind: 'urgent' | 'opportunity' | 'story' | 'tutorial';
  status: ObjectiveStatus;
  createdYear: number;
  deadlineYear?: number;
  systemId?: string;
  hubId?: string;
  sourceSceneId?: string;
  progress: number;
}

export interface TutorialState {
  enabled: boolean;
  active: boolean;
  currentStep: number;
  completed: boolean;
  targetPlanetId?: string;
  targetPointOfInterestId?: string;
}

export interface FactionMemory {
  id: string;
  year: number;
  action: string;
  impact: number;
  text: string;
}
export interface Faction {
  id: string;
  name: string;
  kind: FactionKind;
  civilizationId?: string;
  disposition: FactionDisposition;
  reputation: number;
  wealth: number;
  military: number;
  research: number;
  laws: string[];
  allies: string[];
  enemies: string[];
  memories: FactionMemory[];
}

export type HubKind = 'station' | 'colony' | 'freeport' | 'settlement';
export type HubService = 'contracts' | 'trade' | 'repair' | 'fuel' | 'crew' | 'news' | 'blackMarket';
export interface HubDistrict {
  id: string;
  name: string;
  function: string;
  safety: DangerLevel;
  description: string;
}

export interface Hub {
  id: string;
  systemId: string;
  factionId: string;
  civilizationId?: string;
  name: string;
  kind: HubKind;
  population: number;
  safety: DangerLevel;
  services: HubService[];
  description: string;
  visited: boolean;
  docked: boolean;
  inspectionLevel: number;
  marketSeed: string;
  districts?: HubDistrict[];
  localCustoms?: string[];
  npcIds?: string[];
}

export interface NpcMemory {
  id: string;
  year: number;
  kind: 'meeting' | 'deal' | 'help' | 'threat' | 'betrayal' | 'discovery';
  text: string;
  impact: number;
}

export interface LocalNpc {
  id: string;
  hubId: string;
  civilizationId?: string;
  name: string;
  species: string;
  culture: string;
  role: LocalNpcRole;
  disposition: FactionDisposition;
  trust: number;
  alive: boolean;
  present: boolean;
  agenda: string;
  fear: string;
  memories: NpcMemory[];
}

export interface CivilizationContact {
  civilizationId: string;
  stage: ContactStage;
  languageLevel: number;
  trust: number;
  attempts: number;
  firstContactYear?: number;
  lastContactYear?: number;
  notes: string[];
}

export interface ArchaeologyStage {
  id: string;
  title: string;
  summary: string;
  status: 'locked' | 'active' | 'completed';
  targetSystemId: string;
  targetPointOfInterestId?: string;
  completedYear?: number;
}

export interface ArchaeologyChain {
  id: string;
  civilizationId: string;
  title: string;
  summary: string;
  status: 'active' | 'completed' | 'failed';
  stages: ArchaeologyStage[];
  createdYear: number;
}

export type ContractType = 'survey' | 'recovery' | 'delivery' | 'bounty' | 'smuggling' | 'rescue';
export type ContractStatus = 'available' | 'active' | 'completed' | 'failed' | 'expired';
export interface Contract {
  id: string;
  type: ContractType;
  status: ContractStatus;
  issuerHubId: string;
  issuerFactionId: string;
  title: string;
  description: string;
  reward: number;
  advance: number;
  deadlineYear: number;
  acceptedYear?: number;
  completedYear?: number;
  targetSystemId: string;
  targetPointOfInterestId?: string;
  progress: number;
  requiredProgress: number;
  illegal: boolean;
  hiddenClause?: string;
  cargoId?: string;
}

export interface NewsItem {
  id: string;
  year: number;
  sourceHubId?: string;
  headline: string;
  text: string;
  category: 'security' | 'discovery' | 'trade' | 'politics';
  reliability: number;
  systemIds: string[];
}

export type MarketCategory = 'fuel' | 'medicine' | 'parts' | 'science' | 'weapons' | 'drugs' | 'contraband';
export interface MarketGood {
  id: string;
  name: string;
  category: MarketCategory;
  basePrice: number;
  price: number;
  stock: number;
  illegal: boolean;
}

export interface LocationEnemyState {
  id: string;
  health: number;
  x: number;
  y: number;
}
export interface LocationState {
  pointOfInterestId: string;
  visitCount: number;
  enemyStates: LocationEnemyState[];
  resolvedObjectIds: string[];
  collectedEvidenceKeys: string[];
  revealedTileKeys: string[];
  artifactTaken: boolean;
  lastOutcome: 'evacuated' | 'resolved' | 'failed';
  lastVisitedYear: number;
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
  locationState: LocationState;
  defeatedEnemyIds: string[];
}

export interface GameLogEntry {
  id: string;
  year: number;
  title: string;
  text: string;
  tone: 'info' | 'good' | 'warning' | 'danger';
}


export interface CaptainLegacyRecord {
  id: string;
  captainId: string;
  name: string;
  commandIdentity: CommandIdentity;
  startedYear: number;
  endedYear?: number;
  fate?: CaptainCondition;
  finalSystemId?: string;
  shipName: string;
  systemsVisited: number;
  discoveries: number;
  battles: number;
  reputation: number;
  epitaph?: string;
  memorialId?: string;
}

export interface SuccessionCandidate {
  id: string;
  source: 'crew';
  sourceId: string;
  name: string;
  role: string;
  loyalty: number;
  eligible: boolean;
  consequences: string[];
}

export interface LostExpedition {
  id: string;
  year: number;
  systemId: string;
  pointOfInterestId?: string;
  captainRecordId: string;
  crewIds: string[];
  cargoIds: string[];
  status: 'unrecovered' | 'recovered' | 'lost';
  summary: string;
  recoveredYear?: number;
}

export interface Memorial {
  id: string;
  captainRecordId: string;
  type: 'space' | 'archive' | 'homeworld' | 'hidden';
  year: number;
  systemId: string;
  text: string;
  public: boolean;
}

export interface ChronicleEntry {
  id: string;
  year: number;
  category: 'command' | 'death' | 'succession' | 'discovery' | 'war' | 'memorial' | 'recovery' | 'world';
  title: string;
  text: string;
  tone: GameLogEntry['tone'];
  captainRecordId?: string;
  systemId?: string;
}

export interface LegacyState {
  mode: LegacyMode;
  campaignEnded: boolean;
  continuityReason?: string;
  currentCaptainRecordId: string;
  captains: CaptainLegacyRecord[];
  successionCandidates: SuccessionCandidate[];
  lostExpeditions: LostExpedition[];
  memorials: Memorial[];
  chronicle: ChronicleEntry[];
  observerYear: number;
}

export interface SaveMetadata {
  savedAt: string;
  appVersion: string;
  sequence: number;
  reason: string;
  checksum: string;
}

export interface GameStateSnapshot {
  simulation: SimulationState;
  knowledge: PlayerKnowledgeState;
  activeShipEncounter: ShipEncounterState | null;
  pursuits: PursuitRecord[];
  warFronts: WarFront[];
  legacy: LegacyState;
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
  factions: Faction[];
  hubs: Hub[];
  contracts: Contract[];
  news: NewsItem[];
  locationStates: LocationState[];
  currentHubId: string | null;
  localNpcs: LocalNpc[];
  civilizationContacts: CivilizationContact[];
  archaeologyChains: ArchaeologyChain[];
  researchProjects: ResearchProject[];
  technologyBlueprints: TechnologyBlueprint[];
  equipmentInventory: EquipmentItem[];
  worldThreads: WorldThread[];
  storyScenes: StoryScene[];
  pendingConsequences: PendingConsequence[];
  objectives: PlayerObjective[];
  tutorial: TutorialState;
}
