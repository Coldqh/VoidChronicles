import { describe, expect, it } from 'vitest';
import type { CrewMember, Ship } from '../game/types';
import { advanceShipLife, createShipLifeState, crewReadiness, normalizeShipLife, repairCompartment, resolveCrewIssue, resolvePersonalArc, restCrew } from '../ship/life';

const crew: CrewMember[] = [
  { id:'a', name:'Ада', species:'человек', culture:'корабельная', primaryRole:'engineer', level:2, health:100, maxHealth:100, morale:65, loyalty:70, salary:80, sharePercent:2, contractYears:3, joinedYear:0, paidUntilYear:1, traits:['упрямая'], belief:'корабль должен выжить', status:'active', injuries:[], memories:[], fatigue:60, stress:55 },
  { id:'b', name:'Бор', species:'человек', culture:'колониальная', primaryRole:'doctor', level:2, health:90, maxHealth:100, morale:60, loyalty:62, salary:75, sharePercent:2, contractYears:3, joinedYear:0, paidUntilYear:1, traits:['резкий'], belief:'жизнь важнее груза', status:'active', injuries:[], memories:[], fatigue:55, stress:50 }
];
const ship: Ship = { id:'ship', name:'Странник', hull:90, maxHull:100, fuel:80, maxFuel:100, jumpRange:230, cargoCapacity:10, cargo:[], modules:[], statuses:[], systems:[], transponder:'W', registration:'VC', life:createShipLifeState(0) };

describe('ship and crew life',()=>{
  it('normalizes old saves and assigns permanent ship spaces',()=>{
    const normalized=normalizeShipLife({...ship,life:undefined},crew,10);
    expect(normalized.ship.life?.compartments).toHaveLength(8);
    expect(normalized.crew.every((member)=>Number.isInteger(member.fatigue))).toBe(true);
    expect(normalized.crew.every((member)=>Boolean(member.shipCompartmentId))).toBe(true);
    expect(normalized.crew.every((member)=>member.relationships?.length===1)).toBe(true);
    expect(normalized.ship.life?.compartments.some((entry)=>entry.assignedCrewIds.length>0)).toBe(true);
  });
  it('advances supplies, fatigue and compartment wear deterministically',()=>{
    const first=advanceShipLife({ship,crew,hours:2400,seed:'LIFE',year:1,reason:'travel'});
    const second=advanceShipLife({ship,crew,hours:2400,seed:'LIFE',year:1,reason:'travel'});
    expect(first).toEqual(second);
    expect(first.ship.life!.supplies.food).toBeLessThan(100);
    expect(first.crew[0]!.fatigue).toBeGreaterThanOrEqual(60);
    expect(first.ship.life!.compartments.some((entry)=>entry.condition<100)).toBe(true);
    const withArtifact=advanceShipLife({ship:{...ship,cargo:[{id:'artifact',name:'Клинок',kind:'artifact',quantity:1,value:100,artifactId:'a1'}]},crew,hours:24,seed:'TROPHY',year:1,reason:'return'});
    expect(withArtifact.ship.life!.trophies[0]?.name).toBe('Клинок');
  });
  it('rest, repair and conflict resolution change persistent state',()=>{
    const rested=restCrew(ship,crew,2);
    expect(rested.crew[0]!.fatigue).toBeLessThan(60);
    const damaged=structuredClone(rested.ship);
    damaged.life!.compartments[0]!.condition=40;
    const repaired=repairCompartment(damaged,rested.crew,'bridge',2);
    expect(repaired.ship.life!.compartments[0]!.condition).toBeGreaterThan(40);
    const issue={id:'issue',kind:'conflict' as const,title:'Спор',summary:'Тест',crewIds:['a','b'],severity:60,createdYear:2,status:'open' as const};
    repaired.ship.life!.issues=[issue];
    const resolved=resolveCrewIssue({ship:repaired.ship,crew:repaired.crew,issueId:'issue',choice:'mediate',year:2});
    expect(resolved.ship.life!.issues[0]!.status).toBe('resolved');
    expect(crewReadiness(resolved.crew[0]!)).toBeGreaterThan(0);
  });
  it('turns a dormant personal thread into a consequential choice',()=>{
    const normalized=normalizeShipLife(ship,crew,3);
    const listened=resolvePersonalArc({crew:normalized.crew,crewId:'a',choice:'listen',year:3});
    expect(listened.crew[0]!.personalArc?.status).toBe('active');
    const helped=resolvePersonalArc({crew:listened.crew,crewId:'a',choice:'help',year:3});
    expect(helped.creditsCost).toBe(120);
    expect(helped.crew[0]!.personalArc?.status).toBe('resolved');
    expect(helped.crew[0]!.loyalty).toBeGreaterThan(70);
  });

});
