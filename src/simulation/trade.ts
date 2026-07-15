import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import { recomputeSystemFromSettlements } from './economy';
import type { SettlementResource, SimulationState, WorldEventDraft } from './types';

const VITAL: SettlementResource[] = ['food', 'water', 'energy', 'medicine'];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function reserve(settlement: SimulationState['settlements'][string], resource: SettlementResource): number {
  return settlement.consumption[resource] * 45;
}

export interface TradeCycleResult {
  event: WorldEventDraft | null;
  moved: number;
}

export function simulateTradeRouteCycle(
  state: SimulationState,
  routeId: string,
  context: SimulationContext,
  atHour: number
): TradeCycleResult {
  const route = state.tradeRoutes[routeId];
  const origin = route ? state.settlements[route.originSettlementId] : undefined;
  const destination = route ? state.settlements[route.destinationSettlementId] : undefined;
  if (!route || !origin || !destination || origin.abandoned || destination.abandoned) {
    if (route) state.tradeRoutes[routeId] = { ...route, disrupted: true, traffic: 0, lastUpdatedHour: atHour };
    return { event: null, moved: 0 };
  }

  const rng = createRng(`${context.seed}:trade-cycle:${route.id}:${atHour}`);
  const systemSecurity = route.pathSystemIds.reduce((sum, id) => sum + (state.systems[id]?.security ?? 35), 0) / Math.max(1, route.pathSystemIds.length);
  const disruptionChance = clamp(route.danger + (50 - systemSecurity) * 0.7, 2, 88) / 100;
  const disrupted = rng.chance(disruptionChance * 0.22);
  let moved = 0;
  const originStocks = { ...origin.stocks };
  const destinationStocks = { ...destination.stocks };

  if (!disrupted) {
    for (const resource of route.cargo) {
      const available = Math.max(0, originStocks[resource] - reserve(origin, resource));
      const need = Math.max(0, reserve(destination, resource) * 1.7 - destinationStocks[resource]);
      const amount = Math.min(route.capacity / Math.max(1, route.cargo.length), available, need);
      if (amount <= 0) continue;
      originStocks[resource] -= amount;
      destinationStocks[resource] += amount;
      moved += amount;
    }
  }

  state.settlements[origin.id] = { ...origin, stocks: originStocks, lastUpdatedHour: Math.max(origin.lastUpdatedHour, atHour) };
  state.settlements[destination.id] = { ...destination, stocks: destinationStocks, lastUpdatedHour: Math.max(destination.lastUpdatedHour, atHour) };
  state.tradeRoutes[route.id] = {
    ...route,
    traffic: clamp(route.traffic + (disrupted ? -rng.int(8, 18) : moved > 0 ? rng.int(1, 6) : -2)),
    danger: clamp(route.danger + (disrupted ? rng.int(4, 11) : rng.int(-2, 1))),
    disrupted,
    lastUpdatedHour: atHour
  };
  recomputeSystemFromSettlements(state, origin.systemId, atHour);
  recomputeSystemFromSettlements(state, destination.systemId, atHour);

  const civilizationIds = Array.from(new Set([origin.civilizationId, destination.civilizationId].filter((id): id is string => Boolean(id))));
  const factionIds = Array.from(new Set([origin.ownerFactionId, destination.ownerFactionId].filter((id): id is string => Boolean(id))));
  if (disrupted) {
    return {
      moved,
      event: {
        kind: 'conflict',
        title: `Маршрут ${origin.name} — ${destination.name} нарушен`,
        summary: `Конвой не дошёл до назначения. Опасность маршрута выросла до ${state.tradeRoutes[route.id]!.danger}/100.`,
        severity: 6,
        visibility: 'local',
        systemIds: route.pathSystemIds,
        civilizationIds,
        factionIds,
        tags: ['simulation', 'trade', 'disrupted'],
        data: { routeId: route.id, originSettlementId: origin.id, destinationSettlementId: destination.id }
      }
    };
  }

  const destinationCritical = VITAL.filter((resource) => destinationStocks[resource] < destination.consumption[resource] * 12);
  if (moved >= route.capacity * 0.7 || destinationCritical.length) {
    return {
      moved,
      event: {
        kind: destinationCritical.length ? 'shortage' : 'economy',
        title: destinationCritical.length ? `${destination.name}: поставка не закрыла дефицит` : `${destination.name}: крупная поставка`,
        summary: destinationCritical.length
          ? `После доставки сохраняется нехватка: ${destinationCritical.join(', ')}.`
          : `По маршруту доставлено ${Math.round(moved).toLocaleString('ru-RU')} единиц груза.`,
        severity: destinationCritical.length ? 5 : 3,
        visibility: 'local',
        systemIds: route.pathSystemIds,
        civilizationIds,
        factionIds,
        tags: ['simulation', 'trade'],
        data: { routeId: route.id, moved: Math.round(moved) }
      }
    };
  }
  return { event: null, moved };
}
