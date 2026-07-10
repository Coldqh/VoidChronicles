import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import type { GameStateSnapshot } from '../game/types';
import { parseSnapshot } from '../persistence/snapshot';

async function makeSnapshot(): Promise<GameStateSnapshot> {
  const galaxy = await generateGalaxy({
    seed: 'SAVE-TEST',
    systemCount: 20,
    historyYears: 100_000,
    civilizationCount: 3,
    lifeFrequency: 0.3,
    anomalyFrequency: 0.03,
    difficulty: 'standard'
  });
  return {
    schemaVersion: 1,
    galaxy,
    captain: {
      id: 'captain', name: 'Test', level: 1, xp: 0, health: 100, maxHealth: 100,
      credits: 10, reputation: 0,
      skills: { research: 1, archaeology: 1, trade: 1, combat: 1, crime: 0 },
      injuries: [], alive: true
    },
    ship: {
      id: 'ship', name: 'Test Ship', hull: 100, maxHull: 100, fuel: 100, maxFuel: 100,
      jumpRange: 200, cargoCapacity: 10, cargo: [], modules: [], statuses: []
    },
    currentSystemId: galaxy.startSystemId,
    gameYear: 0,
    discoveries: [],
    logs: []
  };
}

describe('snapshot validation', () => {
  it('repairs a missing current system reference', async () => {
    const snapshot = await makeSnapshot();
    snapshot.currentSystemId = 'missing-system';
    expect(parseSnapshot(snapshot).currentSystemId).toBe(snapshot.galaxy.startSystemId);
  });

  it('rejects a structurally broken save instead of crashing the UI later', async () => {
    const snapshot = await makeSnapshot();
    const broken = { ...snapshot, ship: { ...snapshot.ship, cargo: undefined } };
    expect(() => parseSnapshot(broken)).toThrow();
  });
});
