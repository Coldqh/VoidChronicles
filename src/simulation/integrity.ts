import type { Faction, Galaxy, Hub } from '../game/types';
import { missingSettlementSchedule } from './scheduler';
import type {
  PopulationGroupState,
  ScheduledWorldEvent,
  SettlementResource,
  SettlementState,
  SettlementStockpile,
  SimulationState,
  TradeRouteState,
  WorldEvent
} from './types';

const RESOURCES: readonly SettlementResource[] = [
  'food',
  'water',
  'energy',
  'medicine',
  'parts',
  'weapons',
  'luxury',
  'rareMaterials'
];

export interface SimulationIntegrityContext {
  galaxy: Galaxy;
  factions: Faction[];
  hubs: Hub[];
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, finite(value)));
}

function normalizeStockpile(
  input: Partial<SettlementStockpile> | undefined,
  minimum = 0
): SettlementStockpile {
  return Object.fromEntries(
    RESOURCES.map((resource) => [
      resource,
      Math.max(minimum, finite(input?.[resource] ?? 0))
    ])
  ) as SettlementStockpile;
}

function uniqueValues<T extends string>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function repairSettlements(
  input: SimulationState,
  context: SimulationIntegrityContext
): Record<string, SettlementState> {
  const systems = new Map(context.galaxy.systems.map((system) => [system.id, system]));
  const planetSystem = new Map(
    context.galaxy.systems.flatMap((system) =>
      system.planets.map((planet) => [planet.id, system.id] as const)
    )
  );
  const hubs = new Map(context.hubs.map((hub) => [hub.id, hub]));
  const civilizationIds = new Set(context.galaxy.civilizations.map((entry) => entry.id));
  const factionIds = new Set(context.factions.map((entry) => entry.id));
  const repaired: Record<string, SettlementState> = {};

  for (const entry of Object.values(input.settlements ?? {})) {
    if (!entry?.id || repaired[entry.id] || !systems.has(entry.systemId)) continue;

    const population = Math.max(0, Math.round(finite(entry.population)));
    const abandoned = Boolean(entry.abandoned || entry.kind === 'abandoned' || population <= 0);
    const planetId =
      entry.planetId && planetSystem.get(entry.planetId) === entry.systemId
        ? entry.planetId
        : undefined;
    const hub = entry.hubId ? hubs.get(entry.hubId) : undefined;
    const hubId = hub?.systemId === entry.systemId ? hub.id : undefined;

    repaired[entry.id] = {
      ...entry,
      id: entry.id,
      name: entry.name?.trim() || `Поселение ${entry.id}`,
      kind: abandoned ? 'abandoned' : entry.kind,
      planetId,
      hubId,
      civilizationId:
        entry.civilizationId && civilizationIds.has(entry.civilizationId)
          ? entry.civilizationId
          : undefined,
      ownerFactionId:
        entry.ownerFactionId && factionIds.has(entry.ownerFactionId)
          ? entry.ownerFactionId
          : undefined,
      population: abandoned ? 0 : population,
      infrastructure: clamp(entry.infrastructure),
      security: clamp(entry.security),
      unrest: clamp(entry.unrest),
      housing: clamp(entry.housing),
      health: clamp(entry.health),
      production: normalizeStockpile(entry.production),
      consumption: normalizeStockpile(entry.consumption),
      stocks: normalizeStockpile(entry.stocks),
      foundedHour: Math.floor(finite(entry.foundedHour)),
      abandoned,
      lastUpdatedHour: Math.max(0, Math.floor(finite(entry.lastUpdatedHour)))
    };
  }

  return repaired;
}

function repairPopulationGroups(
  input: SimulationState,
  settlements: Record<string, SettlementState>
): Record<string, PopulationGroupState> {
  const repaired: Record<string, PopulationGroupState> = {};

  for (const entry of Object.values(input.populationGroups ?? {})) {
    const settlement = settlements[entry?.settlementId];
    if (
      !entry?.id ||
      repaired[entry.id] ||
      !settlement ||
      settlement.abandoned ||
      settlement.population <= 0
    ) {
      continue;
    }

    const population = Math.max(
      0,
      Math.min(settlement.population, Math.round(finite(entry.population)))
    );
    if (population <= 0) continue;

    repaired[entry.id] = {
      ...entry,
      civilizationId:
        entry.civilizationId === settlement.civilizationId
          ? entry.civilizationId
          : settlement.civilizationId,
      species: entry.species?.trim() || 'неизвестный вид',
      culture: entry.culture?.trim() || 'неизвестная культура',
      profession: entry.profession?.trim() || 'неопределённая занятость',
      population,
      wealth: clamp(entry.wealth),
      health: clamp(entry.health),
      loyalty: clamp(entry.loyalty),
      radicalization: clamp(entry.radicalization),
      migrationDesire: clamp(entry.migrationDesire)
    };
  }

  const idsBySettlement = new Map<string, string[]>();
  for (const group of Object.values(repaired)) {
    const ids = idsBySettlement.get(group.settlementId) ?? [];
    ids.push(group.id);
    idsBySettlement.set(group.settlementId, ids);
  }

  for (const [settlementId, groupIds] of idsBySettlement) {
    const settlement = settlements[settlementId];
    if (!settlement) continue;
    const total = groupIds.reduce(
      (sum, id) => sum + (repaired[id]?.population ?? 0),
      0
    );
    if (total <= settlement.population || total <= 0) continue;

    const ratio = settlement.population / total;
    let assigned = 0;
    groupIds.forEach((id, index) => {
      const current = repaired[id];
      if (!current) return;
      const isLast = index === groupIds.length - 1;
      const population = isLast
        ? Math.max(0, settlement.population - assigned)
        : Math.max(0, Math.floor(current.population * ratio));
      assigned += population;
      if (population <= 0) delete repaired[id];
      else repaired[id] = { ...current, population };
    });
  }

  return repaired;
}

function repairTradeRoutes(
  input: SimulationState,
  settlements: Record<string, SettlementState>,
  context: SimulationIntegrityContext
): Record<string, TradeRouteState> {
  const systemIds = new Set(context.galaxy.systems.map((system) => system.id));
  const repaired: Record<string, TradeRouteState> = {};

  for (const entry of Object.values(input.tradeRoutes ?? {})) {
    if (!entry?.id || repaired[entry.id]) continue;
    const origin = settlements[entry.originSettlementId];
    const destination = settlements[entry.destinationSettlementId];
    if (
      !origin ||
      !destination ||
      origin.id === destination.id ||
      origin.abandoned ||
      destination.abandoned
    ) {
      continue;
    }

    const path = uniqueValues([
      origin.systemId,
      ...(entry.pathSystemIds ?? []).filter((id) => systemIds.has(id)),
      destination.systemId
    ]);

    repaired[entry.id] = {
      ...entry,
      originSettlementId: origin.id,
      destinationSettlementId: destination.id,
      pathSystemIds: path,
      cargo: uniqueValues(
        (entry.cargo ?? []).filter((resource): resource is SettlementResource =>
          RESOURCES.includes(resource)
        )
      ),
      capacity: Math.max(0, finite(entry.capacity)),
      traffic: clamp(entry.traffic),
      danger: clamp(entry.danger),
      disrupted: Boolean(entry.disrupted),
      lastUpdatedHour: Math.max(0, Math.floor(finite(entry.lastUpdatedHour)))
    };
  }

  return repaired;
}

function scheduledEntityIsValid(
  event: ScheduledWorldEvent,
  state: {
    systemIds: Set<string>;
    planetIds: Set<string>;
    civilizationIds: Set<string>;
    factionIds: Set<string>;
    settlementIds: Set<string>;
    routeIds: Set<string>;
  }
): boolean {
  if (event.kind === 'war-cycle') return true;
  if (!event.entityId) return false;
  if (event.kind === 'system-cycle') return state.systemIds.has(event.entityId);
  if (event.kind === 'ecology-cycle') return state.planetIds.has(event.entityId);
  if (event.kind === 'civilization-cycle' || event.kind === 'migration-cycle') {
    return state.civilizationIds.has(event.entityId);
  }
  if (event.kind === 'faction-cycle') return state.factionIds.has(event.entityId);
  if (event.kind === 'settlement-cycle') return state.settlementIds.has(event.entityId);
  if (event.kind === 'trade-cycle') return state.routeIds.has(event.entityId);
  return false;
}

function repairScheduledEvents(
  input: SimulationState,
  settlements: Record<string, SettlementState>,
  tradeRoutes: Record<string, TradeRouteState>,
  context: SimulationIntegrityContext
): ScheduledWorldEvent[] {
  const systemIds = new Set(context.galaxy.systems.map((system) => system.id));
  const planetIds = new Set(
    context.galaxy.systems.flatMap((system) => system.planets.map((planet) => planet.id))
  );
  const civilizationIds = new Set(
    context.galaxy.civilizations
      .filter((civilization) => civilization.status === 'living')
      .map((civilization) => civilization.id)
  );
  const factionIds = new Set(context.factions.map((faction) => faction.id));
  const settlementIds = new Set(
    Object.values(settlements)
      .filter((settlement) => !settlement.abandoned)
      .map((settlement) => settlement.id)
  );
  const routeIds = new Set(Object.keys(tradeRoutes));
  const references = {
    systemIds,
    planetIds,
    civilizationIds,
    factionIds,
    settlementIds,
    routeIds
  };

  const byId = new Map<string, ScheduledWorldEvent>();
  for (const entry of input.scheduledEvents ?? []) {
    if (
      !entry?.id ||
      !scheduledEntityIsValid(entry, references) ||
      !Number.isFinite(entry.dueHour)
    ) {
      continue;
    }

    const normalized: ScheduledWorldEvent = {
      ...entry,
      dueHour: Math.max(0, Math.floor(entry.dueHour)),
      repeatHours:
        entry.repeatHours !== undefined && Number.isFinite(entry.repeatHours)
          ? Math.max(1, Math.floor(entry.repeatHours))
          : undefined,
      seedKey: entry.seedKey || `repaired:${entry.kind}:${entry.entityId ?? 'global'}`
    };
    const existing = byId.get(normalized.id);
    if (!existing || normalized.dueHour < existing.dueHour) {
      byId.set(normalized.id, normalized);
    }
  }

  const existing = [...byId.values()];
  const missing = missingSettlementSchedule({
    context: {
      seed: context.galaxy.seed,
      galaxy: context.galaxy,
      factions: context.factions,
      hubs: context.hubs
    },
    settlementIds: [...settlementIds],
    tradeRouteIds: [...routeIds],
    civilizationIds: [...civilizationIds],
    existing,
    absoluteHour: Math.max(0, Math.floor(input.clock.absoluteHour))
  });

  for (const event of missing) {
    if (!byId.has(event.id)) byId.set(event.id, event);
  }

  return [...byId.values()]
    .sort((a, b) => a.dueHour - b.dueHour)
    .slice(0, 25_000);
}

function repairWorldEvents(
  input: SimulationState,
  context: SimulationIntegrityContext
): WorldEvent[] {
  const systemIds = new Set(context.galaxy.systems.map((system) => system.id));
  const civilizationIds = new Set(context.galaxy.civilizations.map((entry) => entry.id));
  const factionIds = new Set(context.factions.map((entry) => entry.id));
  const seen = new Set<string>();
  const repaired: WorldEvent[] = [];

  for (const entry of input.events ?? []) {
    if (!entry?.id || seen.has(entry.id) || !Number.isFinite(entry.atHour)) continue;
    seen.add(entry.id);
    repaired.push({
      ...entry,
      atHour: Math.max(0, Math.floor(entry.atHour)),
      severity: clamp(entry.severity, 0, 10),
      systemIds: uniqueValues(entry.systemIds.filter((id) => systemIds.has(id))),
      civilizationIds: uniqueValues(
        entry.civilizationIds.filter((id) => civilizationIds.has(id))
      ),
      factionIds: uniqueValues(entry.factionIds.filter((id) => factionIds.has(id))),
      tags: uniqueValues(entry.tags)
    });
    if (repaired.length >= 1_000) break;
  }

  return repaired;
}

export function repairSimulationPersistence(
  input: SimulationState,
  context: SimulationIntegrityContext
): SimulationState {
  const planetIds = new Set(
    context.galaxy.systems.flatMap((system) => system.planets.map((planet) => planet.id))
  );
  const ecosystems = Object.fromEntries(
    Object.entries(input.ecosystems ?? {}).filter(([planetId]) => planetIds.has(planetId))
  );

  const settlements = repairSettlements(input, context);
  const populationGroups = repairPopulationGroups(input, settlements);
  const tradeRoutes = repairTradeRoutes(input, settlements, context);
  const scheduledEvents = repairScheduledEvents(
    input,
    settlements,
    tradeRoutes,
    context
  );
  const events = repairWorldEvents(input, context);

  return {
    ...input,
    version: 3,
    clock: {
      epochYear: Math.floor(finite(input.clock.epochYear)),
      absoluteHour: Math.max(0, Math.floor(finite(input.clock.absoluteHour)))
    },
    ecosystems,
    settlements,
    populationGroups,
    tradeRoutes,
    scheduledEvents,
    events,
    nextSequence: Math.max(
      1,
      Math.floor(finite(input.nextSequence, 1)),
      events.length + 1
    ),
    lastAdvanceReason: input.lastAdvanceReason || 'persistence-integrity-repair'
  };
}
