import type { Civilization } from '../game/types';
import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import {
  causalizeDraft,
  prospectiveCivilizationCycleEventId,
  recentCausalEvents
} from './causality';
import {
  livePolities,
  polityFormLabel,
  writePolitySnapshot,
  type LivePolityState
} from './polities';
import type { SimulationState, WorldEvent, WorldEventDraft } from './types';

const HOURS_PER_DAY = 24;
const HOURS_PER_YEAR = 365 * HOURS_PER_DAY;
const STATE_TAG = 'living-war-state';
const FIELD_SEPARATOR = '|';

export type LiveWarGoal =
  | 'conquest'
  | 'liberation'
  | 'tribute'
  | 'containment'
  | 'succession'
  | 'resources';
export type LiveWarStatus = 'active' | 'ceasefire' | 'resolved';

export interface LiveWarFront {
  id: string;
  systemId: string;
  attackerControl: number;
  defenderControl: number;
  intensity: number;
  attackerSupply: number;
  defenderSupply: number;
  fortification: number;
  occupation: number;
}

export interface LiveWarState {
  id: string;
  name: string;
  attackerPolityIds: string[];
  defenderPolityIds: string[];
  civilizationIds: string[];
  goal: LiveWarGoal;
  status: LiveWarStatus;
  startedHour: number;
  endedHour?: number;
  fronts: LiveWarFront[];
  attackerStrength: number;
  defenderStrength: number;
  attackerSupply: number;
  defenderSupply: number;
  attackerWarExhaustion: number;
  defenderWarExhaustion: number;
  casualties: number;
  occupiedSystemIds: string[];
  causeEventIds: string[];
  lastUpdatedHour: number;
}

const GOAL_LABELS: Record<LiveWarGoal, string> = {
  conquest: 'захват территории',
  liberation: 'освобождение территории',
  tribute: 'принуждение к выплатам',
  containment: 'сдерживание соперника',
  succession: 'борьба за законную власть',
  resources: 'контроль ресурсов'
};

export function warGoalLabel(goal: LiveWarGoal): string {
  return GOAL_LABELS[goal];
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function split(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  return [...new Set(value.split(FIELD_SEPARATOR).map((entry) => entry.trim()).filter(Boolean))];
}

function join(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(FIELD_SEPARATOR);
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function frontToText(front: LiveWarFront): string {
  return [
    front.id,
    front.systemId,
    Math.round(front.attackerControl),
    Math.round(front.defenderControl),
    Math.round(front.intensity),
    Math.round(front.attackerSupply),
    Math.round(front.defenderSupply),
    Math.round(front.fortification),
    Math.round(front.occupation)
  ].join('~');
}

function frontFromText(value: string): LiveWarFront | undefined {
  const [id, systemId, attackerControl, defenderControl, intensity, attackerSupply, defenderSupply, fortification, occupation] = value.split('~');
  if (!id || !systemId) return undefined;
  return {
    id,
    systemId,
    attackerControl: clamp(Number(attackerControl)),
    defenderControl: clamp(Number(defenderControl)),
    intensity: clamp(Number(intensity)),
    attackerSupply: clamp(Number(attackerSupply)),
    defenderSupply: clamp(Number(defenderSupply)),
    fortification: clamp(Number(fortification)),
    occupation: clamp(Number(occupation))
  };
}

function encodeFronts(fronts: LiveWarFront[]): string {
  return fronts.map(frontToText).join(FIELD_SEPARATOR);
}

function decodeFronts(value: unknown): LiveWarFront[] {
  if (typeof value !== 'string' || !value) return [];
  return value.split(FIELD_SEPARATOR).map(frontFromText).filter((entry): entry is LiveWarFront => Boolean(entry));
}

function warSnapshotData(war: LiveWarState): Record<string, string | number | boolean> {
  return {
    warId: war.id,
    warName: war.name,
    attackerPolityIds: join(war.attackerPolityIds),
    defenderPolityIds: join(war.defenderPolityIds),
    warCivilizationIds: join(war.civilizationIds),
    warGoal: war.goal,
    warStatus: war.status,
    warStartedHour: war.startedHour,
    ...(war.endedHour !== undefined ? { warEndedHour: war.endedHour } : {}),
    warFronts: encodeFronts(war.fronts),
    attackerStrength: war.attackerStrength,
    defenderStrength: war.defenderStrength,
    attackerSupply: war.attackerSupply,
    defenderSupply: war.defenderSupply,
    attackerWarExhaustion: war.attackerWarExhaustion,
    defenderWarExhaustion: war.defenderWarExhaustion,
    warCasualties: war.casualties,
    occupiedSystemIds: join(war.occupiedSystemIds),
    warCauseEventIds: join(war.causeEventIds),
    warLastUpdatedHour: war.lastUpdatedHour
  };
}

function warFromEvent(event: WorldEvent): LiveWarState | undefined {
  const warId = typeof event.data?.warId === 'string' ? event.data.warId : undefined;
  if (!warId) return undefined;
  const attackerPolityIds = split(event.data?.attackerPolityIds);
  const defenderPolityIds = split(event.data?.defenderPolityIds);
  if (!attackerPolityIds.length || !defenderPolityIds.length) return undefined;
  return {
    id: warId,
    name: stringValue(event.data?.warName, warId),
    attackerPolityIds,
    defenderPolityIds,
    civilizationIds: split(event.data?.warCivilizationIds).length
      ? split(event.data?.warCivilizationIds)
      : [...event.civilizationIds],
    goal: stringValue(event.data?.warGoal, 'conquest') as LiveWarGoal,
    status: stringValue(event.data?.warStatus, 'active') as LiveWarStatus,
    startedHour: numberValue(event.data?.warStartedHour, event.atHour),
    endedHour:
      typeof event.data?.warEndedHour === 'number' ? event.data.warEndedHour : undefined,
    fronts: decodeFronts(event.data?.warFronts),
    attackerStrength: clamp(numberValue(event.data?.attackerStrength, 40)),
    defenderStrength: clamp(numberValue(event.data?.defenderStrength, 40)),
    attackerSupply: clamp(numberValue(event.data?.attackerSupply, 40)),
    defenderSupply: clamp(numberValue(event.data?.defenderSupply, 40)),
    attackerWarExhaustion: clamp(numberValue(event.data?.attackerWarExhaustion, 0)),
    defenderWarExhaustion: clamp(numberValue(event.data?.defenderWarExhaustion, 0)),
    casualties: Math.max(0, Math.round(numberValue(event.data?.warCasualties, 0))),
    occupiedSystemIds: split(event.data?.occupiedSystemIds),
    causeEventIds: split(event.data?.warCauseEventIds),
    lastUpdatedHour: numberValue(event.data?.warLastUpdatedHour, event.atHour)
  };
}

export function liveWars(state: SimulationState): LiveWarState[] {
  const byId = new Map<string, LiveWarState>();
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(STATE_TAG)) continue;
    const projected = warFromEvent(event);
    if (projected) byId.set(projected.id, projected);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.lastUpdatedHour - a.lastUpdatedHour;
  });
}

export function writeWarSnapshot(
  state: SimulationState,
  war: LiveWarState,
  atHour: number
): void {
  const snapshot: WorldEvent = {
    id: `state_war_${war.id}`,
    atHour,
    kind: 'conflict',
    title: `${war.name}: состояние войны`,
    summary: 'Служебный снимок действующего вооружённого конфликта.',
    severity: 0,
    visibility: 'hidden',
    systemIds: war.fronts.map((front) => front.systemId),
    civilizationIds: war.civilizationIds,
    factionIds: [],
    tags: ['simulation', 'living-history', STATE_TAG, 'state-snapshot'],
    data: warSnapshotData({ ...war, lastUpdatedHour: atHour })
  };
  state.events = [
    snapshot,
    ...state.events.filter(
      (event) => !(event.tags.includes(STATE_TAG) && event.data?.warId === war.id)
    )
  ].slice(0, 1_000);
}

function systemsBorder(
  left: LivePolityState,
  right: LivePolityState,
  context: SimulationContext
): Array<{ attackerSystemId: string; defenderSystemId: string }> {
  const systems = new Map(context.galaxy.systems.map((system) => [system.id, system]));
  const result: Array<{ attackerSystemId: string; defenderSystemId: string }> = [];
  for (const attackerSystemId of left.territorySystemIds) {
    const system = systems.get(attackerSystemId);
    if (!system) continue;
    for (const defenderSystemId of right.territorySystemIds) {
      if (attackerSystemId === defenderSystemId || system.neighbors.includes(defenderSystemId)) {
        result.push({ attackerSystemId, defenderSystemId });
      }
    }
  }
  return result;
}

function sideSupply(
  state: SimulationState,
  polities: LivePolityState[]
): number {
  const systemIds = new Set(polities.flatMap((polity) => polity.territorySystemIds));
  const systems = [...systemIds]
    .map((id) => state.systems[id])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const systemSupply = systems.length
    ? systems.reduce((sum, entry) => sum + entry.supply, 0) / systems.length
    : 25;
  const routes = Object.values(state.tradeRoutes).filter((route) =>
    route.pathSystemIds.some((id) => systemIds.has(id))
  );
  const routeSupport = routes.length
    ? routes.reduce((sum, route) => sum + (route.disrupted ? -8 : route.traffic * 0.08), 0) /
      routes.length
    : -5;
  return clamp(systemSupply + routeSupport);
}

function sideStrength(
  state: SimulationState,
  polities: LivePolityState[],
  supply: number
): number {
  if (!polities.length) return 0;
  const polityMilitary = polities.reduce(
    (sum, polity) => sum + polity.military * (0.65 + polity.mobilization / 180),
    0
  );
  const civilizationMilitary = [...new Set(polities.map((polity) => polity.civilizationId))]
    .reduce((sum, id) => sum + (state.civilizations[id]?.military ?? 20), 0);
  return clamp((polityMilitary + civilizationMilitary * 0.45) / polities.length * (0.55 + supply / 220));
}

function chooseGoal(
  attacker: LivePolityState,
  defender: LivePolityState,
  state: SimulationState
): LiveWarGoal {
  if (attacker.civilizationId === defender.civilizationId) return 'succession';
  const defenderSystems = defender.territorySystemIds.map((id) => state.systems[id]);
  if (defenderSystems.some((system) => (system?.supply ?? 50) >= 70)) return 'resources';
  if (attacker.territorySystemIds.length < defender.territorySystemIds.length) return 'containment';
  if (attacker.treasury < 40) return 'tribute';
  return 'conquest';
}

function createFronts(
  attacker: LivePolityState,
  defender: LivePolityState,
  context: SimulationContext
): LiveWarFront[] {
  const borders = systemsBorder(attacker, defender, context);
  const targetIds = borders.length
    ? [...new Set(borders.map((entry) => entry.defenderSystemId))]
    : [defender.capitalSystemId];
  return targetIds.slice(0, 4).map((systemId, index) => ({
    id: `front_${attacker.id}_${defender.id}_${systemId}`,
    systemId,
    attackerControl: 10,
    defenderControl: 90,
    intensity: 42 + index * 6,
    attackerSupply: 50,
    defenderSupply: 50,
    fortification: 35,
    occupation: 0
  }));
}

function publicDraft(
  state: SimulationState,
  civilizationId: string,
  atHour: number,
  draft: WorldEventDraft,
  options: {
    causeEventIds?: string[];
    createdEntityIds?: string[];
    changedEntityIds?: string[];
    destroyedEntityIds?: string[];
  }
): WorldEventDraft {
  return causalizeDraft(state, draft, {
    ...options,
    prospectiveEventId: prospectiveCivilizationCycleEventId(state, civilizationId, atHour)
  });
}

export function startLivingWar(
  state: SimulationState,
  attacker: LivePolityState,
  defender: LivePolityState,
  context: SimulationContext,
  atHour: number,
  causeEventIds: string[] = []
): WorldEventDraft {
  const goal = chooseGoal(attacker, defender, state);
  const attackerSupply = sideSupply(state, [attacker]);
  const defenderSupply = sideSupply(state, [defender]);
  const war: LiveWarState = {
    id: `war_live_${attacker.id}_${defender.id}_${Math.floor(atHour / HOURS_PER_YEAR)}`,
    name: `${attacker.name} — ${defender.name}`,
    attackerPolityIds: [attacker.id],
    defenderPolityIds: [defender.id],
    civilizationIds: [...new Set([attacker.civilizationId, defender.civilizationId])],
    goal,
    status: 'active',
    startedHour: atHour,
    fronts: createFronts(attacker, defender, context),
    attackerStrength: sideStrength(state, [attacker], attackerSupply),
    defenderStrength: sideStrength(state, [defender], defenderSupply),
    attackerSupply,
    defenderSupply,
    attackerWarExhaustion: 0,
    defenderWarExhaustion: 0,
    casualties: 0,
    occupiedSystemIds: [],
    causeEventIds,
    lastUpdatedHour: atHour
  };
  writeWarSnapshot(state, war, atHour);
  attacker.mobilization = clamp(Math.max(attacker.mobilization, 72));
  defender.mobilization = clamp(Math.max(defender.mobilization, 78));
  writePolitySnapshot(state, attacker, atHour);
  writePolitySnapshot(state, defender, atHour);

  return publicDraft(
    state,
    attacker.civilizationId,
    atHour,
    {
      kind: 'conflict',
      title: `${attacker.name} объявляет войну государству ${defender.name}`,
      summary: `Цель войны — ${warGoalLabel(goal)}. Открыто ${war.fronts.length} фронтов; снабжение сторон ${Math.round(attackerSupply)}/${Math.round(defenderSupply)}.`,
      severity: 9,
      visibility: 'public',
      systemIds: war.fronts.map((front) => front.systemId),
      civilizationIds: war.civilizationIds,
      factionIds: context.factions
        .filter((faction) => war.civilizationIds.includes(faction.civilizationId ?? ''))
        .map((faction) => faction.id),
      tags: ['simulation', 'living-history', 'living-war', 'war-declaration', 'logistics'],
      data: warSnapshotData(war)
    },
    {
      causeEventIds,
      createdEntityIds: [war.id, ...war.fronts.map((front) => front.id)],
      changedEntityIds: [attacker.id, defender.id]
    }
  );
}

function damageFrontSystem(
  state: SimulationState,
  front: LiveWarFront,
  casualtyRate: number,
  attackerWon: boolean,
  atHour: number
): number {
  let casualties = 0;
  for (const settlement of Object.values(state.settlements)) {
    if (settlement.systemId !== front.systemId || settlement.abandoned) continue;
    const loss = Math.min(settlement.population, Math.max(0, Math.round(settlement.population * casualtyRate)));
    casualties += loss;
    const population = Math.max(0, settlement.population - loss);
    state.settlements[settlement.id] = {
      ...settlement,
      population,
      infrastructure: clamp(settlement.infrastructure - (attackerWon ? 7 : 4)),
      security: clamp(settlement.security - 8),
      unrest: clamp(settlement.unrest + 12),
      health: clamp(settlement.health - 5),
      abandoned: population <= 0,
      lastUpdatedHour: atHour
    };
  }
  for (const route of Object.values(state.tradeRoutes)) {
    if (!route.pathSystemIds.includes(front.systemId)) continue;
    state.tradeRoutes[route.id] = {
      ...route,
      danger: clamp(route.danger + 16),
      traffic: clamp(route.traffic - 18),
      disrupted: true,
      lastUpdatedHour: atHour
    };
  }
  const system = state.systems[front.systemId];
  if (system) {
    state.systems[front.systemId] = {
      ...system,
      security: clamp(system.security - 12),
      supply: clamp(system.supply - 15),
      prosperity: clamp(system.prosperity - 9),
      migrationPressure: clamp(system.migrationPressure + 18),
      lastUpdatedHour: atHour
    };
  }
  return casualties;
}

function occupySystem(
  attacker: LivePolityState,
  defender: LivePolityState,
  systemId: string,
  state: SimulationState,
  context: SimulationContext,
  atHour: number
): void {
  if (!attacker.territorySystemIds.includes(systemId)) attacker.territorySystemIds.push(systemId);
  defender.territorySystemIds = defender.territorySystemIds.filter((id) => id !== systemId);
  if (defender.capitalSystemId === systemId) {
    defender.capitalSystemId = defender.territorySystemIds[0] ?? systemId;
    defender.legitimacy = clamp(defender.legitimacy - 18);
  }
  attacker.legitimacy = clamp(attacker.legitimacy + 4);
  defender.legitimacy = clamp(defender.legitimacy - 9);
  const occupyingFactionId = context.factions.find(
    (faction) => faction.civilizationId === attacker.civilizationId && faction.kind === 'government'
  )?.id ?? context.factions.find(
    (faction) => faction.civilizationId === attacker.civilizationId
  )?.id;
  if (occupyingFactionId) {
    for (const settlement of Object.values(state.settlements)) {
      if (settlement.systemId !== systemId || settlement.abandoned) continue;
      state.settlements[settlement.id] = {
        ...settlement,
        ownerFactionId: occupyingFactionId,
        security: clamp(settlement.security - 5),
        unrest: clamp(settlement.unrest + 10),
        lastUpdatedHour: atHour
      };
    }
  }
  writePolitySnapshot(state, attacker, atHour);
  writePolitySnapshot(state, defender, atHour);
}

function updateWar(
  state: SimulationState,
  war: LiveWarState,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  if (atHour - war.lastUpdatedHour < 45 * HOURS_PER_DAY) return null;
  const polities = livePolities(state, context);
  const attackers = polities.filter((polity) => war.attackerPolityIds.includes(polity.id) && polity.status === 'active');
  const defenders = polities.filter((polity) => war.defenderPolityIds.includes(polity.id) && polity.status === 'active');
  if (!attackers.length || !defenders.length) {
    war.status = 'resolved';
    war.endedHour = atHour;
    writeWarSnapshot(state, war, atHour);
    const winner = attackers.length ? attackers[0]?.name : defenders[0]?.name;
    const civilizationId = attackers[0]?.civilizationId ?? defenders[0]?.civilizationId ?? war.civilizationIds[0] ?? '';
    return publicDraft(
      state,
      civilizationId,
      atHour,
      {
        kind: 'conflict',
        title: `${war.name}: война завершена`,
        summary: winner ? `${winner} сохранило действующую власть после распада противника.` : 'Обе стороны утратили способность продолжать войну.',
        severity: 8,
        visibility: 'public',
        systemIds: war.fronts.map((front) => front.systemId),
        civilizationIds: war.civilizationIds,
        factionIds: [],
        tags: ['simulation', 'living-history', 'living-war', 'war-ended'],
        data: warSnapshotData(war)
      },
      { causeEventIds: war.causeEventIds, changedEntityIds: [war.id], destroyedEntityIds: [...(attackers.length ? [] : war.attackerPolityIds), ...(defenders.length ? [] : war.defenderPolityIds)] }
    );
  }

  war.attackerSupply = sideSupply(state, attackers);
  war.defenderSupply = sideSupply(state, defenders);
  war.attackerStrength = sideStrength(state, attackers, war.attackerSupply);
  war.defenderStrength = sideStrength(state, defenders, war.defenderSupply);
  const rng = createRng(`${context.seed}:living-war:${war.id}:${Math.floor(atHour / (30 * HOURS_PER_DAY))}`);
  const front = war.fronts[rng.int(0, Math.max(0, war.fronts.length - 1))];
  if (!front) return null;
  front.attackerSupply = war.attackerSupply;
  front.defenderSupply = war.defenderSupply;
  const attackerRoll = war.attackerStrength * (0.78 + rng.next() * 0.44) + war.attackerSupply * 0.18;
  const defenderRoll = war.defenderStrength * (0.78 + rng.next() * 0.44) + war.defenderSupply * 0.18 + front.fortification * 0.22;
  const margin = attackerRoll - defenderRoll;
  const attackerWon = margin > 0;
  const shift = clamp(Math.abs(margin) * 0.22 + rng.int(3, 9), 3, 24);
  front.attackerControl = clamp(front.attackerControl + (attackerWon ? shift : -shift * 0.45));
  front.defenderControl = clamp(100 - front.attackerControl);
  front.intensity = clamp(front.intensity + rng.int(-4, 12));
  front.occupation = clamp(front.attackerControl - 55);
  const frontPopulation = Object.values(state.settlements)
    .filter((settlement) => settlement.systemId === front.systemId && !settlement.abandoned)
    .reduce((sum, settlement) => sum + settlement.population, 0);
  const casualtyRate = Math.min(0.035, 0.0025 + front.intensity / 4_500 + Math.abs(margin) / 18_000);
  const casualties = damageFrontSystem(state, front, casualtyRate, attackerWon, atHour);
  war.casualties += casualties;
  war.attackerWarExhaustion = clamp(
    war.attackerWarExhaustion +
      (attackerWon ? 2 : 6) +
      Math.max(0, 45 - war.attackerSupply) / 12 +
      casualties / Math.max(10_000, attackers.reduce((sum, polity) => sum + polity.population, 0)) * 180
  );
  war.defenderWarExhaustion = clamp(
    war.defenderWarExhaustion +
      (attackerWon ? 7 : 2) +
      Math.max(0, 45 - war.defenderSupply) / 12 +
      casualties / Math.max(10_000, defenders.reduce((sum, polity) => sum + polity.population, 0)) * 180
  );
  for (const polity of attackers) {
    polity.warExhaustion = war.attackerWarExhaustion;
    polity.mobilization = clamp(polity.mobilization + (attackerWon ? 1 : 3));
    writePolitySnapshot(state, polity, atHour);
  }
  for (const polity of defenders) {
    polity.warExhaustion = war.defenderWarExhaustion;
    polity.mobilization = clamp(polity.mobilization + (attackerWon ? 4 : 1));
    writePolitySnapshot(state, polity, atHour);
  }

  let occupied = false;
  const attacker = attackers[0]!;
  const defender = defenders.find((polity) => polity.territorySystemIds.includes(front.systemId)) ?? defenders[0]!;
  if (front.attackerControl >= 72 && defender.territorySystemIds.includes(front.systemId)) {
    occupySystem(attacker, defender, front.systemId, state, context, atHour);
    if (!war.occupiedSystemIds.includes(front.systemId)) war.occupiedSystemIds.push(front.systemId);
    occupied = true;
  }

  const defenderDefeated =
    war.defenderWarExhaustion >= 96 ||
    war.defenderStrength <= 9 ||
    defenders.every((polity) => polity.territorySystemIds.length === 0);
  const attackerDefeated = war.attackerWarExhaustion >= 96 || war.attackerStrength <= 9;
  if (defenderDefeated || attackerDefeated) {
    war.status = 'resolved';
    war.endedHour = atHour;
  }
  war.lastUpdatedHour = atHour;
  writeWarSnapshot(state, war, atHour);

  const previousWarEvent = state.events.find(
    (event) =>
      event.tags.includes('living-war') &&
      event.data?.warId === war.id &&
      event.id !== `state_war_${war.id}`
  );
  const causeEventIds = [previousWarEvent?.id, ...war.causeEventIds].filter((id): id is string => Boolean(id)).slice(0, 3);
  const civilizationId = attacker.civilizationId;
  if (war.status === 'resolved') {
    const winner = defenderDefeated ? attacker.name : defender.name;
    return publicDraft(
      state,
      civilizationId,
      atHour,
      {
        kind: 'conflict',
        title: `${war.name}: заключён мир`,
        summary: `${winner} добилось прекращения войны. Потери составили ${war.casualties.toLocaleString('ru-RU')}; занято систем: ${war.occupiedSystemIds.length}.`,
        severity: 9,
        visibility: 'public',
        systemIds: war.fronts.map((entry) => entry.systemId),
        civilizationIds: war.civilizationIds,
        factionIds: [],
        tags: ['simulation', 'living-history', 'living-war', 'peace-treaty'],
        data: warSnapshotData(war)
      },
      { causeEventIds, changedEntityIds: [war.id, ...war.attackerPolityIds, ...war.defenderPolityIds] }
    );
  }

  return publicDraft(
    state,
    civilizationId,
    atHour,
    {
      kind: 'conflict',
      title: occupied
        ? `${attacker.name} занимает систему ${context.galaxy.systems.find((system) => system.id === front.systemId)?.name ?? front.systemId}`
        : `${war.name}: бой на фронте`,
      summary: `${attackerWon ? attacker.name : defender.name} удержало инициативу. Потери ${casualties.toLocaleString('ru-RU')} из ${frontPopulation.toLocaleString('ru-RU')} жителей фронтовой системы; снабжение ${Math.round(war.attackerSupply)}/${Math.round(war.defenderSupply)}.`,
      severity: occupied ? 9 : Math.min(9, 5 + Math.round(front.intensity / 25)),
      visibility: 'public',
      systemIds: [front.systemId],
      civilizationIds: war.civilizationIds,
      factionIds: [],
      tags: ['simulation', 'living-history', 'living-war', occupied ? 'occupation' : 'battle', 'logistics'],
      data: { ...warSnapshotData(war), battleCasualties: casualties, frontSystemId: front.systemId, attackerWon }
    },
    {
      causeEventIds,
      changedEntityIds: [war.id, front.id, front.systemId, ...(occupied ? [attacker.id, defender.id] : [])]
    }
  );
}

function hostilityScore(
  state: SimulationState,
  attacker: LivePolityState,
  defender: LivePolityState,
  context: SimulationContext
): number {
  if (attacker.civilizationId === defender.civilizationId) {
    const secession = state.events.find(
      (event) => event.tags.includes('secession') && event.civilizationIds.includes(attacker.civilizationId)
    );
    return secession ? 92 : 55;
  }
  const attackerFactions = context.factions.filter((entry) => entry.civilizationId === attacker.civilizationId);
  const defenderFactionIds = new Set(
    context.factions.filter((entry) => entry.civilizationId === defender.civilizationId).map((entry) => entry.id)
  );
  const declaredEnemies = attackerFactions.some((faction) => faction.enemies.some((id) => defenderFactionIds.has(id)));
  const tension = attackerFactions.length
    ? attackerFactions.reduce((sum, faction) => sum + (state.factions[faction.id]?.tension ?? 30), 0) / attackerFactions.length
    : 30;
  const resourcePressure = attacker.treasury < 28 && defender.treasury > attacker.treasury + 18 ? 14 : 0;
  return clamp(tension + (declaredEnemies ? 28 : 0) + resourcePressure);
}

export function simulateLivingWarCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const wars = liveWars(state);
  const active = wars.find(
    (war) => war.status === 'active' && war.civilizationIds[0] === civilization.id
  );
  if (active) return updateWar(state, active, context, atHour);

  const allPolities = livePolities(state, context).filter(
    (polity) => polity.status === 'active' && polity.territorySystemIds.length > 0
  );
  const attackers = allPolities.filter((polity) => polity.civilizationId === civilization.id);
  if (!attackers.length) return null;
  const alreadyAtWar = new Set(
    wars.filter((war) => war.status === 'active').flatMap((war) => [...war.attackerPolityIds, ...war.defenderPolityIds])
  );

  for (const attacker of attackers) {
    if (alreadyAtWar.has(attacker.id)) continue;
    const candidates = allPolities
      .filter((defender) => defender.id !== attacker.id && !alreadyAtWar.has(defender.id))
      .map((defender) => ({
        defender,
        borders: systemsBorder(attacker, defender, context),
        hostility: hostilityScore(state, attacker, defender, context)
      }))
      .filter((entry) => entry.borders.length > 0 && entry.hostility >= 68)
      .sort((a, b) => b.hostility - a.hostility);
    const target = candidates[0];
    if (!target) continue;
    const rng = createRng(
      `${context.seed}:war-declaration:${attacker.id}:${target.defender.id}:${Math.floor(atHour / HOURS_PER_YEAR)}`
    );
    const chance = clamp((target.hostility - 55) / 75 + attacker.mobilization / 240, 0.08, 0.72);
    if (!rng.chance(chance)) continue;
    const causes = recentCausalEvents(state, {
      civilizationIds: [...new Set([attacker.civilizationId, target.defender.civilizationId])],
      systemIds: [...attacker.territorySystemIds, ...target.defender.territorySystemIds],
      kinds: ['shortage', 'conflict', 'politics', 'migration'],
      tags: ['mobilization', 'secession', 'causal-history'],
      beforeHour: atHour,
      limit: 3
    }).map((event) => event.id);
    return startLivingWar(state, attacker, target.defender, context, atHour, causes);
  }

  return null;
}
