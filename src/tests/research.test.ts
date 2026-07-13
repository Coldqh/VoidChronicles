import { describe, expect, it } from 'vitest';
import { createResearchProject, blueprintFromProject, domainForArtifact, researchPower } from '../research/technology';
import type { Artifact, CrewMember } from '../game/types';

const artifact: Artifact = {
  id: 'artifact_drive', name: 'Гравитационный узел', kind: 'ancient drive', civilizationId: 'civ_1',
  createdYear: -1200, ownerHistory: [], value: 4200, danger: 8, truth: 'Устройство складывает локальное пространство.',
  publicDescription: 'Неизвестный двигатель с искажённым полем.', discovered: true
};

describe('relic research progression', () => {
  it('derives a technology domain and creates a risky project', () => {
    expect(domainForArtifact(artifact)).toBe('propulsion');
    const project = createResearchProject(artifact, 4);
    expect(project.domain).toBe('propulsion');
    expect(project.requiredProgress).toBeGreaterThan(100);
    expect(project.risk).toBe(8);
  });

  it('specialists meaningfully increase research power', () => {
    const scientist = { id: 'crew_1', primaryRole: 'scientist', level: 3 } as CrewMember;
    expect(researchPower([scientist])).toBeGreaterThan(researchPower([]));
  });

  it('turns a completed project into a usable blueprint with a drawback', () => {
    const project = { ...createResearchProject(artifact, 4), status: 'completed' as const, progress: 999 };
    const blueprint = blueprintFromProject(project, artifact, 8);
    expect(blueprint.domain).toBe('propulsion');
    expect(blueprint.benefit.length).toBeGreaterThan(5);
    expect(blueprint.drawback.length).toBeGreaterThan(5);
    expect(blueprint.installCost).toBeGreaterThan(0);
  });
});
