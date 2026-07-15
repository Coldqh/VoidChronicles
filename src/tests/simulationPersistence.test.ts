import { describe, expect, it } from 'vitest';
import type { GameStateSnapshot } from '../game/types';
import { generateGalaxy } from '../generation/generateGalaxy';
import { initializeSimulation } from '../simulation/kernel';
import { repairSimulationPersistence } from '../simulation/integrity';
import { createKnowledgeFromLegacy } from '../simulation/knowledge';
import { initializeLivingGalaxy } from '../world/livingGalaxy';
import { initializeCivilizationLayer } from '../world/civilizations';
import {
  CURRENT_SCHEMA_VERSION,
  parseSnapshot,
  prepareSnapshotForSave
} from '../persistence/snapshot';

async function makeSnapshot(): Promise<GameStateSnapshot> {
  const generated = await generateGalaxy({
    seed: 'PERSISTENCE-V3',
    systemCount: 30,
    historyYears: 120_000,
    civilizationCount: 4,
    lifeFrequency: 0.4,
    anomalyFrequency: 0.03,
    difficulty: 'standard'
  });
  const living = initializeLivingGalaxy(generated);
  const layer = initializeCivilizationLayer(generated, living.hubs);
  const context = {
    seed: layer.galaxy.seed,
    galaxy: layer.galaxy,
    factions: living.factions,
    hubs: layer.hubs
  };
  const simulation = initializeSimulation(context);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveMeta: {
      savedAt: new Date().toISOString(),
      appVersion: '0.12.2',
      sequence: 0,
      reason: 'fixture',
      checksum: '00000000'
    },
    simulation,
    knowledge: createKnowledgeFromLegacy(layer.galaxy, simulation.clock.absoluteHour),
    galaxy: layer.galaxy,
    captain: {
      id: 'captain',
      name: 'Persistence Test',
      level: 1,
      xp: 0,
      health: 100,
      maxHealth: 100,
      credits: 1000,
      reputation: 0,
      skills: { research: 1, archaeology: 1, trade: 1, combat: 1, crime: 0 },
      injuries: [],
      alive: true,
      condition: 'active',
      commandIdentity: 'organic'
    },
    ship: {
      id: 'ship',
      name: 'Persistence Ship',
      hull: 100,
      maxHull: 100,
      fuel: 100,
      maxFuel: 100,
      jumpRange: 230,
      cargoCapacity: 10,
      cargo: [],
      modules: [],
      statuses: [],
      systems: [],
      transponder: 'PERSISTENCE-01',
      registration: 'PERSISTENCE-REG'
    },
    currentSystemId: layer.galaxy.startSystemId,
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
    factions: living.factions,
    hubs: layer.hubs,
    contracts: living.contracts,
    news: living.news,
    locationStates: [],
    currentHubId: null,
    localNpcs: layer.localNpcs,
    civilizationContacts: layer.civilizationContacts,
    archaeologyChains: layer.archaeologyChains,
    researchProjects: [],
    technologyBlueprints: [],
    equipmentInventory: [],
    worldThreads: [],
    storyScenes: [],
    pendingConsequences: [],
    objectives: [],
    tutorial: { enabled: false, active: false, currentStep: 0, completed: true },
    activeShipEncounter: null,
    pursuits: [],
    warFronts: [],
    legacy: {
      mode: 'active',
      campaignEnded: false,
      currentCaptainRecordId: '',
      captains: [],
      successionCandidates: [],
      lostExpeditions: [],
      memorials: [],
      chronicle: [],
      observerYear: 0
    }
  };
}

describe('simulation persistence v3', () => {
  it('preserves settlement shortages and disrupted routes across repeated saves', async () => {
    const snapshot = await makeSnapshot();
    const settlement = Object.values(snapshot.simulation.settlements)[0];
    expect(settlement).toBeDefined();
    if (!settlement) return;

    settlement.unrest = 97;
    settlement.stocks.food = 1;
    settlement.health = 23;

    const route = Object.values(snapshot.simulation.tradeRoutes)[0];
    if (route) route.disrupted = true;

    const saved = prepareSnapshotForSave(snapshot, 'persistence-v3-first');
    const restored = parseSnapshot(saved);
    const restoredSettlement = restored.simulation.settlements[settlement.id];

    expect(restored.schemaVersion).toBe(13);
    expect(restored.simulation.version).toBe(3);
    expect(restoredSettlement?.unrest).toBe(97);
    expect(restoredSettlement?.stocks.food).toBe(1);
    expect(restoredSettlement?.health).toBe(23);
    if (route) expect(restored.simulation.tradeRoutes[route.id]?.disrupted).toBe(true);

    const savedAgain = prepareSnapshotForSave(restored, 'persistence-v3-second');
    const restoredAgain = parseSnapshot(savedAgain);
    expect(restoredAgain.simulation.settlements[settlement.id]?.stocks.food).toBe(1);
    expect(Object.keys(restoredAgain.simulation.settlements)).toEqual(
      Object.keys(restored.simulation.settlements)
    );
  });

  it('repairs orphaned population, broken routes and duplicate schedules', async () => {
    const snapshot = await makeSnapshot();
    const context = {
      galaxy: snapshot.galaxy,
      factions: snapshot.factions,
      hubs: snapshot.hubs
    };
    const simulation = structuredClone(snapshot.simulation);
    const settlement = Object.values(simulation.settlements)[0];
    expect(settlement).toBeDefined();
    if (!settlement) return;

    simulation.populationGroups.orphan = {
      id: 'orphan',
      settlementId: 'missing-settlement',
      species: 'none',
      culture: 'none',
      socialClass: 'workers',
      profession: 'none',
      population: 100,
      wealth: 0,
      health: 0,
      loyalty: 0,
      radicalization: 0,
      migrationDesire: 100
    };
    simulation.tradeRoutes.broken = {
      id: 'broken',
      originSettlementId: settlement.id,
      destinationSettlementId: 'missing-settlement',
      pathSystemIds: [settlement.systemId, 'missing-system'],
      cargo: ['food'],
      capacity: 100,
      traffic: 50,
      danger: 50,
      disrupted: false,
      lastUpdatedHour: 0
    };

    const settlementCycle = simulation.scheduledEvents.find(
      (entry) => entry.kind === 'settlement-cycle' && entry.entityId === settlement.id
    );
    if (settlementCycle) {
      simulation.scheduledEvents.push({ ...settlementCycle });
    }

    settlement.abandoned = true;
    settlement.kind = 'abandoned';
    settlement.population = 0;

    const repaired = repairSimulationPersistence(simulation, context);
    expect(repaired.version).toBe(3);
    expect(repaired.populationGroups.orphan).toBeUndefined();
    expect(repaired.tradeRoutes.broken).toBeUndefined();
    expect(
      repaired.scheduledEvents.some(
        (entry) =>
          entry.kind === 'settlement-cycle' && entry.entityId === settlement.id
      )
    ).toBe(false);
    expect(new Set(repaired.scheduledEvents.map((entry) => entry.id)).size).toBe(
      repaired.scheduledEvents.length
    );
  });

  it('migrates schema v12 without regenerating persisted settlements', async () => {
    const current = await makeSnapshot();
    const settlement = Object.values(current.simulation.settlements)[0];
    expect(settlement).toBeDefined();
    if (!settlement) return;

    settlement.name = 'НЕ ПЕРЕСОЗДАВАТЬ';
    settlement.population = 424_242;
    settlement.stocks.medicine = 3;

    const legacy = {
      ...current,
      schemaVersion: 12,
      simulation: {
        ...current.simulation,
        version: 2
      },
      saveMeta: {
        ...current.saveMeta!,
        appVersion: '0.12.1',
        reason: 'legacy-v12',
        checksum: '00000000'
      }
    };

    const migrated = parseSnapshot(legacy, { verifyChecksum: false });
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.simulation.version).toBe(3);
    expect(migrated.simulation.settlements[settlement.id]?.name).toBe(
      'НЕ ПЕРЕСОЗДАВАТЬ'
    );
    expect(migrated.simulation.settlements[settlement.id]?.population).toBe(424_242);
    expect(migrated.simulation.settlements[settlement.id]?.stocks.medicine).toBe(3);
  });
});
