import type { Civilization, GalaxySettings, StarSystem } from '../game/types';
import { civilizationName, speciesName } from '../generation/names';
import { createRng, stableHash } from '../generation/rng';

const ideologies = [
  'родовые советы',
  'ритуальная монархия',
  'распределённое согласие',
  'воинская каста',
  'олигархия учёных',
  'общины паломников',
  'торговый суверенитет',
  'демократия предков'
] as const;

const traits = [
  'xenophile',
  'secretive',
  'ritualistic',
  'expansionist',
  'archival',
  'nomadic',
  'biotechnological',
  'machine-integrated',
  'fractured',
  'merchant-led'
] as const;

function expansionCandidates(home: StarSystem, systems: StarSystem[], targetSize: number): string[] {
  const byId = new Map(systems.map((system) => [system.id, system]));
  const queue = [home.id];
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < targetSize) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);

    for (const neighbor of byId.get(id)?.neighbors ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return [...visited];
}

export function createCivilizationSeeds(
  settings: GalaxySettings,
  systems: StarSystem[]
): Civilization[] {
  const rng = createRng(`${settings.seed}:civilization-seeds`);
  const candidates = systems.filter((system) =>
    system.planets.some((planet) => planet.habitability > 30 && planet.type !== 'gas')
  );
  const homes = candidates.length > 0 ? candidates : systems;
  const usedHomes = new Set<string>();
  const result: Civilization[] = [];
  const corridorSize = Math.max(
    2,
    Math.min(14, Math.round(settings.systemCount / Math.max(2, settings.civilizationCount) * 0.38))
  );

  for (let index = 0; index < settings.civilizationCount; index += 1) {
    const species = speciesName(rng);
    const spacedIndex = Math.floor(index * homes.length / settings.civilizationCount);
    const jitter = rng.int(
      0,
      Math.max(0, Math.floor(homes.length / Math.max(2, settings.civilizationCount)))
    );
    let home = homes[(spacedIndex + jitter) % homes.length];

    if (!home || usedHomes.has(home.id)) {
      home = homes.find((entry) => !usedHomes.has(entry.id)) ?? home ?? systems[index % systems.length];
    }
    if (!home) continue;

    usedHomes.add(home.id);
    const id = `civ_${index.toString(36)}_${stableHash(`${settings.seed}:civ:${index}`)}`;
    const potential = expansionCandidates(home, systems, corridorSize);

    result.push({
      id,
      name: civilizationName(rng, species),
      speciesName: species,
      status: 'living',
      techLevel: 1,
      ideology: rng.pick(ideologies),
      homeSystemId: home.id,
      controlledSystems: [home.id],
      expansionCandidateSystemIds: potential,
      foundedYear: -settings.historyYears,
      traits: Array.from(new Set([rng.pick(traits), rng.pick(traits), rng.pick(traits)]))
    });
  }

  return result;
}
