import type { Civilization } from '../game/types';
import type { DeepTimePolityForm, DeepTimePolityState } from '../deeptime/types';
import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import {
  causalizeDraft,
  prospectiveCivilizationCycleEventId,
  recentCausalEvents
} from './causality';
import type { SimulationState, WorldEvent, WorldEventDraft } from './types';

const HOURS_PER_YEAR = 365 * 24;
const STATE_TAG = 'living-polity-state';
const FIELD_SEPARATOR = '|';

export type LivePolityStatus = 'active' | 'collapsed' | 'absorbed' | 'exiled';

export interface LivePolityState {
  id: string;
  civilizationId: string;
  name: string;
  form: DeepTimePolityForm;
  status: LivePolityStatus;
  formedYear: number;
  capitalSystemId: string;
  territorySystemIds: string[];
  cultureIds: string[];
  population: number;
  stability: number;
  legitimacy: number;
  military: number;
  treasury: number;
  mobilization: number;
  warExhaustion: number;
  lastUpdatedHour: number;
}

const FORM_LABELS: Record<DeepTimePolityForm, string> = {
  band: 'родовая община',
  'tribal-confederation': 'племенная конфедерация',
  'city-state': 'город-государство',
  kingdom: 'королевство',
  empire: 'империя',
  republic: 'республика',
  theocracy: 'теократия',
  'industrial-state': 'индустриальное государство',
  'planetary-union': 'планетарный союз',
  'orbital-polity': 'орбитальное государство',
  'interplanetary-state': 'межпланетное государство',
  'stellar-state': 'звёздное государство'
};

export function polityFormLabel(form: DeepTimePolityForm): string {
  return FORM_LABELS[form];
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

function polityFromDeepTime(
  polity: DeepTimePolityState,
  endYear: number
): LivePolityState {
  return {
    id: polity.id,
    civilizationId: polity.civilizationId,
    name: polity.name,
    form: polity.form,
    status: polity.status,
    formedYear: polity.formedYear,
    capitalSystemId: polity.capitalSystemId,
    territorySystemIds: [...polity.territorySystemIds],
    cultureIds: [...polity.cultureIds],
    population: Math.max(0, Math.round(polity.population)),
    stability: clamp(polity.stability),
    legitimacy: clamp(polity.legitimacy),
    military: clamp(polity.military),
    treasury: clamp(polity.stability * 0.55 + polity.legitimacy * 0.25),
    mobilization: clamp(polity.military * 0.35),
    warExhaustion: 0,
    lastUpdatedHour: Math.max(0, endYear * HOURS_PER_YEAR)
  };
}

function fallbackForm(civilization: Civilization): DeepTimePolityForm {
  const era = civilization.era ?? civilization.development?.era;
  if (era === 'tribal' || era === 'neolithic') return 'tribal-confederation';
  if (era === 'urban' || era === 'bronze' || era === 'iron') return 'kingdom';
  if (era === 'medieval' || era === 'gunpowder') return 'kingdom';
  if (era === 'industrial' || era === 'modern' || era === 'atomic') return 'industrial-state';
  if (era === 'early-space') return 'planetary-union';
  if (era === 'interplanetary') return 'interplanetary-state';
  return 'stellar-state';
}

function fallbackPolity(
  civilization: Civilization,
  state: SimulationState
): LivePolityState {
  const simulation = state.civilizations[civilization.id];
  const systems = Object.values(state.settlements)
    .filter((settlement) => settlement.civilizationId === civilization.id && !settlement.abandoned)
    .map((settlement) => settlement.systemId);
  return {
    id: `polity_continuity_${civilization.id}`,
    civilizationId: civilization.id,
    name: civilization.states?.find((entry) => entry.status === 'active')?.name ?? civilization.name,
    form: fallbackForm(civilization),
    status: simulation?.alive === false ? 'collapsed' : 'active',
    formedYear: civilization.foundedYear,
    capitalSystemId: civilization.homeSystemId,
    territorySystemIds: [...new Set(systems.length ? systems : civilization.controlledSystems)],
    cultureIds: [...(civilization.deepTimeCultureIds ?? [])],
    population: Math.max(0, Math.round(simulation?.population ?? civilization.development?.population ?? 0)),
    stability: clamp(simulation?.stability ?? civilization.development?.stability ?? 45),
    legitimacy: clamp(simulation?.cohesion ?? civilization.development?.stability ?? 45),
    military: clamp(simulation?.military ?? civilization.techLevel * 8),
    treasury: clamp(simulation?.economy ?? 40),
    mobilization: 10,
    warExhaustion: 0,
    lastUpdatedHour: state.clock.absoluteHour
  };
}

function polityFromEvent(event: WorldEvent, fallback?: LivePolityState): LivePolityState | undefined {
  const polityId = typeof event.data?.polityId === 'string' ? event.data.polityId : undefined;
  const civilizationId =
    typeof event.data?.polityCivilizationId === 'string'
      ? event.data.polityCivilizationId
      : event.civilizationIds[0];
  if (!polityId || !civilizationId) return undefined;
  const form = stringValue(event.data?.polityForm, fallback?.form ?? 'kingdom') as DeepTimePolityForm;
  const status = stringValue(event.data?.polityStatus, fallback?.status ?? 'active') as LivePolityStatus;
  return {
    id: polityId,
    civilizationId,
    name: stringValue(event.data?.polityName, fallback?.name ?? polityId),
    form,
    status,
    formedYear: numberValue(event.data?.polityFormedYear, fallback?.formedYear ?? 0),
    capitalSystemId: stringValue(event.data?.capitalSystemId, fallback?.capitalSystemId ?? ''),
    territorySystemIds: split(event.data?.territorySystemIds).length
      ? split(event.data?.territorySystemIds)
      : [...(fallback?.territorySystemIds ?? [])],
    cultureIds: split(event.data?.cultureIds).length
      ? split(event.data?.cultureIds)
      : [...(fallback?.cultureIds ?? [])],
    population: Math.max(0, Math.round(numberValue(event.data?.polityPopulation, fallback?.population ?? 0))),
    stability: clamp(numberValue(event.data?.polityStability, fallback?.stability ?? 40)),
    legitimacy: clamp(numberValue(event.data?.polityLegitimacy, fallback?.legitimacy ?? 40)),
    military: clamp(numberValue(event.data?.polityMilitary, fallback?.military ?? 20)),
    treasury: clamp(numberValue(event.data?.polityTreasury, fallback?.treasury ?? 30)),
    mobilization: clamp(numberValue(event.data?.polityMobilization, fallback?.mobilization ?? 0)),
    warExhaustion: clamp(numberValue(event.data?.polityWarExhaustion, fallback?.warExhaustion ?? 0)),
    lastUpdatedHour: numberValue(event.data?.polityLastUpdatedHour, event.atHour)
  };
}

export function livePolities(
  state: SimulationState,
  context: SimulationContext
): LivePolityState[] {
  const byId = new Map<string, LivePolityState>();
  const deepTime = context.galaxy.deepTime;
  for (const polity of deepTime?.polities ?? []) {
    byId.set(polity.id, polityFromDeepTime(polity, deepTime?.endYear ?? 0));
  }

  for (const civilization of context.galaxy.civilizations) {
    if ([...byId.values()].some((polity) => polity.civilizationId === civilization.id && polity.status === 'active')) {
      continue;
    }
    const hasCurrentSettlements = Object.values(state.settlements).some(
      (settlement) => settlement.civilizationId === civilization.id && !settlement.abandoned
    );
    if (civilization.status === 'living' || hasCurrentSettlements) {
      const fallback = fallbackPolity(civilization, state);
      byId.set(fallback.id, fallback);
    }
  }

  const latestSnapshots = state.events.filter((event) => event.tags.includes(STATE_TAG));
  for (const event of [...latestSnapshots].reverse()) {
    const id = typeof event.data?.polityId === 'string' ? event.data.polityId : undefined;
    const current = id ? byId.get(id) : undefined;
    const projected = polityFromEvent(event, current);
    if (projected) byId.set(projected.id, projected);
  }

  return [...byId.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.population - a.population;
  });
}

function snapshotData(polity: LivePolityState): Record<string, string | number | boolean> {
  return {
    polityId: polity.id,
    polityCivilizationId: polity.civilizationId,
    polityName: polity.name,
    polityForm: polity.form,
    polityStatus: polity.status,
    polityFormedYear: polity.formedYear,
    capitalSystemId: polity.capitalSystemId,
    territorySystemIds: join(polity.territorySystemIds),
    cultureIds: join(polity.cultureIds),
    polityPopulation: polity.population,
    polityStability: polity.stability,
    polityLegitimacy: polity.legitimacy,
    polityMilitary: polity.military,
    polityTreasury: polity.treasury,
    polityMobilization: polity.mobilization,
    polityWarExhaustion: polity.warExhaustion,
    polityLastUpdatedHour: polity.lastUpdatedHour
  };
}

export function writePolitySnapshot(
  state: SimulationState,
  polity: LivePolityState,
  atHour: number
): void {
  const snapshot: WorldEvent = {
    id: `state_polity_${polity.id}`,
    atHour,
    kind: 'politics',
    title: `${polity.name}: текущее состояние`,
    summary: 'Служебный снимок действующего государства.',
    severity: 0,
    visibility: 'hidden',
    systemIds: polity.territorySystemIds,
    civilizationIds: [polity.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', STATE_TAG, 'state-snapshot'],
    data: snapshotData({ ...polity, lastUpdatedHour: atHour })
  };
  state.events = [
    snapshot,
    ...state.events.filter(
      (event) => !(event.tags.includes(STATE_TAG) && event.data?.polityId === polity.id)
    )
  ].slice(0, 8_500);
}

function polityMetrics(
  state: SimulationState,
  polity: LivePolityState
): {
  population: number;
  stability: number;
  legitimacy: number;
  military: number;
  treasury: number;
  territorySystemIds: string[];
  capitalSystemId: string;
} {
  const settlements = Object.values(state.settlements).filter(
    (settlement) =>
      !settlement.abandoned &&
      settlement.civilizationId === polity.civilizationId &&
      (polity.territorySystemIds.includes(settlement.systemId) ||
        settlement.systemId === polity.capitalSystemId)
  );
  const territorySystemIds = [...new Set(settlements.map((entry) => entry.systemId))];
  const totalPopulation = settlements.reduce((sum, entry) => sum + entry.population, 0);
  const weight = Math.max(1, totalPopulation);
  const weighted = (selector: (settlement: (typeof settlements)[number]) => number, fallback: number) =>
    settlements.length
      ? settlements.reduce((sum, settlement) => sum + selector(settlement) * settlement.population, 0) / weight
      : fallback;
  const security = weighted((entry) => entry.security, polity.stability);
  const unrest = weighted((entry) => entry.unrest, 100 - polity.legitimacy);
  const infrastructure = weighted((entry) => entry.infrastructure, polity.treasury);
  const health = weighted((entry) => entry.health, polity.stability);
  const supply = settlements.length
    ? settlements.reduce((sum, entry) => sum + (state.systems[entry.systemId]?.supply ?? 35), 0) /
      settlements.length
    : 25;
  const civilization = state.civilizations[polity.civilizationId];
  const stability = clamp((security + health + (100 - unrest) + (civilization?.stability ?? 40)) / 4);
  const legitimacy = clamp((100 - unrest) * 0.42 + security * 0.2 + (civilization?.cohesion ?? 40) * 0.38);
  const treasury = clamp(infrastructure * 0.48 + supply * 0.28 + (civilization?.economy ?? 35) * 0.24);
  const military = clamp((civilization?.military ?? polity.military) * 0.68 + security * 0.18 + treasury * 0.14);
  const capitalStillHeld = territorySystemIds.includes(polity.capitalSystemId);
  const capitalSystemId = capitalStillHeld
    ? polity.capitalSystemId
    : settlements.sort((a, b) => b.population - a.population)[0]?.systemId ?? polity.capitalSystemId;

  return {
    population: totalPopulation || polity.population,
    stability,
    legitimacy,
    military,
    treasury,
    territorySystemIds: territorySystemIds.length ? territorySystemIds : polity.territorySystemIds,
    capitalSystemId
  };
}

function reformForm(polity: LivePolityState): DeepTimePolityForm | undefined {
  if (polity.form === 'kingdom' || polity.form === 'empire' || polity.form === 'theocracy') {
    return 'republic';
  }
  if (polity.form === 'industrial-state') return 'planetary-union';
  if (polity.form === 'planetary-union') return 'interplanetary-state';
  if (polity.form === 'interplanetary-state') return 'stellar-state';
  return undefined;
}

function publicDraft(
  state: SimulationState,
  civilization: Civilization,
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
    prospectiveEventId: prospectiveCivilizationCycleEventId(state, civilization.id, atHour)
  });
}

export function simulateLivingPolityCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const polities = livePolities(state, context).filter(
    (polity) => polity.civilizationId === civilization.id && polity.status === 'active'
  );
  if (!polities.length) return null;

  const polity = polities.sort((a, b) => a.lastUpdatedHour - b.lastUpdatedHour)[0]!;
  const previous = { ...polity, territorySystemIds: [...polity.territorySystemIds] };
  const metrics = polityMetrics(state, polity);
  const next: LivePolityState = {
    ...polity,
    ...metrics,
    stability: clamp(polity.stability + (metrics.stability - polity.stability) * 0.28),
    legitimacy: clamp(polity.legitimacy + (metrics.legitimacy - polity.legitimacy) * 0.25),
    military: clamp(polity.military + (metrics.military - polity.military) * 0.22),
    treasury: clamp(polity.treasury + (metrics.treasury - polity.treasury) * 0.25),
    mobilization: clamp(
      polity.mobilization +
        ((state.factions[context.factions.find((faction) => faction.civilizationId === civilization.id)?.id ?? '']?.tension ?? 30) -
          polity.mobilization) *
          0.15
    ),
    lastUpdatedHour: atHour
  };

  const causes = recentCausalEvents(state, {
    civilizationIds: [civilization.id],
    systemIds: next.territorySystemIds,
    kinds: ['shortage', 'ecology', 'migration', 'conflict', 'disaster'],
    tags: ['regression', 'causal-history'],
    beforeHour: atHour,
    limit: 3
  }).map((event) => event.id);

  const rng = createRng(
    `${context.seed}:live-polity:${polity.id}:${Math.floor(atHour / HOURS_PER_YEAR)}`
  );

  if (next.stability <= 9 || next.legitimacy <= 8 || next.population <= 0) {
    next.status = 'collapsed';
    next.mobilization = 0;
    writePolitySnapshot(state, next, atHour);
    const civilizationState = state.civilizations[civilization.id];
    if (civilizationState) {
      civilizationState.stability = clamp(civilizationState.stability - 18);
      civilizationState.cohesion = clamp(civilizationState.cohesion - 22);
    }
    return publicDraft(
      state,
      civilization,
      atHour,
      {
        kind: 'politics',
        title: `${next.name}: государство распалось`,
        summary: `Легитимность ${Math.round(next.legitimacy)}/100 и стабильность ${Math.round(next.stability)}/100. Центральная власть прекратила контролировать территорию.`,
        severity: 9,
        visibility: 'public',
        systemIds: next.territorySystemIds,
        civilizationIds: [civilization.id],
        factionIds: context.factions.filter((entry) => entry.civilizationId === civilization.id).map((entry) => entry.id),
        tags: ['simulation', 'living-history', 'living-polity', 'state-collapse'],
        data: { ...snapshotData(next), previousLegitimacy: previous.legitimacy }
      },
      { causeEventIds: causes, destroyedEntityIds: [next.id], changedEntityIds: next.territorySystemIds }
    );
  }

  if (
    next.territorySystemIds.length >= 2 &&
    next.legitimacy <= 28 &&
    previous.legitimacy > next.legitimacy &&
    rng.chance(Math.min(0.7, (32 - next.legitimacy) / 55))
  ) {
    const sortedSystems = [...next.territorySystemIds].sort();
    const secedingSystemId = sortedSystems[sortedSystems.length - 1]!;
    next.territorySystemIds = next.territorySystemIds.filter((id) => id !== secedingSystemId);
    const secedingPopulation = Object.values(state.settlements)
      .filter((entry) => entry.systemId === secedingSystemId && !entry.abandoned)
      .reduce((sum, entry) => sum + entry.population, 0);
    next.population = Math.max(0, next.population - secedingPopulation);
    next.legitimacy = clamp(next.legitimacy + 8);
    const child: LivePolityState = {
      ...next,
      id: `polity_secession_${civilization.id}_${Math.floor(atHour / HOURS_PER_YEAR)}_${secedingSystemId}`,
      name: `${context.galaxy.systems.find((system) => system.id === secedingSystemId)?.name ?? civilization.name}ский союз`,
      form: 'republic',
      formedYear: context.galaxy.currentYear + Math.floor(atHour / HOURS_PER_YEAR),
      capitalSystemId: secedingSystemId,
      territorySystemIds: [secedingSystemId],
      population: Math.max(500, secedingPopulation),
      stability: clamp(45 + rng.int(-8, 8)),
      legitimacy: clamp(52 + rng.int(-10, 10)),
      military: clamp(next.military * 0.35),
      treasury: clamp(next.treasury * 0.28),
      mobilization: 55,
      warExhaustion: 0,
      lastUpdatedHour: atHour
    };
    writePolitySnapshot(state, next, atHour);
    writePolitySnapshot(state, child, atHour);
    return publicDraft(
      state,
      civilization,
      atHour,
      {
        kind: 'politics',
        title: `${child.name}: отделение от ${next.name}`,
        summary: `${context.galaxy.systems.find((system) => system.id === secedingSystemId)?.name ?? 'Пограничная система'} вышла из подчинения центральной власти. Новое государство контролирует один населённый узел.`,
        severity: 8,
        visibility: 'public',
        systemIds: [secedingSystemId, next.capitalSystemId],
        civilizationIds: [civilization.id],
        factionIds: context.factions.filter((entry) => entry.civilizationId === civilization.id).map((entry) => entry.id),
        tags: ['simulation', 'living-history', 'living-polity', 'secession'],
        data: { parentPolityId: next.id, ...snapshotData(child) }
      },
      {
        causeEventIds: causes,
        createdEntityIds: [child.id],
        changedEntityIds: [next.id, secedingSystemId]
      }
    );
  }

  const reform = reformForm(next);
  if (
    reform &&
    next.legitimacy >= 76 &&
    next.stability >= 68 &&
    previous.legitimacy < 76 &&
    rng.chance(0.55)
  ) {
    const oldForm = next.form;
    next.form = reform;
    writePolitySnapshot(state, next, atHour);
    return publicDraft(
      state,
      civilization,
      atHour,
      {
        kind: 'politics',
        title: `${next.name}: государственная реформа`,
        summary: `${polityFormLabel(oldForm)} преобразована в форму «${polityFormLabel(reform)}». Реформа опирается на устойчивые институты и высокую легитимность.`,
        severity: 6,
        visibility: 'public',
        systemIds: next.territorySystemIds,
        civilizationIds: [civilization.id],
        factionIds: context.factions.filter((entry) => entry.civilizationId === civilization.id).map((entry) => entry.id),
        tags: ['simulation', 'living-history', 'living-polity', 'government-reform'],
        data: { ...snapshotData(next), previousPolityForm: oldForm }
      },
      { causeEventIds: causes, changedEntityIds: [next.id] }
    );
  }

  const capitalMoved = previous.capitalSystemId !== next.capitalSystemId;
  writePolitySnapshot(state, next, atHour);
  if (capitalMoved) {
    return publicDraft(
      state,
      civilization,
      atHour,
      {
        kind: 'politics',
        title: `${next.name}: перенос столицы`,
        summary: `Старая столица утратила устойчивый контроль. Государственные учреждения переведены в систему ${context.galaxy.systems.find((system) => system.id === next.capitalSystemId)?.name ?? next.capitalSystemId}.`,
        severity: 6,
        visibility: 'public',
        systemIds: [previous.capitalSystemId, next.capitalSystemId],
        civilizationIds: [civilization.id],
        factionIds: [],
        tags: ['simulation', 'living-history', 'living-polity', 'capital-relocation'],
        data: { ...snapshotData(next), previousCapitalSystemId: previous.capitalSystemId }
      },
      { causeEventIds: causes, changedEntityIds: [next.id, next.capitalSystemId] }
    );
  }

  if (next.mobilization >= 70 && previous.mobilization < 70) {
    return publicDraft(
      state,
      civilization,
      atHour,
      {
        kind: 'conflict',
        title: `${next.name}: всеобщая мобилизация`,
        summary: `Мобилизация достигла ${Math.round(next.mobilization)}/100. Государство переводит промышленность и транспорт на военные нормы.`,
        severity: 7,
        visibility: 'public',
        systemIds: next.territorySystemIds,
        civilizationIds: [civilization.id],
        factionIds: [],
        tags: ['simulation', 'living-history', 'living-polity', 'mobilization'],
        data: snapshotData(next)
      },
      { causeEventIds: causes, changedEntityIds: [next.id] }
    );
  }

  return null;
}
