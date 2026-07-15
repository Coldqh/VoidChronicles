import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import { recomputeSystemFromSettlements, settlementShortages } from './economy';
import { createFrontierColony } from './settlements';
import type { PopulationGroupState, ScheduledWorldEvent, SettlementState, SimulationState, WorldEventDraft } from './types';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function settlementPressure(settlement: SettlementState): number {
  return settlement.unrest * 0.45 + (100 - settlement.housing) * 0.25 + (100 - settlement.health) * 0.2 + settlementShortages(settlement).length * 12;
}

function destinationScore(settlement: SettlementState): number {
  return settlement.housing * 0.35 + settlement.health * 0.25 + settlement.security * 0.2 + settlement.infrastructure * 0.2 - settlement.unrest * 0.35;
}

function movePopulationGroups(state: SimulationState, origin: SettlementState, destination: SettlementState, amount: number): void {
  const groups = Object.values(state.populationGroups).filter((group) => group.settlementId === origin.id && group.population > 0);
  const total = groups.reduce((sum, group) => sum + group.population, 0);
  if (total <= 0) return;
  for (const group of groups) {
    const moved = Math.min(group.population, Math.round(amount * group.population / total));
    if (moved <= 0) continue;
    state.populationGroups[group.id] = { ...group, population: group.population - moved, migrationDesire: clamp(group.migrationDesire - 12) };
    const destinationId = `population_${destination.id}_${group.socialClass}`;
    const existing = state.populationGroups[destinationId];
    const next: PopulationGroupState = existing ? {
      ...existing,
      population: existing.population + moved,
      health: Math.round((existing.health * existing.population + group.health * moved) / Math.max(1, existing.population + moved)),
      loyalty: clamp(existing.loyalty - 1),
      migrationDesire: clamp(existing.migrationDesire + 2)
    } : {
      ...group,
      id: destinationId,
      settlementId: destination.id,
      socialClass: group.socialClass === 'elite' ? 'specialists' : group.socialClass,
      population: moved,
      loyalty: clamp(group.loyalty - 4),
      migrationDesire: clamp(group.migrationDesire - 8)
    };
    state.populationGroups[destinationId] = next;
  }
}

function scheduleForNewColony(settlementId: string, routeId: string | undefined, civilizationId: string, atHour: number, seed: string): ScheduledWorldEvent[] {
  const events: ScheduledWorldEvent[] = [{
    id: `settlement-cycle:${settlementId}`,
    kind: 'settlement-cycle',
    entityId: settlementId,
    dueHour: atHour + 30 * 24,
    repeatHours: 30 * 24,
    seedKey: `${seed}:settlement-cycle:${settlementId}`
  }];
  if (routeId) events.push({
    id: `trade-cycle:${routeId}`,
    kind: 'trade-cycle',
    entityId: routeId,
    dueHour: atHour + 14 * 24,
    repeatHours: 20 * 24,
    seedKey: `${seed}:trade-cycle:${routeId}`
  });
  if (!events.some((entry) => entry.id === `migration-cycle:${civilizationId}`)) events.push({
    id: `migration-cycle:${civilizationId}`,
    kind: 'migration-cycle',
    entityId: civilizationId,
    dueHour: atHour + 180 * 24,
    repeatHours: 180 * 24,
    seedKey: `${seed}:migration-cycle:${civilizationId}`
  });
  return events;
}

export interface MigrationCycleResult {
  event: WorldEventDraft | null;
  scheduledEvents: ScheduledWorldEvent[];
}

export function simulateMigrationCycle(
  state: SimulationState,
  civilizationId: string,
  context: SimulationContext,
  atHour: number
): MigrationCycleResult {
  const civilization = context.galaxy.civilizations.find((entry) => entry.id === civilizationId);
  const civilizationState = state.civilizations[civilizationId];
  if (!civilization || !civilizationState?.alive) return { event: null, scheduledEvents: [] };
  const settlements = Object.values(state.settlements).filter((entry) => entry.civilizationId === civilizationId && !entry.abandoned);
  if (!settlements.length) return { event: null, scheduledEvents: [] };
  const rng = createRng(`${context.seed}:migration:${civilizationId}:${atHour}`);
  const origin = [...settlements].sort((a, b) => settlementPressure(b) - settlementPressure(a))[0]!;
  const destinations = settlements.filter((entry) => entry.id !== origin.id).sort((a, b) => destinationScore(b) - destinationScore(a));
  const destination = destinations[0];
  const pressure = settlementPressure(origin);

  if (destination && pressure >= 48 && destinationScore(destination) >= destinationScore(origin) + 8) {
    const amount = Math.max(50, Math.min(Math.round(origin.population * 0.035), Math.round(destination.population * 0.12 + 5_000)));
    state.settlements[origin.id] = { ...origin, population: Math.max(0, origin.population - amount), unrest: clamp(origin.unrest - 4), housing: clamp(origin.housing + 2), lastUpdatedHour: atHour };
    state.settlements[destination.id] = { ...destination, population: destination.population + amount, housing: clamp(destination.housing - 3), unrest: clamp(destination.unrest + 2), lastUpdatedHour: atHour };
    movePopulationGroups(state, origin, destination, amount);
    recomputeSystemFromSettlements(state, origin.systemId, atHour);
    recomputeSystemFromSettlements(state, destination.systemId, atHour);
    return {
      scheduledEvents: [],
      event: {
        kind: 'migration',
        title: `${civilization.name}: переселение между колониями`,
        summary: `${amount.toLocaleString('ru-RU')} жителей покинули ${origin.name} и направились в ${destination.name}.`,
        severity: pressure >= 75 ? 6 : 4,
        visibility: pressure >= 75 ? 'public' : 'local',
        systemIds: Array.from(new Set([origin.systemId, destination.systemId])),
        civilizationIds: [civilizationId],
        factionIds: Array.from(new Set([origin.ownerFactionId, destination.ownerFactionId].filter((id): id is string => Boolean(id)))),
        tags: ['simulation', 'migration', 'settlement'],
        data: { originSettlementId: origin.id, destinationSettlementId: destination.id, population: amount }
      }
    };
  }

  const occupiedSystems = new Set(settlements.map((entry) => entry.systemId));
  const sourceSystem = context.galaxy.systems.find((entry) => entry.id === origin.systemId);
  const candidateIds = Array.from(new Set([
    ...(sourceSystem?.neighbors ?? []),
    ...civilization.controlledSystems
  ]));
  const candidates = candidateIds
    .map((id) => context.galaxy.systems.find((entry) => entry.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined && !occupiedSystems.has(entry.id))
    .filter((entry) => entry.danger !== 'extreme')
    .sort((a, b) => {
      const aHabitability = Math.max(0, ...a.planets.map((planet) => planet.habitability));
      const bHabitability = Math.max(0, ...b.planets.map((planet) => planet.habitability));
      return bHabitability - aHabitability;
    });

  if (civilizationState.expansionPressure >= 68 && origin.population >= 25_000 && candidates.length && rng.chance(0.42)) {
    const target = candidates[0]!;
    const created = createFrontierColony({
      civilizationId,
      source: origin,
      targetSystem: target,
      context,
      ecosystems: state.ecosystems,
      absoluteHour: atHour
    });
    const colonists = created.settlement.population;
    state.settlements[origin.id] = { ...origin, population: Math.max(0, origin.population - colonists), lastUpdatedHour: atHour };
    state.settlements[created.settlement.id] = created.settlement;
    for (const group of created.groups) state.populationGroups[group.id] = group;
    if (created.route) state.tradeRoutes[created.route.id] = created.route;
    recomputeSystemFromSettlements(state, origin.systemId, atHour);
    recomputeSystemFromSettlements(state, target.id, atHour);
    state.civilizations[civilizationId] = {
      ...civilizationState,
      expansionPressure: clamp(civilizationState.expansionPressure - 18),
      population: civilizationState.population,
      lastUpdatedHour: atHour
    };
    return {
      scheduledEvents: scheduleForNewColony(created.settlement.id, created.route?.id, civilizationId, atHour, context.seed),
      event: {
        kind: 'migration',
        title: `${civilization.name}: основана новая колония`,
        summary: `${created.settlement.name} появился в системе ${target.name}. Первое население: ${colonists.toLocaleString('ru-RU')}.`,
        severity: 8,
        visibility: 'public',
        systemIds: [origin.systemId, target.id],
        civilizationIds: [civilizationId],
        factionIds: created.settlement.ownerFactionId ? [created.settlement.ownerFactionId] : [],
        tags: ['simulation', 'migration', 'colony-founded'],
        data: { settlementId: created.settlement.id, sourceSettlementId: origin.id, population: colonists }
      }
    };
  }

  return { event: null, scheduledEvents: [] };
}
