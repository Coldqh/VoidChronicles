import { readFile, writeFile } from 'node:fs/promises';

async function read(path) {
  return (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
}

async function write(path, value) {
  await writeFile(path, value, 'utf8');
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label}: anchor not found`);
  return source.replace(before, after);
}

function replaceRegex(source, pattern, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!pattern.test(source)) throw new Error(`${label}: pattern not found`);
  return source.replace(pattern, replacement);
}

/* Types */
const typesPath = 'src/game/types.ts';
let types = await read(typesPath);

types = replaceOnce(
  types,
  `export interface OperationRequest {
  id: string;`,
  `export interface OperationChainState {
  id: string;
  stage: number;
  maxStages: number;
  originObjectiveId: string;
  previousOutcome?: OperationOutcome;
}

export interface OperationRequest {
  id: string;`,
  'operation chain type'
);

types = replaceOnce(
  types,
  `  urgency: number;
  stages: OperationStage[];
}
export interface OperationState {`,
  `  urgency: number;
  stages: OperationStage[];
  chain?: OperationChainState;
}
export interface OperationState {`,
  'operation request chain'
);

types = replaceOnce(
  types,
  `  completedYear?: number;
  log: string[];
}
export type GalacticRouteKind`,
  `  completedYear?: number;
  log: string[];
  chain?: OperationChainState;
}
export type GalacticRouteKind`,
  'operation state chain'
);

types = replaceOnce(
  types,
  `export interface PendingConsequence {
  id: string;`,
  `export interface OperationConsequenceContext {
  chain: OperationChainState;
  sourceObjectiveId: string;
  threadId: string;
  category: OperationCategory;
  outcome: OperationOutcome;
  quality: number;
  issuerName: string;
  issuerCivilizationId?: string;
  issuerFactionId?: string;
  targetSystemId: string;
  reward: number;
}

export interface PendingConsequence {
  id: string;`,
  'operation consequence context'
);

types = replaceOnce(
  types,
  `  factionId?: string;
  sourceSceneId?: string;
}`,
  `  factionId?: string;
  sourceSceneId?: string;
  operation?: OperationConsequenceContext;
}`,
  'pending consequence operation context'
);

await write(typesPath, types);

/* Persistence */
const snapshotPath = 'src/persistence/snapshot.ts';
let snapshot = await read(snapshotPath);

snapshot = replaceOnce(
  snapshot,
  `const operationRequestSchema = z.object({`,
  `const operationChainSchema = z.object({
  id: z.string(), stage: finiteNumber, maxStages: finiteNumber, originObjectiveId: z.string(),
  previousOutcome: z.enum(['failed','partial','successful','exceptional']).optional()
});
const operationRequestSchema = z.object({`,
  'operation chain schema'
);

snapshot = replaceOnce(
  snapshot,
  `  targetSystemId: z.string(), reward: finiteNumber, deadlineYear: finiteNumber, urgency: finiteNumber, stages: z.array(operationStageSchema)
});`,
  `  targetSystemId: z.string(), reward: finiteNumber, deadlineYear: finiteNumber, urgency: finiteNumber, stages: z.array(operationStageSchema),
  chain: operationChainSchema.optional()
});`,
  'operation request schema chain'
);

snapshot = replaceOnce(
  snapshot,
  `  outcome: z.enum(['failed','partial','successful','exceptional']).optional(), completedYear: finiteNumber.optional(), log: z.array(z.string())
});`,
  `  outcome: z.enum(['failed','partial','successful','exceptional']).optional(), completedYear: finiteNumber.optional(), log: z.array(z.string()),
  chain: operationChainSchema.optional()
});`,
  'operation state schema chain'
);

snapshot = replaceOnce(
  snapshot,
  `const pendingConsequenceSchema = z.object({
  id: z.string(), status: z.enum(['pending','resolved']), createdYear: finiteNumber, triggerYear: finiteNumber, title: z.string(), text: z.string(),
  tone: z.enum(['info','good','warning','danger']), systemId: z.string().optional(), factionId: z.string().optional(), sourceSceneId: z.string().optional()
});`,
  `const operationConsequenceContextSchema = z.object({
  chain: operationChainSchema,
  sourceObjectiveId: z.string(),
  threadId: z.string(),
  category: z.enum(['relief','evacuation','escort','mediation','investigation','recovery','containment']),
  outcome: z.enum(['failed','partial','successful','exceptional']),
  quality: finiteNumber,
  issuerName: z.string(),
  issuerCivilizationId: z.string().optional(),
  issuerFactionId: z.string().optional(),
  targetSystemId: z.string(),
  reward: finiteNumber
});
const pendingConsequenceSchema = z.object({
  id: z.string(), status: z.enum(['pending','resolved']), createdYear: finiteNumber, triggerYear: finiteNumber, title: z.string(), text: z.string(),
  tone: z.enum(['info','good','warning','danger']), systemId: z.string().optional(), factionId: z.string().optional(), sourceSceneId: z.string().optional(),
  operation: operationConsequenceContextSchema.optional()
});`,
  'pending consequence schema context'
);

await write(snapshotPath, snapshot);

/* Operation runtime */
const runtimePath = 'src/operations/runtime.ts';
let runtime = await read(runtimePath);

runtime = replaceOnce(
  runtime,
  `function stagesFor(category: OperationCategory, systemId: string): OperationStage[] {
  return stageTemplates[category].map((stage, index) => ({
    id: \`stage_\${index + 1}_\${stage.kind}\`,
    kind: stage.kind,
    title: stage.title,
    description: stage.description,
    status: index === 0 ? 'active' : 'locked',
    progress: 0,
    requiredProgress: 100,
    systemId
  }));
}`,
  `function stagesFor(category: OperationCategory, systemId: string): OperationStage[] {
  return stageTemplates[category].map((stage, index) => ({
    id: \`stage_\${index + 1}_\${stage.kind}\`,
    kind: stage.kind,
    title: stage.title,
    description: stage.description,
    status: index === 0 ? 'active' : 'locked',
    progress: 0,
    requiredProgress: 100,
    systemId
  }));
}

export function operationStagesFor(category: OperationCategory, systemId: string): OperationStage[] {
  return stagesFor(category, systemId);
}`,
  'export operation stages'
);

runtime = replaceOnce(
  runtime,
  `      attempts: 0,
      log: [\`Операция принята в \${year} году.\`]
    }`,
  `      attempts: 0,
      log: [\`Операция принята в \${year} году.\`],
      chain: request.chain ? { ...request.chain } : undefined
    }`,
  'copy operation chain into objective'
);

await write(runtimePath, runtime);

/* Store integration */
const storePath = 'src/game/store.ts';
let store = await read(storePath);

store = replaceOnce(
  store,
  `import { generateHubScene, generateScanScene, generateTravelScene, initializeNarrative, processDueConsequences } from '../narrative/encounters';`,
  `import { generateHubScene, generateScanScene, generateTravelScene, initializeNarrative, processDueConsequences } from '../narrative/encounters';
import { createOperationConsequence, projectLivingConsequenceScenes, worldEventDraftForConsequence } from '../narrative/livingConsequences';`,
  'living consequence imports'
);

const oldAdvance = `  const advanced = advanceSimulation(simulation, { seed: galaxy.seed, galaxy, factions, hubs }, hours, reason);
  const projectedHubs = hubs.map((hub) => {
    const settlement = Object.values(advanced.simulation.settlements).find((entry) => entry.hubId === hub.id);
    if (!settlement) return hub;
    const safety = settlement.security < 25 ? 'danger' as const : settlement.security < 55 ? 'caution' as const : 'safe' as const;
    return { ...hub, population: settlement.population, safety };
  });
  const previousYear = worldYear(simulation.clock);
  const nextYear = worldYear(advanced.simulation.clock);
  let warFronts = overrides.warFronts ?? state.warFronts;
  for (let year = previousYear + 1; year <= nextYear; year += 1) {
    warFronts = advanceWarFronts(\`\${galaxy.seed}:kernel\`, warFronts, year);
  }
  const baseContracts = (overrides.contracts ?? state.contracts).map((contract) => contract.status === 'active' && nextYear > contract.deadlineYear ? { ...contract, status: 'expired' as const } : contract);
  const contracts = projectContractsFromEvents({ events: advanced.emittedEvents, existing: baseContracts, hubs: projectedHubs, year: nextYear });
  const news = projectNewsFromEvents(advanced.emittedEvents, knowledge, overrides.news ?? state.news, currentSystemId ?? undefined);
  const researchProjects = overrides.researchProjects ?? state.researchProjects;
  const worldThreads = projectWorldThreads({ simulation: advanced.simulation, warFronts, factions, contracts, research: researchProjects });
  const datedScenes = state.storyScenes.map((scene) => scene.status === 'available' && scene.expiresYear !== undefined && scene.expiresYear < nextYear ? { ...scene, status: 'expired' as const } : scene);
  const storyScenes = projectOperationRequests({ threads: worldThreads, contacts: state.civilizationContacts, civilizations: galaxy.civilizations, factions, existingScenes: datedScenes, year: nextYear });
  const consequences = processDueConsequences(state.pendingConsequences, nextYear);
  const shipLife = state.ship && state.legacy.mode === 'active' ? advanceShipLife({ ship: state.ship, crew: state.crew, hours, seed: galaxy.seed, year: nextYear, reason }) : null;
  const incidentLogs = shipLife?.incidents.map((entry) => makeLog(nextYear, entry.title, entry.summary, entry.severity >= 70 ? 'danger' : 'warning')) ?? [];
  const logs = [...incidentLogs, ...consequences.due.map((entry) => makeLog(nextYear, entry.title, entry.text, entry.tone)), ...state.logs];
  const projectedGalaxy = projectKnowledgeToGalaxy({ ...galaxy, currentYear: nextYear }, knowledge);
  return {
    emittedEvents: advanced.emittedEvents,
    patch: {
      simulation: advanced.simulation,
      ship: shipLife?.ship ?? state.ship,
      crew: shipLife?.crew ?? state.crew,
      hubs: projectedHubs,
      galaxy: projectedGalaxy,
      gameYear: nextYear,
      contracts,
      news,
      worldThreads,
      warFronts,
      pendingConsequences: consequences.consequences,
      storyScenes,
      objectives: state.objectives.map((objective) => objective.status === 'active' && objective.deadlineYear !== undefined && objective.deadlineYear < nextYear ? { ...objective, status: 'failed' as const } : objective),
      logs: logs.slice(0, 750)
    }
  };`;

const newAdvance = `  const advanced = advanceSimulation(simulation, { seed: galaxy.seed, galaxy, factions, hubs }, hours, reason);
  let advancedSimulation = advanced.simulation;
  const previousYear = worldYear(simulation.clock);
  const nextYear = worldYear(advancedSimulation.clock);
  const consequences = processDueConsequences(state.pendingConsequences, nextYear);
  const consequenceEvents: WorldEvent[] = [];
  for (const consequence of consequences.due) {
    const draft = worldEventDraftForConsequence(consequence);
    if (!draft) continue;
    const recorded = recordWorldEvent(advancedSimulation, draft);
    advancedSimulation = recorded.simulation;
    consequenceEvents.push(recorded.event);
  }
  const emittedEvents = [...advanced.emittedEvents, ...consequenceEvents];
  const projectedHubs = hubs.map((hub) => {
    const settlement = Object.values(advancedSimulation.settlements).find((entry) => entry.hubId === hub.id);
    if (!settlement) return hub;
    const safety = settlement.security < 25 ? 'danger' as const : settlement.security < 55 ? 'caution' as const : 'safe' as const;
    return { ...hub, population: settlement.population, safety };
  });
  let warFronts = overrides.warFronts ?? state.warFronts;
  for (let year = previousYear + 1; year <= nextYear; year += 1) {
    warFronts = advanceWarFronts(\`\${galaxy.seed}:kernel\`, warFronts, year);
  }
  const baseContracts = (overrides.contracts ?? state.contracts).map((contract) => contract.status === 'active' && nextYear > contract.deadlineYear ? { ...contract, status: 'expired' as const } : contract);
  const contracts = projectContractsFromEvents({ events: emittedEvents, existing: baseContracts, hubs: projectedHubs, year: nextYear });
  const researchProjects = overrides.researchProjects ?? state.researchProjects;
  const provisionalThreads = projectWorldThreads({ simulation: advancedSimulation, warFronts, factions, contracts, research: researchProjects });
  const datedScenes = state.storyScenes.map((scene) => scene.status === 'available' && scene.expiresYear !== undefined && scene.expiresYear < nextYear ? { ...scene, status: 'expired' as const } : scene);
  const operationScenes = projectOperationRequests({ threads: provisionalThreads, contacts: state.civilizationContacts, civilizations: galaxy.civilizations, factions, existingScenes: datedScenes, year: nextYear });
  const consequenceProjection = projectLivingConsequenceScenes({
    due: consequences.due,
    existingScenes: operationScenes,
    factions,
    hubs: projectedHubs,
    localNpcs: state.localNpcs,
    year: nextYear
  });
  const news = projectNewsFromEvents(emittedEvents, knowledge, overrides.news ?? state.news, currentSystemId ?? undefined);
  const worldThreads = projectWorldThreads({ simulation: advancedSimulation, warFronts, factions: consequenceProjection.factions, contracts, research: researchProjects });
  const shipLife = state.ship && state.legacy.mode === 'active' ? advanceShipLife({ ship: state.ship, crew: state.crew, hours, seed: galaxy.seed, year: nextYear, reason }) : null;
  const incidentLogs = shipLife?.incidents.map((entry) => makeLog(nextYear, entry.title, entry.summary, entry.severity >= 70 ? 'danger' : 'warning')) ?? [];
  const logs = [...incidentLogs, ...consequences.due.map((entry) => makeLog(nextYear, entry.title, entry.text, entry.tone)), ...state.logs];
  const projectedGalaxy = projectKnowledgeToGalaxy({ ...galaxy, currentYear: nextYear }, knowledge);
  return {
    emittedEvents,
    patch: {
      simulation: advancedSimulation,
      ship: shipLife?.ship ?? state.ship,
      crew: shipLife?.crew ?? state.crew,
      hubs: projectedHubs,
      galaxy: projectedGalaxy,
      gameYear: nextYear,
      contracts,
      news,
      worldThreads,
      warFronts,
      factions: consequenceProjection.factions,
      localNpcs: consequenceProjection.localNpcs,
      pendingConsequences: consequences.consequences,
      storyScenes: consequenceProjection.storyScenes,
      objectives: state.objectives.map((objective) => objective.status === 'active' && objective.deadlineYear !== undefined && objective.deadlineYear < nextYear ? { ...objective, status: 'failed' as const } : objective),
      logs: logs.slice(0, 750)
    }
  };`;

store = replaceOnce(store, oldAdvance, newAdvance, 'world advance consequence projection');

store = replaceOnce(
  store,
  `    const objectives = state.objectives.map((entry) => entry.id === objective.id ? result.objective : entry);
    const baseLogs = (advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs;

    set({`,
  `    const objectives = state.objectives.map((entry) => entry.id === objective.id ? result.objective : entry);
    const baseLogs = (advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs;
    const baseConsequences = (advanced.patch.pendingConsequences as PendingConsequence[] | undefined) ?? state.pendingConsequences;
    const operationConsequence = result.completed
      ? createOperationConsequence({ objective: result.objective, year: advanced.patch.gameYear ?? state.gameYear, seed: galaxy.seed })
      : null;
    const pendingConsequences = operationConsequence && !baseConsequences.some((entry) => entry.id === operationConsequence.id)
      ? [operationConsequence, ...baseConsequences]
      : baseConsequences;

    set({`,
  'schedule operation consequence'
);

store = replaceOnce(
  store,
  `      factions,
      objectives,
      logs: [makeLog(state.gameYear, objective.title, result.message, result.outcome === 'failed' ? 'danger' : result.completed ? 'good' : 'info'), ...baseLogs].slice(0, 750)`,
  `      factions,
      objectives,
      pendingConsequences,
      logs: [makeLog(state.gameYear, objective.title, result.message, result.outcome === 'failed' ? 'danger' : result.completed ? 'good' : 'info'), ...baseLogs].slice(0, 750)`,
  'store operation consequence'
);

await write(storePath, store);

/* Journey */
const journeyPath = 'src/journey/captainJourney.ts';
let journey = await read(journeyPath);

journey = replaceOnce(
  journey,
  `  NavigationState,
  PlayerObjective,`,
  `  NavigationState,
  PendingConsequence,
  PlayerObjective,`,
  'journey pending consequence import'
);

journey = replaceOnce(
  journey,
  `  recentConsequences: GameLogEntry[];
}`,
  `  recentConsequences: GameLogEntry[];
}`,
  'journey result compatibility'
);

journey = replaceOnce(
  journey,
  `  logs: GameLogEntry[];
  openShipIssues: number;`,
  `  logs: GameLogEntry[];
  pendingConsequences: PendingConsequence[];
  openShipIssues: number;`,
  'journey pending consequence input'
);

journey = replaceOnce(
  journey,
  `  const availableScene = input.storyScenes.find((scene) => scene.status === 'available');`,
  `  const availableScene = input.storyScenes.find((scene) => scene.status === 'available' && scene.category === 'consequence')
    ?? input.storyScenes.find((scene) => scene.status === 'available');`,
  'prioritize consequence scenes'
);

journey = replaceOnce(
  journey,
  `      eyebrow: availableScene.operationRequest ? 'НОВАЯ ОПЕРАЦИЯ' : 'ВХОДЯЩИЙ СИГНАЛ',`,
  `      eyebrow: availableScene.category === 'consequence' ? 'ПОСЛЕДСТВИЕ РЕШЕНИЯ' : availableScene.operationRequest ? 'НОВАЯ ОПЕРАЦИЯ' : 'ВХОДЯЩИЙ СИГНАЛ',`,
  'consequence focus label'
);

journey = replaceOnce(
  journey,
  `  const campaignThread = urgentThread`,
  `  const operationChain = activeOperation?.operation?.chain;
  const campaignThread = operationChain
    ? {
        title: activeOperation.title,
        summary: activeOperation.description,
        status: \`связанная линия · глава \${operationChain.stage}/\${operationChain.maxStages}\`,
        action: { kind: 'screen', screen: 'operations' } as JourneyAction
      }
    : urgentThread`,
  'living chain campaign thread'
);

journey = replaceOnce(
  journey,
  `    recentConsequences: input.logs.slice(0, 3)`,
  `    recentConsequences: input.pendingConsequences
      .filter((entry) => entry.status === 'resolved')
      .sort((a, b) => b.triggerYear - a.triggerYear)
      .slice(0, 3)
      .map((entry) => ({ id: entry.id, year: entry.triggerYear, title: entry.title, text: entry.text, tone: entry.tone }))`,
  'real recent consequences'
);

await write(journeyPath, journey);

/* Journey callers */
for (const path of ['src/screens/CommandDeckV35.tsx', 'src/screens/MobileCommandScreenV361.tsx']) {
  let source = await read(path);
  source = replaceOnce(
    source,
    `    logs: store.logs,
    openShipIssues: openIssues.length`,
    `    logs: store.logs,
    pendingConsequences: store.pendingConsequences,
    openShipIssues: openIssues.length`,
    `pending consequences caller ${path}`
  );
  await write(path, source);
}

/* Mobile operations chain labels */
const mobileOperationsPath = 'src/screens/MobileOperationsScreenV361.tsx';
let mobileOperations = await read(mobileOperationsPath);

mobileOperations = replaceOnce(
  mobileOperations,
  `<span>{operationLabels[request.category]} · СРОЧНОСТЬ {formatInteger(request.urgency)}</span>`,
  `<span>{request.chain ? \`ГЛАВА \${request.chain.stage}/\${request.chain.maxStages} · \` : ''}{operationLabels[request.category]} · СРОЧНОСТЬ {formatInteger(request.urgency)}</span>`,
  'request chain label'
);

mobileOperations = replaceOnce(
  mobileOperations,
  `<span>{objective.operation && operationLabels[objective.operation.category]} · {formatInteger(objective.progress)}%</span>`,
  `<span>{objective.operation?.chain ? \`ГЛАВА \${objective.operation.chain.stage}/\${objective.operation.chain.maxStages} · \` : ''}{objective.operation && operationLabels[objective.operation.category]} · {formatInteger(objective.progress)}%</span>`,
  'active chain label'
);

mobileOperations = replaceOnce(
  mobileOperations,
  `<span>{operationLabels[selectedRequest.operationRequest!.category]} · СРОЧНОСТЬ {formatInteger(selectedRequest.operationRequest!.urgency)}</span>`,
  `<span>{selectedRequest.operationRequest!.chain ? \`ГЛАВА \${selectedRequest.operationRequest!.chain!.stage}/\${selectedRequest.operationRequest!.chain!.maxStages} · \` : ''}{operationLabels[selectedRequest.operationRequest!.category]} · СРОЧНОСТЬ {formatInteger(selectedRequest.operationRequest!.urgency)}</span>`,
  'request dossier chain label'
);

mobileOperations = replaceOnce(
  mobileOperations,
  `<span>{operationLabels[operation.category]} · {formatInteger(selectedObjective.progress)}%</span>`,
  `<span>{operation.chain ? \`ГЛАВА \${operation.chain.stage}/\${operation.chain.maxStages} · \` : ''}{operationLabels[operation.category]} · {formatInteger(selectedObjective.progress)}%</span>`,
  'active dossier chain label'
);

await write(mobileOperationsPath, mobileOperations);

/* Version and package metadata */
const versionPath = 'src/version.ts';
let version = await read(versionPath);
version = version.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.37.0';");
version = version.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'LIVING_CONSEQUENCES';");
await write(versionPath, version);

for (const path of ['package.json', 'package-lock.json']) {
  const parsed = JSON.parse(await read(path));
  parsed.version = '0.37.0';
  if (path === 'package-lock.json' && parsed.packages?.['']) parsed.packages[''].version = '0.37.0';
  await write(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

/* README */
const readmePath = 'README.md';
let readme = await read(readmePath);
readme = readme.replace(/\*\*Current version:.*?\*\*/, '**Current version: v0.37.0 — Living Consequences**');
if (!readme.includes('## v0.37.0 Living Consequences')) {
  const anchor = '## v0.36.3 Tactical Mobile Polish';
  const section = `## v0.37.0 Living Consequences

- completed operations schedule delayed responses from the world;
- consequences become news, world events, faction memories and returning NPC messages;
- accepted follow-ups form deterministic chains of 2–4 linked operations;
- success can expose theft, disputed ownership, broken ceasefires or mutated threats;
- failure escalates shortages, blockades, evacuations and containment crises;
- the captain journal shows real resolved consequences instead of arbitrary recent logs;
- SAVE_SCHEMA_VERSION remains 13; new chain metadata is optional.

`;
  if (!readme.includes(anchor)) throw new Error('README v0.36.3 anchor not found');
  readme = readme.replace(anchor, `${section}${anchor}`);
}
await write(readmePath, readme);

console.log('v0.37.0 LIVING_CONSEQUENCES applied.');
