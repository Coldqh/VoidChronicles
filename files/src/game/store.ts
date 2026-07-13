import { create } from 'zustand';
import type {
  Artifact,
  ArtifactKnowledge,
  Captain,
  Discovery,
  Evidence,
  ExpeditionResult,
  Galaxy,
  GameLogEntry,
  GameStateSnapshot,
  Hypothesis,
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

export type MainScreen = 'menu' | 'galaxy' | 'archive' | 'ship' | 'settings';
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
      const start = galaxy.systems.find((system) => system.id === galaxy.startSystemId);
      if (!start) throw new Error('Стартовая система не найдена');
      set({
        screen: 'galaxy',
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
      set({ screen: 'galaxy', saveAvailable: true, saveError: null });
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
          pointsOfInterest: [], evidence: [], hypotheses: [], artifactKnowledge: [],
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
      const combatChance = target.danger === 'extreme' ? 0.5 : target.danger === 'danger' ? 0.28 : target.danger === 'caution' ? 0.12 : 0.03;
      if (rng.chance(combatChance)) {
        encounter = 'shipCombat';
        logs.unshift(makeLog(nextYear, 'Неопознанный корабль', 'Контакт блокирует безопасный выход из прыжка.', 'danger'));
      } else if (rng.chance(0.18)) {
        logs.unshift(makeLog(nextYear, 'Слабый сигнал', 'Во время перелёта зафиксирован короткий сигнал неизвестного происхождения.', 'warning'));
      }
      set({ galaxy: updatedGalaxy, ship: updatedShip, currentSystemId: target.id, selectedSystemId: target.id, gameYear: nextYear, logs });
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
      set({
        galaxy: updatedGalaxy,
        pointsOfInterest: allPoints,
        scanReports: [report, ...get().scanReports],
        discoveries: [...unique, ...get().discoveries],
        logs: [makeLog(gameYear, `Детальный скан: ${planet.name}`, `Обнаружено ${generated.length} точек интереса.`, 'good'), ...get().logs]
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

      let knowledge = get().artifactKnowledge;
      if (result.artifact) {
        const existingKnowledge = knowledge.find((entry) => entry.artifactId === result.artifact?.id);
        if (!existingKnowledge) {
          knowledge = [{ artifactId: result.artifact.id, level: 1, knownFields: ['kind', 'age'], notes: ['Объект извлечён, свойства не подтверждены.'] }, ...knowledge];
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
  async restoreSnapshot(snapshot) {
    return runExclusive('import-save', set, get, async () => {
      const safe = parseSnapshot(snapshot);
      set({
        screen: 'galaxy',
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
      scanReports, pointsOfInterest, evidence, hypotheses, artifactKnowledge
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
      artifactKnowledge
    };
  }
}));
