import { z } from 'zod';
import type {
  Artifact,
  Civilization,
  Galaxy,
  GalaxySettings,
  HistoricalEvent,
  HistoricalFigure,
  Planet,
  PlanetType,
  StarClass,
  StarSystem
} from '../game/types';
import { civilizationName, figureName, planetName, speciesName, starName } from './names';
import { createRng, stableHash } from './rng';

const settingsSchema = z.object({
  seed: z.string().min(1),
  systemCount: z.number().int().min(20).max(1500),
  historyYears: z.number().int().min(10_000).max(20_000_000),
  civilizationCount: z.number().int().min(2).max(80),
  lifeFrequency: z.number().min(0).max(1),
  anomalyFrequency: z.number().min(0).max(1),
  difficulty: z.enum(['explorer', 'standard', 'brutal']),
  tutorialEnabled: z.boolean().optional()
});


export function normalizeGalaxySettings(raw: GalaxySettings): GalaxySettings {
  const number = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  const systemCount = Math.max(20, Math.min(1500, Math.round(number(raw.systemCount, 300))));
  const civilizationCount = Math.max(2, Math.min(80, Math.round(number(raw.civilizationCount, 12))));
  return {
    ...raw,
    seed: raw.seed?.trim() || 'VOID',
    systemCount,
    historyYears: Math.max(10_000, Math.min(20_000_000, Math.round(number(raw.historyYears, 2_000_000)))),
    civilizationCount,
    lifeFrequency: Math.max(0, Math.min(1, number(raw.lifeFrequency, .34))),
    anomalyFrequency: Math.max(0, Math.min(1, number(raw.anomalyFrequency, .035))),
    difficulty: ['explorer', 'standard', 'brutal'].includes(raw.difficulty) ? raw.difficulty : 'standard',
    tutorialEnabled: raw.tutorialEnabled !== false
  };
}

export interface GenerationProgress {
  stage: string;
  progress: number;
  message: string;
}

const starClasses: readonly StarClass[] = ['M', 'M', 'M', 'K', 'K', 'G', 'F', 'A', 'B', 'WHITE_DWARF', 'NEUTRON', 'BLACK_HOLE'];
const planetTypes: readonly PlanetType[] = ['rocky', 'rocky', 'desert', 'ice', 'gas', 'gas', 'ocean', 'toxic', 'jungle', 'artificial', 'anomalous'];
const ideologies = ['mercantile councils', 'ritual monarchy', 'distributed consensus', 'military caste', 'scholarly oligarchy', 'pilgrim communes', 'corporate sovereignty', 'ancestral democracy'];
const civTraits = ['xenophile', 'secretive', 'ritualistic', 'expansionist', 'archival', 'nomadic', 'biotechnological', 'machine-integrated', 'fractured', 'merchant-led'];
const roles = ['navigator', 'prophet', 'warlord', 'scientist', 'artist', 'smuggler', 'archaeologist', 'revolutionary', 'engineer', 'explorer'];
const eventTypes = ['war', 'migration', 'plague', 'schism', 'discovery', 'revolution', 'collapse', 'colonization', 'treaty', 'catastrophe'];
const artifactKinds = ['weapon', 'navigation core', 'drug', 'ritual mask', 'book', 'organ', 'ship fragment', 'instrument', 'digital personality', 'domestic tool'];

function dangerByRegion(region: StarSystem['region'], roll: number): StarSystem['danger'] {
  if (region === 'core') return roll > 0.92 ? 'danger' : roll > 0.7 ? 'caution' : 'safe';
  if (region === 'frontier') return roll > 0.78 ? 'danger' : roll > 0.42 ? 'caution' : 'safe';
  return roll > 0.84 ? 'extreme' : roll > 0.52 ? 'danger' : 'caution';
}

function createPlanet(system: StarSystem, index: number, settings: GalaxySettings): Planet {
  const rng = createRng(`${settings.seed}:planet:${system.id}:${index}`);
  const rawType = rng.pick(planetTypes);
  const type: PlanetType = rawType === 'anomalous' && !rng.chance(settings.anomalyFrequency * 2) ? 'rocky' : rawType;
  const habitabilityBase: Record<PlanetType, number> = {
    rocky: 36, ocean: 78, desert: 42, ice: 24, gas: 0, toxic: 8, jungle: 82, artificial: 55, anomalous: 30
  };
  const habitability = Math.max(0, Math.min(100, habitabilityBase[type] + rng.int(-24, 18)));
  const hasLife = type !== 'gas' && rng.chance(settings.lifeFrequency * (habitability / 100 + 0.12));
  const dangerRoll = rng.next();
  return {
    id: `${system.id}_p${index + 1}`,
    name: planetName(rng, system.name, index),
    type,
    orbit: index + 1,
    moons: type === 'gas' ? rng.int(4, 18) : rng.int(0, 4),
    habitability,
    danger: dangerRoll > 0.9 ? 'extreme' : dangerRoll > 0.64 ? 'danger' : dangerRoll > 0.34 ? 'caution' : 'safe',
    hasLife,
    pointsOfInterest: rng.int(1, hasLife ? 8 : 5),
    scanned: false,
    scanLevel: 0,
    imageKey: `${type}-${rng.int(1, 6)}`
  };
}

function connectSystems(systems: StarSystem[]): void {
  const distance = (a: StarSystem, b: StarSystem) => Math.hypot(a.coordinates.x - b.coordinates.x, a.coordinates.y - b.coordinates.y);
  systems.forEach((system, index) => {
    const nearest = systems
      .filter((_, otherIndex) => otherIndex !== index)
      .map((candidate) => ({ candidate, d: distance(system, candidate) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, index < 8 ? 4 : 3);
    for (const { candidate } of nearest) {
      if (!system.neighbors.includes(candidate.id)) system.neighbors.push(candidate.id);
      if (!candidate.neighbors.includes(system.id)) candidate.neighbors.push(system.id);
    }
  });
  for (let i = 1; i < systems.length; i += 1) {
    const previous = systems[i - 1];
    const current = systems[i];
    if (previous && current && !previous.neighbors.includes(current.id)) {
      previous.neighbors.push(current.id);
      current.neighbors.push(previous.id);
    }
  }
}

function createSystems(settings: GalaxySettings): StarSystem[] {
  const rng = createRng(`${settings.seed}:systems`);
  const systems: StarSystem[] = [];
  const radius = Math.max(520, Math.sqrt(settings.systemCount) * 62);
  for (let index = 0; index < settings.systemCount; index += 1) {
    const angle = rng.next() * Math.PI * 2;
    const normalized = Math.sqrt(rng.next());
    const distance = normalized * radius;
    const region: StarSystem['region'] = normalized < 0.28 ? 'core' : normalized < 0.68 ? 'frontier' : 'deep';
    const id = `sys_${index.toString(36)}_${stableHash(`${settings.seed}:${index}`)}`;
    const system: StarSystem = {
      id,
      name: starName(rng),
      coordinates: { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance },
      starClass: rng.pick(starClasses),
      starCount: rng.chance(0.2) ? (rng.chance(0.84) ? 2 : 3) : 1,
      planets: [],
      neighbors: [],
      danger: dangerByRegion(region, rng.next()),
      civilizationIds: [],
      known: region === 'core' || (region === 'frontier' && rng.chance(0.35)),
      visited: false,
      scanned: false,
      anomaly: rng.chance(settings.anomalyFrequency),
      region
    };
    const count = rng.int(1, 9);
    system.planets = Array.from({ length: count }, (_, planetIndex) => createPlanet(system, planetIndex, settings));
    systems.push(system);
  }
  systems.sort((a, b) => Math.hypot(a.coordinates.x, a.coordinates.y) - Math.hypot(b.coordinates.x, b.coordinates.y));
  connectSystems(systems);
  return systems;
}

function createCivilizations(settings: GalaxySettings, systems: StarSystem[]): Civilization[] {
  const rng = createRng(`${settings.seed}:civilizations`);
  const candidateSystems = systems.filter((system) => system.planets.some((planet) => planet.habitability > 30));
  const civilizations: Civilization[] = [];
  for (let i = 0; i < settings.civilizationCount; i += 1) {
    const species = speciesName(rng);
    const home = candidateSystems[(i * 17 + rng.int(0, Math.max(0, candidateSystems.length - 1))) % candidateSystems.length] ?? systems[i % systems.length];
    if (!home) continue;
    const status: Civilization['status'] = i % 5 === 0 ? 'dead' : i % 11 === 0 ? 'hidden' : 'living';
    const id = `civ_${i.toString(36)}_${stableHash(`${settings.seed}:civ:${i}`)}`;
    const reach = status === 'dead' ? rng.int(1, 12) : rng.int(1, Math.max(2, Math.round(2 + i / 4)));
    const controlled = [home.id, ...home.neighbors.slice(0, reach)].slice(0, reach + 1);
    const foundedYear = -rng.int(800, Math.min(settings.historyYears, 1_800_000));
    const civilization: Civilization = {
      id,
      name: civilizationName(rng, species),
      speciesName: species,
      status,
      techLevel: rng.int(status === 'dead' ? 2 : 1, 10),
      ideology: rng.pick(ideologies),
      homeSystemId: home.id,
      controlledSystems: controlled,
      foundedYear,
      endedYear: status === 'dead' ? rng.int(foundedYear + 100, -10) : undefined,
      traits: Array.from(new Set([rng.pick(civTraits), rng.pick(civTraits), rng.pick(civTraits)]))
    };
    civilizations.push(civilization);
    for (const systemId of controlled) {
      const system = systems.find((entry) => entry.id === systemId);
      if (!system) continue;
      system.civilizationIds.push(id);
      if (status === 'living' && !system.factionId) system.factionId = id;
      const habitable = system.planets.find((planet) => planet.habitability > 30 && planet.type !== 'gas');
      if (habitable && !habitable.civilizationId) habitable.civilizationId = id;
    }
  }
  return civilizations;
}

function createFigures(settings: GalaxySettings, civilizations: Civilization[]): HistoricalFigure[] {
  const rng = createRng(`${settings.seed}:figures`);
  const figures: HistoricalFigure[] = [];
  civilizations.forEach((civilization, civIndex) => {
    const count = rng.int(3, 9);
    for (let index = 0; index < count; index += 1) {
      const bornYear = rng.int(civilization.foundedYear, civilization.endedYear ?? -20);
      const importance = index === 0 ? rng.int(75, 100) : rng.int(18, 78);
      figures.push({
        id: `fig_${civIndex.toString(36)}_${index.toString(36)}_${stableHash(`${settings.seed}:fig:${civIndex}:${index}`)}`,
        name: figureName(rng),
        civilizationId: civilization.id,
        role: rng.pick(roles),
        bornYear,
        diedYear: rng.chance(0.86) ? bornYear + rng.int(24, 140) : undefined,
        importance,
        achievements: [
          `Influenced ${civilization.name} during a period of ${rng.pick(eventTypes)}.`,
          rng.pick(['Created a forbidden work.', 'Mapped an unstable route.', 'Founded a criminal network.', 'Recovered a lost archive.', 'Changed a military doctrine.'])
        ]
      });
    }
  });
  return figures;
}

function createHistory(settings: GalaxySettings, systems: StarSystem[], civilizations: Civilization[], figures: HistoricalFigure[]): HistoricalEvent[] {
  const rng = createRng(`${settings.seed}:history`);
  const events: HistoricalEvent[] = [];
  for (const civilization of civilizations) {
    const localFigures = figures.filter((figure) => figure.civilizationId === civilization.id);
    const eventCount = rng.int(7, 18);
    for (let i = 0; i < eventCount; i += 1) {
      const latest = civilization.endedYear ?? 0;
      const year = rng.int(civilization.foundedYear, latest);
      const type = rng.pick(eventTypes);
      const systemId = rng.pick(civilization.controlledSystems);
      const figure = localFigures.length > 0 && rng.chance(0.72) ? rng.pick(localFigures) : undefined;
      const consequences = [rng.pick(['a border moved', 'a culture split', 'a route was abandoned', 'a technology was banned', 'a colony starved', 'an archive was falsified', 'a dynasty ended'])];
      events.push({
        id: `evt_${events.length.toString(36)}_${stableHash(`${settings.seed}:event:${events.length}`)}`,
        year,
        title: `${type[0]?.toUpperCase() ?? ''}${type.slice(1)} of ${civilization.speciesName}`,
        summary: `${civilization.name} experienced a ${type} near ${systems.find((system) => system.id === systemId)?.name ?? 'an unnamed system'}.`,
        civilizationIds: [civilization.id],
        systemIds: [systemId],
        figureIds: figure ? [figure.id] : [],
        consequences
      });
    }
    if (civilization.status === 'dead') {
      events.push({
        id: `evt_end_${civilization.id}`,
        year: civilization.endedYear ?? -1,
        title: `Extinction of ${civilization.speciesName}`,
        summary: `${civilization.name} vanished after ${rng.pick(['civil war', 'a failed transcendence', 'an engineered plague', 'resource collapse', 'an impossible astronomical event', 'a chain of ordinary administrative failures'])}.`,
        civilizationIds: [civilization.id],
        systemIds: civilization.controlledSystems.slice(0, 3),
        figureIds: [],
        consequences: ['ruins formed', 'survivor myths spread', 'artifacts entered foreign hands']
      });
    }
  }
  return events.sort((a, b) => a.year - b.year);
}

function createArtifacts(settings: GalaxySettings, civilizations: Civilization[], figures: HistoricalFigure[]): Artifact[] {
  const rng = createRng(`${settings.seed}:artifacts`);
  const artifacts: Artifact[] = [];
  civilizations.forEach((civilization, index) => {
    const count = rng.int(1, 4);
    const localFigures = figures.filter((figure) => figure.civilizationId === civilization.id);
    for (let i = 0; i < count; i += 1) {
      const creator = localFigures.length > 0 ? rng.pick(localFigures) : undefined;
      const kind = rng.pick(artifactKinds);
      const createdYear = creator?.bornYear ? creator.bornYear + rng.int(16, 60) : civilization.foundedYear + rng.int(20, 300);
      artifacts.push({
        id: `art_${index.toString(36)}_${i.toString(36)}_${stableHash(`${settings.seed}:artifact:${index}:${i}`)}`,
        name: `${rng.pick(['Black', 'Last', 'Laughing', 'Silent', 'Red', 'Unfinished', 'Hollow'])} ${rng.pick(['Vector', 'Saint', 'Dose', 'Crown', 'Engine', 'Witness', 'Key', 'Bone'])}`,
        kind,
        civilizationId: civilization.id,
        createdYear,
        creatorId: creator?.id,
        ownerHistory: [civilization.name, rng.pick(['a pirate court', 'a private museum', 'a dead expedition', 'an unnamed pilgrim'])],
        value: rng.int(500, 95_000),
        danger: rng.int(0, 10),
        truth: `The ${kind} was involved in ${rng.pick(['a succession murder', 'a failed cure', 'a border war', 'a fraudulent religion', 'a famous rescue', 'the collapse of a colony'])}.`,
        publicDescription: `A ${kind} attributed to ${civilization.name}. Its documented history is incomplete.`,
        discovered: false
      });
    }
  });
  return artifacts;
}

export async function generateGalaxy(
  rawSettings: GalaxySettings,
  onProgress?: (progress: GenerationProgress) => void
): Promise<Galaxy> {
  const settings = settingsSchema.parse(normalizeGalaxySettings(rawSettings)) as GalaxySettings;
  const emit = async (stage: string, progress: number, message: string): Promise<void> => {
    onProgress?.({ stage, progress, message });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };
  await emit('structure', 0.05, 'Формируется галактический диск');
  const systems = createSystems(settings);
  if (systems.length !== settings.systemCount) throw new Error(`Generation integrity error: ${systems.length}/${settings.systemCount} systems`);
  await emit('planets', 0.25, `Создано ${systems.length} звёздных систем`);
  const civilizations = createCivilizations(settings, systems);
  await emit('civilizations', 0.46, `Возникло ${civilizations.length} цивилизаций`);
  const figures = createFigures(settings, civilizations);
  await emit('figures', 0.62, `Зафиксировано ${figures.length} исторических личностей`);
  const history = createHistory(settings, systems, civilizations, figures);
  await emit('history', 0.82, `Симулировано ${history.length} крупных событий`);
  const artifacts = createArtifacts(settings, civilizations, figures);
  const startSystem = systems.find((system) => system.region === 'core' && system.danger === 'safe') ?? systems[0];
  if (!startSystem) throw new Error('Galaxy generation produced no systems');
  startSystem.known = true;
  startSystem.visited = true;
  startSystem.scanned = true;
  startSystem.planets.forEach((planet) => { planet.scanned = true; planet.scanLevel = 1; });
  startSystem.neighbors.forEach((neighborId) => {
    const neighbor = systems.find((system) => system.id === neighborId);
    if (neighbor) neighbor.known = true;
  });
  await emit('finalize', 1, `Галактика готова: ${systems.length} систем, ${artifacts.length} значимых артефактов`);
  return {
    id: `gal_${stableHash(settings.seed)}`,
    seed: settings.seed,
    createdAt: new Date().toISOString(),
    currentYear: 0,
    settings,
    systems,
    civilizations,
    figures,
    history,
    artifacts,
    startSystemId: startSystem.id
  };
}
