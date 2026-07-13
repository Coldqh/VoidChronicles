import { describe, expect, it } from 'vitest';
import { createShipSystems, createTravelEncounter, damageSystem, initializeWarFronts } from '../world/warfare';
import type { Faction, StarSystem } from '../game/types';

const systems: StarSystem[] = [
  { id:'s1', name:'A', coordinates:{x:0,y:0}, starClass:'G', starCount:1, planets:[], neighbors:['s2'], danger:'danger', factionId:'f1', civilizationIds:[], known:true, visited:true, scanned:true, anomaly:false, region:'frontier' },
  { id:'s2', name:'B', coordinates:{x:10,y:0}, starClass:'K', starCount:1, planets:[], neighbors:['s1'], danger:'caution', factionId:'f2', civilizationIds:[], known:true, visited:false, scanned:false, anomaly:false, region:'frontier' }
];
const factions: Faction[] = [
  { id:'f1', name:'One', kind:'government', disposition:'wary', reputation:0, wealth:50, military:70, research:40, laws:[], allies:[], enemies:['f2'], memories:[] },
  { id:'f2', name:'Two', kind:'pirates', disposition:'hostile', reputation:-40, wealth:30, military:60, research:20, laws:[], allies:[], enemies:['f1'], memories:[] }
];

describe('warfare systems', () => {
  it('creates persistent ship systems', () => {
    const ship = createShipSystems();
    expect(ship).toHaveLength(7);
    expect(ship.every((entry) => entry.integrity === 100)).toBe(true);
  });

  it('damages a targeted system without mutating the rest', () => {
    const before = createShipSystems();
    const after = damageSystem(before, 'engine', 35);
    expect(after.find((entry) => entry.id === 'engine')?.integrity).toBe(65);
    expect(after.find((entry) => entry.id === 'weapons')?.integrity).toBe(100);
  });

  it('generates deterministic war fronts', () => {
    expect(initializeWarFronts('WAR', factions, systems, 0)).toEqual(initializeWarFronts('WAR', factions, systems, 0));
  });

  it('creates a deterministic contact under a strong pursuit', () => {
    const args = { seed:'WAR', system:systems[0]!, factions, warFronts:initializeWarFronts('WAR', factions, systems, 0), year:4, serial:3,
      pursuits:[{ id:'p', sourceFactionId:'f1', sourceName:'One', reason:'test', intensity:100, knownIdentity:true, knownTransponder:true, knownShipProfile:true, lastKnownSystemId:'s1', createdYear:0, lastUpdateYear:0, status:'active' as const }] };
    const encounter = createTravelEncounter(args);
    expect(encounter).not.toBeNull();
    expect(encounter?.contact.kind).toBe('bountyHunter');
  });
});
