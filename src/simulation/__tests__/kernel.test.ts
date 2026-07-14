import { describe, expect, it } from 'vitest';
import { advanceSimulation, initializeSimulation } from '../kernel';
import type { Galaxy } from '../../game/types';

const galaxy = {
  id: 'g', seed: 'TEST', createdAt: '', currentYear: 0,
  settings: { seed: 'TEST', systemCount: 20, historyYears: 100000, civilizationCount: 2, lifeFrequency: .3, anomalyFrequency: .02, difficulty: 'standard' },
  systems: [{ id: 's1', name: 'S1', coordinates: { x: 0, y: 0 }, starClass: 'G', starCount: 1, planets: [], neighbors: [], danger: 'safe', civilizationIds: [], known: false, visited: false, scanned: false, anomaly: false, region: 'core' }],
  civilizations: [], figures: [], history: [], artifacts: [], startSystemId: 's1'
} satisfies Galaxy;

describe('simulation kernel', () => {
  it('advances independently from the player and keeps deterministic time', () => {
    const result = advanceSimulation({ galaxy, factions: [], hubs: [], warFronts: [], contracts: [], news: [], simulation: initializeSimulation('TEST') }, 24 * 90);
    expect(result.simulation.time.day).toBe(90);
    expect(result.simulation.lastProcessedHour).toBe(2160);
    expect(result.simulation.revision).toBeGreaterThanOrEqual(1);
  });
});
