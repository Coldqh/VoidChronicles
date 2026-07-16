import { describe, expect, it } from 'vitest';
import type { Captain, Civilization, CivilizationContact, Faction, PlayerObjective, WorldThread } from '../game/types';
import { applyCaptainCareer, createOperationObjective, projectOperationRequests, resolveOperationStep } from '../operations/runtime';

const civilization = { id: 'civ_a', name: 'Союз А', speciesName: 'А', status: 'living', techLevel: 7, ideology: 'совет', homeSystemId: 'sys_a', controlledSystems: ['sys_a'], foundedYear: -1000, traits: [] } as Civilization;
const contact = { civilizationId: 'civ_a', stage: 'contacted', languageLevel: 4, trust: 30, attempts: 3, notes: [] } as CivilizationContact;
const faction = { id: 'fac_a', name: 'Совет А', kind: 'government', civilizationId: 'civ_a', disposition: 'neutral', reputation: 0, wealth: 50, military: 50, research: 50, laws: [], allies: [], enemies: [], memories: [] } as Faction;
const thread = { id: 'thread_a', category: 'ecology', status: 'escalating', title: 'Заражение океана', summary: 'Очаг расширяется.', urgency: 82, progress: 20, systemIds: ['sys_a'], civilizationIds: ['civ_a'], factionIds: ['fac_a'], relatedArtifactIds: [], playerInvolved: false, updates: [] } as WorldThread;
const captain = { id: 'captain', name: 'Вейл', level: 1, xp: 0, health: 100, maxHealth: 100, credits: 1000, reputation: 0, skills: { research: 4, archaeology: 2, trade: 2, combat: 1, crime: 0 }, injuries: [], alive: true, condition: 'active', commandIdentity: 'organic' } as Captain;

describe('player operations', () => {
  it('creates incoming requests only from reachable world crises', () => {
    const scenes = projectOperationRequests({ threads: [thread], contacts: [contact], civilizations: [civilization], factions: [faction], existingScenes: [], year: 12 });
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.operationRequest?.category).toBe('containment');
    expect(scenes[0]?.choices.some((choice) => choice.id === 'accept-operation')).toBe(true);
  });

  it('stores a multi-stage operation in the existing objective payload', () => {
    const scene = projectOperationRequests({ threads: [thread], contacts: [contact], civilizations: [civilization], factions: [faction], existingScenes: [], year: 12 })[0]!;
    const objective = createOperationObjective(scene.operationRequest!, 12);
    expect(objective.operation?.stages).toHaveLength(4);
    expect(objective.operation?.stages[0]?.status).toBe('active');
    const first = resolveOperationStep({ objective, approach: 'direct', seed: 'TEST', currentSystemId: 'sys_a', currentSystemScanned: true, captain, crew: [], contactTrust: 30, absoluteHour: 100 });
    expect(first.ok).toBe(true);
    expect(first.objective.operation?.currentStageIndex).toBe(1);
  });

  it('builds a captain identity from completed work', () => {
    const next = applyCaptainCareer(captain, 'scientist', 50, true);
    expect(next.career?.primary).toBe('scientist');
    expect(next.career?.titles.length).toBeGreaterThan(0);
    expect(next.level).toBeGreaterThanOrEqual(1);
  });
});
