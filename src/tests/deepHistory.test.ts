import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';

const settings = {
  seed: 'DEEP-HISTORY-GENERATOR',
  systemCount: 120,
  historyYears: 4_000_000,
  civilizationCount: 28,
  lifeFrequency: 0.42,
  anomalyFrequency: 0.03,
  difficulty: 'standard' as const,
  tutorialEnabled: false
};

describe('deep history generator', () => {
  it('is deterministic and creates historical layers from simulated development', async () => {
    const first = await generateGalaxy(settings);
    const second = await generateGalaxy(settings);

    expect(first.deepTime).toEqual(second.deepTime);
    expect(first.figures).toEqual(second.figures);
    expect(first.artifacts).toEqual(second.artifacts);
    expect(first.deepTime?.historicalSettlements?.length).toBeGreaterThan(first.civilizations.length);
    expect(first.deepTime?.discoveries?.length).toBeGreaterThan(0);
  });

  it('creates settlements, abandonment and real ruins with valid references', async () => {
    const galaxy = await generateGalaxy(settings);
    const settlements = galaxy.deepTime?.historicalSettlements ?? [];
    const ruins = galaxy.deepTime?.ruins ?? [];

    expect(settlements.length).toBeGreaterThan(0);
    expect(ruins.length).toBeGreaterThan(0);

    for (const ruin of ruins) {
      const settlement = settlements.find((entry) => entry.id === ruin.settlementId);
      expect(settlement).toBeDefined();
      expect(settlement?.endedYear).toBe(ruin.createdYear);
      expect(galaxy.systems.some((system) => system.id === ruin.systemId)).toBe(true);
    }
  });

  it('creates causal wars and migrations instead of free text records', async () => {
    const galaxy = await generateGalaxy(settings);
    const wars = galaxy.deepTime?.wars ?? [];
    const migrations = galaxy.deepTime?.migrations ?? [];
    const events = galaxy.deepTime?.events ?? [];

    expect(wars.length).toBeGreaterThan(0);
    expect(migrations.length).toBeGreaterThan(0);

    for (const war of wars) {
      expect(war.startYear).toBeLessThanOrEqual(war.endYear);
      expect(war.attackerPolityIds.length).toBeGreaterThan(0);
      expect(war.defenderPolityIds.length).toBeGreaterThan(0);
      expect(events.some((event) => event.kind === 'war' && event.id.includes(war.id.slice(-7)))).toBe(true);
    }
  });

  it('derives figures and artifacts from actual events', async () => {
    const galaxy = await generateGalaxy(settings);
    const events = galaxy.deepTime?.events ?? [];
    const figureIds = new Set(galaxy.figures.map((figure) => figure.id));

    expect(galaxy.figures.length).toBeGreaterThan(0);
    expect(galaxy.artifacts.length).toBeGreaterThan(0);

    for (const figure of galaxy.figures) {
      expect(figure.achievements.some((achievement) => achievement.includes('хроникой события'))).toBe(true);
    }

    for (const artifact of galaxy.artifacts) {
      expect(events.some((event) => event.artifactIds?.includes(artifact.id))).toBe(true);
      if (artifact.creatorId) expect(figureIds.has(artifact.creatorId)).toBe(true);
    }

    expect(galaxy.history).toHaveLength(events.length);
  });

  it('does not seed modern colonies for civilizations without space access', async () => {
    const galaxy = await generateGalaxy(settings);
    const primitive = galaxy.civilizations.filter(
      (civilization) => civilization.development?.spaceAccess === 'none'
    );

    expect(primitive.length).toBeGreaterThan(0);
    expect(primitive.every((civilization) => civilization.controlledSystems.length === 1)).toBe(true);
  });
});
