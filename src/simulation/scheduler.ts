import { HOURS_PER_DAY } from './clock';
import type { SimulationContext } from './context';
import type { ScheduledWorldEvent } from './types';

const cycleId = (kind: ScheduledWorldEvent['kind'], entityId: string) => `${kind}:${entityId}`;

export function initialScheduledEvents(params: {
  context: SimulationContext;
  ecologyPlanetIds: string[];
  settlementIds: string[];
  tradeRouteIds: string[];
  civilizationIds: string[];
  absoluteHour: number;
}): ScheduledWorldEvent[] {
  const { context, ecologyPlanetIds, settlementIds, tradeRouteIds, civilizationIds, absoluteHour } = params;
  const scheduled: ScheduledWorldEvent[] = [];
  const add = (entry: ScheduledWorldEvent) => scheduled.push({ ...entry, dueHour: entry.dueHour + absoluteHour });

  for (const civilization of context.galaxy.civilizations.filter((entry) => entry.status === 'living')) {
    add({
      id: cycleId('civilization-cycle', civilization.id), kind: 'civilization-cycle', entityId: civilization.id,
      dueHour: (18 + scheduled.length * 3) * HOURS_PER_DAY, repeatHours: 90 * HOURS_PER_DAY,
      seedKey: `${context.seed}:civilization-cycle:${civilization.id}`
    });
  }
  for (const faction of context.factions) {
    add({
      id: cycleId('faction-cycle', faction.id), kind: 'faction-cycle', entityId: faction.id,
      dueHour: (10 + scheduled.length * 2) * HOURS_PER_DAY, repeatHours: 60 * HOURS_PER_DAY,
      seedKey: `${context.seed}:faction-cycle:${faction.id}`
    });
  }
  const importantSystems = new Set<string>([
    ...context.hubs.map((hub) => hub.systemId),
    ...context.galaxy.civilizations.filter((entry) => entry.status === 'living').map((entry) => entry.homeSystemId)
  ]);
  for (const systemId of importantSystems) {
    add({
      id: cycleId('system-cycle', systemId), kind: 'system-cycle', entityId: systemId,
      dueHour: (7 + scheduled.length) * HOURS_PER_DAY, repeatHours: 30 * HOURS_PER_DAY,
      seedKey: `${context.seed}:system-cycle:${systemId}`
    });
  }
  for (const planetId of ecologyPlanetIds) {
    const planetIndex = context.galaxy.systems.flatMap((system) => system.planets).findIndex((planet) => planet.id === planetId);
    add({
      id: cycleId('ecology-cycle', planetId), kind: 'ecology-cycle', entityId: planetId,
      dueHour: (30 + Math.max(0, planetIndex % 120)) * HOURS_PER_DAY, repeatHours: 360 * HOURS_PER_DAY,
      seedKey: `${context.seed}:ecology-cycle:${planetId}`
    });
  }
  settlementIds.forEach((settlementId, index) => add({
    id: cycleId('settlement-cycle', settlementId), kind: 'settlement-cycle', entityId: settlementId,
    dueHour: (12 + index % 25) * HOURS_PER_DAY, repeatHours: 30 * HOURS_PER_DAY,
    seedKey: `${context.seed}:settlement-cycle:${settlementId}`
  }));
  tradeRouteIds.forEach((routeId, index) => add({
    id: cycleId('trade-cycle', routeId), kind: 'trade-cycle', entityId: routeId,
    dueHour: (8 + index % 17) * HOURS_PER_DAY, repeatHours: 20 * HOURS_PER_DAY,
    seedKey: `${context.seed}:trade-cycle:${routeId}`
  }));
  civilizationIds.forEach((civilizationId, index) => add({
    id: cycleId('migration-cycle', civilizationId), kind: 'migration-cycle', entityId: civilizationId,
    dueHour: (90 + index * 7) * HOURS_PER_DAY, repeatHours: 180 * HOURS_PER_DAY,
    seedKey: `${context.seed}:migration-cycle:${civilizationId}`
  }));

  return scheduled.sort((a, b) => a.dueHour - b.dueHour);
}

export function missingSettlementSchedule(params: {
  context: SimulationContext;
  settlementIds: string[];
  tradeRouteIds: string[];
  civilizationIds: string[];
  existing: ScheduledWorldEvent[];
  absoluteHour: number;
}): ScheduledWorldEvent[] {
  const existingIds = new Set(params.existing.map((event) => event.id));
  const generated = initialScheduledEvents({
    context: params.context,
    ecologyPlanetIds: [],
    settlementIds: params.settlementIds,
    tradeRouteIds: params.tradeRouteIds,
    civilizationIds: params.civilizationIds,
    absoluteHour: params.absoluteHour
  });
  return generated.filter((event) => ['settlement-cycle', 'trade-cycle', 'migration-cycle'].includes(event.kind) && !existingIds.has(event.id));
}
