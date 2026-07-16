import { describe, expect, it } from 'vitest';
import type { CivilizationContact, Faction, Galaxy, Ship, WarFront } from '../game/types';
import type { SimulationState } from '../simulation/types';
import { advanceNavigationPlan, buildGalacticGeography, createNavigationState, planRoute, planRouteOptions, resolveRouteIncident, routeBetween } from '../navigation/geography';

const system = (id: string, x: number, y: number, neighbors: string[], region: 'core'|'frontier'|'deep'='frontier') => ({
  id, name:id, coordinates:{x,y}, starClass:'G' as const, starCount:1, planets:[], neighbors, danger:'safe' as const,
  civilizationIds:[], known:true, visited:true, scanned:true, anomaly:false, region
});
const galaxy: Galaxy = {
  id:'g', seed:'GEO', createdAt:'', currentYear:8,
  settings:{seed:'GEO',systemCount:5,historyYears:100000,civilizationCount:1,lifeFrequency:.4,anomalyFrequency:.1,difficulty:'standard'},
  systems:[
    system('a',0,0,['b','c'],'core'),
    system('b',100,0,['a','d']),
    system('c',0,100,['a','d','e']),
    system('d',100,100,['b','c','e']),
    system('e',180,100,['c','d'],'deep')
  ], civilizations:[], figures:[], history:[], artifacts:[], startSystemId:'a'
};
const simulation: SimulationState = {
  version:3, clock:{absoluteHour:0,epochYear:0}, systems:Object.fromEntries(galaxy.systems.map((entry)=>[entry.id,{systemId:entry.id,population:0,prosperity:50,security:50,supply:50,tradePressure:0,migrationPressure:0,lastUpdatedHour:0}])),
  civilizations:{}, factions:{}, ecosystems:{}, settlements:{}, populationGroups:{},
  tradeRoutes:{trade:{id:'trade',originSettlementId:'x',destinationSettlementId:'y',pathSystemIds:['a','b','d'],cargo:['parts'],capacity:80,traffic:70,danger:8,disrupted:false,lastUpdatedHour:0}},
  scheduledEvents:[], events:[], nextSequence:1,lastAdvanceReason:'test'
};
const ship = { id:'ship',name:'S',hull:100,maxHull:100,fuel:100,maxFuel:100,jumpRange:140,cargoCapacity:10,cargo:[],modules:[],statuses:[],systems:[],transponder:'T',registration:'R' } as Ship;

const build = (fronts: WarFront[] = []) => buildGalacticGeography({ galaxy, simulation, warFronts:fronts, factions:[] as Faction[], contacts:[] as CivilizationContact[] });

describe('galactic geography and routes',()=>{
  it('builds deterministic sectors and identifies live trade corridors',()=>{
    const first=build();
    const second=build();
    expect(first).toEqual(second);
    expect(first.sectors.length).toBeGreaterThan(1);
    expect(routeBetween(first,'a','b')?.kind).toBe('trade');
    expect(routeBetween(first,'a','b')?.fuelCost).toBeLessThan(routeBetween(first,'a','c')!.fuelCost);
  });

  it('creates different route priorities and avoids an active blockade',()=>{
    const front={id:'front',attackerFactionId:'x',defenderFactionId:'y',systemIds:['b'],intensity:96,startedYear:1,lastUpdateYear:1,status:'active' as const,attackerScore:0,defenderScore:0};
    const geography=build([front]);
    expect(routeBetween(geography,'a','b')?.access).toBe('blocked');
    const plan=planRoute({geography,fromSystemId:'a',toSystemId:'d',preference:'safe',jumpRange:ship.jumpRange,knownSystemIds:new Set(galaxy.systems.map((entry)=>entry.id)),crewSize:3,year:8});
    expect(plan?.systemIds).toEqual(['a','c','d']);
    expect(plan?.legs.every((leg)=>leg.access!=='blocked')).toBe(true);
  });

  it('returns route options with integer fuel, time and supply estimates',()=>{
    const options=planRouteOptions({geography:build(),fromSystemId:'a',toSystemId:'e',jumpRange:ship.jumpRange,knownSystemIds:new Set(galaxy.systems.map((entry)=>entry.id)),crewSize:4,year:8});
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(options.every((plan)=>[plan.totalFuel,plan.totalHours,plan.totalRisk,plan.foodCost,plan.oxygenCost].every(Number.isInteger))).toBe(true);
    expect(options.some((plan)=>plan.preference==='economical')).toBe(true);
  });

  it('advances and persists route history one leg at a time',()=>{
    const geography=build();
    const plan=planRoute({geography,fromSystemId:'a',toSystemId:'d',preference:'fast',jumpRange:ship.jumpRange,knownSystemIds:new Set(galaxy.systems.map((entry)=>entry.id)),crewSize:2,year:8})!;
    const firstLeg=plan.legs[0]!;
    const next=advanceNavigationPlan({navigation:{...createNavigationState(),activePlan:plan},fromSystemId:firstLeg.fromSystemId,arrivedSystemId:firstLeg.toSystemId,year:8,route:firstLeg});
    expect(next.history).toHaveLength(1);
    expect(next.activePlan?.currentLegIndex).toBe(1);
  });

  it('resolves travel incidents deterministically',()=>{
    const route={...routeBetween(build(),'a','c')!,kind:'ancient' as const,risk:80};
    const first=resolveRouteIncident({seed:'GEO',route,ship,serial:4});
    const second=resolveRouteIncident({seed:'GEO',route,ship,serial:4});
    expect(first).toEqual(second);
    expect(Number.isInteger(first.hullDamage)).toBe(true);
  });
});
