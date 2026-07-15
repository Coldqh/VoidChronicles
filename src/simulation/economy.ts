import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import type {
  PopulationGroupState,
  SettlementResource,
  SettlementState,
  SimulationState,
  WorldEventDraft
} from './types';

const RESOURCES: SettlementResource[] = ['food', 'water', 'energy', 'medicine', 'parts', 'weapons', 'luxury', 'rareMaterials'];
const VITAL: SettlementResource[] = ['food', 'water', 'energy', 'medicine'];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function shortageDays(settlement: SettlementState, resource: SettlementResource): number {
  const daily = Math.max(0.01, settlement.consumption[resource]);
  return settlement.stocks[resource] / daily;
}

export function settlementShortages(settlement: SettlementState): SettlementResource[] {
  return VITAL.filter((resource) => shortageDays(settlement, resource) < 20);
}

function updatePopulationGroups(state: SimulationState, settlement: SettlementState, populationDelta: number): void {
  const groups = Object.values(state.populationGroups).filter((group) => group.settlementId === settlement.id);
  const total = groups.reduce((sum, group) => sum + group.population, 0);
  for (const group of groups) {
    const share = total > 0 ? group.population / total : 1 / Math.max(1, groups.length);
    const shortages = settlementShortages(settlement).length;
    const next: PopulationGroupState = {
      ...group,
      population: Math.max(0, Math.round(group.population + populationDelta * share)),
      health: clamp(group.health + (settlement.health - group.health) * 0.12 - shortages * 2),
      loyalty: clamp(group.loyalty + (settlement.security - settlement.unrest - group.loyalty) * 0.05),
      radicalization: clamp(group.radicalization + settlement.unrest / 20 + (shortages ? 3 : -2)),
      migrationDesire: clamp(group.migrationDesire + settlement.unrest / 16 + shortages * 6 + (settlement.housing < 35 ? 8 : -3))
    };
    state.populationGroups[group.id] = next;
  }
}

export function recomputeSystemFromSettlements(state: SimulationState, systemId: string, atHour: number): void {
  const current = state.systems[systemId];
  if (!current) return;
  const settlements = Object.values(state.settlements).filter((entry) => entry.systemId === systemId && !entry.abandoned);
  if (!settlements.length) {
    state.systems[systemId] = { ...current, population: 0, supply: Math.max(0, current.supply - 2), prosperity: Math.max(0, current.prosperity - 1), lastUpdatedHour: atHour };
    return;
  }
  const population = settlements.reduce((sum, entry) => sum + entry.population, 0);
  const weighted = (selector: (settlement: SettlementState) => number) => settlements.reduce((sum, entry) => sum + selector(entry) * entry.population, 0) / Math.max(1, population);
  const stockCoverage = weighted((entry) => VITAL.reduce((sum, resource) => sum + Math.min(100, shortageDays(entry, resource) * 2), 0) / VITAL.length);
  const security = weighted((entry) => entry.security);
  const unrest = weighted((entry) => entry.unrest);
  const infrastructure = weighted((entry) => entry.infrastructure);
  state.systems[systemId] = {
    ...current,
    population: Math.round(population),
    supply: clamp(stockCoverage),
    prosperity: clamp(infrastructure * 0.55 + stockCoverage * 0.35 - unrest * 0.2),
    security: clamp(security),
    tradePressure: clamp(100 - stockCoverage + settlements.length * 3),
    migrationPressure: clamp(unrest + Math.max(0, 55 - stockCoverage)),
    lastUpdatedHour: atHour
  };
}

export interface SettlementCycleResult {
  event: WorldEventDraft | null;
  abandoned: boolean;
}

export function simulateSettlementCycle(
  state: SimulationState,
  settlementId: string,
  context: SimulationContext,
  atHour: number
): SettlementCycleResult {
  const settlement = state.settlements[settlementId];
  if (!settlement || settlement.abandoned) return { event: null, abandoned: Boolean(settlement?.abandoned) };
  const rng = createRng(`${context.seed}:settlement-cycle:${settlementId}:${atHour}`);
  const elapsedDays = Math.max(1, Math.min(90, Math.round((atHour - settlement.lastUpdatedHour) / 24) || 30));
  const stocks = { ...settlement.stocks };
  for (const resource of RESOURCES) {
    const produced = settlement.production[resource] * elapsedDays * (0.65 + settlement.infrastructure / 180);
    const consumed = settlement.consumption[resource] * elapsedDays * (0.85 + settlement.population / Math.max(1, settlement.population + 500_000));
    stocks[resource] = Math.max(0, Math.min(5_000_000, stocks[resource] + produced - consumed));
  }

  const projected: SettlementState = { ...settlement, stocks };
  const shortages = settlementShortages(projected);
  const critical = shortages.filter((resource) => shortageDays(projected, resource) < 7);
  const healthDelta = critical.length ? -rng.int(4, 10) : shortages.length ? -rng.int(1, 4) : rng.int(0, 3);
  const unrestDelta = critical.length ? rng.int(8, 16) : shortages.length ? rng.int(2, 8) : rng.int(-4, 2);
  const infrastructureDelta = stocks.parts < settlement.consumption.parts * 20 ? -rng.int(1, 4) : rng.int(0, 2);
  const growthRate = critical.length ? -0.006 - critical.length * 0.002 : shortages.length ? -0.0015 : 0.001 + clamp(settlement.housing - 45, 0, 40) / 40_000;
  const populationDelta = Math.round(settlement.population * growthRate);
  const population = Math.max(0, settlement.population + populationDelta);
  const abandoned = population < 50 || (critical.length >= 3 && settlement.health <= 10);

  const next: SettlementState = {
    ...settlement,
    kind: abandoned ? 'abandoned' : settlement.kind,
    population,
    stocks,
    health: clamp(settlement.health + healthDelta),
    unrest: clamp(settlement.unrest + unrestDelta),
    security: clamp(settlement.security + (settlement.unrest > 70 ? -rng.int(2, 7) : rng.int(-1, 2))),
    infrastructure: clamp(settlement.infrastructure + infrastructureDelta),
    housing: clamp(settlement.housing + (populationDelta > 0 ? -1 : populationDelta < 0 ? 1 : 0)),
    abandoned,
    lastUpdatedHour: atHour
  };
  state.settlements[settlementId] = next;
  updatePopulationGroups(state, next, populationDelta);
  recomputeSystemFromSettlements(state, next.systemId, atHour);

  const civilization = next.civilizationId ? context.galaxy.civilizations.find((entry) => entry.id === next.civilizationId) : undefined;
  const factionIds = next.ownerFactionId ? [next.ownerFactionId] : [];
  if (abandoned) {
    return {
      abandoned: true,
      event: {
        kind: 'disaster',
        title: `${next.name}: поселение покинуто`,
        summary: `Население исчезло после цепочки дефицитов и разрушения инфраструктуры. Узел остался без постоянной администрации.`,
        severity: 9,
        visibility: 'public',
        systemIds: [next.systemId],
        civilizationIds: next.civilizationId ? [next.civilizationId] : [],
        factionIds,
        tags: ['simulation', 'settlement', 'abandoned'],
        data: { settlementId: next.id, populationDelta, shortages: shortages.join(',') }
      }
    };
  }
  if (critical.length) {
    return {
      abandoned: false,
      event: {
        kind: 'shortage',
        title: `${next.name}: критический дефицит`,
        summary: `Запасов ${critical.join(', ')} осталось меньше чем на неделю. Здоровье ${next.health}/100, беспорядки ${next.unrest}/100.`,
        severity: 7 + Math.min(2, critical.length),
        visibility: 'local',
        systemIds: [next.systemId],
        civilizationIds: next.civilizationId ? [next.civilizationId] : [],
        factionIds,
        tags: ['simulation', 'settlement', 'shortage'],
        data: { settlementId: next.id, civilization: civilization?.name ?? '', populationDelta, critical: critical.join(',') }
      }
    };
  }
  if (next.unrest >= 78 && settlement.unrest < 78) {
    return {
      abandoned: false,
      event: {
        kind: 'politics',
        title: `${next.name}: массовые беспорядки`,
        summary: `Недовольство населения перешло в открытые протесты. Безопасность ${next.security}/100.`,
        severity: 7,
        visibility: 'public',
        systemIds: [next.systemId],
        civilizationIds: next.civilizationId ? [next.civilizationId] : [],
        factionIds,
        tags: ['simulation', 'settlement', 'unrest'],
        data: { settlementId: next.id, unrest: next.unrest }
      }
    };
  }
  if (Math.abs(populationDelta) >= Math.max(5_000, settlement.population * 0.01)) {
    return {
      abandoned: false,
      event: {
        kind: 'demography',
        title: `${next.name}: демографический сдвиг`,
        summary: `Население изменилось на ${populationDelta.toLocaleString('ru-RU')}. Текущее население: ${next.population.toLocaleString('ru-RU')}.`,
        severity: 4,
        visibility: 'local',
        systemIds: [next.systemId],
        civilizationIds: next.civilizationId ? [next.civilizationId] : [],
        factionIds,
        tags: ['simulation', 'settlement', 'population'],
        data: { settlementId: next.id, populationDelta }
      }
    };
  }
  return { event: null, abandoned: false };
}
