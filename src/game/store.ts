import { create } from 'zustand';
import type {
  Artifact,
  ArtifactKnowledge,
  Captain,
  CrewCandidate,
  CrewMember,
  Contract,
  Discovery,
  Faction,
  Evidence,
  ExpeditionResult,
  Galaxy,
  GameLogEntry,
  GameStateSnapshot,
  Hub,
  Hypothesis,
  LocationState,
  MarketGood,
  NewsItem,
  PointOfInterest,
  SaveMetadata,
  ScanReport,
  Ship,
  StarSystem
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

export type MainScreen = 'menu' | 'command' | 'galaxy' | 'system' | 'hub' | 'contracts' | 'factions' | 'crew' | 'archive' | 'ship' | 'settings';
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
  hydrateFromStorage(): Promise<void>;
  dismissSaveError(): void;
  dismissRecoveryNotice(): void;
  startGame(galaxy: Galaxy): Promise<void>;
  resumeGame(): Promise<boolean>;
  clearGame(): Promise<void>;
  createBackup(): Promise<boolean>;
  selectSystem(id: string | null): void;
  travelTo(systemId: string): Promise<{ ok: boolean; message: string; encounter?: 'shipCombat' }>;
  scanSystem(systemId: string): Promise<void>;
  detailedScanPlanet(planetId: string): Promise<{ ok: boolean; message: string }>;
  completeExpedition(result: ExpeditionResult): Promise<void>;
  analyzeArtifact(artifactId: string): Promise<void>;
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
  alive: true
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
  statuses: []
});

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
    if (!get().busyAction) set({ screen });
  },
  setGenerationActive: (generationActive) => set({ generationActive }),
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
          screen: 'menu',
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
      const living = initializeLivingGalaxy(galaxy);
      const start = galaxy.systems.find((system) => system.id === galaxy.startSystemId);
      if (!start) throw new Error('Стартовая система не найдена');
      set({
        screen: 'command',
        galaxy,
        captain: initialCaptain(),
        ship: initialShip(),
        currentSystemId: start.id,
        selectedSystemId: start.id,
        gameYear: 0,
        discoveries: [],
        scanReports: [],
        pointsOfInterest: [],
        evidence: [],
        hypotheses: [],
        artifactKnowledge: [],
        crew: [],
        crewCandidates: [],
        factions: living.factions,
        hubs: living.hubs,
        contracts: living.contracts,
        news: living.news,
        locationStates: [],
        currentHubId: null,
        logs: [makeLog(0, 'Новая экспедиция', `Корабль «Странник-01» начинает путь из системы ${start.name}.`, 'good')],
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
      set({ screen: 'command', saveAvailable: true, saveError: null });
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
          selectedSystemId: null, gameYear: 0, discoveries: [], logs: [], scanReports: [],
          pointsOfInterest: [], evidence: [], hypotheses: [], artifactKnowledge: [], crew: [], crewCandidates: [], factions: [], hubs: [], contracts: [], news: [], locationStates: [], currentHubId: null,
          hydrationStatus: 'ready', saveAvailable: false, saveError: null,
          saveStatus: 'idle', saveMeta: null, backupCount: 0, recoveryNotice: null
        });
      }
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
      const current = galaxy.systems.find((system) => system.id === currentSystemId);
      const target = galaxy.systems.find((system) => system.id === systemId);
      if (!current || !target) return { ok: false, message: 'Система не найдена' };
      if (!current.neighbors.includes(target.id)) return { ok: false, message: 'Нет прямого маршрута' };
      const jumpDistance = distance(current, target);
      if (jumpDistance > ship.jumpRange) return { ok: false, message: 'Маршрут за пределами дальности двигателя' };
      const fuelCost = Math.max(7, Math.ceil(jumpDistance / 14));
      if (ship.fuel < fuelCost) return { ok: false, message: `Нужно ${fuelCost} топлива` };
      if (ship.hull <= 0) return { ok: false, message: 'Корабль не способен к прыжку' };
      const rng = createRng(`${galaxy.seed}:travel:${current.id}:${target.id}:${gameYear}:${get().logs.length}`);
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
      const updatedShip = { ...ship, fuel: ship.fuel - fuelCost };
      const nextYear = gameYear + Math.max(1, Math.round(jumpDistance / 50));
      const logs = [makeLog(nextYear, 'Прыжок завершён', `${current.name} → ${target.name}. Потрачено ${fuelCost} топлива.`, 'info'), ...get().logs];
      let encounter: 'shipCombat' | undefined;
      const targetFaction = get().factions.find((entry) => entry.id === target.factionId);
      const hasCivilianHub = get().hubs.some((hub) => hub.systemId === target.id && hub.safety !== 'danger');
      const baseCombatChance = target.danger === 'extreme' ? 0.5 : target.danger === 'danger' ? 0.28 : target.danger === 'caution' ? 0.12 : 0.03;
      const combatChance = targetFaction?.disposition === 'hostile' ? Math.min(0.8, baseCombatChance * 1.35)
        : targetFaction?.disposition === 'friendly' || hasCivilianHub ? 0
          : targetFaction?.disposition === 'wary' ? baseCombatChance * 0.65
            : baseCombatChance * 0.38;
      if (rng.chance(combatChance)) {
        encounter = 'shipCombat';
        logs.unshift(makeLog(nextYear, 'Враждебный перехват', 'Контакт открыл огонь после проваленного запроса связи.', 'danger'));
      } else if (targetFaction?.disposition === 'friendly' || hasCivilianHub) {
        logs.unshift(makeLog(nextYear, 'Гражданский контроль', 'Диспетчер передал коридор движения и список открытых портов.', 'good'));
      } else if (rng.chance(0.18)) {
        logs.unshift(makeLog(nextYear, 'Слабый сигнал', 'Во время перелёта зафиксирован короткий сигнал неизвестного происхождения.', 'warning'));
      }
      const contracts = get().contracts.map((contract) => contract.status === 'active' && nextYear > contract.deadlineYear ? { ...contract, status: 'expired' as const } : contract);
      const newsItem = generateNews(updatedGalaxy.seed, updatedGalaxy.systems, get().hubs, nextYear, get().news.length);
      set({ galaxy: updatedGalaxy, ship: updatedShip, currentSystemId: target.id, selectedSystemId: target.id, currentHubId: null, gameYear: nextYear, logs, contracts, news: [newsItem, ...get().news].slice(0, 500) });
      await persist(set, get, 'travel');
      return { ok: true, message: 'Перелёт завершён', encounter };
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
      system.planets.forEach((planet) => {
        planet.scanned = true;
        planet.scanLevel = Math.max(planet.scanLevel ?? 0, 1) as 1;
        planet.lastScanYear = gameYear;
      });
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
      set({
        galaxy: updatedGalaxy,
        scanReports: [report, ...get().scanReports.filter((entry) => entry.id !== report.id)],
        logs: [makeLog(gameYear, `Система ${system.name} просканирована`, 'Получены орбиты и первичные характеристики планет.', 'good'), ...get().logs]
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
      set({
        galaxy: updatedGalaxy,
        pointsOfInterest: allPoints,
        scanReports: [report, ...get().scanReports],
        discoveries: [...unique, ...get().discoveries],
        contracts,
        factions,
        captain,
        logs: [makeLog(gameYear, `Детальный скан: ${planet.name}`, `Обнаружено ${generated.length} точек интереса.${reward ? ` Контракт закрыт: +${reward} кредитов.` : ''}`, 'good'), ...get().logs]
      });
      await persist(set, get, 'detail-scan');
      return { ok: true, message: `Обнаружено сигналов: ${generated.length}` };
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
          health: Math.max(1, updatedCaptain.health - severity * 5),
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
        logs
      });
      await persist(set, get, 'expedition');
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
  async damageShip(amount, status) {
    const ship = get().ship;
    if (!ship || amount <= 0) return;
    const hull = Math.max(0, ship.hull - amount);
    const nextStatus = hull <= 0 ? 'корабль выведен из строя' : status;
    const statuses = nextStatus && !ship.statuses.includes(nextStatus) ? [...ship.statuses, nextStatus] : ship.statuses;
    const title = hull <= 0 ? 'Корабль выведен из строя' : 'Повреждение корабля';
    set({ ship: { ...ship, hull, statuses }, logs: [makeLog(get().gameYear, title, `Корпус потерял ${amount} прочности.${nextStatus ? ` Состояние: ${nextStatus}.` : ''}`, 'danger'), ...get().logs] });
    await persist(set, get, 'ship-damage');
  },
  async repairShip() {
    return runExclusive('repair', set, get, async () => {
      const { ship, captain } = get();
      if (!ship || !captain) return;
      const missing = ship.maxHull - ship.hull;
      const cost = Math.ceil(missing * 4);
      if (missing <= 0 || captain.credits < cost) return;
      set({ ship: { ...ship, hull: ship.maxHull, statuses: [] }, captain: { ...captain, credits: captain.credits - cost }, logs: [makeLog(get().gameYear, 'Ремонт завершён', `Потрачено ${cost} кредитов.`, 'good'), ...get().logs] });
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

      set({
        hubs: hubs.map((entry) => ({ ...entry, docked: entry.id === hub.id, visited: entry.id === hub.id ? true : entry.visited })),
        currentHubId: hub.id,
        screen: 'hub',
        ship: updatedShip,
        captain: updatedCaptain,
        factions: updatedFactions,
        contracts: updatedContracts,
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
  async restoreSnapshot(snapshot) {
    return runExclusive('import-save', set, get, async () => {
      const safe = parseSnapshot(snapshot);
      set({
        screen: 'command',
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
      galaxy, captain, ship, currentSystemId, gameYear, discoveries, logs, saveMeta,
      scanReports, pointsOfInterest, evidence, hypotheses, artifactKnowledge, crew, crewCandidates, factions, hubs, contracts, news, locationStates, currentHubId
    } = get();
    if (!galaxy || !captain || !ship || !currentSystemId) return null;
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      saveMeta: saveMeta ?? emptySaveMeta(),
      galaxy,
      captain,
      ship,
      currentSystemId,
      gameYear,
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
      currentHubId
    };
  }
}));
