import { describe, expect, it } from 'vitest';
import type { Faction, Galaxy, Hub } from '../../game/types';
import { advanceSimulation, initializeSimulation } from '../kernel';

const galaxy = {
  id: 'g-settlements', seed: 'SETTLEMENT-TEST', createdAt: '', currentYear: 0,
  settings: { seed: 'SETTLEMENT-TEST', systemCount: 2, historyYears: 100000, civilizationCount: 1, lifeFrequency: 0.5, anomalyFrequency: 0.02, difficulty: 'standard' },
  systems: [
    { id: 's1', name: 'Alpha', coordinates: { x: 0, y: 0 }, starClass: 'G', starCount: 1, planets: [{ id: 'p1', name: 'Alpha I', type: 'ocean', orbit: 1, moons: 0, habitability: 80, danger: 'safe', hasLife: true, civilizationId: 'c1', pointsOfInterest: 1, scanned: false, imageKey: 'ocean' }], neighbors: ['s2'], danger: 'safe', factionId: 'f1', civilizationIds: ['c1'], known: false, visited: false, scanned: false, anomaly: false, region: 'core' },
    { id: 's2', name: 'Beta', coordinates: { x: 60, y: 0 }, starClass: 'K', starCount: 1, planets: [{ id: 'p2', name: 'Beta I', type: 'rocky', orbit: 1, moons: 1, habitability: 55, danger: 'caution', hasLife: true, civilizationId: 'c1', pointsOfInterest: 1, scanned: false, imageKey: 'rocky' }], neighbors: ['s1'], danger: 'caution', factionId: 'f1', civilizationIds: ['c1'], known: false, visited: false, scanned: false, anomaly: false, region: 'frontier' }
  ],
  civilizations: [{ id: 'c1', name: 'Concord', speciesName: 'Concordians', status: 'living', techLevel: 6, ideology: 'pragmatism', homeSystemId: 's1', controlledSystems: ['s1', 's2'], foundedYear: -1000, traits: [] }],
  figures: [], history: [], artifacts: [], startSystemId: 's1'
} satisfies Galaxy;

const factions: Faction[] = [{ id: 'f1', name: 'Concord Authority', kind: 'government', civilizationId: 'c1', disposition: 'friendly', reputation: 0, wealth: 70, military: 60, research: 65, laws: [], allies: [], enemies: [], memories: [] }];
const hubs: Hub[] = [{ id: 'h1', systemId: 's1', factionId: 'f1', civilizationId: 'c1', name: 'Alpha Port', kind: 'station', population: 120000, safety: 'safe', services: ['contracts', 'trade', 'repair', 'fuel', 'crew', 'news'], description: '', visited: false, docked: false, inspectionLevel: 50, marketSeed: 'alpha' }];
const context = { seed: galaxy.seed, galaxy, factions, hubs };

describe('civilization settlement simulation', () => {
  it('creates real settlements, population groups and trade routes', () => {
    const simulation = initializeSimulation(context);
    expect(Object.keys(simulation.settlements).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(simulation.populationGroups).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(simulation.tradeRoutes).length).toBeGreaterThanOrEqual(1);
    expect(simulation.scheduledEvents.some((event) => event.kind === 'settlement-cycle')).toBe(true);
    expect(simulation.scheduledEvents.some((event) => event.kind === 'trade-cycle')).toBe(true);
  });

  it('advances settlements independently from the player', () => {
    const initial = initializeSimulation(context);
    const result = advanceSimulation(initial, context, 365 * 24, 'settlement-test');
    expect(result.simulation.clock.absoluteHour).toBe(365 * 24);
    expect(Object.values(result.simulation.settlements).some((entry) => entry.lastUpdatedHour > 0)).toBe(true);
    expect(result.simulation.systems.s1?.population).toBeGreaterThan(0);
  });
});
