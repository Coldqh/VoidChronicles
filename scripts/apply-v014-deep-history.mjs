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
  if (!text.includes(search)) throw new Error(`v0.14: marker not found — ${label}`);
  return text.replace(search, replacement);
}

function replaceRegexRequired(text, regex, replacement, label) {
  if (!regex.test(text)) throw new Error(`v0.14: regex marker not found — ${label}`);
  return text.replace(regex, replacement);
}

// Deep-time data model.
{
  const file = 'src/deeptime/types.ts';
  let text = read(file);

  text = replaceRequired(
    text,
    "  | 'state-collapse'\n  | 'war'",
    "  | 'state-collapse'\n  | 'settlement-founded'\n  | 'settlement-destroyed'\n  | 'first-contact'\n  | 'technology-transfer'\n  | 'trade'\n  | 'war'",
    'deep event kinds'
  );

  text = replaceRequired(
    text,
    "  systemIds: string[];\n  tags: string[];\n}",
    "  systemIds: string[];\n  settlementIds?: string[];\n  figureIds?: string[];\n  artifactIds?: string[];\n  tags: string[];\n}",
    'deep event links'
  );

  text = replaceRequired(
    text,
    "export interface DeepTimeStatistics {",
    `export type DeepHistoricalSettlementKind =
  | 'camp'
  | 'village'
  | 'town'
  | 'city'
  | 'capital'
  | 'fortress'
  | 'port'
  | 'industrial-city'
  | 'metropolis'
  | 'orbital-habitat'
  | 'planetary-colony'
  | 'stellar-colony';

export interface DeepHistoricalSettlement {
  id: string;
  civilizationId: string;
  polityId?: string;
  name: string;
  kind: DeepHistoricalSettlementKind;
  systemId: string;
  planetId?: string;
  foundedYear: number;
  endedYear?: number;
  status: 'active' | 'abandoned' | 'ruined' | 'conquered';
  populationPeak: number;
  populationAtEnd: number;
  cultureIds: string[];
  foundingCause: string;
  endCause?: string;
}

export interface DeepTimeWar {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  attackerPolityIds: string[];
  defenderPolityIds: string[];
  civilizationIds: string[];
  systemIds: string[];
  cause: string;
  outcome: string;
  casualties: number;
  settlementIds: string[];
  endedPolityIds: string[];
}

export interface DeepTimeMigration {
  id: string;
  civilizationId: string;
  year: number;
  sourceSettlementId?: string;
  destinationSettlementId?: string;
  population: number;
  cause: string;
  cultureIds: string[];
  createdCultureId?: string;
}

export interface DeepTechnologyDiscovery {
  id: string;
  civilizationId: string;
  polityId?: string;
  settlementId?: string;
  field: DeepTechnologyField;
  year: number;
  name: string;
  method: 'independent' | 'trade' | 'war' | 'recovery';
  sourceCivilizationId?: string;
  impact: number;
}

export interface DeepTimeRuin {
  id: string;
  settlementId: string;
  civilizationId: string;
  systemId: string;
  planetId?: string;
  createdYear: number;
  cause: string;
  integrity: number;
  remains: string[];
  artifactIds: string[];
}

export interface DeepTimeStatistics {`,
    'deep history interfaces'
  );

  text = replaceRequired(
    text,
    "  events: number;\n}",
    `  events: number;
  settlements?: number;
  wars?: number;
  migrations?: number;
  discoveries?: number;
  ruins?: number;
  figures?: number;
  artifacts?: number;
}`,
    'deep history statistics'
  );

  text = replaceRequired(
    text,
    "  events: DeepTimeEvent[];\n  statistics: DeepTimeStatistics;",
    `  events: DeepTimeEvent[];
  historicalSettlements?: DeepHistoricalSettlement[];
  wars?: DeepTimeWar[];
  migrations?: DeepTimeMigration[];
  discoveries?: DeepTechnologyDiscovery[];
  ruins?: DeepTimeRuin[];
  statistics: DeepTimeStatistics;`,
    'deep history state'
  );

  write(file, text);
}

// Civilization seed keeps possible future expansion separate from actual territory.
{
  const file = 'src/game/types.ts';
  let text = read(file);
  text = replaceRequired(
    text,
    "  controlledSystems: string[];\n  foundedYear: number;",
    "  controlledSystems: string[];\n  expansionCandidateSystemIds?: string[];\n  foundedYear: number;",
    'civilization expansion candidates'
  );
  write(file, text);
}

// Foundation uses possible future corridor only after interstellar development.
{
  const file = 'src/deeptime/foundation.ts';
  let text = read(file);
  text = replaceRequired(
    text,
    "  const available = unique([civilization.homeSystemId, ...civilization.controlledSystems]);",
    "  const available = unique([civilization.homeSystemId, ...(civilization.expansionCandidateSystemIds ?? civilization.controlledSystems)]);",
    'foundation expansion corridor'
  );
  write(file, text);
}

// Generation pipeline: clean seeds -> eras -> causal deep history.
{
  const file = 'src/generation/generateGalaxy.ts';
  let text = read(file);

  text = replaceRequired(
    text,
    "import { buildDeepTimeFoundation } from '../deeptime/foundation';",
    "import { buildDeepTimeFoundation } from '../deeptime/foundation';\nimport { createCivilizationSeeds } from '../deeptime/seeds';\nimport { generateDeepHistory } from '../deeptime/history';",
    'deep history imports'
  );

  text = replaceRequired(
    text,
    "  const initialCivilizations = createCivilizations(settings, systems);",
    "  const initialCivilizations = createCivilizationSeeds(settings, systems);",
    'clean civilization seeds'
  );

  const oldBlock = `  const foundation = buildDeepTimeFoundation(settings, systems, initialCivilizations);
  const civilizations = foundation.civilizations;
  const deepTime = foundation.deepTime;
  await emit('deep-time', 0.62, \`Пройдены эпохи: \${deepTime.transitions.length} переходов, \${deepTime.statistics.extinctCivilizations} окончательных гибелей\`);
  const figures = createFigures(settings, civilizations);
  await emit('figures', 0.72, \`Зафиксировано \${figures.length} исторических личностей\`);
  const history = foundation.history.length ? foundation.history : createHistory(settings, systems, civilizations, figures);
  await emit('history', 0.86, \`Сформирована причинная хроника из \${history.length} событий\`);
  const artifacts = createArtifacts(settings, civilizations, figures);`;

  const newBlock = `  const foundation = buildDeepTimeFoundation(settings, systems, initialCivilizations);
  const civilizations = foundation.civilizations;
  await emit('deep-time', 0.56, \`Пройдены эпохи: \${foundation.deepTime.transitions.length} переходов, \${foundation.deepTime.statistics.extinctCivilizations} окончательных гибелей\`);
  const generatedHistory = generateDeepHistory(settings, systems, civilizations, foundation.deepTime);
  const deepTime = generatedHistory.deepTime;
  const figures = generatedHistory.figures;
  const history = generatedHistory.history;
  const artifacts = generatedHistory.artifacts;
  await emit('deep-history', 0.76, \`История: \${deepTime.historicalSettlements?.length ?? 0} поселений, \${deepTime.wars?.length ?? 0} войн, \${deepTime.ruins?.length ?? 0} руин\`);
  await emit('figures', 0.84, \`Из реальных событий выделено \${figures.length} исторических личностей\`);
  await emit('history', 0.91, \`Сформирована причинная хроника из \${history.length} событий и \${artifacts.length} артефактов\`);`;

  text = replaceRequired(text, oldBlock, newBlock, 'generation deep history pipeline');
  write(file, text);
}

// Current simulation no longer invents space cities for civilizations without space access.
{
  const file = 'src/simulation/settlements.ts';
  let text = read(file);
  text = replaceRequired(
    text,
    "  for (const civilization of context.galaxy.civilizations.filter((entry) => entry.status === 'living')) {",
    "  for (const civilization of context.galaxy.civilizations.filter((entry) => entry.status === 'living' && (entry.development?.spaceAccess ?? 'interstellar') !== 'none')) {",
    'space settlement filter'
  );
  write(file, text);
}

// Interstellar colonization requires actual interstellar access.
{
  const file = 'src/simulation/migration.ts';
  let text = read(file);
  text = replaceRequired(
    text,
    "  if (civilizationState.expansionPressure >= 68 && origin.population >= 25_000 && candidates.length && rng.chance(0.42)) {",
    "  const canColonizeStars = civilization.development?.spaceAccess === 'interstellar' || civilization.development?.spaceAccess === 'ftl';\n  if (canColonizeStars && civilizationState.expansionPressure >= 68 && origin.population >= 25_000 && candidates.length && rng.chance(0.42)) {",
    'interstellar colonization gate'
  );
  write(file, text);
}

// Snapshot schemas preserve all v0.14 history data.
{
  const file = 'src/persistence/snapshot.ts';
  let text = read(file);

  text = replaceRequired(
    text,
    "  kind: z.enum(['biological-origin','sapience','era-transition','state-formation','state-collapse','war','migration','discovery','regression','collapse','extinction']),",
    "  kind: z.enum(['biological-origin','sapience','era-transition','state-formation','state-collapse','settlement-founded','settlement-destroyed','first-contact','technology-transfer','trade','war','migration','discovery','regression','collapse','extinction']),",
    'snapshot event kinds'
  );

  text = replaceRequired(
    text,
    "  polityIds: z.array(z.string()), systemIds: z.array(z.string()), tags: z.array(z.string())",
    "  polityIds: z.array(z.string()), systemIds: z.array(z.string()), settlementIds: z.array(z.string()).optional(),\n  figureIds: z.array(z.string()).optional(), artifactIds: z.array(z.string()).optional(), tags: z.array(z.string())",
    'snapshot event links'
  );

  text = replaceRequired(
    text,
    "const deepTimeStateSchema = z.object({",
    `const deepHistoricalSettlementSchema = z.object({
  id: z.string(), civilizationId: z.string(), polityId: z.string().optional(), name: z.string(),
  kind: z.enum(['camp','village','town','city','capital','fortress','port','industrial-city','metropolis','orbital-habitat','planetary-colony','stellar-colony']),
  systemId: z.string(), planetId: z.string().optional(), foundedYear: finiteNumber, endedYear: finiteNumber.optional(),
  status: z.enum(['active','abandoned','ruined','conquered']), populationPeak: finiteNumber, populationAtEnd: finiteNumber,
  cultureIds: z.array(z.string()), foundingCause: z.string(), endCause: z.string().optional()
});
const deepTimeWarSchema = z.object({
  id: z.string(), name: z.string(), startYear: finiteNumber, endYear: finiteNumber,
  attackerPolityIds: z.array(z.string()), defenderPolityIds: z.array(z.string()),
  civilizationIds: z.array(z.string()), systemIds: z.array(z.string()), cause: z.string(), outcome: z.string(),
  casualties: finiteNumber, settlementIds: z.array(z.string()), endedPolityIds: z.array(z.string())
});
const deepTimeMigrationSchema = z.object({
  id: z.string(), civilizationId: z.string(), year: finiteNumber,
  sourceSettlementId: z.string().optional(), destinationSettlementId: z.string().optional(),
  population: finiteNumber, cause: z.string(), cultureIds: z.array(z.string()), createdCultureId: z.string().optional()
});
const deepTechnologyDiscoverySchema = z.object({
  id: z.string(), civilizationId: z.string(), polityId: z.string().optional(), settlementId: z.string().optional(),
  field: z.enum(['subsistence','agriculture','materials','writing','governance','medicine','navigation','military','industry','energy','computing','biology','spaceflight','ftl']),
  year: finiteNumber, name: z.string(), method: z.enum(['independent','trade','war','recovery']),
  sourceCivilizationId: z.string().optional(), impact: finiteNumber
});
const deepTimeRuinSchema = z.object({
  id: z.string(), settlementId: z.string(), civilizationId: z.string(), systemId: z.string(),
  planetId: z.string().optional(), createdYear: finiteNumber, cause: z.string(), integrity: finiteNumber,
  remains: z.array(z.string()), artifactIds: z.array(z.string())
});

const deepTimeStateSchema = z.object({`,
    'snapshot deep history schemas'
  );

  text = replaceRequired(
    text,
    "  civilizations: z.record(z.string(), civilizationDevelopmentSchema), transitions: z.array(eraTransitionSchema), events: z.array(deepTimeEventSchema),",
    "  civilizations: z.record(z.string(), civilizationDevelopmentSchema), transitions: z.array(eraTransitionSchema), events: z.array(deepTimeEventSchema),\n  historicalSettlements: z.array(deepHistoricalSettlementSchema).optional(), wars: z.array(deepTimeWarSchema).optional(),\n  migrations: z.array(deepTimeMigrationSchema).optional(), discoveries: z.array(deepTechnologyDiscoverySchema).optional(),\n  ruins: z.array(deepTimeRuinSchema).optional(),",
    'snapshot deep history arrays'
  );

  text = replaceRequired(
    text,
    "    transitions: finiteNumber, regressions: finiteNumber, events: finiteNumber",
    "    transitions: finiteNumber, regressions: finiteNumber, events: finiteNumber,\n    settlements: finiteNumber.optional(), wars: finiteNumber.optional(), migrations: finiteNumber.optional(),\n    discoveries: finiteNumber.optional(), ruins: finiteNumber.optional(), figures: finiteNumber.optional(), artifacts: finiteNumber.optional()",
    'snapshot deep history statistics'
  );

  text = replaceRequired(
    text,
    "  controlledSystems: z.array(z.string()),\n  foundedYear: finiteNumber,",
    "  controlledSystems: z.array(z.string()),\n  expansionCandidateSystemIds: z.array(z.string()).optional(),\n  foundedYear: finiteNumber,",
    'snapshot expansion candidates'
  );

  write(file, text);
}

// Version metadata.
{
  const file = 'src/version.ts';
  let text = read(file);
  text = replaceRegexRequired(
    text,
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.14.0';",
    'APP_VERSION'
  );
  text = replaceRegexRequired(
    text,
    /export const APP_CODENAME = '[^']+';/,
    "export const APP_CODENAME = 'DEEP_HISTORY';",
    'APP_CODENAME'
  );
  write(file, text);
}

for (const relativePath of ['package.json', 'package-lock.json']) {
  const fullPath = path.join(cwd, relativePath);
  if (!fs.existsSync(fullPath)) continue;
  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (typeof json.version === 'string') json.version = '0.14.0';
  if (json.packages?.[''] && typeof json.packages[''] === 'object') {
    json.packages[''].version = '0.14.0';
  }
  fs.writeFileSync(fullPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

console.log('v0.14 Deep History Generator applied');
