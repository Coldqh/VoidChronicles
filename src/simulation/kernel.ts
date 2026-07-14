import type {
  Contract,
  Faction,
  Galaxy,
  Hub,
  NewsItem,
  ScheduledSimulationEvent,
  SimulationEvent,
  SimulationState,
  WarFront
} from '../game/types';
import { createRng } from '../generation/rng';
import { advanceWarFronts } from '../world/warfare';
import { addHours, createWorldTime, HOURS_PER_YEAR } from './clock';
import { projectEventToContract, projectEventToNews } from './projections';

export interface SimulationContext {
  galaxy: Galaxy;
  factions: Faction[];
  hubs: Hub[];
  warFronts: WarFront[];
  contracts: Contract[];
  news: NewsItem[];
  simulation: SimulationState;
}

export interface SimulationResult extends Omit<SimulationContext, 'galaxy'> {
  generatedEvents: SimulationEvent[];
}

export function initializeSimulation(seed: string): SimulationState {
  return {
    seed,
    time: createWorldTime(0),
    queue: [],
    events: [],
    revision: 1,
    lastProcessedHour: 0
  };
}

function eventId(seed: string, hour: number, serial: number): string {
  return `world_${hour.toString(36)}_${serial.toString(36)}_${seed.slice(0, 6)}`;
}

function scheduleAmbientEvents(context: SimulationContext, targetHour: number): ScheduledSimulationEvent[] {
  const queue = [...context.simulation.queue];
  const startBucket = Math.floor(context.simulation.lastProcessedHour / 720);
  const endBucket = Math.floor(targetHour / 720);
  for (let bucket = startBucket + 1; bucket <= endBucket; bucket += 1) {
    const rng = createRng(`${context.simulation.seed}:ambient:${bucket}`);
    const systems = context.galaxy.systems;
    if (!systems.length) break;
    const system = rng.pick(systems);
    const kind = rng.pick<SimulationEvent['kind']>(['trade', 'shortage', 'migration', 'conflict', 'discovery', 'politics']);
    queue.push({
      id: `scheduled_${bucket}_${kind}_${system.id}`,
      dueHour: bucket * 720 + rng.int(0, 719),
      kind,
      systemId: system.id,
      payload: { severity: rng.int(12, 86) }
    });
  }
  return queue.sort((a, b) => a.dueHour - b.dueHour);
}

function resolveScheduled(item: ScheduledSimulationEvent, year: number, serial: number, seed: string): SimulationEvent {
  const severity = Number(item.payload.severity ?? 30);
  const copy: Record<SimulationEvent['kind'], [string, string]> = {
    trade: ['Торговые маршруты перестроены', 'Перевозчики изменили направления после колебаний спроса и риска.'],
    shortage: ['В системе возник дефицит', 'Местные запасы не покрывают потребление. Цены и запросы на доставку растут.'],
    migration: ['Началась новая волна переселения', 'Гражданские суда покидают нестабильные районы и ищут безопасные порты.'],
    conflict: ['Вооружённое столкновение на маршруте', 'Стороны усиливают патрули, движение гражданских судов нарушено.'],
    discovery: ['Независимая экспедиция сообщила об открытии', 'Новые данные меняют интерес исследователей к системе.'],
    politics: ['Местные власти изменили режим доступа', 'Новые правила влияют на торговлю, досмотры и гражданские перелёты.'],
    population: ['Население изменилось', 'Демографические процессы изменили нагрузку на местную инфраструктуру.'],
    research: ['Исследовательская программа дала результат', 'Новая технология начинает влиять на местные силы.'],
    disaster: ['Произошла крупная авария', 'Инфраструктура повреждена, последствия распространяются на соседние маршруты.']
  };
  const [title, summary] = copy[item.kind];
  return {
    id: eventId(seed, item.dueHour, serial),
    kind: item.kind,
    hour: item.dueHour,
    year,
    title,
    summary,
    severity,
    reliability: 58 + Math.min(38, Math.round(severity / 3)),
    systemId: item.systemId,
    factionIds: [],
    visibleToPublic: item.kind !== 'research' || severity > 45,
    causes: [],
    effects: []
  };
}

function applyEvent(event: SimulationEvent, factions: Faction[], hubs: Hub[]): { factions: Faction[]; hubs: Hub[] } {
  let nextFactions = factions;
  let nextHubs = hubs;
  if (event.kind === 'trade' || event.kind === 'shortage') {
    nextHubs = hubs.map((hub) => hub.systemId === event.systemId ? {
      ...hub,
      population: Math.max(100, Math.round(hub.population * (event.kind === 'shortage' ? 0.996 : 1.002)))
    } : hub);
  }
  if (event.kind === 'migration') {
    nextHubs = nextHubs.map((hub) => hub.systemId === event.systemId ? { ...hub, population: Math.max(100, Math.round(hub.population * 0.985)) } : hub);
  }
  if (event.kind === 'conflict' || event.kind === 'politics') {
    nextFactions = factions.map((faction) => event.factionIds.includes(faction.id) ? {
      ...faction,
      wealth: Math.max(0, Math.min(100, faction.wealth + (event.kind === 'conflict' ? -2 : 1))),
      military: Math.max(0, Math.min(100, faction.military + (event.kind === 'conflict' ? 1 : 0)))
    } : faction);
  }
  return { factions: nextFactions, hubs: nextHubs };
}

export function advanceSimulation(context: SimulationContext, durationHours: number): SimulationResult {
  const targetTime = addHours(context.simulation.time, durationHours);
  const queue = scheduleAmbientEvents(context, targetTime.absoluteHour);
  const due = queue.filter((item) => item.dueHour <= targetTime.absoluteHour);
  const future = queue.filter((item) => item.dueHour > targetTime.absoluteHour);
  let factions = context.factions;
  let hubs = context.hubs;
  let news = context.news;
  let contracts = context.contracts;
  const generatedEvents: SimulationEvent[] = [];

  due.forEach((scheduled, index) => {
    const event = resolveScheduled(scheduled, Math.floor(scheduled.dueHour / HOURS_PER_YEAR), context.simulation.events.length + index, context.simulation.seed);
    generatedEvents.push(event);
    const applied = applyEvent(event, factions, hubs);
    factions = applied.factions;
    hubs = applied.hubs;
    const item = projectEventToNews(event, hubs);
    if (item) news = [item, ...news.filter((entry) => entry.id !== item.id)].slice(0, 500);
    const contract = projectEventToContract(event, hubs, contracts.length + index);
    if (contract) contracts = [contract, ...contracts].slice(0, 160);
  });

  const warFronts = advanceWarFronts(context.simulation.seed, context.warFronts, targetTime.year);
  const simulation: SimulationState = {
    ...context.simulation,
    time: targetTime,
    queue: future,
    events: [...generatedEvents, ...context.simulation.events].slice(0, 1200),
    revision: context.simulation.revision + generatedEvents.length,
    lastProcessedHour: targetTime.absoluteHour
  };
  return { simulation, factions, hubs, warFronts, contracts, news, generatedEvents };
}
