import { describe, expect, it } from 'vitest';
import type { Galaxy, Planet, StarSystem } from '../game/types';
import { generatePointsOfInterest, refreshLoreboundPoints } from '../exploration/pointsOfInterest';
import { linkedArtifactForPoint } from '../exploration/lore';
import { generateSurface } from '../generation/surface';
import {
  clearExpeditionCheckpoint,
  loadExpeditionCheckpoint,
  saveExpeditionCheckpoint,
  type KeyValueStorage
} from '../exploration/expeditionCheckpoint';

const planet: Planet = {
  id: 'planet_archive', name: 'Керис-II', type: 'rocky', orbit: 2, moons: 1, habitability: 34,
  danger: 'danger', hasLife: false, pointsOfInterest: 4, scanned: true, scanLevel: 2, imageKey: 'rocky-1'
};
const system: StarSystem = {
  id: 'system_keris', name: 'Керис', coordinates: { x: 0, y: 0 }, starClass: 'K', starCount: 1,
  planets: [planet], neighbors: [], danger: 'danger', civilizationIds: ['civ_archive'], known: true,
  visited: true, scanned: true, anomaly: false, region: 'frontier'
};
const galaxy: Galaxy = {
  id: 'gal_test', seed: 'LOREBOUND', createdAt: '2026-07-15T00:00:00.000Z', currentYear: 0,
  settings: { seed: 'LOREBOUND', systemCount: 20, historyYears: 100_000, civilizationCount: 2, lifeFrequency: .2, anomalyFrequency: .01, difficulty: 'standard' },
  systems: [system],
  civilizations: [{
    id: 'civ_archive', name: 'Республика Семи Рек', speciesName: 'арисы', status: 'dead', techLevel: 7,
    ideology: 'archival republic', homeSystemId: system.id, controlledSystems: [system.id], foundedYear: -20_000,
    endedYear: -1_800, traits: ['archival']
  }],
  figures: [{ id: 'figure_general', name: 'Тейр Асса', civilizationId: 'civ_archive', role: 'полководец', bornYear: -2_100, diedYear: -2_020, importance: 92, achievements: ['Оборона Кериса'] }],
  history: [],
  artifacts: [{
    id: 'artifact_oath', name: 'Клинок «Сломанная Клятва»', kind: 'военная реликвия', civilizationId: 'civ_archive',
    createdYear: -2_050, creatorId: 'figure_general', ownerHistory: ['Республика Семи Рек', 'гарнизон Кериса'],
    value: 18_000, danger: 4, truth: 'Клинок использовали при капитуляции гарнизона.', publicDescription: 'Реликвия Республики Семи Рек.', discovered: false
  }],
  deepTime: {
    version: 1, startYear: -100_000, endYear: 0,
    species: [], cultures: [], polities: [], civilizations: {}, transitions: [],
    historicalSettlements: [{
      id: 'settlement_keris', civilizationId: 'civ_archive', name: 'Керисский гарнизон', kind: 'fortress',
      systemId: system.id, planetId: planet.id, foundedYear: -4_000, endedYear: -2_000, status: 'ruined',
      populationPeak: 90_000, populationAtEnd: 0, cultureIds: [], foundingCause: 'защита торгового маршрута', endCause: 'капитуляция после осады'
    }],
    wars: [{
      id: 'war_keris', name: 'Война Красных Гор', startYear: -2_080, endYear: -2_000,
      attackerPolityIds: [], defenderPolityIds: [], civilizationIds: ['civ_archive'], systemIds: [system.id],
      cause: 'контроль торгового маршрута', outcome: 'гарнизон капитулировал', casualties: 120_000,
      settlementIds: ['settlement_keris'], endedPolityIds: []
    }],
    ruins: [{
      id: 'ruin_keris', settlementId: 'settlement_keris', civilizationId: 'civ_archive', systemId: system.id,
      planetId: planet.id, createdYear: -2_000, cause: 'осада и внутренний мятеж', integrity: 52,
      remains: ['архивный узел', 'казематы', 'останки гарнизона'], artifactIds: ['artifact_oath']
    }],
    events: [{
      id: 'event_keris_fall', year: -2_000, kind: 'war', title: 'Падение Керисского гарнизона',
      summary: 'Гарнизон капитулировал после внутреннего мятежа.', severity: 9, civilizationIds: ['civ_archive'],
      polityIds: [], systemIds: [system.id], settlementIds: ['settlement_keris'], figureIds: ['figure_general'],
      artifactIds: ['artifact_oath'], tags: ['war', 'collapse']
    }],
    statistics: { generatedCivilizations: 1, livingCivilizations: 0, extinctCivilizations: 1, hiddenCivilizations: 0, preSpaceCivilizations: 0, spacefaringCivilizations: 1, transitions: 0, regressions: 0, events: 1 }
  },
  startSystemId: system.id
};

describe('lorebound expeditions', () => {
  it('builds named locations from real history instead of numbered templates', () => {
    const points = generatePointsOfInterest(galaxy, system, planet);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => !/\s\d+$/.test(point.name))).toBe(true);
    const ruin = points.find((point) => point.ruinId === 'ruin_keris');
    expect(ruin?.name).toContain('Клинок «Сломанная Клятва»');
    expect(ruin?.sourceEventIds).toContain('event_keris_fall');
    expect(ruin?.objective?.kind).toBe('recover-artifact');
  });

  it('returns only the artifact explicitly linked to the location', () => {
    const point = generatePointsOfInterest(galaxy, system, planet).find((entry) => entry.ruinId === 'ruin_keris')!;
    const unrelated = { ...galaxy.artifacts[0]!, id: 'artifact_unrelated', name: 'Чужая реликвия' };
    expect(linkedArtifactForPoint(point, [unrelated, ...galaxy.artifacts])?.id).toBe('artifact_oath');
    expect(linkedArtifactForPoint({ ...point, artifactIds: [] }, [unrelated, ...galaxy.artifacts])).toBeUndefined();
  });

  it('places a real linked artifact and concrete mission objects on the field map', () => {
    const point = generatePointsOfInterest(galaxy, system, planet).find((entry) => entry.ruinId === 'ruin_keris')!;
    const surface = generateSurface(galaxy.seed, planet, point, undefined, 15, 15);
    const artifactObjects = surface.objects.filter((object) => object.kind === 'artifact');
    expect(artifactObjects).toHaveLength(1);
    expect(artifactObjects[0]?.artifactId).toBe('artifact_oath');
    expect(surface.objects.filter((object) => object.objective).length).toBeGreaterThanOrEqual(point.objective?.requiredObjects ?? 1);
    expect(surface.objectiveTitle).toContain('Клинок');
  });

  it('creates a natural expedition without inventing an ancient artifact', () => {
    const livingPlanet: Planet = { ...planet, id: 'planet_life', name: 'Лира', hasLife: true, pointsOfInterest: 2 };
    const livingSystem: StarSystem = { ...system, id: 'system_life', name: 'Лира', planets: [livingPlanet], civilizationIds: [] };
    const naturalGalaxy: Galaxy = { ...galaxy, systems: [livingSystem], deepTime: { ...galaxy.deepTime!, events: [], historicalSettlements: [], wars: [], ruins: [] } };
    const points = generatePointsOfInterest(naturalGalaxy, livingSystem, livingPlanet);
    expect(points.some((point) => point.type === 'biosphere')).toBe(true);
    expect(points.every((point) => (point.artifactIds ?? []).length === 0)).toBe(true);
    expect(points.every((point) => point.objective?.kind !== 'recover-artifact')).toBe(true);
  });

  it('upgrades untouched generic legacy sites without changing their IDs', () => {
    const oldPoint = {
      ...generatePointsOfInterest(galaxy, system, planet)[0]!,
      id: 'legacy_poi_1',
      name: 'Погребённый комплекс 1',
      sourceEventIds: undefined,
      artifactIds: undefined,
      objective: undefined,
      visits: 0,
      status: 'detected' as const
    };
    const [upgraded] = refreshLoreboundPoints(galaxy, system, planet, [oldPoint]);
    expect(upgraded?.id).toBe('legacy_poi_1');
    expect(upgraded?.name).not.toMatch(/\s\d+$/);
    expect(upgraded?.sourceEventIds).toContain('event_keris_fall');
    expect(upgraded?.artifactIds).toContain('artifact_oath');
    expect(upgraded?.objective?.title).toContain('Клинок');
  });

  it('preserves visited legacy locations exactly as the player remembers them', () => {
    const visited = {
      ...generatePointsOfInterest(galaxy, system, planet)[0]!,
      id: 'visited_poi',
      name: 'Старое название игрока',
      visits: 2,
      status: 'visited' as const
    };
    expect(refreshLoreboundPoints(galaxy, system, planet, [visited])[0]).toEqual(visited);
  });

  it('is deterministic for the same galaxy state', () => {
    expect(generatePointsOfInterest(galaxy, system, planet)).toEqual(generatePointsOfInterest(galaxy, system, planet));
  });
});

describe('offline expedition checkpoint', () => {
  it('round-trips and clears an unfinished field expedition', () => {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); }
    };
    const point = generatePointsOfInterest(galaxy, system, planet)[0]!;
    const map = generateSurface(galaxy.seed, planet, point, undefined, 13, 13);
    saveExpeditionCheckpoint(storage, {
      version: 1, seed: galaxy.seed, pointOfInterestId: point.id, phase: 'field', selected: ['scanner'],
      selectedCrewIds: ['crew_1'], map, playerHealth: 73, turns: 14, log: ['checkpoint'], collectedEvidence: [],
      hasArtifact: false, medkitUsed: true, savedAt: 1
    });
    expect(loadExpeditionCheckpoint(storage, galaxy.seed, point.id)?.playerHealth).toBe(73);
    clearExpeditionCheckpoint(storage, galaxy.seed, point.id);
    expect(loadExpeditionCheckpoint(storage, galaxy.seed, point.id)).toBeUndefined();
  });
});
