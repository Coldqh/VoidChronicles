import { describe, expect, it } from 'vitest';
import type { LocationState, Planet, PointOfInterest } from '../game/types';
import { generateSurface } from '../generation/surface';

const planet: Planet = {
  id: 'planet-memory', name: 'Memory', type: 'rocky', orbit: 1, moons: 0,
  habitability: 10, danger: 'extreme', hasLife: false, pointsOfInterest: 4,
  scanned: true, scanLevel: 2, imageKey: 'rocky'
};
const point: PointOfInterest = {
  id: 'poi-memory', systemId: 'system-memory', planetId: planet.id, name: 'Persistent Ruin',
  type: 'ruin', status: 'visited', danger: 'extreme', age: 1000, origin: 'test', publicSummary: 'test', truth: 'test',
  requiredEquipment: ['scanner'], possibleRewards: ['data'], scanConfidence: 70, visits: 1, discoveredYear: 0
};

describe('persistent expedition locations', () => {
  it('does not respawn defeated enemies or looted objects', () => {
    const baseline = generateSurface('MEMORY-SEED', planet, point);
    const killed = baseline.enemies.slice(0, 3).map((enemy) => ({ ...enemy, health: 0 }));
    const survivors = baseline.enemies.slice(3).map((enemy) => ({ ...enemy, health: Math.max(1, enemy.health - 10) }));
    const resolvedId = baseline.objects.find((object) => object.kind === 'terminal')?.id ?? baseline.objects[0]!.id;
    const state: LocationState = {
      pointOfInterestId: point.id, visitCount: 1, enemyStates: [...killed, ...survivors],
      resolvedObjectIds: [resolvedId], collectedEvidenceKeys: ['downloaded-data'], revealedTileKeys: ['10:10'],
      artifactTaken: true, lastOutcome: 'evacuated', lastVisitedYear: 2
    };
    const revisit = generateSurface('MEMORY-SEED', planet, point, state);
    expect(revisit.enemies.some((enemy) => killed.some((entry) => entry.id === enemy.id))).toBe(false);
    expect(baseline.enemies.length).toBeGreaterThanOrEqual(3);
    expect(revisit.enemies.length).toBe(survivors.length);
    expect(revisit.objects.find((object) => object.id === resolvedId)?.resolved).toBe(true);
    const artifactObject = revisit.objects.find((object) => object.kind === 'artifact');
    if (artifactObject) expect(artifactObject.resolved).toBe(true);
    expect(revisit.tiles.find((tile) => tile.x === 10 && tile.y === 10)?.revealed).toBe(true);
  });

  it('keeps living settlements non-hostile by default', () => {
    const settlement: PointOfInterest = {
      ...point,
      id: 'poi-friendly-settlement',
      type: 'settlement',
      danger: 'safe',
      civilizationId: 'civ-friendly'
    };
    const map = generateSurface('MEMORY-SEED', planet, settlement);
    expect(map.enemies).toHaveLength(0);
  });

  it('uses one stable map seed across repeat visits', () => {
    const first = generateSurface('MEMORY-SEED', planet, point);
    const second = generateSurface('MEMORY-SEED', planet, { ...point, visits: 99 });
    expect(first.tiles.map((tile) => tile.kind)).toEqual(second.tiles.map((tile) => tile.kind));
    expect(first.objects.map((object) => [object.id, object.x, object.y])).toEqual(second.objects.map((object) => [object.id, object.x, object.y]));
  });

  it('varies reward counts and positions between different locations', () => {
    const samples = Array.from({ length: 8 }, (_, index) => {
      const variedPoint = { ...point, id: `poi-varied-${index}`, possibleRewards: index % 2 ? ['data'] : ['data', 'artifact', 'sample'] };
      const map = generateSurface('VARIATION-SEED', planet, variedPoint);
      return {
        count: map.objects.length,
        signature: map.objects.map((object) => `${object.x}:${object.y}:${object.kind}`).join('|')
      };
    });
    expect(new Set(samples.map((sample) => sample.signature)).size).toBeGreaterThan(5);
    expect(new Set(samples.map((sample) => sample.count)).size).toBeGreaterThan(1);
  });

  it('creates a stable readable tutorial location with nearby data', () => {
    const tutorialPlanet = { ...planet, id: 'tutorial-planet', imageKey: 'tutorial-target' };
    const tutorialPoint = { ...point, id: 'tutorial-point', danger: 'caution' as const };
    const map = generateSurface('TUTORIAL-SEED', tutorialPlanet, tutorialPoint);
    expect(map.width).toBe(16);
    expect(map.height).toBe(11);
    expect(map.objects).toHaveLength(2);
    expect(map.objects.some((object) => Math.abs(object.x - map.player.x) + Math.abs(object.y - map.player.y) <= 5)).toBe(true);
  });
});
