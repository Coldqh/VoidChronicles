import type { Civilization, Hub, Planet, StarSystem } from '../game/types';
import { createRng } from '../generation/rng';
import type { PlanetEcologyState } from '../ecology/types';
import type { SimulationContext } from './context';
import type {
  PopulationGroupState,
  SettlementKind,
  SettlementResource,
  SettlementState,
  SettlementStockpile,
  TradeRouteState
} from './types';

const RESOURCES: SettlementResource[] = ['food', 'water', 'energy', 'medicine', 'parts', 'weapons', 'luxury', 'rareMaterials'];

export interface SettlementLayer {
  settlements: Record<string, SettlementState>;
  populationGroups: Record<string, PopulationGroupState>;
  tradeRoutes: Record<string, TradeRouteState>;
}

export function emptyStockpile(value = 0): SettlementStockpile {
  return {
    food: value,
    water: value,
    energy: value,
    medicine: value,
    parts: value,
    weapons: value,
    luxury: value,
    rareMaterials: value
  };
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function bestPlanet(system: StarSystem, civilizationId?: string): Planet | undefined {
  return [...system.planets]
    .sort((a, b) => {
      const aOwned = a.civilizationId === civilizationId ? 30 : 0;
      const bOwned = b.civilizationId === civilizationId ? 30 : 0;
      const aGasPenalty = a.type === 'gas' ? 60 : 0;
      const bGasPenalty = b.type === 'gas' ? 60 : 0;
      return (b.habitability + bOwned - bGasPenalty) - (a.habitability + aOwned - aGasPenalty);
    })[0];
}

function kindForHub(hub: Hub): SettlementKind {
  if (hub.kind === 'station') return hub.services.includes('trade') ? 'trade' : 'orbital';
  if (hub.kind === 'freeport') return hub.services.includes('blackMarket') ? 'illegal' : 'trade';
  if (hub.kind === 'colony') return 'colony';
  return 'city';
}

function kindForPlanet(planet: Planet | undefined, civilization: Civilization, index: number): SettlementKind {
  if (!planet || planet.type === 'gas') return 'orbital';
  if (planet.type === 'desert' || planet.type === 'ice' || planet.type === 'toxic') return index % 3 === 0 ? 'mining' : 'colony';
  if (planet.type === 'artificial') return 'research';
  if (planet.type === 'anomalous') return 'military';
  if (civilization.techLevel >= 7 && index % 4 === 0) return 'research';
  return planet.habitability >= 55 ? 'city' : 'colony';
}

function settlementName(system: StarSystem, kind: SettlementKind, index: number): string {
  const suffix: Record<SettlementKind, string> = {
    city: 'Город', orbital: 'Орбиталь', mining: 'Рудник', research: 'Комплекс', military: 'Форпост',
    trade: 'Порт', illegal: 'Свободная гавань', colony: 'Колония', abandoned: 'Мёртвый узел'
  };
  return `${system.name} · ${suffix[kind]} ${index + 1}`;
}

function productionFor(kind: SettlementKind, planet: Planet | undefined, ecology: PlanetEcologyState | undefined, population: number): SettlementStockpile {
  const scale = Math.max(1, Math.log10(Math.max(10, population)) - 2.4);
  const output = emptyStockpile(0);
  output.energy = 12 * scale;
  output.water = (planet?.type === 'ocean' || planet?.type === 'ice' ? 18 : 7) * scale;
  output.food = (planet?.type === 'ocean' || planet?.type === 'jungle' || ecology ? 15 : 4) * scale;
  output.medicine = ((ecology?.resources.medicinal ?? 0) / 8 + (kind === 'research' ? 9 : 2)) * scale;
  output.parts = (kind === 'mining' || kind === 'orbital' || kind === 'trade' ? 15 : 7) * scale;
  output.weapons = (kind === 'military' ? 14 : 2) * scale;
  output.luxury = (kind === 'city' || kind === 'trade' ? 9 : 2) * scale;
  output.rareMaterials = ((ecology?.resources.rareCompounds ?? 0) / 12 + (kind === 'mining' ? 10 : 1)) * scale;
  return Object.fromEntries(RESOURCES.map((key) => [key, Math.round(output[key] * 100) / 100])) as SettlementStockpile;
}

function consumptionFor(population: number, kind: SettlementKind): SettlementStockpile {
  const people = Math.max(1, population / 10_000);
  return {
    food: people * 1.1,
    water: people * 1.25,
    energy: people * (kind === 'orbital' ? 1.5 : 1.05),
    medicine: people * 0.16,
    parts: people * (kind === 'mining' || kind === 'orbital' ? 0.28 : 0.18),
    weapons: people * (kind === 'military' ? 0.18 : 0.04),
    luxury: people * 0.08,
    rareMaterials: people * (kind === 'research' ? 0.11 : 0.025)
  };
}

function initialStocks(production: SettlementStockpile, consumption: SettlementStockpile, rng: ReturnType<typeof createRng>): SettlementStockpile {
  return Object.fromEntries(RESOURCES.map((key) => {
    const reserveDays = rng.int(35, 140);
    return [key, Math.max(2, Math.round((production[key] + consumption[key]) * reserveDays))];
  })) as SettlementStockpile;
}

function makeSettlement(params: {
  id: string;
  name: string;
  kind: SettlementKind;
  system: StarSystem;
  planet?: Planet;
  hub?: Hub;
  civilizationId?: string;
  ownerFactionId?: string;
  population: number;
  ecology?: PlanetEcologyState;
  seed: string;
  absoluteHour: number;
}): SettlementState {
  const rng = createRng(`${params.seed}:settlement:${params.id}`);
  const production = productionFor(params.kind, params.planet, params.ecology, params.population);
  const consumption = consumptionFor(params.population, params.kind);
  const safety = params.hub?.safety ?? params.system.danger;
  return {
    id: params.id,
    name: params.name,
    kind: params.kind,
    systemId: params.system.id,
    planetId: params.planet?.id,
    hubId: params.hub?.id,
    civilizationId: params.civilizationId,
    ownerFactionId: params.ownerFactionId,
    population: Math.max(50, Math.round(params.population)),
    infrastructure: clamp(rng.int(34, 78) + (params.kind === 'city' || params.kind === 'trade' ? 8 : 0)),
    security: clamp(safety === 'safe' ? rng.int(68, 88) : safety === 'caution' ? rng.int(42, 68) : rng.int(18, 46)),
    unrest: clamp(rng.int(4, 28) + (params.kind === 'illegal' ? 18 : 0)),
    housing: clamp(rng.int(44, 82)),
    health: clamp(rng.int(52, 86) + (params.kind === 'research' ? 5 : 0)),
    production,
    consumption,
    stocks: initialStocks(production, consumption, rng),
    foundedHour: params.absoluteHour - rng.int(5, 1600) * 365 * 24,
    abandoned: false,
    lastUpdatedHour: params.absoluteHour
  };
}

function cultureName(civilization: Civilization | undefined, index: number): string {
  return civilization?.cultures?.[index % Math.max(1, civilization.cultures.length)]?.name ?? civilization?.ideology ?? 'смешанная культура';
}

export function populationGroupsForSettlement(settlement: SettlementState, context: SimulationContext): PopulationGroupState[] {
  const civilization = settlement.civilizationId ? context.galaxy.civilizations.find((entry) => entry.id === settlement.civilizationId) : undefined;
  const species = civilization?.speciesName ?? 'смешанное население';
  const workers = Math.round(settlement.population * 0.64);
  const specialists = Math.round(settlement.population * 0.23);
  const security = Math.max(0, settlement.population - workers - specialists);
  const groups: Array<[PopulationGroupState['socialClass'], string, number, number]> = [
    ['workers', settlement.kind === 'mining' ? 'добыча и переработка' : 'производство и обслуживание', workers, 36],
    ['specialists', settlement.kind === 'research' ? 'исследования' : 'инженерия и медицина', specialists, 58],
    ['security', settlement.kind === 'military' ? 'военная служба' : 'охрана и администрация', security, 48]
  ];
  return groups.filter(([, , population]) => population > 0).map(([socialClass, profession, population, wealth], index) => ({
    id: `population_${settlement.id}_${socialClass}`,
    settlementId: settlement.id,
    civilizationId: settlement.civilizationId,
    species,
    culture: cultureName(civilization, index),
    socialClass,
    profession,
    population,
    wealth,
    health: clamp(settlement.health + (socialClass === 'specialists' ? 6 : socialClass === 'workers' ? -4 : 1)),
    loyalty: clamp(62 - settlement.unrest + (socialClass === 'security' ? 14 : 0)),
    radicalization: clamp(settlement.unrest + (socialClass === 'workers' ? 7 : -3)),
    migrationDesire: clamp(100 - settlement.housing + settlement.unrest + (settlement.health < 45 ? 18 : 0))
  }));
}

function systemDistance(a: StarSystem, b: StarSystem): number {
  return Math.hypot(a.coordinates.x - b.coordinates.x, a.coordinates.y - b.coordinates.y);
}

function shortestPath(startId: string, targetId: string, systems: Map<string, StarSystem>, maxDepth = 8): string[] {
  if (startId === targetId) return [startId];
  const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];
  const visited = new Set([startId]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length > maxDepth) continue;
    const system = systems.get(current.id);
    for (const neighbor of system?.neighbors ?? []) {
      if (visited.has(neighbor)) continue;
      const path = [...current.path, neighbor];
      if (neighbor === targetId) return path;
      visited.add(neighbor);
      queue.push({ id: neighbor, path });
    }
  }
  return [];
}

function routeCargo(origin: SettlementState, destination: SettlementState): SettlementResource[] {
  return RESOURCES
    .map((resource) => ({ resource, surplus: origin.production[resource] - origin.consumption[resource], need: destination.consumption[resource] - destination.production[resource] }))
    .sort((a, b) => (b.surplus + b.need) - (a.surplus + a.need))
    .slice(0, 3)
    .map((entry) => entry.resource);
}

export function makeTradeRoute(origin: SettlementState, destination: SettlementState, context: SimulationContext, absoluteHour: number): TradeRouteState | null {
  if (origin.id === destination.id) return null;
  const systems = new Map(context.galaxy.systems.map((entry) => [entry.id, entry]));
  const path = shortestPath(origin.systemId, destination.systemId, systems);
  if (!path.length) return null;
  const idParts = [origin.id, destination.id].sort();
  const pathDanger = path.reduce((sum, systemId) => {
    const danger = systems.get(systemId)?.danger;
    return sum + (danger === 'extreme' ? 28 : danger === 'danger' ? 18 : danger === 'caution' ? 8 : 2);
  }, 0) / path.length;
  return {
    id: `trade_${idParts[0]}_${idParts[1]}`,
    originSettlementId: origin.id,
    destinationSettlementId: destination.id,
    pathSystemIds: path,
    cargo: routeCargo(origin, destination),
    capacity: Math.max(20, Math.round(Math.sqrt(Math.min(origin.population, destination.population)) * 2.5)),
    traffic: 35,
    danger: clamp(pathDanger),
    disrupted: false,
    lastUpdatedHour: absoluteHour
  };
}

function initializeTradeRoutes(settlements: SettlementState[], context: SimulationContext, absoluteHour: number): Record<string, TradeRouteState> {
  const routes: Record<string, TradeRouteState> = {};
  const systems = new Map(context.galaxy.systems.map((entry) => [entry.id, entry]));
  for (const origin of settlements) {
    const originSystem = systems.get(origin.systemId);
    if (!originSystem) continue;
    const candidates = settlements
      .filter((entry) => entry.id !== origin.id && (
        entry.civilizationId === origin.civilizationId ||
        entry.ownerFactionId === origin.ownerFactionId ||
        origin.kind === 'trade' || entry.kind === 'trade'
      ))
      .sort((a, b) => {
        const aSystem = systems.get(a.systemId);
        const bSystem = systems.get(b.systemId);
        return (aSystem ? systemDistance(originSystem, aSystem) : Number.POSITIVE_INFINITY) - (bSystem ? systemDistance(originSystem, bSystem) : Number.POSITIVE_INFINITY);
      })
      .slice(0, 5);
    let added = 0;
    for (const destination of candidates) {
      const route = makeTradeRoute(origin, destination, context, absoluteHour);
      if (!route || routes[route.id]) continue;
      routes[route.id] = route;
      added += 1;
      if (added >= 2) break;
    }
  }
  return routes;
}

export function initializeSettlementLayer(
  context: SimulationContext,
  ecosystems: Record<string, PlanetEcologyState>,
  absoluteHour = 0
): SettlementLayer {
  const settlements: Record<string, SettlementState> = {};
  const populationGroups: Record<string, PopulationGroupState> = {};
  const occupiedSystems = new Set<string>();

  for (const hub of context.hubs) {
    const system = context.galaxy.systems.find((entry) => entry.id === hub.systemId);
    if (!system) continue;
    const planet = bestPlanet(system, hub.civilizationId);
    const settlement = makeSettlement({
      id: `settlement_${hub.id}`,
      name: hub.name,
      kind: kindForHub(hub),
      system,
      planet,
      hub,
      civilizationId: hub.civilizationId,
      ownerFactionId: hub.factionId,
      population: hub.population,
      ecology: planet ? ecosystems[planet.id] : undefined,
      seed: context.seed,
      absoluteHour
    });
    settlements[settlement.id] = settlement;
    occupiedSystems.add(system.id);
    for (const group of populationGroupsForSettlement(settlement, context)) populationGroups[group.id] = group;
  }

  for (const civilization of context.galaxy.civilizations.filter((entry) => entry.status === 'living' && (entry.development?.spaceAccess ?? 'interstellar') !== 'none')) {
    const faction = context.factions.find((entry) => entry.civilizationId === civilization.id);
    const systems = civilization.controlledSystems
      .map((id) => context.galaxy.systems.find((entry) => entry.id === id))
      .filter((entry): entry is StarSystem => Boolean(entry));
    systems.forEach((system, index) => {
      if (occupiedSystems.has(system.id)) return;
      const planet = bestPlanet(system, civilization.id);
      const rng = createRng(`${context.seed}:colony:${civilization.id}:${system.id}`);
      const kind = kindForPlanet(planet, civilization, index);
      const population = Math.round(rng.int(4_000, 280_000) * (0.7 + civilization.techLevel * 0.08));
      const settlement = makeSettlement({
        id: `settlement_${civilization.id}_${system.id}`,
        name: settlementName(system, kind, index),
        kind,
        system,
        planet,
        civilizationId: civilization.id,
        ownerFactionId: faction?.id,
        population,
        ecology: planet ? ecosystems[planet.id] : undefined,
        seed: context.seed,
        absoluteHour
      });
      settlements[settlement.id] = settlement;
      occupiedSystems.add(system.id);
      for (const group of populationGroupsForSettlement(settlement, context)) populationGroups[group.id] = group;
    });
  }

  const tradeRoutes = initializeTradeRoutes(Object.values(settlements), context, absoluteHour);
  return { settlements, populationGroups, tradeRoutes };
}

export function createFrontierColony(params: {
  civilizationId: string;
  source: SettlementState;
  targetSystem: StarSystem;
  context: SimulationContext;
  ecosystems: Record<string, PlanetEcologyState>;
  absoluteHour: number;
}): { settlement: SettlementState; groups: PopulationGroupState[]; route: TradeRouteState | null } {
  const civilization = params.context.galaxy.civilizations.find((entry) => entry.id === params.civilizationId);
  if (!civilization) throw new Error(`Civilization not found: ${params.civilizationId}`);
  const faction = params.context.factions.find((entry) => entry.civilizationId === params.civilizationId);
  const planet = bestPlanet(params.targetSystem, params.civilizationId);
  const kind = kindForPlanet(planet, civilization, params.targetSystem.planets.length);
  const population = Math.max(600, Math.round(params.source.population * 0.012));
  const settlement = makeSettlement({
    id: `settlement_${params.civilizationId}_${params.targetSystem.id}_${params.absoluteHour}`,
    name: settlementName(params.targetSystem, kind, 0),
    kind,
    system: params.targetSystem,
    planet,
    civilizationId: params.civilizationId,
    ownerFactionId: faction?.id,
    population,
    ecology: planet ? params.ecosystems[planet.id] : undefined,
    seed: params.context.seed,
    absoluteHour: params.absoluteHour
  });
  const groups = populationGroupsForSettlement(settlement, params.context);
  const route = makeTradeRoute(params.source, settlement, params.context, params.absoluteHour);
  return { settlement, groups, route };
}
