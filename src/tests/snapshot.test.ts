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
      injuries: [], alive: true, condition: 'active', commandIdentity: 'organic'
    },
    ship: {
      id: 'ship', name: 'Test Ship', hull: 100, maxHull: 100, fuel: 100, maxFuel: 100,
      jumpRange: 200, cargoCapacity: 10, cargo: [], modules: [], statuses: [], systems: [], transponder: 'TEST-01', registration: 'TEST-REG', aiCore: { id: 'test-ai', name: 'TEST AI', personality: 'neutral', directives: [], integrity: 100, operational: true, journal: [] }
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
    localNpcs: [], civilizationContacts: [], archaeologyChains: [], researchProjects: [], technologyBlueprints: [], equipmentInventory: [], worldThreads: [], storyScenes: [], pendingConsequences: [], objectives: [], tutorial: { enabled: false, active: false, currentStep: 0, completed: true }, activeShipEncounter: null, pursuits: [], warFronts: [], legacy: { mode: 'active', campaignEnded: false, currentCaptainRecordId: '', captains: [], successionCandidates: [], lostExpeditions: [], memorials: [], chronicle: [], observerYear: 0, aiTurns: 0 }
  };
}

describe('snapshot validation and migration', () => {
  it('migrates schema v1 to the current schema and creates integrity metadata', async () => {
    const legacy = await makeLegacySnapshot();
    const migrated = parseSnapshot(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.saveMeta?.appVersion).toBe('0.9.7');
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
  it('migrates v8 saves into warfare state', async () => {
    const current = prepareSnapshotForSave(parseSnapshot(await makeLegacySnapshot()), 'v8-fixture');
    const { activeShipEncounter: _encounter, pursuits: _pursuits, warFronts: _fronts, ...withoutWarfare } = current;
    const v8 = { ...withoutWarfare, schemaVersion: 8, saveMeta: { ...current.saveMeta!, appVersion: '0.7.1', reason: 'legacy-v8', checksum: '00000000' } };
    const migrated = parseSnapshot(v8, { verifyChecksum: false });
    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.ship.systems).toHaveLength(7);
    expect(migrated.activeShipEncounter).toBeNull();
    expect(migrated.warFronts.length).toBeGreaterThan(0);
  });

  it('migrates v9 warfare saves into legacy continuity', async () => {
    const current = prepareSnapshotForSave(parseSnapshot(await makeLegacySnapshot()), 'v9-fixture');
    const { legacy: _legacy, ...withoutLegacy } = current;
    const v9 = { ...withoutLegacy, schemaVersion: 9, saveMeta: { ...current.saveMeta!, appVersion: '0.8.0', reason: 'legacy-v9', checksum: '00000000' } };
    const migrated = parseSnapshot(v9, { verifyChecksum: false });
    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.legacy.mode).toBe('active');
    expect(migrated.legacy.captains).toHaveLength(1);
    expect(migrated.legacy.currentCaptainRecordId).toBe(migrated.legacy.captains[0]?.id);
  });

  it('restores an ironman save in the middle of ship combat', async () => {
    const current = parseSnapshot(await makeLegacySnapshot());
    current.activeShipEncounter = {
      id: 'encounter-test', phase: 'combat', range: 2, turn: 3, playerInitiative: true, brace: false, evasion: 12, canBoard: false, boardingProgress: 0, stationAssignments: {},
      contact: { id: 'contact-test', kind: 'pirate', intent: 'robbery', name: 'Test Raider', systemId: current.currentSystemId, threat: 70, demand: 'cargo', description: 'hostile', knowsIdentity: false, knowsTransponder: true, hostile: true },
      enemy: { name: 'Test Raider', hull: 40, maxHull: 80, systems: current.ship.systems, crew: 5, morale: 60, cargoValue: 900 },
      combatLog: ['turn 3']
    };
    const saved = prepareSnapshotForSave(current, 'mid-combat');
    const restored = parseSnapshot(saved);
    expect(restored.activeShipEncounter?.phase).toBe('combat');
    expect(restored.activeShipEncounter?.turn).toBe(3);
    expect(restored.activeShipEncounter?.enemy.hull).toBe(40);
  });

});
