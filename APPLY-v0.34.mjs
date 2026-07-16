import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => writeFileSync(path, content, 'utf8');

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`v0.34: missing extracted file ${path}`);
}
function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`v0.34: anchor not found: ${label}`);
  return source.replace(anchor, `${anchor}${addition}`);
}
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v0.34: fragment not found: ${label}`);
  return source.replace(before, after);
}
function replaceBlock(source, start, end, replacement, label) {
  if (replacement.trim() && source.includes(replacement.trim())) return source;
  const from = source.indexOf(start);
  if (from < 0 && !replacement.trim()) return source;
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`v0.34: block not found: ${label}`);
  return `${source.slice(0, from)}${replacement}${source.slice(to)}`;
}

function patchTypes() {
  const path = 'src/game/types.ts';
  let source = read(path);
  source = insertAfter(source,
`export interface OperationState {
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
}`,
`
export type GalacticRouteKind = 'standard' | 'trade' | 'military' | 'smuggler' | 'ancient' | 'quarantine';
export type RoutePreference = 'fast' | 'safe' | 'economical' | 'covert';
export type GalacticSectorKind = 'core' | 'inner' | 'rim' | 'void';
export interface GalacticSector {
  id: string;
  name: string;
  kind: GalacticSectorKind;
  systemIds: string[];
  controllingCivilizationId?: string;
  danger: number;
  contested: boolean;
  traits: string[];
}
export interface GalacticRouteLeg {
  id: string;
  fromSystemId: string;
  toSystemId: string;
  kind: GalacticRouteKind;
  distance: number;
  fuelCost: number;
  hours: number;
  risk: number;
  access: 'open' | 'restricted' | 'blocked';
  controllingCivilizationId?: string;
  controllingFactionId?: string;
  tradeRouteId?: string;
  warFrontId?: string;
  restriction?: string;
  label: string;
}
export interface GalacticRoutePlan {
  id: string;
  preference: RoutePreference;
  destinationSystemId: string;
  systemIds: string[];
  legs: GalacticRouteLeg[];
  currentLegIndex: number;
  totalFuel: number;
  totalHours: number;
  totalRisk: number;
  foodCost: number;
  oxygenCost: number;
  warnings: string[];
  createdYear: number;
  status: 'active' | 'completed' | 'abandoned';
}
export interface RouteHistoryEntry {
  id: string;
  fromSystemId: string;
  toSystemId: string;
  year: number;
  routeKind: GalacticRouteKind;
  risk: number;
  incident?: string;
}
export interface NavigationState {
  activePlan?: GalacticRoutePlan;
  history: RouteHistoryEntry[];
  knownSectorIds: string[];
}`, 'navigation types');

  source = replaceOnce(source,
`  objectives: PlayerObjective[];
  tutorial: TutorialState;`,
`  objectives: PlayerObjective[];
  navigation: NavigationState;
  tutorial: TutorialState;`, 'snapshot navigation field');
  write(path, source);
}

function patchSnapshot() {
  const path = 'src/persistence/snapshot.ts';
  let source = read(path);
  source = insertAfter(source,
"import { createShipLifeState } from '../ship/life';",
"\nimport { createNavigationState, normalizeNavigationState } from '../navigation/geography';", 'navigation snapshot import');

  source = insertAfter(source,
`const operationStateSchema = z.object({
  requestId: z.string(), threadId: z.string(), category: z.enum(['relief','evacuation','escort','mediation','investigation','recovery','containment']),
  issuerName: z.string(), issuerCivilizationId: z.string().optional(), issuerFactionId: z.string().optional(), reward: finiteNumber,
  targetSystemId: z.string(), stages: z.array(operationStageSchema), currentStageIndex: finiteNumber, quality: finiteNumber, attempts: finiteNumber,
  outcome: z.enum(['failed','partial','successful','exceptional']).optional(), completedYear: finiteNumber.optional(), log: z.array(z.string())
});`,
`
const galacticRouteKindSchema = z.enum(['standard','trade','military','smuggler','ancient','quarantine']);
const routePreferenceSchema = z.enum(['fast','safe','economical','covert']);
const galacticRouteLegSchema = z.object({
  id: z.string(), fromSystemId: z.string(), toSystemId: z.string(), kind: galacticRouteKindSchema,
  distance: finiteNumber, fuelCost: finiteNumber, hours: finiteNumber, risk: finiteNumber,
  access: z.enum(['open','restricted','blocked']), controllingCivilizationId: z.string().optional(), controllingFactionId: z.string().optional(),
  tradeRouteId: z.string().optional(), warFrontId: z.string().optional(), restriction: z.string().optional(), label: z.string()
});
const galacticRoutePlanSchema = z.object({
  id: z.string(), preference: routePreferenceSchema, destinationSystemId: z.string(), systemIds: z.array(z.string()),
  legs: z.array(galacticRouteLegSchema), currentLegIndex: finiteNumber, totalFuel: finiteNumber, totalHours: finiteNumber,
  totalRisk: finiteNumber, foodCost: finiteNumber, oxygenCost: finiteNumber, warnings: z.array(z.string()), createdYear: finiteNumber,
  status: z.enum(['active','completed','abandoned'])
});
const navigationStateSchema = z.object({
  activePlan: galacticRoutePlanSchema.optional(),
  history: z.array(z.object({ id: z.string(), fromSystemId: z.string(), toSystemId: z.string(), year: finiteNumber, routeKind: galacticRouteKindSchema, risk: finiteNumber, incident: z.string().optional() })),
  knownSectorIds: z.array(z.string())
});`, 'navigation schemas');

  source = replaceOnce(source,
"const v13PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateV3Schema, knowledge: playerKnowledgeSchema });",
"const v13PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateV3Schema, knowledge: playerKnowledgeSchema, navigation: navigationStateSchema.default(createNavigationState()) });", 'navigation persistence');

  source = replaceOnce(source,
`    objectives: snapshot.objectives.filter((objective) => !objective.systemId || systemIds.has(objective.systemId)).slice(0, 250),
    tutorial:`,
`    objectives: snapshot.objectives.filter((objective) => !objective.systemId || systemIds.has(objective.systemId)).slice(0, 250),
    navigation: normalizeNavigationState(snapshot.navigation),
    tutorial:`, 'navigation normalization');
  write(path, source);
}

const travelMethod = `  async travelTo(systemId) {
    return runExclusive('travel', set, get, async () => {
      const state = get();
      const { galaxy, ship, currentSystemId } = state;
      if (!galaxy || !ship || !currentSystemId || !state.simulation) return { ok: false, message: 'Нет активной партии' };
      if (state.activeShipEncounter && state.activeShipEncounter.phase !== 'resolved') return { ok: false, message: 'Сначала завершите корабельный контакт' };
      const current = galaxy.systems.find((system) => system.id === currentSystemId);
      const target = galaxy.systems.find((system) => system.id === systemId);
      if (!current || !target) return { ok: false, message: 'Система не найдена' };
      if (!current.neighbors.includes(target.id)) return { ok: false, message: 'Нет прямого маршрута' };
      const geography = buildGalacticGeography({ galaxy, simulation: state.simulation, warFronts: state.warFronts, factions: state.factions, contacts: state.civilizationContacts });
      const route = routeBetween(geography, current.id, target.id);
      if (!route) return { ok: false, message: 'Навигационный коридор не подтверждён' };
      if (route.distance > ship.jumpRange) return { ok: false, message: 'Маршрут за пределами дальности двигателя' };
      if (route.access === 'blocked') return { ok: false, message: route.restriction ?? 'Маршрут перекрыт' };
      const engine = ship.systems.find((entry) => entry.id === 'engine');
      if (engine?.disabled) return { ok: false, message: 'Двигатель отключён' };
      const fuelCost = route.fuelCost;
      if (ship.fuel < fuelCost) return { ok: false, message: \`Нужно \${fuelCost} топлива\` };
      if (ship.hull <= 0) return { ok: false, message: 'Корабль не способен к прыжку' };

      const arrivalHour = state.simulation.clock.absoluteHour + route.hours;
      let knowledge = revealKnowledge(state.knowledge, 'system', target.id, ['identity', 'coordinates', 'star', 'routes', 'visited'], arrivalHour, 'direct', 92);
      for (const neighborId of target.neighbors) knowledge = revealKnowledge(knowledge, 'system', neighborId, ['identity', 'coordinates'], arrivalHour, 'scan', 42);
      const updatedShip = { ...ship, systems: normalizeShipSystems(ship.systems), fuel: ship.fuel - fuelCost };
      const advanced = buildWorldAdvance(state, route.hours, \`travel:\${current.id}:\${target.id}:\${route.kind}\`, { galaxy, knowledge, currentSystemId: target.id });
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const warFronts = advanced.patch.warFronts ?? state.warFronts;
      const incident = resolveRouteIncident({ seed: galaxy.seed, route, ship: updatedShip, serial: state.navigation.history.length + state.logs.length });
      const advancedShip = (advanced.patch.ship as Ship | undefined) ?? updatedShip;
      const nextShip = {
        ...advancedShip,
        fuel: updatedShip.fuel,
        systems: updatedShip.systems,
        hull: Math.max(1, advancedShip.hull - incident.hullDamage),
        statuses: incident.kind === 'anomaly' || incident.kind === 'debris' ? Array.from(new Set([...advancedShip.statuses, incident.title.toLowerCase()])) : advancedShip.statuses
      };
      const advancedCrew = (advanced.patch.crew as CrewMember[] | undefined) ?? state.crew;
      const nextCrew = incident.stress > 0 ? advancedCrew.map((member) => member.status === 'active' ? { ...member, stress: Math.max(0, Math.min(100, Math.round((member.stress ?? 0) + incident.stress))) } : member) : advancedCrew;
      const nextCaptain = state.captain && incident.reputation ? { ...state.captain, reputation: state.captain.reputation + incident.reputation } : state.captain;
      let activeShipEncounter = createTravelEncounter({
        seed: galaxy.seed,
        system: target,
        factions: state.factions,
        pursuits: state.pursuits,
        warFronts,
        year: nextYear,
        serial: state.logs.length + state.storyScenes.length + (advanced.patch.simulation?.nextSequence ?? 0)
      });
      if (activeShipEncounter) activeShipEncounter = { ...activeShipEncounter, stationAssignments: buildStationAssignments(nextCrew) };
      const encounter = activeShipEncounter ? 'shipContact' as const : undefined;
      const targetFaction = state.factions.find((entry) => entry.id === target.factionId);
      const hasCivilianHub = state.hubs.some((hub) => hub.systemId === target.id && hub.safety !== 'danger');
      const logs = [makeLog(nextYear, 'Прыжок завершён', \`\${current.name} → \${target.name}. \${route.label}, топливо -\${fuelCost}, риск \${route.risk}.\`, route.access === 'restricted' ? 'warning' : 'info'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)];
      if (incident.kind !== 'quiet') logs.unshift(makeLog(nextYear, incident.title, incident.summary, incident.hullDamage > 0 || incident.kind === 'blockade' ? 'warning' : 'info'));
      if (activeShipEncounter) logs.unshift(makeLog(nextYear, 'Корабельный контакт', \`\${activeShipEncounter.contact.name}: \${activeShipEncounter.contact.demand}\`, activeShipEncounter.contact.hostile ? 'danger' : 'warning'));
      else if (targetFaction?.disposition === 'friendly' || hasCivilianHub) logs.unshift(makeLog(nextYear, 'Гражданский контроль', 'Диспетчер передал коридор движения и список открытых портов.', 'good'));
      const generatedScene = activeShipEncounter ? null : generateTravelScene(galaxy.seed, current.id, target.id, target.name, nextYear, state.hubs, state.factions);
      const storyScenes = [...(generatedScene ? [generatedScene] : []), ...((advanced.patch.storyScenes as StoryScene[] | undefined) ?? state.storyScenes)].slice(0, 160);
      const pursuits = state.pursuits.map((entry) => entry.status === 'active' && (entry.knownIdentity || entry.knownTransponder) ? { ...entry, lastKnownSystemId: target.id, lastUpdateYear: nextYear } : entry);
      const targetSector = geography.sectors.find((entry) => entry.systemIds.includes(target.id));
      const navigation = advanceNavigationPlan({ navigation: state.navigation, fromSystemId: current.id, arrivedSystemId: target.id, year: nextYear, route, incident });
      if (targetSector && !navigation.knownSectorIds.includes(targetSector.id)) navigation.knownSectorIds.push(targetSector.id);
      set({
        ...advanced.patch,
        knowledge,
        ship: nextShip,
        crew: nextCrew,
        captain: nextCaptain,
        navigation,
        currentSystemId: target.id,
        selectedSystemId: target.id,
        currentHubId: null,
        logs: logs.slice(0, 750),
        storyScenes,
        activeStorySceneId: generatedScene?.id ?? null,
        activeShipEncounter,
        pursuits
      });
      await persist(set, get, activeShipEncounter ? 'travel-contact' : 'travel');
      return { ok: true, message: activeShipEncounter ? 'Перелёт завершён. Обнаружен корабельный контакт.' : incident.kind === 'quiet' ? 'Перелёт завершён' : \`Перелёт завершён: \${incident.title}\`, encounter };
    }, { ok: false, message: 'Другое действие ещё выполняется' });
  },
`;

function patchStore() {
  const path = 'src/game/store.ts';
  let source = read(path);
  source = insertAfter(source, '  GameStateSnapshot,', '\n  GalacticRoutePlan,', 'route plan type import');
  source = insertAfter(source, '  NewsItem,', '\n  NavigationState,', 'navigation state type import');
  source = insertAfter(source,
"import { advanceShipLife, createShipLifeState, normalizeShipLife, repairCompartment as repairShipCompartment, resolveCrewIssue as resolveShipCrewIssue, resolvePersonalArc, restCrew as restShipCrew } from '../ship/life';",
"\nimport { advanceNavigationPlan, buildGalacticGeography, createNavigationState, normalizeNavigationState, resolveRouteIncident, routeBetween } from '../navigation/geography';", 'navigation store import');

  source = insertAfter(source, '  legacy: LegacyState;', '\n  navigation: NavigationState;', 'navigation store field');
  source = insertAfter(source, '  selectSystem(id: string | null): void;', '\n  setNavigationPlan(plan: GalacticRoutePlan): void;\n  clearNavigationPlan(): void;', 'navigation store methods');
  source = replaceOnce(source, "  legacy: emptyLegacyState(),\n  generationActive:", "  legacy: emptyLegacyState(),\n  navigation: createNavigationState(),\n  generationActive:", 'initial navigation');
  source = insertAfter(source, '  selectSystem(selectedSystemId) { set({ selectedSystemId }); },', `
  setNavigationPlan(plan) {
    set({ navigation: { ...normalizeNavigationState(get().navigation), activePlan: { ...plan, status: 'active', currentLegIndex: 0 } } });
    void persist(set, get, 'navigation-plan');
  },
  clearNavigationPlan() {
    const navigation = normalizeNavigationState(get().navigation);
    set({ navigation: { ...navigation, activePlan: navigation.activePlan ? { ...navigation.activePlan, status: 'abandoned' } : undefined } });
    void persist(set, get, 'navigation-clear');
  },`, 'navigation actions');

  source = replaceBlock(source, '  async travelTo(systemId) {', '  async assignCombatStation(', travelMethod, 'travel geography integration');

  source = replaceOnce(source, '          legacy: safe.legacy,\n          saveMeta:', '          legacy: safe.legacy,\n          navigation: normalizeNavigationState(safe.navigation),\n          saveMeta:', 'hydrate navigation');
  source = replaceOnce(source, '        warFronts,\n        legacy: createInitialLegacy', '        warFronts,\n        navigation: createNavigationState(),\n        legacy: createInitialLegacy', 'new game navigation');
  source = replaceOnce(source, 'activeShipEncounter: null, pursuits: [], warFronts: [], legacy: emptyLegacyState(),', 'activeShipEncounter: null, pursuits: [], warFronts: [], navigation: createNavigationState(), legacy: emptyLegacyState(),', 'clear navigation');
  source = replaceOnce(source, '        legacy: safe.legacy,\n        saveMeta:', '        legacy: safe.legacy,\n        navigation: normalizeNavigationState(safe.navigation),\n        saveMeta:', 'restore navigation');
  source = replaceOnce(source,
'      scanReports, pointsOfInterest, evidence, hypotheses, artifactKnowledge, crew, crewCandidates, factions, hubs, contracts, news, locationStates, currentHubId, localNpcs, civilizationContacts, archaeologyChains, researchProjects, technologyBlueprints, equipmentInventory, worldThreads, storyScenes, pendingConsequences, objectives, tutorial, activeShipEncounter, pursuits, warFronts, legacy',
'      scanReports, pointsOfInterest, evidence, hypotheses, artifactKnowledge, crew, crewCandidates, factions, hubs, contracts, news, locationStates, currentHubId, localNpcs, civilizationContacts, archaeologyChains, researchProjects, technologyBlueprints, equipmentInventory, worldThreads, storyScenes, pendingConsequences, objectives, navigation, tutorial, activeShipEncounter, pursuits, warFronts, legacy', 'snapshot destructure navigation');
  source = replaceOnce(source, '      objectives,\n      tutorial,', '      objectives,\n      navigation,\n      tutorial,', 'snapshot navigation output');
  write(path, source);
}

function patchApp() {
  const path = 'src/App.tsx';
  let source = read(path);
  source = insertAfter(source,
"const ContactsScreen = lazy(() => import('./screens/ContactsScreen').then((module) => ({ default: module.ContactsScreen })));",
"\nconst GalaxyScreenV34 = lazy(() => import('./screens/GalaxyScreen').then((module) => ({ default: module.GalaxyScreen })));", 'galaxy screen import');
  source = insertAfter(source, "import './styles/shipCrewLife.css';", "\nimport './styles/galacticGeography.css';", 'geography styles');
  source = replaceBlock(source, 'function GalaxyScreen() {', 'function artifactForPoint(', '', 'legacy galaxy screen');
  source = replaceOnce(source, "else if (screen === 'galaxy') content = <GalaxyScreen/>;", "else if (screen === 'galaxy') content = <GalaxyScreenV34 chrome={<AppChrome/>}/>;", 'galaxy screen route');
  source = source.replace("import { GalaxyCanvas, type GalaxyCanvasHandle } from './components/GalaxyCanvas';\n", '');
  write(path, source);
}

function patchGalaxyCanvas() {
  const path = 'src/components/GalaxyCanvas.tsx';
  let source = read(path);
  source = replaceOnce(source, "import type { StarSystem } from '../game/types';", "import type { GalacticRouteKind, StarSystem } from '../game/types';", 'galaxy canvas route type import');
  source = insertAfter(source, '  livingCivilizationIds?: string[];', "\n  routeVisuals?: Array<{ fromSystemId: string; toSystemId: string; kind: GalacticRouteKind; planned: boolean }>;", 'route visuals prop');
  source = replaceOnce(source, '{ systems, currentSystemId, selectedSystemId, jumpRange, livingCivilizationIds = [], onSelect },', '{ systems, currentSystemId, selectedSystemId, jumpRange, livingCivilizationIds = [], routeVisuals = [], onSelect },', 'route visuals destructure');
  source = insertAfter(source,
'  const livingCivilizations = useMemo(() => new Set(livingCivilizationIds), [livingCivilizationIds]);',
`\n  const routeVisualIndex = useMemo(() => new Map(routeVisuals.map((visual) => [visual.fromSystemId < visual.toSystemId ? \`\${visual.fromSystemId}::\${visual.toSystemId}\` : \`\${visual.toSystemId}::\${visual.fromSystemId}\`, visual])), [routeVisuals]);`, 'route visual index');

  source = replaceOnce(source,
`    ctx.strokeStyle = 'rgba(89, 142, 166, .18)';
    for (const system of systems) {
      if (!system.known) continue;
      const a = toScreen(system, width, height);
      for (const id of system.neighbors) {
        const neighbor = systemIndex.get(id);
        if (!neighbor?.known || neighbor.id < system.id) continue;
        const b = toScreen(neighbor, width, height);
        if ((a.x < -50 && b.x < -50) || (a.x > width + 50 && b.x > width + 50) || (a.y < -50 && b.y < -50) || (a.y > height + 50 && b.y > height + 50)) continue;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }`,
`    for (const system of systems) {
      if (!system.known) continue;
      const a = toScreen(system, width, height);
      for (const id of system.neighbors) {
        const neighbor = systemIndex.get(id);
        if (!neighbor?.known || neighbor.id < system.id) continue;
        const b = toScreen(neighbor, width, height);
        if ((a.x < -50 && b.x < -50) || (a.x > width + 50 && b.x > width + 50) || (a.y < -50 && b.y < -50) || (a.y > height + 50 && b.y > height + 50)) continue;
        const key = system.id < neighbor.id ? \`\${system.id}::\${neighbor.id}\` : \`\${neighbor.id}::\${system.id}\`;
        const visual = routeVisualIndex.get(key);
        ctx.save();
        ctx.lineWidth = visual?.planned ? 3 : visual ? 1.35 : 1;
        ctx.strokeStyle = visual?.planned ? 'rgba(91, 224, 255, .95)'
          : visual?.kind === 'military' ? 'rgba(255, 91, 99, .48)'
            : visual?.kind === 'trade' ? 'rgba(91, 218, 153, .42)'
              : visual?.kind === 'smuggler' ? 'rgba(182, 117, 255, .42)'
                : visual?.kind === 'ancient' ? 'rgba(229, 203, 114, .48)'
                  : visual?.kind === 'quarantine' ? 'rgba(255, 165, 83, .52)'
                    : 'rgba(89, 142, 166, .18)';
        if (visual?.kind === 'smuggler' || visual?.kind === 'quarantine') ctx.setLineDash([5, 5]);
        if (visual?.planned) { ctx.shadowBlur = 10; ctx.shadowColor = '#5be0ff'; }
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      }
    }`, 'dynamic route drawing');
  source = source.replace('livingCivilizations, selectedSystemId, systemIndex, systems, toScreen, view]);', 'livingCivilizations, routeVisualIndex, selectedSystemId, systemIndex, systems, toScreen, view]);');
  write(path, source);
}

function patchVersion() {
  const path = 'src/version.ts';
  let source = read(path);
  source = source.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.34.0';");
  source = source.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'GALACTIC_GEOGRAPHY';");
  write(path, source);
}

[
  'src/navigation/geography.ts',
  'src/screens/GalaxyScreen.tsx',
  'src/styles/galacticGeography.css'
].forEach(requireFile);

patchTypes();
patchSnapshot();
patchStore();
patchApp();
patchGalaxyCanvas();
patchVersion();
console.log('Void Chronicles v0.34 installed: sectors, dynamic corridors, route planning, blockades and travel incidents.');
