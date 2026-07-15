import type { Civilization } from '../game/types';
import { createRng } from '../generation/rng';
import {
  ERA_BASE_DURATION_YEARS,
  ERA_LABELS,
  eraIndex,
  legacyTechLevelForEra,
  nextEra,
  previousEra,
  spaceAccessForEra
} from '../deeptime/eras';
import type { CivilizationalEra, CivilizationSpaceAccess } from '../deeptime/types';
import type { SimulationContext } from './context';
import {
  causalizeDraft,
  prospectiveCivilizationCycleEventId,
  recentCausalEvents
} from './causality';
import { simulateLivingPolityCycle } from './polities';
import { simulateLivingSocietyCycle } from './society';
import { emptyStockpile, populationGroupsForSettlement } from './settlements';
import type {
  SettlementState,
  SimulationState,
  WorldEvent,
  WorldEventDraft
} from './types';
import { simulateLivingWarCycle } from './war';

const HOURS_PER_YEAR = 365 * 24;
const ERA_SET = new Set<CivilizationalEra>([
  'pre-sapient', 'tribal', 'neolithic', 'urban', 'bronze', 'iron', 'medieval',
  'gunpowder', 'industrial', 'modern', 'atomic', 'early-space',
  'interplanetary', 'interstellar', 'advanced'
]);

const ERA_CHECK_YEARS: Record<CivilizationalEra, number> = {
  'pre-sapient': 100,
  tribal: 25,
  neolithic: 12,
  urban: 6,
  bronze: 5,
  iron: 5,
  medieval: 4,
  gunpowder: 2,
  industrial: 1,
  modern: 1,
  atomic: 1,
  'early-space': 2,
  interplanetary: 3,
  interstellar: 5,
  advanced: 10
};

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function isEra(value: unknown): value is CivilizationalEra {
  return typeof value === 'string' && ERA_SET.has(value as CivilizationalEra);
}

function latestEraEvent(
  state: SimulationState,
  civilizationId: string
): WorldEvent | undefined {
  return state.events.find(
    (event) =>
      event.civilizationIds.includes(civilizationId) &&
      event.tags.includes('living-history-era') &&
      isEra(event.data?.era)
  );
}

export function liveEraForCivilization(
  state: SimulationState,
  civilization: Civilization
): CivilizationalEra {
  const eventEra = latestEraEvent(state, civilization.id)?.data?.era;
  if (isEra(eventEra)) return eventEra;
  return civilization.era ?? civilization.development?.era ?? 'tribal';
}

export function liveSpaceAccessForCivilization(
  state: SimulationState,
  civilization: Civilization
): CivilizationSpaceAccess {
  const value = latestEraEvent(state, civilization.id)?.data?.spaceAccess;
  if (
    value === 'none' ||
    value === 'orbital' ||
    value === 'interplanetary' ||
    value === 'interstellar' ||
    value === 'ftl'
  ) {
    return value;
  }
  return civilization.development?.spaceAccess ?? spaceAccessForEra(liveEraForCivilization(state, civilization));
}

function average(values: number[], fallback: number): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : fallback;
}

function developmentWindowYears(era: CivilizationalEra): number {
  const historical = ERA_BASE_DURATION_YEARS[era];
  if (!Number.isFinite(historical)) return ERA_CHECK_YEARS[era];
  return Math.max(ERA_CHECK_YEARS[era], Math.round(historical * 0.018));
}

function eraProgressScore(
  state: SimulationState,
  civilizationId: string
): {
  score: number;
  infrastructure: number;
  health: number;
  ecologicalPressure: number;
} {
  const civilization = state.civilizations[civilizationId];
  const settlements = Object.values(state.settlements).filter(
    (settlement) => settlement.civilizationId === civilizationId && !settlement.abandoned
  );
  const infrastructure = average(settlements.map((entry) => entry.infrastructure), 10);
  const health = average(settlements.map((entry) => entry.health), 30);
  const security = average(settlements.map((entry) => entry.security), 35);
  const unrest = average(settlements.map((entry) => entry.unrest), 45);
  const supply = average(
    settlements.map((entry) => state.systems[entry.systemId]?.supply ?? 35),
    35
  );
  const contamination = average(
    settlements
      .map((entry) => (entry.planetId ? state.ecosystems[entry.planetId]?.contamination : undefined))
      .filter((value): value is number => value !== undefined),
    10
  );

  const score = clamp(
    (civilization?.research ?? 20) * 0.27 +
      (civilization?.economy ?? 20) * 0.18 +
      (civilization?.stability ?? 20) * 0.14 +
      (civilization?.cohesion ?? 20) * 0.1 +
      infrastructure * 0.14 +
      health * 0.08 +
      security * 0.05 +
      supply * 0.08 -
      unrest * 0.06 -
      contamination * 0.08
  );

  return {
    score,
    infrastructure,
    health,
    ecologicalPressure: contamination
  };
}

function createOrbitalSettlement(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): SettlementState | null {
  const existing = Object.values(state.settlements).find(
    (settlement) =>
      settlement.civilizationId === civilization.id &&
      settlement.kind === 'orbital' &&
      !settlement.abandoned
  );
  if (existing) return existing;

  const system = context.galaxy.systems.find(
    (entry) => entry.id === civilization.homeSystemId
  );
  if (!system) return null;

  const population = Math.max(
    500,
    Math.round((state.civilizations[civilization.id]?.population ?? 50_000) * 0.0025)
  );
  const production = emptyStockpile(0);
  production.energy = 18;
  production.parts = 12;
  production.medicine = 4;
  production.rareMaterials = 2;
  const consumption = emptyStockpile(0);
  const people = Math.max(1, population / 10_000);
  consumption.food = people * 1.1;
  consumption.water = people * 1.25;
  consumption.energy = people * 1.8;
  consumption.medicine = people * 0.2;
  consumption.parts = people * 0.35;
  consumption.luxury = people * 0.05;

  const settlement: SettlementState = {
    id: `settlement_living_orbital_${civilization.id}`,
    name: `${system.name} · Первый орбитальный комплекс`,
    kind: 'orbital',
    systemId: system.id,
    civilizationId: civilization.id,
    ownerFactionId: context.factions.find(
      (faction) => faction.civilizationId === civilization.id
    )?.id,
    population,
    infrastructure: 48,
    security: 58,
    unrest: 12,
    housing: 62,
    health: 67,
    production,
    consumption,
    stocks: Object.fromEntries(
      Object.keys(production).map((key) => [
        key,
        Math.max(
          10,
          ((production as Record<string, number>)[key] ?? 0) * 60 +
            ((consumption as Record<string, number>)[key] ?? 0) * 60
        )
      ])
    ) as SettlementState['stocks'],
    foundedHour: atHour,
    abandoned: false,
    lastUpdatedHour: atHour
  };

  state.settlements[settlement.id] = settlement;
  for (const group of populationGroupsForSettlement(settlement, context)) {
    state.populationGroups[group.id] = group;
  }
  return settlement;
}

function applyEraEffects(
  state: SimulationState,
  civilization: Civilization,
  from: CivilizationalEra,
  to: CivilizationalEra,
  atHour: number,
  context: SimulationContext
): void {
  const forward = eraIndex(to) > eraIndex(from);
  const infrastructureDelta = forward ? Math.max(2, Math.floor(eraIndex(to) / 3)) : -10;
  const productionMultiplier = forward ? 1.04 + eraIndex(to) * 0.006 : 0.68;

  for (const settlement of Object.values(state.settlements)) {
    if (settlement.civilizationId !== civilization.id || settlement.abandoned) continue;
    const isRemote = settlement.systemId !== civilization.homeSystemId;
    const losesSpaceAccess =
      !forward && spaceAccessForEra(to) === 'none' &&
      (settlement.kind === 'orbital' || isRemote);

    state.settlements[settlement.id] = {
      ...settlement,
      population: losesSpaceAccess
        ? Math.max(0, Math.round(settlement.population * 0.18))
        : Math.max(0, Math.round(settlement.population * (forward ? 1.025 : 0.82))),
      infrastructure: clamp(settlement.infrastructure + infrastructureDelta),
      security: clamp(settlement.security + (forward ? 2 : -8)),
      unrest: clamp(settlement.unrest + (forward ? -2 : 14)),
      health: clamp(settlement.health + (forward ? 2 : -9)),
      production: Object.fromEntries(
        Object.entries(settlement.production).map(([resource, value]) => [
          resource,
          Math.max(0, value * productionMultiplier)
        ])
      ) as SettlementState['production'],
      abandoned: losesSpaceAccess && settlement.population < 2_000,
      lastUpdatedHour: atHour
    };
  }

  if (to === 'early-space') {
    createOrbitalSettlement(state, civilization, context, atHour);
  }
}

function lastDevelopmentHour(state: SimulationState, civilizationId: string): number {
  return latestEraEvent(state, civilizationId)?.atHour ?? 0;
}

function simulateSocietalCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const societyEvent = simulateLivingSocietyCycle(state, civilization, context, atHour);
  if (societyEvent) return societyEvent;
  const polityEvent = simulateLivingPolityCycle(state, civilization, context, atHour);
  if (polityEvent) return polityEvent;
  return simulateLivingWarCycle(state, civilization, context, atHour);
}

function causalDevelopmentDraft(
  state: SimulationState,
  civilization: Civilization,
  atHour: number,
  draft: WorldEventDraft,
  changedEntityIds: string[]
): WorldEventDraft {
  const systemIds = Object.values(state.settlements)
    .filter((settlement) => settlement.civilizationId === civilization.id)
    .map((settlement) => settlement.systemId);
  const causeEventIds = recentCausalEvents(state, {
    civilizationIds: [civilization.id],
    systemIds,
    kinds: ['shortage', 'ecology', 'conflict', 'migration', 'politics', 'disaster'],
    tags: ['living-polity', 'living-war', 'causal-history'],
    beforeHour: atHour,
    limit: 3
  }).map((event) => event.id);
  return causalizeDraft(state, draft, {
    causeEventIds,
    changedEntityIds,
    prospectiveEventId: prospectiveCivilizationCycleEventId(state, civilization.id, atHour)
  });
}

export function simulateCivilizationDevelopmentCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const simulationCivilization = state.civilizations[civilization.id];
  if (!simulationCivilization?.alive) return null;

  const societalEvent = simulateSocietalCycle(state, civilization, context, atHour);
  if (societalEvent) return societalEvent;
  const currentEra = liveEraForCivilization(state, civilization);
  const yearsSinceLastChange = Math.max(
    0,
    (atHour - lastDevelopmentHour(state, civilization.id)) / HOURS_PER_YEAR
  );
  if (yearsSinceLastChange < ERA_CHECK_YEARS[currentEra]) return societalEvent;

  const metrics = eraProgressScore(state, civilization.id);
  const rng = createRng(
    `${context.seed}:living-history:${civilization.id}:${currentEra}:${Math.floor(atHour / HOURS_PER_YEAR)}`
  );
  const criticalFailure =
    simulationCivilization.stability <= 18 ||
    simulationCivilization.cohesion <= 16 ||
    metrics.health <= 22 ||
    metrics.ecologicalPressure >= 88;

  if (criticalFailure && eraIndex(currentEra) > eraIndex('tribal')) {
    const regressionChance = clamp(
      0.25 +
        (25 - simulationCivilization.stability) / 80 +
        (25 - metrics.health) / 90 +
        metrics.ecologicalPressure / 260,
      0.2,
      0.88
    );
    if (rng.chance(regressionChance)) {
      const targetEra = previousEra(currentEra);
      applyEraEffects(state, civilization, currentEra, targetEra, atHour, context);
      simulationCivilization.research = clamp(simulationCivilization.research - 14);
      simulationCivilization.economy = clamp(simulationCivilization.economy - 12);
      simulationCivilization.military = clamp(simulationCivilization.military - 8);
      simulationCivilization.lastUpdatedHour = atHour;

      return causalDevelopmentDraft(
        state,
        civilization,
        atHour,
        {
          kind: 'disaster',
          title: `${civilization.name}: цивилизационный регресс`,
          summary: `Кризис разрушил часть институтов и инфраструктуры. Общество откатилось из эпохи «${ERA_LABELS[currentEra]}» в эпоху «${ERA_LABELS[targetEra]}».`,
          severity: 9,
          visibility: 'public',
          systemIds: Object.values(state.settlements)
            .filter((settlement) => settlement.civilizationId === civilization.id)
            .map((settlement) => settlement.systemId),
          civilizationIds: [civilization.id],
          factionIds: context.factions
            .filter((faction) => faction.civilizationId === civilization.id)
            .map((faction) => faction.id),
          tags: ['simulation', 'living-history', 'living-history-era', 'regression'],
          data: {
            era: targetEra,
            previousEra: currentEra,
            spaceAccess: spaceAccessForEra(targetEra),
            techLevel: legacyTechLevelForEra(targetEra),
            progressScore: Math.round(metrics.score),
            regression: true
          }
        },
        [civilization.id, ...Object.values(state.settlements)
          .filter((settlement) => settlement.civilizationId === civilization.id)
          .map((settlement) => settlement.id)]
      );
    }
  }

  const targetEra = nextEra(currentEra);
  if (!targetEra) return societalEvent;

  const windowYears = developmentWindowYears(currentEra);
  const accumulatedProgress = metrics.score * yearsSinceLastChange;
  const requiredProgress = windowYears * (58 + eraIndex(currentEra) * 1.5);
  if (accumulatedProgress < requiredProgress) return societalEvent;

  const stabilityGate = simulationCivilization.stability >= 26;
  const healthGate = metrics.health >= 32;
  const researchGate = simulationCivilization.research >= Math.min(88, 22 + eraIndex(targetEra) * 4);
  if (!stabilityGate || !healthGate || !researchGate) return societalEvent;

  applyEraEffects(state, civilization, currentEra, targetEra, atHour, context);
  simulationCivilization.research = clamp(simulationCivilization.research + 4);
  simulationCivilization.economy = clamp(simulationCivilization.economy + 3);
  simulationCivilization.military = clamp(simulationCivilization.military + 2);
  simulationCivilization.lastUpdatedHour = atHour;

  return causalDevelopmentDraft(
    state,
    civilization,
    atHour,
    {
      kind: 'research',
      title: `${civilization.name}: переход в эпоху «${ERA_LABELS[targetEra]}»`,
      summary: `Рост знаний, производства и институтов завершил эпоху «${ERA_LABELS[currentEra]}». Развитие произошло внутри живой симуляции после начала кампании.`,
      severity: Math.min(10, 5 + Math.floor(eraIndex(targetEra) / 2)),
      visibility: eraIndex(targetEra) >= eraIndex('early-space') ? 'public' : 'local',
      systemIds: Object.values(state.settlements)
        .filter((settlement) => settlement.civilizationId === civilization.id)
        .map((settlement) => settlement.systemId),
      civilizationIds: [civilization.id],
      factionIds: context.factions
        .filter((faction) => faction.civilizationId === civilization.id)
        .map((faction) => faction.id),
      tags: ['simulation', 'living-history', 'living-history-era', 'era-transition'],
      data: {
        era: targetEra,
        previousEra: currentEra,
        spaceAccess: spaceAccessForEra(targetEra),
        techLevel: legacyTechLevelForEra(targetEra),
        progressScore: Math.round(metrics.score),
        regression: false
      }
    },
    [civilization.id, ...Object.values(state.settlements)
      .filter((settlement) => settlement.civilizationId === civilization.id)
      .map((settlement) => settlement.id)]
  );
}
