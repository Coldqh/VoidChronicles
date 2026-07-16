import appSource from '../App.tsx?raw';
import snapshotTestSource from './snapshot.test.ts?raw';
import simulationPersistenceSource from './simulationPersistence.test.ts?raw';
import snapshotSource from '../persistence/snapshot.ts?raw';
import { describe, expect, it } from 'vitest';

describe('v0.34.1 compatibility hotfix', () => {
  it('restores the contact stage label import used by the system screen', () => {
    expect(appSource).toContain("import { contactStageLabel } from './world/civilizations';");
    expect(appSource).toContain("contactStageLabel(contact?.stage ?? 'unknown')");
  });

  it('keeps legacy snapshot fixtures compatible with required navigation state', () => {
    expect(snapshotTestSource).toContain('navigation: { history: [], knownSectorIds: [] }');
    expect(simulationPersistenceSource).toContain('navigation: { history: [], knownSectorIds: [] }');
    expect(snapshotSource).toContain('navigation: navigationStateSchema.default(createNavigationState())');
  });
});
