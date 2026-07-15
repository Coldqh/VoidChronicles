import { create } from 'zustand';
import type {
  Artifact,
  ArtifactKnowledge,
  ArchaeologyChain,
  Captain,
  CivilizationContact,
  CrewCandidate,
  CrewMember,
  Contract,
  Discovery,
  Faction,
  Evidence,
  EquipmentItem,
  ExpeditionResult,
  Galaxy,
  GameLogEntry,
  GameStateSnapshot,
  Hub,
  Hypothesis,
  LegacyState,
  LocationState,
  LocalNpc,
  MarketGood,
  NewsItem,
  PointOfInterest,
  PlayerObjective,
  PendingConsequence,
  ResearchProject,
  PursuitRecord,
  SaveMetadata,
  ScanReport,
  Ship,
  ShipEncounterState,
  ShipSystemId,
  StarSystem,
  StoryScene,
  TutorialState,
  TechnologyBlueprint,
  WarFront,
  CaptainCondition,
  WorldThread
} from './types';
import {
  createManualBackup,
  deleteSnapshot,
  getBackupCount,
  loadSnapshot,
  saveSnapshotImmediately,
  scheduleSnapshotSave
} from '../persistence/db';
import {
  CURRENT_SCHEMA_VERSION,
  parseSnapshot,
  snapshotErrorMessage
} from '../persistence/snapshot';
import { APP_VERSION } from '../version';
import { createRng } from '../generation/rng';
import { recordDiagnostic } from '../runtime/diagnostics';
import { generatePointsOfInterest } from '../exploration/pointsOfInterest';
import { buildHypothesis } from '../exploration/hypotheses';
import { generateCrewCandidates } from '../crew/generateCrew';
import { generateContracts, generateMarket, initializeLivingGalaxy } from '../world/livingGalaxy';
import { culturalArtifactMultiplier, initializeCivilizationLayer } from '../world/civilizations';
import { blueprintFromProject, createResearchProject, researchPower } from '../research/technology';
import { advanceWarFronts, createShipSystems, createTravelEncounter, damageSystem, initializeWarFronts, normalizeShipSystems, systemIntegrity } from '../world/warfare';
import { chronicleEntry, closeCurrentCaptain, createInitialLegacy } from '../world/legacy';
import { generateHubScene, generateScanScene, generateTravelScene, initializeNarrative, processDueConsequences } from '../narrative/encounters';
import type { PlayerKnowledgeState, SimulationState, WorldEvent } from '../simulation/types';
import { ACTION_TIME, expeditionHours, HOURS_PER_YEAR, travelHours, worldYear } from '../simulation/clock';
import { adjustEcosystem, adjustSystemEconomy, advanceSimulation, initializeSimulation, recordWorldEvent } from '../simulation/kernel';
import { createKnowledgeFromLegacy, emptyKnowledge, projectKnowledgeToGalaxy, revealKnowledge } from '../simulation/knowledge';
import { projectContractsFromEvents, projectNewsFromEvents, projectWorldThreads } from '../simulation/projections';

export type MainScreen = 'menu' | 'command' | 'continuity' | 'chronicle' | 'galaxy' | 'system' | 'hub' | 'contracts' | 'factions' | 'civilizations' | 'crew' | 'archive' | 'laboratory' | 'world' | 'operations' | 'ship' | 'settings';
export type HydrationStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface GameStore {
  screen: MainScreen;
  galaxy: Galaxy | null;
  captain: Captain | null;
  ship: Ship | null;
  currentSystemId: string | null;
  selectedSystemId: string | null;
  gameYear: number;
  simulation: SimulationState | null;
  knowledge: PlayerKnowledgeState;
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
  activeStorySceneId: string | null;
  pendingConsequences: PendingConsequence[];
  objectives: PlayerObjective[];
  tutorial: TutorialState;
  activeShipEncounter: ShipEncounterState | null;
  pursuits: PursuitRecord[];
  warFronts: WarFront[];
  legacy: LegacyState;
  generationActive: boolean;
  hydrationStatus: HydrationStatus;
  saveAvailable: boolean;
  saveError: string | null;
  saveStatus: SaveStatus;
  saveMeta: SaveMetadata | null;
  backupCount: number;
  recoveryNotice: string | null;
  busyAction: string | null;
  setScreen(screen: MainScreen): void;
  setGenerationActive(active: boolean): void;
  advanceWorld(hours: number, reason: string): Promise<WorldEvent[]>;
  advanceTutorial(expectedStep?: number): Promise<void>;
  skipTutorial(): Promise<void>;
  restartTutorial(): Promise<void>;
  resolveStoryScene(sceneId: string, choiceId: string): Promise<{ ok: boolean; message: string }>;
  openStoryScene(sceneId: string): void;
  closeStoryScene(): void;
  hydrateFromStorage(): Promise<void>;
  dismissSaveError(): void;
  dismissRecoveryNotice(): void;
  startGame(galaxy: Galaxy): Promise<void>;
  resumeGame(): Promise<boolean>;
  clearGame(): Promise<void>;
  triggerCaptainLoss(reason: string, condition?: CaptainCondition, pointOfInterestId?: string): Promise<void>;
  createMemorial(type: 'space' | 'archive' | 'homeworld' | 'hidden'): Promise<void>;
  enterChronicleMode(): Promise<void>;
  advanceChronicle(years: number): Promise<void>;
  createBackup(): Promise<boolean>;
  selectSystem(id: string | null): void;
  travelTo(systemId: string): Promise<{ ok: boolean; message: string; encounter?: 'shipContact' }>;
  assignCombatStation(systemId: ShipSystemId, crewId: string | null): Promise<void>;
  respondToShipContact(action: 'communicate' | 'documents' | 'bribe' | 'hideCargo' | 'help' | 'attack' | 'escape' | 'surrender'): Promise<{ ok: boolean; message: string }>;
  shipCombatAction(action: 'fire' | 'targetEngine' | 'targetWeapons' | 'close' | 'withdraw' | 'evade' | 'jump' | 'negotiate' | 'board'): Promise<{ ok: boolean; message: string }>;
  boardingAction(action: 'bridge' | 'cargo' | 'rescue' | 'sabotage' | 'withdraw'): Promise<{ ok: boolean; message: string }>;
  closeShipEncounter(): Promise<void>;
  changeTransponder(): Promise<{ ok: boolean; message: string }>;
  scanSystem(systemId: string): Promise<void>;
  detailedScanPlanet(planetId: string): Promise<{ ok: boolean; message: string }>;
  investigatePoint(pointId: string): Promise<{ ok: boolean; message: string }>;
  completeExpedition(result: ExpeditionResult): Promise<void>;
  analyzeArtifact(artifactId: string): Promise<void>;
  startResearch(artifactId: string): Promise<{ ok: boolean; message: string }>;
  advanceResearch(projectId: string): Promise<{ ok: boolean; message: string }>;
  installBlueprint(blueprintId: string): Promise<{ ok: boolean; message: string }>;
  assignEquipment(itemId: string, targetId?: string): Promise<void>;
  damageShip(amount: number, status?: string): Promise<void>;
  repairShip(): Promise<void>;
  refuelShip(): Promise<void>;
  earnCredits(amount: number, reason: string): Promise<void>;
  sellCargo(itemId: string): Promise<void>;
  refreshCrewCandidates(): Promise<void>;
  hireCrew(candidateId: string): Promise<void>;
  dismissCrew(crewId: string): Promise<void>;
  settlePayroll(): Promise<void>;
  dockAtHub(hubId: string): Promise<{ ok: boolean; message: string }>;
  leaveHub(): Promise<void>;
  acceptContract(contractId: string): Promise<{ ok: boolean; message: string }>;
  refreshContracts(): Promise<void>;
  buyMarketGood(hubId: string, good: MarketGood): Promise<{ ok: boolean; message: string }>;
  sellCommodity(itemId: string, hubId: string): Promise<void>;
  attemptFirstContact(civilizationId: string): Promise<{ ok: boolean; message: string }>;
  interactWithNpc(npcId: string, kind: 'deal' | 'help' | 'threat'): Promise<void>;
  resolveHypothesis(hypothesisId: string, disposition: 'published' | 'sold' | 'suppressed'): Promise<void>;
  sellArtifactToHub(itemId: string, hubId: string, channel: 'market' | 'museum' | 'heirs' | 'blackMarket'): Promise<void>;
  restoreSnapshot(snapshot: GameStateSnapshot): Promise<void>;
  getSnapshot(): GameStateSnapshot | null;
}

type StoreSet = (partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>)) => void;
type StoreGet = () => GameStore;

const initialCaptain = (): Captain => ({
  id: 'captain_player',
  name: 'Капитан Вейл',
  level: 1,
  xp: 0,
  health: 100,
  maxHealth: 100,
  credits: 1400,
  reputation: 0,
  skills: { research: 1, archaeology: 1, trade: 1, combat: 1, crime: 0 },
  injuries: [],
  alive: true,
  condition: 'active',
  commandIdentity: 'organic'
});

const initialShip = (): Ship => ({
  id: 'ship_wanderer',
  name: 'Странник-01',
  hull: 100,
  maxHull: 100,
  fuel: 90,
  maxFuel: 100,
  jumpRange: 230,
  cargoCapacity: 10,
  cargo: [],
  modules: [
    { id: 'engine_basic', name: 'Импульсный двигатель I', slot: 'engine', rarity: 1, effect: 'Дальность прыжка 230' },
    { id: 'scanner_basic', name: 'Спектральный сканер I', slot: 'scanner', rarity: 1, effect: 'Системный и детальный анализ' },
    { id: 'cargo_basic', name: 'Грузовой модуль', slot: 'cargo', rarity: 1, effect: '10 единиц груза' },
    { id: 'weapon_basic', name: 'Лёгкая рельса', slot: 'weapon', rarity: 1, effect: 'Корабельная атака 14–24' }
  ],
  statuses: [],
  systems: createShipSystems(),
  transponder: 'WANDERER-01',
  registration: 'VC-01-CORE',
});

function buildStationAssignments(crew: CrewMember[]): Partial<Record<ShipSystemId, string>> {
  const assignments: Partial<Record<ShipSystemId, string>> = {};
  const roleTargets: { role: CrewMember['primaryRole']; system: ShipSystemId }[] = [
    { role: 'pilot', system: 'engine' }, { role: 'engineer', system: 'reactor' }, { role: 'soldier', system: 'weapons' },
    { role: 'scientist', system: 'sensors' }, { role: 'diplomat', system: 'comms' }, { role: 'doctor', system: 'lifeSupport' },
    { role: 'smuggler', system: 'cargo' }, { role: 'archaeologist', system: 'sensors' }, { role: 'biologist', system: 'lifeSupport' }
  ];
  for (const target of roleTargets) {
    if (assignments[target.system]) continue;
    const member = crew.find((entry) => entry.status === 'active' && (entry.primaryRole === target.role || entry.secondaryRole === target.role) && !Object.values(assignments).includes(entry.id));
    if (member) assignments[target.system] = member.id;
  }
  return assignments;
}


const emptyLegacyState = (): LegacyState => ({
  mode: 'active',
  campaignEnded: false,
  currentCaptainRecordId: '',
  captains: [],
  successionCandidates: [],
  lostExpeditions: [],
  memorials: [],
  chronicle: [],
  observerYear: 0
});

const initialEquipment = (): EquipmentItem[] => ([
  { id: 'gear_sidearm', name: 'Служебный пистолет', category: 'weapon', rarity: 1, description: 'Надёжное оружие для аварийной защиты.', effect: '+базовая атака в экспедиции', assignedToId: 'captain_player', condition: 100 },
  { id: 'gear_field_armor', name: 'Полевой скафандр', category: 'armor', rarity: 1, description: 'Изоляция от среды и лёгкая бронезащита.', effect: '-риск травмы от среды', assignedToId: 'captain_player', condition: 100 },
  { id: 'gear_multiscanner', name: 'Ручной мультисканер', category: 'tool', rarity: 1, description: 'Собирает спектральные и структурные данные.', effect: '+достоверность полевого анализа', condition: 100 }
]);


function prepareStartingGalaxy(galaxy: Galaxy, tutorialEnabled: boolean): { galaxy: Galaxy; tutorialPlanetId?: string } {
  const prepared = structuredClone(galaxy);
  const start = prepared.systems.find((system) => system.id === prepared.startSystemId) ?? prepared.systems[0];
  if (!start) return { galaxy: prepared };
  start.danger = 'safe';
  start.anomaly = false;

  if (!tutorialEnabled) return { galaxy: prepared };
  start.name = 'Предел-7';
  start.starClass = 'K';
  start.starCount = 1;
  start.region = 'core';
  let planet = start.planets.find((entry) => entry.type !== 'gas');
  if (!planet) planet = start.planets[0];
  if (!planet) return { galaxy: prepared };
  planet.name = 'К-1 «Эхо»';
  planet.type = 'rocky';
  planet.danger = 'caution';
  planet.habitability = 4;
  planet.hasLife = false;
  planet.civilizationId = undefined;
  planet.pointsOfInterest = 1;
  planet.imageKey = 'tutorial-target';
  return { galaxy: prepared, tutorialPlanetId: planet.id };
}

const emptySaveMeta = (): SaveMetadata => ({
  savedAt: new Date(0).toISOString(),
  appVersion: APP_VERSION,
  sequence: 0,
  reason: 'unsaved',
  checksum: '00000000'
});

const makeLog = (year: number, title: string, text: string, tone: GameLogEntry['tone']): GameLogEntry => ({
  id: `log_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  year,
  title,
  text,
  tone
});

function distance(a: StarSystem, b: StarSystem): number {
  return Math.hypot(a.coordinates.x - b.coordinates.x, a.coordinates.y - b.coordinates.y);
}

function adjustFactionStanding(factions: Faction[], factionId: string, year: number, action: string, impact: number, text: string): Faction[] {
  return factions.map((faction) => faction.id === factionId ? {
    ...faction,
    reputation: Math.max(-100, Math.min(100, faction.reputation + impact)),
    disposition: faction.reputation + impact <= -45 ? 'hostile' : faction.reputation + impact < -5 ? 'wary' : faction.reputation + impact >= 25 ? 'friendly' : 'neutral',
    memories: [{ id: `fmemory_${faction.id}_${year}_${faction.memories.length}`, year, action, impact, text }, ...faction.memories].slice(0, 40)
  } : faction);
}

function completedContract(contract: Contract, gameYear: number): Contract {
  return { ...contract, status: 'completed', progress: contract.requiredProgress, completedYear: gameYear };
}

function bindArchaeologyPoints(chains: ArchaeologyChain[], points: PointOfInterest[]): ArchaeologyChain[] {
  return chains.map((chain) => {
    const civilizationPoints = points.filter((point) => point.civilizationId === chain.civilizationId);
    if (civilizationPoints.length === 0) return chain;
    return {
      ...chain,
      stages: chain.stages.map((stage) => {
        if (stage.targetPointOfInterestId || stage.status === 'completed') return stage;
        const match = civilizationPoints.find((point) => point.systemId === stage.targetSystemId) ?? civilizationPoints[0];
        return match ? { ...stage, targetPointOfInterestId: match.id, status: stage.status === 'locked' ? stage.status : 'active' } : stage;
      })
    };
  });
}

function advanceArchaeologyChains(chains: ArchaeologyChain[], pointId: string, evidenceCount: number, gameYear: number): { chains: ArchaeologyChain[]; completedTitle?: string; advancedTitle?: string } {
  let completedTitle: string | undefined;
  let advancedTitle: string | undefined;
  const nextChains = chains.map((chain) => {
    const stageIndex = chain.stages.findIndex((stage) => stage.targetPointOfInterestId === pointId && stage.status === 'active');
    if (stageIndex < 0 || evidenceCount <= 0) return chain;
    const stages = chain.stages.map((stage, index) => index === stageIndex ? { ...stage, status: 'completed' as const, completedYear: gameYear } : index === stageIndex + 1 ? { ...stage, status: 'active' as const } : stage);
    const finished = stages.every((stage) => stage.status === 'completed');
    if (finished) completedTitle = chain.title;
    else advancedTitle = stages[stageIndex + 1]?.title;
    return { ...chain, stages, status: finished ? 'completed' as const : chain.status };
  });
  return { chains: nextChains, completedTitle, advancedTitle };
}

const contactOrder: CivilizationContact['stage'][] = ['unknown', 'observed', 'signals', 'translated', 'contacted', 'trusted'];

function nextContactStage(stage: CivilizationContact['stage']): CivilizationContact['stage'] {
  if (stage === 'failed') return 'signals';
  const index = contactOrder.indexOf(stage);
  return contactOrder[Math.min(contactOrder.length - 1, Math.max(0, index + 1))] ?? 'observed';
}

async function persist(
  set: StoreSet,
  get: StoreGet,
  reason: string,
  options: { immediate?: boolean; backup?: boolean } = {}
): Promise<boolean> {
  const snapshot = get().getSnapshot();
  if (!snapshot) return false;
  set({ saveStatus: 'pending' });
  try {
    set({ saveStatus: 'saving' });
    const saved = options.immediate
      ? await saveSnapshotImmediately(snapshot, reason, options.backup ?? false)
      : await scheduleSnapshotSave(snapshot, reason);
    set({
      saveStatus: 'saved',
      saveError: null,
      saveAvailable: true,
      saveMeta: saved.saveMeta ?? null
    });
    return true;
  } catch (error) {
    console.error('Ironman autosave failed', error);
    recordDiagnostic('save', error, reason);
    set({
      saveStatus: 'error',
      saveError: `Автосохранение не выполнено: ${snapshotErrorMessage(error)}`
    });
    return false;
  }
}

async function runExclusive<T>(
  name: string,
  set: StoreSet,
  get: StoreGet,
  task: () => Promise<T>,
  blockedValue: T
): Promise<T> {
  if (get().busyAction) return blockedValue;
  set({ busyAction: name });
  try {
    return await task();
  } finally {
    if (get().busyAction === name) set({ busyAction: null });
  }
}


interface WorldAdvanceOverrides {
  galaxy?: Galaxy;
  knowledge?: PlayerKnowledgeState;
  factions?: Faction[];
  hubs?: Hub[];
  contracts?: Contract[];
  news?: NewsItem[];
  researchProjects?: ResearchProject[];
  warFronts?: WarFront[];
  currentSystemId?: string | null;
}

function buildWorldAdvance(
  state: GameStore,
  hours: number,
  reason: string,
  overrides: WorldAdvanceOverrides = {}
): { patch: Partial<GameStore>; emittedEvents: WorldEvent[] } {
  const galaxy = overrides.galaxy ?? state.galaxy;
  const simulation = state.simulation;
  if (!galaxy || !simulation) return { patch: {}, emittedEvents: [] };
  const factions = overrides.factions ?? state.factions;
  const hubs = overrides.hubs ?? state.hubs;
  const knowledge = overrides.knowledge ?? state.knowledge;
  const currentSystemId = overrides.currentSystemId === undefined ? state.currentSystemId : overrides.currentSystemId;
  const advanced = advanceSimulation(simulation, { seed: galaxy.seed, galaxy, factions, hubs }, hours, reason);
  const projectedHubs = hubs.map((hub) => {
    const settlement = Object.values(advanced.simulation.settlements).find((entry) => entry.hubId === hub.id);
    if (!settlement) return hub;
    const safety = settlement.security < 25 ? 'danger' as const : settlement.security < 55 ? 'caution' as const : 'safe' as const;
    return { ...hub, population: settlement.population, safety };
  });
  const previousYear = worldYear(simulation.clock);
  const nextYear = worldYear(advanced.simulation.clock);
  let warFronts = overrides.warFronts ?? state.warFronts;
  for (let year = previousYear + 1; year <= nextYear; year += 1) {
    warFronts = advanceWarFronts(`${galaxy.seed}:kernel`, warFronts, year);
  }
  const baseContracts = (overrides.contracts ?? state.contracts).map((contract) => contract.status === 'active' && nextYear > contract.deadlineYear ? { ...contract, status: 'expired' as const } : contract);
  const contracts = projectContractsFromEvents({ events: advanced.emittedEvents, existing: baseContracts, hubs: projectedHubs, year: nextYear });
  const news = projectNewsFromEvents(advanced.emittedEvents, knowledge, overrides.news ?? state.news, currentSystemId ?? undefined);
  const researchProjects = overrides.researchProjects ?? state.researchProjects;
  const worldThreads = projectWorldThreads({ simulation: advanced.simulation, warFronts, factions, contracts, research: researchProjects });
  const consequences = processDueConsequences(state.pendingConsequences, nextYear);
  const logs = [...consequences.due.map((entry) => makeLog(nextYear, entry.title, entry.text, entry.tone)), ...state.logs];
  const projectedGalaxy = projectKnowledgeToGalaxy({ ...galaxy, currentYear: nextYear }, knowledge);
  return {
    emittedEvents: advanced.emittedEvents,
    patch: {
      simulation: advanced.simulation,
      hubs: projectedHubs,
      galaxy: projectedGalaxy,
      gameYear: nextYear,
      contracts,
      news,
      worldThreads,
      warFronts,
      pendingConsequences: consequences.consequences,
      storyScenes: state.storyScenes.map((scene) => scene.status === 'available' && scene.expiresYear !== undefined && scene.expiresYear < nextYear ? { ...scene, status: 'expired' as const } : scene),
      objectives: state.objectives.map((objective) => objective.status === 'active' && objective.deadlineYear !== undefined && objective.deadlineYear < nextYear ? { ...objective, status: 'failed' as const } : objective),
      logs: logs.slice(0, 750)
    }
  };
}

let hydrationTask: Promise<void> | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'menu',
  galaxy: null,
  captain: null,
  ship: null,
  currentSystemId: null,
  selectedSystemId: null,
  gameYear: 0,
  simulation: null,
  knowledge: { version: 1, records: {} },
  discoveries: [],
  logs: [],
  scanReports: [],
  pointsOfInterest: [],
  evidence: [],
  hypotheses: [],
  artifactKnowledge: [],
  crew: [],
  crewCandidates: [],
  factions: [],
  hubs: [],
  contracts: [],
  news: [],
  locationStates: [],
  currentHubId: null,
  localNpcs: [],
  civilizationContacts: [],
  archaeologyChains: [],
  researchProjects: [],
  technologyBlueprints: [],
  equipmentInventory: [],
  worldThreads: [],
  storyScenes: [],
  activeStorySceneId: null,
  pendingConsequences: [],
  objectives: [],
  tutorial: { enabled: false, active: false, currentStep: 0, completed: true },
  activeShipEncounter: null,
  pursuits: [],
  warFronts: [],
  legacy: emptyLegacyState(),
  generationActive: false,
  hydrationStatus: 'idle',
  saveAvailable: false,
  saveError: null,
  saveStatus: 'idle',
  saveMeta: null,
  backupCount: 0,
  recoveryNotice: null,
  busyAction: null,
  setScreen: (screen) => {
    if (get().busyAction) return;
    const legacy = get().legacy;
    if (legacy.mode === 'succession' && !['continuity', 'chronicle', 'settings'].includes(screen)) return;
    if (legacy.mode === 'chronicle' && !['chronicle', 'settings', 'menu'].includes(screen)) return;
    const tutorial = get().tutorial;
    const advance = tutorial.active && tutorial.currentStep === 0 && screen === 'system';
    set({ screen, ...(advance ? { tutorial: { ...tutorial, currentStep: 1 } } : {}) });
    if (advance) void persist(set, get, 'tutorial-open-system');
  },
  setGenerationActive: (generationActive) => set({ generationActive }),
  async advanceWorld(hours, reason) {
    const advanced = buildWorldAdvance(get(), hours, reason);
    if (Object.keys(advanced.patch).length) set(advanced.patch);
    return advanced.emittedEvents;
  },
  async advanceTutorial(expectedStep) {
    const tutorial = get().tutorial;
    if (!tutorial.active || tutorial.completed) return;
    if (expectedStep !== undefined && tutorial.currentStep !== expectedStep) return;
    const nextStep = tutorial.currentStep + 1;
    const completed = nextStep >= 8;
    set({
      tutorial: { ...tutorial, currentStep: completed ? 7 : nextStep, active: !completed, completed },
      objectives: get().objectives.map((objective) => objective.id === 'objective_tutorial_bridge' ? { ...objective, status: completed ? 'completed' as const : objective.status, progress: completed ? 100 : Math.round(nextStep / 8 * 100) } : objective),
      logs: completed ? [makeLog(get().gameYear, 'Первый маршрут завершён', 'Навигация, сканирование и полевая эвакуация освоены.', 'good'), ...get().logs] : get().logs
    });
    await persist(set, get, completed ? 'tutorial-complete' : 'tutorial-step');
  },
  async skipTutorial() {
    set({
      tutorial: { ...get().tutorial, enabled: false, active: false, currentStep: 7, completed: true },
      objectives: get().objectives.map((objective) => objective.id === 'objective_tutorial_bridge' ? { ...objective, status: 'completed' as const, progress: 100 } : objective),
      logs: [makeLog(get().gameYear, 'Обучение отключено', 'Корабельный помощник больше не показывает вводные подсказки.', 'info'), ...get().logs]
    });
    await persist(set, get, 'tutorial-skip');
  },
  async restartTutorial() {
    const existing = get().objectives.some((objective) => objective.id === 'objective_tutorial_bridge');
    set({
      tutorial: { ...get().tutorial, enabled: true, active: true, currentStep: 0, completed: false },
      objectives: existing
        ? get().objectives.map((objective) => objective.id === 'objective_tutorial_bridge' ? { ...objective, status: 'active' as const, progress: 0 } : objective)
        : [{ id: 'objective_tutorial_bridge', title: 'Освоиться на мостике', description: 'Завершить короткое обучение и выбрать первую цель.', kind: 'tutorial' as const, status: 'active' as const, createdYear: get().gameYear, progress: 0 }, ...get().objectives]
    });
    await persist(set, get, 'tutorial-restart');
  },
  async resolveStoryScene(sceneId, choiceId) {
    return runExclusive('story-scene', set, get, async () => {
      const scene = get().storyScenes.find((entry) => entry.id === sceneId && entry.status === 'available');
      const choice = scene?.choices.find((entry) => entry.id === choiceId);
      const captain = get().captain;
      if (!scene || !choice || !captain) return { ok: false, message: 'Сцена уже закрыта или выбор недоступен' };
      if ((choice.effect.credits ?? 0) < 0 && captain.credits < Math.abs(choice.effect.credits ?? 0)) return { ok: false, message: 'Недостаточно кредитов' };
      let factions = get().factions;
      if (choice.effect.factionId && choice.effect.factionReputation) {
        factions = adjustFactionStanding(factions, choice.effect.factionId, get().gameYear, `scene-${scene.id}-${choice.id}`, choice.effect.factionReputation, `Выбор в сцене «${scene.title}».`);
      }
      const crew = get().crew.map((member) => ({ ...member, morale: Math.max(0, Math.min(100, member.morale + (choice.effect.crewMorale ?? 0))) }));
      const consequence = choice.effect.consequenceDelay && choice.effect.consequenceTitle ? {
        id: `consequence_${scene.id}_${choice.id}_${get().gameYear}`,
        status: 'pending' as const,
        createdYear: get().gameYear,
        triggerYear: get().gameYear + choice.effect.consequenceDelay,
        title: choice.effect.consequenceTitle,
        text: choice.effect.consequenceText ?? 'Решение продолжает менять ситуацию.',
        tone: choice.effect.consequenceTone ?? 'info' as const,
        systemId: scene.systemId,
        factionId: choice.effect.factionId,
        sourceSceneId: scene.id
      } : null;
      const objective = choice.effect.objectiveTitle ? {
        id: `objective_${scene.id}_${choice.id}`,
        title: choice.effect.objectiveTitle,
        description: choice.effect.objectiveDescription ?? scene.summary,
        kind: 'story' as const,
        status: 'active' as const,
        createdYear: get().gameYear,
        systemId: choice.effect.objectiveSystemId ?? scene.systemId,
        sourceSceneId: scene.id,
        progress: 0
      } : null;
      set({
        storyScenes: get().storyScenes.map((entry) => entry.id === scene.id ? { ...entry, status: 'resolved' as const, resolvedChoiceId: choice.id } : entry),
        activeStorySceneId: get().activeStorySceneId === scene.id ? null : get().activeStorySceneId,
        pendingConsequences: consequence ? [consequence, ...get().pendingConsequences] : get().pendingConsequences,
        objectives: objective ? [objective, ...get().objectives] : get().objectives,
        factions,
        crew,
        captain: { ...captain, credits: Math.max(0, captain.credits + (choice.effect.credits ?? 0)), reputation: captain.reputation + (choice.effect.reputation ?? 0) },
        logs: [makeLog(get().gameYear, scene.title, `${choice.label}. ${choice.summary}`, choice.risk === 'high' ? 'warning' : choice.risk === 'low' ? 'good' : 'info'), ...get().logs]
      });
      await persist(set, get, 'story-scene');
      return { ok: true, message: 'Решение принято. Мир запомнил выбор.' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  openStoryScene(sceneId) {
    if (get().storyScenes.some((scene) => scene.id === sceneId && scene.status === 'available')) set({ activeStorySceneId: sceneId });
  },
  closeStoryScene() { set({ activeStorySceneId: null }); },
  async hydrateFromStorage() {
    if (get().hydrationStatus === 'ready') return;
    if (hydrationTask) return hydrationTask;
    set({ hydrationStatus: 'loading', saveError: null, recoveryNotice: null });
    hydrationTask = (async () => {
      try {
        const result = await loadSnapshot();
        const backups = await getBackupCount().catch(() => 0);
        if (!result) {
          set({ hydrationStatus: 'ready', saveAvailable: false, saveError: null, backupCount: backups });
          return;
        }
        const safe = result.snapshot;
        set({
          screen: safe.legacy.mode === 'succession' ? 'continuity' : safe.legacy.mode === 'chronicle' ? 'chronicle' : 'command',
          galaxy: safe.galaxy,
          captain: safe.captain,
          ship: safe.ship,
          currentSystemId: safe.currentSystemId,
          selectedSystemId: safe.currentSystemId,
          gameYear: safe.gameYear,
          simulation: safe.simulation,
          knowledge: safe.knowledge,
          discoveries: safe.discoveries,
          logs: safe.logs,
          scanReports: safe.scanReports,
          pointsOfInterest: safe.pointsOfInterest,
          evidence: safe.evidence,
          hypotheses: safe.hypotheses,
          artifactKnowledge: safe.artifactKnowledge,
          crew: safe.crew,
          crewCandidates: safe.crewCandidates,
          factions: safe.factions,
          hubs: safe.hubs,
          contracts: safe.contracts,
          news: safe.news,
          locationStates: safe.locationStates,
          currentHubId: safe.currentHubId,
          localNpcs: safe.localNpcs,
          civilizationContacts: safe.civilizationContacts,
          archaeologyChains: safe.archaeologyChains,
          researchProjects: safe.researchProjects,
          technologyBlueprints: safe.technologyBlueprints,
          equipmentInventory: safe.equipmentInventory,
          worldThreads: safe.worldThreads,
          storyScenes: safe.storyScenes,
          activeStorySceneId: null,
          pendingConsequences: safe.pendingConsequences,
          objectives: safe.objectives,
          tutorial: safe.tutorial,
          activeShipEncounter: safe.activeShipEncounter,
          pursuits: safe.pursuits,
          warFronts: safe.warFronts,
          legacy: safe.legacy,
          saveMeta: safe.saveMeta ?? null,
          hydrationStatus: 'ready',
          saveAvailable: true,
          saveStatus: 'saved',
          saveError: null,
          backupCount: backups,
          recoveryNotice: result.warning
        });
      } catch (error) {
        recordDiagnostic('save', error, 'hydrate');
        set({
          hydrationStatus: 'error',
          saveAvailable: false,
          saveStatus: 'error',
          saveError: snapshotErrorMessage(error),
          galaxy: null,
          captain: null,
          ship: null,
          currentSystemId: null,
          selectedSystemId: null
        });
      } finally {
        hydrationTask = null;
      }
    })();
    return hydrationTask;
  },
  dismissSaveError() { set({ saveError: null, hydrationStatus: 'ready', saveStatus: 'idle' }); },
  dismissRecoveryNotice() { set({ recoveryNotice: null }); },
  async startGame(galaxy) {
    return runExclusive('new-game', set, get, async () => {
      const preparedStart = prepareStartingGalaxy(galaxy, galaxy.settings.tutorialEnabled !== false);
      const living = initializeLivingGalaxy(preparedStart.galaxy);
      const civilizationLayer = initializeCivilizationLayer(preparedStart.galaxy, living.hubs);
      const enrichedGalaxy = civilizationLayer.galaxy;
      const narrative = initializeNarrative(enrichedGalaxy, civilizationLayer.hubs, living.factions, galaxy.settings.tutorialEnabled !== false);
      const start = enrichedGalaxy.systems.find((system) => system.id === enrichedGalaxy.startSystemId);
      if (!start) throw new Error('Стартовая система не найдена');
      const captain = initialCaptain();
      const ship = initialShip();
      let knowledge = emptyKnowledge();
      knowledge = revealKnowledge(knowledge, 'system', start.id, ['identity', 'coordinates', 'star', 'routes', 'visited'], 0, 'direct', 94);
      const simulation = initializeSimulation({ seed: enrichedGalaxy.seed, galaxy: enrichedGalaxy, factions: living.factions, hubs: civilizationLayer.hubs });
      const projectedGalaxy = projectKnowledgeToGalaxy(enrichedGalaxy, knowledge);
      const warFronts = initializeWarFronts(enrichedGalaxy.seed, living.factions, enrichedGalaxy.systems, 0);
      set({
        screen: 'command',
        galaxy: projectedGalaxy,
        captain,
        ship,
        currentSystemId: start.id,
        selectedSystemId: start.id,
        gameYear: 0,
        simulation,
        knowledge,
        discoveries: [],
        scanReports: [],
        pointsOfInterest: [],
        evidence: [],
        hypotheses: [],
        artifactKnowledge: [],
        crew: [],
        crewCandidates: [],
        factions: living.factions,
        hubs: civilizationLayer.hubs,
        contracts: living.contracts,
        news: living.news,
        locationStates: [],
        currentHubId: null,
        localNpcs: civilizationLayer.localNpcs,
        civilizationContacts: civilizationLayer.civilizationContacts,
        archaeologyChains: civilizationLayer.archaeologyChains,
        researchProjects: [],
        technologyBlueprints: [],
        equipmentInventory: initialEquipment(),
        worldThreads: projectWorldThreads({ simulation, warFronts, factions: living.factions, contracts: living.contracts, research: [] }),
        storyScenes: narrative.storyScenes,
        activeStorySceneId: null,
        pendingConsequences: narrative.pendingConsequences,
        objectives: narrative.objectives,
        tutorial: { ...narrative.tutorial, targetPlanetId: preparedStart.tutorialPlanetId },
        activeShipEncounter: null,
        pursuits: [],
        warFronts,
        legacy: createInitialLegacy(captain, ship, 0, start.id),
        logs: [],
        hydrationStatus: 'ready',
        saveAvailable: true,
        saveError: null,
        recoveryNotice: null,
        saveMeta: emptySaveMeta()
      });
      await persist(set, get, 'new-game', { immediate: true, backup: true });
    }, undefined);
  },
  async resumeGame() {
    return runExclusive('resume', set, get, async () => {
      if (!get().galaxy) await get().hydrateFromStorage();
      if (!get().galaxy || !get().captain || !get().ship || !get().currentSystemId) return false;
      const mode = get().legacy.mode;
      set({ screen: mode === 'succession' ? 'continuity' : mode === 'chronicle' ? 'chronicle' : 'command', saveAvailable: true, saveError: null });
      return true;
    }, false);
  },
  async clearGame() {
    return runExclusive('clear-save', set, get, async () => {
      try {
        await deleteSnapshot();
      } catch (error) {
        console.error('Failed to delete ironman save', error);
      } finally {
        set({
          screen: 'menu', galaxy: null, captain: null, ship: null, currentSystemId: null,
          selectedSystemId: null, gameYear: 0, simulation: null, knowledge: { version: 1, records: {} }, discoveries: [], logs: [], scanReports: [],
          pointsOfInterest: [], evidence: [], hypotheses: [], artifactKnowledge: [], crew: [], crewCandidates: [], factions: [], hubs: [], contracts: [], news: [], locationStates: [], currentHubId: null, localNpcs: [], civilizationContacts: [], archaeologyChains: [], researchProjects: [], technologyBlueprints: [], equipmentInventory: [], worldThreads: [], storyScenes: [], activeStorySceneId: null, pendingConsequences: [], objectives: [], tutorial: { enabled: false, active: false, currentStep: 0, completed: true }, activeShipEncounter: null, pursuits: [], warFronts: [], legacy: emptyLegacyState(),
          hydrationStatus: 'ready', saveAvailable: false, saveError: null,
          saveStatus: 'idle', saveMeta: null, backupCount: 0, recoveryNotice: null
        });
      }
    }, undefined);
  },
  async triggerCaptainLoss(reason, condition = 'dead', pointOfInterestId) {
    return runExclusive('captain-loss', set, get, async () => {
      const { captain, ship, galaxy, currentSystemId, gameYear, crew, legacy } = get();
      if (!captain || !ship || !galaxy || !currentSystemId || legacy.mode === 'succession' || legacy.mode === 'chronicle') return;
      const stats = {
        systemsVisited: galaxy.systems.filter((entry) => entry.visited).length,
        discoveries: get().discoveries.length,
        battles: get().logs.filter((entry) => /бой|абордаж|сражение/i.test(entry.title)).length
      };
      let nextLegacy = closeCurrentCaptain(legacy, captain, ship, crew, gameYear, currentSystemId, condition, reason, stats);
      nextLegacy = { ...nextLegacy, mode: 'succession', campaignEnded: true, successionCandidates: [] };
      if (pointOfInterestId) {
        nextLegacy = {
          ...nextLegacy,
          lostExpeditions: [{
            id: `lost_expedition_${pointOfInterestId}_${gameYear}`,
            year: gameYear,
            systemId: currentSystemId,
            pointOfInterestId,
            captainRecordId: legacy.currentCaptainRecordId,
            crewIds: crew.filter((entry) => entry.status !== 'deceased').map((entry) => entry.id),
            cargoIds: ship.cargo.map((entry) => entry.id),
            status: 'unrecovered' as const,
            summary: `Экспедиция потеряна у объекта ${pointOfInterestId}. Архив, снаряжение и следы остались на месте.`
          }, ...nextLegacy.lostExpeditions].slice(0, 100)
        };
      }
      const nextCaptain = { ...captain, alive: condition !== 'dead', condition, health: condition === 'dead' ? 0 : captain.health };
      set({
        captain: nextCaptain,
        legacy: nextLegacy,
        screen: 'continuity',
        activeShipEncounter: null,
        activeStorySceneId: null,
        logs: [makeLog(gameYear, 'Командование прервано', reason, 'danger'), ...get().logs]
      });
      await persist(set, get, 'captain-loss', { immediate: true, backup: true });
    }, undefined);
  },
  async createMemorial(type) {
    return runExclusive('memorial', set, get, async () => {
      const { legacy, currentSystemId, gameYear } = get();
      if (!currentSystemId) return;
      const record = [...legacy.captains].reverse().find((entry) => entry.endedYear !== undefined && !entry.memorialId);
      if (!record) return;
      const id = `memorial_${record.id}_${type}`;
      const labels = { space: 'погребение в открытом космосе', archive: 'цифровой мемориал архива', homeworld: 'передача останков родному миру', hidden: 'скрытое место памяти' } as const;
      const memorial = { id, captainRecordId: record.id, type, year: gameYear, systemId: currentSystemId, text: `${record.name}: ${labels[type]}.`, public: type !== 'hidden' };
      set({
        legacy: {
          ...legacy,
          memorials: [memorial, ...legacy.memorials].slice(0, 200),
          captains: legacy.captains.map((entry) => entry.id === record.id ? { ...entry, memorialId: id } : entry),
          chronicle: [chronicleEntry({ year: gameYear, category: 'memorial', title: 'Создан мемориал', text: memorial.text, tone: 'info', captainRecordId: record.id, systemId: currentSystemId }), ...legacy.chronicle].slice(0, 1000)
        }
      });
      await persist(set, get, 'memorial');
    }, undefined);
  },
  async enterChronicleMode() {
    return runExclusive('chronicle-mode', set, get, async () => {
      const { legacy, gameYear, currentSystemId } = get();
      set({
        legacy: {
          ...legacy,
          mode: 'chronicle',
          campaignEnded: true,
          observerYear: Math.max(legacy.observerYear, gameYear),
          successionCandidates: [],
          chronicle: [chronicleEntry({ year: gameYear, category: 'world', title: 'Экспедиция завершена', text: 'Командование не восстановлено. Галактика продолжает жить без игрока.', tone: 'warning', systemId: currentSystemId ?? undefined }), ...legacy.chronicle].slice(0, 1000)
        },
        screen: 'chronicle',
        activeShipEncounter: null
      });
      await persist(set, get, 'chronicle-mode', { immediate: true, backup: true });
    }, undefined);
  },
  async advanceChronicle(years) {
    return runExclusive('chronicle-advance', set, get, async () => {
      const state = get();
      if (!state.galaxy || !state.simulation || state.legacy.mode !== 'chronicle') return;
      const span = Math.max(1, Math.min(20, Math.floor(years)));
      const advanced = buildWorldAdvance(state, span * HOURS_PER_YEAR, `chronicle-observation:${span}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const fronts = (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts;
      const active = fronts.filter((entry) => entry.status === 'active');
      const significant = advanced.emittedEvents.filter((entry) => entry.severity >= 4);
      const entry = chronicleEntry({
        year: nextYear,
        category: active.length ? 'war' : 'world',
        title: `${span} лет наблюдения`,
        text: significant.length
          ? `Зафиксировано крупных изменений: ${significant.length}. Активных фронтов: ${active.length}.`
          : 'Галактика продолжила демографические, торговые и политические циклы без участия игрока.',
        tone: active.length || significant.some((event) => event.severity >= 7) ? 'warning' : 'info'
      });
      set({
        ...advanced.patch,
        legacy: { ...state.legacy, observerYear: nextYear, chronicle: [entry, ...state.legacy.chronicle].slice(0, 1000) }
      });
      await persist(set, get, 'chronicle-advance');
    }, undefined);
  },
  async createBackup() {
    return runExclusive('backup', set, get, async () => {
      try {
        const created = await createManualBackup('player-manual');
        const count = await getBackupCount();
        set({ backupCount: count, recoveryNotice: created ? 'Резервная копия ironman-сейва создана.' : 'Активный сейв отсутствует.' });
        return created;
      } catch (error) {
        set({ saveError: snapshotErrorMessage(error), saveStatus: 'error' });
        return false;
      }
    }, false);
  },
  selectSystem(selectedSystemId) { set({ selectedSystemId }); },
  async travelTo(systemId) {
    return runExclusive('travel', set, get, async () => {
      const state = get();
      const { galaxy, ship, currentSystemId } = state;
      if (!galaxy || !ship || !currentSystemId || !state.simulation) return { ok: false, message: 'Нет активной партии' };
      if (state.activeShipEncounter && state.activeShipEncounter.phase !== 'resolved') return { ok: false, message: 'Сначала завершите корабельный контакт' };
      const current = galaxy.systems.find((system) => system.id === currentSystemId);
      const target = galaxy.systems.find((system) => system.id === systemId);
      if (!current || !target) return { ok: false, message: 'Система не найдена' };
      if (!current.neighbors.includes(target.id)) return { ok: false, message: 'Нет прямого маршрута' };
      const jumpDistance = distance(current, target);
      if (jumpDistance > ship.jumpRange) return { ok: false, message: 'Маршрут за пределами дальности двигателя' };
      const engine = ship.systems.find((entry) => entry.id === 'engine');
      if (engine?.disabled) return { ok: false, message: 'Двигатель отключён' };
      const fuelCost = Math.max(7, Math.ceil(jumpDistance / 14));
      if (ship.fuel < fuelCost) return { ok: false, message: `Нужно ${fuelCost} топлива` };
      if (ship.hull <= 0) return { ok: false, message: 'Корабль не способен к прыжку' };

      const arrivalHour = state.simulation.clock.absoluteHour + travelHours(jumpDistance);
      let knowledge = revealKnowledge(state.knowledge, 'system', target.id, ['identity', 'coordinates', 'star', 'routes', 'visited'], arrivalHour, 'direct', 92);
      for (const neighborId of target.neighbors) knowledge = revealKnowledge(knowledge, 'system', neighborId, ['identity', 'coordinates'], arrivalHour, 'scan', 42);
      const updatedShip = { ...ship, systems: normalizeShipSystems(ship.systems), fuel: ship.fuel - fuelCost };
      const advanced = buildWorldAdvance(state, travelHours(jumpDistance), `travel:${current.id}:${target.id}`, { galaxy, knowledge, currentSystemId: target.id });
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const warFronts = advanced.patch.warFronts ?? state.warFronts;
      let activeShipEncounter = createTravelEncounter({
        seed: galaxy.seed,
        system: target,
        factions: state.factions,
        pursuits: state.pursuits,
        warFronts,
        year: nextYear,
        serial: state.logs.length + state.storyScenes.length + (advanced.patch.simulation?.nextSequence ?? 0)
      });
      if (activeShipEncounter) activeShipEncounter = { ...activeShipEncounter, stationAssignments: buildStationAssignments(state.crew) };
      const encounter = activeShipEncounter ? 'shipContact' as const : undefined;
      const targetFaction = state.factions.find((entry) => entry.id === target.factionId);
      const hasCivilianHub = state.hubs.some((hub) => hub.systemId === target.id && hub.safety !== 'danger');
      const logs = [makeLog(nextYear, 'Прыжок завершён', `${current.name} → ${target.name}. Потрачено ${fuelCost} топлива.`, 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)];
      if (activeShipEncounter) logs.unshift(makeLog(nextYear, 'Корабельный контакт', `${activeShipEncounter.contact.name}: ${activeShipEncounter.contact.demand}`, activeShipEncounter.contact.hostile ? 'danger' : 'warning'));
      else if (targetFaction?.disposition === 'friendly' || hasCivilianHub) logs.unshift(makeLog(nextYear, 'Гражданский контроль', 'Диспетчер передал коридор движения и список открытых портов.', 'good'));
      const generatedScene = activeShipEncounter ? null : generateTravelScene(galaxy.seed, current.id, target.id, target.name, nextYear, state.hubs, state.factions);
      const storyScenes = [
        ...(generatedScene ? [generatedScene] : []),
        ...((advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes)
      ].slice(0, 160);
      const pursuits = state.pursuits.map((entry) => entry.status === 'active' && (entry.knownIdentity || entry.knownTransponder) ? { ...entry, lastKnownSystemId: target.id, lastUpdateYear: nextYear } : entry);
      set({
        ...advanced.patch,
        knowledge,
        ship: updatedShip,
        currentSystemId: target.id,
        selectedSystemId: target.id,
        currentHubId: null,
        logs: logs.slice(0, 750),
        storyScenes,
        activeStorySceneId: generatedScene?.id ?? null,
        activeShipEncounter,
        pursuits
      });
      await persist(set, get, activeShipEncounter ? 'travel-contact' : 'travel');
      return { ok: true, message: activeShipEncounter ? 'Перелёт завершён. Обнаружен корабельный контакт.' : 'Перелёт завершён', encounter };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async assignCombatStation(systemId, crewId) {
    const encounter = get().activeShipEncounter;
    if (!encounter || encounter.phase === 'resolved') return;
    const crew = get().crew;
    if (crewId && !crew.some((entry) => entry.id === crewId && entry.status === 'active')) return;
    const assignments = { ...encounter.stationAssignments };
    for (const key of Object.keys(assignments) as ShipSystemId[]) if (assignments[key] === crewId) delete assignments[key];
    if (crewId) assignments[systemId] = crewId;
    else delete assignments[systemId];
    set({ activeShipEncounter: { ...encounter, stationAssignments: assignments } });
    await persist(set, get, 'combat-stations');
  },
  async respondToShipContact(action) {
    return runExclusive('ship-contact', set, get, async () => {
      const encounter = get().activeShipEncounter;
      const captain = get().captain;
      const ship = get().ship;
      if (!encounter || encounter.phase !== 'contact' || !captain || !ship) return { ok: false, message: 'Контакт недоступен' };
      const rng = createRng(`${get().galaxy?.seed}:${encounter.id}:contact:${action}`);
      const diplomat = get().crew.find((entry) => entry.primaryRole === 'diplomat' && entry.status === 'active');
      const pilot = get().crew.find((entry) => entry.primaryRole === 'pilot' && entry.status === 'active');
      const smuggler = get().crew.find((entry) => entry.primaryRole === 'smuggler' && entry.status === 'active');
      const illegalCargo = ship.cargo.filter((entry) => entry.illegal);
      let nextEncounter = structuredClone(encounter);
      let nextCaptain = captain;
      let nextShip = ship;
      let pursuits = get().pursuits;
      let message = '';
      let tone: GameLogEntry['tone'] = 'info';

      const resolvePeacefully = (text: string) => {
        nextEncounter = { ...nextEncounter, phase: 'resolved', outcome: 'peaceful', combatLog: [text, ...nextEncounter.combatLog] };
        message = text;
        tone = 'good';
      };
      const startCombat = (text: string) => {
        nextEncounter = { ...nextEncounter, phase: 'combat', contact: { ...nextEncounter.contact, hostile: true }, combatLog: [text, ...nextEncounter.combatLog] };
        message = text;
        tone = 'danger';
      };
      const addPursuit = (reason: string, intensity: number) => {
        const sourceName = get().factions.find((entry) => entry.id === encounter.contact.factionId)?.name ?? encounter.contact.name;
        const existing = pursuits.find((entry) => entry.sourceFactionId === encounter.contact.factionId && entry.status === 'active');
        if (existing) pursuits = pursuits.map((entry) => entry.id === existing.id ? { ...entry, intensity: Math.min(100, entry.intensity + intensity), lastKnownSystemId: encounter.contact.systemId, lastUpdateYear: get().gameYear } : entry);
        else pursuits = [{ id: `pursuit_${encounter.id}`, sourceFactionId: encounter.contact.factionId, sourceName, reason, intensity, knownIdentity: encounter.contact.knowsIdentity, knownTransponder: encounter.contact.knowsTransponder, knownShipProfile: true, lastKnownSystemId: encounter.contact.systemId, createdYear: get().gameYear, lastUpdateYear: get().gameYear, status: 'active' }, ...pursuits];
      };

      if (action === 'communicate') {
        const chance = 0.35 + (diplomat ? 0.3 : 0) + systemIntegrity(ship.systems, 'comms') / 350 - encounter.contact.threat / 260;
        if (!encounter.contact.hostile || rng.chance(chance)) resolvePeacefully(encounter.contact.intent === 'trade' ? 'Канал подтверждён. Контакт передал навигационные данные и разошёлся мирно.' : 'Переговоры сняли угрозу. Корабли расходятся без огня.');
        else startCombat('Переговоры сорваны. Контакт открывает огонь.');
      } else if (action === 'documents') {
        if (encounter.contact.intent !== 'inspection') resolvePeacefully('Документы приняты, но контакту они не были нужны. Корабли расходятся.');
        else if (!illegalCargo.length || rng.chance(0.2 + (smuggler ? 0.42 : 0))) resolvePeacefully('Регистрация и манифест приняты. Досмотр завершён без задержания.');
        else {
          addPursuit('Контрабанда и сопротивление досмотру', 38);
          startCombat('Сканеры обнаружили запрещённый груз. Патруль блокирует двигатель.');
        }
      } else if (action === 'bribe') {
        const cost = Math.max(120, Math.round(encounter.contact.threat * 8));
        if (captain.credits < cost) return { ok: false, message: `Нужно ${cost} кредитов` };
        nextCaptain = { ...captain, credits: captain.credits - cost };
        if (encounter.contact.kind === 'military' && rng.chance(0.35)) {
          addPursuit('Попытка подкупа военного патруля', 28);
          startCombat('Офицер фиксирует попытку подкупа и отдаёт приказ на задержание.');
        } else resolvePeacefully(`Передано ${cost} кредитов. Контакт отключает захват.`);
      } else if (action === 'hideCargo') {
        if (!illegalCargo.length) resolvePeacefully('Скрывать нечего. Проверка не обнаружила нарушений.');
        else if (rng.chance(0.22 + (smuggler ? 0.46 : 0) + systemIntegrity(ship.systems, 'cargo') / 500)) resolvePeacefully('Тайники выдержали досмотр. Запрещённый груз не обнаружен.');
        else {
          addPursuit('Сокрытие запрещённого груза', 44);
          startCombat('Тайник вскрыт. Контакт требует немедленной сдачи.');
        }
      } else if (action === 'help') {
        if (!['distress', 'trade'].includes(encounter.contact.intent)) return { ok: false, message: 'Контакт не просит помощи' };
        const fuelGift = Math.min(10, ship.fuel - 8);
        if (fuelGift <= 0) return { ok: false, message: 'Нет запаса для помощи' };
        nextShip = { ...ship, fuel: ship.fuel - fuelGift };
        nextCaptain = { ...captain, reputation: captain.reputation + 2 };
        resolvePeacefully(`Передано ${fuelGift} единиц топлива. Контакт запомнил помощь.`);
      } else if (action === 'attack') {
        if (['patrol', 'military'].includes(encounter.contact.kind)) addPursuit('Нападение на официальный корабль', 62);
        startCombat('Первый залп произведён без предупреждения.');
      } else if (action === 'escape') {
        const chance = 0.28 + (pilot ? 0.28 : 0) + systemIntegrity(ship.systems, 'engine') / 300 + encounter.range * 0.08 - encounter.contact.threat / 320;
        if (rng.chance(chance)) {
          nextEncounter = { ...nextEncounter, phase: 'resolved', outcome: 'escaped', combatLog: ['Контакт потерян на манёвре.', ...nextEncounter.combatLog] };
          message = 'Контакт потерян. Корабль уходит.';
          tone = 'good';
        } else startCombat('Манёвр раскрыт. Противник перехватывает курс и открывает огонь.');
      } else if (action === 'surrender') {
        const lost = ship.cargo.slice(0, Math.max(1, Math.ceil(ship.cargo.length / 2)));
        nextShip = { ...ship, cargo: ship.cargo.filter((entry) => !lost.some((lostItem) => lostItem.id === entry.id)), hull: Math.max(18, ship.hull - 8) };
        nextEncounter = { ...nextEncounter, phase: 'resolved', outcome: 'surrendered', combatLog: ['Корабль подчинился требованиям контакта.', ...nextEncounter.combatLog] };
        message = lost.length ? `Сдано без боя. Потеряно груза: ${lost.length}.` : 'Сдано без боя. Контакт отпускает корабль после проверки.';
        tone = 'warning';
      }

      set({ activeShipEncounter: nextEncounter, captain: nextCaptain, ship: nextShip, pursuits, logs: [makeLog(get().gameYear, 'Корабельный контакт', message, tone), ...get().logs] });
      await persist(set, get, `ship-contact-${action}`, { immediate: true });
      return { ok: true, message };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async shipCombatAction(action) {
    return runExclusive('ship-combat', set, get, async () => {
      const encounter = get().activeShipEncounter;
      const ship = get().ship;
      const captain = get().captain;
      if (!encounter || encounter.phase !== 'combat' || !ship || !captain) return { ok: false, message: 'Бой не активен' };
      const rng = createRng(`${get().galaxy?.seed}:${encounter.id}:turn:${encounter.turn}:${action}`);
      const assigned = (systemId: ShipSystemId) => get().crew.find((entry) => entry.id === encounter.stationAssignments[systemId] && entry.status === 'active');
      const pilotBonus = assigned('engine')?.primaryRole === 'pilot' || assigned('engine')?.secondaryRole === 'pilot' ? 0.2 : assigned('engine') ? 0.08 : 0;
      const engineerBonus = assigned('reactor')?.primaryRole === 'engineer' || assigned('reactor')?.secondaryRole === 'engineer' ? 0.16 : assigned('reactor') ? 0.06 : 0;
      const soldierBonus = assigned('weapons')?.primaryRole === 'soldier' || assigned('weapons')?.secondaryRole === 'soldier' ? 0.18 : assigned('weapons') ? 0.06 : 0;
      const diplomatBonus = assigned('comms')?.primaryRole === 'diplomat' || assigned('comms')?.secondaryRole === 'diplomat' ? 0.22 : assigned('comms') ? 0.06 : 0;
      let next = structuredClone(encounter);
      let nextShip = { ...ship, systems: normalizeShipSystems(ship.systems) };
      let nextCaptain = captain;
      let pursuits = get().pursuits;
      let nextLegacy = get().legacy;
      let nextScreen = get().screen;
      let nextActiveEncounter: ShipEncounterState | null = next;
      let message = '';
      const append = (text: string) => { next.combatLog = [text, ...next.combatLog].slice(0, 18); message = text; };
      const enemySystem = (id: ShipSystemId) => next.enemy.systems.find((entry) => entry.id === id);
      const installedWeaponBonus = ship.modules.filter((entry) => entry.slot === 'weapon').reduce((sum, entry) => sum + entry.rarity * 2, 0);
      const weaponIntegrity = systemIntegrity(nextShip.systems, 'weapons');

      if (action === 'fire' || action === 'targetEngine' || action === 'targetWeapons') {
        if (weaponIntegrity <= 0) return { ok: false, message: 'Вооружение отключено' };
        const targeted = action !== 'fire';
        const accuracy = 0.58 + soldierBonus + weaponIntegrity / 420 - (targeted ? 0.16 : 0) - next.range * 0.035;
        if (rng.chance(accuracy)) {
          const damage = Math.max(6, Math.round(12 + installedWeaponBonus + weaponIntegrity / 9 - next.range * 2 + rng.int(-4, 6)));
          next.enemy.hull = Math.max(0, next.enemy.hull - damage);
          if (targeted) {
            const targetId: ShipSystemId = action === 'targetEngine' ? 'engine' : 'weapons';
            next.enemy.systems = damageSystem(next.enemy.systems, targetId, Math.round(damage * 1.35));
            append(`Прицельное попадание: ${enemySystem(targetId)?.label ?? targetId}, урон корпусу ${damage}.`);
          } else append(`Залп наносит ${damage} урона корпусу противника.`);
        } else append('Залп проходит мимо цели.');
      } else if (action === 'close') {
        next.range = Math.max(1, next.range - 1) as 1 | 2 | 3 | 4;
        append('Корабль сокращает дистанцию.');
      } else if (action === 'withdraw') {
        next.range = Math.min(4, next.range + 1) as 1 | 2 | 3 | 4;
        append('Корабль уходит на дальнюю дистанцию.');
      } else if (action === 'evade') {
        if (systemIntegrity(nextShip.systems, 'engine') <= 0) return { ok: false, message: 'Двигатель отключён' };
        next.evasion = Math.min(70, 28 + Math.round(pilotBonus * 100) + Math.round(systemIntegrity(nextShip.systems, 'engine') / 5));
        append('Пилот уводит корабль в уклоняющийся манёвр.');
      } else if (action === 'jump') {
        if (next.range < 3) return { ok: false, message: 'Слишком близко для аварийного прыжка' };
        if (systemIntegrity(nextShip.systems, 'engine') < 25 || systemIntegrity(nextShip.systems, 'reactor') < 25) return { ok: false, message: 'Двигатель или реактор не держит прыжок' };
        const chance = 0.32 + pilotBonus + systemIntegrity(nextShip.systems, 'engine') / 300;
        if (rng.chance(chance)) {
          next.phase = 'resolved'; next.outcome = 'escaped'; append('Аварийный прыжок выполнен. Контакт потерян.');
          nextShip = { ...nextShip, fuel: Math.max(0, nextShip.fuel - 12) };
        } else append('Контур прыжка сорван вражескими помехами.');
      } else if (action === 'negotiate') {
        if (systemIntegrity(nextShip.systems, 'comms') <= 0) return { ok: false, message: 'Связь отключена' };
        const chance = 0.18 + diplomatBonus + (100 - next.enemy.morale) / 180 + systemIntegrity(nextShip.systems, 'comms') / 450;
        if (rng.chance(chance)) { next.phase = 'resolved'; next.outcome = 'peaceful'; append('Противник принимает прекращение огня и отходит.'); }
        else append('Противник отвергает предложение.');
      } else if (action === 'board') {
        if (!next.canBoard || next.range !== 1) return { ok: false, message: 'Абордаж пока невозможен' };
        next.phase = 'boarding'; append('Шлюзовой захват установлен. Начинается абордаж.');
      }

      if (next.enemy.hull <= 0) {
        next.phase = 'resolved'; next.outcome = 'destroyed'; append('Вражеский корабль разрушен. Обломки расходятся по орбите.');
        nextCaptain = { ...captain, credits: captain.credits + Math.round(next.enemy.cargoValue * 0.22), reputation: captain.reputation + 1 };
      } else {
        const engineDown = systemIntegrity(next.enemy.systems, 'engine') <= 15;
        const weaponsDown = systemIntegrity(next.enemy.systems, 'weapons') <= 15;
        next.canBoard = engineDown && (weaponsDown || next.enemy.hull <= next.enemy.maxHull * 0.35);
      }

      if (next.phase === 'combat') {
        const enemyWeapons = systemIntegrity(next.enemy.systems, 'weapons');
        if (enemyWeapons > 0) {
          const hitChance = Math.max(0.18, 0.66 + next.range * -0.045 - next.evasion / 100);
          if (rng.chance(hitChance)) {
            let damage = Math.max(4, Math.round(8 + enemyWeapons / 11 - next.range + rng.int(-3, 5) - engineerBonus * 8));
            if (next.brace) damage = Math.round(damage * 0.65);
            const targetIds: ShipSystemId[] = ['engine', 'reactor', 'weapons', 'sensors', 'comms', 'lifeSupport', 'cargo'];
            const targetId = rng.pick(targetIds);
            const systemDamage = Math.max(4, Math.round(damage * (0.65 + rng.next() * 0.7)));
            nextShip = { ...nextShip, hull: Math.max(0, nextShip.hull - damage), systems: damageSystem(nextShip.systems, targetId, systemDamage) };
            append(`Ответный огонь: корпус -${damage}, система «${nextShip.systems.find((entry) => entry.id === targetId)?.label}» -${systemDamage}.`);
          } else append('Ответный залп противника проходит мимо.');
        }
        next.turn += 1;
        next.evasion = Math.max(0, next.evasion - 20);
      }

      if (nextShip.hull <= 0) {
        const cargoLoss = nextShip.cargo.slice(0, Math.ceil(nextShip.cargo.length / 2));
        nextShip = {
          ...nextShip,
          hull: Math.max(8, Math.round(nextShip.maxHull * 0.12)),
          cargo: nextShip.cargo.filter((entry) => !cargoLoss.some((lost) => lost.id === entry.id)),
          statuses: [...new Set([...nextShip.statuses, 'аварийное состояние', 'внешний захват'])],
          systems: nextShip.systems.map((entry) => entry.id === 'lifeSupport' ? { ...entry, integrity: Math.max(12, entry.integrity), disabled: false } : entry)
        };
        nextCaptain = { ...nextCaptain, alive: true, condition: 'captured', credits: Math.max(-2500, nextCaptain.credits - 650) };
        next.phase = 'resolved'; next.outcome = 'captured'; append(`Корабль обездвижен. Потеряно ${cargoLoss.length} единиц груза, наложен долг 650 кредитов.`);
        const galaxy = get().galaxy;
        const currentSystemId = get().currentSystemId;
        if (galaxy && currentSystemId && nextLegacy.mode !== 'succession' && nextLegacy.mode !== 'chronicle') {
          const stats = {
            systemsVisited: galaxy.systems.filter((entry) => entry.visited).length,
            discoveries: get().discoveries.length,
            battles: get().logs.filter((entry) => /бой|абордаж|сражение/i.test(entry.title)).length + 1
          };
          nextLegacy = closeCurrentCaptain(
            nextLegacy,
            nextCaptain,
            nextShip,
            get().crew,
            get().gameYear,
            currentSystemId,
            'captured',
            'Капитан захвачен после уничтожения боеспособности корабля.',
            stats
          );
          nextLegacy = { ...nextLegacy, mode: 'succession', campaignEnded: true, successionCandidates: [] };
          nextScreen = 'continuity';
          nextActiveEncounter = null;
        }
      }

      set({ activeShipEncounter: nextActiveEncounter, ship: nextShip, captain: nextCaptain, pursuits, legacy: nextLegacy, screen: nextScreen, logs: [makeLog(get().gameYear, 'Корабельный бой', message, next.outcome ? (next.outcome === 'captured' ? 'danger' : 'good') : 'warning'), ...get().logs] });
      await persist(set, get, `ship-combat-${action}`, { immediate: true });
      return { ok: true, message };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async boardingAction(action) {
    return runExclusive('boarding', set, get, async () => {
      const encounter = get().activeShipEncounter;
      const ship = get().ship;
      const captain = get().captain;
      if (!encounter || encounter.phase !== 'boarding' || !ship || !captain) return { ok: false, message: 'Абордаж не активен' };
      const rng = createRng(`${get().galaxy?.seed}:${encounter.id}:boarding:${encounter.boardingProgress}:${action}`);
      const soldiers = get().crew.filter((entry) => entry.primaryRole === 'soldier' && entry.status === 'active').length;
      const doctors = get().crew.filter((entry) => entry.primaryRole === 'doctor' && entry.status === 'active').length;
      let next = structuredClone(encounter);
      let nextShip = ship;
      let nextCaptain = captain;
      let message = '';
      const chance = 0.48 + soldiers * 0.16 + captain.skills.combat * 0.04 - next.enemy.crew * 0.018;
      if (action === 'withdraw') {
        next.phase = 'combat'; next.range = 1; message = 'Абордажная группа отходит на свой корабль.';
      } else if (action === 'cargo') {
        const loot = Math.max(120, Math.round(next.enemy.cargoValue * 0.45));
        nextCaptain = { ...captain, credits: captain.credits + loot };
        next.boardingProgress += 25;
        message = `Грузовой отсек вскрыт. Получено ${loot} кредитов.`;
      } else if (action === 'rescue') {
        next.boardingProgress += 20 + doctors * 10;
        nextCaptain = { ...captain, reputation: captain.reputation + 2 };
        message = 'Пленные и раненые эвакуированы на «Странник». Репутация повышена.';
      } else if (action === 'sabotage') {
        if (rng.chance(chance + 0.08)) { next.phase = 'resolved'; next.outcome = 'boarded'; message = 'Реактор противника выведен из строя. Корабль оставлен дрейфовать.'; }
        else { next.boardingProgress += 10; message = 'Доступ к реактору не получен. Группа несёт потери и отступает в коридор.'; }
      } else if (action === 'bridge') {
        if (rng.chance(chance + next.boardingProgress / 220)) {
          next.boardingProgress = 100; next.phase = 'resolved'; next.outcome = 'boarded';
          const prize = Math.max(450, Math.round(next.enemy.cargoValue * 0.75));
          nextCaptain = { ...captain, credits: captain.credits + prize, reputation: captain.reputation + 1 };
          message = `Мостик захвачен. Корабль и данные проданы за ${prize} кредитов.`;
        } else { next.boardingProgress += 18 + soldiers * 8; message = 'Штурм мостика остановлен у бронированной переборки.'; }
      }
      next.combatLog = [message, ...next.combatLog].slice(0, 18);
      set({ activeShipEncounter: next, ship: nextShip, captain: nextCaptain, logs: [makeLog(get().gameYear, 'Абордаж', message, next.phase === 'resolved' ? 'good' : 'warning'), ...get().logs] });
      await persist(set, get, `boarding-${action}`, { immediate: true });
      return { ok: true, message };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async closeShipEncounter() {
    const encounter = get().activeShipEncounter;
    if (!encounter || encounter.phase !== 'resolved') return;
    set({ activeShipEncounter: null });
    await persist(set, get, 'ship-encounter-close', { immediate: true });
  },
  async changeTransponder() {
    return runExclusive('transponder', set, get, async () => {
      const state = get();
      const captain = state.captain;
      const ship = state.ship;
      if (!captain || !ship) return { ok: false, message: 'Корабль недоступен' };
      const cost = 420;
      if (captain.credits < cost) return { ok: false, message: `Нужно ${cost} кредитов` };
      const advanced = buildWorldAdvance(state, ACTION_TIME.transponderChange, 'transponder-change');
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const code = `GHOST-${Math.abs(((advanced.patch.simulation?.clock.absoluteHour ?? 0) + state.logs.length) * 7919).toString(36).toUpperCase()}`;
      const pursuits = state.pursuits.map((entry) => entry.status === 'active' ? { ...entry, knownTransponder: false, intensity: Math.max(5, entry.intensity - 18) } : entry);
      set({
        ...advanced.patch,
        captain: { ...captain, credits: captain.credits - cost },
        ship: { ...ship, transponder: code },
        pursuits,
        logs: [makeLog(nextYear, 'Транспондер заменён', `Новый позывной: ${code}. Старые ориентировки частично потеряли силу.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'transponder-change', { immediate: true });
      return { ok: true, message: 'Транспондер заменён' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async scanSystem(systemId) {
    return runExclusive('system-scan', set, get, async () => {
      const state = get();
      const { galaxy, simulation } = state;
      if (!galaxy || !simulation || systemId !== state.currentSystemId) return;
      const system = galaxy.systems.find((entry) => entry.id === systemId);
      if (!system) return;
      const atHour = simulation.clock.absoluteHour + ACTION_TIME.systemScan;
      let knowledge = revealKnowledge(state.knowledge, 'system', system.id, ['identity', 'coordinates', 'star', 'planets', 'routes', 'danger', 'civilizations', 'fullScan', 'visited'], atHour, 'scan', 96);
      for (const neighborId of system.neighbors) knowledge = revealKnowledge(knowledge, 'system', neighborId, ['identity', 'coordinates'], atHour, 'scan', 48);
      for (const planet of system.planets) knowledge = revealKnowledge(knowledge, 'planet', planet.id, ['identity', 'orbit', 'type'], atHour, 'scan', 54);
      const advanced = buildWorldAdvance(state, ACTION_TIME.systemScan, `scan-system:${system.id}`, { knowledge });
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const civilizationContacts = state.civilizationContacts.map((contact) => system.civilizationIds.includes(contact.civilizationId) && contact.stage === 'unknown' ? {
        ...contact,
        stage: 'observed' as const,
        lastContactYear: nextYear,
        notes: [...contact.notes, `Зафиксированы признаки присутствия в системе ${system.name}.`].slice(-12)
      } : contact);
      const report: ScanReport = {
        id: `scan_system_${system.id}_${simulation.clock.absoluteHour}`,
        systemId: system.id,
        level: 1,
        confidence: 54,
        createdYear: nextYear,
        summary: `Определены орбиты ${system.planets.length} планет. Детальные сигналы требуют фокусировки сканера.`,
        warnings: system.anomaly ? ['В системе присутствуют нестабильные показания.'] : [],
        detectedPointOfInterestIds: []
      };
      const tutorial = state.tutorial;
      const tutorialUpdate = tutorial.active && tutorial.currentStep === 1 ? { ...tutorial, currentStep: 2 } : tutorial;
      const scanScene = generateScanScene(galaxy.seed, system.id, system.name, nextYear);
      const storyScenes = scanScene && !state.storyScenes.some((scene) => scene.id === scanScene.id) ? [scanScene, ...((advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes)].slice(0, 160) : ((advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes);
      set({
        ...advanced.patch,
        knowledge,
        tutorial: tutorialUpdate,
        scanReports: [report, ...state.scanReports.filter((entry) => entry.id !== report.id)],
        civilizationContacts,
        storyScenes,
        activeStorySceneId: scanScene?.id ?? null,
        logs: [makeLog(nextYear, `Система ${system.name} просканирована`, 'Получены орбиты, первичные характеристики планет и признаки разумной активности.', 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'system-scan');
    }, undefined);
  },
  async detailedScanPlanet(planetId) {
    return runExclusive('detail-scan', set, get, async () => {
      const state = get();
      const { galaxy, currentSystemId, simulation } = state;
      if (!galaxy || !currentSystemId || !simulation) return { ok: false, message: 'Нет активной системы' };
      const system = galaxy.systems.find((entry) => entry.id === currentSystemId);
      const planet = system?.planets.find((entry) => entry.id === planetId);
      if (!system || !planet || !system.scanned) return { ok: false, message: 'Сначала выполните системный скан' };
      const atHour = simulation.clock.absoluteHour + ACTION_TIME.planetScan;
      let knowledge = revealKnowledge(state.knowledge, 'planet', planet.id, ['identity', 'orbit', 'type', 'habitability', 'danger', 'signals', 'life', 'civilization'], atHour, 'scan', 88);
      const ecology = simulation.ecosystems[planet.id];
      if (ecology) {
        knowledge = revealKnowledge(knowledge, 'ecosystem', planet.id, ['biomes', 'biomass', 'biodiversity', 'climate', 'resources', 'foodWeb', 'pathogens'], atHour, 'scan', 76);
      }
      const advanced = buildWorldAdvance(state, ACTION_TIME.planetScan, `scan-planet:${planet.id}`, { knowledge });
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const projectedGalaxy = advanced.patch.galaxy as Galaxy | undefined;
      const projectedSystem = projectedGalaxy?.systems.find((entry) => entry.id === system.id) ?? system;
      const projectedPlanet = projectedSystem.planets.find((entry) => entry.id === planet.id) ?? planet;
      const existing = state.pointsOfInterest.filter((entry) => entry.planetId === planetId);
      const generated = existing.length > 0 ? existing : generatePointsOfInterest(projectedGalaxy ?? galaxy, projectedSystem, projectedPlanet).map((entry) => ({ ...entry, discoveredYear: nextYear }));
      const allPoints = existing.length > 0 ? state.pointsOfInterest : [...generated, ...state.pointsOfInterest];
      const archaeologyChains = bindArchaeologyPoints(state.archaeologyChains, allPoints);
      const civilizationContacts = state.civilizationContacts.map((contact) => planet.civilizationId === contact.civilizationId && (contact.stage === 'unknown' || contact.stage === 'observed') ? {
        ...contact,
        stage: 'signals' as const,
        lastContactYear: nextYear,
        notes: [...contact.notes, `Детальный скан ${planet.name} выделил искусственные сигналы.`].slice(-12)
      } : contact);
      const report: ScanReport = {
        id: `scan_planet_${planet.id}_${simulation.clock.absoluteHour}`,
        systemId: system.id,
        planetId: planet.id,
        level: 2,
        confidence: Math.min(92, 55 + planet.habitability / 3),
        createdYear: nextYear,
        summary: ecology
          ? `Обнаружено ${generated.length} сигналов. Биомов: ${ecology.biomes.length}, видов в каталоге: ${ecology.species.filter((entry) => entry.status !== 'extinct').length}.`
          : `Обнаружено ${generated.length} сигналов. Часть угроз может быть скрыта средой.`,
        warnings: generated.filter((entry) => entry.danger === 'danger' || entry.danger === 'extreme').map((entry) => `${entry.name}: повышенная угроза`).slice(0, 3),
        detectedPointOfInterestIds: generated.map((entry) => entry.id)
      };
      const signalDiscoveries: Discovery[] = generated.map((entry) => ({
        id: `disc_signal_${entry.id}`,
        kind: entry.type === 'biosphere' ? 'biosphere' : entry.type === 'settlement' ? 'settlement' : entry.type === 'anomaly' ? 'anomaly' : 'signal',
        name: entry.name,
        systemId: system.id,
        planetId: planet.id,
        pointOfInterestId: entry.id,
        description: entry.publicSummary,
        confidence: entry.scanConfidence,
        year: nextYear,
        tags: [entry.type, entry.danger]
      }));
      const unique = signalDiscoveries.filter((entry) => !state.discoveries.some((existingEntry) => existingEntry.id === entry.id));
      let captain = state.captain;
      let factions = (advanced.patch.factions as Faction[] | undefined) ?? state.factions;
      let reward = 0;
      const baseContracts = (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts;
      const contracts = baseContracts.map((contract) => {
        if (contract.status !== 'active' || contract.type !== 'survey' || contract.targetSystemId !== system.id) return contract;
        reward += contract.reward;
        factions = adjustFactionStanding(factions, contract.issuerFactionId, nextYear, 'contract-complete', 6, `Выполнен контракт «${contract.title}».`);
        return completedContract(contract, nextYear);
      });
      if (captain && reward > 0) captain = { ...captain, credits: captain.credits + reward, reputation: captain.reputation + 2 };
      const tutorial = state.tutorial;
      const tutorialPoint = generated.find((entry) => entry.planetId === tutorial.targetPlanetId) ?? generated[0];
      const tutorialUpdate = tutorial.active && tutorial.currentStep === 3 ? { ...tutorial, currentStep: 4, targetPointOfInterestId: tutorialPoint?.id ?? tutorial.targetPointOfInterestId } : tutorial;
      const scanScene = generateScanScene(galaxy.seed, system.id, system.name, nextYear, planet.name);
      const storyScenes = scanScene && !state.storyScenes.some((scene) => scene.id === scanScene.id) ? [scanScene, ...((advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes)].slice(0, 160) : ((advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes);
      const advancedSimulation = advanced.patch.simulation as SimulationState;
      set({
        ...advanced.patch,
        knowledge,
        tutorial: tutorialUpdate,
        pointsOfInterest: allPoints,
        scanReports: [report, ...state.scanReports],
        discoveries: [...unique, ...state.discoveries],
        contracts,
        factions,
        captain,
        archaeologyChains,
        civilizationContacts,
        storyScenes,
        activeStorySceneId: scanScene?.id ?? null,
        worldThreads: projectWorldThreads({ simulation: advancedSimulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions, contracts, research: state.researchProjects }),
        logs: [makeLog(nextYear, `Детальный скан: ${planet.name}`, `${ecology ? `Экосистема: биомасса ${ecology.biomass}/100, разнообразие ${ecology.biodiversity}/100. ` : ''}Обнаружено ${generated.length} точек интереса.${reward ? ` Контракт закрыт: +${reward} кредитов.` : ''}`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'detail-scan');
      return { ok: true, message: `Обнаружено сигналов: ${generated.length}` };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async investigatePoint(pointId) {
    return runExclusive('investigate-point', set, get, async () => {
      const state = get();
      const { galaxy, captain } = state;
      const point = state.pointsOfInterest.find((entry) => entry.id === pointId);
      if (!galaxy || !captain || !point) return { ok: false, message: 'Сигнал недоступен' };
      if (point.status === 'resolved') return { ok: false, message: 'Сигнал уже исследован' };
      if (point.access === 'surface') return { ok: false, message: 'Для этой цели требуется высадка' };
      const system = galaxy.systems.find((entry) => entry.id === point.systemId);
      const planet = system?.planets.find((entry) => entry.id === point.planetId);
      if (!system || !planet) return { ok: false, message: 'Источник сигнала потерян' };
      const method = point.access === 'orbital' ? 'Орбитальный анализ' : 'Дистанционный анализ';
      const hours = point.access === 'orbital' ? ACTION_TIME.orbitalSignal : ACTION_TIME.remoteSignal;
      const advanced = buildWorldAdvance(state, hours, `investigate:${point.id}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const discovery: Discovery = {
        id: `disc_remote_${point.id}`,
        kind: point.type === 'biosphere' ? 'biosphere' : point.type === 'settlement' ? 'settlement' : point.type === 'anomaly' ? 'anomaly' : 'signal',
        name: point.name,
        systemId: point.systemId,
        planetId: point.planetId,
        pointOfInterestId: point.id,
        description: `${method} завершён. ${point.publicSummary}`,
        confidence: Math.max(point.scanConfidence, point.access === 'orbital' ? 86 : 74),
        year: nextYear,
        tags: [point.type, point.access, point.danger]
      };
      const scanScene = generateScanScene(galaxy.seed, system.id, system.name, nextYear, point.name);
      const storyScenes = scanScene && !state.storyScenes.some((scene) => scene.id === scanScene.id) ? [scanScene, ...((advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes)].slice(0, 160) : ((advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes);
      const civilizationContacts = state.civilizationContacts.map((contact) => point.civilizationId === contact.civilizationId && ['unknown','observed'].includes(contact.stage) ? {
        ...contact,
        stage: 'signals' as const,
        lastContactYear: nextYear,
        notes: [...contact.notes, `${method} сигнала «${point.name}» подтвердил искусственное происхождение.`].slice(-12)
      } : contact);
      set({
        ...advanced.patch,
        pointsOfInterest: state.pointsOfInterest.map((entry) => entry.id === point.id ? { ...entry, status: 'resolved' as const, visits: entry.visits + 1, lastVisitedYear: nextYear } : entry),
        discoveries: state.discoveries.some((entry) => entry.id === discovery.id) ? state.discoveries : [discovery, ...state.discoveries],
        civilizationContacts,
        storyScenes,
        activeStorySceneId: scanScene?.id ?? null,
        logs: [makeLog(nextYear, method, `${point.name}: анализ завершён без высадки.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'investigate-point');
      return { ok: true, message: `${method} завершён` };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async completeExpedition(result) {
    return runExclusive('expedition-complete', set, get, async () => {
      const state = get();
      const { galaxy, captain, ship, currentSystemId } = state;
      if (!galaxy || !captain || !ship || !currentSystemId || !state.simulation) return;
      const advanced = buildWorldAdvance(state, expeditionHours(result.turnsSpent), `expedition:${result.pointOfInterestId}`);
      const gameYear = advanced.patch.gameYear ?? state.gameYear;
      const point = state.pointsOfInterest.find((entry) => entry.id === result.pointOfInterestId);
      if (!point) return;
      const system = galaxy.systems.find((entry) => entry.id === point.systemId);
      const planet = system?.planets.find((entry) => entry.id === point.planetId);
      const updatedGalaxy = structuredClone((advanced.patch.galaxy as Galaxy | undefined) ?? galaxy);
      const updatedPoints = get().pointsOfInterest.map((entry) => entry.id === point.id ? {
        ...entry,
        status: result.outcome === 'resolved' ? 'resolved' as const : result.blockedReason ? 'blocked' as const : 'visited' as const,
        visits: entry.visits + 1,
        lastVisitedYear: gameYear
      } : entry);
      let updatedShip = { ...ship, cargo: [...ship.cargo] };
      let updatedCaptain = { ...captain, injuries: [...captain.injuries] };
      const logs = [...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)];
      const newDiscoveries = [...state.discoveries];
      let playerKnowledge = state.knowledge;

      if (result.artifact && !updatedShip.cargo.some((item) => item.artifactId === result.artifact?.id)) {
        const storedArtifact = updatedGalaxy.artifacts.find((entry) => entry.id === result.artifact?.id);
        if (storedArtifact) storedArtifact.discovered = true;
        playerKnowledge = revealKnowledge(playerKnowledge, 'artifact', result.artifact.id, ['identity', 'kind', 'location'], advanced.patch.simulation?.clock.absoluteHour ?? state.simulation.clock.absoluteHour, 'direct', 82);
        if (updatedShip.cargo.length < updatedShip.cargoCapacity) {
          updatedShip.cargo.push({ id: `cargo_${result.artifact.id}`, name: result.artifact.name, kind: result.artifact.kind, quantity: 1, value: result.artifact.value, artifactId: result.artifact.id });
          if (!newDiscoveries.some((entry) => entry.artifactId === result.artifact?.id)) {
            newDiscoveries.unshift({
              id: `disc_artifact_${result.artifact.id}`,
              kind: 'artifact',
              name: result.artifact.name,
              systemId: point.systemId,
              planetId: point.planetId,
              pointOfInterestId: point.id,
              description: 'Объект извлечён. Назначение и происхождение требуют анализа.',
              confidence: 45,
              year: gameYear,
              tags: [result.artifact.kind, 'unverified'],
              artifactId: result.artifact.id
            });
          }
          logs.unshift(makeLog(gameYear, 'Артефакт извлечён', `${result.artifact.name} доставлен на корабль.`, 'good'));
        } else {
          logs.unshift(makeLog(gameYear, 'Трюм заполнен', `${result.artifact.name} пришлось оставить на поверхности.`, 'warning'));
        }
      }

      if (result.injury) {
        const severity = Math.max(1, Math.min(10, result.injury.severity));
        updatedCaptain = {
          ...updatedCaptain,
          health: Math.max(0, updatedCaptain.health - severity * 5),
          injuries: [...updatedCaptain.injuries, {
            id: `inj_${Date.now()}`,
            bodyPart: result.injury.bodyPart,
            type: severity > 7 ? 'fracture' : severity > 4 ? 'bleeding' : 'bruise',
            severity,
            permanent: severity >= 9
          }]
        };
        logs.unshift(makeLog(gameYear, 'Экспедиционная травма', `Капитан ранен. Тяжесть: ${severity}/10.`, 'danger'));
      }

      const newEvidence: Evidence[] = result.evidence
        .filter((draft) => !get().evidence.some((entry) => entry.id === `ev_${draft.key}`))
        .map((draft) => ({
          id: `ev_${draft.key}`,
          pointOfInterestId: point.id,
          systemId: point.systemId,
          planetId: point.planetId,
          kind: draft.kind,
          title: draft.title,
          description: draft.description,
          reliability: draft.reliability,
          discoveredYear: gameYear,
          tags: draft.tags
        }));
      const allEvidence = [...newEvidence, ...get().evidence];
      const pointEvidence = allEvidence.filter((entry) => entry.pointOfInterestId === point.id);
      const previousHypothesis = get().hypotheses.find((entry) => entry.pointOfInterestId === point.id);
      const hypothesis = buildHypothesis(point, pointEvidence, gameYear, previousHypothesis);
      const hypotheses = [hypothesis, ...get().hypotheses.filter((entry) => entry.pointOfInterestId !== point.id)];

      if (planet) {
        const updatedPlanet = updatedGalaxy.systems.find((entry) => entry.id === point.systemId)?.planets.find((entry) => entry.id === point.planetId);
        if (updatedPlanet && result.outcome === 'resolved') updatedPlanet.scanLevel = 3;
      }

      if (!newDiscoveries.some((entry) => entry.pointOfInterestId === point.id && entry.tags.includes('field-confirmed'))) {
        newDiscoveries.unshift({
          id: `disc_field_${point.id}_${get().discoveries.length}`,
          kind: point.type === 'ruin' || point.type === 'graveyard' ? 'ruin' : point.type === 'biosphere' ? 'biosphere' : point.type === 'anomaly' ? 'anomaly' : 'signal',
          name: `Полевая проверка: ${point.name}`,
          systemId: point.systemId,
          planetId: point.planetId,
          pointOfInterestId: point.id,
          description: `${newEvidence.length} новых улик. Гипотеза: ${hypothesis.title}.`,
          confidence: hypothesis.confidence,
          year: gameYear,
          tags: ['expedition', 'field-confirmed', point.type]
        });
      }
      logs.unshift(makeLog(gameYear, `Экспедиция: ${point.name}`, `Получено улик: ${newEvidence.length}. Статус гипотезы: ${hypothesis.status}.`, result.outcome === 'resolved' ? 'good' : 'warning'));

      let updatedCrew = get().crew.map((member) => {
        if (!result.crewIds.includes(member.id)) return member;
        const impact = result.outcome === 'resolved' ? 7 : result.outcome === 'failed' ? -10 : 2;
        const memory = {
          id: `memory_expedition_${member.id}_${point.id}_${gameYear}_${member.memories.length}`,
          year: gameYear,
          kind: result.artifact ? 'discovery' as const : 'expedition' as const,
          text: `${point.name}: ${result.outcome === 'resolved' ? 'задача выполнена' : result.outcome === 'failed' ? 'экспедиция провалена' : 'группа эвакуирована'}.`,
          impact
        };
        return {
          ...member,
          morale: Math.max(0, Math.min(100, member.morale + impact)),
          loyalty: Math.max(0, Math.min(100, member.loyalty + Math.sign(impact) * 2)),
          memories: [...member.memories, memory].slice(-20)
        };
      });
      if (result.outcome === 'failed' && result.crewIds.length > 0) {
        const woundedId = result.crewIds[0];
        updatedCrew = updatedCrew.map((member) => member.id === woundedId ? {
          ...member,
          health: Math.max(1, member.health - 24),
          status: 'injured' as const,
          memories: [...member.memories, { id: `memory_injury_${member.id}_${gameYear}`, year: gameYear, kind: 'injury' as const, text: 'Получил травму при аварийной эвакуации.', impact: -8 }].slice(-20)
        } : member);
      }

      let knowledge = get().artifactKnowledge;
      if (result.artifact) {
        const existingKnowledge = knowledge.find((entry) => entry.artifactId === result.artifact?.id);
        if (!existingKnowledge) {
          knowledge = [{ artifactId: result.artifact.id, level: 1, knownFields: ['kind', 'age'], notes: ['Объект извлечён, свойства не подтверждены.'] }, ...knowledge];
        }
      }

      const locationState = { ...result.locationState, lastVisitedYear: gameYear };
      const locationStates = [locationState, ...get().locationStates.filter((entry) => entry.pointOfInterestId !== point.id)];
      const archaeologyProgress = advanceArchaeologyChains(get().archaeologyChains, point.id, newEvidence.length, gameYear);
      const archaeologyChains = archaeologyProgress.chains;
      if (archaeologyProgress.completedTitle) logs.unshift(makeLog(gameYear, 'Археологическая цепочка завершена', archaeologyProgress.completedTitle, 'good'));
      else if (archaeologyProgress.advancedTitle) logs.unshift(makeLog(gameYear, 'Открыт следующий след', archaeologyProgress.advancedTitle, 'info'));
      let factions = get().factions;
      let contractReward = 0;
      const contracts = get().contracts.map((contract) => {
        if (contract.status !== 'active' || contract.targetSystemId !== point.systemId) return contract;
        let progress = contract.progress;
        if (contract.type === 'bounty') progress += result.defeatedEnemyIds.length;
        if ((contract.type === 'recovery' || contract.type === 'rescue') && newEvidence.length > 0) progress = contract.requiredProgress;
        if (progress >= contract.requiredProgress) {
          contractReward += contract.reward;
          factions = adjustFactionStanding(factions, contract.issuerFactionId, gameYear, 'contract-complete', 7, `Выполнен контракт «${contract.title}».`);
          return completedContract({ ...contract, progress }, gameYear);
        }
        return { ...contract, progress };
      });
      if (contractReward > 0) {
        updatedCaptain = { ...updatedCaptain, credits: updatedCaptain.credits + contractReward, reputation: updatedCaptain.reputation + 2 };
        logs.unshift(makeLog(gameYear, 'Контракт выполнен', `Получено ${contractReward} кредитов.`, 'good'));
      }

      let legacy = get().legacy;
      let nextScreen = get().screen;
      if (updatedCaptain.health <= 0) {
        const stats = {
          systemsVisited: updatedGalaxy.systems.filter((entry) => entry.visited).length,
          discoveries: newDiscoveries.length,
          battles: logs.filter((entry) => /бой|абордаж|сражение/i.test(entry.title)).length
        };
        legacy = closeCurrentCaptain(legacy, updatedCaptain, updatedShip, updatedCrew, gameYear, currentSystemId, 'dead', `Капитан погиб во время экспедиции «${point.name}».`, stats);
        legacy = {
          ...legacy,
          mode: 'succession' as const,
          campaignEnded: true,
          successionCandidates: [],
          lostExpeditions: [{
            id: `lost_expedition_${point.id}_${gameYear}`,
            year: gameYear,
            systemId: point.systemId,
            pointOfInterestId: point.id,
            captainRecordId: get().legacy.currentCaptainRecordId,
            crewIds: result.crewIds,
            cargoIds: updatedShip.cargo.map((entry) => entry.id),
            status: 'unrecovered' as const,
            summary: `Капитан погиб на ${point.name}. Состояние локации и оставленные следы сохранены.`
          }, ...legacy.lostExpeditions].slice(0, 100)
        };
        updatedCaptain = { ...updatedCaptain, alive: false, condition: 'dead' };
        nextScreen = 'continuity';
        logs.unshift(makeLog(gameYear, 'Капитан погиб', `Командование прервано на объекте «${point.name}».`, 'danger'));
      } else {
        const recovered = legacy.lostExpeditions.filter((entry) => entry.pointOfInterestId === point.id && entry.status === 'unrecovered');
        if (recovered.length) {
          legacy = {
            ...legacy,
            lostExpeditions: legacy.lostExpeditions.map((entry) => entry.pointOfInterestId === point.id && entry.status === 'unrecovered' ? { ...entry, status: 'recovered' as const, recoveredYear: gameYear } : entry),
            chronicle: [chronicleEntry({ year: gameYear, category: 'recovery', title: 'Потерянная экспедиция найдена', text: `Следы прежней команды обнаружены на объекте «${point.name}».`, tone: 'good', systemId: point.systemId }), ...legacy.chronicle].slice(0, 1000)
          };
        }
      }

      let simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation;
      if (point.type === 'biosphere' && planet) {
        const extraction = result.outcome === 'resolved' ? -Math.max(1, Math.min(4, newEvidence.length)) : -1;
        simulation = adjustEcosystem(simulation, planet.id, {
          biomass: extraction,
          contamination: result.outcome === 'failed' ? 3 : 1
        });
        playerKnowledge = revealKnowledge(playerKnowledge, 'ecosystem', planet.id, ['biomes', 'biomass', 'biodiversity', 'fieldSample'], simulation.clock.absoluteHour, 'direct', 88);
        const ecology = simulation.ecosystems[planet.id];
        if (ecology) {
          logs.unshift(makeLog(gameYear, 'Полевое воздействие', `Экосистема ${planet.name}: биомасса ${ecology.biomass}/100, загрязнение ${ecology.contamination}/100.`, result.outcome === 'failed' ? 'warning' : 'info'));
          const sampleId = `eco_sample_${point.id}`;
          if (result.outcome === 'resolved' && newEvidence.length > 0 && !updatedShip.cargo.some((item) => item.commodityId === sampleId)) {
            if (updatedShip.cargo.length < updatedShip.cargoCapacity) {
              const resources = Object.entries(ecology.resources).sort((a, b) => b[1] - a[1]);
              const [resourceType, richness] = resources[0] ?? ['biomass', 20];
              updatedShip.cargo.push({
                id: `cargo_${sampleId}`,
                name: `Биологический образец: ${planet.name}`,
                kind: 'biological-sample',
                quantity: 1,
                value: 180 + Math.round(richness * 6),
                commodityId: sampleId
              });
              logs.unshift(makeLog(gameYear, 'Образец изолирован', `В трюм помещён образец класса «${resourceType}».`, 'good'));
            } else {
              logs.unshift(makeLog(gameYear, 'Образец оставлен', 'В трюме нет свободного места для биологического контейнера.', 'warning'));
            }
          }
        }
      }
      const projectedGalaxy = projectKnowledgeToGalaxy(updatedGalaxy, playerKnowledge);
      set({
        ...advanced.patch,
        simulation,
        galaxy: projectedGalaxy,
        knowledge: playerKnowledge,
        ship: updatedShip,
        captain: updatedCaptain,
        pointsOfInterest: updatedPoints,
        evidence: allEvidence,
        hypotheses,
        discoveries: newDiscoveries,
        artifactKnowledge: knowledge,
        crew: updatedCrew,
        contracts,
        factions,
        locationStates,
        archaeologyChains,
        worldThreads: projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions, contracts, research: state.researchProjects }),
        legacy,
        screen: nextScreen,
        logs
      });
      await persist(set, get, updatedCaptain.health <= 0 ? 'captain-death-expedition' : 'expedition', { immediate: updatedCaptain.health <= 0, backup: updatedCaptain.health <= 0 });
    }, undefined);
  },
  async analyzeArtifact(artifactId) {
    return runExclusive('artifact-analysis', set, get, async () => {
      const state = get();
      const { galaxy, captain } = state;
      if (!galaxy || !captain) return;
      const artifact = galaxy.artifacts.find((entry) => entry.id === artifactId);
      if (!artifact) return;
      const cost = 120;
      if (captain.credits < cost) return;
      const advanced = buildWorldAdvance(state, 12, `artifact-analysis:${artifactId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const previous = state.artifactKnowledge.find((entry) => entry.artifactId === artifactId) ?? { artifactId, level: 0, knownFields: [], notes: [] };
      const level = Math.min(4, previous.level + 1);
      const fieldByLevel: Record<number, string[]> = {
        1: ['kind', 'age'],
        2: ['civilization', 'creator'],
        3: ['owners', 'danger'],
        4: ['truth', 'properties']
      };
      const knownFields = Array.from(new Set([...previous.knownFields, ...(fieldByLevel[level] ?? [])]));
      const next: ArtifactKnowledge = {
        ...previous,
        level,
        knownFields,
        notes: [...previous.notes, level === 4 ? artifact.truth : `Этап анализа ${level}: открыты поля ${fieldByLevel[level]?.join(', ') ?? ''}.`],
        revealedTruth: level === 4 ? artifact.truth : previous.revealedTruth
      };
      const playerKnowledge = revealKnowledge(state.knowledge, 'artifact', artifactId, ['identity', ...knownFields], advanced.patch.simulation?.clock.absoluteHour ?? state.simulation?.clock.absoluteHour ?? 0, 'direct', 55 + level * 10);
      set({
        ...advanced.patch,
        knowledge: playerKnowledge,
        captain: { ...captain, credits: captain.credits - cost },
        artifactKnowledge: [next, ...state.artifactKnowledge.filter((entry) => entry.artifactId !== artifactId)],
        logs: [makeLog(nextYear, 'Анализ артефакта', `${artifact.name}: уровень знаний ${level}/4.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'artifact-analysis');
    }, undefined);
  },
  async startResearch(artifactId) {
    return runExclusive('research-start', set, get, async () => {
      const state = get();
      const { galaxy, ship, captain } = state;
      const artifact = galaxy?.artifacts.find((entry) => entry.id === artifactId);
      const carried = ship?.cargo.some((item) => item.artifactId === artifactId);
      if (!galaxy || !ship || !captain || !artifact || !carried) return { ok: false, message: 'Артефакт должен находиться на борту' };
      if (state.researchProjects.some((entry) => entry.artifactId === artifactId && entry.status !== 'failed')) return { ok: false, message: 'Исследование уже создано' };
      const cost = 180 + artifact.danger * 25;
      if (captain.credits < cost) return { ok: false, message: `Нужно ${cost} кредитов на изоляцию и расходники` };
      const advanced = buildWorldAdvance(state, 8, `research-start:${artifactId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const project = createResearchProject(artifact, nextYear);
      const researchProjects = [project, ...state.researchProjects];
      const simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation!;
      set({
        ...advanced.patch,
        captain: { ...captain, credits: captain.credits - cost },
        researchProjects,
        worldThreads: projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions: state.factions, contracts: (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts, research: researchProjects }),
        logs: [makeLog(nextYear, 'Запущено исследование', `${artifact.name} помещён в лабораторию. Риск ${project.risk}/10.`, 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'research-start');
      return { ok: true, message: 'Исследование запущено' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async advanceResearch(projectId) {
    return runExclusive('research-cycle', set, get, async () => {
      const state = get();
      const { galaxy, captain, ship, crew } = state;
      const project = state.researchProjects.find((entry) => entry.id === projectId);
      const artifact = galaxy?.artifacts.find((entry) => entry.id === project?.artifactId);
      if (!galaxy || !captain || !ship || !project || !artifact || project.status !== 'active') return { ok: false, message: 'Активное исследование не найдено' };
      const cost = 90 + project.risk * 18;
      if (captain.credits < cost) return { ok: false, message: `Нужно ${cost} кредитов на цикл` };
      const advanced = buildWorldAdvance(state, ACTION_TIME.researchCycle, `research-cycle:${project.id}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const specialists = crew.filter((member) => ['scientist','archaeologist','engineer','doctor','biologist'].includes(member.primaryRole));
      const rng = createRng(`${galaxy.seed}:${project.id}:${project.progress}:${advanced.patch.simulation?.clock.absoluteHour ?? nextYear}`);
      const gain = researchPower(specialists) + captain.skills.research * 6 + rng.int(0, 12);
      const progress = Math.min(project.requiredProgress, project.progress + gain);
      const complication = rng.chance(Math.min(.48, project.risk * .035));
      const completed = progress >= project.requiredProgress;
      const nextProject: ResearchProject = {
        ...project,
        progress,
        status: completed ? 'completed' : complication && project.risk >= 9 ? 'failed' : 'active',
        updatedYear: nextYear,
        completedYear: completed ? nextYear : project.completedYear,
        complication: complication ? 'Контур дал нестабильный выброс; часть данных повреждена.' : project.complication,
        log: [`Цикл ${nextYear}: +${gain} прогресса${complication ? ', зафиксирован сбой' : ''}.`, ...project.log].slice(0, 12)
      };
      const researchProjects = [nextProject, ...state.researchProjects.filter((entry) => entry.id !== project.id)];
      let technologyBlueprints = state.technologyBlueprints;
      let equipmentInventory = state.equipmentInventory;
      let artifactKnowledge = state.artifactKnowledge;
      let nextShip = ship;
      let playerKnowledge = state.knowledge;
      if (completed) {
        const blueprint = blueprintFromProject(nextProject, artifact, nextYear);
        blueprint.factionInterest = state.factions.filter((entry) => entry.research >= 45).sort((a, b) => b.research - a.research).slice(0, 3).map((entry) => entry.id);
        technologyBlueprints = [blueprint, ...technologyBlueprints.filter((entry) => entry.sourceArtifactId !== artifact.id)];
        if (['medicine','biology','weapons'].includes(blueprint.domain)) {
          const category = blueprint.domain === 'weapons' ? 'weapon' as const : blueprint.domain === 'medicine' ? 'medical' as const : 'implant' as const;
          equipmentInventory = [{ id: `gear_${artifact.id}`, name: `Прототип: ${artifact.name}`, category, rarity: blueprint.rarity, description: blueprint.description, effect: blueprint.benefit, sourceArtifactId: artifact.id, condition: 100 }, ...equipmentInventory.filter((entry) => entry.sourceArtifactId !== artifact.id)];
        }
        const existing = artifactKnowledge.find((entry) => entry.artifactId === artifact.id) ?? { artifactId: artifact.id, level: 1, knownFields: [], notes: [] };
        artifactKnowledge = [{ ...existing, level: 6, knownFields: Array.from(new Set([...existing.knownFields, 'truth', 'properties', 'technology'])), notes: [`Функция восстановлена. Создан чертёж «${blueprint.name}».`, ...existing.notes], revealedTruth: artifact.truth }, ...artifactKnowledge.filter((entry) => entry.artifactId !== artifact.id)];
        playerKnowledge = revealKnowledge(playerKnowledge, 'artifact', artifact.id, ['identity', 'kind', 'creator', 'history', 'danger', 'truth', 'technology'], advanced.patch.simulation?.clock.absoluteHour ?? state.simulation?.clock.absoluteHour ?? 0, 'direct', 100);
      } else if (complication) {
        nextShip = { ...ship, hull: Math.max(1, ship.hull - project.risk * 2), statuses: Array.from(new Set([...ship.statuses, 'лабораторный выброс'])) };
      }
      const simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation!;
      const contracts = (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts;
      const worldThreads = projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions: state.factions, contracts, research: researchProjects });
      set({
        ...advanced.patch,
        knowledge: playerKnowledge,
        captain: { ...captain, credits: captain.credits - cost },
        ship: nextShip,
        researchProjects,
        technologyBlueprints,
        equipmentInventory,
        artifactKnowledge,
        worldThreads,
        logs: [makeLog(nextYear, completed ? 'Технология восстановлена' : complication ? 'Авария в лаборатории' : 'Исследовательский цикл', completed ? `Создан новый технологический чертёж из объекта «${artifact.name}».` : complication ? 'Сбой повредил корпус и остановил часть анализа.' : `${project.title}: ${progress}/${project.requiredProgress}.`, completed ? 'good' : complication ? 'danger' : 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'research-cycle');
      return { ok: true, message: completed ? 'Исследование завершено' : nextProject.status === 'failed' ? 'Проект потерян' : `Прогресс ${progress}/${project.requiredProgress}` };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async installBlueprint(blueprintId) {
    return runExclusive('blueprint-install', set, get, async () => {
      const state = get();
      const { captain, ship } = state;
      const blueprint = state.technologyBlueprints.find((entry) => entry.id === blueprintId);
      if (!captain || !ship || !blueprint || blueprint.status === 'installed') return { ok: false, message: 'Чертёж недоступен' };
      if (captain.credits < blueprint.installCost) return { ok: false, message: `Нужно ${blueprint.installCost} кредитов` };
      const advanced = buildWorldAdvance(state, 72, `blueprint-install:${blueprintId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const module = { id: `module_${blueprint.id}`, name: blueprint.name, slot: blueprint.moduleSlot, rarity: blueprint.rarity, effect: `${blueprint.benefit}; недостаток: ${blueprint.drawback}` };
      let nextShip = { ...ship, modules: [...ship.modules.filter((entry) => entry.id !== module.id), module] };
      if (blueprint.domain === 'propulsion') nextShip = { ...nextShip, jumpRange: nextShip.jumpRange + 45 };
      if (blueprint.domain === 'energy') nextShip = { ...nextShip, maxFuel: nextShip.maxFuel + 15, fuel: nextShip.fuel + 15 };
      if (blueprint.domain === 'materials') nextShip = { ...nextShip, maxHull: nextShip.maxHull + 20, hull: nextShip.hull + 20 };
      const technologyBlueprints = state.technologyBlueprints.map((entry) => entry.id === blueprint.id ? { ...entry, status: 'installed' as const } : entry);
      set({
        ...advanced.patch,
        captain: { ...captain, credits: captain.credits - blueprint.installCost },
        ship: nextShip,
        technologyBlueprints,
        logs: [makeLog(nextYear, 'Экспериментальный модуль установлен', `${blueprint.name}: ${blueprint.benefit}.`, blueprint.status === 'restricted' ? 'warning' : 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'blueprint-install');
      return { ok: true, message: 'Модуль установлен' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async assignEquipment(itemId, targetId = 'captain_player') {
    const item = get().equipmentInventory.find((entry) => entry.id === itemId);
    if (!item) return;
    set({ equipmentInventory: get().equipmentInventory.map((entry) => entry.id === itemId ? { ...entry, assignedToId: targetId } : entry.assignedToId === targetId && entry.category === item.category ? { ...entry, assignedToId: undefined } : entry) });
    await persist(set, get, 'equipment-assignment');
  },
  async damageShip(amount, status) {
    const ship = get().ship;
    if (!ship || amount <= 0) return;
    const hull = Math.max(0, ship.hull - amount);
    const nextStatus = hull <= 0 ? 'корабль выведен из строя' : status;
    const statuses = nextStatus && !ship.statuses.includes(nextStatus) ? [...ship.statuses, nextStatus] : ship.statuses;
    const rng = createRng(`${get().galaxy?.seed}:external-damage:${get().gameYear}:${get().logs.length}`);
    const targets: ShipSystemId[] = ['engine','reactor','weapons','sensors','comms','lifeSupport','cargo'];
    const systems = damageSystem(normalizeShipSystems(ship.systems), rng.pick(targets), Math.max(2, Math.round(amount * 0.65)));
    const title = hull <= 0 ? 'Корабль выведен из строя' : 'Повреждение корабля';
    set({ ship: { ...ship, hull, statuses, systems }, logs: [makeLog(get().gameYear, title, `Корпус потерял ${amount} прочности.${nextStatus ? ` Состояние: ${nextStatus}.` : ''}`, 'danger'), ...get().logs] });
    await persist(set, get, 'ship-damage');
  },
  async repairShip() {
    return runExclusive('repair', set, get, async () => {
      const state = get();
      const { ship, captain } = state;
      if (!ship || !captain) return;
      const missingHull = ship.maxHull - ship.hull;
      const normalizedSystems = normalizeShipSystems(ship.systems);
      const missingSystems = normalizedSystems.reduce((sum, entry) => sum + (entry.maxIntegrity - entry.integrity), 0);
      const cost = Math.ceil(missingHull * 4 + missingSystems * 1.5);
      if ((missingHull <= 0 && missingSystems <= 0) || captain.credits < cost) return;
      const advanced = buildWorldAdvance(state, ACTION_TIME.repair, 'ship-repair');
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      set({
        ...advanced.patch,
        ship: { ...ship, hull: ship.maxHull, systems: createShipSystems(), statuses: [] },
        captain: { ...captain, credits: captain.credits - cost },
        logs: [makeLog(nextYear, 'Ремонт завершён', `Корпус и корабельные системы восстановлены. Потрачено ${cost} кредитов.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'repair');
    }, undefined);
  },
  async refuelShip() {
    return runExclusive('refuel', set, get, async () => {
      const state = get();
      const { ship, captain } = state;
      if (!ship || !captain) return;
      const missing = ship.maxFuel - ship.fuel;
      const cost = Math.ceil(missing * 3);
      if (missing <= 0 || captain.credits < cost) return;
      const advanced = buildWorldAdvance(state, ACTION_TIME.refuel, 'ship-refuel');
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      set({
        ...advanced.patch,
        ship: { ...ship, fuel: ship.maxFuel },
        captain: { ...captain, credits: captain.credits - cost },
        logs: [makeLog(nextYear, 'Заправка завершена', `Потрачено ${cost} кредитов.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'refuel');
    }, undefined);
  },
  async earnCredits(amount, reason) {
    const captain = get().captain;
    if (!captain || amount <= 0) return;
    set({ captain: { ...captain, credits: captain.credits + amount }, logs: [makeLog(get().gameYear, reason, `Получено ${amount} кредитов.`, 'good'), ...get().logs] });
    await persist(set, get, 'credits');
  },
  async sellCargo(itemId) {
    return runExclusive('sell-cargo', set, get, async () => {
      const state = get();
      const { ship, captain } = state;
      if (!ship || !captain) return;
      const item = ship.cargo.find((entry) => entry.id === itemId);
      if (!item) return;
      const advanced = buildWorldAdvance(state, ACTION_TIME.marketTrade, `sell-cargo:${itemId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const price = Math.max(1, Math.round(item.value * 0.72));
      set({
        ...advanced.patch,
        ship: { ...ship, cargo: ship.cargo.filter((entry) => entry.id !== itemId) },
        captain: { ...captain, credits: captain.credits + price },
        logs: [makeLog(nextYear, 'Груз продан', `${item.name}: получено ${price} кредитов.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'sell-cargo');
    }, undefined);
  },
  async refreshCrewCandidates() {
    return runExclusive('crew-search', set, get, async () => {
      const state = get();
      const { galaxy, currentSystemId, captain } = state;
      if (!galaxy || !currentSystemId || !captain) return;
      const system = galaxy.systems.find((entry) => entry.id === currentSystemId);
      if (!system) return;
      const cost = 40;
      if (captain.credits < cost) return;
      const advanced = buildWorldAdvance(state, ACTION_TIME.recruit, `crew-search:${currentSystemId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const candidates = generateCrewCandidates(galaxy.seed, system, nextYear + Math.floor((advanced.patch.simulation?.clock.absoluteHour ?? 0) / 24), 4);
      set({
        ...advanced.patch,
        crewCandidates: candidates,
        captain: { ...captain, credits: captain.credits - cost },
        logs: [makeLog(nextYear, 'Поиск экипажа', `Получено ${candidates.length} новых анкет. Потрачено ${cost} кредитов.`, 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'crew-search');
    }, undefined);
  },
  async hireCrew(candidateId) {
    return runExclusive('crew-hire', set, get, async () => {
      const state = get();
      const { crew, crewCandidates, captain } = state;
      if (!captain || crew.length >= 4) return;
      const candidate = crewCandidates.find((entry) => entry.id === candidateId);
      if (!candidate || captain.credits < candidate.signingCost) return;
      const advanced = buildWorldAdvance(state, ACTION_TIME.recruit, `crew-hire:${candidateId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const { signingCost: _signingCost, originSystemId: _originSystemId, ...memberData } = candidate;
      const member: CrewMember = {
        ...memberData,
        joinedYear: nextYear,
        paidUntilYear: nextYear,
        memories: [{ id: `memory_hired_${candidate.id}_${nextYear}`, year: nextYear, kind: 'hired', text: `Нанят капитаном в год ${nextYear}.`, impact: 8 }]
      };
      set({
        ...advanced.patch,
        crew: [...crew, member],
        crewCandidates: crewCandidates.filter((entry) => entry.id !== candidateId),
        captain: { ...captain, credits: captain.credits - candidate.signingCost },
        logs: [makeLog(nextYear, 'Новый член экипажа', `${member.name}, ${member.primaryRole}. Контракт подписан.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'crew-hire');
    }, undefined);
  },
  async dismissCrew(crewId) {
    return runExclusive('crew-dismiss', set, get, async () => {
      const state = get();
      const member = state.crew.find((entry) => entry.id === crewId);
      if (!member) return;
      const advanced = buildWorldAdvance(state, 1, `crew-dismiss:${crewId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      set({
        ...advanced.patch,
        crew: state.crew.filter((entry) => entry.id !== crewId),
        logs: [makeLog(nextYear, 'Контракт расторгнут', `${member.name} покидает корабль.`, member.loyalty < 35 ? 'warning' : 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'crew-dismiss');
    }, undefined);
  },
  async settlePayroll() {
    return runExclusive('crew-payroll', set, get, async () => {
      const state = get();
      const { crew, captain } = state;
      if (!captain || crew.length === 0) return;
      const advanced = buildWorldAdvance(state, 2, 'crew-payroll');
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const due = crew.reduce((sum, member) => sum + member.salary, 0);
      if (captain.credits < due) {
        set({
          ...advanced.patch,
          crew: crew.map((member) => ({ ...member, status: 'unpaid', morale: Math.max(0, member.morale - 12), loyalty: Math.max(0, member.loyalty - 8), memories: [...member.memories, { id: `memory_unpaid_${member.id}_${nextYear}`, year: nextYear, kind: 'betrayal' as const, text: 'Капитан не выплатил жалование.', impact: -12 }].slice(-20) })),
          logs: [makeLog(nextYear, 'Жалование не выплачено', `Требуется ${due} кредитов. Экипаж недоволен.`, 'danger'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
        });
      } else {
        set({
          ...advanced.patch,
          captain: { ...captain, credits: captain.credits - due },
          crew: crew.map((member) => ({ ...member, status: member.health < member.maxHealth * 0.5 ? 'injured' : 'active', paidUntilYear: nextYear + 1, morale: Math.min(100, member.morale + 5), loyalty: Math.min(100, member.loyalty + 3), memories: [...member.memories, { id: `memory_paid_${member.id}_${nextYear}`, year: nextYear, kind: 'payment' as const, text: `Получено жалование: ${member.salary}.`, impact: 4 }].slice(-20) })),
          logs: [makeLog(nextYear, 'Жалование выплачено', `Экипаж получил ${due} кредитов.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
        });
      }
      await persist(set, get, 'crew-payroll');
    }, undefined);
  },
  async dockAtHub(hubId) {
    return runExclusive('dock', set, get, async () => {
      const state = get();
      const { hubs, currentSystemId, ship, captain, galaxy } = state;
      if (!currentSystemId || !ship || !captain || !galaxy || !state.simulation) return { ok: false, message: 'Нет активного корабля' };
      const hub = hubs.find((entry) => entry.id === hubId);
      if (!hub || hub.systemId !== currentSystemId) return { ok: false, message: 'Хаб недоступен в этой системе' };
      const faction = state.factions.find((entry) => entry.id === hub.factionId);
      if (faction?.disposition === 'hostile') return { ok: false, message: 'Стыковка запрещена: фракция враждебна' };
      const arrivalHour = state.simulation.clock.absoluteHour + ACTION_TIME.dock;
      let knowledge = revealKnowledge(state.knowledge, 'hub', hub.id, ['identity', 'services', 'population', 'authority', 'visited'], arrivalHour, 'direct', 96);
      knowledge = revealKnowledge(knowledge, 'faction', hub.factionId, ['identity', 'disposition', 'laws', 'territory'], arrivalHour, 'contact', 82);
      if (hub.civilizationId) knowledge = revealKnowledge(knowledge, 'civilization', hub.civilizationId, ['identity', 'language', 'culture', 'politics'], arrivalHour, 'contact', 76);
      const advanced = buildWorldAdvance(state, ACTION_TIME.dock, `dock:${hubId}`, { knowledge });
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const baseContracts = (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts;
      const baseLogs = (advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs;

      const smugglerBonus = state.crew.some((member) => member.primaryRole === 'smuggler' || member.secondaryRole === 'smuggler') ? 24 : 0;
      const illegalCargo = ship.cargo.filter((item) => item.illegal);
      const rng = createRng(`${galaxy.seed}:inspection:${hub.id}:${advanced.patch.simulation?.clock.absoluteHour ?? nextYear}:${ship.cargo.length}`);
      const inspected = illegalCargo.length > 0 && rng.chance(Math.max(0, hub.inspectionLevel - smugglerBonus) / 100);
      let updatedShip = { ...ship, cargo: [...ship.cargo] };
      let updatedCaptain = { ...captain };
      let updatedFactions = state.factions;
      const logs = [...baseLogs];
      let message = `Стыковка разрешена: ${hub.name}.`;

      if (inspected) {
        const confiscatedValue = illegalCargo.reduce((sum, item) => sum + item.value * item.quantity, 0);
        const fine = Math.min(updatedCaptain.credits, Math.max(120, Math.round(confiscatedValue * 0.45)));
        updatedShip = { ...updatedShip, cargo: updatedShip.cargo.filter((item) => !item.illegal) };
        updatedCaptain = { ...updatedCaptain, credits: updatedCaptain.credits - fine, reputation: updatedCaptain.reputation - 3 };
        updatedFactions = adjustFactionStanding(updatedFactions, hub.factionId, nextYear, 'contraband-caught', -12, 'На корабле обнаружена контрабанда.');
        logs.unshift(makeLog(nextYear, 'Досмотр и конфискация', `Запрещённый груз изъят. Штраф: ${fine} кредитов.`, 'danger'));
        message = `Контрабанда конфискована. Штраф: ${fine}.`;
      }

      let reward = 0;
      const updatedContracts = baseContracts.map((contract) => {
        if (contract.status !== 'active' || contract.targetSystemId !== currentSystemId || (contract.type !== 'delivery' && contract.type !== 'smuggling')) return contract;
        const cargoPresent = updatedShip.cargo.some((item) => item.contractId === contract.id || item.id === contract.cargoId);
        if (!cargoPresent) return contract;
        if (contract.type === 'smuggling' && inspected) return { ...contract, status: 'failed' as const };
        updatedShip = { ...updatedShip, cargo: updatedShip.cargo.filter((item) => item.contractId !== contract.id && item.id !== contract.cargoId) };
        reward += contract.reward;
        updatedFactions = adjustFactionStanding(updatedFactions, contract.issuerFactionId, nextYear, 'contract-complete', 7, `Выполнен контракт «${contract.title}».`);
        return completedContract(contract, nextYear);
      });
      if (reward > 0) {
        updatedCaptain = { ...updatedCaptain, credits: updatedCaptain.credits + reward, reputation: updatedCaptain.reputation + 2 };
        logs.unshift(makeLog(nextYear, 'Доставка завершена', `Контракты закрыты. Получено ${reward} кредитов.`, 'good'));
      }
      const hubNpc = state.localNpcs.find((npc) => npc.hubId === hub.id && npc.alive && npc.present);
      const hubScene = generateHubScene(galaxy.seed, hub, faction, hubNpc?.id, nextYear);
      const baseScenes = (advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes;
      const storyScenes = hubScene && !baseScenes.some((scene) => scene.id === hubScene.id) ? [hubScene, ...baseScenes].slice(0, 160) : baseScenes;
      const simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation;
      set({
        ...advanced.patch,
        knowledge,
        hubs: hubs.map((entry) => ({ ...entry, docked: entry.id === hub.id, visited: entry.id === hub.id ? true : entry.visited })),
        currentHubId: hub.id,
        screen: 'hub',
        ship: updatedShip,
        captain: updatedCaptain,
        factions: updatedFactions,
        contracts: updatedContracts,
        storyScenes,
        activeStorySceneId: hubScene?.id ?? null,
        worldThreads: projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions: updatedFactions, contracts: updatedContracts, research: state.researchProjects }),
        logs: logs.slice(0, 750)
      });
      await persist(set, get, 'dock');
      return { ok: true, message };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async leaveHub() {
    return runExclusive('leave-hub', set, get, async () => {
      const state = get();
      const advanced = buildWorldAdvance(state, ACTION_TIME.leaveHub, 'leave-hub');
      set({ ...advanced.patch, hubs: state.hubs.map((hub) => ({ ...hub, docked: false })), currentHubId: null, screen: 'system' });
      await persist(set, get, 'leave-hub');
    }, undefined);
  },
  async acceptContract(contractId) {
    return runExclusive('accept-contract', set, get, async () => {
      const contract = get().contracts.find((entry) => entry.id === contractId);
      const captain = get().captain;
      const ship = get().ship;
      if (!contract || !captain || !ship || contract.status !== 'available') return { ok: false, message: 'Контракт недоступен' };
      if ((contract.type === 'delivery' || contract.type === 'smuggling') && ship.cargo.length >= ship.cargoCapacity) return { ok: false, message: 'В трюме нет места для контрактного груза' };
      let cargo = [...ship.cargo];
      if (contract.cargoId) {
        cargo.push({
          id: contract.cargoId,
          name: contract.type === 'smuggling' ? 'Опечатанный нелегальный контейнер' : 'Защищённый контрактный контейнер',
          kind: contract.type === 'smuggling' ? 'contraband' : 'contractCargo',
          quantity: 1,
          value: Math.max(200, contract.reward / 2),
          contractId: contract.id,
          illegal: contract.illegal
        });
      }
      const contracts = get().contracts.map((entry) => entry.id === contractId ? { ...entry, status: 'active' as const, acceptedYear: get().gameYear } : entry);
      const factions = adjustFactionStanding(get().factions, contract.issuerFactionId, get().gameYear, 'contract-accepted', 1, `Принят контракт «${contract.title}».`);
      set({
        contracts,
        factions,
        ship: { ...ship, cargo },
        captain: { ...captain, credits: captain.credits + contract.advance },
        logs: [makeLog(get().gameYear, 'Контракт принят', `${contract.title}. Аванс: ${contract.advance}.`, contract.illegal ? 'warning' : 'good'), ...get().logs]
      });
      await persist(set, get, 'contract-accept');
      return { ok: true, message: 'Контракт принят' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async refreshContracts() {
    return runExclusive('refresh-contracts', set, get, async () => {
      const state = get();
      if (!state.galaxy || !state.currentHubId || !state.simulation) return;
      const advanced = buildWorldAdvance(state, 4, `contracts-refresh:${state.currentHubId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation;
      const existing = (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts;
      const contracts = projectContractsFromEvents({ events: simulation.events.slice(0, 40), existing: existing.filter((contract) => contract.status !== 'available' || contract.issuerHubId === state.currentHubId), hubs: state.hubs, year: nextYear });
      set({
        ...advanced.patch,
        contracts,
        worldThreads: projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions: state.factions, contracts, research: state.researchProjects }),
        logs: [makeLog(nextYear, 'Доска контрактов обновлена', 'Показаны только заявки, возникшие из реальных дефицитов, миграций и конфликтов.', 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'contracts-refresh');
    }, undefined);
  },
  async buyMarketGood(hubId, good) {
    return runExclusive('market-buy', set, get, async () => {
      const state = get();
      const { currentHubId, captain, ship } = state;
      if (currentHubId !== hubId || !captain || !ship) return { ok: false, message: 'Сначала пристыкуйтесь к хабу' };
      if (captain.credits < good.price) return { ok: false, message: 'Недостаточно кредитов' };
      const hub = state.hubs.find((entry) => entry.id === hubId);
      if (!hub) return { ok: false, message: 'Хаб недоступен' };
      const advanced = buildWorldAdvance(state, ACTION_TIME.marketTrade, `market-buy:${good.id}`);
      let simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation!;
      simulation = adjustSystemEconomy(simulation, hub.systemId, { supply: -2, tradePressure: 1 });
      const nextYear = worldYear(simulation.clock);
      let nextShip = { ...ship, cargo: [...ship.cargo] };
      let nextCaptain = { ...captain, credits: captain.credits - good.price };
      if (good.category === 'fuel') nextShip.fuel = Math.min(nextShip.maxFuel, nextShip.fuel + 20);
      else if (good.category === 'parts') nextShip.hull = Math.min(nextShip.maxHull, nextShip.hull + 18);
      else if (good.category === 'medicine') nextCaptain = { ...nextCaptain, health: Math.min(nextCaptain.maxHealth, nextCaptain.health + 20) };
      else {
        if (nextShip.cargo.length >= nextShip.cargoCapacity) return { ok: false, message: 'Трюм заполнен' };
        nextShip.cargo.push({ id: `cargo_${good.id}_${Date.now()}`, name: good.name, kind: good.category, quantity: 1, value: good.price, commodityId: good.id, illegal: good.illegal });
      }
      set({
        ...advanced.patch,
        simulation,
        gameYear: nextYear,
        ship: nextShip,
        captain: nextCaptain,
        logs: [makeLog(nextYear, good.category === 'medicine' ? 'Лечение проведено' : 'Покупка', `${good.name}: ${good.price} кредитов.`, good.illegal ? 'warning' : 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, good.category === 'medicine' ? 'market-buy-medicine' : 'market-buy');
      return { ok: true, message: good.category === 'medicine' ? 'Лечение проведено' : 'Покупка завершена' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async sellCommodity(itemId, hubId) {
    return runExclusive('market-sell', set, get, async () => {
      const state = get();
      const { ship, captain, currentHubId } = state;
      if (!ship || !captain || currentHubId !== hubId) return;
      const item = ship.cargo.find((entry) => entry.id === itemId && !entry.contractId);
      if (!item) return;
      const hub = state.hubs.find((entry) => entry.id === hubId);
      if (!hub) return;
      const advanced = buildWorldAdvance(state, ACTION_TIME.marketTrade, `market-sell:${itemId}`);
      let simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation!;
      const market = generateMarket(hub, advanced.patch.gameYear ?? state.gameYear, simulation.systems[hub.systemId]);
      const matching = market.find((good) => good.id === item.commodityId || good.category === item.kind);
      const price = Math.max(1, Math.round((matching?.price ?? item.value) * 0.68));
      simulation = adjustSystemEconomy(simulation, hub.systemId, { supply: 2, tradePressure: -1 });
      const nextYear = worldYear(simulation.clock);
      set({
        ...advanced.patch,
        simulation,
        gameYear: nextYear,
        ship: { ...ship, cargo: ship.cargo.filter((entry) => entry.id !== itemId) },
        captain: { ...captain, credits: captain.credits + price },
        logs: [makeLog(nextYear, 'Продажа товара', `${item.name}: +${price} кредитов.`, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'market-sell');
    }, undefined);
  },
  async attemptFirstContact(civilizationId) {
    return runExclusive('first-contact', set, get, async () => {
      const state = get();
      const { galaxy, currentSystemId } = state;
      if (!galaxy || !currentSystemId || !state.simulation) return { ok: false, message: 'Нет активной системы' };
      const civilization = galaxy.civilizations.find((entry) => entry.id === civilizationId);
      const system = galaxy.systems.find((entry) => entry.id === currentSystemId);
      const contact = state.civilizationContacts.find((entry) => entry.civilizationId === civilizationId);
      if (!civilization || civilization.status === 'dead' || !contact) return { ok: false, message: 'Связь с этой цивилизацией невозможна' };
      const present = system?.civilizationIds.includes(civilizationId) || system?.planets.some((planet) => planet.civilizationId === civilizationId);
      if (!present) return { ok: false, message: 'В системе нет подтверждённого канала этой цивилизации' };
      if (contact.stage === 'trusted') return { ok: true, message: 'Уже установлен доверительный канал' };
      const advanced = buildWorldAdvance(state, ACTION_TIME.firstContact, `first-contact:${civilizationId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const specialistBonus = state.crew.some((member) => member.primaryRole === 'diplomat') ? 0.18 : state.crew.some((member) => member.primaryRole === 'scientist' || member.primaryRole === 'archaeologist') ? 0.08 : 0;
      const baseChance = contact.stage === 'failed' ? 0.48 : contact.stage === 'unknown' ? 0.58 : contact.stage === 'observed' ? 0.66 : contact.stage === 'signals' ? 0.72 : 0.82;
      const rng = createRng(`${galaxy.seed}:contact:${civilizationId}:${contact.attempts}:${advanced.patch.simulation?.clock.absoluteHour ?? nextYear}`);
      const success = rng.chance(Math.min(0.94, baseChance + specialistBonus));
      const nextStage = success ? nextContactStage(contact.stage) : 'failed';
      const nextContact: CivilizationContact = {
        ...contact,
        stage: nextStage,
        attempts: contact.attempts + 1,
        languageLevel: Math.max(0, Math.min(5, contact.languageLevel + (success && (nextStage === 'translated' || nextStage === 'contacted' || nextStage === 'trusted') ? 1 : 0))),
        trust: Math.max(-100, Math.min(100, contact.trust + (success ? 8 : -7))),
        firstContactYear: success && (nextStage === 'contacted' || nextStage === 'trusted') ? contact.firstContactYear ?? nextYear : contact.firstContactYear,
        lastContactYear: nextYear,
        notes: [...contact.notes, success ? `Связь продвинута до стадии «${nextStage}».` : 'Передача была понята неверно; канал временно сорван.'].slice(-12)
      };
      let factions = state.factions;
      const related = factions.find((faction) => faction.civilizationId === civilizationId);
      if (related) factions = adjustFactionStanding(factions, related.id, nextYear, 'first-contact', success ? 3 : -3, success ? 'Капитан установил корректный канал связи.' : 'Попытка контакта вызвала подозрение.');
      const headline = success ? `Контакт с ${civilization.name} продвинут` : `Связь с ${civilization.name} сорвана`;
      let simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation;
      const recorded = recordWorldEvent(simulation, {
        kind: 'politics', title: headline,
        summary: success ? `Получен ответ; стадия контакта: ${nextStage}.` : 'Стороны неверно истолковали сигналы друг друга.',
        severity: success ? 4 : 6, visibility: 'public', systemIds: [currentSystemId], civilizationIds: [civilizationId], factionIds: related ? [related.id] : [], tags: ['first-contact', 'player-action']
      });
      simulation = recorded.simulation;
      let knowledge = revealKnowledge(state.knowledge, 'civilization', civilizationId, success ? ['identity', 'language', 'culture', 'politics', 'contact'] : ['identity', 'signals'], simulation.clock.absoluteHour, 'contact', success ? 82 : 56);
      if (related) knowledge = revealKnowledge(knowledge, 'faction', related.id, ['identity', 'disposition'], simulation.clock.absoluteHour, 'contact', success ? 72 : 46);
      const baseNews = (advanced.patch.news as NewsItem[] | undefined) ?? state.news;
      const news = projectNewsFromEvents([recorded.event], knowledge, baseNews, currentSystemId);
      const contracts = (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts;
      const worldThreads = projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions, contracts, research: state.researchProjects });
      set({
        ...advanced.patch,
        simulation,
        knowledge,
        civilizationContacts: [nextContact, ...state.civilizationContacts.filter((entry) => entry.civilizationId !== civilizationId)],
        factions,
        news,
        worldThreads,
        logs: [makeLog(nextYear, headline, success ? `Уровень понимания языка: ${nextContact.languageLevel}/5.` : 'Повторная попытка потребует другого подхода.', success ? 'good' : 'warning'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'first-contact');
      return { ok: success, message: success ? `Стадия контакта: ${nextStage}` : 'Контакт сорван; данные сохранены' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async interactWithNpc(npcId, kind) {
    return runExclusive('npc-interaction', set, get, async () => {
      const state = get();
      const npc = state.localNpcs.find((entry) => entry.id === npcId);
      const hub = state.hubs.find((entry) => entry.id === npc?.hubId);
      const captain = state.captain;
      if (!npc || !hub || !captain || state.currentHubId !== hub.id || !npc.alive || !npc.present) return;
      const impact = kind === 'help' ? 9 : kind === 'deal' ? 4 : -16;
      const cost = kind === 'help' ? 80 : 0;
      if (captain.credits < cost) return;
      const advanced = buildWorldAdvance(state, 2, `npc:${kind}:${npcId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const nextTrust = Math.max(-100, Math.min(100, npc.trust + impact));
      const memory = { id: `npc_memory_${npc.id}_${nextYear}_${npc.memories.length}`, year: nextYear, kind, text: kind === 'help' ? 'Капитан помог решить локальную проблему.' : kind === 'deal' ? 'Состоялась взаимовыгодная сделка.' : 'Капитан угрожал и требовал уступок.', impact } as const;
      const factions = adjustFactionStanding(state.factions, hub.factionId, nextYear, `npc-${kind}`, Math.sign(impact) * (kind === 'threat' ? 4 : 1), `${npc.name}: ${memory.text}`);
      const nextNpcs = state.localNpcs.map((entry) => entry.id === npcId ? {
        ...entry,
        trust: nextTrust,
        disposition: nextTrust <= -35 ? 'hostile' as const : nextTrust < -5 ? 'wary' as const : nextTrust >= 25 ? 'friendly' as const : 'neutral' as const,
        memories: [memory, ...entry.memories].slice(0, 20)
      } : entry);
      const simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation!;
      const contracts = (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts;
      set({
        ...advanced.patch,
        localNpcs: nextNpcs,
        factions,
        captain: { ...captain, credits: captain.credits - cost },
        worldThreads: projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions, contracts, research: state.researchProjects }),
        logs: [makeLog(nextYear, `Контакт: ${npc.name}`, memory.text, impact > 0 ? 'good' : 'warning'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'npc-interaction');
    }, undefined);
  },
  async resolveHypothesis(hypothesisId, disposition) {
    return runExclusive('hypothesis-resolution', set, get, async () => {
      const state = get();
      const hypothesis = state.hypotheses.find((entry) => entry.id === hypothesisId);
      const captain = state.captain;
      if (!hypothesis || !captain || hypothesis.disposition || !state.simulation) return;
      const advanced = buildWorldAdvance(state, 4, `hypothesis:${disposition}:${hypothesisId}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const point = state.pointsOfInterest.find((entry) => entry.id === hypothesis.pointOfInterestId);
      const civilizationId = point?.civilizationId;
      const beneficiary = disposition === 'sold'
        ? state.factions.find((faction) => faction.kind === 'university' || faction.kind === 'corporation')
        : state.factions.find((faction) => faction.civilizationId === civilizationId && faction.kind === 'government');
      const payment = disposition === 'sold' ? Math.max(220, Math.round(hypothesis.confidence * 14)) : disposition === 'published' ? Math.round(hypothesis.confidence * 3) : 0;
      let factions = state.factions;
      if (beneficiary) factions = adjustFactionStanding(factions, beneficiary.id, nextYear, `hypothesis-${disposition}`, disposition === 'suppressed' ? 2 : 6, `Получена версия «${hypothesis.title}».`);
      const updated = { ...hypothesis, disposition, beneficiaryFactionId: beneficiary?.id, resolvedYear: nextYear };
      let simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation;
      const recorded = recordWorldEvent(simulation, {
        kind: 'discovery', title: disposition === 'published' ? `Опубликована гипотеза: ${hypothesis.title}` : disposition === 'sold' ? `Материалы «${hypothesis.title}» сменили владельца` : `Материалы «${hypothesis.title}» скрыты`,
        summary: disposition === 'published' ? hypothesis.summary : disposition === 'sold' ? 'Контроль над доказательствами перешёл к частной организации.' : 'Данные исключены из открытого обмена.',
        severity: Math.max(2, Math.round(hypothesis.confidence / 16)), visibility: disposition === 'published' ? 'public' : disposition === 'sold' ? 'local' : 'hidden',
        systemIds: point ? [point.systemId] : [], civilizationIds: civilizationId ? [civilizationId] : [], factionIds: beneficiary ? [beneficiary.id] : [], tags: ['hypothesis', disposition, 'player-action']
      });
      simulation = recorded.simulation;
      const knowledge = civilizationId ? revealKnowledge(state.knowledge, 'civilization', civilizationId, ['history'], simulation.clock.absoluteHour, 'archive', hypothesis.confidence) : state.knowledge;
      const baseNews = (advanced.patch.news as NewsItem[] | undefined) ?? state.news;
      const news = projectNewsFromEvents([recorded.event], knowledge, baseNews, state.currentSystemId ?? undefined);
      const contracts = (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts;
      const worldThreads = projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions, contracts, research: state.researchProjects });
      set({
        ...advanced.patch,
        simulation,
        knowledge,
        hypotheses: [updated, ...state.hypotheses.filter((entry) => entry.id !== hypothesisId)],
        factions,
        captain: { ...captain, credits: captain.credits + payment, reputation: captain.reputation + (disposition === 'published' ? 3 : 0) },
        news,
        worldThreads,
        logs: [makeLog(nextYear, 'Решение по гипотезе', disposition === 'sold' ? `Материалы проданы за ${payment} кредитов.` : disposition === 'published' ? 'Материалы опубликованы в открытой сети.' : 'Материалы скрыты в личном архиве.', disposition === 'published' ? 'good' : 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'hypothesis-resolution');
    }, undefined);
  },
  async sellArtifactToHub(itemId, hubId, channel) {
    return runExclusive('artifact-transfer', set, get, async () => {
      const state = get();
      const { ship, captain, currentHubId } = state;
      const hub = state.hubs.find((entry) => entry.id === hubId);
      const item = ship?.cargo.find((entry) => entry.id === itemId && entry.artifactId);
      const artifact = state.galaxy?.artifacts.find((entry) => entry.id === item?.artifactId);
      const faction = state.factions.find((entry) => entry.id === hub?.factionId);
      if (!ship || !captain || !hub || !item || !artifact || currentHubId !== hubId || !state.simulation) return;
      if (channel === 'heirs' && hub.civilizationId !== artifact.civilizationId) return;
      if (channel === 'museum' && !['university', 'religious', 'government'].includes(faction?.kind ?? '')) return;
      if (channel === 'blackMarket' && !hub.services.includes('blackMarket')) return;
      const advanced = buildWorldAdvance(state, 2, `artifact-transfer:${channel}:${artifact.id}`);
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const sameCivilization = hub.civilizationId === artifact.civilizationId;
      const price = Math.max(1, Math.round(item.value * culturalArtifactMultiplier(channel, sameCivilization)));
      let factions = state.factions;
      if (faction) factions = adjustFactionStanding(factions, faction.id, nextYear, `artifact-${channel}`, channel === 'heirs' ? 12 : channel === 'museum' ? 6 : channel === 'blackMarket' ? -3 : 1, `${artifact.name} передан через канал «${channel}».`);
      let simulation = (advanced.patch.simulation as SimulationState | undefined) ?? state.simulation;
      const recorded = recordWorldEvent(simulation, {
        kind: channel === 'blackMarket' ? 'economy' : 'discovery', title: `${artifact.name} передан новым владельцам`,
        summary: channel === 'heirs' ? 'Артефакт возвращён наследникам создавшей его культуры.' : channel === 'museum' ? 'Объект передан публичному научному собранию.' : channel === 'blackMarket' ? 'Объект исчез в закрытой торговой сети.' : 'Объект продан на открытом рынке.',
        severity: Math.max(2, artifact.danger), visibility: channel === 'blackMarket' ? 'hidden' : 'public', systemIds: [hub.systemId], civilizationIds: [artifact.civilizationId], factionIds: faction ? [faction.id] : [], tags: ['artifact-transfer', channel, 'player-action']
      });
      simulation = recorded.simulation;
      const knowledge = state.knowledge;
      const news = projectNewsFromEvents([recorded.event], knowledge, (advanced.patch.news as NewsItem[] | undefined) ?? state.news, state.currentSystemId ?? undefined);
      const contracts = (advanced.patch.contracts as Contract[] | undefined) ?? state.contracts;
      const worldThreads = projectWorldThreads({ simulation, warFronts: (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts, factions, contracts, research: state.researchProjects });
      set({
        ...advanced.patch,
        simulation,
        ship: { ...ship, cargo: ship.cargo.filter((entry) => entry.id !== itemId) },
        captain: { ...captain, credits: captain.credits + price, reputation: captain.reputation + (channel === 'heirs' ? 3 : 0) },
        factions,
        news,
        worldThreads,
        logs: [makeLog(nextYear, 'Артефакт передан', `${artifact.name}: ${price} кредитов. Канал: ${channel}.`, channel === 'blackMarket' ? 'warning' : 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750)
      });
      await persist(set, get, 'artifact-transfer');
    }, undefined);
  },
  async restoreSnapshot(snapshot) {
    return runExclusive('import-save', set, get, async () => {
      const safe = parseSnapshot(snapshot);
      set({
        screen: safe.legacy.mode === 'succession' ? 'continuity' : safe.legacy.mode === 'chronicle' ? 'chronicle' : 'command',
        galaxy: safe.galaxy,
        captain: safe.captain,
        ship: safe.ship,
        currentSystemId: safe.currentSystemId,
        selectedSystemId: safe.currentSystemId,
        gameYear: safe.gameYear,
        simulation: safe.simulation,
        knowledge: safe.knowledge,
        discoveries: safe.discoveries,
        logs: safe.logs,
        scanReports: safe.scanReports,
        pointsOfInterest: safe.pointsOfInterest,
        evidence: safe.evidence,
        hypotheses: safe.hypotheses,
        artifactKnowledge: safe.artifactKnowledge,
        crew: safe.crew,
        crewCandidates: safe.crewCandidates,
        factions: safe.factions,
        hubs: safe.hubs,
        contracts: safe.contracts,
        news: safe.news,
        locationStates: safe.locationStates,
        currentHubId: safe.currentHubId,
        localNpcs: safe.localNpcs,
        civilizationContacts: safe.civilizationContacts,
        archaeologyChains: safe.archaeologyChains,
        researchProjects: safe.researchProjects,
        technologyBlueprints: safe.technologyBlueprints,
        equipmentInventory: safe.equipmentInventory,
        worldThreads: safe.worldThreads,
        storyScenes: safe.storyScenes,
        activeStorySceneId: null,
        pendingConsequences: safe.pendingConsequences,
        objectives: safe.objectives,
        tutorial: safe.tutorial,
        activeShipEncounter: safe.activeShipEncounter,
        pursuits: safe.pursuits,
        warFronts: safe.warFronts,
        legacy: safe.legacy,
        saveMeta: safe.saveMeta ?? null,
        hydrationStatus: 'ready',
        saveAvailable: true,
        saveError: null,
        recoveryNotice: 'Сохранение импортировано и проверено.'
      });
      await persist(set, get, 'import-save', { immediate: true, backup: true });
      set({ backupCount: await getBackupCount().catch(() => get().backupCount) });
    }, undefined);
  },
  getSnapshot() {
    const {
      galaxy, captain, ship, currentSystemId, gameYear, simulation, knowledge, discoveries, logs, saveMeta,
      scanReports, pointsOfInterest, evidence, hypotheses, artifactKnowledge, crew, crewCandidates, factions, hubs, contracts, news, locationStates, currentHubId, localNpcs, civilizationContacts, archaeologyChains, researchProjects, technologyBlueprints, equipmentInventory, worldThreads, storyScenes, pendingConsequences, objectives, tutorial, activeShipEncounter, pursuits, warFronts, legacy
    } = get();
    if (!galaxy || !captain || !ship || !currentSystemId || !simulation) return null;
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      saveMeta: saveMeta ?? emptySaveMeta(),
      galaxy,
      captain,
      ship,
      currentSystemId,
      gameYear,
      simulation,
      knowledge,
      discoveries,
      logs,
      scanReports,
      pointsOfInterest,
      evidence,
      hypotheses,
      artifactKnowledge,
      crew,
      crewCandidates,
      factions,
      hubs,
      contracts,
      news,
      locationStates,
      currentHubId,
      localNpcs,
      civilizationContacts,
      archaeologyChains,
      researchProjects,
      technologyBlueprints,
      equipmentInventory,
      worldThreads,
      storyScenes,
      pendingConsequences,
      objectives,
      tutorial,
      activeShipEncounter,
      pursuits,
      warFronts,
      legacy
    };
  }
}));
