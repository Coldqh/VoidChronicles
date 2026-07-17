import { describe, expect, it } from 'vitest';
import type { Faction, Hub, LocalNpc, PlayerObjective } from '../game/types';
import {
  createOperationConsequence,
  projectLivingConsequenceScenes,
  worldEventDraftForConsequence
} from '../narrative/livingConsequences';

function objective(stage = 1, maxStages = 3): PlayerObjective {
  return {
    id: `objective_test_${stage}`,
    title: 'Доставка медикаментов',
    description: 'Передать груз в кризисную систему.',
    kind: 'story',
    status: 'completed',
    createdYear: 1,
    systemId: 'system_a',
    progress: 100,
    operation: {
      requestId: `request_test_${stage}`,
      threadId: 'thread_shortage',
      category: 'relief',
      issuerName: 'Администрация Меридиана',
      issuerFactionId: 'faction_a',
      reward: 900,
      targetSystemId: 'system_a',
      stages: [],
      currentStageIndex: 3,
      quality: 74,
      attempts: 4,
      outcome: 'successful',
      completedYear: 2,
      log: [],
      chain: stage > 1 ? {
        id: 'chain_test',
        stage,
        maxStages,
        originObjectiveId: 'objective_test_1',
        previousOutcome: 'successful'
      } : undefined
    }
  };
}

const faction: Faction = {
  id: 'faction_a',
  name: 'Администрация Меридиана',
  kind: 'government',
  disposition: 'neutral',
  reputation: 0,
  wealth: 50,
  military: 50,
  research: 50,
  laws: [],
  allies: [],
  enemies: [],
  memories: []
};

const hub: Hub = {
  id: 'hub_a',
  systemId: 'system_a',
  factionId: 'faction_a',
  name: 'Меридиан',
  kind: 'station',
  population: 1000,
  safety: 'safe',
  services: ['contracts'],
  description: '',
  visited: true,
  docked: false,
  inspectionLevel: 1,
  marketSeed: 'market'
};

const npc: LocalNpc = {
  id: 'npc_a',
  hubId: 'hub_a',
  name: 'Рин Тал',
  species: 'человек',
  culture: 'станционная',
  role: 'administrator',
  disposition: 'neutral',
  trust: 0,
  alive: true,
  present: true,
  agenda: 'удержать снабжение',
  fear: 'беспорядки',
  memories: []
};

describe('living operation consequences', () => {
  it('creates a deterministic delayed consequence without changing save schema', () => {
    const first = createOperationConsequence({ objective: objective(), year: 2, seed: 'VOID' });
    const second = createOperationConsequence({ objective: objective(), year: 2, seed: 'VOID' });
    expect(first).toEqual(second);
    expect(first?.operation?.chain.stage).toBe(1);
    expect(first?.operation?.chain.maxStages).toBeGreaterThanOrEqual(2);
    expect(first?.operation?.chain.maxStages).toBeLessThanOrEqual(4);
    expect(first?.triggerYear).toBeGreaterThan(2);
  });

  it('turns a due consequence into a returning message and the next linked operation', () => {
    const consequence = createOperationConsequence({ objective: objective(), year: 2, seed: 'VOID' });
    expect(consequence).not.toBeNull();
    const projection = projectLivingConsequenceScenes({
      due: [{ ...consequence!, status: 'resolved' }],
      existingScenes: [],
      factions: [faction],
      hubs: [hub],
      localNpcs: [npc],
      year: consequence!.triggerYear
    });
    const scene = projection.storyScenes[0];
    expect(scene.category).toBe('consequence');
    expect(scene.npcIds).toEqual(['npc_a']);
    expect(scene.operationRequest?.chain?.stage).toBe(2);
    expect(scene.operationRequest?.chain?.maxStages).toBe(consequence?.operation?.chain.maxStages);
    expect(projection.factions[0]?.memories[0]?.action).toContain('operation-chain');
    expect(projection.localNpcs[0]?.memories[0]?.text).toBe(consequence?.text);
  });

  it('closes the chain after its final operation instead of creating an endless request', () => {
    const consequence = createOperationConsequence({ objective: objective(3, 3), year: 8, seed: 'VOID' });
    const projection = projectLivingConsequenceScenes({
      due: [{ ...consequence!, status: 'resolved' }],
      existingScenes: [],
      factions: [faction],
      hubs: [hub],
      localNpcs: [npc],
      year: consequence!.triggerYear
    });
    expect(projection.storyScenes[0]?.operationRequest).toBeUndefined();
    expect(projection.storyScenes[0]?.choices[0]?.id).toBe('acknowledge-consequence');
  });

  it('projects the response into the world event stream', () => {
    const consequence = createOperationConsequence({ objective: objective(), year: 2, seed: 'VOID' });
    const event = worldEventDraftForConsequence(consequence!);
    expect(event?.tags).toContain('living-consequence');
    expect(event?.data.chainStage).toBe(1);
    expect(event?.systemIds).toEqual(['system_a']);
  });
});
