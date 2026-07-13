import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import { initializeLivingGalaxy } from '../world/livingGalaxy';
import { initializeCivilizationLayer } from '../world/civilizations';
import { generateTravelScene, initializeNarrative, processDueConsequences } from '../narrative/encounters';

describe('encounters and consequences', () => {
  it('creates a first playable scene and optional tutorial objective', async () => {
    const galaxy = await generateGalaxy({
      seed: 'NARRATIVE-START', systemCount: 24, historyYears: 100_000,
      civilizationCount: 4, lifeFrequency: .3, anomalyFrequency: .04,
      difficulty: 'standard', tutorialEnabled: true
    });
    const living = initializeLivingGalaxy(galaxy);
    const layer = initializeCivilizationLayer(galaxy, living.hubs);
    const narrative = initializeNarrative(layer.galaxy, layer.hubs, living.factions, true);
    expect(narrative.storyScenes).toHaveLength(1);
    expect(narrative.storyScenes[0]?.choices.length).toBeGreaterThanOrEqual(3);
    expect(narrative.tutorial.active).toBe(true);
    expect(narrative.objectives.some((objective) => objective.kind === 'tutorial')).toBe(true);
  });

  it('keeps tutorial disabled when the player unticks it', async () => {
    const galaxy = await generateGalaxy({
      seed: 'NARRATIVE-SKIP', systemCount: 20, historyYears: 100_000,
      civilizationCount: 3, lifeFrequency: .3, anomalyFrequency: .03,
      difficulty: 'standard', tutorialEnabled: false
    });
    const living = initializeLivingGalaxy(galaxy);
    const layer = initializeCivilizationLayer(galaxy, living.hubs);
    const narrative = initializeNarrative(layer.galaxy, layer.hubs, living.factions, false);
    expect(narrative.tutorial.completed).toBe(true);
    expect(narrative.objectives).toEqual([]);
  });

  it('resolves consequences only when their year arrives', () => {
    const state = [{
      id: 'c1', status: 'pending' as const, createdYear: 1, triggerYear: 4,
      title: 'Later', text: 'Result', tone: 'warning' as const
    }];
    expect(processDueConsequences(state, 3).due).toHaveLength(0);
    const resolved = processDueConsequences(state, 4);
    expect(resolved.due).toHaveLength(1);
    expect(resolved.consequences[0]?.status).toBe('resolved');
  });

  it('generates deterministic travel scenes for the same route and year', () => {
    const first = generateTravelScene('SEED', 'a', 'b', 'Beta', 12, [], []);
    const second = generateTravelScene('SEED', 'a', 'b', 'Beta', 12, [], []);
    expect(second).toEqual(first);
  });
});
