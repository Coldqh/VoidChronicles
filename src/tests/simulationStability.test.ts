import { describe, expect, it } from 'vitest';
import {
  auditSimulationState,
  maintainSimulationStability,
  SIMULATION_EVENT_LIMIT,
  SIMULATION_SCHEDULE_LIMIT
} from '../simulation/stability';
import type { SimulationState, WorldEvent } from '../simulation/types';

const stock = (value: number) => ({
  food: value,
  water: value,
  energy: value,
  medicine: value,
  parts: value,
  weapons: value,
  luxury: value,
  rareMaterials: value
});

function event(id: string, atHour: number, overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id,
    atHour,
    kind: 'politics',
    title: id,
    summary: id,
    severity: 4,
    visibility: 'public',
    systemIds: ['sys'],
    civilizationIds: ['civ'],
    factionIds: ['faction'],
    tags: ['simulation'],
    ...overrides
  };
}

function fixture(): SimulationState {
  return {
    version: 3,
    clock: { absoluteHour: 10_000 * 365 * 24, epochYear: 0 },
    systems: {
      sys: { systemId: 'wrong', population: -50, prosperity: 130, security: Number.NaN, supply: -2, tradePressure: 180, migrationPressure: -5, lastUpdatedHour: -1 }
    },
    civilizations: {
      civ: { civilizationId: 'wrong', population: -10, stability: 140, economy: -10, military: 50, research: Number.NaN, cohesion: 60, expansionPressure: 120, alive: true, lastUpdatedHour: -1 }
    },
    factions: {
      faction: { factionId: 'wrong', wealth: 150, military: -2, research: 50, influence: 101, tension: Number.NaN, lastUpdatedHour: -1 }
    },
    ecosystems: {},
    settlements: {
      settlement: { id: 'wrong', name: 'Город', kind: 'city', systemId: 'sys', civilizationId: 'civ', ownerFactionId: 'faction', population: 1000, infrastructure: 150, security: -1, unrest: 200, housing: Number.NaN, health: 70, production: stock(-1), consumption: stock(2), stocks: stock(-5), foundedHour: 0, abandoned: false, lastUpdatedHour: -1 }
    },
    populationGroups: {
      workers: { id: 'wrong', settlementId: 'settlement', civilizationId: 'civ', species: 'Люди', culture: 'Тест', socialClass: 'workers', profession: 'труд', population: 400, wealth: -1, health: 140, loyalty: Number.NaN, radicalization: 120, migrationDesire: -5 },
      orphan: { id: 'orphan', settlementId: 'missing', civilizationId: 'civ', species: 'Люди', culture: 'Тест', socialClass: 'workers', profession: 'труд', population: 100, wealth: 10, health: 10, loyalty: 10, radicalization: 10, migrationDesire: 10 }
    },
    tradeRoutes: {
      valid: { id: 'wrong', originSettlementId: 'settlement', destinationSettlementId: 'settlement_missing', pathSystemIds: ['sys', 'missing'], cargo: ['food'], capacity: -5, traffic: 150, danger: -4, disrupted: false, lastUpdatedHour: -1 }
    },
    scheduledEvents: Array.from({ length: 30_500 }, (_, index) => ({ id: `scheduled_${index % 25_500}` })),
    events: [],
    nextSequence: -5,
    lastAdvanceReason: 'test'
  };
}

describe('simulation stability maintenance', () => {
  it('normalizes invalid values and removes orphaned records', () => {
    const state = fixture();
    const report = maintainSimulationStability(state);
    expect(state.systems.sys?.population).toBe(0);
    expect(state.systems.sys?.prosperity).toBe(100);
    expect(state.settlements.settlement?.stocks.food).toBe(0);
    expect(state.populationGroups.orphan).toBe(undefined);
    expect(state.tradeRoutes.valid).toBe(undefined);
    expect(report.normalizedValues > 10).toBe(true);
    expect(report.removedOrphans > 1).toBe(true);
  });

  it('keeps one latest snapshot per entity and removes duplicate event ids', () => {
    const state = fixture();
    state.events = [
      event('duplicate', 30),
      event('duplicate', 10),
      event('state_new', 40, { visibility: 'hidden', tags: ['living-economy-state', 'state-snapshot'], data: { economyCivilizationId: 'civ' } }),
      event('state_old', 20, { visibility: 'hidden', tags: ['living-economy-state', 'state-snapshot'], data: { economyCivilizationId: 'civ' } })
    ];
    const report = maintainSimulationStability(state);
    expect(state.events.filter((entry) => entry.id === 'duplicate').length).toBe(1);
    expect(state.events.some((entry) => entry.id === 'state_new')).toBe(true);
    expect(state.events.some((entry) => entry.id === 'state_old')).toBe(false);
    expect(report.removedDuplicateEvents).toBe(1);
    expect(report.removedSnapshotEvents).toBe(1);
  });

  it('repairs causal links in both directions and deletes broken references', () => {
    const state = fixture();
    state.events = [
      event('result', 20, { data: { causedByEventIds: 'cause|missing' } }),
      event('cause', 10)
    ];
    const report = maintainSimulationStability(state);
    expect(state.events.find((entry) => entry.id === 'result')?.data?.causedByEventIds).toBe('cause');
    expect(state.events.find((entry) => entry.id === 'cause')?.data?.resultedInEventIds).toBe('result');
    expect(report.removedBrokenLinks).toBe(1);
    expect(report.repairedReverseLinks).toBe(1);
  });

  it('resolves wars that cannot remain active for centuries', () => {
    const state = fixture();
    state.events = [event('state_war_old', 0, {
      visibility: 'hidden',
      kind: 'conflict',
      tags: ['simulation', 'living-war-state', 'state-snapshot'],
      data: {
        warId: 'war_old',
        warName: 'Столетняя война',
        warStatus: 'active',
        warStartedHour: 0,
        warLastUpdatedHour: 0,
        warFronts: 'front~sys~50~50~50~20~20~20~0',
        attackerWarExhaustion: 90,
        defenderWarExhaustion: 92
      }
    })];
    const report = maintainSimulationStability(state);
    expect(state.events.find((entry) => entry.tags.includes('living-war-state'))?.data?.warStatus).toBe('resolved');
    expect(state.events.some((entry) => entry.tags.includes('stability-war-resolution'))).toBe(true);
    expect(report.resolvedStaleWars).toBe(1);
  });

  it('collapses repeated social spam but keeps causally referenced events', () => {
    const state = fixture();
    const year = 365 * 24;
    state.events = [
      event('revolt_new', 100 * year, { kind: 'conflict', tags: ['social-revolt'] }),
      event('revolt_old', 95 * year, { kind: 'conflict', tags: ['social-revolt'] }),
      event('strike_new', 90 * year, { kind: 'economy', tags: ['general-strike'], data: { causedByEventIds: 'strike_old' } }),
      event('strike_old', 88 * year, { kind: 'economy', tags: ['general-strike'] })
    ];
    const report = maintainSimulationStability(state);
    expect(state.events.some((entry) => entry.id === 'revolt_old')).toBe(false);
    expect(state.events.some((entry) => entry.id === 'strike_old')).toBe(true);
    expect(report.removedSpamEvents).toBe(1);
  });

  it('stays bounded at 100, 1 000 and 10 000 simulated years', () => {
    for (const years of [100, 1_000, 10_000]) {
      const state = fixture();
      state.clock.absoluteHour = years * 365 * 24;
      state.events = Array.from({ length: 12_000 }, (_, index) => event(
        `world_${index + 1}_history`,
        state.clock.absoluteHour - index * 24,
        index % 997 === 0 ? { severity: 10, tags: ['era-transition'] } : {}
      ));
      maintainSimulationStability(state);
      expect(state.events.length < SIMULATION_EVENT_LIMIT + 1).toBe(true);
      expect(state.events.some((entry) => entry.tags.includes('era-transition'))).toBe(true);
      expect(auditSimulationState(state).length).toBe(0);
    }
  });

  it('keeps a valid 1 500-system galaxy intact', () => {
    const state = fixture();
    state.systems = Object.fromEntries(Array.from({ length: 1_500 }, (_, index) => {
      const id = `sys_${index}`;
      return [id, { systemId: id, population: index * 100, prosperity: 50, security: 50, supply: 50, tradePressure: 20, migrationPressure: 10, lastUpdatedHour: 0 }];
    }));
    state.settlements = {};
    state.populationGroups = {};
    state.tradeRoutes = {};
    maintainSimulationStability(state);
    expect(Object.keys(state.systems).length).toBe(1_500);
    expect(auditSimulationState(state).length).toBe(0);
  });

  it('caps scheduled events and advances the event sequence safely', () => {
    const state = fixture();
    state.events = [event('world_900_history', 10)];
    maintainSimulationStability(state);
    expect(state.scheduledEvents.length < SIMULATION_SCHEDULE_LIMIT + 1).toBe(true);
    expect(state.nextSequence > 900).toBe(true);
  });

  it('is idempotent after the first repair pass', () => {
    const state = fixture();
    state.events = [event('one', 10), event('one', 5)];
    maintainSimulationStability(state);
    const snapshot = JSON.stringify(state);
    const second = maintainSimulationStability(state);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(second.removedDuplicateEvents).toBe(0);
    expect(second.removedBrokenLinks).toBe(0);
  });
});
