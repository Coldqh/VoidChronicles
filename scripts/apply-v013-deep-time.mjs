import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(cwd, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(cwd, relativePath), content, 'utf8');
}

function replaceRequired(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`v0.13: marker not found — ${label}`);
  return text.replace(search, replacement);
}

function replaceRegexRequired(text, regex, replacement, label) {
  if (!regex.test(text)) throw new Error(`v0.13: regex marker not found — ${label}`);
  return text.replace(regex, replacement);
}

// Version.
{
  let text = read('src/version.ts');
  text = replaceRegexRequired(
    text,
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.13.0';",
    'APP_VERSION'
  );
  text = replaceRegexRequired(
    text,
    /export const APP_CODENAME = '[^']+';/,
    "export const APP_CODENAME = 'DEEP_TIME';",
    'APP_CODENAME'
  );
  write('src/version.ts', text);
}

// Public game types.
{
  let text = read('src/game/types.ts');
  text = replaceRequired(
    text,
    "import type { PlayerKnowledgeState, SimulationState } from '../simulation/types';",
    "import type { PlayerKnowledgeState, SimulationState } from '../simulation/types';\nimport type {\n  CivilizationDevelopmentState,\n  CivilizationTechnologyProfile,\n  CivilizationalEra,\n  DeepTimeState\n} from '../deeptime/types';",
    'deep time type import'
  );
  text = replaceRequired(
    text,
    "  extinctionCause?: string;\n}",
    "  extinctionCause?: string;\n  era?: CivilizationalEra;\n  technology?: CivilizationTechnologyProfile;\n  development?: CivilizationDevelopmentState;\n  deepTimeCultureIds?: string[];\n  deepTimePolityIds?: string[];\n}",
    'civilization deep time fields'
  );
  text = replaceRequired(
    text,
    "  artifacts: Artifact[];\n  startSystemId: string;",
    "  artifacts: Artifact[];\n  deepTime?: DeepTimeState;\n  startSystemId: string;",
    'galaxy deep time field'
  );
  write('src/game/types.ts', text);
}

// Galaxy generation now runs deep-time foundation.
{
  let text = read('src/generation/generateGalaxy.ts');
  text = replaceRequired(
    text,
    "import { createRng, stableHash } from './rng';",
    "import { createRng, stableHash } from './rng';\nimport { buildDeepTimeFoundation } from '../deeptime/foundation';",
    'foundation import'
  );
  text = replaceRequired(
    text,
    "  const civilizations = createCivilizations(settings, systems);\n  await emit('civilizations', 0.46, `Возникло ${civilizations.length} цивилизаций`);\n  const figures = createFigures(settings, civilizations);\n  await emit('figures', 0.62, `Зафиксировано ${figures.length} исторических личностей`);\n  const history = createHistory(settings, systems, civilizations, figures);\n  await emit('history', 0.82, `Симулировано ${history.length} крупных событий`);\n  const artifacts = createArtifacts(settings, civilizations, figures);",
    "  const initialCivilizations = createCivilizations(settings, systems);\n  await emit('civilizations', 0.42, `Возникло ${initialCivilizations.length} разумных линий`);\n  const foundation = buildDeepTimeFoundation(settings, systems, initialCivilizations);\n  const civilizations = foundation.civilizations;\n  const deepTime = foundation.deepTime;\n  await emit('deep-time', 0.62, `Пройдены эпохи: ${deepTime.transitions.length} переходов, ${deepTime.statistics.extinctCivilizations} окончательных гибелей`);\n  const figures = createFigures(settings, civilizations);\n  await emit('figures', 0.72, `Зафиксировано ${figures.length} исторических личностей`);\n  const history = foundation.history.length ? foundation.history : createHistory(settings, systems, civilizations, figures);\n  await emit('history', 0.86, `Сформирована причинная хроника из ${history.length} событий`);\n  const artifacts = createArtifacts(settings, civilizations, figures);",
    'generation foundation block'
  );
  text = replaceRequired(
    text,
    "    history,\n    artifacts,\n    startSystemId: startSystem.id",
    "    history,\n    artifacts,\n    deepTime,\n    startSystemId: startSystem.id",
    'generation return deep time'
  );
  write('src/generation/generateGalaxy.ts', text);
}

// Only spacefaring civilizations create interstellar factions and hubs.
{
  let text = read('src/world/livingGalaxy.ts');
  text = replaceRequired(
    text,
    "  const livingCivilizations = galaxy.civilizations.filter((civilization) => civilization.status === 'living');\n  const factionCount = Math.max(6, Math.min(14, livingCivilizations.length + 5));\n  const factions = Array.from({ length: factionCount }, (_, index) => makeFaction(index, livingCivilizations[index % Math.max(1, livingCivilizations.length)], rng));",
    "  const livingCivilizations = galaxy.civilizations.filter((civilization) => civilization.status === 'living');\n  const spacefaringCivilizations = livingCivilizations.filter((civilization) => (civilization.development?.spaceAccess ?? 'interstellar') !== 'none');\n  const factionCount = Math.max(6, Math.min(14, spacefaringCivilizations.length + 5));\n  const factions = Array.from({ length: factionCount }, (_, index) => makeFaction(index, spacefaringCivilizations[index % Math.max(1, spacefaringCivilizations.length)], rng));",
    'spacefaring living factions'
  );
  text = replaceRequired(
    text,
    "  const candidateSystems = galaxy.systems\n    .filter((system) => system.region === 'core' || system.civilizationIds.length > 0)",
    "  const spacefaringIds = new Set(spacefaringCivilizations.map((civilization) => civilization.id));\n  const candidateSystems = galaxy.systems\n    .filter((system) => system.region === 'core' || system.civilizationIds.some((id) => spacefaringIds.has(id)))",
    'spacefaring hub systems'
  );
  write('src/world/livingGalaxy.ts', text);
}

// Era-aware civilization dressing avoids orbital terminology for medieval societies.
{
  let text = read('src/world/civilizations.ts');
  text = replaceRequired(
    text,
    "  const cultureCount = civilization.status === 'living' ? rng.int(2, 4) : rng.int(1, 3);\n  const cultures = Array.from({ length: cultureCount }, (_, index) => ({\n    id: `culture_${civilization.id}_${index}`,\n    name: `${rng.pick(['Орбитальная', 'Прибрежная', 'Пограничная', 'Династическая', 'Архивная', 'Кочевая'])} культура ${civilization.speciesName}`,",
    "  const cultureCount = civilization.status === 'living' ? rng.int(2, 4) : rng.int(1, 3);\n  const preSpace = (civilization.development?.spaceAccess ?? 'interstellar') === 'none';\n  const culturePrefixes = preSpace\n    ? ['Речная', 'Прибрежная', 'Горная', 'Династическая', 'Лесная', 'Кочевая']\n    : ['Орбитальная', 'Прибрежная', 'Пограничная', 'Династическая', 'Архивная', 'Кочевая'];\n  const cultures = Array.from({ length: cultureCount }, (_, index) => ({\n    id: `culture_${civilization.id}_${index}`,\n    name: `${rng.pick(culturePrefixes)} культура ${civilization.speciesName}`,",
    'era-aware culture names'
  );
  text = replaceRequired(
    text,
    "  const stateCount = civilization.status === 'living' ? rng.int(1, Math.min(4, Math.max(1, civilization.controlledSystems.length))) : rng.int(1, 3);\n  const stateSystems = civilization.controlledSystems.length > 0 ? civilization.controlledSystems : [civilization.homeSystemId];\n  const states = Array.from({ length: stateCount }, (_, index) => ({\n    id: `state_${civilization.id}_${index}`,\n    name: `${rng.pick(['Союз', 'Доминион', 'Республика', 'Синод', 'Династия', 'Лига'])} ${rng.pick(['Внутренних Миров', 'Семи Портов', 'Первой Памяти', 'Свободных Колоний', 'Стеклянных Орбит'])}`,",
    "  const stateCount = civilization.status === 'living' ? rng.int(1, Math.min(4, Math.max(1, civilization.controlledSystems.length))) : rng.int(1, 3);\n  const stateSystems = civilization.controlledSystems.length > 0 ? civilization.controlledSystems : [civilization.homeSystemId];\n  const statePrefixes = preSpace ? ['Царство', 'Империя', 'Республика', 'Синод', 'Династия', 'Лига городов'] : ['Союз', 'Доминион', 'Республика', 'Синод', 'Династия', 'Лига'];\n  const stateSuffixes = preSpace ? ['Семи Рек', 'Первой Памяти', 'Свободных Городов', 'Высоких Плато', 'Внутреннего Моря'] : ['Внутренних Миров', 'Семи Портов', 'Первой Памяти', 'Свободных Колоний', 'Стеклянных Орбит'];\n  const states = Array.from({ length: stateCount }, (_, index) => ({\n    id: `state_${civilization.id}_${index}`,\n    name: `${rng.pick(statePrefixes)} ${rng.pick(stateSuffixes)}`,",
    'era-aware state names'
  );
  write('src/world/civilizations.ts', text);
}

// Snapshot schemas preserve deep-time data without invalidating v13 saves.
{
  let text = read('src/persistence/snapshot.ts');

  text = replaceRequired(
    text,
    "const civilizationSchema = z.object({",
    "const civilizationalEraSchema = z.enum(['pre-sapient','tribal','neolithic','urban','bronze','iron','medieval','gunpowder','industrial','modern','atomic','early-space','interplanetary','interstellar','advanced']);\nconst deepTechnologyProfileSchema = z.object({\n  subsistence: finiteNumber, agriculture: finiteNumber, materials: finiteNumber, writing: finiteNumber,\n  governance: finiteNumber, medicine: finiteNumber, navigation: finiteNumber, military: finiteNumber,\n  industry: finiteNumber, energy: finiteNumber, computing: finiteNumber, biology: finiteNumber,\n  spaceflight: finiteNumber, ftl: finiteNumber\n});\nconst civilizationDevelopmentSchema = z.object({\n  civilizationId: z.string(), era: civilizationalEraSchema, eraStartedYear: finiteNumber,\n  technology: deepTechnologyProfileSchema, population: finiteNumber, urbanization: finiteNumber,\n  literacy: finiteNumber, industrialization: finiteNumber, energyUse: finiteNumber,\n  ecologicalPressure: finiteNumber, stability: finiteNumber, innovation: finiteNumber,\n  spaceAccess: z.enum(['none','orbital','interplanetary','interstellar','ftl']), regressionCount: finiteNumber,\n  collapseRisk: finiteNumber, extinct: z.boolean(), extinctionYear: finiteNumber.optional()\n});\nconst deepTimeSpeciesSchema = z.object({\n  id: z.string(), civilizationId: z.string(), name: z.string(), originPlanetId: z.string(),\n  biologicalOriginYear: finiteNumber, sapienceYear: finiteNumber, status: z.enum(['extant','extinct','diaspora']),\n  population: finiteNumber, adaptability: finiteNumber, cooperation: finiteNumber, aggression: finiteNumber,\n  cognition: finiteNumber, homeEnvironment: z.string()\n});\nconst deepTimeCultureSchema = z.object({\n  id: z.string(), civilizationId: z.string(), name: z.string(), originYear: finiteNumber,\n  endedYear: finiteNumber.optional(), status: z.enum(['living','absorbed','extinct']), values: z.array(z.string()),\n  adaptation: z.string(), parentCultureId: z.string().optional()\n});\nconst deepTimePolitySchema = z.object({\n  id: z.string(), civilizationId: z.string(), name: z.string(),\n  form: z.enum(['band','tribal-confederation','city-state','kingdom','empire','republic','theocracy','industrial-state','planetary-union','orbital-polity','interplanetary-state','stellar-state']),\n  status: z.enum(['active','collapsed','absorbed','exiled']), formedYear: finiteNumber, endedYear: finiteNumber.optional(),\n  capitalSystemId: z.string(), territorySystemIds: z.array(z.string()), cultureIds: z.array(z.string()),\n  population: finiteNumber, stability: finiteNumber, legitimacy: finiteNumber, military: finiteNumber\n});\nconst eraTransitionSchema = z.object({\n  id: z.string(), civilizationId: z.string(), from: civilizationalEraSchema, to: civilizationalEraSchema,\n  year: finiteNumber, reason: z.string(), regression: z.boolean()\n});\nconst deepTimeEventSchema = z.object({\n  id: z.string(), year: finiteNumber,\n  kind: z.enum(['biological-origin','sapience','era-transition','state-formation','state-collapse','war','migration','discovery','regression','collapse','extinction']),\n  title: z.string(), summary: z.string(), severity: finiteNumber, civilizationIds: z.array(z.string()),\n  polityIds: z.array(z.string()), systemIds: z.array(z.string()), tags: z.array(z.string())\n});\nconst deepTimeStateSchema = z.object({\n  version: z.literal(1), startYear: finiteNumber, endYear: finiteNumber,\n  species: z.array(deepTimeSpeciesSchema), cultures: z.array(deepTimeCultureSchema), polities: z.array(deepTimePolitySchema),\n  civilizations: z.record(z.string(), civilizationDevelopmentSchema), transitions: z.array(eraTransitionSchema), events: z.array(deepTimeEventSchema),\n  statistics: z.object({\n    generatedCivilizations: finiteNumber, livingCivilizations: finiteNumber, extinctCivilizations: finiteNumber,\n    hiddenCivilizations: finiteNumber, preSpaceCivilizations: finiteNumber, spacefaringCivilizations: finiteNumber,\n    transitions: finiteNumber, regressions: finiteNumber, events: finiteNumber\n  })\n});\n\nconst civilizationSchema = z.object({",
    'deep time snapshot schemas'
  );

  text = replaceRequired(
    text,
    "  extinctionCause: z.string().optional()\n});",
    "  extinctionCause: z.string().optional(),\n  era: civilizationalEraSchema.optional(),\n  technology: deepTechnologyProfileSchema.optional(),\n  development: civilizationDevelopmentSchema.optional(),\n  deepTimeCultureIds: z.array(z.string()).optional(),\n  deepTimePolityIds: z.array(z.string()).optional()\n});",
    'civilization snapshot deep time fields'
  );

  text = replaceRequired(
    text,
    "  history: z.array(historySchema),\n  artifacts: z.array(artifactSchema),\n  startSystemId: z.string().min(1)",
    "  history: z.array(historySchema),\n  artifacts: z.array(artifactSchema),\n  deepTime: deepTimeStateSchema.optional(),\n  startSystemId: z.string().min(1)",
    'galaxy snapshot deep time field'
  );

  write('src/persistence/snapshot.ts', text);
}

// Package metadata.
for (const relativePath of ['package.json', 'package-lock.json']) {
  const fullPath = path.join(cwd, relativePath);
  if (!fs.existsSync(fullPath)) continue;
  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (typeof json.version === 'string') json.version = '0.13.0';
  if (json.packages?.[''] && typeof json.packages[''] === 'object') {
    json.packages[''].version = '0.13.0';
  }
  fs.writeFileSync(fullPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

console.log('v0.13 Deep Time Foundation applied');
