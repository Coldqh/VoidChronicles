import { describe, expect, it } from 'vitest';
import { initializeWorldThreads, syncWorldThreads } from '../world/storyThreads';
import type { ArchaeologyChain, Civilization, Faction, ResearchProject } from '../game/types';

const civ = { id: 'civ', name: 'Наследники Эха', speciesName: 'Эхо', status: 'dead', techLevel: 7, ideology: 'archive', homeSystemId: 'sys', controlledSystems: [], foundedYear: -1000, traits: [] } as Civilization;
const faction = { id: 'fac', name: 'Институт Следа', kind: 'university', disposition: 'neutral', reputation: 0, wealth: 50, military: 10, research: 80, laws: [], allies: [], enemies: ['enemy'], memories: [] } as Faction;
const enemy = { ...faction, id: 'enemy', name: 'Консорциум Тишины', enemies: ['fac'] } as Faction;
const chain = { id: 'chain', civilizationId: 'civ', title: 'Путь исчезнувших', summary: 'Три связанных объекта.', status: 'active', createdYear: 0, stages: [{ id: 'stage', title: 'Первый след', summary: 'Найти архив.', status: 'active', targetSystemId: 'sys' }] } as ArchaeologyChain;

describe('living world threads', () => {
  it('turns archaeology and faction conflict into ongoing world processes', () => {
    const threads = initializeWorldThreads([civ], [faction, enemy], [chain], 0);
    expect(threads.some((entry) => entry.category === 'discovery')).toBe(true);
    expect(threads.some((entry) => entry.category === 'conflict')).toBe(true);
  });

  it('adds active research as a player-involved thread', () => {
    const project = { id: 'research_a', artifactId: 'a', title: 'Исследование А', domain: 'anomaly', status: 'active', progress: 30, requiredProgress: 100, risk: 8, assignedCrewIds: [], startedYear: 0, updatedYear: 0, log: [] } as ResearchProject;
    const threads = syncWorldThreads([], [], [], [project], 1);
    expect(threads[0]?.category).toBe('research');
    expect(threads[0]?.playerInvolved).toBe(true);
    expect(threads[0]?.progress).toBe(30);
  });
});
