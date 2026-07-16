import type {
  CivilizationContact,
  Faction,
  GalacticRouteKind,
  GalacticRouteLeg,
  GalacticRoutePlan,
  GalacticSector,
  Galaxy,
  NavigationState,
  RouteHistoryEntry,
  RoutePreference,
  Ship,
  StarSystem,
  WarFront
} from '../game/types';
import type { SimulationState, WorldEvent } from '../simulation/types';
type TradeRouteState = SimulationState['tradeRoutes'][string];
import { createRng, stableHash } from '../generation/rng';

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));

const routeKindLabels: Record<GalacticRouteKind, string> = {
  standard: 'обычный коридор',
  trade: 'торговый путь',
  military: 'военный маршрут',
  smuggler: 'теневой коридор',
  ancient: 'древний переход',
  quarantine: 'карантинный путь'
};

export const routePreferenceLabels: Record<RoutePreference, string> = {
  fast: 'Быстрый',
  safe: 'Безопасный',
  economical: 'Экономичный',
  covert: 'Скрытный'
};

export interface GalacticGeography {
  sectors: GalacticSector[];
  routes: GalacticRouteLeg[];
}

export interface RoutePlanningInput {
  geography: GalacticGeography;
  fromSystemId: string;
  toSystemId: string;
  preference: RoutePreference;
  jumpRange: number;
  knownSystemIds: Set<string>;
  crewSize: number;
  year: number;
}

export interface RouteIncident {
  id: string;
  kind: 'inspection' | 'debris' | 'distress' | 'anomaly' | 'blockade' | 'quiet';
  title: string;
  summary: string;
  hullDamage: number;
  stress: number;
  reputation: number;
}

const angleNames = [
  'Северный меридиан',
  'Восточный рукав',
  'Юго-восточный разлом',
  'Южный меридиан',
  'Западный рукав',
  'Северо-западный разлом'
];

const edgeKey = (a: string, b: string): string => a < b ? `${a}::${b}` : `${b}::${a}`;

function systemDistance(a: StarSystem, b: StarSystem): number {
  return Math.hypot(a.coordinates.x - b.coordinates.x, a.coordinates.y - b.coordinates.y);
}

function dangerScore(system: StarSystem): number {
  return system.danger === 'extreme' ? 90 : system.danger === 'danger' ? 62 : system.danger === 'caution' ? 32 : 10;
}

function consecutiveRouteIncludes(route: TradeRouteState, a: string, b: string): boolean {
  for (let index = 0; index < route.pathSystemIds.length - 1; index += 1) {
    if (edgeKey(route.pathSystemIds[index]!, route.pathSystemIds[index + 1]!) === edgeKey(a, b)) return true;
  }
  return false;
}

function matchingWarFront(warFronts: WarFront[], a: string, b: string): WarFront | undefined {
  return warFronts
    .filter((front) => front.status === 'active' || front.status === 'cold')
    .filter((front) => front.systemIds.includes(a) || front.systemIds.includes(b))
    .sort((left, right) => right.intensity - left.intensity)[0];
}

function quarantineSeverity(events: WorldEvent[], a: string, b: string): number {
  return events
    .filter((event) => event.systemIds.includes(a) || event.systemIds.includes(b))
    .filter((event) => event.tags.some((tag) => /quarantine|pathogen|contamination|epidemic/i.test(tag)))
    .reduce((maximum, event) => Math.max(maximum, event.severity), 0);
}

function controllingCivilization(system: StarSystem): string | undefined {
  return system.civilizationIds.length === 1 ? system.civilizationIds[0] : undefined;
}

function contactRank(contact?: CivilizationContact): number {
  if (!contact) return 0;
  return contact.stage === 'trusted' ? 5
    : contact.stage === 'contacted' ? 4
      : contact.stage === 'translated' ? 3
        : contact.stage === 'signals' ? 2
          : contact.stage === 'observed' || contact.stage === 'failed' ? 1
            : 0;
}

function sectorKind(radiusRatio: number): GalacticSector['kind'] {
  return radiusRatio < 0.22 ? 'core' : radiusRatio < 0.52 ? 'inner' : radiusRatio < 0.82 ? 'rim' : 'void';
}

function sectorName(kind: GalacticSector['kind'], angleIndex: number): string {
  const prefix = kind === 'core' ? 'Ядро'
    : kind === 'inner' ? 'Внутренний пояс'
      : kind === 'rim' ? 'Пограничный пояс'
        : 'Глубокая пустота';
  return `${prefix}: ${angleNames[angleIndex] ?? `сектор ${angleIndex + 1}`}`;
}

export function buildGalacticGeography(input: {
  galaxy: Galaxy;
  simulation: SimulationState;
  warFronts: WarFront[];
  factions: Faction[];
  contacts: CivilizationContact[];
}): GalacticGeography {
  const systems = input.galaxy.systems;
  const center = systems.reduce((sum, system) => ({
    x: sum.x + system.coordinates.x,
    y: sum.y + system.coordinates.y
  }), { x: 0, y: 0 });
  center.x /= Math.max(1, systems.length);
  center.y /= Math.max(1, systems.length);
  const maxRadius = Math.max(1, ...systems.map((system) => Math.hypot(system.coordinates.x - center.x, system.coordinates.y - center.y)));
  const sectorMap = new Map<string, GalacticSector>();

  for (const system of systems) {
    const dx = system.coordinates.x - center.x;
    const dy = system.coordinates.y - center.y;
    const radiusRatio = Math.hypot(dx, dy) / maxRadius;
    const kind = sectorKind(radiusRatio);
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    const angleIndex = Math.min(angleNames.length - 1, Math.floor(angle / (Math.PI * 2) * angleNames.length));
    const id = `sector_${kind}_${angleIndex}`;
    const current = sectorMap.get(id) ?? {
      id,
      name: sectorName(kind, angleIndex),
      kind,
      systemIds: [],
      danger: 0,
      contested: false,
      traits: []
    };
    current.systemIds.push(system.id);
    current.danger += dangerScore(system);
    sectorMap.set(id, current);
  }

  const sectors = [...sectorMap.values()].map((sector) => {
    const sectorSystems = sector.systemIds.map((id) => systems.find((system) => system.id === id)!).filter(Boolean);
    const civilizations = sectorSystems.flatMap((system) => system.civilizationIds);
    const counts = civilizations.reduce<Record<string, number>>((accumulator, id) => {
      accumulator[id] = (accumulator[id] ?? 0) + 1;
      return accumulator;
    }, {});
    const controller = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const activeWar = input.warFronts.some((front) => (front.status === 'active' || front.status === 'cold') && front.systemIds.some((id) => sector.systemIds.includes(id)));
    const contested = activeWar || Object.keys(counts).length > 1;
    const traits = [
      sector.kind === 'core' ? 'плотная навигационная сеть' : sector.kind === 'void' ? 'редкие точки снабжения' : 'смешанные маршруты',
      contested ? 'оспариваемая территория' : controller ? 'устойчивый контроль' : 'нейтральное пространство'
    ];
    return {
      ...sector,
      systemIds: [...sector.systemIds].sort(),
      danger: clamp(sector.danger / Math.max(1, sector.systemIds.length)),
      controllingCivilizationId: controller?.[0],
      contested,
      traits
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const tradeRoutes = Object.values(input.simulation.tradeRoutes);
  const contacts = new Map(input.contacts.map((contact) => [contact.civilizationId, contact]));
  const routes: GalacticRouteLeg[] = [];
  const seen = new Set<string>();

  for (const from of systems) {
    for (const neighborId of from.neighbors) {
      const to = systems.find((system) => system.id === neighborId);
      if (!to) continue;
      const key = edgeKey(from.id, to.id);
      if (seen.has(key)) continue;
      seen.add(key);

      const distance = systemDistance(from, to);
      const tradeRoute = tradeRoutes.find((route) => consecutiveRouteIncludes(route, from.id, to.id));
      const warFront = matchingWarFront(input.warFronts, from.id, to.id);
      const quarantine = quarantineSeverity(input.simulation.events, from.id, to.id);
      const deterministic = Number.parseInt(stableHash(`${input.galaxy.seed}:${key}`), 36) || 0;
      const frontierPair = from.region !== 'core' && to.region !== 'core';
      const ancient = (from.anomaly || to.anomaly) && deterministic % 9 === 0;
      const smuggler = frontierPair && deterministic % 7 === 0;

      let kind: GalacticRouteKind = 'standard';
      if (quarantine >= 5 || from.danger === 'extreme' || to.danger === 'extreme') kind = 'quarantine';
      else if (warFront) kind = 'military';
      else if (tradeRoute && !tradeRoute.disrupted) kind = 'trade';
      else if (ancient) kind = 'ancient';
      else if (smuggler) kind = 'smuggler';

      const sameController = controllingCivilization(from) && controllingCivilization(from) === controllingCivilization(to)
        ? controllingCivilization(from)
        : undefined;
      const controllingFaction = input.factions.find((faction) => faction.civilizationId === sameController && faction.kind === 'government')
        ?? input.factions.find((faction) => faction.civilizationId === sameController);
      const controllerContact = sameController ? contacts.get(sameController) : undefined;
      const hostileControl = controllingFaction?.disposition === 'hostile';
      const restrictedControl = Boolean(sameController && contactRank(controllerContact) < 4);
      const blocked = (warFront?.intensity ?? 0) >= 92 || quarantine >= 8;
      const restricted = !blocked && (hostileControl || restrictedControl || kind === 'quarantine');

      const systemSecurity = Math.round(((input.simulation.systems[from.id]?.security ?? 50) + (input.simulation.systems[to.id]?.security ?? 50)) / 2);
      const tradeSafety = tradeRoute && !tradeRoute.disrupted ? 18 : 0;
      const disruptedPenalty = tradeRoute?.disrupted ? 24 : 0;
      const kindRisk = kind === 'military' ? 28
        : kind === 'quarantine' ? 34
          : kind === 'smuggler' ? 18
            : kind === 'ancient' ? 22
              : kind === 'trade' ? -10
                : 0;
      const risk = clamp((dangerScore(from) + dangerScore(to)) / 2 + kindRisk + disruptedPenalty + (warFront?.intensity ?? 0) * .45 - tradeSafety - systemSecurity * .22);
      const fuelModifier = kind === 'ancient' ? .72 : kind === 'trade' ? .88 : kind === 'military' ? 1.12 : kind === 'quarantine' ? 1.18 : kind === 'smuggler' ? 1.04 : 1;
      const hourModifier = kind === 'ancient' ? .68 : kind === 'trade' ? .9 : kind === 'military' ? 1.18 : kind === 'quarantine' ? 1.28 : kind === 'smuggler' ? .96 : 1;
      const fuelCost = Math.max(5, Math.ceil(distance / 14 * fuelModifier));
      const hours = Math.max(4, Math.ceil(distance / 7 * hourModifier));

      routes.push({
        id: `route_${stableHash(key)}`,
        fromSystemId: from.id,
        toSystemId: to.id,
        kind,
        distance: Math.round(distance),
        fuelCost,
        hours,
        risk,
        access: blocked ? 'blocked' : restricted ? 'restricted' : 'open',
        controllingCivilizationId: sameController,
        controllingFactionId: controllingFaction?.id,
        tradeRouteId: tradeRoute?.id,
        warFrontId: warFront?.id,
        restriction: blocked
          ? warFront && warFront.intensity >= 92 ? 'Маршрут перекрыт активным фронтом.' : 'Карантинный протокол запрещает проход.'
          : restricted
            ? hostileControl ? 'Контролирующая сторона враждебна капитану.' : restrictedControl ? 'Требуется официальный контакт или разрешение на пролёт.' : 'Проход возможен с риском досмотра.'
            : undefined,
        label: routeKindLabels[kind]
      });
    }
  }

  return { sectors, routes: routes.sort((a, b) => a.id.localeCompare(b.id)) };
}

function routeWeight(route: GalacticRouteLeg, preference: RoutePreference): number {
  const restrictionPenalty = route.access === 'restricted' ? 120 : route.access === 'blocked' ? 100000 : 0;
  if (preference === 'safe') return route.risk * 5 + route.hours * 1.2 + route.fuelCost * .6 + restrictionPenalty;
  if (preference === 'economical') return route.fuelCost * 9 + route.hours * .7 + route.risk * 1.2 + restrictionPenalty;
  if (preference === 'covert') {
    const covertBonus = route.kind === 'smuggler' ? -90 : route.kind === 'ancient' ? -45 : route.kind === 'trade' || route.kind === 'military' ? 35 : 0;
    return route.risk * 2.1 + route.hours + route.fuelCost * 1.4 + restrictionPenalty + covertBonus;
  }
  return route.hours * 5 + route.fuelCost * 1.2 + route.risk * .8 + restrictionPenalty;
}

export function planRoute(input: RoutePlanningInput): GalacticRoutePlan | null {
  if (input.fromSystemId === input.toSystemId) return null;
  const adjacency = new Map<string, GalacticRouteLeg[]>();
  for (const route of input.geography.routes) {
    if (route.distance > input.jumpRange || route.access === 'blocked') continue;
    if (!input.knownSystemIds.has(route.fromSystemId) || !input.knownSystemIds.has(route.toSystemId)) continue;
    const forward = route;
    const backward: GalacticRouteLeg = { ...route, fromSystemId: route.toSystemId, toSystemId: route.fromSystemId };
    adjacency.set(forward.fromSystemId, [...(adjacency.get(forward.fromSystemId) ?? []), forward]);
    adjacency.set(backward.fromSystemId, [...(adjacency.get(backward.fromSystemId) ?? []), backward]);
  }

  const distances = new Map<string, number>([[input.fromSystemId, 0]]);
  const previous = new Map<string, { systemId: string; route: GalacticRouteLeg }>();
  const queue = new Set<string>([input.fromSystemId]);
  const visited = new Set<string>();

  while (queue.size) {
    const current = [...queue].sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity))[0]!;
    queue.delete(current);
    if (current === input.toSystemId) break;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const route of adjacency.get(current) ?? []) {
      const cost = (distances.get(current) ?? Infinity) + routeWeight(route, input.preference);
      if (cost < (distances.get(route.toSystemId) ?? Infinity)) {
        distances.set(route.toSystemId, cost);
        previous.set(route.toSystemId, { systemId: current, route });
        queue.add(route.toSystemId);
      }
    }
  }

  if (!previous.has(input.toSystemId)) return null;
  const legs: GalacticRouteLeg[] = [];
  let cursor = input.toSystemId;
  while (cursor !== input.fromSystemId) {
    const step = previous.get(cursor);
    if (!step) return null;
    legs.unshift(step.route);
    cursor = step.systemId;
  }
  const systemIds = [input.fromSystemId, ...legs.map((leg) => leg.toSystemId)];
  const totalFuel = legs.reduce((sum, leg) => sum + leg.fuelCost, 0);
  const totalHours = legs.reduce((sum, leg) => sum + leg.hours, 0);
  const totalRisk = clamp(legs.reduce((sum, leg) => sum + leg.risk, 0) / Math.max(1, legs.length));
  const foodCost = Math.max(0, Math.ceil(input.crewSize * totalHours / (24 * 4)));
  const oxygenCost = Math.max(0, Math.ceil(input.crewSize * totalHours / (24 * 3)));
  const warnings = [
    ...(legs.some((leg) => leg.access === 'restricted') ? ['Маршрут пересекает территорию с ограниченным доступом.'] : []),
    ...(legs.some((leg) => leg.kind === 'military') ? ['На пути действует военный контроль.'] : []),
    ...(legs.some((leg) => leg.kind === 'quarantine') ? ['На пути действует карантинный протокол.'] : []),
    ...(totalRisk >= 65 ? ['Высокая вероятность инцидента в пути.'] : []),
    ...(legs.length >= 5 ? ['Длинный маршрут увеличит усталость экипажа и износ отсеков.'] : [])
  ];

  return {
    id: `plan_${stableHash(`${input.fromSystemId}:${input.toSystemId}:${input.preference}:${systemIds.join(':')}`)}`,
    preference: input.preference,
    destinationSystemId: input.toSystemId,
    systemIds,
    legs,
    currentLegIndex: 0,
    totalFuel,
    totalHours,
    totalRisk,
    foodCost,
    oxygenCost,
    warnings,
    createdYear: input.year,
    status: 'active'
  };
}

export function planRouteOptions(input: Omit<RoutePlanningInput, 'preference'>): GalacticRoutePlan[] {
  const preferences: RoutePreference[] = ['fast', 'safe', 'economical', 'covert'];
  const plans = preferences
    .map((preference) => planRoute({ ...input, preference }))
    .filter((plan): plan is GalacticRoutePlan => Boolean(plan));
  const signatures = new Set<string>();
  return plans.filter((plan) => {
    const signature = `${plan.preference}:${plan.systemIds.join('>')}`;
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
}

export function routeBetween(geography: GalacticGeography, fromSystemId: string, toSystemId: string): GalacticRouteLeg | undefined {
  const route = geography.routes.find((entry) => edgeKey(entry.fromSystemId, entry.toSystemId) === edgeKey(fromSystemId, toSystemId));
  if (!route) return undefined;
  return route.fromSystemId === fromSystemId ? route : { ...route, fromSystemId, toSystemId };
}

export function createNavigationState(): NavigationState {
  return { activePlan: undefined, history: [], knownSectorIds: [] };
}

export function normalizeNavigationState(state?: NavigationState): NavigationState {
  return {
    activePlan: state?.activePlan ? {
      ...state.activePlan,
      currentLegIndex: Math.max(0, Math.min(state.activePlan.legs.length, Math.round(state.activePlan.currentLegIndex))),
      totalFuel: Math.max(0, Math.round(state.activePlan.totalFuel)),
      totalHours: Math.max(0, Math.round(state.activePlan.totalHours)),
      totalRisk: clamp(state.activePlan.totalRisk),
      foodCost: Math.max(0, Math.round(state.activePlan.foodCost)),
      oxygenCost: Math.max(0, Math.round(state.activePlan.oxygenCost)),
      status: state.activePlan.status ?? 'active'
    } : undefined,
    history: (state?.history ?? []).slice(0, 120),
    knownSectorIds: [...new Set(state?.knownSectorIds ?? [])]
  };
}

export function advanceNavigationPlan(input: {
  navigation: NavigationState;
  fromSystemId: string;
  arrivedSystemId: string;
  year: number;
  route: GalacticRouteLeg;
  incident?: RouteIncident;
}): NavigationState {
  const navigation = normalizeNavigationState(input.navigation);
  const active = navigation.activePlan;
  let activePlan = active;
  if (active && active.status === 'active') {
    const expected = active.legs[active.currentLegIndex];
    if (expected && expected.fromSystemId === input.fromSystemId && expected.toSystemId === input.arrivedSystemId) {
      const nextIndex = active.currentLegIndex + 1;
      activePlan = {
        ...active,
        currentLegIndex: nextIndex,
        status: nextIndex >= active.legs.length ? 'completed' : 'active'
      };
    } else if (active.systemIds.includes(input.arrivedSystemId)) {
      const systemIndex = active.systemIds.indexOf(input.arrivedSystemId);
      activePlan = { ...active, currentLegIndex: Math.max(0, systemIndex), status: systemIndex >= active.legs.length ? 'completed' : 'active' };
    } else {
      activePlan = { ...active, status: 'abandoned' };
    }
  }
  const historyEntry: RouteHistoryEntry = {
    id: `route_history_${stableHash(`${input.fromSystemId}:${input.arrivedSystemId}:${input.year}:${navigation.history.length}`)}`,
    fromSystemId: input.fromSystemId,
    toSystemId: input.arrivedSystemId,
    year: input.year,
    routeKind: input.route.kind,
    risk: input.route.risk,
    incident: input.incident?.title
  };
  return {
    ...navigation,
    activePlan,
    history: [historyEntry, ...navigation.history].slice(0, 120)
  };
}

export function resolveRouteIncident(input: {
  seed: string;
  route: GalacticRouteLeg;
  ship: Ship;
  serial: number;
}): RouteIncident {
  const rng = createRng(`${input.seed}:route-incident:${input.route.id}:${input.serial}`);
  const chance = Math.min(.82, .08 + input.route.risk / 125 + (input.route.access === 'restricted' ? .14 : 0));
  if (!rng.chance(chance)) {
    return { id: `incident_${stableHash(`${input.route.id}:${input.serial}:quiet`)}`, kind: 'quiet', title: 'Переход без происшествий', summary: 'Коридор пройден без подтверждённых угроз.', hullDamage: 0, stress: 0, reputation: 0 };
  }

  if (input.route.kind === 'military') {
    return { id: `incident_${stableHash(`${input.route.id}:${input.serial}:blockade`)}`, kind: 'blockade', title: 'Военная проверка маршрута', summary: 'Патруль потребовал идентификацию и провёл длительный досмотр.', hullDamage: 0, stress: 7, reputation: input.route.access === 'restricted' ? -1 : 0 };
  }
  if (input.route.kind === 'quarantine') {
    return { id: `incident_${stableHash(`${input.route.id}:${input.serial}:inspection`)}`, kind: 'inspection', title: 'Карантинный досмотр', summary: 'Автоматические посты просканировали корпус и изолировали шлюзовой блок.', hullDamage: 0, stress: 6, reputation: 0 };
  }
  if (input.route.kind === 'ancient') {
    return { id: `incident_${stableHash(`${input.route.id}:${input.serial}:anomaly`)}`, kind: 'anomaly', title: 'Сбой древнего перехода', summary: 'Навигационный контур дал фазовый выброс. Корпус и экипаж приняли нагрузку.', hullDamage: Math.max(2, Math.round(input.route.risk / 12)), stress: 9, reputation: 0 };
  }
  if (input.route.kind === 'smuggler') {
    return { id: `incident_${stableHash(`${input.route.id}:${input.serial}:distress`)}`, kind: 'distress', title: 'Теневой маяк', summary: 'В закрытом канале появился запрос помощи без подтверждённой личности отправителя.', hullDamage: 0, stress: 4, reputation: 0 };
  }
  const damage = Math.max(1, Math.round(input.route.risk / 18));
  return { id: `incident_${stableHash(`${input.route.id}:${input.serial}:debris`)}`, kind: 'debris', title: 'Поле обломков', summary: 'Корабль прошёл через неучтённое поле обломков. Внешняя обшивка повреждена.', hullDamage: damage, stress: 5, reputation: 0 };
}

export function routeVisuals(geography: GalacticGeography, activePlan?: GalacticRoutePlan): Array<{ fromSystemId: string; toSystemId: string; kind: GalacticRouteKind; planned: boolean }> {
  const planned = new Set((activePlan?.legs ?? []).map((leg) => edgeKey(leg.fromSystemId, leg.toSystemId)));
  return geography.routes.map((route) => ({
    fromSystemId: route.fromSystemId,
    toSystemId: route.toSystemId,
    kind: route.kind,
    planned: planned.has(edgeKey(route.fromSystemId, route.toSystemId))
  }));
}
