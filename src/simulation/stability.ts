import type {
  PopulationGroupState,
  SettlementResource,
  SimulationState,
  WorldEvent
} from './types';

const HOURS_PER_YEAR = 365 * 24;
const LINK_SEPARATOR = '|';

export const SIMULATION_EVENT_BUFFER_LIMIT = 8_500;
export const SIMULATION_EVENT_LIMIT = 8_000;
export const SIMULATION_SNAPSHOT_LIMIT = 4_000;
export const SIMULATION_VISIBLE_EVENT_LIMIT = 4_000;
export const SIMULATION_SCHEDULE_LIMIT = 25_000;
export const MIN_WAR_UPDATE_HOURS = 30 * 24;
export const MAX_ACTIVE_WAR_YEARS = 120;
export const MAX_IDLE_WAR_YEARS = 20;

const SOCIAL_EVENT_COOLDOWNS: Record<string, number> = {
  'social-revolt': 12,
  'urban-riots': 4,
  'general-strike': 5,
  'social-reform': 8,
  'demographic-decline': 6
};

const SNAPSHOT_ID_FIELDS: Array<[string, string]> = [
  ['living-polity-state', 'polityId'],
  ['living-war-state', 'warId'],
  ['living-economy-state', 'economyCivilizationId'],
  ['living-culture-state', 'cultureId'],
  ['living-society-state', 'societyCivilizationId'],
  ['living-figure-state', 'figureId'],
  ['living-institution-state', 'institutionId'],
  ['living-artifact-state', 'heritageArtifactId'],
  ['living-archive-state', 'archiveId'],
  ['living-ruin-state', 'livingRuinId'],
  ['planetary-consequence-state', 'impactPlanetId']
];

const IMPORTANT_EVENT_TAGS = new Set([
  'era-transition',
  'regression',
  'civilization-collapse',
  'war-ended',
  'peace-treaty',
  'occupation',
  'secession',
  'player-world-consequence',
  'contract-success',
  'contract-failure',
  'stability-war-resolution'
]);

export interface SimulationStabilityReport {
  eventCountBefore: number;
  eventCountAfter: number;
  removedDuplicateEvents: number;
  removedSnapshotEvents: number;
  removedSpamEvents: number;
  removedBrokenLinks: number;
  repairedReverseLinks: number;
  normalizedValues: number;
  removedOrphans: number;
  resolvedStaleWars: number;
  removedScheduledEvents: number;
}

export type SimulationStabilityIssueCode =
  | 'event-overflow'
  | 'duplicate-event-id'
  | 'broken-causal-link'
  | 'orphan-population-group'
  | 'orphan-trade-route'
  | 'invalid-number'
  | 'stale-active-war';

export interface SimulationStabilityIssue {
  code: SimulationStabilityIssueCode;
  entityId: string;
  message: string;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function nonNegative(value: number, fallback = 0): number {
  return Math.max(0, finite(value, fallback));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function decodeLinks(value: unknown): string[] {
  return typeof value === 'string' ? unique(value.split(LINK_SEPARATOR)) : [];
}

function encodeLinks(values: string[]): string {
  return unique(values).join(LINK_SEPARATOR);
}

function snapshotKey(event: WorldEvent): string | undefined {
  if (!event.tags.includes('state-snapshot')) return undefined;
  for (const [tag, field] of SNAPSHOT_ID_FIELDS) {
    if (!event.tags.includes(tag)) continue;
    const value = event.data?.[field];
    if (typeof value === 'string' && value) return `${tag}:${value}`;
  }
  const snapshotTag = event.tags.find((tag) => tag.endsWith('-state')) ?? 'state-snapshot';
  const fallback = [event.civilizationIds[0], event.factionIds[0], event.systemIds[0]]
    .filter((value): value is string => Boolean(value))
    .join(':');
  return fallback ? `${snapshotTag}:${fallback}` : `${snapshotTag}:${event.id}`;
}

function isImportantEvent(event: WorldEvent): boolean {
  return event.severity >= 9 || event.tags.some((tag) => IMPORTANT_EVENT_TAGS.has(tag));
}

function socialTag(event: WorldEvent): string | undefined {
  return Object.keys(SOCIAL_EVENT_COOLDOWNS).find((tag) => event.tags.includes(tag));
}

function socialSpamKey(event: WorldEvent, tag: string): string {
  return [tag, event.civilizationIds[0] ?? '', event.systemIds[0] ?? ''].join(':');
}

export function socialConflictCooldownYears(tag: string): number {
  return SOCIAL_EVENT_COOLDOWNS[tag] ?? 3;
}

function normalizeNumber(
  current: number,
  next: number,
  report: SimulationStabilityReport
): number {
  if (!Number.isFinite(current) || current !== next) report.normalizedValues += 1;
  return next;
}

function normalizeWorldState(state: SimulationState, report: SimulationStabilityReport): void {
  state.clock.absoluteHour = normalizeNumber(
    state.clock.absoluteHour,
    nonNegative(state.clock.absoluteHour),
    report
  );
  state.clock.epochYear = normalizeNumber(
    state.clock.epochYear,
    Math.round(finite(state.clock.epochYear)),
    report
  );

  for (const [id, system] of Object.entries(state.systems)) {
    system.systemId = id;
    system.population = normalizeNumber(system.population, Math.round(nonNegative(system.population)), report);
    system.prosperity = normalizeNumber(system.prosperity, clamp(system.prosperity), report);
    system.security = normalizeNumber(system.security, clamp(system.security), report);
    system.supply = normalizeNumber(system.supply, clamp(system.supply), report);
    system.tradePressure = normalizeNumber(system.tradePressure, clamp(system.tradePressure), report);
    system.migrationPressure = normalizeNumber(system.migrationPressure, clamp(system.migrationPressure), report);
    system.lastUpdatedHour = normalizeNumber(system.lastUpdatedHour, nonNegative(system.lastUpdatedHour), report);
  }

  for (const [id, civilization] of Object.entries(state.civilizations)) {
    civilization.civilizationId = id;
    civilization.population = normalizeNumber(civilization.population, Math.round(nonNegative(civilization.population)), report);
    civilization.stability = normalizeNumber(civilization.stability, clamp(civilization.stability), report);
    civilization.economy = normalizeNumber(civilization.economy, clamp(civilization.economy), report);
    civilization.military = normalizeNumber(civilization.military, clamp(civilization.military), report);
    civilization.research = normalizeNumber(civilization.research, clamp(civilization.research), report);
    civilization.cohesion = normalizeNumber(civilization.cohesion, clamp(civilization.cohesion), report);
    civilization.expansionPressure = normalizeNumber(civilization.expansionPressure, clamp(civilization.expansionPressure), report);
    civilization.lastUpdatedHour = normalizeNumber(civilization.lastUpdatedHour, nonNegative(civilization.lastUpdatedHour), report);
  }

  for (const [id, faction] of Object.entries(state.factions)) {
    faction.factionId = id;
    faction.wealth = normalizeNumber(faction.wealth, clamp(faction.wealth), report);
    faction.military = normalizeNumber(faction.military, clamp(faction.military), report);
    faction.research = normalizeNumber(faction.research, clamp(faction.research), report);
    faction.influence = normalizeNumber(faction.influence, clamp(faction.influence), report);
    faction.tension = normalizeNumber(faction.tension, clamp(faction.tension), report);
    faction.lastUpdatedHour = normalizeNumber(faction.lastUpdatedHour, nonNegative(faction.lastUpdatedHour), report);
  }

  for (const [id, ecosystem] of Object.entries(state.ecosystems)) {
    ecosystem.planetId = id;
    ecosystem.climateStability = normalizeNumber(ecosystem.climateStability, clamp(ecosystem.climateStability), report);
    ecosystem.biomass = normalizeNumber(ecosystem.biomass, clamp(ecosystem.biomass), report);
    ecosystem.biodiversity = normalizeNumber(ecosystem.biodiversity, clamp(ecosystem.biodiversity), report);
    ecosystem.resilience = normalizeNumber(ecosystem.resilience, clamp(ecosystem.resilience), report);
    ecosystem.contamination = normalizeNumber(ecosystem.contamination, clamp(ecosystem.contamination), report);
    ecosystem.carryingCapacity = normalizeNumber(ecosystem.carryingCapacity, nonNegative(ecosystem.carryingCapacity), report);
    ecosystem.cycle = normalizeNumber(ecosystem.cycle, Math.max(0, Math.round(finite(ecosystem.cycle))), report);
    ecosystem.lastUpdatedHour = normalizeNumber(ecosystem.lastUpdatedHour, nonNegative(ecosystem.lastUpdatedHour), report);
    for (const resource of Object.keys(ecosystem.resources) as Array<keyof typeof ecosystem.resources>) {
      ecosystem.resources[resource] = normalizeNumber(ecosystem.resources[resource], clamp(ecosystem.resources[resource]), report);
    }
    const biomeIds = new Set(ecosystem.biomes.map((biome) => biome.id));
    const speciesIds = new Set(ecosystem.species.map((species) => species.id));
    for (const biome of ecosystem.biomes) {
      biome.coverage = normalizeNumber(biome.coverage, clamp(biome.coverage), report);
      biome.productivity = normalizeNumber(biome.productivity, clamp(biome.productivity), report);
      biome.hazard = normalizeNumber(biome.hazard, clamp(biome.hazard), report);
      biome.temperature = normalizeNumber(biome.temperature, finite(biome.temperature), report);
      biome.humidity = normalizeNumber(biome.humidity, clamp(biome.humidity), report);
    }
    for (const species of ecosystem.species) {
      species.biomeIds = unique(species.biomeIds).filter((biomeId) => biomeIds.has(biomeId));
      species.preyIds = unique(species.preyIds).filter((speciesId) => speciesIds.has(speciesId) && speciesId !== species.id);
      species.predatorIds = unique(species.predatorIds).filter((speciesId) => speciesIds.has(speciesId) && speciesId !== species.id);
      species.abundance = normalizeNumber(species.abundance, clamp(species.abundance), report);
      species.resilience = normalizeNumber(species.resilience, clamp(species.resilience), report);
      species.mobility = normalizeNumber(species.mobility, clamp(species.mobility), report);
      species.aggression = normalizeNumber(species.aggression, clamp(species.aggression), report);
      species.toxicity = normalizeNumber(species.toxicity, clamp(species.toxicity), report);
    }
    for (const pathogen of ecosystem.pathogens) {
      pathogen.hostSpeciesIds = unique(pathogen.hostSpeciesIds).filter((speciesId) => speciesIds.has(speciesId));
      pathogen.virulence = normalizeNumber(pathogen.virulence, clamp(pathogen.virulence), report);
      pathogen.spread = normalizeNumber(pathogen.spread, clamp(pathogen.spread), report);
      pathogen.lethality = normalizeNumber(pathogen.lethality, clamp(pathogen.lethality), report);
    }
    ecosystem.invasiveSpeciesIds = unique(ecosystem.invasiveSpeciesIds).filter((speciesId) => speciesIds.has(speciesId));
    ecosystem.extinctSpeciesIds = unique(ecosystem.extinctSpeciesIds);
  }

  const resources: SettlementResource[] = [
    'food', 'water', 'energy', 'medicine', 'parts', 'weapons', 'luxury', 'rareMaterials'
  ];
  for (const [id, settlement] of Object.entries(state.settlements)) {
    settlement.id = id;
    if (!state.systems[settlement.systemId]) {
      delete state.settlements[id];
      report.removedOrphans += 1;
      continue;
    }
    if (settlement.civilizationId && !state.civilizations[settlement.civilizationId]) {
      settlement.civilizationId = undefined;
      report.removedOrphans += 1;
    }
    if (settlement.ownerFactionId && !state.factions[settlement.ownerFactionId]) {
      settlement.ownerFactionId = undefined;
      report.removedOrphans += 1;
    }
    settlement.population = normalizeNumber(settlement.population, Math.round(nonNegative(settlement.population)), report);
    settlement.infrastructure = normalizeNumber(settlement.infrastructure, clamp(settlement.infrastructure), report);
    settlement.security = normalizeNumber(settlement.security, clamp(settlement.security), report);
    settlement.unrest = normalizeNumber(settlement.unrest, clamp(settlement.unrest), report);
    settlement.housing = normalizeNumber(settlement.housing, clamp(settlement.housing), report);
    settlement.health = normalizeNumber(settlement.health, clamp(settlement.health), report);
    settlement.foundedHour = normalizeNumber(settlement.foundedHour, finite(settlement.foundedHour), report);
    settlement.lastUpdatedHour = normalizeNumber(settlement.lastUpdatedHour, nonNegative(settlement.lastUpdatedHour), report);
    for (const resource of resources) {
      settlement.production[resource] = normalizeNumber(settlement.production[resource], nonNegative(settlement.production[resource]), report);
      settlement.consumption[resource] = normalizeNumber(settlement.consumption[resource], nonNegative(settlement.consumption[resource]), report);
      settlement.stocks[resource] = normalizeNumber(settlement.stocks[resource], nonNegative(settlement.stocks[resource]), report);
    }
    if (settlement.population === 0) settlement.abandoned = true;
  }

  for (const [id, group] of Object.entries(state.populationGroups)) {
    group.id = id;
    const settlement = state.settlements[group.settlementId];
    if (!settlement) {
      delete state.populationGroups[id];
      report.removedOrphans += 1;
      continue;
    }
    if (group.civilizationId && !state.civilizations[group.civilizationId]) {
      group.civilizationId = settlement.civilizationId;
      report.removedOrphans += 1;
    }
    group.population = normalizeNumber(group.population, Math.round(nonNegative(group.population)), report);
    group.wealth = normalizeNumber(group.wealth, clamp(group.wealth), report);
    group.health = normalizeNumber(group.health, clamp(group.health), report);
    group.loyalty = normalizeNumber(group.loyalty, clamp(group.loyalty), report);
    group.radicalization = normalizeNumber(group.radicalization, clamp(group.radicalization), report);
    group.migrationDesire = normalizeNumber(group.migrationDesire, clamp(group.migrationDesire), report);
  }

  const groupsBySettlement = new Map<string, PopulationGroupState[]>();
  for (const group of Object.values(state.populationGroups)) {
    const groups = groupsBySettlement.get(group.settlementId) ?? [];
    groups.push(group);
    groupsBySettlement.set(group.settlementId, groups);
  }
  for (const [settlementId, groups] of groupsBySettlement) {
    const settlement = state.settlements[settlementId];
    if (!settlement || !groups.length) continue;
    const total = groups.reduce((sum, group) => sum + group.population, 0);
    if (total <= 0) continue;
    const difference = Math.abs(total - settlement.population);
    if (difference <= Math.max(5, settlement.population * 0.005)) continue;
    let assigned = 0;
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]!;
      const population = index === groups.length - 1
        ? Math.max(0, settlement.population - assigned)
        : Math.max(0, Math.round(settlement.population * group.population / total));
      if (population !== group.population) report.normalizedValues += 1;
      group.population = population;
      assigned += population;
    }
  }

  for (const [id, route] of Object.entries(state.tradeRoutes)) {
    route.id = id;
    const origin = state.settlements[route.originSettlementId];
    const destination = state.settlements[route.destinationSettlementId];
    if (!origin || !destination || origin.id === destination.id) {
      delete state.tradeRoutes[id];
      report.removedOrphans += 1;
      continue;
    }
    route.pathSystemIds = unique(route.pathSystemIds).filter((systemId) => Boolean(state.systems[systemId]));
    if (!route.pathSystemIds.includes(origin.systemId)) route.pathSystemIds.unshift(origin.systemId);
    if (!route.pathSystemIds.includes(destination.systemId)) route.pathSystemIds.push(destination.systemId);
    route.cargo = unique(route.cargo) as SettlementResource[];
    route.capacity = normalizeNumber(route.capacity, nonNegative(route.capacity), report);
    route.traffic = normalizeNumber(route.traffic, clamp(route.traffic), report);
    route.danger = normalizeNumber(route.danger, clamp(route.danger), report);
    route.lastUpdatedHour = normalizeNumber(route.lastUpdatedHour, nonNegative(route.lastUpdatedHour), report);
    if (origin.abandoned || destination.abandoned || route.pathSystemIds.length < 1) route.disrupted = true;
  }
}

function dedupeScheduledEvents(state: SimulationState, report: SimulationStabilityReport): void {
  const scheduled = state.scheduledEvents as Array<{ id?: unknown; atHour?: unknown }>;
  const seen = new Set<string>();
  const compact: typeof scheduled = [];
  for (const entry of scheduled) {
    const id = typeof entry?.id === 'string' ? entry.id : undefined;
    if (id && seen.has(id)) {
      report.removedScheduledEvents += 1;
      continue;
    }
    if (id) seen.add(id);
    compact.push(entry);
    if (compact.length >= SIMULATION_SCHEDULE_LIMIT) break;
  }
  report.removedScheduledEvents += Math.max(0, scheduled.length - compact.length - report.removedScheduledEvents);
  state.scheduledEvents = compact as SimulationState['scheduledEvents'];
}

function dedupeAndCompactSnapshots(
  events: WorldEvent[],
  report: SimulationStabilityReport
): WorldEvent[] {
  const byId = new Map<string, WorldEvent>();
  for (const event of events) {
    const previous = byId.get(event.id);
    if (!previous || event.atHour > previous.atHour) byId.set(event.id, event);
    if (previous) report.removedDuplicateEvents += 1;
  }
  const sorted = [...byId.values()].sort((a, b) => b.atHour - a.atHour || a.id.localeCompare(b.id));
  const snapshotKeys = new Set<string>();
  const snapshots: WorldEvent[] = [];
  const visible: WorldEvent[] = [];
  for (const event of sorted) {
    const key = snapshotKey(event);
    if (!key) {
      visible.push(event);
      continue;
    }
    if (snapshotKeys.has(key)) {
      report.removedSnapshotEvents += 1;
      continue;
    }
    snapshotKeys.add(key);
    snapshots.push(event);
  }
  const keptSnapshots = snapshots
    .sort((a, b) => {
      const aActive = a.data?.warStatus === 'active' || a.data?.polityStatus === 'active' ? 1 : 0;
      const bActive = b.data?.warStatus === 'active' || b.data?.polityStatus === 'active' ? 1 : 0;
      return bActive - aActive || b.atHour - a.atHour;
    })
    .slice(0, SIMULATION_SNAPSHOT_LIMIT);
  report.removedSnapshotEvents += Math.max(0, snapshots.length - keptSnapshots.length);
  return [...keptSnapshots, ...visible].sort((a, b) => b.atHour - a.atHour || a.id.localeCompare(b.id));
}

function compactSocialSpam(events: WorldEvent[], report: SimulationStabilityReport): WorldEvent[] {
  const referenced = new Set<string>();
  for (const event of events) {
    for (const id of [...decodeLinks(event.data?.causedByEventIds), ...decodeLinks(event.data?.resultedInEventIds)]) {
      referenced.add(id);
    }
  }
  const lastByKey = new Map<string, number>();
  return events.filter((event) => {
    const tag = socialTag(event);
    if (!tag || referenced.has(event.id) || isImportantEvent(event)) return true;
    const key = socialSpamKey(event, tag);
    const lastHour = lastByKey.get(key);
    if (lastHour !== undefined && lastHour - event.atHour < socialConflictCooldownYears(tag) * HOURS_PER_YEAR) {
      report.removedSpamEvents += 1;
      return false;
    }
    lastByKey.set(key, event.atHour);
    return true;
  });
}

function resolveStaleWars(state: SimulationState, report: SimulationStabilityReport): void {
  const snapshots = state.events.filter((event) => event.tags.includes('living-war-state'));
  for (const snapshot of snapshots) {
    if (snapshot.data?.warStatus !== 'active') continue;
    const warId = typeof snapshot.data?.warId === 'string' ? snapshot.data.warId : snapshot.id;
    const startedHour = typeof snapshot.data?.warStartedHour === 'number' ? snapshot.data.warStartedHour : snapshot.atHour;
    const lastUpdatedHour = typeof snapshot.data?.warLastUpdatedHour === 'number' ? snapshot.data.warLastUpdatedHour : snapshot.atHour;
    const attackerExhaustion = typeof snapshot.data?.attackerWarExhaustion === 'number' ? snapshot.data.attackerWarExhaustion : 0;
    const defenderExhaustion = typeof snapshot.data?.defenderWarExhaustion === 'number' ? snapshot.data.defenderWarExhaustion : 0;
    const ageYears = (state.clock.absoluteHour - startedHour) / HOURS_PER_YEAR;
    const idleYears = (state.clock.absoluteHour - lastUpdatedHour) / HOURS_PER_YEAR;
    const noFronts = typeof snapshot.data?.warFronts !== 'string' || snapshot.data.warFronts.length === 0;
    const exhausted = ageYears >= 3 && Math.max(attackerExhaustion, defenderExhaustion) >= 99;
    if (
      ageYears < MAX_ACTIVE_WAR_YEARS &&
      idleYears < MAX_IDLE_WAR_YEARS &&
      !exhausted &&
      !(noFronts && ageYears >= 1)
    ) continue;

    snapshot.atHour = state.clock.absoluteHour;
    snapshot.data = {
      ...(snapshot.data ?? {}),
      warStatus: 'resolved',
      warEndedHour: state.clock.absoluteHour,
      warLastUpdatedHour: state.clock.absoluteHour
    };
    report.resolvedStaleWars += 1;

    const alreadyRecorded = state.events.some(
      (event) => event.tags.includes('stability-war-resolution') && event.data?.warId === warId
    );
    if (alreadyRecorded) continue;
    const cause = state.events.find(
      (event) => event.id !== snapshot.id && event.tags.includes('living-war') && event.data?.warId === warId
    );
    const event: WorldEvent = {
      id: `world_${state.nextSequence}_stability-war_${warId}_${Math.floor(state.clock.absoluteHour)}`,
      atHour: state.clock.absoluteHour,
      kind: 'conflict',
      title: `${typeof snapshot.data?.warName === 'string' ? snapshot.data.warName : 'Война'}: конфликт исчерпан`,
      summary: ageYears >= MAX_ACTIVE_WAR_YEARS
        ? `Война завершена после ${Math.round(ageYears)} лет без устойчивого решения.`
        : 'Стороны утратили способность поддерживать активные боевые действия.',
      severity: 7,
      visibility: 'public',
      systemIds: [...snapshot.systemIds],
      civilizationIds: [...snapshot.civilizationIds],
      factionIds: [...snapshot.factionIds],
      tags: ['simulation', 'living-history', 'living-war', 'war-ended', 'stability-war-resolution', 'causal-history'],
      data: {
        warId,
        warStatus: 'resolved',
        warEndedHour: state.clock.absoluteHour,
        ...(cause ? { causedByEventIds: cause.id } : {})
      }
    };
    state.nextSequence += 1;
    state.events.unshift(event);
  }
}

function capEvents(events: WorldEvent[]): WorldEvent[] {
  const snapshots = events
    .filter((event) => event.tags.includes('state-snapshot'))
    .slice(0, SIMULATION_SNAPSHOT_LIMIT);
  const visible = events.filter((event) => !event.tags.includes('state-snapshot'));
  const visibleCapacity = Math.max(
    0,
    Math.min(SIMULATION_VISIBLE_EVENT_LIMIT, SIMULATION_EVENT_LIMIT - snapshots.length)
  );
  const selected = new Map<string, WorldEvent>();

  for (const event of visible.filter(isImportantEvent)) {
    if (selected.size >= Math.min(800, visibleCapacity)) break;
    selected.set(event.id, event);
  }
  const causalReserve = Math.min(400, Math.max(0, visibleCapacity - selected.size));
  const recentTarget = Math.max(selected.size, visibleCapacity - causalReserve);
  for (const event of visible) {
    if (selected.size >= recentTarget) break;
    selected.set(event.id, event);
  }

  const byId = new Map(events.map((event) => [event.id, event]));
  const queue = [...selected.values()];
  while (queue.length && selected.size < visibleCapacity) {
    const event = queue.shift();
    if (!event) continue;
    for (const id of [...decodeLinks(event.data?.causedByEventIds), ...decodeLinks(event.data?.resultedInEventIds)]) {
      const linked = byId.get(id);
      if (!linked || linked.tags.includes('state-snapshot') || selected.has(id)) continue;
      selected.set(id, linked);
      queue.push(linked);
      if (selected.size >= visibleCapacity) break;
    }
  }
  for (const event of visible) {
    if (selected.size >= visibleCapacity) break;
    selected.set(event.id, event);
  }

  return [...snapshots, ...selected.values()]
    .sort((a, b) => b.atHour - a.atHour || a.id.localeCompare(b.id));
}

function repairCausalLinks(state: SimulationState, report: SimulationStabilityReport): void {
  const byId = new Map(state.events.map((event) => [event.id, event]));
  const causesByEvent = new Map<string, Set<string>>();
  const resultsByEvent = new Map<string, Set<string>>();

  for (const event of state.events) {
    const causes = new Set<string>();
    for (const id of decodeLinks(event.data?.causedByEventIds)) {
      if (id === event.id || !byId.has(id)) {
        report.removedBrokenLinks += 1;
        continue;
      }
      causes.add(id);
    }
    const results = new Set<string>();
    for (const id of decodeLinks(event.data?.resultedInEventIds)) {
      if (id === event.id || !byId.has(id)) {
        report.removedBrokenLinks += 1;
        continue;
      }
      results.add(id);
    }
    causesByEvent.set(event.id, causes);
    resultsByEvent.set(event.id, results);
  }

  for (const [eventId, causes] of causesByEvent) {
    for (const causeId of causes) {
      const reverse = resultsByEvent.get(causeId);
      if (reverse && !reverse.has(eventId)) {
        reverse.add(eventId);
        report.repairedReverseLinks += 1;
      }
    }
  }
  for (const [eventId, results] of resultsByEvent) {
    for (const resultId of results) {
      const reverse = causesByEvent.get(resultId);
      if (reverse && !reverse.has(eventId)) {
        reverse.add(eventId);
        report.repairedReverseLinks += 1;
      }
    }
  }

  for (const event of state.events) {
    const data = { ...(event.data ?? {}) };
    const causes = [...(causesByEvent.get(event.id) ?? [])];
    const results = [...(resultsByEvent.get(event.id) ?? [])];
    if (causes.length) data.causedByEventIds = encodeLinks(causes);
    else delete data.causedByEventIds;
    if (results.length) data.resultedInEventIds = encodeLinks(results);
    else delete data.resultedInEventIds;
    event.data = data;
  }
}

function updateNextSequence(state: SimulationState, report: SimulationStabilityReport): void {
  let maxSequence = 0;
  for (const event of state.events) {
    const match = /^world_(\d+)_/.exec(event.id);
    if (match) maxSequence = Math.max(maxSequence, Number(match[1]));
  }
  const next = Math.max(1, Math.round(nonNegative(state.nextSequence, 1)), maxSequence + 1);
  state.nextSequence = normalizeNumber(state.nextSequence, next, report);
}

export function maintainSimulationStability(state: SimulationState): SimulationStabilityReport {
  const report: SimulationStabilityReport = {
    eventCountBefore: state.events.length,
    eventCountAfter: 0,
    removedDuplicateEvents: 0,
    removedSnapshotEvents: 0,
    removedSpamEvents: 0,
    removedBrokenLinks: 0,
    repairedReverseLinks: 0,
    normalizedValues: 0,
    removedOrphans: 0,
    resolvedStaleWars: 0,
    removedScheduledEvents: 0
  };

  normalizeWorldState(state, report);
  dedupeScheduledEvents(state, report);
  state.events = dedupeAndCompactSnapshots(state.events, report);
  resolveStaleWars(state, report);
  state.events = compactSocialSpam(state.events, report);
  state.events = capEvents(state.events);
  repairCausalLinks(state, report);
  updateNextSequence(state, report);
  report.eventCountAfter = state.events.length;
  return report;
}

export function auditSimulationState(state: SimulationState): SimulationStabilityIssue[] {
  const issues: SimulationStabilityIssue[] = [];
  if (state.events.length > SIMULATION_EVENT_LIMIT) {
    issues.push({ code: 'event-overflow', entityId: 'events', message: `Событий ${state.events.length}, лимит ${SIMULATION_EVENT_LIMIT}.` });
  }
  const ids = new Set<string>();
  const eventIds = new Set(state.events.map((event) => event.id));
  for (const event of state.events) {
    if (ids.has(event.id)) issues.push({ code: 'duplicate-event-id', entityId: event.id, message: 'Повторяющийся ID события.' });
    ids.add(event.id);
    for (const linkedId of [...decodeLinks(event.data?.causedByEventIds), ...decodeLinks(event.data?.resultedInEventIds)]) {
      if (!eventIds.has(linkedId)) issues.push({ code: 'broken-causal-link', entityId: event.id, message: `Ссылка ведёт на отсутствующее событие ${linkedId}.` });
    }
    if (event.tags.includes('living-war-state') && event.data?.warStatus === 'active') {
      const started = typeof event.data?.warStartedHour === 'number' ? event.data.warStartedHour : event.atHour;
      if ((state.clock.absoluteHour - started) / HOURS_PER_YEAR >= MAX_ACTIVE_WAR_YEARS) {
        issues.push({ code: 'stale-active-war', entityId: typeof event.data?.warId === 'string' ? event.data.warId : event.id, message: 'Война длится дольше допустимого срока.' });
      }
    }
  }
  for (const group of Object.values(state.populationGroups)) {
    if (!state.settlements[group.settlementId]) issues.push({ code: 'orphan-population-group', entityId: group.id, message: 'Группа не привязана к существующему поселению.' });
    if (![group.population, group.wealth, group.health, group.loyalty, group.radicalization, group.migrationDesire].every(Number.isFinite)) {
      issues.push({ code: 'invalid-number', entityId: group.id, message: 'Группа содержит некорректные числовые значения.' });
    }
  }
  for (const route of Object.values(state.tradeRoutes)) {
    if (!state.settlements[route.originSettlementId] || !state.settlements[route.destinationSettlementId]) {
      issues.push({ code: 'orphan-trade-route', entityId: route.id, message: 'Маршрут связан с отсутствующим поселением.' });
    }
  }
  return issues;
}
