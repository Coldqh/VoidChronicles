import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => writeFileSync(path, content, 'utf8');
const requireFile = (path) => { if (!existsSync(path)) throw new Error(`v0.33: missing ${path}`); };
const insertAfter = (source, anchor, addition, label) => {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`v0.33: anchor not found: ${label}`);
  return source.replace(anchor, `${anchor}${addition}`);
};
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v0.33: fragment not found: ${label}`);
  return source.replace(before, after);
};
const removeBlock = (source, start, end, label) => {
  if (!source.includes(start)) return source;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex < 0) throw new Error(`v0.33: end marker not found: ${label}`);
  return source.slice(0, startIndex) + source.slice(endIndex);
};

function patchTypes() {
  const path = 'src/game/types.ts';
  let source = read(path);
  source = insertAfter(source, `export interface CrewMemory {
  id: string;
  year: number;
  kind: 'hired' | 'expedition' | 'injury' | 'payment' | 'betrayal' | 'discovery';
  text: string;
  impact: number;
}`, `

export type ShipCompartmentId = 'bridge' | 'engineering' | 'reactor' | 'medbay' | 'laboratory' | 'quarters' | 'cargo' | 'airlock';
export interface CrewRelationship {
  crewId: string;
  affinity: number;
  tension: number;
  lastChangedYear: number;
  reason: string;
}
export interface CrewPersonalArc {
  id: string;
  title: string;
  summary: string;
  stage: number;
  status: 'dormant' | 'active' | 'resolved' | 'failed';
}
export interface CrewIssue {
  id: string;
  kind: 'conflict' | 'request' | 'injury' | 'scarcity';
  title: string;
  summary: string;
  crewIds: string[];
  severity: number;
  createdYear: number;
  status: 'open' | 'resolved';
  resolvedYear?: number;
  resolution?: string;
}
export interface ShipCompartment {
  id: ShipCompartmentId;
  name: string;
  function: string;
  condition: number;
  level: number;
  disabled: boolean;
  capacity: number;
  assignedCrewIds: string[];
  tags: string[];
}
export interface ShipTrophy {
  id: string;
  name: string;
  description: string;
  sourceId?: string;
}
export interface ShipLifeState {
  compartments: ShipCompartment[];
  supplies: { food: number; oxygen: number; medicine: number; parts: number };
  issues: CrewIssue[];
  trophies: ShipTrophy[];
  lastUpdatedHour: number;
}`, 'ship and crew life types');

  source = replaceOnce(source,
`  injuries: Injury[];
  memories: CrewMemory[];
}`,
`  injuries: Injury[];
  memories: CrewMemory[];
  fatigue?: number;
  stress?: number;
  shipCompartmentId?: ShipCompartmentId;
  relationships?: CrewRelationship[];
  personalArc?: CrewPersonalArc;
}`, 'crew life fields');

  source = replaceOnce(source,
`  systems: ShipSystemState[];
  transponder: string;`,
`  systems: ShipSystemState[];
  life?: ShipLifeState;
  transponder: string;`, 'ship life field');
  write(path, source);
}

function patchSnapshot() {
  const path='src/persistence/snapshot.ts';
  let source=read(path);
  source=insertAfter(source, "import { normalizeEcologyState } from '../ecology/integrity';", "\nimport { createShipLifeState } from '../ship/life';", 'ship life snapshot import');
  source=insertAfter(source,
`const shipSystemSchema = z.object({
  id: shipSystemIdSchema, label: z.string(), integrity: finiteNumber, maxIntegrity: finiteNumber, disabled: z.boolean(), effect: z.string()
});`,
`
const shipCompartmentIdSchema = z.enum(['bridge','engineering','reactor','medbay','laboratory','quarters','cargo','airlock']);
const crewRelationshipSchema = z.object({ crewId: z.string(), affinity: finiteNumber, tension: finiteNumber, lastChangedYear: finiteNumber, reason: z.string() });
const crewPersonalArcSchema = z.object({ id: z.string(), title: z.string(), summary: z.string(), stage: finiteNumber, status: z.enum(['dormant','active','resolved','failed']) });
const crewIssueSchema = z.object({
  id: z.string(), kind: z.enum(['conflict','request','injury','scarcity']), title: z.string(), summary: z.string(),
  crewIds: z.array(z.string()), severity: finiteNumber, createdYear: finiteNumber, status: z.enum(['open','resolved']),
  resolvedYear: finiteNumber.optional(), resolution: z.string().optional()
});
const shipCompartmentSchema = z.object({
  id: shipCompartmentIdSchema, name: z.string(), function: z.string(), condition: finiteNumber, level: finiteNumber,
  disabled: z.boolean(), capacity: finiteNumber, assignedCrewIds: z.array(z.string()), tags: z.array(z.string())
});
const shipLifeSchema = z.object({
  compartments: z.array(shipCompartmentSchema),
  supplies: z.object({ food: finiteNumber, oxygen: finiteNumber, medicine: finiteNumber, parts: finiteNumber }),
  issues: z.array(crewIssueSchema), trophies: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), sourceId: z.string().optional() })),
  lastUpdatedHour: finiteNumber
});`, 'ship life schemas');
  source=replaceOnce(source,
`  systems: z.array(shipSystemSchema).default([]),
  transponder: z.string().default('WANDERER-01'),`,
`  systems: z.array(shipSystemSchema).default([]),
  life: shipLifeSchema.default(createShipLifeState(0)),
  transponder: z.string().default('WANDERER-01'),`, 'ship life persistence');
  source=source.replace(
    "status: z.enum(['active', 'injured', 'unpaid', 'missing']),",
    "status: z.enum(['active', 'injured', 'unpaid', 'missing', 'deceased']),"
  );
  source=replaceOnce(source,
`  injuries: z.array(injurySchema),
  memories: z.array(crewMemorySchema)
});`,
`  injuries: z.array(injurySchema),
  memories: z.array(crewMemorySchema),
  fatigue: finiteNumber.optional(),
  stress: finiteNumber.optional(),
  shipCompartmentId: shipCompartmentIdSchema.optional(),
  relationships: z.array(crewRelationshipSchema).optional(),
  personalArc: crewPersonalArcSchema.optional()
});`, 'crew life persistence');
  write(path,source);
}

function patchApp(){
  const path='src/App.tsx';
  let source=read(path);
  source=insertAfter(source,
"const ContactsScreen = lazy(() => import('./screens/ContactsScreen').then((module) => ({ default: module.ContactsScreen })));",
"\nconst CrewScreenV33 = lazy(() => import('./screens/CrewScreen').then((module) => ({ default: module.CrewScreen })));\nconst ShipScreenV33 = lazy(() => import('./screens/ShipScreen').then((module) => ({ default: module.ShipScreen })));", 'screen imports');
  if (!source.includes("import './styles/shipCrewLife.css';")) {
    const styleAnchor = source.includes("import './styles/civilizationProfiles.css';")
      ? "import './styles/civilizationProfiles.css';"
      : source.includes("import './styles/playerOperationsV32.css';")
        ? "import './styles/playerOperationsV32.css';"
        : "import './styles/mobileGameplay.css';";
    source=insertAfter(source,styleAnchor,"\nimport './styles/shipCrewLife.css';",'ship crew styles');
  }
  source=removeBlock(source,'function CrewScreen() {','function ArchiveScreen() {','legacy crew screen');
  source=removeBlock(source,'function ShipScreen() {','function SettingsScreen() {','legacy ship screen');
  source=source.replace("import { roleLabel } from './crew/generateCrew';\n",'');
  source=source.replace("else if (screen === 'crew') content = <CrewScreen/>;","else if (screen === 'crew') content = <CrewScreenV33 chrome={<AppChrome/>}/>;");
  source=source.replace("else content = <ShipScreen/>;","else content = <ShipScreenV33 chrome={<AppChrome/>}/>;");
  write(path,source);
}

function patchStore(){
  const path='src/game/store.ts';
  let source=read(path);
  source=insertAfter(source,'  Ship,',"\n  ShipCompartmentId,", 'ShipCompartmentId import');
  source=insertAfter(source,
"import { applyCaptainCareer, createOperationObjective, projectOperationRequests, resolveOperationStep } from '../operations/runtime';",
"\nimport { advanceShipLife, createShipLifeState, normalizeShipLife, repairCompartment as repairShipCompartment, resolveCrewIssue as resolveShipCrewIssue, resolvePersonalArc, restCrew as restShipCrew } from '../ship/life';", 'ship life import');
  source=insertAfter(source,
"  settlePayroll(): Promise<void>;",
`
  restCrew(): Promise<void>;
  repairCompartment(compartmentId: ShipCompartmentId): Promise<void>;
  resolveCrewIssue(issueId: string, choice: 'mediate' | 'side-first' | 'side-second' | 'ignore'): Promise<void>;
  assignCrewCompartment(crewId: string, compartmentId: ShipCompartmentId): Promise<void>;
  handleCrewStory(crewId: string, choice: 'listen' | 'help' | 'refuse'): Promise<void>;
  resupplyShip(): Promise<void>;`, 'store life methods');
  source=replaceOnce(source,
`  registration: 'VC-01-CORE',
});`,
`  registration: 'VC-01-CORE',
  life: createShipLifeState(0)
});`, 'initial ship life');

  source=replaceOnce(source,
`  const consequences = processDueConsequences(state.pendingConsequences, nextYear);
  const logs = [...consequences.due.map((entry) => makeLog(nextYear, entry.title, entry.text, entry.tone)), ...state.logs];`,
`  const consequences = processDueConsequences(state.pendingConsequences, nextYear);
  const shipLife = state.ship && state.legacy.mode === 'active' ? advanceShipLife({ ship: state.ship, crew: state.crew, hours, seed: galaxy.seed, year: nextYear, reason }) : null;
  const incidentLogs = shipLife?.incidents.map((entry) => makeLog(nextYear, entry.title, entry.summary, entry.severity >= 70 ? 'danger' : 'warning')) ?? [];
  const logs = [...incidentLogs, ...consequences.due.map((entry) => makeLog(nextYear, entry.title, entry.text, entry.tone)), ...state.logs];`, 'ship life world advance');

  source=replaceOnce(source,
`      simulation: advanced.simulation,
      hubs: projectedHubs,`,
`      simulation: advanced.simulation,
      ship: shipLife?.ship ?? state.ship,
      crew: shipLife?.crew ?? state.crew,
      hubs: projectedHubs,`, 'ship life patch');

  source=replaceOnce(source,
`        ship: updatedShip,`,
`        ship: advanced.patch.ship ? { ...(advanced.patch.ship as Ship), fuel: updatedShip.fuel, systems: updatedShip.systems } : updatedShip,`,
  'travel ship life merge');

  if(!source.includes('async restCrew() {')){
    const anchor='  async dockAtHub(hubId) {';
    if(!source.includes(anchor)) throw new Error('v0.33: dockAtHub anchor not found');
    const methods=`  async restCrew() {
    return runExclusive('crew-rest', set, get, async () => {
      const state = get();
      if (!state.ship || !state.simulation) return;
      const advanced = buildWorldAdvance(state, 12, 'crew-rest');
      const nextYear = advanced.patch.gameYear ?? state.gameYear;
      const result = restShipCrew((advanced.patch.ship as Ship | undefined) ?? state.ship, (advanced.patch.crew as CrewMember[] | undefined) ?? state.crew, nextYear);
      set({ ...advanced.patch, ship: result.ship, crew: result.crew, logs: [makeLog(nextYear, 'Смена отдыха', result.message, 'good'), ...((advanced.patch.logs as GameLogEntry[] | undefined) ?? state.logs)].slice(0, 750) });
      await persist(set, get, 'crew-rest');
    }, undefined);
  },
  async repairCompartment(compartmentId) {
    return runExclusive('compartment-repair', set, get, async () => {
      const state = get();
      if (!state.ship) return;
      const result = repairShipCompartment(state.ship, state.crew, compartmentId, state.gameYear);
      set({ ship: result.ship, crew: result.crew, logs: [makeLog(state.gameYear, 'Ремонт отсека', result.message, result.partsUsed ? 'good' : 'warning'), ...state.logs].slice(0, 750) });
      await persist(set, get, 'compartment-repair');
    }, undefined);
  },
  async resolveCrewIssue(issueId, choice) {
    return runExclusive('crew-issue', set, get, async () => {
      const state = get();
      if (!state.ship) return;
      const result = resolveShipCrewIssue({ ship: state.ship, crew: state.crew, issueId, choice, year: state.gameYear });
      set({ ship: result.ship, crew: result.crew, logs: [makeLog(state.gameYear, 'Решение капитана', result.message, choice === 'mediate' ? 'good' : choice === 'ignore' ? 'warning' : 'info'), ...state.logs].slice(0, 750) });
      await persist(set, get, 'crew-issue');
    }, undefined);
  },
  async assignCrewCompartment(crewId, compartmentId) {
    const state = get();
    if (!state.ship?.life || !state.crew.some((entry) => entry.id === crewId)) return;
    const target = state.ship.life.compartments.find((entry) => entry.id === compartmentId);
    if (!target || (!target.assignedCrewIds.includes(crewId) && target.assignedCrewIds.length >= target.capacity)) {
      set({ logs: [makeLog(state.gameYear, 'Назначение поста', 'В выбранном отсеке нет свободного места.', 'warning'), ...state.logs].slice(0, 750) });
      return;
    }
    const compartments = state.ship.life.compartments.map((entry) => ({
      ...entry,
      assignedCrewIds: entry.id === compartmentId
        ? Array.from(new Set([...entry.assignedCrewIds.filter((id) => id !== crewId), crewId])).slice(0, entry.capacity)
        : entry.assignedCrewIds.filter((id) => id !== crewId)
    }));
    set({
      ship: { ...state.ship, life: { ...state.ship.life, compartments } },
      crew: state.crew.map((entry) => entry.id === crewId ? { ...entry, shipCompartmentId: compartmentId } : entry)
    });
    await persist(set, get, 'crew-compartment');
  },
  async handleCrewStory(crewId, choice) {
    return runExclusive('crew-story', set, get, async () => {
      const state = get();
      if (!state.captain) return;
      const result = resolvePersonalArc({ crew: state.crew, crewId, choice, year: state.gameYear });
      if (state.captain.credits < result.creditsCost) {
        set({ logs: [makeLog(state.gameYear, 'Личная просьба', 'Недостаточно кредитов, чтобы помочь.', 'warning'), ...state.logs].slice(0, 750) });
        return;
      }
      set({
        captain: { ...state.captain, credits: state.captain.credits - result.creditsCost },
        crew: result.crew,
        logs: [makeLog(state.gameYear, 'Личная история экипажа', result.message, choice === 'help' ? 'good' : choice === 'refuse' ? 'warning' : 'info'), ...state.logs].slice(0, 750)
      });
      await persist(set, get, 'crew-story');
    }, undefined);
  },
  async resupplyShip() {
    return runExclusive('ship-resupply', set, get, async () => {
      const state = get();
      if (!state.ship || !state.captain) return;
      if (!state.currentHubId) {
        set({ logs: [makeLog(state.gameYear, 'Пополнение запасов', 'Для погрузки припасов нужна стыковка с хабом.', 'warning'), ...state.logs].slice(0, 750) });
        return;
      }
      const cost = 180;
      if (state.captain.credits < cost) {
        set({ logs: [makeLog(state.gameYear, 'Пополнение запасов', 'Нужно ₡' + cost + '.', 'warning'), ...state.logs].slice(0, 750) });
        return;
      }
      const normalized = normalizeShipLife(state.ship, state.crew, state.gameYear);
      normalized.ship.life!.supplies = {
        food: 100,
        oxygen: 100,
        medicine: normalized.ship.life!.supplies.medicine + 5,
        parts: normalized.ship.life!.supplies.parts + 8
      };
      set({
        captain: { ...state.captain, credits: state.captain.credits - cost },
        ship: normalized.ship,
        crew: normalized.crew,
        logs: [makeLog(state.gameYear, 'Запасы пополнены', 'Еда и кислород восстановлены, медикаменты и запчасти приняты на борт.', 'good'), ...state.logs].slice(0, 750)
      });
      await persist(set, get, 'ship-resupply');
    }, undefined);
  },
`;
    source=source.replace(anchor,methods+anchor);
  }
  write(path,source);
}

function patchOperations(){
  const path='src/operations/runtime.ts';
  let source=read(path);
  source=insertAfter(source,
"import { createRng, stableHash } from '../generation/rng';",
"\nimport { crewReadiness } from '../ship/life';", 'crew readiness import');
  source=replaceOnce(source,
`function crewBonus(category: OperationCategory, crew: CrewMember[]): number {
  const desired = category === 'mediation' ? ['diplomat']
    : category === 'escort' ? ['soldier', 'pilot']
      : category === 'containment' ? ['biologist', 'doctor', 'engineer']
        : category === 'recovery' || category === 'investigation' ? ['archaeologist', 'scientist']
          : ['doctor', 'engineer', 'pilot'];
  return crew.some((member) => member.status === 'active' && desired.includes(member.primaryRole))
    ? 0.14
    : crew.some((member) => member.status === 'active' && member.secondaryRole && desired.includes(member.secondaryRole))
      ? 0.08
      : 0;
}`,
`function crewBonus(category: OperationCategory, crew: CrewMember[]): number {
  const desired = category === 'mediation' ? ['diplomat']
    : category === 'escort' ? ['soldier', 'pilot']
      : category === 'containment' ? ['biologist', 'doctor', 'engineer']
        : category === 'recovery' || category === 'investigation' ? ['archaeologist', 'scientist']
          : ['doctor', 'engineer', 'pilot'];
  const primary = crew.find((member) => member.status === 'active' && desired.includes(member.primaryRole));
  const secondary = primary ? undefined : crew.find((member) => member.status === 'active' && member.secondaryRole && desired.includes(member.secondaryRole));
  const specialist = primary ?? secondary;
  if (!specialist) return 0;
  const readiness = crewReadiness(specialist) / 100;
  return (primary ? 0.14 : 0.08) * Math.max(0.25, readiness);
}`, 'operation crew readiness');
  write(path,source);
}

function patchVersion(){
  const path='src/version.ts';
  let source=read(path);
  source=source.replace(/export const APP_VERSION = '[^']+';/,"export const APP_VERSION = '0.33.0';");
  source=source.replace(/export const APP_CODENAME = '[^']+';/,"export const APP_CODENAME = 'SHIP_CREW_LIFE';");
  write(path,source);
}

['src/ship/life.ts','src/screens/CrewScreen.tsx','src/screens/ShipScreen.tsx','src/styles/shipCrewLife.css'].forEach(requireFile);
patchTypes(); patchSnapshot(); patchApp(); patchStore(); patchOperations(); patchVersion();
console.log('Void Chronicles v0.33 installed: ship interior, supplies, fatigue, stress, relationships and crew conflicts.');
