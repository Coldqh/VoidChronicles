import type { Civilization } from '../game/types';
import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import type {
  PopulationGroupState,
  SettlementResource,
  SettlementState,
  SimulationState,
  WorldEvent,
  WorldEventDraft
} from './types';

const HOURS_PER_YEAR = 365 * 24;
const STATE_TAG = 'living-economy-state';
const SEPARATOR = '|';

export type IndustrySector =
  | 'agriculture'
  | 'utilities'
  | 'energy'
  | 'extraction'
  | 'manufacturing'
  | 'medicine'
  | 'armaments'
  | 'consumer'
  | 'advanced';

export interface IndustrySectorState {
  sector: IndustrySector;
  output: number;
  capacity: number;
  employment: number;
  productivity: number;
  inputPressure: number;
}

export interface LiveEconomyState {
  civilizationId: string;
  grossProduct: number;
  growth: number;
  employment: number;
  unemployment: number;
  inequality: number;
  importDependence: number;
  consumerSupply: number;
  industrialCapacity: number;
  treasuryFlow: number;
  sectors: IndustrySectorState[];
  lastUpdatedHour: number;
}

const SECTOR_LABELS: Record<IndustrySector, string> = {
  agriculture: 'сельское хозяйство',
  utilities: 'водоснабжение',
  energy: 'энергетика',
  extraction: 'добыча',
  manufacturing: 'промышленность',
  medicine: 'медицина',
  armaments: 'военное производство',
  consumer: 'потребительский сектор',
  advanced: 'высокие технологии'
};

const RESOURCE_SECTOR: Record<SettlementResource, IndustrySector> = {
  food: 'agriculture',
  water: 'utilities',
  energy: 'energy',
  medicine: 'medicine',
  parts: 'manufacturing',
  weapons: 'armaments',
  luxury: 'consumer',
  rareMaterials: 'extraction'
};

const SECTOR_RESOURCES: Record<IndustrySector, SettlementResource[]> = {
  agriculture: ['food', 'water', 'energy'],
  utilities: ['water', 'energy', 'parts'],
  energy: ['energy', 'parts', 'rareMaterials'],
  extraction: ['rareMaterials', 'energy', 'parts'],
  manufacturing: ['parts', 'energy', 'rareMaterials'],
  medicine: ['medicine', 'food', 'energy'],
  armaments: ['weapons', 'parts', 'energy'],
  consumer: ['luxury', 'food', 'energy'],
  advanced: ['rareMaterials', 'parts', 'energy', 'medicine']
};

const RESOURCES = Object.keys(RESOURCE_SECTOR) as SettlementResource[];
const VITAL: SettlementResource[] = ['food', 'water', 'energy', 'medicine'];

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function encodeSectors(sectors: IndustrySectorState[]): string {
  return sectors
    .map((entry) => [
      entry.sector,
      Math.round(entry.output * 100) / 100,
      Math.round(entry.capacity * 100) / 100,
      Math.round(entry.employment * 100) / 100,
      Math.round(entry.productivity * 100) / 100,
      Math.round(entry.inputPressure * 100) / 100
    ].join(','))
    .join(SEPARATOR);
}

function decodeSectors(value: unknown): IndustrySectorState[] {
  if (typeof value !== 'string' || !value) return [];
  return value.split(SEPARATOR).map((chunk) => {
    const [sector, output, capacity, employment, productivity, inputPressure] = chunk.split(',');
    return {
      sector: sector as IndustrySector,
      output: numberValue(Number(output), 0),
      capacity: numberValue(Number(capacity), 0),
      employment: numberValue(Number(employment), 0),
      productivity: numberValue(Number(productivity), 0),
      inputPressure: numberValue(Number(inputPressure), 0)
    };
  }).filter((entry) => entry.sector in SECTOR_LABELS);
}

function groupsForCivilization(
  state: SimulationState,
  civilizationId: string
): PopulationGroupState[] {
  return Object.values(state.populationGroups).filter(
    (group) => group.civilizationId === civilizationId
  );
}

function settlementsForCivilization(
  state: SimulationState,
  civilizationId: string
): SettlementState[] {
  return Object.values(state.settlements).filter(
    (settlement) => settlement.civilizationId === civilizationId && !settlement.abandoned
  );
}

function stockDays(settlement: SettlementState, resource: SettlementResource): number {
  return settlement.stocks[resource] / Math.max(0.01, settlement.consumption[resource]);
}

function inequalityFor(groups: PopulationGroupState[]): number {
  if (!groups.length) return 25;
  const totalPopulation = groups.reduce((sum, group) => sum + group.population, 0);
  if (totalPopulation <= 0) return 25;
  const mean = groups.reduce((sum, group) => sum + group.wealth * group.population, 0) / totalPopulation;
  if (mean <= 0) return 0;
  const deviation = groups.reduce(
    (sum, group) => sum + Math.abs(group.wealth - mean) * group.population,
    0
  ) / totalPopulation;
  const elitePremium = groups
    .filter((group) => group.socialClass === 'elite')
    .reduce((sum, group) => sum + group.population, 0) / totalPopulation;
  return clamp(deviation / mean * 70 + elitePremium * 30);
}

function baseSectorCapacity(
  sector: IndustrySector,
  settlements: SettlementState[],
  civilization: Civilization
): number {
  const resourceOutput = settlements.reduce((sum, settlement) => {
    const output = SECTOR_RESOURCES[sector]
      .map((resource) => settlement.production[resource])
      .reduce((resourceSum, value) => resourceSum + value, 0);
    return sum + output;
  }, 0);
  const infrastructure = settlements.length
    ? settlements.reduce((sum, settlement) => sum + settlement.infrastructure, 0) / settlements.length
    : 0;
  const tech = civilization.development?.technology;
  const technologyBonus = sector === 'agriculture'
    ? tech?.agriculture ?? civilization.techLevel * 10
    : sector === 'medicine'
      ? tech?.medicine ?? civilization.techLevel * 10
      : sector === 'energy'
        ? tech?.energy ?? civilization.techLevel * 10
        : sector === 'advanced'
          ? ((tech?.computing ?? 0) + (tech?.biology ?? 0) + (tech?.spaceflight ?? 0)) / 3
          : tech?.industry ?? civilization.techLevel * 10;
  return clamp(Math.log10(Math.max(1, resourceOutput + 1)) * 18 + infrastructure * 0.45 + technologyBonus * 0.25);
}

function inputPressureFor(
  sector: IndustrySector,
  settlements: SettlementState[]
): number {
  if (!settlements.length) return 100;
  const resources = SECTOR_RESOURCES[sector];
  const values = settlements.flatMap((settlement) =>
    resources.map((resource) => stockDays(settlement, resource))
  );
  const averageDays = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return clamp(100 - averageDays * 1.25);
}

function workforceShare(groups: PopulationGroupState[], sector: IndustrySector): number {
  const relevant = groups.filter((group) => {
    const profession = group.profession.toLowerCase();
    if (sector === 'agriculture') return profession.includes('сель') || profession.includes('производ');
    if (sector === 'extraction') return profession.includes('добы') || profession.includes('переработ');
    if (sector === 'medicine') return profession.includes('медицин');
    if (sector === 'armaments') return profession.includes('воен') || group.socialClass === 'security';
    if (sector === 'advanced') return profession.includes('исслед') || profession.includes('инжен');
    if (sector === 'manufacturing') return profession.includes('производ') || profession.includes('инжен');
    return group.socialClass === 'workers' || group.socialClass === 'specialists';
  });
  const total = groups.reduce((sum, group) => sum + group.population, 0);
  return total > 0
    ? relevant.reduce((sum, group) => sum + group.population, 0) / total
    : 0.5;
}

function deriveEconomy(
  state: SimulationState,
  civilization: Civilization,
  previous?: LiveEconomyState
): LiveEconomyState {
  const settlements = settlementsForCivilization(state, civilization.id);
  const groups = groupsForCivilization(state, civilization.id);
  const sectors = (Object.keys(SECTOR_LABELS) as IndustrySector[]).map((sector) => {
    const capacity = baseSectorCapacity(sector, settlements, civilization);
    const inputPressure = inputPressureFor(sector, settlements);
    const employment = clamp(workforceShare(groups, sector) * 180);
    const productivity = clamp(
      capacity * 0.5 +
      (100 - inputPressure) * 0.25 +
      employment * 0.15 +
      (state.civilizations[civilization.id]?.research ?? 35) * 0.1
    );
    const output = clamp(capacity * (0.45 + productivity / 180) * (1 - inputPressure / 170));
    return { sector, output, capacity, employment, productivity, inputPressure };
  });
  const grossProduct = clamp(
    sectors.reduce((sum, sector) => sum + sector.output, 0) / Math.max(1, sectors.length)
  );
  const totalPopulation = groups.reduce((sum, group) => sum + group.population, 0);
  const employablePopulation = groups
    .filter((group) => group.socialClass !== 'migrants')
    .reduce((sum, group) => sum + group.population, 0);
  const laborDemand = totalPopulation * clamp(
    sectors.reduce((sum, sector) => sum + sector.employment, 0) / Math.max(1, sectors.length),
    20,
    95
  ) / 100;
  const employment = employablePopulation > 0
    ? clamp(laborDemand / employablePopulation * 100)
    : 65;
  const imports = RESOURCES.reduce((sum, resource) => {
    const production = settlements.reduce((value, settlement) => value + settlement.production[resource], 0);
    const consumption = settlements.reduce((value, settlement) => value + settlement.consumption[resource], 0);
    return sum + Math.max(0, consumption - production) / Math.max(0.1, consumption);
  }, 0);
  const importDependence = clamp(imports / RESOURCES.length * 100);
  const consumerSupply = clamp(
    sectors.find((sector) => sector.sector === 'consumer')?.output ?? 0,
    0,
    100
  );
  const industrialCapacity = clamp(
    ['energy', 'extraction', 'manufacturing', 'advanced']
      .map((sector) => sectors.find((entry) => entry.sector === sector)?.capacity ?? 0)
      .reduce((sum, value) => sum + value, 0) / 4
  );
  const growth = previous
    ? clamp((grossProduct - previous.grossProduct) * 1.4, -100, 100)
    : 0;
  return {
    civilizationId: civilization.id,
    grossProduct,
    growth,
    employment,
    unemployment: clamp(100 - employment),
    inequality: inequalityFor(groups),
    importDependence,
    consumerSupply,
    industrialCapacity,
    treasuryFlow: clamp(grossProduct * 0.55 + industrialCapacity * 0.25 - importDependence * 0.2),
    sectors,
    lastUpdatedHour: state.clock.absoluteHour
  };
}

function economyFromEvent(event: WorldEvent): LiveEconomyState | undefined {
  const civilizationId = typeof event.data?.economyCivilizationId === 'string'
    ? event.data.economyCivilizationId
    : event.civilizationIds[0];
  if (!civilizationId) return undefined;
  return {
    civilizationId,
    grossProduct: numberValue(event.data?.grossProduct, 0),
    growth: numberValue(event.data?.economicGrowth, 0),
    employment: numberValue(event.data?.employment, 60),
    unemployment: numberValue(event.data?.unemployment, 40),
    inequality: numberValue(event.data?.inequality, 25),
    importDependence: numberValue(event.data?.importDependence, 0),
    consumerSupply: numberValue(event.data?.consumerSupply, 40),
    industrialCapacity: numberValue(event.data?.industrialCapacity, 30),
    treasuryFlow: numberValue(event.data?.treasuryFlow, 30),
    sectors: decodeSectors(event.data?.industrySectors),
    lastUpdatedHour: numberValue(event.data?.economyLastUpdatedHour, event.atHour)
  };
}

export function liveEconomies(
  state: SimulationState,
  context: SimulationContext
): LiveEconomyState[] {
  const byCivilization = new Map<string, LiveEconomyState>();
  for (const civilization of context.galaxy.civilizations) {
    byCivilization.set(civilization.id, deriveEconomy(state, civilization));
  }
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(STATE_TAG)) continue;
    const projected = economyFromEvent(event);
    if (projected) byCivilization.set(projected.civilizationId, projected);
  }
  return [...byCivilization.values()];
}

export function economyForCivilization(
  state: SimulationState,
  context: SimulationContext,
  civilizationId: string
): LiveEconomyState | undefined {
  return liveEconomies(state, context).find((entry) => entry.civilizationId === civilizationId);
}

export function industrySectorLabel(sector: IndustrySector): string {
  return SECTOR_LABELS[sector];
}

function writeEconomySnapshot(
  state: SimulationState,
  economy: LiveEconomyState,
  systemIds: string[],
  atHour: number
): void {
  const event: WorldEvent = {
    id: `state_economy_${economy.civilizationId}`,
    atHour,
    kind: 'economy',
    title: 'Состояние экономики',
    summary: 'Служебный снимок производственных цепочек и рынка труда.',
    severity: 0,
    visibility: 'hidden',
    systemIds,
    civilizationIds: [economy.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', STATE_TAG, 'state-snapshot'],
    data: {
      economyCivilizationId: economy.civilizationId,
      grossProduct: economy.grossProduct,
      economicGrowth: economy.growth,
      employment: economy.employment,
      unemployment: economy.unemployment,
      inequality: economy.inequality,
      importDependence: economy.importDependence,
      consumerSupply: economy.consumerSupply,
      industrialCapacity: economy.industrialCapacity,
      treasuryFlow: economy.treasuryFlow,
      industrySectors: encodeSectors(economy.sectors),
      economyLastUpdatedHour: atHour
    }
  };
  state.events = [
    event,
    ...state.events.filter(
      (entry) => !(entry.tags.includes(STATE_TAG) && entry.data?.economyCivilizationId === economy.civilizationId)
    )
  ].slice(0, 8_500);
}

function updateSettlementProduction(
  state: SimulationState,
  settlement: SettlementState,
  civilization: Civilization,
  economy: LiveEconomyState,
  atHour: number
): void {
  const groups = Object.values(state.populationGroups).filter(
    (group) => group.settlementId === settlement.id
  );
  const workerHealth = groups.length
    ? groups.reduce((sum, group) => sum + group.health * group.population, 0) /
      Math.max(1, groups.reduce((sum, group) => sum + group.population, 0))
    : settlement.health;
  const laborStability = clamp(100 - settlement.unrest * 0.75 + workerHealth * 0.25);
  const routeSupport = Object.values(state.tradeRoutes).filter(
    (route) =>
      route.originSettlementId === settlement.id || route.destinationSettlementId === settlement.id
  );
  const logistics = routeSupport.length
    ? clamp(routeSupport.reduce((sum, route) => sum + (route.disrupted ? 5 : route.traffic), 0) / routeSupport.length)
    : 35;
  const technology = civilization.development?.industrialization ?? civilization.techLevel * 10;

  const production = { ...settlement.production };
  for (const resource of RESOURCES) {
    const sector = economy.sectors.find((entry) => entry.sector === RESOURCE_SECTOR[resource]);
    const stockPressure = clamp(100 - stockDays(settlement, resource) * 1.1);
    const targetMultiplier = clamp(
      55 +
      settlement.infrastructure * 0.22 +
      laborStability * 0.14 +
      logistics * 0.08 +
      technology * 0.08 +
      (sector?.productivity ?? 45) * 0.12 -
      stockPressure * 0.18,
      35,
      145
    ) / 100;
    const target = Math.max(0.02, settlement.production[resource] * targetMultiplier);
    production[resource] = Math.max(
      0,
      settlement.production[resource] + (target - settlement.production[resource]) * 0.22
    );
  }

  state.settlements[settlement.id] = {
    ...settlement,
    production,
    infrastructure: clamp(
      settlement.infrastructure +
      (economy.growth > 5 ? 1 : economy.growth < -7 ? -1 : 0) -
      (economy.importDependence > 75 ? 1 : 0)
    ),
    lastUpdatedHour: atHour
  };
}

function recentPublicEvent(
  state: SimulationState,
  civilizationId: string,
  tag: string,
  atHour: number,
  years: number
): boolean {
  return state.events.some(
    (event) =>
      event.visibility !== 'hidden' &&
      event.civilizationIds.includes(civilizationId) &&
      event.tags.includes(tag) &&
      atHour - event.atHour < years * HOURS_PER_YEAR
  );
}

export function simulateEconomyCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const previous = liveEconomies(state, context).find(
    (entry) => entry.civilizationId === civilization.id
  );
  if (previous && atHour - previous.lastUpdatedHour < 60 * 24) return null;

  const settlements = settlementsForCivilization(state, civilization.id);
  if (!settlements.length) return null;
  const derived = deriveEconomy(state, civilization, previous);
  const economy: LiveEconomyState = { ...derived, lastUpdatedHour: atHour };
  for (const settlement of settlements) {
    updateSettlementProduction(state, settlement, civilization, economy, atHour);
  }

  const civilizationState = state.civilizations[civilization.id];
  if (civilizationState) {
    civilizationState.economy = clamp(
      civilizationState.economy + (economy.grossProduct - civilizationState.economy) * 0.2
    );
    civilizationState.research = clamp(
      civilizationState.research +
      (economy.sectors.find((sector) => sector.sector === 'advanced')?.output ?? 0) * 0.015 -
      economy.importDependence * 0.01
    );
    civilizationState.lastUpdatedHour = atHour;
  }
  const governmentFaction = context.factions.find(
    (faction) => faction.civilizationId === civilization.id && faction.kind === 'government'
  ) ?? context.factions.find((faction) => faction.civilizationId === civilization.id);
  const factionState = governmentFaction ? state.factions[governmentFaction.id] : undefined;
  if (factionState) {
    factionState.wealth = clamp(factionState.wealth + (economy.treasuryFlow - factionState.wealth) * 0.18);
    factionState.tension = clamp(
      factionState.tension + economy.unemployment * 0.08 + economy.inequality * 0.05 - economy.growth * 0.12
    );
    factionState.lastUpdatedHour = atHour;
  }

  writeEconomySnapshot(
    state,
    economy,
    [...new Set(settlements.map((settlement) => settlement.systemId))],
    atHour
  );

  const rng = createRng(`${context.seed}:economy:${civilization.id}:${Math.floor(atHour / HOURS_PER_YEAR)}`);
  const disruptedRoutes = Object.values(state.tradeRoutes).filter((route) => {
    const origin = state.settlements[route.originSettlementId];
    const destination = state.settlements[route.destinationSettlementId];
    return route.disrupted &&
      (origin?.civilizationId === civilization.id || destination?.civilizationId === civilization.id);
  }).length;
  const systems = [...new Set(settlements.map((settlement) => settlement.systemId))];

  if (
    economy.importDependence >= 68 &&
    disruptedRoutes > 0 &&
    !recentPublicEvent(state, civilization.id, 'industrial-blockade', atHour, 2)
  ) {
    return {
      kind: 'shortage',
      title: `${civilization.name}: разрыв производственных цепочек`,
      summary: `Импортозависимость достигла ${Math.round(economy.importDependence)}/100. Нарушено маршрутов: ${disruptedRoutes}; промышленность теряет сырьё и комплектующие.`,
      severity: 8,
      visibility: 'public',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: governmentFaction ? [governmentFaction.id] : [],
      tags: ['simulation', 'living-history', 'living-economy', 'industrial-blockade', 'supply-chain'],
      data: {
        grossProduct: economy.grossProduct,
        importDependence: economy.importDependence,
        disruptedRoutes,
        unemployment: economy.unemployment
      }
    };
  }

  if (
    (economy.growth <= -7 || economy.unemployment >= 28) &&
    !recentPublicEvent(state, civilization.id, 'economic-recession', atHour, 2)
  ) {
    return {
      kind: 'economy',
      title: `${civilization.name}: экономический спад`,
      summary: `Рост ${economy.growth.toFixed(1)}; безработица ${Math.round(economy.unemployment)}/100; неравенство ${Math.round(economy.inequality)}/100.`,
      severity: 7,
      visibility: 'local',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: governmentFaction ? [governmentFaction.id] : [],
      tags: ['simulation', 'living-history', 'living-economy', 'economic-recession'],
      data: {
        grossProduct: economy.grossProduct,
        economicGrowth: economy.growth,
        unemployment: economy.unemployment,
        inequality: economy.inequality
      }
    };
  }

  if (
    previous &&
    economy.growth >= 6 &&
    previous.growth < 6 &&
    economy.unemployment <= 12 &&
    rng.chance(0.7) &&
    !recentPublicEvent(state, civilization.id, 'industrial-boom', atHour, 3)
  ) {
    return {
      kind: 'economy',
      title: `${civilization.name}: промышленный подъём`,
      summary: `Производство выросло, безработица снизилась до ${Math.round(economy.unemployment)}/100. Индустриальная мощность ${Math.round(economy.industrialCapacity)}/100.`,
      severity: 5,
      visibility: 'public',
      systemIds: systems,
      civilizationIds: [civilization.id],
      factionIds: governmentFaction ? [governmentFaction.id] : [],
      tags: ['simulation', 'living-history', 'living-economy', 'industrial-boom'],
      data: {
        grossProduct: economy.grossProduct,
        economicGrowth: economy.growth,
        unemployment: economy.unemployment,
        industrialCapacity: economy.industrialCapacity
      }
    };
  }
  return null;
}


export function settlementShortages(settlement: SettlementState): SettlementResource[] {
  return VITAL.filter((resource) => stockDays(settlement, resource) < 20);
}

function updateSettlementCyclePopulationGroups(
  state: SimulationState,
  settlement: SettlementState,
  populationDelta: number
): void {
  const groups = Object.values(state.populationGroups).filter(
    (group) => group.settlementId === settlement.id
  );
  const total = groups.reduce((sum, group) => sum + group.population, 0);
  for (const group of groups) {
    const share = total > 0 ? group.population / total : 1 / Math.max(1, groups.length);
    const shortages = settlementShortages(settlement).length;
    state.populationGroups[group.id] = {
      ...group,
      population: Math.max(0, Math.round(group.population + populationDelta * share)),
      health: clamp(group.health + (settlement.health - group.health) * 0.12 - shortages * 2),
      loyalty: clamp(group.loyalty + (settlement.security - settlement.unrest - group.loyalty) * 0.05),
      radicalization: clamp(group.radicalization + settlement.unrest / 20 + (shortages ? 3 : -2)),
      migrationDesire: clamp(
        group.migrationDesire +
        settlement.unrest / 16 +
        shortages * 6 +
        (settlement.housing < 35 ? 8 : -3)
      )
    };
  }
}

export function recomputeSystemFromSettlements(
  state: SimulationState,
  systemId: string,
  atHour: number
): void {
  const current = state.systems[systemId];
  if (!current) return;
  const settlements = Object.values(state.settlements).filter(
    (entry) => entry.systemId === systemId && !entry.abandoned
  );
  if (!settlements.length) {
    state.systems[systemId] = {
      ...current,
      population: 0,
      supply: Math.max(0, current.supply - 2),
      prosperity: Math.max(0, current.prosperity - 1),
      lastUpdatedHour: atHour
    };
    return;
  }
  const population = settlements.reduce((sum, entry) => sum + entry.population, 0);
  const weighted = (selector: (settlement: SettlementState) => number): number =>
    settlements.reduce(
      (sum, entry) => sum + selector(entry) * entry.population,
      0
    ) / Math.max(1, population);
  const stockCoverage = weighted((entry) =>
    VITAL.reduce(
      (sum, resource) => sum + Math.min(100, stockDays(entry, resource) * 2),
      0
    ) / VITAL.length
  );
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
  if (!settlement || settlement.abandoned) {
    return { event: null, abandoned: Boolean(settlement?.abandoned) };
  }
  const rng = createRng(`${context.seed}:settlement-cycle:${settlementId}:${atHour}`);
  const elapsedDays = Math.max(
    1,
    Math.min(90, Math.round((atHour - settlement.lastUpdatedHour) / 24) || 30)
  );
  const stocks = { ...settlement.stocks };
  for (const resource of RESOURCES) {
    const produced =
      settlement.production[resource] *
      elapsedDays *
      (0.65 + settlement.infrastructure / 180);
    const consumed =
      settlement.consumption[resource] *
      elapsedDays *
      (0.85 + settlement.population / Math.max(1, settlement.population + 500_000));
    stocks[resource] = Math.max(
      0,
      Math.min(5_000_000, stocks[resource] + produced - consumed)
    );
  }

  const projected: SettlementState = { ...settlement, stocks };
  const shortages = settlementShortages(projected);
  const critical = shortages.filter((resource) => stockDays(projected, resource) < 7);
  const healthDelta = critical.length
    ? -rng.int(4, 10)
    : shortages.length
      ? -rng.int(1, 4)
      : rng.int(0, 3);
  const unrestDelta = critical.length
    ? rng.int(8, 16)
    : shortages.length
      ? rng.int(2, 8)
      : rng.int(-4, 2);
  const infrastructureDelta =
    stocks.parts < settlement.consumption.parts * 20 ? -rng.int(1, 4) : rng.int(0, 2);
  const growthRate = critical.length
    ? -0.006 - critical.length * 0.002
    : shortages.length
      ? -0.0015
      : 0.001 + clamp(settlement.housing - 45, 0, 40) / 40_000;
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
    security: clamp(
      settlement.security +
      (settlement.unrest > 70 ? -rng.int(2, 7) : rng.int(-1, 2))
    ),
    infrastructure: clamp(settlement.infrastructure + infrastructureDelta),
    housing: clamp(
      settlement.housing + (populationDelta > 0 ? -1 : populationDelta < 0 ? 1 : 0)
    ),
    abandoned,
    lastUpdatedHour: atHour
  };
  state.settlements[settlementId] = next;
  updateSettlementCyclePopulationGroups(state, next, populationDelta);
  recomputeSystemFromSettlements(state, next.systemId, atHour);

  const civilization = next.civilizationId
    ? context.galaxy.civilizations.find((entry) => entry.id === next.civilizationId)
    : undefined;
  const factionIds = next.ownerFactionId ? [next.ownerFactionId] : [];
  if (abandoned) {
    return {
      abandoned: true,
      event: {
        kind: 'disaster',
        title: `${next.name}: поселение покинуто`,
        summary:
          'Население исчезло после цепочки дефицитов и разрушения инфраструктуры. Узел остался без постоянной администрации.',
        severity: 9,
        visibility: 'public',
        systemIds: [next.systemId],
        civilizationIds: next.civilizationId ? [next.civilizationId] : [],
        factionIds,
        tags: ['simulation', 'settlement', 'abandoned'],
        data: {
          settlementId: next.id,
          populationDelta,
          shortages: shortages.join(',')
        }
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
        data: {
          settlementId: next.id,
          civilization: civilization?.name ?? '',
          populationDelta,
          critical: critical.join(',')
        }
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
