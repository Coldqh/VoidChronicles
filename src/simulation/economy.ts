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
  ].slice(0, 1_000);
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
