import { describe, expect, it } from 'vitest';
import { advanceSimulation, initializeSimulation } from '../kernel';
import type { Galaxy } from '../../game/types';

const galaxy = {
  id: 'g',
  seed: 'TEST',
  createdAt: '',
  currentYear: 0,
  settings: {
    seed: 'TEST',
    systemCount: 20,
    historyYears: 100000,
    civilizationCount: 2,
    lifeFrequency: 0.3,
    anomalyFrequency: 0.02,
    difficulty: 'standard'
  },
  systems: [{
    id: 's1',
    name: 'S1',
    coordinates: { x: 0, y: 0 },
    starClass: 'G',
    starCount: 1,
    planets: [],
    neighbors: [],
    danger: 'safe',
    civilizationIds: [],
    known: false,
    visited: false,
    scanned: false,
    anomaly: false,
    region: 'core'
  }],
  civilizations: [],
  figures: [],
  history: [],
  artifacts: [],
  startSystemId: 's1'
} satisfies Galaxy;

describe('simulation kernel', () => {
  it('advances independently from the player and keeps deterministic time', () => {
    const context = {
      seed: galaxy.seed,
      galaxy,
      factions: [],
      hubs: []
    };

    const initial = initializeSimulation(context);
    const result = advanceSimulation(initial, context, 24 * 90, 'kernel-test');

    expect(result.simulation.clock.absoluteHour).toBe(2160);
    expect(result.simulation.clock.epochYear).toBe(0);
    expect(result.simulation.lastAdvanceReason).toBe('kernel-test');
    expect(result.simulation.version).toBe(3);
  });
});
