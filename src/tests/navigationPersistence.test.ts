import snapshotSource from '../persistence/snapshot.ts?raw';
import storeSource from '../game/store.ts?raw';
import typesSource from '../game/types.ts?raw';
import { describe, expect, it } from 'vitest';

describe('v0.34 navigation persistence', () => {
  it('stores navigation plans in the existing save schema', () => {
    expect(typesSource).toContain('navigation: NavigationState');
    expect(snapshotSource).toContain('navigationStateSchema.default(createNavigationState())');
    expect(snapshotSource).toContain('normalizeNavigationState(snapshot.navigation)');
    expect(storeSource).toContain('navigation: createNavigationState()');
    expect(storeSource).toContain('navigation: normalizeNavigationState(safe.navigation)');
    expect(storeSource).toContain('navigation,\n      tutorial');
  });

  it('persists route history after every completed jump', () => {
    expect(storeSource).toContain('advanceNavigationPlan');
    expect(storeSource).toContain('resolveRouteIncident');
    expect(storeSource).toContain("route.access === 'blocked'");
    expect(storeSource).toContain('knownSectorIds');
  });
});
