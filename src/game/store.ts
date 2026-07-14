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
  WorldThread,
  SimulationState,
  KnowledgeRecord
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
import { generateContracts, generateMarket, generateNews, initializeLivingGalaxy } from '../world/livingGalaxy';
import { culturalArtifactMultiplier, initializeCivilizationLayer } from '../world/civilizations';
import { blueprintFromProject, createResearchProject, researchPower } from '../research/technology';
import { initializeWorldThreads, syncWorldThreads } from '../world/storyThreads';
import { advanceWarFronts, createShipSystems, createTravelEncounter, damageSystem, initializeWarFronts, normalizeShipSystems, systemIntegrity } from '../world/warfare';
import { chronicleEntry, closeCurrentCaptain, createInitialLegacy } from '../world/legacy';
import { generateHubScene, generateScanScene, generateTravelScene, initializeNarrative, processDueConsequences } from '../narrative/encounters';
import { advanceSimulation, initializeSimulation, migrateLegacyKnowledge, revealKnowledge } from '../simulation';

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
  simulation: SimulationState;
  knowledge: KnowledgeRecord[];
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
  advanceWorld(hours: number, reason: string): Promise<void>;
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
  for (const system of prepared.systems) {
    system.known = false;
    system.visited = false;
    system.scanned = false;
    for (const planet of system.planets) {
      planet.scanned = false;
      planet.scanLevel = 0;
      planet.lastScanYear = undefined;
    }
  }
  const start = prepared.systems.find((system) => system.id === prepared.startSystemId) ?? prepared.systems[0];
  if (!start) return { galaxy: prepared };
  start.known = true;
  start.visited = true;
  start.scanned = false;
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

let hydrationTask: Promise<void> | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'menu',
  galaxy: null,
  captain: null,
  ship: null,
  currentSystemId: null,
  selectedSystemId: null,
  gameYear: 0,
  simulation: initializeSimulation('VOID'),
  knowledge: [],
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
    const galaxy = get().galaxy;
    if (!galaxy || hours <= 0) return;
    const result = advanceSimulation({ galaxy, factions: get().factions, hubs: get().hubs, warFronts: get().warFronts, contracts: get().contracts, news: get().news, simulation: get().simulation }, hours);
    const eventLogs = result.generatedEvents.map((event) => makeLog(event.year, event.title, event.summary, event.severity >= 70 ? 'danger' as const : event.severity >= 40 ? 'warning' as const : 'info' as const));
    set({ simulation: result.simulation, gameYear: result.simulation.time.year, factions: result.factions, hubs: result.hubs, warFronts: result.warFronts, contracts: result.contracts, news: result.news, logs: [...eventLogs, ...get().logs].slice(0, 750) });
    await persist(set, get, `world-time-${reason}`);
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
          gameYear: safe.simulation.time.year,
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
      const simulation = initializeSimulation(enrichedGalaxy.seed);
      const knowledge = migrateLegacyKnowledge(enrichedGalaxy);
      set({
        screen: 'command',
        galaxy: enrichedGalaxy,
        captain,
        ship,
        currentSystemId: start.id,
        selectedSystemId: start.id,
        gameYear: simulation.time.year,
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
        worldThreads: initializeWorldThreads(enrichedGalaxy.civilizations, living.factions, civilizationLayer.archaeologyChains, 0),
        storyScenes: narrative.storyScenes,
        activeStorySceneId: null,
        pendingConsequences: narrative.pendingConsequences,
        objectives: narrative.objectives,
        tutorial: { ...narrative.tutorial, targetPlanetId: preparedStart.tutorialPlanetId },
        activeShipEncounter: null,
        pursuits: [],
        warFronts: initializeWarFronts(enrichedGalaxy.seed, living.factions, enrichedGalaxy.systems, 0),
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
          selectedSystemId: null, gameYear: 0, simulation: initializeSimulation('VOID'), knowledge: [], discoveries: [], logs: [], scanReports: [],
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
      const { legacy, galaxy, factions, warFronts, gameYear } = get();
      if (!galaxy || legacy.mode !== 'chronicle') return;
      const span = Math.max(1, Math.min(50, Math.floor(years)));
      const nextYear = gameYear + span;
      let fronts = warFronts;
      for (let year = gameYear + 1; year <= nextYear; year += 1) fronts = advanceWarFronts(`${galaxy.seed}:observer`, fronts, year);
      const active = fronts.filter((entry) => entry.status === 'active');
      const entry = chronicleEntry({
        year: nextYear,
        category: active.length ? 'war' : 'world',
        title: `${span} лет наблюдения`,
        text: active.length ? `Активных фронтов: ${active.length}. Границы и влияние продолжают меняться.` : 'Крупных войн не зафиксировано. Торговля и миграции продолжаются.',
        tone: active.length ? 'warning' : 'info'
      });
      set({ gameYear: nextYear, warFronts: fronts, legacy: { ...legacy, observerYear: nextYear, chronicle: [entry, ...legacy.chronicle].slice(0, 1000) } });
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
      const { galaxy, ship, currentSystemId, gameYear } = get();
      if (!galaxy || !ship || !currentSystemId) return { ok: false, message: 'Нет активной партии' };
      if (get().activeShipEncounter && get().activeShipEncounter?.phase !== 'resolved') return { ok: false, message: 'Сначала завершите корабельный контакт' };
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
      const updatedGalaxy = structuredClone(galaxy);
      const updatedTarget = updatedGalaxy.systems.find((system) => system.id === target.id);
      if (updatedTarget) {
        updatedTarget.known = true;
        updatedTarget.visited = true;
        updatedTarget.neighbors.forEach((neighborId) => {
          const neighbor = updatedGalaxy.systems.find((system) => system.id === neighborId);
          if (neighbor) neighbor.known = true;
        });
      }
      const updatedShip = { ...ship, systems: normalizeShipSystems(ship.systems), fuel: ship.fuel - fuelCost };
      const travelHours = Math.max(8, Math.round(jumpDistance * 1.8));
      const simulationResult = advanceSimulation({ galaxy: updatedGalaxy, factions: get().factions, hubs: get().hubs, warFronts: get().warFronts, contracts: get().contracts, news: get().news, simulation: get().simulation }, travelHours);
      const nextYear = simulationResult.simulation.time.year;
      const logs = [makeLog(nextYear, 'Прыжок завершён', `${current.name} → ${target.name}. Потрачено ${fuelCost} топлива. Мир прожил ещё ${travelHours} ч.`, 'info'), ...get().logs];
      const warFronts = simulationResult.warFronts;
      let activeShipEncounter = createTravelEncounter({
        seed: updatedGalaxy.seed,
        system: target,
        factions: get().factions,
        pursuits: get().pursuits,
        warFronts,
        year: nextYear,
        serial: get().logs.length + get().storyScenes.length
      });
      if (activeShipEncounter) activeShipEncounter = { ...activeShipEncounter, stationAssignments: buildStationAssignments(get().crew) };
      const encounter = activeShipEncounter ? 'shipContact' as const : undefined;
      const targetFaction = get().factions.find((entry) => entry.id === target.factionId);
      const hasCivilianHub = get().hubs.some((hub) => hub.systemId === target.id && hub.safety !== 'danger');
      if (activeShipEncounter) logs.unshift(makeLog(nextYear, 'Корабельный контакт', `${activeShipEncounter.contact.name}: ${activeShipEncounter.contact.demand}`, activeShipEncounter.contact.hostile ? 'danger' : 'warning'));
      else if (targetFaction?.disposition === 'friendly' || hasCivilianHub) logs.unshift(makeLog(nextYear, 'Гражданский контроль', 'Диспетчер передал коридор движения и список открытых портов.', 'good'));
      const contracts = simulationResult.contracts.map((contract) => contract.status === 'active' && nextYear > contract.deadlineYear ? { ...contract, status: 'expired' as const } : contract);
      const newsItem = generateNews(updatedGalaxy.seed, updatedGalaxy.systems, simulationResult.hubs, nextYear, simulationResult.news.length);
      const nextNews = [newsItem, ...simulationResult.news].slice(0, 500);
      const worldThreads = syncWorldThreads(get().worldThreads, contracts, nextNews, get().researchProjects, nextYear);
      const generatedScene = activeShipEncounter ? null : generateTravelScene(updatedGalaxy.seed, current.id, target.id, target.name, nextYear, get().hubs, get().factions);
      const processedConsequences = processDueConsequences(get().pendingConsequences, nextYear);
      processedConsequences.due.forEach((entry) => logs.unshift(makeLog(nextYear, entry.title, entry.text, entry.tone)));
      const storyScenes = [
        ...(generatedScene ? [generatedScene] : []),
        ...get().storyScenes.map((scene) => scene.status === 'available' && scene.expiresYear !== undefined && scene.expiresYear < nextYear ? { ...scene, status: 'expired' as const } : scene)
      ].slice(0, 160);
      const objectives = get().objectives.map((objective) => objective.status === 'active' && objective.deadlineYear !== undefined && objective.deadlineYear < nextYear ? { ...objective, status: 'failed' as const } : objective);
      const pursuits = get().pursuits.map((entry) => entry.status === 'active' && (entry.knownIdentity || entry.knownTransponder) ? { ...entry, lastKnownSystemId: target.id, lastUpdateYear: nextYear } : entry);
      const knowledge = revealKnowledge(get().knowledge, { entityId: target.id, entityType: 'system', fields: ['position', 'star', 'routes'], confidence: 82, atHour: simulationResult.simulation.time.absoluteHour, source: 'direct' });
      set({ galaxy: updatedGalaxy, ship: updatedShip, currentSystemId: target.id, selectedSystemId: target.id, currentHubId: null, gameYear: nextYear, simulation: simulationResult.simulation, knowledge, factions: simulationResult.factions, hubs: simulationResult.hubs, logs, contracts, news: nextNews, worldThreads, storyScenes, activeStorySceneId: generatedScene?.id ?? null, pendingConsequences: processedConsequences.consequences, objectives, activeShipEncounter, pursuits, warFronts });
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
      const captain = get().captain;
      const ship = get().ship;
      if (!captain || !ship) return { ok: false, message: 'Корабль недоступен' };
      const cost = 420;
      if (captain.credits < cost) return { ok: false, message: `Нужно ${cost} кредитов` };
      const code = `GHOST-${Math.abs((get().gameYear + get().logs.length) * 7919).toString(36).toUpperCase()}`;
      const pursuits = get().pursuits.map((entry) => entry.status === 'active' ? { ...entry, knownTransponder: false, intensity: Math.max(5, entry.intensity - 18) } : entry);
      set({ captain: { ...captain, credits: captain.credits - cost }, ship: { ...ship, transponder: code }, pursuits, logs: [makeLog(get().gameYear, 'Транспондер заменён', `Новый позывной: ${code}. Старые ориентировки частично потеряли силу.`, 'good'), ...get().logs] });
      await persist(set, get, 'transponder-change', { immediate: true });
      return { ok: true, message: 'Транспондер заменён' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async scanSystem(systemId) {
    return runExclusive('system-scan', set, get, async () => {
      const { galaxy, gameYear } = get();
      if (!galaxy || systemId !== get().currentSystemId) return;
      const updatedGalaxy = structuredClone(galaxy);
      const system = updatedGalaxy.systems.find((entry) => entry.id === systemId);
      if (!system) return;
      system.scanned = true;
      system.known = true;
      system.neighbors.forEach((neighborId) => { const neighbor = updatedGalaxy.systems.find((entry) => entry.id === neighborId); if (neighbor) neighbor.known = true; });
      system.planets.forEach((planet) => {
        planet.scanned = true;
        planet.scanLevel = Math.max(planet.scanLevel ?? 0, 1) as 1;
        planet.lastScanYear = gameYear;
      });
      const civilizationContacts = get().civilizationContacts.map((contact) => system.civilizationIds.includes(contact.civilizationId) && contact.stage === 'unknown' ? {
        ...contact,
        stage: 'observed' as const,
        lastContactYear: gameYear,
        notes: [...contact.notes, `Зафиксированы признаки присутствия в системе ${system.name}.`].slice(-12)
      } : contact);
      const report: ScanReport = {
        id: `scan_system_${system.id}_${gameYear}`,
        systemId: system.id,
        level: 1,
        confidence: 46,
        createdYear: gameYear,
        summary: `Определены орбиты ${system.planets.length} планет. Детальные сигналы требуют фокусировки сканера.`,
        warnings: system.anomaly ? ['В системе присутствуют нестабильные показания.'] : [],
        detectedPointOfInterestIds: []
      };
      const tutorial = get().tutorial;
      const tutorialUpdate = tutorial.active && tutorial.currentStep === 1 ? { ...tutorial, currentStep: 2 } : tutorial;
      const scanScene = generateScanScene(updatedGalaxy.seed, system.id, system.name, gameYear);
      const storyScenes = scanScene && !get().storyScenes.some((scene) => scene.id === scanScene.id) ? [scanScene, ...get().storyScenes].slice(0, 160) : get().storyScenes;
      set({
        galaxy: updatedGalaxy,
        tutorial: tutorialUpdate,
        scanReports: [report, ...get().scanReports.filter((entry) => entry.id !== report.id)],
        civilizationContacts,
        storyScenes,
        activeStorySceneId: scanScene?.id ?? null,
        logs: [makeLog(gameYear, `Система ${system.name} просканирована`, 'Получены орбиты, первичные характеристики планет и признаки разумной активности.', 'good'), ...get().logs]
      });
      await persist(set, get, 'system-scan');
    }, undefined);
  },
  async detailedScanPlanet(planetId) {
    return runExclusive('detail-scan', set, get, async () => {
      const { galaxy, currentSystemId, gameYear } = get();
      if (!galaxy || !currentSystemId) return { ok: false, message: 'Нет активной системы' };
      const updatedGalaxy = structuredClone(galaxy);
      const system = updatedGalaxy.systems.find((entry) => entry.id === currentSystemId);
      const planet = system?.planets.find((entry) => entry.id === planetId);
      if (!system || !planet || !system.scanned) return { ok: false, message: 'Сначала выполните системный скан' };
      planet.scanLevel = Math.max(planet.scanLevel ?? 0, 2) as 2;
      planet.scanned = true;
      planet.lastScanYear = gameYear;
      const existing = get().pointsOfInterest.filter((entry) => entry.planetId === planetId);
      const generated = existing.length > 0 ? existing : generatePointsOfInterest(updatedGalaxy, system, planet).map((entry) => ({ ...entry, discoveredYear: gameYear }));
      const allPoints = existing.length > 0 ? get().pointsOfInterest : [...generated, ...get().pointsOfInterest];
      const archaeologyChains = bindArchaeologyPoints(get().archaeologyChains, allPoints);
      const civilizationContacts = get().civilizationContacts.map((contact) => planet.civilizationId === contact.civilizationId && (contact.stage === 'unknown' || contact.stage === 'observed') ? {
        ...contact,
        stage: 'signals' as const,
        lastContactYear: gameYear,
        notes: [...contact.notes, `Детальный скан ${planet.name} выделил искусственные сигналы.`].slice(-12)
      } : contact);
      const report: ScanReport = {
        id: `scan_planet_${planet.id}_${gameYear}_${get().scanReports.length}`,
        systemId: system.id,
        planetId: planet.id,
        level: 2,
        confidence: Math.min(92, 55 + planet.habitability / 3),
        createdYear: gameYear,
        summary: `Обнаружено ${generated.length} сигналов. Часть угроз может быть скрыта средой.`,
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
        year: gameYear,
        tags: [entry.type, entry.danger]
      }));
      const unique = signalDiscoveries.filter((entry) => !get().discoveries.some((existingEntry) => existingEntry.id === entry.id));
      let captain = get().captain;
      let factions = get().factions;
      let reward = 0;
      const contracts = get().contracts.map((contract) => {
        if (contract.status !== 'active' || contract.type !== 'survey' || contract.targetSystemId !== system.id) return contract;
        reward += contract.reward;
        factions = adjustFactionStanding(factions, contract.issuerFactionId, gameYear, 'contract-complete', 6, `Выполнен контракт «${contract.title}».`);
        return completedContract(contract, gameYear);
      });
      if (captain && reward > 0) captain = { ...captain, credits: captain.credits + reward, reputation: captain.reputation + 2 };
      const tutorial = get().tutorial;
      const tutorialPoint = generated.find((entry) => entry.planetId === tutorial.targetPlanetId) ?? generated[0];
      const tutorialUpdate = tutorial.active && tutorial.currentStep === 3
        ? { ...tutorial, currentStep: 4, targetPointOfInterestId: tutorialPoint?.id ?? tutorial.targetPointOfInterestId }
        : tutorial;
      const scanScene = generateScanScene(updatedGalaxy.seed, system.id, system.name, gameYear, planet.name);
      const storyScenes = scanScene && !get().storyScenes.some((scene) => scene.id === scanScene.id) ? [scanScene, ...get().storyScenes].slice(0, 160) : get().storyScenes;
      set({
        galaxy: updatedGalaxy,
        tutorial: tutorialUpdate,
        pointsOfInterest: allPoints,
        scanReports: [report, ...get().scanReports],
        discoveries: [...unique, ...get().discoveries],
        contracts,
        factions,
        captain,
        archaeologyChains,
        civilizationContacts,
        storyScenes,
        activeStorySceneId: scanScene?.id ?? null,
        logs: [makeLog(gameYear, `Детальный скан: ${planet.name}`, `Обнаружено ${generated.length} точек интереса.${reward ? ` Контракт закрыт: +${reward} кредитов.` : ''}`, 'good'), ...get().logs]
      });
      await persist(set, get, 'detail-scan');
      return { ok: true, message: `Обнаружено сигналов: ${generated.length}` };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async investigatePoint(pointId) {
    return runExclusive('investigate-point', set, get, async () => {
      const { galaxy, captain, gameYear } = get();
      const point = get().pointsOfInterest.find((entry) => entry.id === pointId);
      if (!galaxy || !captain || !point) return { ok: false, message: 'Сигнал недоступен' };
      if (point.status === 'resolved') return { ok: false, message: 'Сигнал уже исследован' };
      if (point.access === 'surface') return { ok: false, message: 'Для этой цели требуется высадка' };
      const system = galaxy.systems.find((entry) => entry.id === point.systemId);
      const planet = system?.planets.find((entry) => entry.id === point.planetId);
      if (!system || !planet) return { ok: false, message: 'Источник сигнала потерян' };
      const method = point.access === 'orbital' ? 'Орбитальный анализ' : 'Дистанционный анализ';
      const discovery: Discovery = {
        id: `disc_remote_${point.id}`,
        kind: point.type === 'biosphere' ? 'biosphere' : point.type === 'settlement' ? 'settlement' : point.type === 'anomaly' ? 'anomaly' : 'signal',
        name: point.name,
        systemId: point.systemId,
        planetId: point.planetId,
        pointOfInterestId: point.id,
        description: `${method} завершён. ${point.publicSummary}`,
        confidence: Math.max(point.scanConfidence, point.access === 'orbital' ? 86 : 74),
        year: gameYear,
        tags: [point.type, point.access, point.danger]
      };
      const scanScene = generateScanScene(galaxy.seed, system.id, system.name, gameYear, point.name);
      const storyScenes = scanScene && !get().storyScenes.some((scene) => scene.id === scanScene.id) ? [scanScene, ...get().storyScenes].slice(0, 160) : get().storyScenes;
      const civilizationContacts = get().civilizationContacts.map((contact) => point.civilizationId === contact.civilizationId && ['unknown','observed'].includes(contact.stage) ? {
        ...contact,
        stage: 'signals' as const,
        lastContactYear: gameYear,
        notes: [...contact.notes, `${method} сигнала «${point.name}» подтвердил искусственное происхождение.`].slice(-12)
      } : contact);
      set({
        pointsOfInterest: get().pointsOfInterest.map((entry) => entry.id === point.id ? { ...entry, status: 'resolved' as const, visits: entry.visits + 1, lastVisitedYear: gameYear } : entry),
        discoveries: get().discoveries.some((entry) => entry.id === discovery.id) ? get().discoveries : [discovery, ...get().discoveries],
        civilizationContacts,
        storyScenes,
        activeStorySceneId: scanScene?.id ?? null,
        logs: [makeLog(gameYear, method, `${point.name}: анализ завершён без высадки.`, 'good'), ...get().logs]
      });
      await persist(set, get, 'investigate-point');
      return { ok: true, message: `${method} завершён` };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async completeExpedition(result) {
    return runExclusive('expedition-complete', set, get, async () => {
      const { galaxy, captain, ship, gameYear, currentSystemId } = get();
      if (!galaxy || !captain || !ship || !currentSystemId) return;
      const point = get().pointsOfInterest.find((entry) => entry.id === result.pointOfInterestId);
      if (!point) return;
      const system = galaxy.systems.find((entry) => entry.id === point.systemId);
      const planet = system?.planets.find((entry) => entry.id === point.planetId);
      const updatedGalaxy = structuredClone(galaxy);
      const updatedPoints = get().pointsOfInterest.map((entry) => entry.id === point.id ? {
        ...entry,
        status: result.outcome === 'resolved' ? 'resolved' as const : result.blockedReason ? 'blocked' as const : 'visited' as const,
        visits: entry.visits + 1,
        lastVisitedYear: gameYear
      } : entry);
      let updatedShip = { ...ship, cargo: [...ship.cargo] };
      let updatedCaptain = { ...captain, injuries: [...captain.injuries] };
      const logs = [...get().logs];
      const newDiscoveries = [...get().discoveries];

      if (result.artifact && !updatedShip.cargo.some((item) => item.artifactId === result.artifact?.id)) {
        const storedArtifact = updatedGalaxy.artifacts.find((entry) => entry.id === result.artifact?.id);
        if (storedArtifact) storedArtifact.discovered = true;
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

      set({
        galaxy: updatedGalaxy,
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
        worldThreads: syncWorldThreads(get().worldThreads, contracts, get().news, get().researchProjects, gameYear),
        legacy,
        screen: nextScreen,
        logs
      });
      await persist(set, get, updatedCaptain.health <= 0 ? 'captain-death-expedition' : 'expedition', { immediate: updatedCaptain.health <= 0, backup: updatedCaptain.health <= 0 });
    }, undefined);
  },
  async analyzeArtifact(artifactId) {
    return runExclusive('artifact-analysis', set, get, async () => {
      const { galaxy, captain } = get();
      if (!galaxy || !captain) return;
      const artifact = galaxy.artifacts.find((entry) => entry.id === artifactId);
      if (!artifact) return;
      const cost = 120;
      if (captain.credits < cost) return;
      const previous = get().artifactKnowledge.find((entry) => entry.artifactId === artifactId) ?? { artifactId, level: 0, knownFields: [], notes: [] };
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
      set({
        captain: { ...captain, credits: captain.credits - cost },
        artifactKnowledge: [next, ...get().artifactKnowledge.filter((entry) => entry.artifactId !== artifactId)],
        logs: [makeLog(get().gameYear, 'Анализ артефакта', `${artifact.name}: уровень знаний ${level}/4.`, 'good'), ...get().logs]
      });
      await persist(set, get, 'artifact-analysis');
    }, undefined);
  },
  async startResearch(artifactId) {
    return runExclusive('research-start', set, get, async () => {
      const { galaxy, ship, captain, gameYear } = get();
      const artifact = galaxy?.artifacts.find((entry) => entry.id === artifactId);
      const carried = ship?.cargo.some((item) => item.artifactId === artifactId);
      if (!galaxy || !ship || !captain || !artifact || !carried) return { ok: false, message: 'Артефакт должен находиться на борту' };
      if (get().researchProjects.some((entry) => entry.artifactId === artifactId && entry.status !== 'failed')) return { ok: false, message: 'Исследование уже создано' };
      const cost = 180 + artifact.danger * 25;
      if (captain.credits < cost) return { ok: false, message: `Нужно ${cost} кредитов на изоляцию и расходники` };
      const project = createResearchProject(artifact, gameYear);
      const researchProjects = [project, ...get().researchProjects];
      set({
        captain: { ...captain, credits: captain.credits - cost },
        researchProjects,
        worldThreads: syncWorldThreads(get().worldThreads, get().contracts, get().news, researchProjects, gameYear),
        logs: [makeLog(gameYear, 'Запущено исследование', `${artifact.name} помещён в лабораторию. Риск ${project.risk}/10.`, 'info'), ...get().logs]
      });
      await persist(set, get, 'research-start');
      return { ok: true, message: 'Исследование запущено' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async advanceResearch(projectId) {
    return runExclusive('research-cycle', set, get, async () => {
      const { galaxy, captain, ship, crew, gameYear } = get();
      const project = get().researchProjects.find((entry) => entry.id === projectId);
      const artifact = galaxy?.artifacts.find((entry) => entry.id === project?.artifactId);
      if (!galaxy || !captain || !ship || !project || !artifact || project.status !== 'active') return { ok: false, message: 'Активное исследование не найдено' };
      const cost = 90 + project.risk * 18;
      if (captain.credits < cost) return { ok: false, message: `Нужно ${cost} кредитов на цикл` };
      const specialists = crew.filter((member) => ['scientist','archaeologist','engineer','doctor','biologist'].includes(member.primaryRole));
      const rng = createRng(`${galaxy.seed}:${project.id}:${project.progress}:${gameYear}`);
      const gain = researchPower(specialists) + captain.skills.research * 6 + rng.int(0, 12);
      const progress = Math.min(project.requiredProgress, project.progress + gain);
      const complication = rng.chance(Math.min(.48, project.risk * .035));
      const completed = progress >= project.requiredProgress;
      const nextYear = gameYear + 1;
      const nextProject: ResearchProject = {
        ...project,
        progress,
        status: completed ? 'completed' : complication && project.risk >= 9 ? 'failed' : 'active',
        updatedYear: nextYear,
        completedYear: completed ? nextYear : project.completedYear,
        complication: complication ? 'Контур дал нестабильный выброс; часть данных повреждена.' : project.complication,
        log: [`Цикл ${nextYear}: +${gain} прогресса${complication ? ', зафиксирован сбой' : ''}.`, ...project.log].slice(0, 12)
      };
      const researchProjects = [nextProject, ...get().researchProjects.filter((entry) => entry.id !== project.id)];
      let technologyBlueprints = get().technologyBlueprints;
      let equipmentInventory = get().equipmentInventory;
      let knowledge = get().artifactKnowledge;
      let nextShip = ship;
      if (completed) {
        const blueprint = blueprintFromProject(nextProject, artifact, nextYear);
        blueprint.factionInterest = get().factions.filter((entry) => entry.research >= 45).sort((a, b) => b.research - a.research).slice(0, 3).map((entry) => entry.id);
        technologyBlueprints = [blueprint, ...technologyBlueprints.filter((entry) => entry.sourceArtifactId !== artifact.id)];
        if (['medicine','biology','weapons'].includes(blueprint.domain)) {
          const category = blueprint.domain === 'weapons' ? 'weapon' as const : blueprint.domain === 'medicine' ? 'medical' as const : 'implant' as const;
          equipmentInventory = [{ id: `gear_${artifact.id}`, name: `Прототип: ${artifact.name}`, category, rarity: blueprint.rarity, description: blueprint.description, effect: blueprint.benefit, sourceArtifactId: artifact.id, condition: 100 }, ...equipmentInventory.filter((entry) => entry.sourceArtifactId !== artifact.id)];
        }
        const existing = knowledge.find((entry) => entry.artifactId === artifact.id) ?? { artifactId: artifact.id, level: 1, knownFields: [], notes: [] };
        knowledge = [{ ...existing, level: 6, knownFields: Array.from(new Set([...existing.knownFields, 'truth', 'properties', 'technology'])), notes: [`Функция восстановлена. Создан чертёж «${blueprint.name}».`, ...existing.notes], revealedTruth: artifact.truth }, ...knowledge.filter((entry) => entry.artifactId !== artifact.id)];
      } else if (complication) {
        nextShip = { ...ship, hull: Math.max(1, ship.hull - project.risk * 2), statuses: Array.from(new Set([...ship.statuses, 'лабораторный выброс'])) };
      }
      const worldThreads = syncWorldThreads(get().worldThreads, get().contracts, get().news, researchProjects, nextYear).map((thread) => thread.id === `thread_research_${project.id}` ? { ...thread, progress: Math.round(progress / project.requiredProgress * 100), status: completed ? 'resolved' as const : nextProject.status === 'failed' ? 'lost' as const : thread.status, updates: [{ id: `research_update_${project.id}_${nextYear}`, year: nextYear, text: completed ? `Исследование завершено: ${artifact.name}.` : complication ? 'Лабораторный цикл завершился аварийным выбросом.' : `Получены новые данные: ${gain} ед.`, tone: completed ? 'good' as const : complication ? 'danger' as const : 'info' as const }, ...thread.updates].slice(0, 8) } : thread);
      set({
        captain: { ...captain, credits: captain.credits - cost }, ship: nextShip, gameYear: nextYear,
        researchProjects, technologyBlueprints, equipmentInventory, artifactKnowledge: knowledge, worldThreads,
        logs: [makeLog(nextYear, completed ? 'Технология восстановлена' : complication ? 'Авария в лаборатории' : 'Исследовательский цикл', completed ? `Создан новый технологический чертёж из объекта «${artifact.name}».` : complication ? 'Сбой повредил корпус и остановил часть анализа.' : `${project.title}: ${progress}/${project.requiredProgress}.`, completed ? 'good' : complication ? 'danger' : 'info'), ...get().logs]
      });
      await persist(set, get, 'research-cycle');
      return { ok: true, message: completed ? 'Исследование завершено' : nextProject.status === 'failed' ? 'Проект потерян' : `Прогресс ${progress}/${project.requiredProgress}` };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async installBlueprint(blueprintId) {
    return runExclusive('blueprint-install', set, get, async () => {
      const { captain, ship, gameYear } = get();
      const blueprint = get().technologyBlueprints.find((entry) => entry.id === blueprintId);
      if (!captain || !ship || !blueprint || blueprint.status === 'installed') return { ok: false, message: 'Чертёж недоступен' };
      if (captain.credits < blueprint.installCost) return { ok: false, message: `Нужно ${blueprint.installCost} кредитов` };
      const module = { id: `module_${blueprint.id}`, name: blueprint.name, slot: blueprint.moduleSlot, rarity: blueprint.rarity, effect: `${blueprint.benefit}; недостаток: ${blueprint.drawback}` };
      let nextShip = { ...ship, modules: [...ship.modules.filter((entry) => entry.id !== module.id), module] };
      if (blueprint.domain === 'propulsion') nextShip = { ...nextShip, jumpRange: nextShip.jumpRange + 45 };
      if (blueprint.domain === 'energy') nextShip = { ...nextShip, maxFuel: nextShip.maxFuel + 15, fuel: nextShip.fuel + 15 };
      if (blueprint.domain === 'materials') nextShip = { ...nextShip, maxHull: nextShip.maxHull + 20, hull: nextShip.hull + 20 };
      const technologyBlueprints = get().technologyBlueprints.map((entry) => entry.id === blueprint.id ? { ...entry, status: 'installed' as const } : entry);
      set({
        captain: { ...captain, credits: captain.credits - blueprint.installCost }, ship: nextShip, technologyBlueprints,
        logs: [makeLog(gameYear, 'Экспериментальный модуль установлен', `${blueprint.name}: ${blueprint.benefit}.`, blueprint.status === 'restricted' ? 'warning' : 'good'), ...get().logs]
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
      const { ship, captain } = get();
      if (!ship || !captain) return;
      const missingHull = ship.maxHull - ship.hull;
      const normalizedSystems = normalizeShipSystems(ship.systems);
      const missingSystems = normalizedSystems.reduce((sum, entry) => sum + (entry.maxIntegrity - entry.integrity), 0);
      const cost = Math.ceil(missingHull * 4 + missingSystems * 1.5);
      if ((missingHull <= 0 && missingSystems <= 0) || captain.credits < cost) return;
      set({ ship: { ...ship, hull: ship.maxHull, systems: createShipSystems(), statuses: [] }, captain: { ...captain, credits: captain.credits - cost }, logs: [makeLog(get().gameYear, 'Ремонт завершён', `Корпус и корабельные системы восстановлены. Потрачено ${cost} кредитов.`, 'good'), ...get().logs] });
      await persist(set, get, 'repair');
    }, undefined);
  },
  async refuelShip() {
    return runExclusive('refuel', set, get, async () => {
      const { ship, captain } = get();
      if (!ship || !captain) return;
      const missing = ship.maxFuel - ship.fuel;
      const cost = Math.ceil(missing * 3);
      if (missing <= 0 || captain.credits < cost) return;
      set({ ship: { ...ship, fuel: ship.maxFuel }, captain: { ...captain, credits: captain.credits - cost }, logs: [makeLog(get().gameYear, 'Заправка завершена', `Потрачено ${cost} кредитов.`, 'good'), ...get().logs] });
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
      const { ship, captain, gameYear } = get();
      if (!ship || !captain) return;
      const item = ship.cargo.find((entry) => entry.id === itemId);
      if (!item) return;
      const price = Math.max(1, Math.round(item.value * 0.72));
      set({
        ship: { ...ship, cargo: ship.cargo.filter((entry) => entry.id !== itemId) },
        captain: { ...captain, credits: captain.credits + price },
        logs: [makeLog(gameYear, 'Груз продан', `${item.name}: получено ${price} кредитов.`, 'good'), ...get().logs]
      });
      await persist(set, get, 'sell-cargo');
    }, undefined);
  },
  async refreshCrewCandidates() {
    return runExclusive('crew-search', set, get, async () => {
      const { galaxy, currentSystemId, gameYear, captain } = get();
      if (!galaxy || !currentSystemId || !captain) return;
      const system = galaxy.systems.find((entry) => entry.id === currentSystemId);
      if (!system) return;
      const cost = 40;
      if (captain.credits < cost) return;
      const candidates = generateCrewCandidates(galaxy.seed, system, gameYear, 4);
      set({
        crewCandidates: candidates,
        captain: { ...captain, credits: captain.credits - cost },
        logs: [makeLog(gameYear, 'Поиск экипажа', `Получено ${candidates.length} новых анкет. Потрачено ${cost} кредитов.`, 'info'), ...get().logs]
      });
      await persist(set, get, 'crew-search');
    }, undefined);
  },
  async hireCrew(candidateId) {
    return runExclusive('crew-hire', set, get, async () => {
      const { crew, crewCandidates, captain, gameYear } = get();
      if (!captain || crew.length >= 4) return;
      const candidate = crewCandidates.find((entry) => entry.id === candidateId);
      if (!candidate || captain.credits < candidate.signingCost) return;
      const { signingCost: _signingCost, originSystemId: _originSystemId, ...memberData } = candidate;
      const member: CrewMember = {
        ...memberData,
        joinedYear: gameYear,
        paidUntilYear: gameYear,
        memories: [{ id: `memory_hired_${candidate.id}_${gameYear}`, year: gameYear, kind: 'hired', text: `Нанят капитаном в год ${gameYear}.`, impact: 8 }]
      };
      set({
        crew: [...crew, member],
        crewCandidates: crewCandidates.filter((entry) => entry.id !== candidateId),
        captain: { ...captain, credits: captain.credits - candidate.signingCost },
        logs: [makeLog(gameYear, 'Новый член экипажа', `${member.name}, ${member.primaryRole}. Контракт подписан.`, 'good'), ...get().logs]
      });
      await persist(set, get, 'crew-hire');
    }, undefined);
  },
  async dismissCrew(crewId) {
    return runExclusive('crew-dismiss', set, get, async () => {
      const member = get().crew.find((entry) => entry.id === crewId);
      if (!member) return;
      set({
        crew: get().crew.filter((entry) => entry.id !== crewId),
        logs: [makeLog(get().gameYear, 'Контракт расторгнут', `${member.name} покидает корабль.`, member.loyalty < 35 ? 'warning' : 'info'), ...get().logs]
      });
      await persist(set, get, 'crew-dismiss');
    }, undefined);
  },
  async settlePayroll() {
    return runExclusive('crew-payroll', set, get, async () => {
      const { crew, captain, gameYear } = get();
      if (!captain || crew.length === 0) return;
      const due = crew.reduce((sum, member) => sum + member.salary, 0);
      if (captain.credits < due) {
        set({
          crew: crew.map((member) => ({ ...member, status: 'unpaid', morale: Math.max(0, member.morale - 12), loyalty: Math.max(0, member.loyalty - 8), memories: [...member.memories, { id: `memory_unpaid_${member.id}_${gameYear}`, year: gameYear, kind: 'betrayal' as const, text: 'Капитан не выплатил жалование.', impact: -12 }].slice(-20) })),
          logs: [makeLog(gameYear, 'Жалование не выплачено', `Требуется ${due} кредитов. Экипаж недоволен.`, 'danger'), ...get().logs]
        });
      } else {
        set({
          captain: { ...captain, credits: captain.credits - due },
          crew: crew.map((member) => ({ ...member, status: member.health < member.maxHealth * 0.5 ? 'injured' : 'active', paidUntilYear: gameYear + 1, morale: Math.min(100, member.morale + 5), loyalty: Math.min(100, member.loyalty + 3), memories: [...member.memories, { id: `memory_paid_${member.id}_${gameYear}`, year: gameYear, kind: 'payment' as const, text: `Получено жалование: ${member.salary}.`, impact: 4 }].slice(-20) })),
          logs: [makeLog(gameYear, 'Жалование выплачено', `Экипаж получил ${due} кредитов.`, 'good'), ...get().logs]
        });
      }
      await persist(set, get, 'crew-payroll');
    }, undefined);
  },
  async dockAtHub(hubId) {
    return runExclusive('dock', set, get, async () => {
      const { hubs, currentSystemId, ship, captain, factions, contracts, gameYear, galaxy } = get();
      if (!currentSystemId || !ship || !captain || !galaxy) return { ok: false, message: 'Нет активного корабля' };
      const hub = hubs.find((entry) => entry.id === hubId);
      if (!hub || hub.systemId !== currentSystemId) return { ok: false, message: 'Хаб недоступен в этой системе' };
      const faction = factions.find((entry) => entry.id === hub.factionId);
      if (faction?.disposition === 'hostile') return { ok: false, message: 'Стыковка запрещена: фракция враждебна' };

      const smugglerBonus = get().crew.some((member) => member.primaryRole === 'smuggler' || member.secondaryRole === 'smuggler') ? 24 : 0;
      const illegalCargo = ship.cargo.filter((item) => item.illegal);
      const rng = createRng(`${galaxy.seed}:inspection:${hub.id}:${gameYear}:${ship.cargo.length}`);
      const inspected = illegalCargo.length > 0 && rng.chance(Math.max(0, hub.inspectionLevel - smugglerBonus) / 100);
      let updatedShip = { ...ship, cargo: [...ship.cargo] };
      let updatedCaptain = { ...captain };
      let updatedFactions = factions;
      let logs = [...get().logs];
      let message = `Стыковка разрешена: ${hub.name}.`;

      if (inspected) {
        const confiscatedValue = illegalCargo.reduce((sum, item) => sum + item.value * item.quantity, 0);
        const fine = Math.min(updatedCaptain.credits, Math.max(120, Math.round(confiscatedValue * 0.45)));
        updatedShip = { ...updatedShip, cargo: updatedShip.cargo.filter((item) => !item.illegal) };
        updatedCaptain = { ...updatedCaptain, credits: updatedCaptain.credits - fine, reputation: updatedCaptain.reputation - 3 };
        updatedFactions = adjustFactionStanding(updatedFactions, hub.factionId, gameYear, 'contraband-caught', -12, 'На корабле обнаружена контрабанда.');
        logs.unshift(makeLog(gameYear, 'Досмотр и конфискация', `Запрещённый груз изъят. Штраф: ${fine} кредитов.`, 'danger'));
        message = `Контрабанда конфискована. Штраф: ${fine}.`;
      }

      let reward = 0;
      const updatedContracts = contracts.map((contract) => {
        if (contract.status !== 'active' || contract.targetSystemId !== currentSystemId || (contract.type !== 'delivery' && contract.type !== 'smuggling')) return contract;
        const cargoPresent = updatedShip.cargo.some((item) => item.contractId === contract.id || item.id === contract.cargoId);
        if (!cargoPresent) return contract;
        if (contract.type === 'smuggling' && inspected) return { ...contract, status: 'failed' as const };
        updatedShip = { ...updatedShip, cargo: updatedShip.cargo.filter((item) => item.contractId !== contract.id && item.id !== contract.cargoId) };
        reward += contract.reward;
        updatedFactions = adjustFactionStanding(updatedFactions, contract.issuerFactionId, gameYear, 'contract-complete', 7, `Выполнен контракт «${contract.title}».`);
        return completedContract(contract, gameYear);
      });
      if (reward > 0) {
        updatedCaptain = { ...updatedCaptain, credits: updatedCaptain.credits + reward, reputation: updatedCaptain.reputation + 2 };
        logs.unshift(makeLog(gameYear, 'Доставка завершена', `Контракты закрыты. Получено ${reward} кредитов.`, 'good'));
      }
      const hubNpc = get().localNpcs.find((npc) => npc.hubId === hub.id && npc.alive && npc.present);
      const hubScene = generateHubScene(galaxy.seed, hub, faction, hubNpc?.id, gameYear);
      const storyScenes = hubScene && !get().storyScenes.some((scene) => scene.id === hubScene.id)
        ? [hubScene, ...get().storyScenes].slice(0, 160)
        : get().storyScenes;

      set({
        hubs: hubs.map((entry) => ({ ...entry, docked: entry.id === hub.id, visited: entry.id === hub.id ? true : entry.visited })),
        currentHubId: hub.id,
        screen: 'hub',
        ship: updatedShip,
        captain: updatedCaptain,
        factions: updatedFactions,
        contracts: updatedContracts,
        storyScenes,
        activeStorySceneId: hubScene?.id ?? null,
        logs
      });
      await persist(set, get, 'dock');
      return { ok: true, message };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async leaveHub() {
    return runExclusive('leave-hub', set, get, async () => {
      set({ hubs: get().hubs.map((hub) => ({ ...hub, docked: false })), currentHubId: null, screen: 'system' });
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
      const { galaxy, hubs, gameYear, currentHubId } = get();
      if (!galaxy || !currentHubId) return;
      const generated = generateContracts(galaxy.seed, hubs.filter((hub) => hub.id === currentHubId), galaxy.systems, gameYear + get().contracts.length, 8);
      set({ contracts: [...get().contracts.filter((contract) => contract.status !== 'available'), ...generated] });
      await persist(set, get, 'contracts-refresh');
    }, undefined);
  },
  async buyMarketGood(hubId, good) {
    return runExclusive('market-buy', set, get, async () => {
      const { currentHubId, captain, ship } = get();
      if (currentHubId !== hubId || !captain || !ship) return { ok: false, message: 'Сначала пристыкуйтесь к хабу' };
      if (captain.credits < good.price) return { ok: false, message: 'Недостаточно кредитов' };
      let nextShip = { ...ship, cargo: [...ship.cargo] };
      if (good.category === 'fuel') nextShip.fuel = Math.min(nextShip.maxFuel, nextShip.fuel + 20);
      else if (good.category === 'parts') nextShip.hull = Math.min(nextShip.maxHull, nextShip.hull + 18);
      else if (good.category === 'medicine') {
        const currentCaptain = get().captain!;
        set({ captain: { ...currentCaptain, health: Math.min(currentCaptain.maxHealth, currentCaptain.health + 20), credits: currentCaptain.credits - good.price } });
        await persist(set, get, 'market-buy-medicine');
        return { ok: true, message: 'Лечение проведено' };
      } else {
        if (nextShip.cargo.length >= nextShip.cargoCapacity) return { ok: false, message: 'Трюм заполнен' };
        nextShip.cargo.push({ id: `cargo_${good.id}_${Date.now()}`, name: good.name, kind: good.category, quantity: 1, value: good.price, commodityId: good.id, illegal: good.illegal });
      }
      set({ ship: nextShip, captain: { ...captain, credits: captain.credits - good.price }, logs: [makeLog(get().gameYear, 'Покупка', `${good.name}: ${good.price} кредитов.`, good.illegal ? 'warning' : 'info'), ...get().logs] });
      await persist(set, get, 'market-buy');
      return { ok: true, message: 'Покупка завершена' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async sellCommodity(itemId, hubId) {
    return runExclusive('market-sell', set, get, async () => {
      const { ship, captain, currentHubId } = get();
      if (!ship || !captain || currentHubId !== hubId) return;
      const item = ship.cargo.find((entry) => entry.id === itemId && !entry.contractId);
      if (!item) return;
      const hub = get().hubs.find((entry) => entry.id === hubId);
      const market = hub ? generateMarket(hub, get().gameYear) : [];
      const matching = market.find((good) => good.id === item.commodityId || good.category === item.kind);
      const price = Math.max(1, Math.round((matching?.price ?? item.value) * 0.68));
      set({ ship: { ...ship, cargo: ship.cargo.filter((entry) => entry.id !== itemId) }, captain: { ...captain, credits: captain.credits + price }, logs: [makeLog(get().gameYear, 'Продажа товара', `${item.name}: +${price} кредитов.`, 'good'), ...get().logs] });
      await persist(set, get, 'market-sell');
    }, undefined);
  },
  async attemptFirstContact(civilizationId) {
    return runExclusive('first-contact', set, get, async () => {
      const { galaxy, currentSystemId, gameYear } = get();
      if (!galaxy || !currentSystemId) return { ok: false, message: 'Нет активной системы' };
      const civilization = galaxy.civilizations.find((entry) => entry.id === civilizationId);
      const system = galaxy.systems.find((entry) => entry.id === currentSystemId);
      const contact = get().civilizationContacts.find((entry) => entry.civilizationId === civilizationId);
      if (!civilization || civilization.status === 'dead' || !contact) return { ok: false, message: 'Связь с этой цивилизацией невозможна' };
      const present = system?.civilizationIds.includes(civilizationId) || system?.planets.some((planet) => planet.civilizationId === civilizationId);
      if (!present) return { ok: false, message: 'В системе нет подтверждённого канала этой цивилизации' };
      if (contact.stage === 'trusted') return { ok: true, message: 'Уже установлен доверительный канал' };
      const specialistBonus = get().crew.some((member) => member.primaryRole === 'diplomat') ? 0.18
        : get().crew.some((member) => member.primaryRole === 'scientist' || member.primaryRole === 'archaeologist') ? 0.08 : 0;
      const baseChance = contact.stage === 'failed' ? 0.48 : contact.stage === 'unknown' ? 0.58 : contact.stage === 'observed' ? 0.66 : contact.stage === 'signals' ? 0.72 : 0.82;
      const rng = createRng(`${galaxy.seed}:contact:${civilizationId}:${contact.attempts}:${gameYear}`);
      const success = rng.chance(Math.min(0.94, baseChance + specialistBonus));
      const nextStage = success ? nextContactStage(contact.stage) : 'failed';
      const nextContact: CivilizationContact = {
        ...contact,
        stage: nextStage,
        attempts: contact.attempts + 1,
        languageLevel: Math.max(0, Math.min(5, contact.languageLevel + (success && (nextStage === 'translated' || nextStage === 'contacted' || nextStage === 'trusted') ? 1 : 0))),
        trust: Math.max(-100, Math.min(100, contact.trust + (success ? 8 : -7))),
        firstContactYear: success && (nextStage === 'contacted' || nextStage === 'trusted') ? contact.firstContactYear ?? gameYear : contact.firstContactYear,
        lastContactYear: gameYear,
        notes: [...contact.notes, success ? `Связь продвинута до стадии «${nextStage}».` : 'Передача была понята неверно; канал временно сорван.'].slice(-12)
      };
      let factions = get().factions;
      const related = factions.find((faction) => faction.civilizationId === civilizationId);
      if (related) factions = adjustFactionStanding(factions, related.id, gameYear, 'first-contact', success ? 3 : -3, success ? 'Капитан установил корректный канал связи.' : 'Попытка контакта вызвала подозрение.');
      const headline = success ? `Контакт с ${civilization.name} продвинут` : `Связь с ${civilization.name} сорвана`;
      const nextNews = [{ id: `news_contact_${civilizationId}_${gameYear}_${contact.attempts}`, year: gameYear, headline, text: success ? 'Получен ответ и новые языковые данные.' : 'Стороны неверно истолковали сигналы друг друга.', category: 'politics' as const, reliability: 96, systemIds: [currentSystemId] }, ...get().news].slice(0, 500);
      const existingThread = get().worldThreads.find((thread) => thread.id === `thread_contact_${civilizationId}`);
      const contactThread = {
        id: `thread_contact_${civilizationId}`, category: 'culture' as const, status: success ? 'active' as const : 'escalating' as const,
        title: `Контакт: ${civilization.name}`, summary: success ? 'Стороны постепенно создают общий язык и правила взаимодействия.' : 'Ошибка интерпретации усилила подозрение и может закрыть систему для чужаков.',
        urgency: success ? 35 : 72, progress: Math.min(100, nextContact.attempts * 18 + nextContact.languageLevel * 10), systemIds: [currentSystemId], civilizationIds: [civilizationId], factionIds: related ? [related.id] : [], relatedArtifactIds: [], playerInvolved: true,
        nextAction: success ? 'Продолжить языковой и дипломатический обмен.' : 'Сменить подход или привлечь дипломата.',
        updates: [{ id: `contact_thread_update_${civilizationId}_${gameYear}_${contact.attempts}`, year: gameYear, text: headline, tone: success ? 'good' as const : 'warning' as const }, ...(existingThread?.updates ?? [])].slice(0, 8)
      };
      const worldThreads = [contactThread, ...get().worldThreads.filter((thread) => thread.id !== contactThread.id)];
      set({
        civilizationContacts: [nextContact, ...get().civilizationContacts.filter((entry) => entry.civilizationId !== civilizationId)],
        factions,
        news: nextNews,
        worldThreads,
        logs: [makeLog(gameYear, headline, success ? `Уровень понимания языка: ${nextContact.languageLevel}/5.` : 'Повторная попытка потребует другого подхода.', success ? 'good' : 'warning'), ...get().logs]
      });
      await persist(set, get, 'first-contact');
      return { ok: success, message: success ? `Стадия контакта: ${nextStage}` : 'Контакт сорван; данные сохранены' };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
  async interactWithNpc(npcId, kind) {
    return runExclusive('npc-interaction', set, get, async () => {
      const npc = get().localNpcs.find((entry) => entry.id === npcId);
      const hub = get().hubs.find((entry) => entry.id === npc?.hubId);
      const captain = get().captain;
      if (!npc || !hub || !captain || get().currentHubId !== hub.id || !npc.alive || !npc.present) return;
      const impact = kind === 'help' ? 9 : kind === 'deal' ? 4 : -16;
      const cost = kind === 'help' ? 80 : 0;
      if (captain.credits < cost) return;
      const nextTrust = Math.max(-100, Math.min(100, npc.trust + impact));
      const memory = { id: `npc_memory_${npc.id}_${get().gameYear}_${npc.memories.length}`, year: get().gameYear, kind, text: kind === 'help' ? 'Капитан помог решить локальную проблему.' : kind === 'deal' ? 'Состоялась взаимовыгодная сделка.' : 'Капитан угрожал и требовал уступок.', impact } as const;
      let factions = adjustFactionStanding(get().factions, hub.factionId, get().gameYear, `npc-${kind}`, Math.sign(impact) * (kind === 'threat' ? 4 : 1), `${npc.name}: ${memory.text}`);
      const nextNpcs = get().localNpcs.map((entry) => entry.id === npcId ? {
        ...entry,
        trust: nextTrust,
        disposition: nextTrust <= -35 ? 'hostile' as const : nextTrust < -5 ? 'wary' as const : nextTrust >= 25 ? 'friendly' as const : 'neutral' as const,
        memories: [memory, ...entry.memories].slice(0, 20)
      } : entry);
      set({ localNpcs: nextNpcs, factions, captain: { ...captain, credits: captain.credits - cost }, logs: [makeLog(get().gameYear, `Контакт: ${npc.name}`, memory.text, impact > 0 ? 'good' : 'warning'), ...get().logs] });
      await persist(set, get, 'npc-interaction');
    }, undefined);
  },
  async resolveHypothesis(hypothesisId, disposition) {
    return runExclusive('hypothesis-resolution', set, get, async () => {
      const hypothesis = get().hypotheses.find((entry) => entry.id === hypothesisId);
      const captain = get().captain;
      if (!hypothesis || !captain || hypothesis.disposition) return;
      const point = get().pointsOfInterest.find((entry) => entry.id === hypothesis.pointOfInterestId);
      const civilizationId = point?.civilizationId;
      const beneficiary = disposition === 'sold'
        ? get().factions.find((faction) => faction.kind === 'university' || faction.kind === 'corporation')
        : get().factions.find((faction) => faction.civilizationId === civilizationId && faction.kind === 'government');
      const payment = disposition === 'sold' ? Math.max(220, Math.round(hypothesis.confidence * 14)) : disposition === 'published' ? Math.round(hypothesis.confidence * 3) : 0;
      let factions = get().factions;
      if (beneficiary) factions = adjustFactionStanding(factions, beneficiary.id, get().gameYear, `hypothesis-${disposition}`, disposition === 'suppressed' ? 2 : 6, `Получена версия «${hypothesis.title}».`);
      const updated = { ...hypothesis, disposition, beneficiaryFactionId: beneficiary?.id, resolvedYear: get().gameYear };
      const nextNews = disposition === 'published' ? [{ id: `news_hypothesis_${hypothesisId}`, year: get().gameYear, headline: `Опубликована гипотеза: ${hypothesis.title}`, text: hypothesis.summary, category: 'discovery' as const, reliability: hypothesis.confidence, systemIds: point ? [point.systemId] : [] }, ...get().news].slice(0, 500) : get().news;
      const threadId = `thread_hypothesis_${hypothesis.id}`;
      const worldThreads = [{ id: threadId, category: 'discovery' as const, status: 'resolved' as const, title: hypothesis.title, summary: hypothesis.summary, urgency: hypothesis.confidence, progress: 100, systemIds: point ? [point.systemId] : [], civilizationIds: civilizationId ? [civilizationId] : [], factionIds: beneficiary ? [beneficiary.id] : [], relatedArtifactIds: [], playerInvolved: true, nextAction: disposition === 'published' ? 'Следить за политической и научной реакцией.' : disposition === 'sold' ? 'Наблюдать за действиями покупателя.' : 'Сохранить доказательства в безопасности.', updates: [{ id: `thread_hypothesis_update_${hypothesis.id}`, year: get().gameYear, text: disposition === 'published' ? 'Версия опубликована и стала частью публичной истории.' : disposition === 'sold' ? 'Контроль над материалами перешёл к покупателю.' : 'Материалы исключены из открытого архива.', tone: disposition === 'published' ? 'good' as const : 'info' as const }] }, ...get().worldThreads.filter((thread) => thread.id !== threadId)];
      set({
        hypotheses: [updated, ...get().hypotheses.filter((entry) => entry.id !== hypothesisId)],
        factions,
        captain: { ...captain, credits: captain.credits + payment, reputation: captain.reputation + (disposition === 'published' ? 3 : 0) },
        news: nextNews,
        worldThreads,
        logs: [makeLog(get().gameYear, 'Решение по гипотезе', disposition === 'sold' ? `Материалы проданы за ${payment} кредитов.` : disposition === 'published' ? 'Материалы опубликованы в открытой сети.' : 'Материалы скрыты в личном архиве.', disposition === 'published' ? 'good' : 'info'), ...get().logs]
      });
      await persist(set, get, 'hypothesis-resolution');
    }, undefined);
  },
  async sellArtifactToHub(itemId, hubId, channel) {
    return runExclusive('artifact-transfer', set, get, async () => {
      const { ship, captain, currentHubId, gameYear } = get();
      const hub = get().hubs.find((entry) => entry.id === hubId);
      const item = ship?.cargo.find((entry) => entry.id === itemId && entry.artifactId);
      const artifact = get().galaxy?.artifacts.find((entry) => entry.id === item?.artifactId);
      const faction = get().factions.find((entry) => entry.id === hub?.factionId);
      if (!ship || !captain || !hub || !item || !artifact || currentHubId !== hubId) return;
      if (channel === 'heirs' && hub.civilizationId !== artifact.civilizationId) return;
      if (channel === 'museum' && !['university', 'religious', 'government'].includes(faction?.kind ?? '')) return;
      if (channel === 'blackMarket' && !hub.services.includes('blackMarket')) return;
      const sameCivilization = hub.civilizationId === artifact.civilizationId;
      const price = Math.max(1, Math.round(item.value * culturalArtifactMultiplier(channel, sameCivilization)));
      let factions = get().factions;
      if (faction) factions = adjustFactionStanding(factions, faction.id, gameYear, `artifact-${channel}`, channel === 'heirs' ? 12 : channel === 'museum' ? 6 : channel === 'blackMarket' ? -3 : 1, `${artifact.name} передан через канал «${channel}».`);
      set({
        ship: { ...ship, cargo: ship.cargo.filter((entry) => entry.id !== itemId) },
        captain: { ...captain, credits: captain.credits + price, reputation: captain.reputation + (channel === 'heirs' ? 3 : 0) },
        factions,
        logs: [makeLog(gameYear, 'Артефакт передан', `${artifact.name}: ${price} кредитов. Канал: ${channel}.`, channel === 'blackMarket' ? 'warning' : 'good'), ...get().logs]
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
    if (!galaxy || !captain || !ship || !currentSystemId) return null;
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      saveMeta: saveMeta ?? emptySaveMeta(),
      galaxy,
      captain,
      ship,
      currentSystemId,
      gameYear: simulation.time.year,
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
