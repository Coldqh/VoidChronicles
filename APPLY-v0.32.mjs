import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const write = (path, value) => writeFileSync(path, value, 'utf8');

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`v0.32: missing extracted file ${path}`);
}

function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`v0.32: anchor not found: ${label}`);
  return source.replace(anchor, `${anchor}${addition}`);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v0.32: fragment not found: ${label}`);
  return source.replace(before, after);
}

function patchTypes() {
  const path = 'src/game/types.ts';
  let source = read(path);
  source = insertAfter(source, "export type ConsequenceStatus = 'pending' | 'resolved';", `

export type CaptainCareerPath = 'explorer' | 'archaeologist' | 'diplomat' | 'rescuer' | 'hunter' | 'smuggler' | 'scientist' | 'trader';
export interface CaptainCareerState {
  primary?: CaptainCareerPath;
  renown: Partial<Record<CaptainCareerPath, number>>;
  titles: string[];
  completedOperations: number;
}
export type OperationCategory = 'relief' | 'evacuation' | 'escort' | 'mediation' | 'investigation' | 'recovery' | 'containment';
export type OperationApproach = 'careful' | 'direct' | 'negotiate';
export type OperationOutcome = 'failed' | 'partial' | 'successful' | 'exceptional';
export type OperationStageKind = 'travel' | 'scan' | 'field' | 'delivery' | 'negotiation' | 'analysis' | 'report';
export type OperationStageStatus = 'locked' | 'active' | 'completed' | 'failed';
export interface OperationStage {
  id: string;
  kind: OperationStageKind;
  title: string;
  description: string;
  status: OperationStageStatus;
  progress: number;
  requiredProgress: number;
  systemId: string;
}
export interface OperationRequest {
  id: string;
  threadId: string;
  category: OperationCategory;
  title: string;
  summary: string;
  issuerName: string;
  issuerCivilizationId?: string;
  issuerFactionId?: string;
  targetSystemId: string;
  reward: number;
  deadlineYear: number;
  urgency: number;
  stages: OperationStage[];
}
export interface OperationState {
  requestId: string;
  threadId: string;
  category: OperationCategory;
  issuerName: string;
  issuerCivilizationId?: string;
  issuerFactionId?: string;
  reward: number;
  targetSystemId: string;
  stages: OperationStage[];
  currentStageIndex: number;
  quality: number;
  attempts: number;
  outcome?: OperationOutcome;
  completedYear?: number;
  log: string[];
}`, 'operation types');

  source = replaceOnce(source, "  commandIdentity: CommandIdentity;\n}", "  commandIdentity: CommandIdentity;\n  career?: CaptainCareerState;\n}", 'captain career');
  source = replaceOnce(source, "  resolvedChoiceId?: string;\n}", "  resolvedChoiceId?: string;\n  operationRequest?: OperationRequest;\n}", 'story operation request');
  source = replaceOnce(source, "  sourceSceneId?: string;\n  progress: number;\n}", "  sourceSceneId?: string;\n  progress: number;\n  operation?: OperationState;\n}", 'objective operation state');
  write(path, source);
}

function patchSnapshot() {
  const path = 'src/persistence/snapshot.ts';
  let source = read(path);
  source = insertAfter(source, "const finiteNumber = z.number().finite();", `
const captainCareerPathSchema = z.enum(['explorer','archaeologist','diplomat','rescuer','hunter','smuggler','scientist','trader']);
const captainCareerSchema = z.object({
  primary: captainCareerPathSchema.optional(),
  renown: z.record(captainCareerPathSchema, finiteNumber).default({}),
  titles: z.array(z.string()).default([]),
  completedOperations: finiteNumber.default(0)
});`, 'captain career schema');
  source = replaceOnce(source, "  commandIdentity: z.preprocess(() => 'organic', z.literal('organic'))\n});", "  commandIdentity: z.preprocess(() => 'organic', z.literal('organic')),\n  career: captainCareerSchema.optional()\n});", 'captain career persistence');

  source = insertAfter(source, "const locationStateSchema = z.object({\n  pointOfInterestId: z.string(), visitCount: finiteNumber, enemyStates: z.array(locationEnemySchema), resolvedObjectIds: z.array(z.string()),\n  collectedEvidenceKeys: z.array(z.string()), revealedTileKeys: z.array(z.string()), artifactTaken: z.boolean(),\n  lastOutcome: z.enum(['evacuated','resolved','failed']), lastVisitedYear: finiteNumber\n});", `
const operationStageSchema = z.object({
  id: z.string(), kind: z.enum(['travel','scan','field','delivery','negotiation','analysis','report']),
  title: z.string(), description: z.string(), status: z.enum(['locked','active','completed','failed']),
  progress: finiteNumber, requiredProgress: finiteNumber, systemId: z.string()
});
const operationRequestSchema = z.object({
  id: z.string(), threadId: z.string(), category: z.enum(['relief','evacuation','escort','mediation','investigation','recovery','containment']),
  title: z.string(), summary: z.string(), issuerName: z.string(), issuerCivilizationId: z.string().optional(), issuerFactionId: z.string().optional(),
  targetSystemId: z.string(), reward: finiteNumber, deadlineYear: finiteNumber, urgency: finiteNumber, stages: z.array(operationStageSchema)
});
const operationStateSchema = z.object({
  requestId: z.string(), threadId: z.string(), category: z.enum(['relief','evacuation','escort','mediation','investigation','recovery','containment']),
  issuerName: z.string(), issuerCivilizationId: z.string().optional(), issuerFactionId: z.string().optional(), reward: finiteNumber,
  targetSystemId: z.string(), stages: z.array(operationStageSchema), currentStageIndex: finiteNumber, quality: finiteNumber, attempts: finiteNumber,
  outcome: z.enum(['failed','partial','successful','exceptional']).optional(), completedYear: finiteNumber.optional(), log: z.array(z.string())
});`, 'operation schemas');

  source = replaceOnce(source, "  choices: z.array(storyChoiceSchema), resolvedChoiceId: z.string().optional()\n});", "  choices: z.array(storyChoiceSchema), resolvedChoiceId: z.string().optional(), operationRequest: operationRequestSchema.optional()\n});", 'story request persistence');
  source = replaceOnce(source, "  createdYear: finiteNumber, deadlineYear: finiteNumber.optional(), systemId: z.string().optional(), hubId: z.string().optional(), sourceSceneId: z.string().optional(), progress: finiteNumber\n});", "  createdYear: finiteNumber, deadlineYear: finiteNumber.optional(), systemId: z.string().optional(), hubId: z.string().optional(), sourceSceneId: z.string().optional(), progress: finiteNumber,\n  operation: operationStateSchema.optional()\n});", 'objective operation persistence');

  if (!source.includes('const expeditionObjectiveSchema = z.object({')) {
    source = source.replace("const pointOfInterestSchema = z.object({", `const expeditionObjectiveSchema = z.object({
  kind: z.enum(['recover-artifact','restore-archive','determine-cause','recover-black-box','rescue-survivors','collect-sample','disable-system','document-site','establish-contact','investigate-anomaly']),
  title: z.string(), description: z.string(), requiredObjects: finiteNumber, requiredEvidence: finiteNumber,
  requiresArtifact: z.boolean().optional(), completionText: z.string()
});
const pointOfInterestSchema = z.object({`);
  }
  source = replaceOnce(source, "  access: z.enum(['surface','orbital','remote']).default('surface')\n});", "  access: z.enum(['surface','orbital','remote']).default('surface'), confirmedSummary: z.string().optional(), completionSummary: z.string().optional(),\n  sourceEventIds: z.array(z.string()).optional(), historicalSettlementId: z.string().optional(), ruinId: z.string().optional(), warId: z.string().optional(),\n  artifactIds: z.array(z.string()).optional(), figureIds: z.array(z.string()).optional(), polityIds: z.array(z.string()).optional(), archiveId: z.string().optional(),\n  loreTags: z.array(z.string()).optional(), objective: expeditionObjectiveSchema.optional()\n});", 'lorebound POI persistence');
  write(path, source);
}

function patchStore() {
  const path = 'src/game/store.ts';
  let source = read(path);
  source = insertAfter(source, "  NewsItem,", "\n  OperationApproach,", 'operation approach import');
  source = insertAfter(source, "import { projectContractsFromEvents, projectNewsFromEvents, projectWorldThreads } from '../simulation/projections';", "\nimport { applyCaptainCareer, createOperationObjective, projectOperationRequests, resolveOperationStep } from '../operations/runtime';", 'operations runtime import');
  source = insertAfter(source, "  attemptFirstContact(civilizationId: string): Promise<{ ok: boolean; message: string }>;", "\n  advanceOperation(objectiveId: string, approach: OperationApproach): Promise<{ ok: boolean; message: string }>;", 'operation store method');
  source = replaceOnce(source, "  commandIdentity: 'organic'\n});", "  commandIdentity: 'organic',\n  career: { renown: {}, titles: [], completedOperations: 0 }\n});", 'initial captain career');

  if (!source.includes('projectOperationRequests({')) {
    source = replaceOnce(source,
      "  const worldThreads = projectWorldThreads({ simulation: advanced.simulation, warFronts, factions, contracts, research: researchProjects });\n  const consequences = processDueConsequences(state.pendingConsequences, nextYear);",
      "  const worldThreads = projectWorldThreads({ simulation: advanced.simulation, warFronts, factions, contracts, research: researchProjects });\n  const datedScenes = state.storyScenes.map((scene) => scene.status === 'available' && scene.expiresYear !== undefined && scene.expiresYear < nextYear ? { ...scene, status: 'expired' as const } : scene);\n  const storyScenes = projectOperationRequests({ threads: worldThreads, contacts: state.civilizationContacts, civilizations: galaxy.civilizations, factions, existingScenes: datedScenes, year: nextYear });\n  const consequences = processDueConsequences(state.pendingConsequences, nextYear);",
      'operation request projection');
  }
  source = replaceOnce(source,
    "      storyScenes: state.storyScenes.map((scene) => scene.status === 'available' && scene.expiresYear !== undefined && scene.expiresYear < nextYear ? { ...scene, status: 'expired' as const } : scene),",
    "      storyScenes,",
    'projected request scenes');

  if (!source.includes("scene.operationRequest && choice.id === 'accept-operation'")) {
    const objectivePattern = /      const objective = choice\.effect\.objectiveTitle \? \{[\s\S]*?      \} : null;\n/;
    const match = source.match(objectivePattern);
    if (!match) throw new Error('v0.32: objective creation block not found');
    const replacement = `      const operationObjective = scene.operationRequest && choice.id === 'accept-operation'\n        ? createOperationObjective(scene.operationRequest, get().gameYear)\n        : null;\n      const objective = operationObjective ?? (choice.effect.objectiveTitle ? {\n        id: \`objective_\${scene.id}_\${choice.id}\`,\n        title: choice.effect.objectiveTitle,\n        description: choice.effect.objectiveDescription ?? scene.summary,\n        kind: 'story' as const,\n        status: 'active' as const,\n        createdYear: get().gameYear,\n        systemId: choice.effect.objectiveSystemId ?? scene.systemId,\n        sourceSceneId: scene.id,\n        progress: 0\n      } : null);\n`;
    source = source.replace(objectivePattern, replacement);
  }

  if (!source.includes("async advanceOperation(objectiveId, approach)")) {
    const anchor = "  async interactWithNpc(npcId, kind) {";
    if (!source.includes(anchor)) throw new Error('v0.32: NPC interaction anchor not found');
    source = source.replace(anchor, `${OPERATION_METHOD}\n${anchor}`);
  }
  write(path, source);
}

function patchApp() {
  const path = 'src/App.tsx';
  let source = read(path);
  source = insertAfter(source, "const OperationsScreen = lazy(() => import('./screens/OperationsScreen').then((module) => ({ default: module.OperationsScreen })));", "\nconst ContactsScreen = lazy(() => import('./screens/ContactsScreen').then((module) => ({ default: module.ContactsScreen })));", 'contacts screen import');
  source = insertAfter(source, "import './styles/mobileGameplay.css';", "\nimport './styles/playerOperationsV32.css';", 'v0.32 styles');
  source = source.replace("{ id: 'civilizations', label: 'Цивилизации', icon: '⌬' },", "{ id: 'civilizations', label: 'Контакты', icon: '⌬' },");
  source = source.replace("else if (screen === 'civilizations') content = <CivilizationsScreen/>;", "else if (screen === 'civilizations') content = <ContactsScreen chrome={<AppChrome/>}/>;");
  write(path, source);
}

function patchVersion() {
  const path = 'src/version.ts';
  let source = read(path);
  source = source.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.32.0';");
  source = source.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'PLAYER_LIFE_OPERATIONS';");
  write(path, source);
}

[
  'src/operations/runtime.ts',
  'src/screens/OperationsScreen.tsx',
  'src/screens/ContactsScreen.tsx',
  'src/diplomacy/model.ts',
  'src/diplomacy/runtime.ts',
  'src/ui/format.ts',
  'src/styles/playerOperationsV32.css'
].forEach(requireFile);

const OPERATION_METHOD = "\nasync advanceOperation(objectiveId, approach) {\n  return runExclusive('operation-step', set, get, async () => {\n    const state = get();\n    const objective = state.objectives.find((entry) => entry.id === objectiveId && entry.status === 'active' && entry.operation);\n    const captain = state.captain;\n    const galaxy = state.galaxy;\n    const simulationState = state.simulation;\n    if (!objective || !captain || !galaxy || !simulationState || !state.currentSystemId) {\n      return { ok: false, message: '\u0410\u043a\u0442\u0438\u0432\u043d\u0430\u044f \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430' };\n    }\n    const currentSystem = galaxy.systems.find((entry) => entry.id === state.currentSystemId);\n    const operation = objective.operation!;\n    const contactTrust = operation.issuerCivilizationId\n      ? state.civilizationContacts.find((entry) => entry.civilizationId === operation.issuerCivilizationId)?.trust ?? 0\n      : 0;\n    const result = resolveOperationStep({\n      objective,\n      approach,\n      seed: galaxy.seed,\n      currentSystemId: state.currentSystemId,\n      currentSystemScanned: Boolean(currentSystem?.scanned),\n      captain,\n      crew: state.crew,\n      contactTrust,\n      absoluteHour: simulationState.clock.absoluteHour\n    });\n    if (!result.ok) return { ok: false, message: result.message };\n\n    const advanced = buildWorldAdvance(state, result.hours, `operation:${objective.id}:${approach}`);\n    let simulation = (advanced.patch.simulation as SimulationState | undefined) ?? simulationState;\n    let warFronts = (advanced.patch.warFronts as WarFront[] | undefined) ?? state.warFronts;\n    let worldThreads = (advanced.patch.worldThreads as WorldThread[] | undefined) ?? state.worldThreads;\n    const outcomeStrength = result.outcome === 'exceptional' ? 12 : result.outcome === 'successful' ? 8 : result.outcome === 'partial' ? 4 : result.outcome === 'failed' ? -3 : 0;\n\n    if (result.completed) {\n      if (operation.category === 'relief') {\n        simulation = adjustSystemEconomy(simulation, operation.targetSystemId, { supply: outcomeStrength, prosperity: Math.round(outcomeStrength / 2), migrationPressure: -Math.max(0, Math.round(outcomeStrength / 2)) });\n      } else if (operation.category === 'evacuation') {\n        simulation = adjustSystemEconomy(simulation, operation.targetSystemId, { security: Math.round(outcomeStrength / 2), migrationPressure: -outcomeStrength, supply: Math.round(outcomeStrength / 3) });\n      } else if (operation.category === 'escort') {\n        simulation = adjustSystemEconomy(simulation, operation.targetSystemId, { security: outcomeStrength, tradePressure: outcomeStrength, supply: Math.round(outcomeStrength / 2) });\n      } else if (operation.category === 'mediation') {\n        simulation = adjustSystemEconomy(simulation, operation.targetSystemId, { security: outcomeStrength, migrationPressure: -Math.max(0, outcomeStrength) });\n        if (operation.issuerFactionId) {\n          warFronts = warFronts.map((front) => front.attackerFactionId === operation.issuerFactionId || front.defenderFactionId === operation.issuerFactionId\n            ? { ...front, intensity: Math.max(0, Math.round(front.intensity - Math.max(0, outcomeStrength))), status: front.intensity <= Math.max(0, outcomeStrength) ? 'ceasefire' as const : front.status, lastUpdateYear: state.gameYear }\n            : front);\n        }\n      } else if (operation.category === 'containment') {\n        const targetSystem = galaxy.systems.find((entry) => entry.id === operation.targetSystemId);\n        const planet = targetSystem?.planets.find((entry) => simulation.ecosystems[entry.id]);\n        if (planet) simulation = adjustEcosystem(simulation, planet.id, { contamination: -Math.max(0, outcomeStrength), resilience: Math.max(0, Math.round(outcomeStrength / 2)), biodiversity: Math.max(0, Math.round(outcomeStrength / 3)) });\n      } else if (operation.issuerCivilizationId) {\n        const civilizationState = simulation.civilizations[operation.issuerCivilizationId];\n        if (civilizationState) simulation = {\n          ...simulation,\n          civilizations: {\n            ...simulation.civilizations,\n            [operation.issuerCivilizationId]: {\n              ...civilizationState,\n              research: Math.max(0, Math.min(100, Math.round(civilizationState.research + Math.max(0, outcomeStrength)))),\n              stability: Math.max(0, Math.min(100, Math.round(civilizationState.stability + Math.round(outcomeStrength / 3))))\n            }\n          }\n        };\n      }\n\n      const recorded = recordWorldEvent(simulation, {\n        kind: operation.category === 'containment' ? 'ecology' : operation.category === 'mediation' ? 'politics' : operation.category === 'investigation' || operation.category === 'recovery' ? 'discovery' : 'economy',\n        title: `${objective.title}: ${result.outcome}`,\n        summary: result.message,\n        severity: result.outcome === 'failed' ? 7 : result.outcome === 'partial' ? 4 : 5,\n        visibility: 'public',\n        systemIds: [operation.targetSystemId],\n        civilizationIds: operation.issuerCivilizationId ? [operation.issuerCivilizationId] : [],\n        factionIds: operation.issuerFactionId ? [operation.issuerFactionId] : [],\n        tags: ['player-operation', operation.category, result.outcome ?? 'unknown'],\n        data: { operationId: objective.id, operationOutcome: result.outcome ?? 'unknown', operationQuality: result.objective.operation?.quality ?? 0 }\n      });\n      simulation = recorded.simulation;\n      worldThreads = worldThreads.map((thread) => thread.id === operation.threadId ? {\n        ...thread,\n        playerInvolved: true,\n        status: result.outcome === 'failed' ? 'escalating' as const : 'resolved' as const,\n        progress: result.outcome === 'failed' ? Math.max(0, thread.progress - 8) : 100,\n        urgency: result.outcome === 'failed' ? Math.min(100, thread.urgency + 8) : Math.max(0, thread.urgency - outcomeStrength),\n        updates: [{ id: `operation_update_${recorded.event.id}`, year: state.gameYear, text: result.message, tone: result.outcome === 'failed' ? 'danger' as const : result.outcome === 'partial' ? 'warning' as const : 'good' as const }, ...thread.updates].slice(0, 24)\n      } : thread);\n    }\n\n    const captainAfterCosts = {\n      ...captain,\n      credits: Math.max(0, captain.credits - result.creditsCost + result.reward),\n      health: Math.max(1, captain.health - result.healthLoss),\n      reputation: captain.reputation + result.reputation\n    };\n    const nextCaptain = applyCaptainCareer(captainAfterCosts, result.career, result.careerGain, result.completed);\n    const factions = operation.issuerFactionId && result.completed\n      ? adjustFactionStanding(state.factions, operation.issuerFactionId, state.gameYear, `operation-${operation.category}`, result.reputation, result.message)\n      : state.factions;\n    const objectives = state.objectives.map((entry) => entry.id === objective.id ? result.objective : entry);\n    const baseLogs = (advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs;\n\n    set({\n      ...advanced.patch,\n      simulation,\n      warFronts,\n      worldThreads,\n      captain: nextCaptain,\n      factions,\n      objectives,\n      logs: [makeLog(state.gameYear, objective.title, result.message, result.outcome === 'failed' ? 'danger' : result.completed ? 'good' : 'info'), ...baseLogs].slice(0, 750)\n    });\n    await persist(set, get, `operation-${objective.id}-${approach}`, { immediate: result.completed });\n    return { ok: true, message: result.message };\n  }, { ok: false, message: '\u0414\u0440\u0443\u0433\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0435\u0449\u0451 \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u0435\u0442\u0441\u044f' });\n},";

patchTypes();
patchSnapshot();
patchStore();
patchApp();
patchVersion();
console.log('Void Chronicles v0.32 installed: player career, incoming requests and multi-stage world operations.');
