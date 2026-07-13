import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../generation/generateGalaxy';
import {
  culturalArtifactMultiplier,
  enrichGalaxyCivilizations,
  initializeCivilizationLayer
} from '../world/civilizations';
import { initializeLivingGalaxy } from '../world/livingGalaxy';

async function makeWorld(seed = 'CIV-TEST') {
  const galaxy = await generateGalaxy({
    seed,
    systemCount: 32,
    historyYears: 500_000,
    civilizationCount: 6,
    lifeFrequency: 0.4,
    anomalyFrequency: 0.04,
    difficulty: 'standard'
  });
  const living = initializeLivingGalaxy(galaxy);
  return initializeCivilizationLayer(galaxy, living.hubs);
}

describe('civilizations and lost worlds', () => {
  it('generates deterministic cultures, languages and states', async () => {
    const first = enrichGalaxyCivilizations((await makeWorld('CIV-DETERMINISM')).galaxy);
    const second = enrichGalaxyCivilizations((await makeWorld('CIV-DETERMINISM')).galaxy);
    expect(first.civilizations.map((entry) => entry.speciesProfile)).toEqual(second.civilizations.map((entry) => entry.speciesProfile));
    expect(first.civilizations.map((entry) => entry.languages)).toEqual(second.civilizations.map((entry) => entry.languages));
    expect(first.civilizations.every((entry) => (entry.cultures?.length ?? 0) > 0)).toBe(true);
    expect(first.civilizations.every((entry) => (entry.states?.length ?? 0) > 0)).toBe(true);
  });

  it('turns hubs into populated settlements with districts and persistent local NPCs', async () => {
    const world = await makeWorld('CIV-HUBS');
    expect(world.hubs.length).toBeGreaterThan(0);
    expect(world.hubs.every((hub) => (hub.districts?.length ?? 0) >= 3)).toBe(true);
    expect(world.hubs.every((hub) => (hub.npcIds?.length ?? 0) >= 3)).toBe(true);
    expect(world.localNpcs.length).toBe(world.hubs.reduce((sum, hub) => sum + (hub.npcIds?.length ?? 0), 0));
    expect(world.localNpcs.every((npc) => npc.alive && npc.present)).toBe(true);
  });

  it('creates contact records for living societies and archaeology chains for dead ones', async () => {
    const world = await makeWorld('CIV-CONTACTS');
    const livingCount = world.galaxy.civilizations.filter((entry) => entry.status !== 'dead').length;
    const deadCount = world.galaxy.civilizations.filter((entry) => entry.status === 'dead').length;
    expect(world.civilizationContacts).toHaveLength(livingCount);
    expect(world.archaeologyChains.length).toBeLessThanOrEqual(Math.min(12, deadCount));
    expect(world.archaeologyChains.every((chain) => chain.stages.length === 3)).toBe(true);
  });

  it('values heritage differently for markets, museums and heirs', () => {
    expect(culturalArtifactMultiplier('market', true)).toBeLessThan(culturalArtifactMultiplier('museum', true));
    expect(culturalArtifactMultiplier('museum', true)).toBeLessThan(culturalArtifactMultiplier('heirs', true));
    expect(culturalArtifactMultiplier('heirs', false)).toBeLessThan(culturalArtifactMultiplier('heirs', true));
  });
});
