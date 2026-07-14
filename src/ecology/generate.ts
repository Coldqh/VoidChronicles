import type { Galaxy, Planet, PlanetType, StarSystem } from '../game/types';
import { createRng } from '../generation/rng';
import type { BiomeType, EcosystemBiome, EcosystemPathogen, EcosystemSpecies, PlanetEcologyState, TrophicLevel } from './types';

const biomePools: Record<PlanetType, BiomeType[]> = {
  rocky: ['grassland', 'desert', 'cavern', 'wetland'], ocean: ['oceanic', 'coastal', 'wetland', 'aerial'],
  desert: ['desert', 'cavern', 'volcanic'], ice: ['tundra', 'oceanic', 'cavern'], gas: ['aerial'],
  toxic: ['toxic', 'wetland', 'cavern', 'volcanic'], jungle: ['forest', 'wetland', 'coastal', 'grassland'],
  artificial: ['artificial', 'cavern', 'wetland'], anomalous: ['crystal', 'toxic', 'cavern', 'aerial']
};
const biomeNames: Record<BiomeType, string[]> = {
  oceanic: ['Пелагический пояс', 'Тёмный океан', 'Тёплое мелководье'], coastal: ['Приливные поля', 'Соляные берега', 'Шельфовые рифы'],
  forest: ['Многоярусные леса', 'Споровые чащи', 'Кремниевые рощи'], grassland: ['Открытые равнины', 'Моховые степи', 'Ленты фотосинтеза'],
  desert: ['Сухие плоскогорья', 'Стеклянные пустыни', 'Минеральные дюны'], tundra: ['Ледяная тундра', 'Криогенные поля', 'Подлёдные равнины'],
  wetland: ['Топи', 'Дельтовые болота', 'Гидротермальные низины'], cavern: ['Подземные биомы', 'Глубинные полости', 'Лавовые тоннели'],
  volcanic: ['Вулканические поля', 'Серные кальдеры', 'Базальтовые трещины'], toxic: ['Ядовитые низины', 'Кислотные озёра', 'Хлорные леса'],
  crystal: ['Кристаллические заросли', 'Резонансные поля', 'Световые плато'], aerial: ['Облачные колонии', 'Парящие рифы', 'Верхние слои атмосферы'],
  artificial: ['Садовые секции', 'Биореакторные ярусы', 'Заброшенные экокупола']
};
const resourceTags: Record<BiomeType, string[]> = {
  oceanic: ['белковые массы', 'соли', 'биолюминесцентные ткани'], coastal: ['ферменты', 'панцири', 'минеральные отложения'],
  forest: ['волокна', 'лекарственные соединения', 'смолы'], grassland: ['биомасса', 'семена', 'пищевые белки'],
  desert: ['термостойкие ткани', 'редкие соли', 'споры'], tundra: ['криобелки', 'антифризы', 'медленные культуры'],
  wetland: ['антибиотики', 'токсины', 'органические кислоты'], cavern: ['хемосинтетические культуры', 'грибы', 'минералы'],
  volcanic: ['термоферменты', 'металлоорганика', 'серные культуры'], toxic: ['ядовитые алкалоиды', 'устойчивые бактерии', 'реактивные ткани'],
  crystal: ['резонансные минералы', 'электроорганика', 'оптические ткани'], aerial: ['лёгкие мембраны', 'газовые мешки', 'атмосферные фильтры'],
  artificial: ['синтетическая биомасса', 'модифицированные органы', 'технические культуры']
};
const prefixes = ['Ара', 'Био', 'Век', 'Гли', 'Дро', 'Ксе', 'Лума', 'Меро', 'Нак', 'Оро', 'Пел', 'Ри', 'Ска', 'Тер', 'Уль', 'Фа', 'Хиро', 'Ци'];
const suffixes = ['тид', 'морф', 'скат', 'фит', 'гнат', 'плод', 'крыл', 'оид', 'кар', 'зой', 'спор', 'век', 'донт', 'рин'];
const traits = ['коллективное поведение', 'биолюминесценция', 'магниторецепция', 'смена формы', 'сезонная спячка', 'электрическая защита', 'кислотная кровь', 'минеральный панцирь', 'распределённая нервная система', 'симбиоз с микрофлорой', 'память поколений', 'быстрая регенерация', 'паразитическая стадия', 'аэростатические органы'];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function biomeEnvironment(type: BiomeType, planet: Planet, rng: ReturnType<typeof createRng>) {
  const temperature: Partial<Record<BiomeType, number>> = { oceanic: 18, coastal: 22, forest: 24, grassland: 19, desert: 48, tundra: -28, wetland: 27, cavern: 12, volcanic: 78, toxic: 35, crystal: 8, aerial: -5, artificial: 21 };
  const humidity: Partial<Record<BiomeType, number>> = { oceanic: 100, coastal: 88, forest: 78, grassland: 45, desert: 8, tundra: 18, wetland: 94, cavern: 64, volcanic: 10, toxic: 62, crystal: 25, aerial: 55, artificial: 50 };
  const harshness = planet.danger === 'extreme' ? 24 : planet.danger === 'danger' ? 15 : planet.danger === 'caution' ? 8 : 2;
  return { temperature: (temperature[type] ?? 20) + rng.int(-12, 12), humidity: clamp((humidity[type] ?? 50) + rng.int(-15, 15)), productivity: clamp(planet.habitability * .72 + rng.int(8, 36) - harshness), hazard: clamp(harshness + rng.int(0, type === 'toxic' || type === 'volcanic' ? 45 : 22)) };
}
function createBiomes(seed: string, system: StarSystem, planet: Planet): EcosystemBiome[] {
  const rng = createRng(`${seed}:ecology:biomes:${planet.id}`);
  const pool: BiomeType[] = biomePools[planet.type].length ? biomePools[planet.type] : ['cavern'];
  const count = Math.max(2, Math.min(6, 2 + Math.round(planet.habitability / 28) + rng.int(0, 1)));
  const chosen: BiomeType[] = []; while (chosen.length < count) chosen.push(rng.pick(pool));
  const weights = chosen.map(() => rng.int(15, 70)); const total = weights.reduce((a, b) => a + b, 0);
  return chosen.map((type, index) => ({ id: `biome_${planet.id}_${index}`, name: `${rng.pick(biomeNames[type])} ${system.name}`, type, coverage: Math.max(4, Math.round(weights[index]! / total * 100)), ...biomeEnvironment(type, planet, rng), resourceTags: [...resourceTags[type]].sort(() => rng.next() - .5).slice(0, 2) }));
}
function speciesName(rng: ReturnType<typeof createRng>, level: TrophicLevel): string { const role = level === 'producer' ? 'фит' : level === 'decomposer' ? 'спор' : level === 'predator' ? 'хищник' : level === 'parasite' ? 'паразит' : ''; return `${rng.pick(prefixes)}${rng.pick(suffixes)}${role ? `-${role}` : ''}`; }
function trophicFor(index: number, count: number): TrophicLevel { const ratio = index / Math.max(1, count - 1); return ratio < .28 ? 'producer' : ratio < .55 ? 'grazer' : ratio < .74 ? 'predator' : ratio < .86 ? 'scavenger' : ratio < .95 ? 'decomposer' : 'parasite'; }
function createSpecies(seed: string, planet: Planet, biomes: EcosystemBiome[]): EcosystemSpecies[] {
  const rng = createRng(`${seed}:ecology:species:${planet.id}`); const count = Math.max(6, Math.min(22, 6 + Math.round(planet.habitability / 8) + rng.int(-1, 3)));
  const species: EcosystemSpecies[] = Array.from({ length: count }, (_, index) => { const trophicLevel = trophicFor(index, count); const biome = rng.pick(biomes); const base = trophicLevel === 'producer' ? 78 : trophicLevel === 'grazer' ? 58 : trophicLevel === 'predator' ? 34 : 42; return { id: `species_${planet.id}_${index}`, name: speciesName(rng, trophicLevel), biomeIds: Array.from(new Set([biome.id, ...(rng.chance(.35) ? [rng.pick(biomes).id] : [])])), trophicLevel, abundance: clamp(base + rng.int(-22, 18)), resilience: clamp(35 + planet.habitability / 2 + rng.int(-20, 25)), mobility: rng.int(4, 96), aggression: trophicLevel === 'predator' ? rng.int(45, 96) : rng.int(0, 52), toxicity: planet.type === 'toxic' ? rng.int(35, 100) : rng.int(0, 65), traits: Array.from(new Set([rng.pick(traits), rng.pick(traits)])).slice(0, 2), preyIds: [], predatorIds: [], status: 'stable' }; });
  const producers = species.filter(e => e.trophicLevel === 'producer'); const grazers = species.filter(e => e.trophicLevel === 'grazer'); const consumers = species.filter(e => ['predator','scavenger','parasite'].includes(e.trophicLevel));
  for (const entry of species) { const pool = entry.trophicLevel === 'grazer' ? producers : entry.trophicLevel === 'predator' ? grazers : entry.trophicLevel === 'scavenger' ? [...grazers, ...consumers.filter(c => c.id !== entry.id)] : entry.trophicLevel === 'parasite' ? species.filter(c => c.id !== entry.id) : []; if (pool.length) entry.preyIds = Array.from(new Set(Array.from({ length: Math.min(pool.length, rng.int(1, 3)) }, () => rng.pick(pool).id))); }
  for (const predator of species) for (const preyId of predator.preyIds) { const prey = species.find(e => e.id === preyId); if (prey && !prey.predatorIds.includes(predator.id)) prey.predatorIds.push(predator.id); }
  return species;
}
function createPathogens(seed: string, planet: Planet, species: EcosystemSpecies[]): EcosystemPathogen[] { const rng = createRng(`${seed}:ecology:pathogens:${planet.id}`); const count = rng.chance(.62) ? rng.int(1, Math.max(1, Math.min(4, Math.ceil(species.length / 6)))) : 0; return Array.from({ length: count }, (_, index) => ({ id: `pathogen_${planet.id}_${index}`, name: `${rng.pick(['Серая','Стеклянная','Нулевая','Споровая','Красная'])} ${rng.pick(['лихорадка','гниль','мозаика','дрожь','пыль'])}`, hostSpeciesIds: Array.from(new Set(Array.from({ length: rng.int(1, Math.min(4, species.length)) }, () => rng.pick(species).id))), virulence: rng.int(15, 92), spread: rng.int(8, 86), lethality: rng.int(2, 72), active: rng.chance(.12) })); }
function supportsEcology(seed: string, planet: Planet): boolean { if (planet.hasLife) return true; if (planet.type === 'gas') return false; const rng = createRng(`${seed}:ecology:microbial:${planet.id}`); return ['toxic','anomalous','artificial'].includes(planet.type) && rng.chance(.18); }
export function generatePlanetEcology(seed: string, system: StarSystem, planet: Planet, absoluteHour = 0): PlanetEcologyState | null {
  if (!supportsEcology(seed, planet)) return null; const rng = createRng(`${seed}:ecology:${planet.id}`); const biomes = createBiomes(seed, system, planet); const species = createSpecies(seed, planet, biomes); const pathogens = createPathogens(seed, planet, species); const productivity = biomes.reduce((sum, biome) => sum + biome.productivity * biome.coverage / 100, 0); const climateStability = clamp(58 + planet.habitability / 3 - (planet.danger === 'extreme' ? 28 : planet.danger === 'danger' ? 14 : 0) + rng.int(-15, 15)); const biomass = clamp(productivity + rng.int(-10, 18)); const biodiversity = clamp(species.length * 4 + biomes.length * 5 + rng.int(-8, 12));
  return { planetId: planet.id, climateStability, biomass, biodiversity, resilience: clamp((climateStability + biodiversity + planet.habitability) / 3), contamination: planet.type === 'toxic' ? rng.int(48, 92) : planet.type === 'artificial' ? rng.int(15, 55) : rng.int(0, 24), carryingCapacity: clamp(productivity + planet.habitability / 2), resources: { biomass: clamp(biomass + rng.int(-8, 12)), medicinal: clamp(biodiversity * .65 + rng.int(-12, 20)), organics: clamp(biomass * .8 + rng.int(-8, 18)), rareCompounds: clamp((planet.type === 'anomalous' || planet.type === 'toxic' ? 52 : 18) + rng.int(-10, 30)) }, biomes, species, pathogens, extinctSpeciesIds: [], invasiveSpeciesIds: [], cycle: 0, lastUpdatedHour: absoluteHour };
}
export function initializeEcosystems(galaxy: Galaxy, absoluteHour = 0): Record<string, PlanetEcologyState> { const result: Record<string, PlanetEcologyState> = {}; for (const system of galaxy.systems) for (const planet of system.planets) { const ecology = generatePlanetEcology(galaxy.seed, system, planet, absoluteHour); if (ecology) result[planet.id] = ecology; } return result; }
