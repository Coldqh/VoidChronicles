import type { Civilization, Faction, Galaxy, Hub } from '../game/types';
import { createRng } from '../generation/rng';
import { initializeEcosystems } from '../ecology/generate';
import { simulateEcologyCycle } from '../ecology/simulate';
import { HOURS_PER_DAY, worldYear } from './clock';
import type {
  ScheduledWorldEvent,
  SimulationAdvanceResult,
  SimulationCivilizationState,
  SimulationFactionState,
  SimulationState,
  SimulationSystemState,
  WorldEvent
} from './types';

interface SimulationContext {
  seed: string;
  galaxy: Galaxy;
  factions: Faction[];
  hubs: Hub[];
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const cycleId = (kind: ScheduledWorldEvent['kind'], entityId: string) => `${kind}:${entityId}`;

function populationForCivilization(civilization: Civilization, galaxy: Galaxy, hubs: Hub[]): number {
  const hubPopulation = hubs.filter((hub) => hub.civilizationId === civilization.id).reduce((sum, hub) => sum + hub.population, 0);
  const territorialBase = civilization.controlledSystems.length * (civilization.status === 'living' ? 1_800_000 : 80_000);
  const techMultiplier = 0.65 + civilization.techLevel * 0.12;
  return Math.max(0, Math.round((hubPopulation + territorialBase) * techMultiplier));
}

function systemPopulation(systemId: string, galaxy: Galaxy, hubs: Hub[], civilizations: Record<string, SimulationCivilizationState>): number {
  const system = galaxy.systems.find((entry) => entry.id === systemId);
  if (!system) return 0;
  const hubPopulation = hubs.filter((hub) => hub.systemId === systemId).reduce((sum, hub) => sum + hub.population, 0);
  const civilizationPopulation = system.civilizationIds.reduce((sum, id) => {
    const state = civilizations[id];
    const civ = galaxy.civilizations.find((entry) => entry.id === id);
    if (!state || !civ || civ.controlledSystems.length === 0) return sum;
    return sum + state.population / civ.controlledSystems.length;
  }, 0);
  return Math.max(hubPopulation, Math.round(civilizationPopulation));
}

function initialScheduledEvents(context: SimulationContext, ecologyPlanetIds: string[]): ScheduledWorldEvent[] {
  const scheduled: ScheduledWorldEvent[] = [];
  for (const civilization of context.galaxy.civilizations.filter((entry) => entry.status === 'living')) {
    scheduled.push({
      id: cycleId('civilization-cycle', civilization.id),
      kind: 'civilization-cycle',
      entityId: civilization.id,
      dueHour: (18 + scheduled.length * 3) * HOURS_PER_DAY,
      repeatHours: 90 * HOURS_PER_DAY,
      seedKey: `${context.seed}:civilization-cycle:${civilization.id}`
    });
  }
  for (const faction of context.factions) {
    scheduled.push({
      id: cycleId('faction-cycle', faction.id),
      kind: 'faction-cycle',
      entityId: faction.id,
      dueHour: (10 + scheduled.length * 2) * HOURS_PER_DAY,
      repeatHours: 60 * HOURS_PER_DAY,
      seedKey: `${context.seed}:faction-cycle:${faction.id}`
    });
  }
  const importantSystems = new Set<string>([
    ...context.hubs.map((hub) => hub.systemId),
    ...context.galaxy.civilizations.filter((entry) => entry.status === 'living').map((entry) => entry.homeSystemId)
  ]);
  for (const systemId of importantSystems) {
    scheduled.push({
      id: cycleId('system-cycle', systemId),
      kind: 'system-cycle',
      entityId: systemId,
      dueHour: (7 + scheduled.length) * HOURS_PER_DAY,
      repeatHours: 30 * HOURS_PER_DAY,
      seedKey: `${context.seed}:system-cycle:${systemId}`
    });
  }
  for (const planetId of ecologyPlanetIds) {
    const planetIndex = context.galaxy.systems.flatMap((system) => system.planets).findIndex((planet) => planet.id === planetId);
    scheduled.push({
      id: cycleId('ecology-cycle', planetId),
      kind: 'ecology-cycle',
      entityId: planetId,
      dueHour: (30 + Math.max(0, planetIndex % 120)) * HOURS_PER_DAY,
      repeatHours: 360 * HOURS_PER_DAY,
      seedKey: `${context.seed}:ecology-cycle:${planetId}`
    });
  }
  return scheduled.sort((a, b) => a.dueHour - b.dueHour);
}

export function initializeSimulation(context: SimulationContext, absoluteHour = 0): SimulationState {
  const civilizations: Record<string, SimulationCivilizationState> = {};
  for (const civilization of context.galaxy.civilizations) {
    civilizations[civilization.id] = {
      civilizationId: civilization.id,
      population: populationForCivilization(civilization, context.galaxy, context.hubs),
      stability: civilization.status === 'living' ? clamp(46 + civilization.techLevel * 4) : 0,
      economy: civilization.status === 'living' ? clamp(38 + civilization.techLevel * 5) : 0,
      military: civilization.status === 'living' ? clamp(24 + civilization.techLevel * 6) : 0,
      research: civilization.status === 'living' ? clamp(30 + civilization.techLevel * 6) : 0,
      cohesion: civilization.status === 'living' ? 58 : 0,
      expansionPressure: civilization.status === 'living' ? clamp(12 + civilization.controlledSystems.length * 4) : 0,
      alive: civilization.status === 'living',
      lastUpdatedHour: absoluteHour
    };
  }

  const systems: Record<string, SimulationSystemState> = {};
  for (const system of context.galaxy.systems) {
    const population = systemPopulation(system.id, context.galaxy, context.hubs, civilizations);
    const hub = context.hubs.find((entry) => entry.systemId === system.id);
    systems[system.id] = {
      systemId: system.id,
      population,
      prosperity: clamp((hub ? 58 : 24) + system.civilizationIds.length * 8 - (system.danger === 'danger' ? 14 : system.danger === 'extreme' ? 28 : 0)),
      security: clamp(hub?.safety === 'safe' ? 76 : hub?.safety === 'danger' ? 22 : system.danger === 'safe' ? 62 : 38),
      supply: clamp(hub ? 66 : 35),
      tradePressure: hub ? 42 : 12,
      migrationPressure: 20,
      lastUpdatedHour: absoluteHour
    };
  }

  const factions: Record<string, SimulationFactionState> = {};
  for (const faction of context.factions) {
    factions[faction.id] = {
      factionId: faction.id,
      wealth: clamp(faction.wealth),
      military: clamp(faction.military),
      research: clamp(faction.research),
      influence: clamp((faction.wealth + faction.military + faction.research) / 3),
      tension: clamp(faction.enemies.length * 18 + (faction.disposition === 'hostile' ? 28 : 0)),
      lastUpdatedHour: absoluteHour
    };
  }

  const ecosystems = initializeEcosystems(context.galaxy, absoluteHour);

  return {
    version: 2,
    clock: { absoluteHour, epochYear: 0 },
    systems,
    civilizations,
    factions,
    ecosystems,
    scheduledEvents: initialScheduledEvents(context, Object.keys(ecosystems)).map((entry) => ({ ...entry, dueHour: entry.dueHour + absoluteHour })),
    events: [],
    nextSequence: 1,
    lastAdvanceReason: 'initialization'
  };
}

function eventId(state: SimulationState, scheduled: ScheduledWorldEvent): string {
  return `world_${state.nextSequence}_${scheduled.kind}_${scheduled.entityId ?? 'global'}_${scheduled.dueHour}`;
}

function resolveCivilizationCycle(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): WorldEvent | null {
  const id = event.entityId;
  const current = id ? state.civilizations[id] : undefined;
  const civilization = id ? context.galaxy.civilizations.find((entry) => entry.id === id) : undefined;
  if (!id || !current || !civilization || !current.alive) return null;
  const rng = createRng(`${event.seedKey}:${event.dueHour}`);
  const populationDeltaRate = (current.stability - 45) / 20_000 + rng.int(-20, 26) / 100_000;
  const populationDelta = Math.round(current.population * populationDeltaRate);
  const stabilityDelta = rng.int(-5, 5) + (current.economy < 25 ? -3 : 0);
  const economyDelta = rng.int(-4, 6) + (current.research > 65 ? 2 : 0);
  const migrationPressure = clamp(current.expansionPressure + rng.int(-8, 12));
  const population = Math.max(0, current.population + populationDelta);
  state.civilizations[id] = {
    ...current,
    population,
    stability: clamp(current.stability + stabilityDelta),
    economy: clamp(current.economy + economyDelta),
    cohesion: clamp(current.cohesion + rng.int(-4, 4)),
    expansionPressure: migrationPressure,
    lastUpdatedHour: event.dueHour,
    alive: population > 0
  };

  const severe = Math.abs(stabilityDelta) >= 5 || Math.abs(populationDeltaRate) > 0.002;
  const title = stabilityDelta <= -4
    ? `${civilization.name}: внутренний кризис`
    : migrationPressure >= 72
      ? `${civilization.name}: новая волна расселения`
      : `${civilization.name}: демографический цикл`;
  return {
    id: eventId(state, event),
    atHour: event.dueHour,
    kind: migrationPressure >= 72 ? 'migration' : stabilityDelta <= -4 ? 'politics' : 'demography',
    title,
    summary: migrationPressure >= 72
      ? `Население и частные экспедиции ищут новые маршруты за пределами текущих территорий.`
      : stabilityDelta <= -4
        ? `Стабильность снизилась до ${state.civilizations[id]!.stability}. Экономические и политические группы усиливают давление.`
        : `Население изменилось на ${populationDelta.toLocaleString('ru-RU')}; экономика ${state.civilizations[id]!.economy}/100.`,
    severity: severe ? 6 : 2,
    visibility: severe ? 'public' : 'local',
    systemIds: civilization.controlledSystems.slice(0, 4),
    civilizationIds: [id],
    factionIds: context.factions.filter((faction) => faction.civilizationId === id).map((faction) => faction.id),
    tags: ['simulation', 'civilization'],
    data: { populationDelta, stabilityDelta, economyDelta }
  };
}

function resolveFactionCycle(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): WorldEvent | null {
  const id = event.entityId;
  const current = id ? state.factions[id] : undefined;
  const faction = id ? context.factions.find((entry) => entry.id === id) : undefined;
  if (!id || !current || !faction) return null;
  const rng = createRng(`${event.seedKey}:${event.dueHour}`);
  const wealthDelta = rng.int(-5, 7);
  const tensionDelta = rng.int(-6, 9) + (faction.enemies.length ? 2 : -2);
  const researchDelta = rng.int(-2, 4);
  state.factions[id] = {
    ...current,
    wealth: clamp(current.wealth + wealthDelta),
    research: clamp(current.research + researchDelta),
    influence: clamp(current.influence + Math.round((wealthDelta + researchDelta) / 2)),
    tension: clamp(current.tension + tensionDelta),
    lastUpdatedHour: event.dueHour
  };
  const next = state.factions[id]!;
  const kind = next.tension >= 75 ? 'conflict' : wealthDelta <= -4 ? 'shortage' : researchDelta >= 3 ? 'research' : 'economy';
  const significant = kind !== 'economy' || Math.abs(wealthDelta) >= 5;
  return {
    id: eventId(state, event),
    atHour: event.dueHour,
    kind,
    title: kind === 'conflict' ? `${faction.name}: мобилизация` : kind === 'shortage' ? `${faction.name}: нехватка ресурсов` : kind === 'research' ? `${faction.name}: исследовательский прорыв` : `${faction.name}: торговый цикл`,
    summary: kind === 'conflict'
      ? `Напряжение достигло ${next.tension}/100. Патрули и военные контракты становятся вероятнее.`
      : kind === 'shortage'
        ? `Богатство снизилось до ${next.wealth}/100. Спрос на поставки растёт.`
        : kind === 'research'
          ? `Исследовательский потенциал вырос до ${next.research}/100.`
          : `Экономическое влияние изменилось до ${next.influence}/100.`,
    severity: significant ? 5 : 1,
    visibility: significant ? 'public' : 'local',
    systemIds: context.galaxy.systems.filter((system) => system.factionId === id).slice(0, 5).map((system) => system.id),
    civilizationIds: faction.civilizationId ? [faction.civilizationId] : [],
    factionIds: [id],
    tags: ['simulation', 'faction'],
    data: { wealthDelta, tensionDelta, researchDelta }
  };
}

function resolveSystemCycle(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): WorldEvent | null {
  const id = event.entityId;
  const current = id ? state.systems[id] : undefined;
  const system = id ? context.galaxy.systems.find((entry) => entry.id === id) : undefined;
  if (!id || !current || !system) return null;
  const rng = createRng(`${event.seedKey}:${event.dueHour}`);
  const supplyDelta = rng.int(-8, 8) + (current.security < 30 ? -4 : 0);
  const prosperityDelta = rng.int(-5, 6) + (current.supply < 25 ? -4 : 0);
  const migrationDelta = rng.int(-7, 9) + (current.prosperity < 30 ? 5 : -1);
  state.systems[id] = {
    ...current,
    supply: clamp(current.supply + supplyDelta),
    prosperity: clamp(current.prosperity + prosperityDelta),
    migrationPressure: clamp(current.migrationPressure + migrationDelta),
    tradePressure: clamp(current.tradePressure + (supplyDelta < 0 ? 5 : rng.int(-3, 3))),
    lastUpdatedHour: event.dueHour
  };
  const next = state.systems[id]!;
  const kind = next.supply <= 22 ? 'shortage' : next.migrationPressure >= 72 ? 'migration' : 'economy';
  if (kind === 'economy' && Math.abs(supplyDelta) < 7 && Math.abs(prosperityDelta) < 5) return null;
  return {
    id: eventId(state, event),
    atHour: event.dueHour,
    kind,
    title: kind === 'shortage' ? `${system.name}: дефицит снабжения` : kind === 'migration' ? `${system.name}: рост миграции` : `${system.name}: изменение торговли`,
    summary: kind === 'shortage'
      ? `Уровень снабжения упал до ${next.supply}/100. Цены и контракты на доставку растут.`
      : kind === 'migration'
        ? `Миграционное давление достигло ${next.migrationPressure}/100.`
        : `Процветание ${next.prosperity}/100, снабжение ${next.supply}/100.`,
    severity: kind === 'economy' ? 2 : 6,
    visibility: 'local',
    systemIds: [id],
    civilizationIds: system.civilizationIds,
    factionIds: system.factionId ? [system.factionId] : [],
    tags: ['simulation', 'system'],
    data: { supplyDelta, prosperityDelta, migrationDelta }
  };
}

function resolveEcologyCycle(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): WorldEvent | null {
  const planetId = event.entityId;
  const current = planetId ? state.ecosystems[planetId] : undefined;
  if (!planetId || !current) return null;
  const system = context.galaxy.systems.find((entry) => entry.planets.some((planet) => planet.id === planetId));
  const planet = system?.planets.find((entry) => entry.id === planetId);
  if (!system || !planet) return null;
  const result = simulateEcologyCycle(current, event.seedKey, event.dueHour);
  state.ecosystems[planetId] = result.ecology;
  if (!result.event) return null;
  return {
    id: eventId(state, event), atHour: event.dueHour, kind: result.event.kind,
    title: `${planet.name}: ${result.event.title}`, summary: result.event.summary,
    severity: result.event.severity, visibility: result.event.visibility,
    systemIds: [system.id], civilizationIds: planet.civilizationId ? [planet.civilizationId] : system.civilizationIds,
    factionIds: system.factionId ? [system.factionId] : [], tags: result.event.tags,
    data: { ...(result.event.data ?? {}), planetId }
  };
}

function processScheduledEvent(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): WorldEvent | null {
  if (event.kind === 'civilization-cycle') return resolveCivilizationCycle(state, event, context);
  if (event.kind === 'faction-cycle') return resolveFactionCycle(state, event, context);
  if (event.kind === 'system-cycle') return resolveSystemCycle(state, event, context);
  if (event.kind === 'ecology-cycle') return resolveEcologyCycle(state, event, context);
  return null;
}

export function advanceSimulation(
  input: SimulationState,
  context: SimulationContext,
  hours: number,
  reason: string
): SimulationAdvanceResult {
  const targetHour = input.clock.absoluteHour + Math.max(0, Math.floor(hours));
  const state: SimulationState = structuredClone(input);
  const emittedEvents: WorldEvent[] = [];
  state.lastAdvanceReason = reason;

  const queue = [...state.scheduledEvents].sort((a, b) => a.dueHour - b.dueHour);
  const insertScheduled = (entry: ScheduledWorldEvent) => {
    let low = 0;
    let high = queue.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((queue[middle]?.dueHour ?? Number.POSITIVE_INFINITY) <= entry.dueHour) low = middle + 1;
      else high = middle;
    }
    queue.splice(low, 0, entry);
  };

  let processed = 0;
  while (queue[0] && queue[0]!.dueHour <= targetHour) {
    processed += 1;
    if (processed > 100_000) throw new Error('Simulation advance exceeded the safe event budget');
    const next = queue.shift()!;
    const worldEvent = processScheduledEvent(state, next, context);
    if (worldEvent) {
      emittedEvents.push(worldEvent);
      state.nextSequence += 1;
    }
    if (next.repeatHours) insertScheduled({ ...next, dueHour: next.dueHour + next.repeatHours });
  }

  state.clock.absoluteHour = targetHour;
  state.events = [...emittedEvents].reverse().concat(state.events).slice(0, 1_000);
  state.scheduledEvents = queue.slice(0, 10_000);
  return { simulation: state, emittedEvents: emittedEvents.slice(-500) };
}

export function simulationYear(state: SimulationState): number {
  return worldYear(state.clock);
}

export function adjustSystemEconomy(
  input: SimulationState,
  systemId: string,
  delta: Partial<Pick<SimulationSystemState, 'supply' | 'prosperity' | 'security' | 'tradePressure' | 'migrationPressure'>>
): SimulationState {
  const current = input.systems[systemId];
  if (!current) return input;
  const next = { ...current };
  for (const [key, value] of Object.entries(delta) as [keyof typeof delta, number][]) {
    if (value === undefined) continue;
    next[key] = clamp((next[key] as number) + value) as never;
  }
  return { ...input, systems: { ...input.systems, [systemId]: next } };
}

export function recordWorldEvent(
  input: SimulationState,
  event: Omit<WorldEvent, 'id' | 'atHour'> & { atHour?: number }
): { simulation: SimulationState; event: WorldEvent } {
  const atHour = event.atHour ?? input.clock.absoluteHour;
  const created: WorldEvent = {
    ...event,
    id: `world_${input.nextSequence}_manual_${atHour}`,
    atHour
  };
  return {
    event: created,
    simulation: {
      ...input,
      nextSequence: input.nextSequence + 1,
      events: [created, ...input.events].slice(0, 1_000)
    }
  };
}


export function upgradeSimulationEcosystems(input: SimulationState | (Omit<SimulationState, 'version' | 'ecosystems'> & { version: 1; ecosystems?: never }), context: SimulationContext): SimulationState {
  if ((input as SimulationState).version === 2 && (input as SimulationState).ecosystems) return input as SimulationState;
  const legacy = input as Omit<SimulationState, 'version' | 'ecosystems'>;
  const ecosystems = initializeEcosystems(context.galaxy, legacy.clock.absoluteHour);
  const existingIds = new Set(legacy.scheduledEvents.map((event) => event.id));
  const ecologyEvents: ScheduledWorldEvent[] = Object.keys(ecosystems).map((planetId, index) => ({
    id: cycleId('ecology-cycle', planetId), kind: 'ecology-cycle' as const, entityId: planetId,
    dueHour: legacy.clock.absoluteHour + (30 + index % 120) * HOURS_PER_DAY,
    repeatHours: 360 * HOURS_PER_DAY, seedKey: `${context.seed}:ecology-cycle:${planetId}`
  })).filter((event) => !existingIds.has(event.id));
  return { ...legacy, version: 2, ecosystems, scheduledEvents: [...legacy.scheduledEvents, ...ecologyEvents].sort((a, b) => a.dueHour - b.dueHour) };
}

export function adjustEcosystem(
  input: SimulationState,
  planetId: string,
  delta: Partial<Pick<import('../ecology/types').PlanetEcologyState, 'biomass' | 'biodiversity' | 'resilience' | 'contamination' | 'climateStability'>>
): SimulationState {
  const current = input.ecosystems[planetId]; if (!current) return input; const next = { ...current };
  for (const [key, value] of Object.entries(delta) as [keyof typeof delta, number][]) { if (value === undefined) continue; next[key] = clamp((next[key] as number) + value) as never; }
  return { ...input, ecosystems: { ...input.ecosystems, [planetId]: next } };
}
