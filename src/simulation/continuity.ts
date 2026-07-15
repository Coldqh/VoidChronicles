import type { Civilization, Hub, Planet, StarSystem } from '../game/types';
import type { PlanetEcologyState } from '../ecology/types';
import type { DeepHistoricalSettlement, DeepHistoricalSettlementKind } from '../deeptime/types';
import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import {
  emptyStockpile,
  makeTradeRoute,
  populationGroupsForSettlement,
  type SettlementLayer
} from './settlements';
import type {
  SettlementKind,
  SettlementState,
  SettlementStockpile,
  TradeRouteState
} from './types';

const HOURS_PER_YEAR = 365 * 24;

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function bestPlanet(system: StarSystem, civilizationId?: string): Planet | undefined {
  return [...system.planets]
    .filter((planet) => planet.type !== 'gas')
    .sort((a, b) => {
      const aOwned = a.civilizationId === civilizationId ? 24 : 0;
      const bOwned = b.civilizationId === civilizationId ? 24 : 0;
      return b.habitability + bOwned - (a.habitability + aOwned);
    })[0];
}

function historicalKind(kind: DeepHistoricalSettlementKind): SettlementKind {
  if (kind === 'orbital-habitat') return 'orbital';
  if (kind === 'stellar-colony' || kind === 'planetary-colony') return 'colony';
  if (kind === 'industrial-city') return 'mining';
  if (kind === 'fortress') return 'military';
  if (kind === 'port') return 'trade';
  if (kind === 'camp' || kind === 'village') return 'colony';
  return 'city';
}

function hubKind(hub: Hub): SettlementKind {
  if (hub.kind === 'station') return hub.services.includes('trade') ? 'trade' : 'orbital';
  if (hub.kind === 'freeport') return hub.services.includes('blackMarket') ? 'illegal' : 'trade';
  if (hub.kind === 'colony') return 'colony';
  return 'city';
}

function productionFor(
  kind: SettlementKind,
  planet: Planet | undefined,
  ecology: PlanetEcologyState | undefined,
  population: number,
  techLevel: number
): SettlementStockpile {
  const scale = Math.max(0.7, Math.log10(Math.max(100, population)) - 2.6);
  const technology = 0.55 + Math.max(1, techLevel) * 0.11;
  const result = emptyStockpile(0);
  result.energy = (kind === 'orbital' ? 16 : 7) * scale * technology;
  result.water = (planet?.type === 'ocean' || planet?.type === 'ice' ? 18 : 6) * scale;
  result.food = (planet?.type === 'ocean' || planet?.type === 'jungle' || ecology ? 14 : 4) * scale;
  result.medicine = ((ecology?.resources.medicinal ?? 0) / 10 + (kind === 'research' ? 8 : 1.5)) * scale * technology;
  result.parts = (kind === 'mining' || kind === 'orbital' || kind === 'trade' ? 13 : 4) * scale * technology;
  result.weapons = (kind === 'military' ? 12 : 1.5) * scale * technology;
  result.luxury = (kind === 'city' || kind === 'trade' ? 7 : 1) * scale * technology;
  result.rareMaterials = ((ecology?.resources.rareCompounds ?? 0) / 14 + (kind === 'mining' ? 8 : 0.5)) * scale;
  return Object.fromEntries(
    Object.entries(result).map(([resource, value]) => [resource, Math.round(value * 100) / 100])
  ) as SettlementStockpile;
}

function consumptionFor(population: number, kind: SettlementKind, techLevel: number): SettlementStockpile {
  const people = Math.max(0.05, population / 10_000);
  const complexity = 0.72 + Math.max(1, techLevel) * 0.045;
  return {
    food: people * 1.1,
    water: people * 1.25,
    energy: people * (kind === 'orbital' ? 1.7 : 0.7 + complexity * 0.4),
    medicine: people * (0.09 + complexity * 0.05),
    parts: people * (kind === 'mining' || kind === 'orbital' ? 0.28 : 0.12 + complexity * 0.04),
    weapons: people * (kind === 'military' ? 0.17 : 0.025),
    luxury: people * Math.max(0.01, (techLevel - 2) * 0.012),
    rareMaterials: people * (kind === 'research' ? 0.09 : 0.012)
  };
}

function initialStocks(
  production: SettlementStockpile,
  consumption: SettlementStockpile,
  seed: string
): SettlementStockpile {
  const rng = createRng(seed);
  return Object.fromEntries(
    Object.keys(production).map((resource) => {
      const key = resource as keyof SettlementStockpile;
      const reserve = rng.int(45, 180);
      return [key, Math.max(2, Math.round((production[key] + consumption[key]) * reserve))];
    })
  ) as SettlementStockpile;
}

function civilizationFor(context: SimulationContext, civilizationId?: string): Civilization | undefined {
  return civilizationId
    ? context.galaxy.civilizations.find((entry) => entry.id === civilizationId)
    : undefined;
}

function buildSettlement(params: {
  id: string;
  name: string;
  kind: SettlementKind;
  system: StarSystem;
  planet?: Planet;
  hub?: Hub;
  civilization?: Civilization;
  historical?: DeepHistoricalSettlement;
  population: number;
  ownerFactionId?: string;
  ecology?: PlanetEcologyState;
  context: SimulationContext;
  absoluteHour: number;
}): SettlementState {
  const rng = createRng(`${params.context.seed}:continuity:${params.id}`);
  const techLevel = params.civilization?.techLevel ?? 5;
  const production = productionFor(params.kind, params.planet, params.ecology, params.population, techLevel);
  const consumption = consumptionFor(params.population, params.kind, techLevel);
  const historicalDepth = params.historical
    ? Math.max(0, Math.min(18, Math.log10(Math.max(10, params.historical.populationPeak)) * 2))
    : 0;
  const safety = params.hub?.safety ?? params.system.danger;

  return {
    id: params.id,
    name: params.name,
    kind: params.kind,
    systemId: params.system.id,
    planetId: params.planet?.id,
    hubId: params.hub?.id,
    civilizationId: params.civilization?.id ?? params.hub?.civilizationId,
    ownerFactionId: params.ownerFactionId ?? params.hub?.factionId,
    population: Math.max(50, Math.round(params.population)),
    infrastructure: clamp(
      25 + techLevel * 5 + historicalDepth + rng.int(-8, 8) +
        (params.kind === 'city' || params.kind === 'trade' ? 7 : 0)
    ),
    security: clamp(
      safety === 'safe' ? rng.int(65, 86) :
        safety === 'caution' ? rng.int(42, 68) : rng.int(18, 48)
    ),
    unrest: clamp(rng.int(4, 25) + (params.kind === 'illegal' ? 22 : 0)),
    housing: clamp(rng.int(45, 82)),
    health: clamp(45 + techLevel * 4 + rng.int(-8, 9)),
    production,
    consumption,
    stocks: initialStocks(production, consumption, `${params.context.seed}:stocks:${params.id}`),
    foundedHour: params.historical
      ? params.historical.foundedYear * HOURS_PER_YEAR
      : params.absoluteHour - rng.int(5, 1_600) * HOURS_PER_YEAR,
    abandoned: false,
    lastUpdatedHour: params.absoluteHour
  };
}

function activeHistoricalSettlements(context: SimulationContext): DeepHistoricalSettlement[] {
  return (context.galaxy.deepTime?.historicalSettlements ?? []).filter(
    (settlement) => settlement.status === 'active' && settlement.endedYear === undefined
  );
}

function connectRoutes(
  settlements: SettlementState[],
  context: SimulationContext,
  absoluteHour: number
): Record<string, TradeRouteState> {
  const routes: Record<string, TradeRouteState> = {};
  const systems = new Map(context.galaxy.systems.map((system) => [system.id, system]));

  for (const origin of settlements) {
    const civilization = civilizationFor(context, origin.civilizationId);
    const canCrossStars =
      civilization?.development?.spaceAccess === 'interstellar' ||
      civilization?.development?.spaceAccess === 'ftl';
    const originSystem = systems.get(origin.systemId);
    if (!originSystem) continue;

    const candidates = settlements
      .filter((destination) => destination.id !== origin.id)
      .filter((destination) => {
        if (origin.systemId === destination.systemId) return true;
        if (!canCrossStars) return false;
        return (
          destination.civilizationId === origin.civilizationId ||
          destination.ownerFactionId === origin.ownerFactionId ||
          origin.kind === 'trade' ||
          destination.kind === 'trade'
        );
      })
      .sort((a, b) => {
        const aSystem = systems.get(a.systemId);
        const bSystem = systems.get(b.systemId);
        const aDistance = aSystem
          ? Math.hypot(originSystem.coordinates.x - aSystem.coordinates.x, originSystem.coordinates.y - aSystem.coordinates.y)
          : Number.POSITIVE_INFINITY;
        const bDistance = bSystem
          ? Math.hypot(originSystem.coordinates.x - bSystem.coordinates.x, originSystem.coordinates.y - bSystem.coordinates.y)
          : Number.POSITIVE_INFINITY;
        return aDistance - bDistance;
      })
      .slice(0, 4);

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

export function initializeContinuitySettlementLayer(
  context: SimulationContext,
  ecosystems: Record<string, PlanetEcologyState>,
  absoluteHour = 0
): SettlementLayer {
  const settlements: Record<string, SettlementState> = {};
  const populationGroups: SettlementLayer['populationGroups'] = {};
  const usedHubIds = new Set<string>();
  const activeHistory = activeHistoricalSettlements(context);

  for (const historical of activeHistory) {
    const civilization = civilizationFor(context, historical.civilizationId);
    const system = context.galaxy.systems.find((entry) => entry.id === historical.systemId);
    if (!civilization || !system) continue;
    const planet = historical.planetId
      ? system.planets.find((entry) => entry.id === historical.planetId)
      : bestPlanet(system, civilization.id);
    const hub = context.hubs.find(
      (entry) =>
        entry.systemId === system.id &&
        entry.civilizationId === civilization.id &&
        !usedHubIds.has(entry.id)
    );
    if (hub) usedHubIds.add(hub.id);
    const faction = context.factions.find((entry) => entry.civilizationId === civilization.id);
    const population = Math.max(
      historical.populationAtEnd,
      hub?.population ?? 0,
      Math.min(historical.populationPeak, civilization.development?.population ?? historical.populationPeak)
    );
    const settlement = buildSettlement({
      id: `settlement_history_${historical.id}`,
      name: hub?.name ?? historical.name,
      kind: hub ? hubKind(hub) : historicalKind(historical.kind),
      system,
      planet,
      hub,
      civilization,
      historical,
      population,
      ownerFactionId: faction?.id,
      ecology: planet ? ecosystems[planet.id] : undefined,
      context,
      absoluteHour
    });
    settlements[settlement.id] = settlement;
    for (const group of populationGroupsForSettlement(settlement, context)) {
      populationGroups[group.id] = group;
    }
  }

  for (const hub of context.hubs) {
    if (usedHubIds.has(hub.id)) continue;
    const system = context.galaxy.systems.find((entry) => entry.id === hub.systemId);
    if (!system) continue;
    const civilization = civilizationFor(context, hub.civilizationId);
    const planet = bestPlanet(system, hub.civilizationId);
    const settlement = buildSettlement({
      id: `settlement_${hub.id}`,
      name: hub.name,
      kind: hubKind(hub),
      system,
      planet,
      hub,
      civilization,
      population: hub.population,
      ecology: planet ? ecosystems[planet.id] : undefined,
      context,
      absoluteHour
    });
    settlements[settlement.id] = settlement;
    for (const group of populationGroupsForSettlement(settlement, context)) {
      populationGroups[group.id] = group;
    }
  }

  for (const civilization of context.galaxy.civilizations.filter((entry) => entry.status === 'living')) {
    if (Object.values(settlements).some((entry) => entry.civilizationId === civilization.id)) continue;
    const system = context.galaxy.systems.find((entry) => entry.id === civilization.homeSystemId);
    if (!system) continue;
    const planet = bestPlanet(system, civilization.id);
    const faction = context.factions.find((entry) => entry.civilizationId === civilization.id);
    const population = Math.max(500, civilization.development?.population ?? 5_000);
    const settlement = buildSettlement({
      id: `settlement_continuity_${civilization.id}`,
      name: `${system.name} · ${civilization.era === 'tribal' ? 'Главное поселение' : 'Центральный город'}`,
      kind: civilization.development?.spaceAccess === 'orbital' ? 'city' : 'colony',
      system,
      planet,
      civilization,
      population,
      ownerFactionId: faction?.id,
      ecology: planet ? ecosystems[planet.id] : undefined,
      context,
      absoluteHour
    });
    settlements[settlement.id] = settlement;
    for (const group of populationGroupsForSettlement(settlement, context)) {
      populationGroups[group.id] = group;
    }
  }

  return {
    settlements,
    populationGroups,
    tradeRoutes: connectRoutes(Object.values(settlements), context, absoluteHour)
  };
}
