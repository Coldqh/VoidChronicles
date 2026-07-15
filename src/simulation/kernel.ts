import { createRng } from '../generation/rng';
import { initializeEcosystems } from '../ecology/generate';
import { simulateEcologyCycle } from '../ecology/simulate';
import { HOURS_PER_DAY, worldYear } from './clock';
import type { SimulationContext } from './context';
import { recomputeSystemFromSettlements, simulateSettlementCycle } from './economy';
import { simulateMigrationCycle } from './migration';
import { initialScheduledEvents, missingSettlementSchedule } from './scheduler';
import { initializeSettlementLayer } from './settlements';
import { simulateTradeRouteCycle } from './trade';
import type {
  ScheduledWorldEvent,
  SimulationAdvanceResult,
  SimulationCivilizationState,
  SimulationFactionState,
  SimulationState,
  SimulationSystemState,
  WorldEvent,
  WorldEventDraft
} from './types';

export type { SimulationContext } from './context';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function populationForCivilization(context: SimulationContext, civilizationId: string): number {
  const civilization = context.galaxy.civilizations.find((entry) => entry.id === civilizationId);
  if (!civilization) return 0;
  const hubPopulation = context.hubs.filter((hub) => hub.civilizationId === civilization.id).reduce((sum, hub) => sum + hub.population, 0);
  const territorialBase = civilization.controlledSystems.length * (civilization.status === 'living' ? 1_800_000 : 80_000);
  const techMultiplier = 0.65 + civilization.techLevel * 0.12;
  return Math.max(0, Math.round((hubPopulation + territorialBase) * techMultiplier));
}

function systemPopulation(systemId: string, context: SimulationContext, civilizations: Record<string, SimulationCivilizationState>): number {
  const system = context.galaxy.systems.find((entry) => entry.id === systemId);
  if (!system) return 0;
  const hubPopulation = context.hubs.filter((hub) => hub.systemId === systemId).reduce((sum, hub) => sum + hub.population, 0);
  const civilizationPopulation = system.civilizationIds.reduce((sum, id) => {
    const state = civilizations[id];
    const civ = context.galaxy.civilizations.find((entry) => entry.id === id);
    if (!state || !civ || civ.controlledSystems.length === 0) return sum;
    return sum + state.population / civ.controlledSystems.length;
  }, 0);
  return Math.max(hubPopulation, Math.round(civilizationPopulation));
}

function createBaseSimulation(context: SimulationContext, absoluteHour: number): Omit<SimulationState, 'scheduledEvents' | 'settlements' | 'populationGroups' | 'tradeRoutes'> {
  const civilizations: Record<string, SimulationCivilizationState> = {};
  for (const civilization of context.galaxy.civilizations) {
    civilizations[civilization.id] = {
      civilizationId: civilization.id,
      population: populationForCivilization(context, civilization.id),
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
    const population = systemPopulation(system.id, context, civilizations);
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

  return {
    version: 3,
    clock: { absoluteHour, epochYear: 0 },
    systems,
    civilizations,
    factions,
    ecosystems: initializeEcosystems(context.galaxy, absoluteHour),
    events: [],
    nextSequence: 1,
    lastAdvanceReason: 'initialization'
  };
}

export function initializeSimulation(context: SimulationContext, absoluteHour = 0): SimulationState {
  const base = createBaseSimulation(context, absoluteHour);
  const layer = initializeSettlementLayer(context, base.ecosystems, absoluteHour);
  const simulation: SimulationState = {
    ...base,
    ...layer,
    scheduledEvents: initialScheduledEvents({
      context,
      ecologyPlanetIds: Object.keys(base.ecosystems),
      settlementIds: Object.keys(layer.settlements),
      tradeRouteIds: Object.keys(layer.tradeRoutes),
      civilizationIds: context.galaxy.civilizations.filter((entry) => entry.status === 'living').map((entry) => entry.id),
      absoluteHour
    })
  };
  for (const systemId of Object.keys(simulation.systems)) recomputeSystemFromSettlements(simulation, systemId, absoluteHour);
  return simulation;
}

function eventId(state: SimulationState, scheduled: ScheduledWorldEvent): string {
  return `world_${state.nextSequence}_${scheduled.kind}_${scheduled.entityId ?? 'global'}_${scheduled.dueHour}`;
}

function worldEvent(state: SimulationState, scheduled: ScheduledWorldEvent, draft: WorldEventDraft | null): WorldEvent | null {
  return draft ? { ...draft, id: eventId(state, scheduled), atHour: scheduled.dueHour } : null;
}

function weightedAverage(values: Array<{ value: number; weight: number }>, fallback: number): number {
  const weight = values.reduce((sum, entry) => sum + entry.weight, 0);
  return weight > 0 ? values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / weight : fallback;
}

function resolveCivilizationCycle(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): WorldEvent | null {
  const id = event.entityId;
  const current = id ? state.civilizations[id] : undefined;
  const civilization = id ? context.galaxy.civilizations.find((entry) => entry.id === id) : undefined;
  if (!id || !current || !civilization || !current.alive) return null;
  const settlements = Object.values(state.settlements).filter((entry) => entry.civilizationId === id && !entry.abandoned);
  const population = settlements.reduce((sum, entry) => sum + entry.population, 0);
  const stabilityTarget = weightedAverage(settlements.map((entry) => ({ value: clamp(entry.security + entry.health - entry.unrest) / 2, weight: entry.population })), current.stability);
  const economyTarget = weightedAverage(settlements.map((entry) => ({ value: (entry.infrastructure + state.systems[entry.systemId]!.supply) / 2, weight: entry.population })), current.economy);
  const cohesionTarget = weightedAverage(settlements.map((entry) => ({ value: 100 - entry.unrest, weight: entry.population })), current.cohesion);
  const housingStress = weightedAverage(settlements.map((entry) => ({ value: 100 - entry.housing + entry.unrest, weight: entry.population })), current.expansionPressure);
  const next: SimulationCivilizationState = {
    ...current,
    population,
    stability: clamp(current.stability + Math.round((stabilityTarget - current.stability) * 0.25)),
    economy: clamp(current.economy + Math.round((economyTarget - current.economy) * 0.22)),
    cohesion: clamp(current.cohesion + Math.round((cohesionTarget - current.cohesion) * 0.2)),
    expansionPressure: clamp(current.expansionPressure + Math.round((housingStress - current.expansionPressure) * 0.18)),
    alive: population > 0,
    lastUpdatedHour: event.dueHour
  };
  state.civilizations[id] = next;
  if (!next.alive) return worldEvent(state, event, {
    kind: 'disaster', title: `${civilization.name}: цивилизация прекратила существование`,
    summary: 'Последние действующие поселения опустели. В галактике остались только инфраструктура, архивы и беженцы.',
    severity: 10, visibility: 'public', systemIds: civilization.controlledSystems, civilizationIds: [id],
    factionIds: context.factions.filter((entry) => entry.civilizationId === id).map((entry) => entry.id),
    tags: ['simulation', 'civilization', 'extinction'], data: { population: 0 }
  });
  const stabilityDrop = current.stability - next.stability;
  if (stabilityDrop >= 8 || next.stability <= 24) return worldEvent(state, event, {
    kind: 'politics', title: `${civilization.name}: системный кризис`,
    summary: `Стабильность ${next.stability}/100. Причина находится в состоянии реальных колоний, снабжения и населения.`,
    severity: 7, visibility: 'public', systemIds: settlements.map((entry) => entry.systemId).slice(0, 8), civilizationIds: [id],
    factionIds: context.factions.filter((entry) => entry.civilizationId === id).map((entry) => entry.id),
    tags: ['simulation', 'civilization', 'causal'], data: { stability: next.stability, population }
  });
  if (next.expansionPressure >= 75 && current.expansionPressure < 75) return worldEvent(state, event, {
    kind: 'migration', title: `${civilization.name}: давление на внешние рубежи`,
    summary: 'Перенаселение, жильё и локальные кризисы толкают частные и государственные экспедиции к новым системам.',
    severity: 5, visibility: 'local', systemIds: settlements.map((entry) => entry.systemId).slice(0, 6), civilizationIds: [id],
    factionIds: context.factions.filter((entry) => entry.civilizationId === id).map((entry) => entry.id),
    tags: ['simulation', 'civilization', 'expansion'], data: { expansionPressure: next.expansionPressure }
  });
  return null;
}

function resolveFactionCycle(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): WorldEvent | null {
  const id = event.entityId;
  const current = id ? state.factions[id] : undefined;
  const faction = id ? context.factions.find((entry) => entry.id === id) : undefined;
  if (!id || !current || !faction) return null;
  const settlements = Object.values(state.settlements).filter((entry) => entry.ownerFactionId === id && !entry.abandoned);
  const routes = Object.values(state.tradeRoutes).filter((route) => {
    const origin = state.settlements[route.originSettlementId];
    const destination = state.settlements[route.destinationSettlementId];
    return origin?.ownerFactionId === id || destination?.ownerFactionId === id;
  });
  const productive = settlements.length ? settlements.reduce((sum, entry) => sum + entry.infrastructure - entry.unrest * 0.5, 0) / settlements.length : current.wealth - 8;
  const disruptedRoutes = routes.filter((entry) => entry.disrupted).length;
  const averageUnrest = settlements.length ? settlements.reduce((sum, entry) => sum + entry.unrest, 0) / settlements.length : 40;
  const wealthTarget = clamp(productive - disruptedRoutes * 5 + routes.length * 1.5);
  const tensionTarget = clamp(averageUnrest * 0.6 + faction.enemies.length * 15 + disruptedRoutes * 8);
  const next = {
    ...current,
    wealth: clamp(current.wealth + Math.round((wealthTarget - current.wealth) * 0.25)),
    influence: clamp(current.influence + Math.round((wealthTarget - current.influence) * 0.12)),
    tension: clamp(current.tension + Math.round((tensionTarget - current.tension) * 0.2)),
    lastUpdatedHour: event.dueHour
  };
  state.factions[id] = next;
  if (next.tension >= 78 && current.tension < 78) return worldEvent(state, event, {
    kind: 'conflict', title: `${faction.name}: мобилизация`,
    summary: `Напряжение выросло до ${next.tension}/100 из-за беспорядков, соперников и нарушенных маршрутов.`,
    severity: 7, visibility: 'public', systemIds: settlements.map((entry) => entry.systemId).slice(0, 6),
    civilizationIds: faction.civilizationId ? [faction.civilizationId] : [], factionIds: [id],
    tags: ['simulation', 'faction', 'causal'], data: { tension: next.tension, disruptedRoutes }
  });
  if (current.wealth - next.wealth >= 8 || next.wealth <= 22) return worldEvent(state, event, {
    kind: 'shortage', title: `${faction.name}: экономический спад`,
    summary: `Богатство ${next.wealth}/100. Производство колоний и торговые маршруты не покрывают потери.`,
    severity: 6, visibility: 'local', systemIds: settlements.map((entry) => entry.systemId).slice(0, 6),
    civilizationIds: faction.civilizationId ? [faction.civilizationId] : [], factionIds: [id],
    tags: ['simulation', 'faction', 'economy'], data: { wealth: next.wealth, settlements: settlements.length }
  });
  return null;
}

function resolveSystemCycle(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): WorldEvent | null {
  const id = event.entityId;
  const previous = id ? state.systems[id] : undefined;
  const system = id ? context.galaxy.systems.find((entry) => entry.id === id) : undefined;
  if (!id || !previous || !system) return null;
  const before = { ...previous };
  recomputeSystemFromSettlements(state, id, event.dueHour);
  const next = state.systems[id]!;
  if (next.supply <= 20 && before.supply > 20) return worldEvent(state, event, {
    kind: 'shortage', title: `${system.name}: системный дефицит`,
    summary: `Снабжение упало до ${next.supply}/100. Причина — реальные запасы и потребление местных поселений.`,
    severity: 7, visibility: 'local', systemIds: [id], civilizationIds: system.civilizationIds,
    factionIds: system.factionId ? [system.factionId] : [], tags: ['simulation', 'system', 'settlements'],
    data: { supply: next.supply, population: next.population }
  });
  if (next.migrationPressure >= 75 && before.migrationPressure < 75) return worldEvent(state, event, {
    kind: 'migration', title: `${system.name}: массовый отток населения`,
    summary: `Миграционное давление достигло ${next.migrationPressure}/100.`,
    severity: 6, visibility: 'local', systemIds: [id], civilizationIds: system.civilizationIds,
    factionIds: system.factionId ? [system.factionId] : [], tags: ['simulation', 'system', 'migration'],
    data: { migrationPressure: next.migrationPressure }
  });
  return null;
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
  const settlements = Object.values(state.settlements).filter((entry) => entry.planetId === planetId && !entry.abandoned);
  for (const settlement of settlements) {
    const contamination = result.ecology.contamination;
    const biomassRatio = result.ecology.biomass / Math.max(1, current.biomass);
    state.settlements[settlement.id] = {
      ...settlement,
      production: {
        ...settlement.production,
        food: Math.max(0, settlement.production.food * Math.max(0.45, biomassRatio)),
        medicine: Math.max(0, settlement.production.medicine * Math.max(0.5, result.ecology.resources.medicinal / 50))
      },
      health: clamp(settlement.health - (contamination >= 70 ? 8 : contamination >= 45 ? 3 : 0)),
      unrest: clamp(settlement.unrest + (contamination >= 70 ? 6 : 0)),
      lastUpdatedHour: event.dueHour
    };
    recomputeSystemFromSettlements(state, settlement.systemId, event.dueHour);
  }
  if (!result.event) return null;
  return worldEvent(state, event, {
    kind: result.event.kind,
    title: `${planet.name}: ${result.event.title}`,
    summary: settlements.length ? `${result.event.summary} Изменение затронуло ${settlements.length} поселений.` : result.event.summary,
    severity: result.event.severity,
    visibility: result.event.visibility,
    systemIds: [system.id],
    civilizationIds: planet.civilizationId ? [planet.civilizationId] : system.civilizationIds,
    factionIds: system.factionId ? [system.factionId] : [],
    tags: [...result.event.tags, 'settlement-impact'],
    data: { ...(result.event.data ?? {}), planetId, affectedSettlements: settlements.length }
  });
}

interface ProcessResult {
  event: WorldEvent | null;
  scheduledEvents: ScheduledWorldEvent[];
}

function processScheduledEvent(state: SimulationState, event: ScheduledWorldEvent, context: SimulationContext): ProcessResult {
  if (event.kind === 'civilization-cycle') return { event: resolveCivilizationCycle(state, event, context), scheduledEvents: [] };
  if (event.kind === 'faction-cycle') return { event: resolveFactionCycle(state, event, context), scheduledEvents: [] };
  if (event.kind === 'system-cycle') return { event: resolveSystemCycle(state, event, context), scheduledEvents: [] };
  if (event.kind === 'ecology-cycle') return { event: resolveEcologyCycle(state, event, context), scheduledEvents: [] };
  if (event.kind === 'settlement-cycle') {
    const result = event.entityId ? simulateSettlementCycle(state, event.entityId, context, event.dueHour) : { event: null, abandoned: false };
    return { event: worldEvent(state, event, result.event), scheduledEvents: [] };
  }
  if (event.kind === 'trade-cycle') {
    const result = event.entityId ? simulateTradeRouteCycle(state, event.entityId, context, event.dueHour) : { event: null, moved: 0 };
    return { event: worldEvent(state, event, result.event), scheduledEvents: [] };
  }
  if (event.kind === 'migration-cycle') {
    const result = event.entityId ? simulateMigrationCycle(state, event.entityId, context, event.dueHour) : { event: null, scheduledEvents: [] };
    return { event: worldEvent(state, event, result.event), scheduledEvents: result.scheduledEvents };
  }
  return { event: null, scheduledEvents: [] };
}

function ensureSettlementSimulation(input: SimulationState, context: SimulationContext): SimulationState {
  const hasSettlements = input.settlements && Object.keys(input.settlements).length > 0;
  let state: SimulationState;
  if (!hasSettlements) {
    const layer = initializeSettlementLayer(context, input.ecosystems ?? {}, input.clock.absoluteHour);
    state = { ...input, ...layer };
  } else {
    state = {
      ...input,
      settlements: input.settlements ?? {},
      populationGroups: input.populationGroups ?? {},
      tradeRoutes: input.tradeRoutes ?? {}
    };
  }
  const missing = missingSettlementSchedule({
    context,
    settlementIds: Object.keys(state.settlements),
    tradeRouteIds: Object.keys(state.tradeRoutes),
    civilizationIds: context.galaxy.civilizations.filter((entry) => entry.status === 'living').map((entry) => entry.id),
    existing: state.scheduledEvents,
    absoluteHour: state.clock.absoluteHour
  });
  if (missing.length) state = { ...state, scheduledEvents: [...state.scheduledEvents, ...missing].sort((a, b) => a.dueHour - b.dueHour) };
  return state;
}

export function advanceSimulation(input: SimulationState, context: SimulationContext, hours: number, reason: string): SimulationAdvanceResult {
  const upgraded = ensureSettlementSimulation(input, context);
  const targetHour = upgraded.clock.absoluteHour + Math.max(0, Math.floor(hours));
  const state: SimulationState = structuredClone(upgraded);
  const emittedEvents: WorldEvent[] = [];
  state.lastAdvanceReason = reason;

  const queue = [...state.scheduledEvents].sort((a, b) => a.dueHour - b.dueHour);
  const scheduledIds = new Set(queue.map((entry) => entry.id));
  const insertScheduled = (entry: ScheduledWorldEvent) => {
    if (scheduledIds.has(entry.id)) return;
    scheduledIds.add(entry.id);
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
    scheduledIds.delete(next.id);
    const result = processScheduledEvent(state, next, context);
    if (result.event) {
      emittedEvents.push(result.event);
      state.nextSequence += 1;
    }
    for (const scheduled of result.scheduledEvents) insertScheduled(scheduled);
    const settlementAbandoned = next.kind === 'settlement-cycle' && next.entityId && state.settlements[next.entityId]?.abandoned;
    const routeMissing = next.kind === 'trade-cycle' && next.entityId && !state.tradeRoutes[next.entityId];
    if (next.repeatHours && !settlementAbandoned && !routeMissing) insertScheduled({ ...next, dueHour: next.dueHour + next.repeatHours });
  }

  state.clock.absoluteHour = targetHour;
  state.events = [...emittedEvents].reverse().concat(state.events).slice(0, 1_000);
  state.scheduledEvents = queue.slice(0, 25_000);
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

export function recordWorldEvent(input: SimulationState, event: Omit<WorldEvent, 'id' | 'atHour'> & { atHour?: number }): { simulation: SimulationState; event: WorldEvent } {
  const atHour = event.atHour ?? input.clock.absoluteHour;
  const created: WorldEvent = { ...event, id: `world_${input.nextSequence}_manual_${atHour}`, atHour };
  return {
    event: created,
    simulation: { ...input, nextSequence: input.nextSequence + 1, events: [created, ...input.events].slice(0, 1_000) }
  };
}

type LegacySimulation = Omit<Partial<SimulationState>, 'version'> & { version?: 1 | 2 | 3 } & Pick<SimulationState, 'clock' | 'systems' | 'civilizations' | 'factions' | 'scheduledEvents' | 'events' | 'nextSequence' | 'lastAdvanceReason'>;

export function upgradeSimulationEcosystems(input: LegacySimulation, context: SimulationContext): SimulationState {
  const ecosystems = input.ecosystems ?? initializeEcosystems(context.galaxy, input.clock.absoluteHour);
  const existingIds = new Set(input.scheduledEvents.map((event) => event.id));
  const ecologyEvents: ScheduledWorldEvent[] = Object.keys(ecosystems).map((planetId, index) => ({
    id: `ecology-cycle:${planetId}`, kind: 'ecology-cycle' as const, entityId: planetId,
    dueHour: input.clock.absoluteHour + (30 + index % 120) * HOURS_PER_DAY,
    repeatHours: 360 * HOURS_PER_DAY, seedKey: `${context.seed}:ecology-cycle:${planetId}`
  })).filter((event) => !existingIds.has(event.id));
  const base = {
    ...input,
    version: 3 as const,
    ecosystems,
    settlements: input.settlements ?? {},
    populationGroups: input.populationGroups ?? {},
    tradeRoutes: input.tradeRoutes ?? {},
    scheduledEvents: [...input.scheduledEvents, ...ecologyEvents].sort((a, b) => a.dueHour - b.dueHour)
  } as SimulationState;
  return ensureSettlementSimulation(base, context);
}

export const upgradeSimulationPersistence = upgradeSimulationEcosystems;

export function adjustEcosystem(
  input: SimulationState,
  planetId: string,
  delta: Partial<Pick<import('../ecology/types').PlanetEcologyState, 'biomass' | 'biodiversity' | 'resilience' | 'contamination' | 'climateStability'>>
): SimulationState {
  const current = input.ecosystems[planetId];
  if (!current) return input;
  const next = { ...current };
  for (const [key, value] of Object.entries(delta) as [keyof typeof delta, number][]) {
    if (value === undefined) continue;
    next[key] = clamp((next[key] as number) + value) as never;
  }
  return { ...input, ecosystems: { ...input.ecosystems, [planetId]: next } };
}
