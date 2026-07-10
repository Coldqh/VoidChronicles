import { create } from 'zustand';
import type {
  Artifact,
  Captain,
  Discovery,
  Galaxy,
  GameLogEntry,
  GameStateSnapshot,
  Ship,
  StarSystem
} from './types';
import { deleteSnapshot, loadSnapshot, saveSnapshot } from '../persistence/db';
import { parseSnapshot, snapshotErrorMessage } from '../persistence/snapshot';
import { createRng } from '../generation/rng';

export type MainScreen = 'menu' | 'galaxy' | 'archive' | 'ship';
export type HydrationStatus = 'idle' | 'loading' | 'ready' | 'error';

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
  generationActive: boolean;
  hydrationStatus: HydrationStatus;
  saveAvailable: boolean;
  saveError: string | null;
  setScreen(screen: MainScreen): void;
  setGenerationActive(active: boolean): void;
  hydrateFromStorage(): Promise<void>;
  dismissSaveError(): void;
  startGame(galaxy: Galaxy): Promise<void>;
  resumeGame(): Promise<boolean>;
  clearGame(): Promise<void>;
  selectSystem(id: string | null): void;
  travelTo(systemId: string): Promise<{ ok: boolean; message: string; encounter?: 'shipCombat' }>;
  scanSystem(systemId: string): Promise<void>;
  completeExpedition(systemId: string, planetId: string, artifact?: Artifact, injury?: { bodyPart: 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'; severity: number }): Promise<void>;
  damageShip(amount: number, status?: string): Promise<void>;
  repairShip(): Promise<void>;
  refuelShip(): Promise<void>;
  earnCredits(amount: number, reason: string): Promise<void>;
  sellCargo(itemId: string): Promise<void>;
  restoreSnapshot(snapshot: GameStateSnapshot): Promise<void>;
  getSnapshot(): GameStateSnapshot | null;
}

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
    { id: 'scanner_basic', name: 'Спектральный сканер I', slot: 'scanner', rarity: 1, effect: 'Базовый анализ системы' },
    { id: 'cargo_basic', name: 'Грузовой модуль', slot: 'cargo', rarity: 1, effect: '10 единиц груза' },
    { id: 'weapon_basic', name: 'Лёгкая рельса', slot: 'weapon', rarity: 1, effect: 'Корабельная атака 14–24' }
  ],
  statuses: []
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

async function persist(get: () => GameStore): Promise<void> {
  const snapshot = get().getSnapshot();
  if (!snapshot) return;
  try {
    await saveSnapshot(snapshot);
  } catch (error) {
    console.error('Ironman autosave failed', error);
    useGameStore.setState({ saveError: `Автосохранение не выполнено: ${snapshotErrorMessage(error)}` });
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
  generationActive: false,
  hydrationStatus: 'idle',
  saveAvailable: false,
  saveError: null,
  setScreen: (screen) => set({ screen }),
  setGenerationActive: (generationActive) => set({ generationActive }),
  async hydrateFromStorage() {
    const status = get().hydrationStatus;
    if (status === 'ready') return;
    if (hydrationTask) return hydrationTask;

    set({ hydrationStatus: 'loading', saveError: null });
    hydrationTask = (async () => {
      try {
        const snapshot = await loadSnapshot();
        if (!snapshot) {
          set({ hydrationStatus: 'ready', saveAvailable: false, saveError: null });
          return;
        }
        const safe = parseSnapshot(snapshot);
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
          hydrationStatus: 'ready',
          saveAvailable: true,
          saveError: null
        });
      } catch (error) {
        set({
          hydrationStatus: 'error',
          saveAvailable: false,
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
  dismissSaveError() { set({ saveError: null, hydrationStatus: 'ready' }); },
  async startGame(galaxy) {
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
      logs: [makeLog(0, 'Новая экспедиция', `Корабль «Странник-01» начинает путь из системы ${start.name}.`, 'good')],
      hydrationStatus: 'ready',
      saveAvailable: true,
      saveError: null
    });
    await persist(get);
  },
  async resumeGame() {
    if (!get().galaxy) await get().hydrateFromStorage();
    if (!get().galaxy || !get().captain || !get().ship || !get().currentSystemId) return false;
    set({ screen: 'galaxy', saveAvailable: true, saveError: null });
    return true;
  },
  async clearGame() {
    try {
      await deleteSnapshot();
    } catch (error) {
      console.error('Failed to delete ironman save', error);
    } finally {
      set({
        screen: 'menu', galaxy: null, captain: null, ship: null, currentSystemId: null,
        selectedSystemId: null, gameYear: 0, discoveries: [], logs: [],
        hydrationStatus: 'ready', saveAvailable: false, saveError: null
      });
    }
  },
  selectSystem(selectedSystemId) { set({ selectedSystemId }); },
  async travelTo(systemId) {
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
    await persist(get);
    return { ok: true, message: 'Перелёт завершён', encounter };
  },
  async scanSystem(systemId) {
    const { galaxy, gameYear } = get();
    if (!galaxy) return;
    const updatedGalaxy = structuredClone(galaxy);
    const system = updatedGalaxy.systems.find((entry) => entry.id === systemId);
    if (!system) return;
    system.scanned = true;
    system.known = true;
    system.planets.forEach((planet) => { planet.scanned = true; });
    const discoveries: Discovery[] = system.planets
      .filter((planet) => planet.hasLife || planet.civilizationId || planet.type === 'anomalous' || planet.pointsOfInterest > 5)
      .map((planet, index) => ({
        id: `disc_${system.id}_${planet.id}_${get().discoveries.length + index}`,
        kind: planet.civilizationId ? 'settlement' : planet.type === 'anomalous' ? 'anomaly' : planet.hasLife ? 'biosphere' : 'signal',
        name: `${planet.name}: ${planet.civilizationId ? 'технологическая активность' : planet.hasLife ? 'биосигнатура' : 'аномальный сигнал'}`,
        systemId: system.id,
        planetId: planet.id,
        description: `Сканирование указывает на ${planet.pointsOfInterest} потенциальных точек интереса. Данные требуют полевой проверки.`,
        confidence: 35 + Math.min(55, planet.habitability),
        year: gameYear,
        tags: [planet.type, planet.danger]
      }));
    const unique = discoveries.filter((entry) => !get().discoveries.some((existing) => existing.planetId === entry.planetId));
    set({
      galaxy: updatedGalaxy,
      discoveries: [...unique, ...get().discoveries],
      logs: [makeLog(gameYear, `Система ${system.name} просканирована`, `Обнаружено ${unique.length} новых значимых сигналов.`, 'good'), ...get().logs]
    });
    await persist(get);
  },
  async completeExpedition(systemId, planetId, artifact, injury) {
    const { galaxy, captain, ship, gameYear } = get();
    if (!galaxy || !captain || !ship) return;
    const system = galaxy.systems.find((entry) => entry.id === systemId);
    const planet = system?.planets.find((entry) => entry.id === planetId);
    const newDiscoveries = [...get().discoveries];
    let updatedShip = ship;
    let updatedCaptain = captain;
    const logs = [...get().logs];
    if (artifact) {
      const updatedGalaxy = structuredClone(galaxy);
      const storedArtifact = updatedGalaxy.artifacts.find((entry) => entry.id === artifact.id);
      if (storedArtifact) storedArtifact.discovered = true;
      updatedShip = {
        ...ship,
        cargo: [...ship.cargo, { id: `cargo_${artifact.id}`, name: artifact.name, kind: artifact.kind, quantity: 1, value: artifact.value, artifactId: artifact.id }]
      };
      newDiscoveries.unshift({
        id: `disc_artifact_${artifact.id}`,
        kind: 'artifact',
        name: artifact.name,
        systemId,
        planetId,
        description: artifact.publicDescription,
        confidence: 54,
        year: gameYear,
        tags: [artifact.kind, 'unverified'],
        artifactId: artifact.id
      });
      logs.unshift(makeLog(gameYear, 'Артефакт извлечён', `${artifact.name} доставлен на корабль.`, 'good'));
      set({ galaxy: updatedGalaxy });
    }
    if (injury) {
      const severity = Math.max(1, Math.min(10, injury.severity));
      updatedCaptain = {
        ...captain,
        health: Math.max(1, captain.health - severity * 5),
        injuries: [...captain.injuries, {
          id: `inj_${Date.now()}`,
          bodyPart: injury.bodyPart,
          type: severity > 7 ? 'fracture' : severity > 4 ? 'bleeding' : 'bruise',
          severity,
          permanent: severity >= 9
        }]
      };
      logs.unshift(makeLog(gameYear, 'Экспедиционная травма', `Капитан ранен. Тяжесть: ${severity}/10.`, 'danger'));
    }
    newDiscoveries.unshift({
      id: `disc_expedition_${planetId}_${Date.now()}`,
      kind: 'ruin',
      name: `Полевая экспедиция: ${planet?.name ?? 'неизвестный мир'}`,
      systemId,
      planetId,
      description: 'Локальный район обследован. Маршрут и опасности занесены в архив.',
      confidence: 90,
      year: gameYear,
      tags: ['expedition', planet?.type ?? 'unknown']
    });
    set({ ship: updatedShip, captain: updatedCaptain, discoveries: newDiscoveries, logs });
    await persist(get);
  },
  async damageShip(amount, status) {
    const ship = get().ship;
    if (!ship) return;
    const hull = Math.max(0, ship.hull - amount);
    const nextStatus = hull <= 0 ? 'корабль выведен из строя' : status;
    const statuses = nextStatus && !ship.statuses.includes(nextStatus) ? [...ship.statuses, nextStatus] : ship.statuses;
    const title = hull <= 0 ? 'Корабль выведен из строя' : 'Повреждение корабля';
    set({ ship: { ...ship, hull, statuses }, logs: [makeLog(get().gameYear, title, `Корпус потерял ${amount} прочности.${nextStatus ? ` Состояние: ${nextStatus}.` : ''}`, 'danger'), ...get().logs] });
    await persist(get);
  },
  async repairShip() {
    const { ship, captain } = get();
    if (!ship || !captain) return;
    const missing = ship.maxHull - ship.hull;
    const cost = Math.ceil(missing * 4);
    if (missing <= 0 || captain.credits < cost) return;
    set({ ship: { ...ship, hull: ship.maxHull, statuses: [] }, captain: { ...captain, credits: captain.credits - cost }, logs: [makeLog(get().gameYear, 'Ремонт завершён', `Потрачено ${cost} кредитов.`, 'good'), ...get().logs] });
    await persist(get);
  },
  async refuelShip() {
    const { ship, captain } = get();
    if (!ship || !captain) return;
    const missing = ship.maxFuel - ship.fuel;
    const cost = Math.ceil(missing * 3);
    if (missing <= 0 || captain.credits < cost) return;
    set({ ship: { ...ship, fuel: ship.maxFuel }, captain: { ...captain, credits: captain.credits - cost }, logs: [makeLog(get().gameYear, 'Заправка завершена', `Потрачено ${cost} кредитов.`, 'good'), ...get().logs] });
    await persist(get);
  },
  async earnCredits(amount, reason) {
    const captain = get().captain;
    if (!captain) return;
    set({ captain: { ...captain, credits: captain.credits + amount }, logs: [makeLog(get().gameYear, reason, `Получено ${amount} кредитов.`, 'good'), ...get().logs] });
    await persist(get);
  },
  async sellCargo(itemId) {
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
    await persist(get);
  },
  async restoreSnapshot(snapshot) {
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
      hydrationStatus: 'ready',
      saveAvailable: true,
      saveError: null
    });
    await persist(get);
  },
  getSnapshot() {
    const { galaxy, captain, ship, currentSystemId, gameYear, discoveries, logs } = get();
    if (!galaxy || !captain || !ship || !currentSystemId) return null;
    return { schemaVersion: 1, galaxy, captain, ship, currentSystemId, gameYear, discoveries, logs };
  }
}));
