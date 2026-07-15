import { describe, expect, it } from 'vitest';
import type { Contract, Faction, Galaxy } from '../game/types';
import type { SimulationContext } from '../simulation/context';
import {
  buildChronicle,
  compareChroniclePeriods,
  traceCausalChain
} from '../simulation/chronicle';
import {
  applyPlayerWorldAction,
  reconcileWorldContractConsequences
} from '../simulation/playerConsequences';
import { projectContractsFromEvents, projectWorldThreads } from '../simulation/projections';
import type { SimulationState, WorldEvent } from '../simulation/types';
import {
  contractFromWorldNeed,
  sourceEventIdForContract,
  worldNeedsFromEvents
} from '../simulation/worldGameplay';

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

function fixture(): { simulation: SimulationState; context: SimulationContext; factions: Faction[] } {
  const galaxy = {
    id: 'galaxy_chronicle',
    seed: 'CHRONICLE-GAMEPLAY',
    createdAt: new Date(0).toISOString(),
    currentYear: 0,
    settings: { seed: 'CHRONICLE-GAMEPLAY', systemCount: 2, historyYears: 5_000, civilizationCount: 1, lifeFrequency: 1, anomalyFrequency: 0, difficulty: 'standard' },
    systems: [
      { id: 'sys_crisis', name: 'Кризис', coordinates: { x: 0, y: 0 }, starClass: 'G', starCount: 1, planets: [{ id: 'planet_crisis', name: 'Терра', type: 'jungle', orbit: 1, moons: 0, habitability: 80, danger: 'caution', hasLife: true, civilizationId: 'civ_test', pointsOfInterest: 1, scanned: true, imageKey: 'jungle' }], neighbors: ['sys_safe'], danger: 'caution', factionId: 'faction_test', civilizationIds: ['civ_test'], known: true, visited: true, scanned: true, anomaly: false, region: 'core' },
      { id: 'sys_safe', name: 'Убежище', coordinates: { x: 1, y: 0 }, starClass: 'K', starCount: 1, planets: [], neighbors: ['sys_crisis'], danger: 'safe', factionId: 'faction_test', civilizationIds: ['civ_test'], known: true, visited: true, scanned: true, anomaly: false, region: 'core' }
    ],
    civilizations: [{ id: 'civ_test', name: 'Союз', speciesName: 'Люди', status: 'living', techLevel: 7, ideology: 'федерализм', homeSystemId: 'sys_crisis', controlledSystems: ['sys_crisis', 'sys_safe'], foundedYear: -2_000, traits: [], era: 'interplanetary' }],
    figures: [],
    history: [{ id: 'history_foundation', year: -1000, title: 'Основание Союза', summary: 'Первые города объединились.', civilizationIds: ['civ_test'], systemIds: ['sys_crisis'], figureIds: [], consequences: ['возникло государство'] }],
    artifacts: [],
    startSystemId: 'sys_crisis'
  } as unknown as Galaxy;
  const factions: Faction[] = [{ id: 'faction_test', name: 'Совет', kind: 'government', civilizationId: 'civ_test', disposition: 'neutral', reputation: 0, wealth: 50, military: 50, research: 50, laws: [], allies: [], enemies: [], memories: [] }];
  const drought: WorldEvent = {
    id: 'event_drought', atHour: 2 * 365 * 24, kind: 'ecology', title: 'Засуха', summary: 'Биосфера потеряла воду.', severity: 7, visibility: 'public', systemIds: ['sys_crisis'], civilizationIds: ['civ_test'], factionIds: ['faction_test'], tags: ['simulation', 'ecology'], data: { resultedInEventIds: 'event_shortage', changedEntityIds: 'planet_crisis' }
  };
  const shortage: WorldEvent = {
    id: 'event_shortage', atHour: 3 * 365 * 24, kind: 'shortage', title: 'Голод в Кризисе', summary: 'Запасы пищи исчерпаны.', severity: 8, visibility: 'public', systemIds: ['sys_crisis'], civilizationIds: ['civ_test'], factionIds: ['faction_test'], tags: ['simulation', 'settlement', 'shortage'], data: { causedByEventIds: 'event_drought', settlementId: 'settlement_crisis', populationDelta: -500 }
  };
  const simulation: SimulationState = {
    version: 3,
    clock: { absoluteHour: 4 * 365 * 24, epochYear: 0 },
    systems: {
      sys_crisis: { systemId: 'sys_crisis', population: 100_000, prosperity: 25, security: 30, supply: 10, tradePressure: 80, migrationPressure: 75, lastUpdatedHour: 0 },
      sys_safe: { systemId: 'sys_safe', population: 50_000, prosperity: 75, security: 80, supply: 85, tradePressure: 15, migrationPressure: 10, lastUpdatedHour: 0 }
    },
    civilizations: { civ_test: { civilizationId: 'civ_test', population: 150_000, stability: 50, economy: 50, military: 50, research: 50, cohesion: 50, expansionPressure: 20, alive: true, lastUpdatedHour: 0 } },
    factions: { faction_test: { factionId: 'faction_test', wealth: 50, military: 50, research: 50, influence: 50, tension: 50, lastUpdatedHour: 0 } },
    ecosystems: { planet_crisis: { planetId: 'planet_crisis', climateStability: 40, biomass: 100, biodiversity: 35, resilience: 30, contamination: 75, carryingCapacity: 200_000, resources: { biomass: 40, medicinal: 30, organics: 35, rareCompounds: 20 }, biomes: [], species: [], pathogens: [], extinctSpeciesIds: [], invasiveSpeciesIds: [], cycle: 0, lastUpdatedHour: 0 } },
    settlements: {
      settlement_crisis: { id: 'settlement_crisis', name: 'Кризис-Сити', kind: 'city', systemId: 'sys_crisis', planetId: 'planet_crisis', civilizationId: 'civ_test', ownerFactionId: 'faction_test', population: 100_000, infrastructure: 45, security: 30, unrest: 70, housing: 35, health: 35, production: stock(2), consumption: stock(10), stocks: stock(5), foundedHour: 0, abandoned: false, lastUpdatedHour: 0 },
      settlement_safe: { id: 'settlement_safe', name: 'Убежище', kind: 'city', systemId: 'sys_safe', civilizationId: 'civ_test', ownerFactionId: 'faction_test', population: 50_000, infrastructure: 75, security: 80, unrest: 10, housing: 85, health: 80, production: stock(30), consumption: stock(5), stocks: stock(500), foundedHour: 0, abandoned: false, lastUpdatedHour: 0 }
    },
    populationGroups: {
      workers: { id: 'workers', settlementId: 'settlement_crisis', civilizationId: 'civ_test', species: 'Люди', culture: 'Союзная', socialClass: 'workers', profession: 'производство', population: 100_000, wealth: 30, health: 35, loyalty: 35, radicalization: 65, migrationDesire: 80 }
    },
    tradeRoutes: {
      route_main: { id: 'route_main', originSettlementId: 'settlement_safe', destinationSettlementId: 'settlement_crisis', pathSystemIds: ['sys_safe', 'sys_crisis'], cargo: ['food', 'medicine'], capacity: 100, traffic: 10, danger: 85, disrupted: true, lastUpdatedHour: 0 }
    },
    scheduledEvents: [], events: [shortage, drought], nextSequence: 10, lastAdvanceReason: 'test'
  };
  return { simulation, context: { seed: galaxy.seed, galaxy, factions, hubs: [] }, factions };
}

describe('chronicle, world-generated gameplay and player consequences', () => {
  it('merges deep history and live causal events into one chronicle', () => {
    const { simulation, context } = fixture();
    const records = buildChronicle(simulation, context);
    expect(records.some((entry) => entry.id === 'deep_history_foundation')).toBe(true);
    expect(records.some((entry) => entry.id === 'event_shortage')).toBe(true);
    expect(records.find((entry) => entry.id === 'event_shortage')?.causedByEventIds).toContain('event_drought');
  });

  it('traces causes and results in both directions', () => {
    const { simulation } = fixture();
    const chain = traceCausalChain(simulation, 'event_shortage', 'both');
    expect(chain.map((event) => event.id)).toContain('event_drought');
    expect(chain.map((event) => event.id)).toContain('event_shortage');
  });

  it('compares historical periods and counts severe crises', () => {
    const { simulation, context } = fixture();
    const comparison = compareChroniclePeriods(simulation, context, 0, 5);
    expect(comparison.events).toBeGreaterThan(1);
    expect(comparison.crises).toBeGreaterThan(0);
    expect(comparison.recordedPopulationDelta).toBe(-500);
  });

  it('turns a real shortage into a concrete relief contract', () => {
    const { simulation } = fixture();
    const need = worldNeedsFromEvents(simulation.events)[0];
    expect(need?.kind).toBe('relief');
    if (!need) return;
    const contract = contractFromWorldNeed(need, { issuerHubId: 'hub_safe', issuerFactionId: 'faction_test', year: 4 });
    expect(contract.type).toBe('delivery');
    expect(sourceEventIdForContract(contract)).toBe('event_shortage');
    expect(contract.cargoId).toBeDefined();
  });

  it('generates contracts only from world events and preserves old contracts', () => {
    const { simulation } = fixture();
    const existing: Contract = { id: 'old_contract', type: 'survey', status: 'active', issuerHubId: 'hub_safe', issuerFactionId: 'faction_test', title: 'Старый контракт', description: '', reward: 100, advance: 0, deadlineYear: 10, targetSystemId: 'sys_safe', progress: 0, requiredProgress: 1, illegal: false };
    const contracts = projectContractsFromEvents({ events: simulation.events, existing: [existing], hubs: [{ id: 'hub_safe', systemId: 'sys_safe', factionId: 'faction_test', safety: 'safe' }], year: 4 });
    expect(contracts.some((contract) => contract.id === 'contract_from_event_shortage')).toBe(true);
    expect(contracts.some((contract) => contract.id === 'old_contract')).toBe(true);
  });

  it('applies a completed world contract once and records the player in history', () => {
    const { simulation, factions } = fixture();
    const before = simulation.settlements.settlement_crisis!.stocks.food;
    const contract: Contract = { id: 'contract_from_event_shortage', type: 'delivery', status: 'completed', issuerHubId: 'hub_safe', issuerFactionId: 'faction_test', title: 'Помощь', description: '', reward: 1000, advance: 100, deadlineYear: 5, completedYear: 4, targetSystemId: 'sys_crisis', progress: 1, requiredProgress: 1, illegal: false };
    projectWorldThreads({ simulation, warFronts: [], factions, contracts: [contract], research: [] });
    const after = simulation.settlements.settlement_crisis!.stocks.food;
    expect(after).toBeGreaterThan(before);
    expect(simulation.events.some((event) => event.tags.includes('player-world-consequence') && event.data?.contractId === contract.id)).toBe(true);
    const eventCount = simulation.events.length;
    reconcileWorldContractConsequences(simulation, [contract], factions);
    expect(simulation.events.length).toBe(eventCount);
  });

  it('makes an ignored crisis materially worse', () => {
    const { simulation, factions } = fixture();
    const before = simulation.settlements.settlement_crisis!.unrest;
    const contract: Contract = { id: 'contract_from_event_shortage', type: 'delivery', status: 'expired', issuerHubId: 'hub_safe', issuerFactionId: 'faction_test', title: 'Помощь', description: '', reward: 1000, advance: 100, deadlineYear: 3, targetSystemId: 'sys_crisis', progress: 0, requiredProgress: 1, illegal: false };
    reconcileWorldContractConsequences(simulation, [contract], factions);
    expect(simulation.settlements.settlement_crisis!.unrest).toBeGreaterThan(before);
    expect(simulation.events[0]?.tags).toContain('contract-failure');
  });

  it('supports direct ecological and heritage interventions', () => {
    const { simulation, factions } = fixture();
    const contamination = simulation.ecosystems.planet_crisis!.contamination;
    applyPlayerWorldAction(simulation, { kind: 'restore-ecosystem', targetSystemId: 'sys_crisis', targetPlanetId: 'planet_crisis', magnitude: 4 }, factions);
    expect(simulation.ecosystems.planet_crisis!.contamination).toBeLessThan(contamination);
    simulation.events.unshift({ id: 'event_artifact', atHour: simulation.clock.absoluteHour, kind: 'discovery', title: 'Найден архив', summary: 'Обнаружена реликвия.', severity: 6, visibility: 'public', systemIds: ['sys_crisis'], civilizationIds: ['civ_test'], factionIds: ['faction_test'], tags: ['heritage', 'artifact'], data: { heritageArtifactId: 'artifact_test', heritageCivilizationId: 'civ_test' } });
    applyPlayerWorldAction(simulation, { kind: 'recover-heritage', sourceEventId: 'event_artifact', targetSystemId: 'sys_crisis', targetFactionId: 'faction_test', artifactId: 'artifact_test' }, factions);
    const snapshot = simulation.events.find((event) => event.tags.includes('living-artifact-state') && event.data?.heritageArtifactId === 'artifact_test');
    expect(snapshot).toBeDefined();
    expect(snapshot?.data?.heritageArtifactStatus).toBe('recovered');
  });
});
