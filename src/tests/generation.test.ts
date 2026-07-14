import { describe, expect, it } from 'vitest';
import { generateGalaxy, normalizeGalaxySettings } from '../generation/generateGalaxy';
import type { GalaxySettings } from '../game/types';

const settings: GalaxySettings = {
  seed: 'TEST-SEED',
  systemCount: 60,
  historyYears: 2_000_000,
  civilizationCount: 8,
  lifeFrequency: 0.35,
  anomalyFrequency: 0.04,
  difficulty: 'standard'
};

describe('galaxy generation', () => {
  it('is deterministic for the same seed', async () => {
    const first = await generateGalaxy(settings);
    const second = await generateGalaxy(settings);
    expect(first.systems.map((system) => [system.id, system.name, system.coordinates])).toEqual(
      second.systems.map((system) => [system.id, system.name, system.coordinates])
    );
    expect(first.history).toEqual(second.history);
  });

  it('produces connected route graph and causal records', async () => {
    const galaxy = await generateGalaxy(settings);
    expect(galaxy.systems).toHaveLength(60);
    expect(new Set(galaxy.systems.map((system) => system.id)).size).toBe(60);
    const seen = new Set<string>();
    const queue = [galaxy.systems[0]!.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const system = galaxy.systems.find((entry) => entry.id === id)!;
      queue.push(...system.neighbors.filter((neighbor) => !seen.has(neighbor)));
    }
    expect(seen.size).toBe(60);
    expect(galaxy.artifacts.every((artifact) => galaxy.civilizations.some((civilization) => civilization.id === artifact.civilizationId))).toBe(true);
    expect(galaxy.history.every((event) => event.civilizationIds.every((id) => galaxy.civilizations.some((civilization) => civilization.id === id)))).toBe(true);
  });

  it('preserves large requested galaxy sizes exactly', async () => {
    const galaxy = await generateGalaxy({ ...settings, seed: 'LARGE-GALAXY', systemCount: 300, civilizationCount: 24 });
    expect(galaxy.systems).toHaveLength(300);
    expect(galaxy.settings.systemCount).toBe(300);
  });

  it('normalizes invalid numeric form values before generation', () => {
    const normalized = normalizeGalaxySettings({ ...settings, systemCount: Number.NaN, civilizationCount: 999 });
    expect(normalized.systemCount).toBe(300);
    expect(normalized.civilizationCount).toBe(80);
  });

});
