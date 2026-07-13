import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import type { GameStateSnapshot } from '../game/types';
import {
  createManualBackup,
  db,
  deleteSnapshot,
  loadSnapshot,
  saveSnapshotImmediately,
  scheduleSnapshotSave
} from '../persistence/db';
import { parseSnapshot } from '../persistence/snapshot';

async function makeSnapshot(): Promise<GameStateSnapshot> {
  const galaxy = await generateGalaxy({
    seed: 'PERSISTENCE-TEST',
    systemCount: 20,
    historyYears: 100_000,
    civilizationCount: 3,
    lifeFrequency: 0.3,
    anomalyFrequency: 0.03,
    difficulty: 'standard'
  });
  return parseSnapshot({
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
  });
}

describe.sequential('IndexedDB save coordinator', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  it('coalesces rapid writes and persists the newest state once', async () => {
    const first = await makeSnapshot();
    first.captain.credits = 100;
    const second = structuredClone(first);
    second.captain.credits = 250;

    const [savedFirstWaiter, savedSecondWaiter] = await Promise.all([
      scheduleSnapshotSave(first, 'first', 1),
      scheduleSnapshotSave(second, 'second', 1)
    ]);

    expect(savedFirstWaiter.captain.credits).toBe(250);
    expect(savedSecondWaiter.captain.credits).toBe(250);
    expect(savedSecondWaiter.saveMeta?.sequence).toBe(1);
    const loaded = await loadSnapshot();
    expect(loaded?.snapshot.captain.credits).toBe(250);
  });

  it('restores the newest valid backup when the primary record is corrupted', async () => {
    const snapshot = await makeSnapshot();
    snapshot.captain.credits = 777;
    await saveSnapshotImmediately(snapshot, 'initial');
    await createManualBackup('test-backup');

    const record = await db.saves.get('ironman');
    expect(record).toBeTruthy();
    await db.saves.put({
      ...record!,
      updatedAt: new Date().toISOString(),
      snapshot: { schemaVersion: 2, captain: null }
    });

    const recovered = await loadSnapshot();
    expect(recovered?.recoveredFromBackup).toBe(true);
    expect(recovered?.snapshot.captain.credits).toBe(777);
    await deleteSnapshot();
  });
});
