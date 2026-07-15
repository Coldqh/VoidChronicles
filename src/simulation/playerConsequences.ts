import type { Contract, Faction } from '../game/types';
import { causalizeDraft } from './causality';
import { recomputeSystemFromSettlements } from './economy';
import type {
  SettlementResource,
  SettlementState,
  SimulationState,
  WorldEvent,
  WorldEventDraft
} from './types';
import { liveWars, writeWarSnapshot } from './war';
import { sourceEventIdForContract, worldNeedForContract, type WorldNeedKind } from './worldGameplay';

export type PlayerWorldActionKind =
  | 'deliver-relief'
  | 'evacuate-civilians'
  | 'secure-route'
  | 'restore-ecosystem'
  | 'recover-heritage'
  | 'investigate-crisis'
  | 'mediate-conflict'
  | 'contain-disaster'
  | 'support-faction'
  | 'sabotage-infrastructure'
  | 'abandon-crisis';

export interface PlayerWorldAction {
  kind: PlayerWorldActionKind;
  atHour?: number;
  sourceEventId?: string;
  contractId?: string;
  targetSystemId?: string;
  targetSettlementId?: string;
  targetRouteId?: string;
  targetPlanetId?: string;
  targetFactionId?: string;
  artifactId?: string;
  archiveId?: string;
  magnitude?: number;
  successful?: boolean;
}

export interface PlayerConsequenceResult {
  event: WorldEvent;
  changedEntityIds: string[];
}

const VITAL: SettlementResource[] = ['food', 'water', 'energy', 'medicine'];
const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const unique = (values: Array<string | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

function actionForNeed(kind: WorldNeedKind): PlayerWorldActionKind {
  if (kind === 'relief') return 'deliver-relief';
  if (kind === 'evacuation') return 'evacuate-civilians';
  if (kind === 'route-security') return 'secure-route';
  if (kind === 'ecological-restoration') return 'restore-ecosystem';
  if (kind === 'heritage-recovery') return 'recover-heritage';
  if (kind === 'mediation') return 'mediate-conflict';
  if (kind === 'containment') return 'contain-disaster';
  return 'investigate-crisis';
}

function settlementsInSystem(state: SimulationState, systemId?: string): SettlementState[] {
  if (!systemId) return [];
  return Object.values(state.settlements)
    .filter((settlement) => settlement.systemId === systemId && !settlement.abandoned)
    .sort((a, b) => b.population - a.population);
}

function targetSettlement(state: SimulationState, action: PlayerWorldAction, source?: WorldEvent): SettlementState | undefined {
  if (action.targetSettlementId) return state.settlements[action.targetSettlementId];
  const fromSource = typeof source?.data?.settlementId === 'string'
    ? state.settlements[source.data.settlementId]
    : undefined;
  return fromSource ?? settlementsInSystem(state, action.targetSystemId ?? source?.systemIds[0])[0];
}

function relief(state: SimulationState, settlement: SettlementState, magnitude: number, atHour: number): string[] {
  for (const resource of VITAL) {
    const reserve = settlement.consumption[resource] * (20 + magnitude * 8);
    settlement.stocks[resource] = Math.min(5_000_000, settlement.stocks[resource] + reserve);
  }
  settlement.health = clamp(settlement.health + 4 + magnitude * 1.5);
  settlement.unrest = clamp(settlement.unrest - 6 - magnitude * 2);
  settlement.security = clamp(settlement.security + magnitude);
  settlement.lastUpdatedHour = atHour;
  recomputeSystemFromSettlements(state, settlement.systemId, atHour);
  return [settlement.id, settlement.systemId];
}

function evacuate(state: SimulationState, settlement: SettlementState, magnitude: number, atHour: number): string[] {
  const candidates = Object.values(state.settlements)
    .filter((entry) =>
      entry.id !== settlement.id &&
      !entry.abandoned &&
      entry.civilizationId === settlement.civilizationId &&
      entry.security > settlement.security &&
      entry.housing > 40
    )
    .sort((a, b) => (b.security + b.housing - b.unrest) - (a.security + a.housing - a.unrest));
  const destination = candidates[0];
  const moved = Math.max(50, Math.round(settlement.population * Math.min(0.28, 0.04 + magnitude * 0.025)));
  settlement.population = Math.max(0, settlement.population - moved);
  settlement.unrest = clamp(settlement.unrest - 3 - magnitude);
  settlement.lastUpdatedHour = atHour;
  if (destination) {
    destination.population += moved;
    destination.housing = clamp(destination.housing - Math.min(12, magnitude * 1.5));
    destination.lastUpdatedHour = atHour;
  }
  const groups = Object.values(state.populationGroups).filter((group) => group.settlementId === settlement.id);
  const total = groups.reduce((sum, group) => sum + group.population, 0);
  for (const group of groups) {
    const share = total > 0 ? group.population / total : 0;
    const groupMoved = Math.min(group.population, Math.round(moved * share));
    group.population -= groupMoved;
    group.migrationDesire = clamp(group.migrationDesire - 15);
    if (destination && groupMoved > 0) {
      const migrantId = `population_${destination.id}_migrants_${group.culture.replace(/\s+/g, '_')}`;
      const existing = state.populationGroups[migrantId];
      state.populationGroups[migrantId] = existing
        ? { ...existing, population: existing.population + groupMoved, migrationDesire: clamp(existing.migrationDesire - 5) }
        : {
            ...group,
            id: migrantId,
            settlementId: destination.id,
            socialClass: 'migrants',
            population: groupMoved,
            wealth: clamp(group.wealth - 12),
            loyalty: clamp(group.loyalty - 8),
            radicalization: clamp(group.radicalization + 4),
            migrationDesire: 22
          };
    }
  }
  recomputeSystemFromSettlements(state, settlement.systemId, atHour);
  if (destination) recomputeSystemFromSettlements(state, destination.systemId, atHour);
  return unique([settlement.id, settlement.systemId, destination?.id, destination?.systemId]);
}

function secureRoute(state: SimulationState, systemId: string | undefined, routeId: string | undefined, magnitude: number, atHour: number): string[] {
  const routes = Object.values(state.tradeRoutes).filter((route) =>
    route.id === routeId || Boolean(systemId && route.pathSystemIds.includes(systemId))
  );
  const changed: string[] = [];
  for (const route of routes) {
    route.disrupted = false;
    route.danger = clamp(route.danger - 12 - magnitude * 4);
    route.traffic = clamp(route.traffic + 8 + magnitude * 3);
    route.capacity = Math.max(route.capacity, route.capacity * (1 + magnitude * 0.025));
    route.lastUpdatedHour = atHour;
    changed.push(route.id);
  }
  if (systemId && state.systems[systemId]) {
    state.systems[systemId]!.security = clamp(state.systems[systemId]!.security + 4 + magnitude * 2);
    state.systems[systemId]!.supply = clamp(state.systems[systemId]!.supply + 5 + magnitude * 2);
    state.systems[systemId]!.tradePressure = clamp(state.systems[systemId]!.tradePressure - 4 - magnitude);
    state.systems[systemId]!.lastUpdatedHour = atHour;
    changed.push(systemId);
  }
  return changed;
}

function restoreEcosystem(state: SimulationState, planetId: string | undefined, systemId: string | undefined, magnitude: number, atHour: number): string[] {
  const resolvedPlanetId = planetId ?? settlementsInSystem(state, systemId).find((entry) => entry.planetId)?.planetId;
  const ecology = resolvedPlanetId ? state.ecosystems[resolvedPlanetId] : undefined;
  if (!resolvedPlanetId || !ecology) return [];
  ecology.contamination = clamp(ecology.contamination - 8 - magnitude * 4);
  ecology.biodiversity = clamp(ecology.biodiversity + 3 + magnitude * 1.5);
  ecology.resilience = clamp(ecology.resilience + 4 + magnitude * 2);
  ecology.climateStability = clamp(ecology.climateStability + 2 + magnitude);
  ecology.biomass = Math.max(0, ecology.biomass * (1 + 0.01 * magnitude));
  ecology.lastUpdatedHour = atHour;
  return [resolvedPlanetId];
}

function heritageSnapshot(
  state: SimulationState,
  source: WorldEvent | undefined,
  action: PlayerWorldAction,
  atHour: number
): string[] {
  const artifactId = action.artifactId ??
    (typeof source?.data?.heritageArtifactId === 'string' ? source.data.heritageArtifactId : undefined) ??
    (typeof source?.data?.artifactId === 'string' ? source.data.artifactId : undefined);
  const archiveId = action.archiveId ??
    (typeof source?.data?.archiveId === 'string' ? source.data.archiveId : undefined);
  const changed: string[] = [];

  if (artifactId) {
    const previous = state.events.find((event) =>
      event.tags.includes('living-artifact-state') && event.data?.heritageArtifactId === artifactId
    );
    const data: Record<string, string | number | boolean> = { ...(previous?.data ?? {}), heritageArtifactId: artifactId };
    data.heritageCivilizationId = typeof data.heritageCivilizationId === 'string'
      ? data.heritageCivilizationId
      : source?.civilizationIds[0] ?? '';
    data.heritageArtifactStatus = 'recovered';
    data.heritageArtifactOwnerId = action.targetFactionId ?? 'player-returned-public-trust';
    data.heritageArtifactKnowledge = clamp((typeof data.heritageArtifactKnowledge === 'number' ? data.heritageArtifactKnowledge : 20) + 35);
    data.heritageArtifactIntegrity = clamp((typeof data.heritageArtifactIntegrity === 'number' ? data.heritageArtifactIntegrity : 70) + 6);
    data.heritageArtifactEvents = `${typeof data.heritageArtifactEvents === 'string' ? `${data.heritageArtifactEvents}|` : ''}player:${action.contractId ?? atHour}`;
    data.heritageArtifactUpdatedHour = atHour;
    const snapshot: WorldEvent = {
      id: `state_artifact_${artifactId}_player_${atHour}`,
      atHour,
      kind: 'discovery',
      title: 'Состояние возвращённого артефакта',
      summary: 'Служебный снимок наследия после вмешательства игрока.',
      severity: 0,
      visibility: 'hidden',
      systemIds: unique([action.targetSystemId, source?.systemIds[0]]),
      civilizationIds: unique([source?.civilizationIds[0]]),
      factionIds: unique([action.targetFactionId]),
      tags: ['simulation', 'living-history', 'living-artifact-state', 'state-snapshot'],
      data
    };
    state.events = [snapshot, ...state.events.filter((event) => !(event.tags.includes('living-artifact-state') && event.data?.heritageArtifactId === artifactId))].slice(0, 8_500);
    changed.push(artifactId);
  }

  if (archiveId) {
    const previous = state.events.find((event) =>
      event.tags.includes('living-archive-state') && event.data?.archiveId === archiveId
    );
    const data: Record<string, string | number | boolean> = { ...(previous?.data ?? {}), archiveId };
    data.archiveCivilizationId = typeof data.archiveCivilizationId === 'string'
      ? data.archiveCivilizationId
      : source?.civilizationIds[0] ?? '';
    data.archiveAccessibility = clamp((typeof data.archiveAccessibility === 'number' ? data.archiveAccessibility : 25) + 28);
    data.archiveDeciphered = clamp((typeof data.archiveDeciphered === 'number' ? data.archiveDeciphered : 10) + 22);
    data.archiveSecrecy = clamp((typeof data.archiveSecrecy === 'number' ? data.archiveSecrecy : 50) - 18);
    data.archiveIntegrity = clamp((typeof data.archiveIntegrity === 'number' ? data.archiveIntegrity : 65) + 8);
    data.archiveUpdatedHour = atHour;
    const snapshot: WorldEvent = {
      id: `state_archive_${archiveId}_player_${atHour}`,
      atHour,
      kind: 'discovery',
      title: 'Состояние открытого архива',
      summary: 'Служебный снимок архива после вмешательства игрока.',
      severity: 0,
      visibility: 'hidden',
      systemIds: unique([action.targetSystemId, source?.systemIds[0]]),
      civilizationIds: unique([source?.civilizationIds[0]]),
      factionIds: unique([action.targetFactionId]),
      tags: ['simulation', 'living-history', 'living-archive-state', 'state-snapshot'],
      data
    };
    state.events = [snapshot, ...state.events.filter((event) => !(event.tags.includes('living-archive-state') && event.data?.archiveId === archiveId))].slice(0, 8_500);
    changed.push(archiveId);
  }
  return changed;
}

function mediateWar(state: SimulationState, systemId: string | undefined, magnitude: number, atHour: number): string[] {
  const war = liveWars(state).find((entry) =>
    entry.status === 'active' && (!systemId || entry.fronts.some((front) => front.systemId === systemId))
  );
  if (!war) return [];
  war.attackerWarExhaustion = clamp(war.attackerWarExhaustion + 5 + magnitude * 3);
  war.defenderWarExhaustion = clamp(war.defenderWarExhaustion + 5 + magnitude * 3);
  war.fronts = war.fronts.map((front) => ({
    ...front,
    intensity: clamp(front.intensity - 8 - magnitude * 3),
    attackerControl: clamp(front.attackerControl),
    defenderControl: clamp(front.defenderControl)
  }));
  if (war.fronts.every((front) => front.intensity <= 18) ||
      (war.attackerWarExhaustion >= 78 && war.defenderWarExhaustion >= 78)) {
    war.status = 'ceasefire';
    war.endedHour = atHour;
  }
  writeWarSnapshot(state, war, atHour);
  return [war.id, ...war.fronts.map((front) => front.systemId)];
}

function supportFaction(state: SimulationState, factionId: string | undefined, magnitude: number, atHour: number): string[] {
  if (!factionId || !state.factions[factionId]) return [];
  const faction = state.factions[factionId]!;
  faction.influence = clamp(faction.influence + 3 + magnitude * 2);
  faction.wealth = clamp(faction.wealth + 2 + magnitude * 1.5);
  faction.tension = clamp(faction.tension - 2 - magnitude);
  faction.lastUpdatedHour = atHour;
  return [factionId];
}

function sabotage(state: SimulationState, settlement: SettlementState | undefined, systemId: string | undefined, magnitude: number, atHour: number): string[] {
  const changed: string[] = [];
  if (settlement) {
    settlement.infrastructure = clamp(settlement.infrastructure - 5 - magnitude * 3);
    settlement.security = clamp(settlement.security - 4 - magnitude * 2);
    settlement.unrest = clamp(settlement.unrest + 5 + magnitude * 2);
    settlement.lastUpdatedHour = atHour;
    changed.push(settlement.id);
    recomputeSystemFromSettlements(state, settlement.systemId, atHour);
  }
  for (const route of Object.values(state.tradeRoutes).filter((entry) =>
    systemId ? entry.pathSystemIds.includes(systemId) : false
  )) {
    route.disrupted = true;
    route.danger = clamp(route.danger + 10 + magnitude * 3);
    route.traffic = clamp(route.traffic - 8 - magnitude * 2);
    route.lastUpdatedHour = atHour;
    changed.push(route.id);
  }
  return changed;
}

function abandon(state: SimulationState, source: WorldEvent | undefined, systemId: string | undefined, magnitude: number, atHour: number): string[] {
  const settlement = targetSettlement(state, { kind: 'abandon-crisis', targetSystemId: systemId }, source);
  const changed: string[] = [];
  if (settlement) {
    settlement.health = clamp(settlement.health - 3 - magnitude * 2);
    settlement.unrest = clamp(settlement.unrest + 5 + magnitude * 2);
    settlement.security = clamp(settlement.security - 2 - magnitude);
    settlement.lastUpdatedHour = atHour;
    changed.push(settlement.id);
    recomputeSystemFromSettlements(state, settlement.systemId, atHour);
  }
  const ecology = restoreEcosystem(state, undefined, systemId, -Math.max(1, magnitude), atHour);
  changed.push(...ecology);
  if (systemId && state.systems[systemId]) {
    state.systems[systemId]!.migrationPressure = clamp(state.systems[systemId]!.migrationPressure + 5 + magnitude * 2);
    state.systems[systemId]!.supply = clamp(state.systems[systemId]!.supply - 4 - magnitude);
    changed.push(systemId);
  }
  return unique(changed);
}

function titleFor(action: PlayerWorldActionKind, successful: boolean): string {
  if (!successful || action === 'abandon-crisis') return 'Кризис остался без помощи игрока';
  return {
    'deliver-relief': 'Игрок восстановил снабжение',
    'evacuate-civilians': 'Игрок провёл эвакуацию',
    'secure-route': 'Игрок восстановил безопасный маршрут',
    'restore-ecosystem': 'Игрок поддержал восстановление биосферы',
    'recover-heritage': 'Игрок вернул историческое наследие',
    'investigate-crisis': 'Игрок раскрыл причину кризиса',
    'mediate-conflict': 'Игрок вмешался в мирные переговоры',
    'contain-disaster': 'Игрок локализовал катастрофу',
    'support-faction': 'Игрок усилил выбранную фракцию',
    'sabotage-infrastructure': 'Игрок повредил инфраструктуру',
    'abandon-crisis': 'Кризис остался без помощи игрока'
  }[action];
}

function summaryFor(action: PlayerWorldActionKind, successful: boolean, changed: number): string {
  if (!successful || action === 'abandon-crisis') {
    return `Заявка не была выполнена. Состояние региона ухудшилось; затронуто сущностей: ${changed}.`;
  }
  return `Действие капитана изменило состояние живой симуляции. Затронуто сущностей: ${changed}.`;
}

export function applyPlayerWorldAction(
  state: SimulationState,
  action: PlayerWorldAction,
  factions: Faction[] = []
): PlayerConsequenceResult {
  const atHour = Math.max(state.clock.absoluteHour, Math.floor(action.atHour ?? state.clock.absoluteHour));
  const source = action.sourceEventId
    ? state.events.find((event) => event.id === action.sourceEventId)
    : undefined;
  const systemId = action.targetSystemId ?? source?.systemIds[0];
  const magnitude = Math.max(1, Math.min(10, action.magnitude ?? Math.ceil((source?.severity ?? 5) / 2)));
  const settlement = targetSettlement(state, action, source);
  let changed: string[] = [];

  if (action.kind === 'deliver-relief' && settlement) changed = relief(state, settlement, magnitude, atHour);
  else if (action.kind === 'evacuate-civilians' && settlement) changed = evacuate(state, settlement, magnitude, atHour);
  else if (action.kind === 'secure-route') changed = secureRoute(state, systemId, action.targetRouteId, magnitude, atHour);
  else if (action.kind === 'restore-ecosystem') changed = restoreEcosystem(state, action.targetPlanetId, systemId, magnitude, atHour);
  else if (action.kind === 'recover-heritage' || action.kind === 'investigate-crisis') changed = heritageSnapshot(state, source, action, atHour);
  else if (action.kind === 'mediate-conflict') changed = mediateWar(state, systemId, magnitude, atHour);
  else if (action.kind === 'contain-disaster') {
    changed = settlement ? relief(state, settlement, Math.max(1, magnitude - 1), atHour) : [];
    changed.push(...restoreEcosystem(state, action.targetPlanetId, systemId, Math.max(1, magnitude - 1), atHour));
  } else if (action.kind === 'support-faction') changed = supportFaction(state, action.targetFactionId, magnitude, atHour);
  else if (action.kind === 'sabotage-infrastructure') changed = sabotage(state, settlement, systemId, magnitude, atHour);
  else if (action.kind === 'abandon-crisis') changed = abandon(state, source, systemId, magnitude, atHour);

  if (action.targetFactionId && action.kind !== 'support-faction') {
    changed.push(...supportFaction(state, action.targetFactionId, Math.max(1, Math.floor(magnitude / 2)), atHour));
  } else if (action.contractId) {
    const issuer = factions.find((faction) => faction.id === action.targetFactionId) ?? factions[0];
    if (issuer) changed.push(...supportFaction(state, issuer.id, 1, atHour));
  }
  changed = unique(changed);
  const successful = action.successful !== false && action.kind !== 'abandon-crisis';
  const eventId = `world_${state.nextSequence}_player-action_${action.kind}_${atHour}`;
  const draft: WorldEventDraft = {
    kind: action.kind === 'restore-ecosystem' ? 'ecology' :
      action.kind === 'mediate-conflict' || action.kind === 'secure-route' || action.kind === 'sabotage-infrastructure' ? 'conflict' :
        action.kind === 'recover-heritage' || action.kind === 'investigate-crisis' ? 'discovery' :
          action.kind === 'deliver-relief' || action.kind === 'contain-disaster' ? 'shortage' :
            action.kind === 'evacuate-civilians' ? 'migration' : 'politics',
    title: titleFor(action.kind, successful),
    summary: summaryFor(action.kind, successful, changed.length),
    severity: successful ? Math.max(4, Math.min(9, magnitude + 3)) : Math.max(6, Math.min(10, magnitude + 4)),
    visibility: 'public',
    systemIds: unique([systemId, ...changed.filter((id) => state.systems[id] !== undefined)]),
    civilizationIds: unique([...(source?.civilizationIds ?? []), settlement?.civilizationId]),
    factionIds: unique([action.targetFactionId, ...(source?.factionIds ?? [])]),
    tags: [
      'simulation',
      'living-history',
      'player-world-consequence',
      'player-action',
      successful ? 'contract-success' : 'contract-failure',
      action.kind
    ],
    data: {
      playerActionKind: action.kind,
      playerActionSuccessful: successful,
      playerActionMagnitude: magnitude,
      ...(action.contractId ? { contractId: action.contractId } : {}),
      ...(action.sourceEventId ? { sourceEventId: action.sourceEventId } : {}),
      ...(systemId ? { targetSystemId: systemId } : {}),
      changedEntityCount: changed.length
    }
  };
  const causal = causalizeDraft(state, draft, {
    causeEventIds: action.sourceEventId ? [action.sourceEventId] : [],
    changedEntityIds: changed,
    prospectiveEventId: eventId
  });
  const event: WorldEvent = { ...causal, id: eventId, atHour };
  state.events = [event, ...state.events].slice(0, 8_500);
  state.nextSequence += 1;
  state.lastAdvanceReason = `player-world-action:${action.kind}`;
  return { event, changedEntityIds: changed };
}

function reconciled(state: SimulationState, contractId: string): boolean {
  return state.events.some((event) =>
    event.tags.includes('player-world-consequence') && event.data?.contractId === contractId
  );
}

export function reconcileWorldContractConsequences(
  state: SimulationState,
  contracts: Contract[],
  factions: Faction[] = []
): WorldEvent[] {
  const emitted: WorldEvent[] = [];
  for (const contract of contracts) {
    if (!['completed', 'failed', 'expired'].includes(contract.status)) continue;
    const sourceEventId = sourceEventIdForContract(contract);
    if (!sourceEventId || reconciled(state, contract.id)) continue;
    const need = worldNeedForContract(contract, state.events);
    const successful = contract.status === 'completed';
    const kind = successful ? actionForNeed(need?.kind ?? ({ delivery: 'relief', rescue: 'evacuation', bounty: 'route-security', recovery: 'heritage-recovery', survey: 'investigation', smuggling: 'investigation' } as Record<Contract['type'], WorldNeedKind>)[contract.type]) : 'abandon-crisis';
    const result = applyPlayerWorldAction(state, {
      kind,
      successful,
      sourceEventId,
      contractId: contract.id,
      targetSystemId: contract.targetSystemId,
      targetFactionId: contract.issuerFactionId,
      magnitude: Math.max(2, Math.ceil((need?.urgency ?? 50) / 20))
    }, factions);
    emitted.push(result.event);
  }
  return emitted;
}
