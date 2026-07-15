import { describe, expect, it } from 'vitest';
import { recordWorldEvent } from '../simulation/kernel';
import type { SimulationState, WorldEvent } from '../simulation/types';

function worldEvent(index: number): WorldEvent {
  return {
    id: `world_${index}_history`,
    atHour: index,
    kind: index === 1 ? 'research' : 'politics',
    title: `Событие ${index}`,
    summary: 'История мира.',
    severity: index === 1 ? 10 : 4,
    visibility: 'public',
    systemIds: [],
    civilizationIds: [],
    factionIds: [],
    tags: index === 1 ? ['era-transition'] : ['simulation']
  };
}

function state(): SimulationState {
  return {
    version: 3,
    clock: { absoluteHour: 2_000, epochYear: 0 },
    systems: {}, civilizations: {}, factions: {}, ecosystems: {}, settlements: {},
    populationGroups: {}, tradeRoutes: {}, scheduledEvents: [],
    events: Array.from({ length: 1_500 }, (_, index) => worldEvent(index + 1)),
    nextSequence: 1_501,
    lastAdvanceReason: 'kernel-test'
  };
}

describe('kernel stability integration', () => {
  it('does not destroy history after the thousandth event', () => {
    const result = recordWorldEvent(state(), {
      kind: 'discovery', title: 'Новая запись', summary: 'Ручное событие.', severity: 5,
      visibility: 'public', systemIds: [], civilizationIds: [], factionIds: [], tags: ['simulation']
    });
    expect(result.simulation.events.length > 1_000).toBe(true);
    expect(result.simulation.events.some((event) => event.tags.includes('era-transition'))).toBe(true);
  });
});
