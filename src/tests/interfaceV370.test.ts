import { describe, expect, it } from 'vitest';
import storeSource from '../game/store.ts?raw';
import typesSource from '../game/types.ts?raw';
import runtimeSource from '../operations/runtime.ts?raw';
import journeySource from '../journey/captainJourney.ts?raw';
import versionSource from '../version.ts?raw';

describe('v0.37.0 living consequences integration', () => {
  it('schedules a consequence when an operation is completed', () => {
    expect(storeSource).toContain('createOperationConsequence');
    expect(storeSource).toContain('pendingConsequences');
    expect(storeSource).toContain('projectLivingConsequenceScenes');
    expect(storeSource).toContain('worldEventDraftForConsequence');
  });

  it('persists optional chain metadata without a save migration', () => {
    expect(typesSource).toContain('OperationChainState');
    expect(typesSource).toContain('OperationConsequenceContext');
    expect(runtimeSource).toContain('chain: request.chain');
    expect(versionSource).toContain('SAVE_SCHEMA_VERSION = 13');
  });

  it('surfaces real consequences and linked operations on the captain journal', () => {
    expect(journeySource).toContain('pendingConsequences');
    expect(journeySource).toContain("scene.category === 'consequence'");
    expect(journeySource).toContain('activeOperation?.operation?.chain');
    expect(journeySource).toContain('operationChain.stage');
    expect(journeySource).toContain('operationChain.maxStages');
  });

  it('advances the release', () => {
    expect(versionSource).toContain("APP_VERSION = '0.37.0'");
    expect(versionSource).toContain("APP_CODENAME = 'LIVING_CONSEQUENCES'");
  });
});
