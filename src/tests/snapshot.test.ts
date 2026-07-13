import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import type { GameStateSnapshot } from '../game/types';
import {
  CURRENT_SCHEMA_VERSION,
  parseSnapshot,
  prepareSnapshotForSave
} from '../persistence/snapshot';

async function makeLegacySnapshot(): Promise<GameStateSnapshot> {
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
    logs: [],
    scanReports: [],
    pointsOfInterest: [],
    evidence: [],
    hypotheses: [],
    artifactKnowledge: [],
    crew: [],
    crewCandidates: [],
    factions: [], hubs: [], contracts: [], news: [], locationStates: [], currentHubId: null,
    localNpcs: [], civilizationContacts: [], archaeologyChains: [], researchProjects: [], technologyBlueprints: [], equipmentInventory: [], worldThreads: []
  };
}

describe('snapshot validation and migration', () => {
  it('migrates schema v1 to the current schema and creates integrity metadata', async () => {
    const legacy = await makeLegacySnapshot();
    const migrated = parseSnapshot(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.saveMeta?.appVersion).toBe('0.6.0');
    expect(migrated.saveMeta?.checksum).toMatch(/^[0-9a-f]{8}$/);
  });



  it('migrates schema v2 exploration fields to schema v3 defaults', async () => {
    const legacy = await makeLegacySnapshot();
    const v2 = {
      ...legacy,
      schemaVersion: 2,
      saveMeta: {
        savedAt: new Date().toISOString(),
        appVersion: '0.1.1',
        sequence: 5,
        reason: 'legacy-v2',
        checksum: '00000000'
      }
    };
    const migrated = parseSnapshot(v2, { verifyChecksum: false });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.pointsOfInterest).toEqual([]);
    expect(migrated.evidence).toEqual([]);
    expect(migrated.hypotheses).toEqual([]);
  });


  it('migrates v5 living-galaxy saves into civilization records', async () => {
    const current = prepareSnapshotForSave(parseSnapshot(await makeLegacySnapshot()), 'current-fixture');
    const { localNpcs: _localNpcs, civilizationContacts: _contacts, archaeologyChains: _chains, ...withoutCivilizations } = current;
    const v5 = {
      ...withoutCivilizations,
      schemaVersion: 5,
      saveMeta: { ...current.saveMeta!, appVersion: '0.4.0', reason: 'legacy-v5', checksum: '00000000' }
    };
    const migrated = parseSnapshot(v5, { verifyChecksum: false });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.localNpcs.length).toBeGreaterThan(0);
    expect(migrated.civilizationContacts.length).toBeGreaterThan(0);
    expect(migrated.galaxy.civilizations.every((entry) => (entry.cultures?.length ?? 0) > 0)).toBe(true);
  });


  it('migrates v6 civilization saves into research and world systems', async () => {
    const current = prepareSnapshotForSave(parseSnapshot(await makeLegacySnapshot()), 'current-v7-fixture');
    const { researchProjects: _research, technologyBlueprints: _blueprints, equipmentInventory: _equipment, worldThreads: _threads, ...withoutProgression } = current;
    const v6 = {
      ...withoutProgression,
      schemaVersion: 6,
      saveMeta: { ...current.saveMeta!, appVersion: '0.5.0', reason: 'legacy-v6', checksum: '00000000' }
    };
    const migrated = parseSnapshot(v6, { verifyChecksum: false });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.researchProjects).toEqual([]);
    expect(migrated.technologyBlueprints).toEqual([]);
    expect(migrated.equipmentInventory.length).toBeGreaterThan(0);
    expect(migrated.worldThreads.length).toBeGreaterThan(0);
  });
  it('repairs a missing current system reference', async () => {
    const snapshot = await makeLegacySnapshot();
    snapshot.currentSystemId = 'missing-system';
    expect(parseSnapshot(snapshot).currentSystemId).toBe(snapshot.galaxy.startSystemId);
  });

  it('rejects a structurally broken save instead of crashing the UI later', async () => {
    const snapshot = await makeLegacySnapshot();
    const broken = { ...snapshot, ship: { ...snapshot.ship, cargo: undefined } };
    expect(() => parseSnapshot(broken)).toThrow();
  });

  it('detects data corruption through checksum verification', async () => {
    const legacy = await makeLegacySnapshot();
    const saved = prepareSnapshotForSave(parseSnapshot(legacy), 'test');
    const corrupted = structuredClone(saved);
    corrupted.captain.credits += 999;
    expect(() => parseSnapshot(corrupted)).toThrow(/Контрольная сумма/);
  });

  it('rejects saves created by a future unsupported schema', async () => {
    const legacy = await makeLegacySnapshot();
    expect(() => parseSnapshot({ ...legacy, schemaVersion: 99 })).toThrow(/более новой версией/);
  });
});
