import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import storeSource from '../game/store.ts?raw';
import snapshotSource from '../persistence/snapshot.ts?raw';
import operationsSource from '../operations/runtime.ts?raw';
import crewSource from '../screens/CrewScreen.tsx?raw';
import shipSource from '../screens/ShipScreen.tsx?raw';
import lifeSource from '../ship/life.ts?raw';

describe('v0.32.3 and v0.33 interface',()=>{
  it('removes legacy embedded workspaces and routes dedicated screens',()=>{
    expect(appSource).not.toContain('function CivilizationsScreen()');
    expect(appSource).not.toContain('function CrewScreen()');
    expect(appSource).not.toContain('function ShipScreen()');
    expect(appSource).toContain('CrewScreenV33');
    expect(appSource).toContain('ShipScreenV33');
    expect(appSource).toContain("<ContactsScreen chrome={<AppChrome/>}/>");
  });
  it('uses dedicated ship and crew workspaces',()=>{
    expect(crewSource).toContain('Усталость');
    expect(crewSource).toContain('Отношения на борту');
    expect(crewSource).toContain('handleCrewStory');
    expect(crewSource).toContain('assignCrewCompartment');
    expect(shipSource).toContain('ВНУТРЕННЯЯ СХЕМА');
    expect(shipSource).toContain('Запчасти');
    expect(shipSource).toContain('resupplyShip');
  });
  it('persists and advances ship life through world time and operations',()=>{
    expect(storeSource).toContain('advanceShipLife');
    expect(storeSource).toContain('async resolveCrewIssue');
    expect(storeSource).toContain('async repairCompartment');
    expect(storeSource).toContain('storyScenes,');
    expect(snapshotSource).toContain('shipLifeSchema.default(createShipLifeState(0))');
    expect(operationsSource).toContain('crewReadiness');
  });
  it('contains persistent consequences instead of decorative cards',()=>{
    expect(lifeSource).toContain('advanceShipLife');
    expect(lifeSource).toContain('resolveCrewIssue');
    expect(lifeSource).toContain('repairCompartment');
    expect(lifeSource).toContain('cargoTrophies');
  });
});
