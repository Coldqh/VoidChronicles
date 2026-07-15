import type { Civilization } from '../game/types';
import { createRng } from '../generation/rng';
import type { SimulationContext } from './context';
import { liveHistoricalFigures, liveInstitutions } from './figures';
import type { SimulationState, WorldEvent, WorldEventDraft } from './types';
import { liveWars } from './war';

const HOURS_PER_YEAR = 365 * 24;
const ARTIFACT_STATE_TAG = 'living-artifact-state';
const ARCHIVE_STATE_TAG = 'living-archive-state';
const RUIN_STATE_TAG = 'living-ruin-state';
const SEP = '|';

export type LiveArtifactStatus =
  | 'held'
  | 'lost'
  | 'buried'
  | 'recovered'
  | 'destroyed'
  | 'disputed';

export interface LiveArtifactState {
  id: string;
  name: string;
  kind: string;
  civilizationId: string;
  createdYear: number;
  creatorId?: string;
  currentOwnerId?: string;
  currentSystemId?: string;
  currentSettlementId?: string;
  status: LiveArtifactStatus;
  integrity: number;
  authenticity: number;
  culturalValue: number;
  danger: number;
  publicKnowledge: number;
  ownerHistory: string[];
  eventHistory: string[];
  lastUpdatedHour: number;
}

export type ArchiveStatus = 'active' | 'sealed' | 'damaged' | 'lost' | 'destroyed';

export interface LiveArchiveState {
  id: string;
  civilizationId: string;
  name: string;
  systemId: string;
  settlementId?: string;
  institutionId?: string;
  records: number;
  integrity: number;
  accessibility: number;
  secrecy: number;
  deciphered: number;
  status: ArchiveStatus;
  foundedYear: number;
  lastUpdatedHour: number;
}

export type LiveRuinStatus = 'sealed' | 'exposed' | 'excavated' | 'collapsed' | 'looted';

export interface LiveRuinState {
  id: string;
  settlementId: string;
  civilizationId: string;
  systemId: string;
  planetId?: string;
  createdYear: number;
  cause: string;
  integrity: number;
  excavation: number;
  looted: number;
  archiveIds: string[];
  artifactIds: string[];
  status: LiveRuinStatus;
  lastUpdatedHour: number;
}

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function split(value: unknown): string[] {
  return typeof value === 'string'
    ? [...new Set(value.split(SEP).map((entry) => entry.trim()).filter(Boolean))]
    : [];
}

function join(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(SEP);
}

function artifactFromGalaxy(
  artifact: SimulationContext['galaxy']['artifacts'][number],
  civilization: Civilization | undefined,
  state: SimulationState,
  context: SimulationContext
): LiveArtifactState {
  const settlements = Object.values(state.settlements).filter(
    (entry) => entry.civilizationId === artifact.civilizationId && !entry.abandoned
  );
  const settlement = settlements.find((entry) => entry.systemId === civilization?.homeSystemId) ?? settlements[0];
  const owner = context.factions.find((entry) => entry.civilizationId === artifact.civilizationId);
  return {
    id: artifact.id,
    name: artifact.name,
    kind: artifact.kind,
    civilizationId: artifact.civilizationId,
    createdYear: artifact.createdYear,
    creatorId: artifact.creatorId,
    currentOwnerId: owner?.id,
    currentSystemId: settlement?.systemId ?? civilization?.homeSystemId,
    currentSettlementId: settlement?.id,
    status: artifact.discovered ? 'recovered' : 'held',
    integrity: 82,
    authenticity: 100,
    culturalValue: clamp(Math.log10(Math.max(1, artifact.value + 1)) * 22 + 25),
    danger: clamp(artifact.danger * 10),
    publicKnowledge: artifact.discovered ? 70 : 15,
    ownerHistory: [...artifact.ownerHistory],
    eventHistory: [],
    lastUpdatedHour: state.clock.absoluteHour
  };
}

function artifactFromEvent(event: WorldEvent, fallback?: LiveArtifactState): LiveArtifactState | undefined {
  const id = stringValue(event.data?.heritageArtifactId);
  const civilizationId = stringValue(event.data?.heritageCivilizationId, event.civilizationIds[0] ?? '');
  if (!id || !civilizationId) return undefined;
  return {
    id,
    name: stringValue(event.data?.heritageArtifactName, fallback?.name ?? id),
    kind: stringValue(event.data?.heritageArtifactKind, fallback?.kind ?? 'реликвия'),
    civilizationId,
    createdYear: numberValue(event.data?.heritageArtifactCreatedYear, fallback?.createdYear ?? 0),
    creatorId: stringValue(event.data?.heritageArtifactCreatorId, fallback?.creatorId ?? '') || undefined,
    currentOwnerId: stringValue(event.data?.heritageArtifactOwnerId, fallback?.currentOwnerId ?? '') || undefined,
    currentSystemId: stringValue(event.data?.heritageArtifactSystemId, fallback?.currentSystemId ?? '') || undefined,
    currentSettlementId: stringValue(event.data?.heritageArtifactSettlementId, fallback?.currentSettlementId ?? '') || undefined,
    status: stringValue(event.data?.heritageArtifactStatus, fallback?.status ?? 'held') as LiveArtifactStatus,
    integrity: clamp(numberValue(event.data?.heritageArtifactIntegrity, fallback?.integrity ?? 70)),
    authenticity: clamp(numberValue(event.data?.heritageArtifactAuthenticity, fallback?.authenticity ?? 100)),
    culturalValue: clamp(numberValue(event.data?.heritageArtifactValue, fallback?.culturalValue ?? 40)),
    danger: clamp(numberValue(event.data?.heritageArtifactDanger, fallback?.danger ?? 0)),
    publicKnowledge: clamp(numberValue(event.data?.heritageArtifactKnowledge, fallback?.publicKnowledge ?? 10)),
    ownerHistory: split(event.data?.heritageArtifactOwners).length
      ? split(event.data?.heritageArtifactOwners)
      : [...(fallback?.ownerHistory ?? [])],
    eventHistory: split(event.data?.heritageArtifactEvents).length
      ? split(event.data?.heritageArtifactEvents)
      : [...(fallback?.eventHistory ?? [])],
    lastUpdatedHour: numberValue(event.data?.heritageArtifactUpdatedHour, event.atHour)
  };
}

function archiveFromEvent(event: WorldEvent, fallback?: LiveArchiveState): LiveArchiveState | undefined {
  const id = stringValue(event.data?.archiveId);
  const civilizationId = stringValue(event.data?.archiveCivilizationId, event.civilizationIds[0] ?? '');
  if (!id || !civilizationId) return undefined;
  return {
    id,
    civilizationId,
    name: stringValue(event.data?.archiveName, fallback?.name ?? id),
    systemId: stringValue(event.data?.archiveSystemId, fallback?.systemId ?? ''),
    settlementId: stringValue(event.data?.archiveSettlementId, fallback?.settlementId ?? '') || undefined,
    institutionId: stringValue(event.data?.archiveInstitutionId, fallback?.institutionId ?? '') || undefined,
    records: Math.max(0, Math.round(numberValue(event.data?.archiveRecords, fallback?.records ?? 0))),
    integrity: clamp(numberValue(event.data?.archiveIntegrity, fallback?.integrity ?? 60)),
    accessibility: clamp(numberValue(event.data?.archiveAccessibility, fallback?.accessibility ?? 30)),
    secrecy: clamp(numberValue(event.data?.archiveSecrecy, fallback?.secrecy ?? 40)),
    deciphered: clamp(numberValue(event.data?.archiveDeciphered, fallback?.deciphered ?? 0)),
    status: stringValue(event.data?.archiveStatus, fallback?.status ?? 'active') as ArchiveStatus,
    foundedYear: numberValue(event.data?.archiveFoundedYear, fallback?.foundedYear ?? 0),
    lastUpdatedHour: numberValue(event.data?.archiveUpdatedHour, event.atHour)
  };
}

function ruinFromEvent(event: WorldEvent, fallback?: LiveRuinState): LiveRuinState | undefined {
  const id = stringValue(event.data?.livingRuinId);
  const civilizationId = stringValue(event.data?.livingRuinCivilizationId, event.civilizationIds[0] ?? '');
  if (!id || !civilizationId) return undefined;
  return {
    id,
    settlementId: stringValue(event.data?.livingRuinSettlementId, fallback?.settlementId ?? ''),
    civilizationId,
    systemId: stringValue(event.data?.livingRuinSystemId, fallback?.systemId ?? ''),
    planetId: stringValue(event.data?.livingRuinPlanetId, fallback?.planetId ?? '') || undefined,
    createdYear: numberValue(event.data?.livingRuinCreatedYear, fallback?.createdYear ?? 0),
    cause: stringValue(event.data?.livingRuinCause, fallback?.cause ?? 'неизвестно'),
    integrity: clamp(numberValue(event.data?.livingRuinIntegrity, fallback?.integrity ?? 50)),
    excavation: clamp(numberValue(event.data?.livingRuinExcavation, fallback?.excavation ?? 0)),
    looted: clamp(numberValue(event.data?.livingRuinLooted, fallback?.looted ?? 0)),
    archiveIds: split(event.data?.livingRuinArchives).length
      ? split(event.data?.livingRuinArchives)
      : [...(fallback?.archiveIds ?? [])],
    artifactIds: split(event.data?.livingRuinArtifacts).length
      ? split(event.data?.livingRuinArtifacts)
      : [...(fallback?.artifactIds ?? [])],
    status: stringValue(event.data?.livingRuinStatus, fallback?.status ?? 'sealed') as LiveRuinStatus,
    lastUpdatedHour: numberValue(event.data?.livingRuinUpdatedHour, event.atHour)
  };
}

export function liveArtifacts(state: SimulationState, context: SimulationContext): LiveArtifactState[] {
  const byId = new Map<string, LiveArtifactState>();
  for (const artifact of context.galaxy.artifacts) {
    const civilization = context.galaxy.civilizations.find((entry) => entry.id === artifact.civilizationId);
    const projected = artifactFromGalaxy(artifact, civilization, state, context);
    byId.set(projected.id, projected);
  }
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(ARTIFACT_STATE_TAG)) continue;
    const id = stringValue(event.data?.heritageArtifactId);
    const projected = artifactFromEvent(event, id ? byId.get(id) : undefined);
    if (projected) byId.set(projected.id, projected);
  }
  return [...byId.values()].sort((a, b) => b.culturalValue - a.culturalValue);
}

export function liveArchives(state: SimulationState, context: SimulationContext): LiveArchiveState[] {
  const byId = new Map<string, LiveArchiveState>();
  const institutions = liveInstitutions(state, context);
  for (const civilization of context.galaxy.civilizations) {
    const institution = institutions.find(
      (entry) => entry.civilizationId === civilization.id && entry.kind === 'archive'
    );
    const settlement = Object.values(state.settlements)
      .filter((entry) => entry.civilizationId === civilization.id && !entry.abandoned)
      .sort((a, b) => b.population - a.population)[0];
    const id = `archive_${civilization.id}`;
    byId.set(id, {
      id,
      civilizationId: civilization.id,
      name: `${civilization.name} · Исторический архив`,
      systemId: institution?.headquartersSystemId ?? settlement?.systemId ?? civilization.homeSystemId,
      settlementId: settlement?.id,
      institutionId: institution?.id,
      records: Math.max(100, (context.galaxy.history.filter((event) => event.civilizationIds.includes(civilization.id)).length + 1) * 250),
      integrity: 82,
      accessibility: 35,
      secrecy: 45,
      deciphered: clamp(civilization.development?.literacy ?? civilization.techLevel * 10),
      status: 'active',
      foundedYear: civilization.foundedYear,
      lastUpdatedHour: state.clock.absoluteHour
    });
  }
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(ARCHIVE_STATE_TAG)) continue;
    const id = stringValue(event.data?.archiveId);
    const projected = archiveFromEvent(event, id ? byId.get(id) : undefined);
    if (projected) byId.set(projected.id, projected);
  }
  return [...byId.values()].sort((a, b) => b.records - a.records);
}

export function liveRuins(state: SimulationState, context: SimulationContext): LiveRuinState[] {
  const byId = new Map<string, LiveRuinState>();
  const deepRuins = ((context.galaxy.deepTime as (typeof context.galaxy.deepTime & { ruins?: Array<{ id: string; settlementId: string; civilizationId: string; systemId: string; planetId?: string; createdYear: number; cause: string; integrity: number; artifactIds: string[] }> }) | undefined)?.ruins ?? []);
  for (const ruin of deepRuins) {
    byId.set(ruin.id, {
      id: ruin.id,
      settlementId: ruin.settlementId,
      civilizationId: ruin.civilizationId,
      systemId: ruin.systemId,
      planetId: ruin.planetId,
      createdYear: ruin.createdYear,
      cause: ruin.cause,
      integrity: clamp(ruin.integrity),
      excavation: 0,
      looted: 0,
      archiveIds: [],
      artifactIds: [...ruin.artifactIds],
      status: ruin.integrity < 20 ? 'collapsed' : 'sealed',
      lastUpdatedHour: state.clock.absoluteHour
    });
  }
  for (const event of [...state.events].reverse()) {
    if (!event.tags.includes(RUIN_STATE_TAG)) continue;
    const id = stringValue(event.data?.livingRuinId);
    const projected = ruinFromEvent(event, id ? byId.get(id) : undefined);
    if (projected) byId.set(projected.id, projected);
  }
  return [...byId.values()].sort((a, b) => b.integrity - a.integrity);
}

function writeArtifactSnapshot(state: SimulationState, artifact: LiveArtifactState, atHour: number): void {
  const event: WorldEvent = {
    id: `state_artifact_${artifact.id}`,
    atHour,
    kind: 'discovery',
    title: 'Состояние артефакта',
    summary: 'Служебный снимок артефакта.',
    severity: 0,
    visibility: 'hidden',
    systemIds: artifact.currentSystemId ? [artifact.currentSystemId] : [],
    civilizationIds: [artifact.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', ARTIFACT_STATE_TAG, 'state-snapshot'],
    data: {
      heritageArtifactId: artifact.id,
      heritageCivilizationId: artifact.civilizationId,
      heritageArtifactName: artifact.name,
      heritageArtifactKind: artifact.kind,
      heritageArtifactCreatedYear: artifact.createdYear,
      heritageArtifactCreatorId: artifact.creatorId ?? '',
      heritageArtifactOwnerId: artifact.currentOwnerId ?? '',
      heritageArtifactSystemId: artifact.currentSystemId ?? '',
      heritageArtifactSettlementId: artifact.currentSettlementId ?? '',
      heritageArtifactStatus: artifact.status,
      heritageArtifactIntegrity: artifact.integrity,
      heritageArtifactAuthenticity: artifact.authenticity,
      heritageArtifactValue: artifact.culturalValue,
      heritageArtifactDanger: artifact.danger,
      heritageArtifactKnowledge: artifact.publicKnowledge,
      heritageArtifactOwners: join(artifact.ownerHistory),
      heritageArtifactEvents: join(artifact.eventHistory),
      heritageArtifactUpdatedHour: atHour
    }
  };
  state.events = [event, ...state.events.filter(
    (entry) => !(entry.tags.includes(ARTIFACT_STATE_TAG) && entry.data?.heritageArtifactId === artifact.id)
  )].slice(0, 8_500);
}

function writeArchiveSnapshot(state: SimulationState, archive: LiveArchiveState, atHour: number): void {
  const event: WorldEvent = {
    id: `state_archive_${archive.id}`,
    atHour,
    kind: 'discovery',
    title: 'Состояние архива',
    summary: 'Служебный снимок архива.',
    severity: 0,
    visibility: 'hidden',
    systemIds: [archive.systemId],
    civilizationIds: [archive.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', ARCHIVE_STATE_TAG, 'state-snapshot'],
    data: {
      archiveId: archive.id,
      archiveCivilizationId: archive.civilizationId,
      archiveName: archive.name,
      archiveSystemId: archive.systemId,
      archiveSettlementId: archive.settlementId ?? '',
      archiveInstitutionId: archive.institutionId ?? '',
      archiveRecords: archive.records,
      archiveIntegrity: archive.integrity,
      archiveAccessibility: archive.accessibility,
      archiveSecrecy: archive.secrecy,
      archiveDeciphered: archive.deciphered,
      archiveStatus: archive.status,
      archiveFoundedYear: archive.foundedYear,
      archiveUpdatedHour: atHour
    }
  };
  state.events = [event, ...state.events.filter(
    (entry) => !(entry.tags.includes(ARCHIVE_STATE_TAG) && entry.data?.archiveId === archive.id)
  )].slice(0, 8_500);
}

function writeRuinSnapshot(state: SimulationState, ruin: LiveRuinState, atHour: number): void {
  const event: WorldEvent = {
    id: `state_ruin_${ruin.id}`,
    atHour,
    kind: 'discovery',
    title: 'Состояние руин',
    summary: 'Служебный снимок руин.',
    severity: 0,
    visibility: 'hidden',
    systemIds: [ruin.systemId],
    civilizationIds: [ruin.civilizationId],
    factionIds: [],
    tags: ['simulation', 'living-history', RUIN_STATE_TAG, 'state-snapshot'],
    data: {
      livingRuinId: ruin.id,
      livingRuinSettlementId: ruin.settlementId,
      livingRuinCivilizationId: ruin.civilizationId,
      livingRuinSystemId: ruin.systemId,
      livingRuinPlanetId: ruin.planetId ?? '',
      livingRuinCreatedYear: ruin.createdYear,
      livingRuinCause: ruin.cause,
      livingRuinIntegrity: ruin.integrity,
      livingRuinExcavation: ruin.excavation,
      livingRuinLooted: ruin.looted,
      livingRuinArchives: join(ruin.archiveIds),
      livingRuinArtifacts: join(ruin.artifactIds),
      livingRuinStatus: ruin.status,
      livingRuinUpdatedHour: atHour
    }
  };
  state.events = [event, ...state.events.filter(
    (entry) => !(entry.tags.includes(RUIN_STATE_TAG) && entry.data?.livingRuinId === ruin.id)
  )].slice(0, 8_500);
}

function recentEvent(state: SimulationState, civilizationId: string, tag: string, atHour: number, years: number): boolean {
  return state.events.some((event) =>
    event.visibility !== 'hidden' &&
    event.civilizationIds.includes(civilizationId) &&
    event.tags.includes(tag) &&
    atHour - event.atHour < years * HOURS_PER_YEAR
  );
}

export function simulateHeritageCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const artifacts = liveArtifacts(state, context).filter((entry) => entry.civilizationId === civilization.id);
  const archives = liveArchives(state, context).filter((entry) => entry.civilizationId === civilization.id);
  const ruins = liveRuins(state, context).filter((entry) => entry.civilizationId === civilization.id);
  const allUpdated = [...artifacts, ...archives, ...ruins].map((entry) => entry.lastUpdatedHour);
  if (allUpdated.length && atHour - Math.max(...allUpdated) < 270 * 24) return null;
  const rng = createRng(`${context.seed}:heritage:${civilization.id}:${Math.floor(atHour / HOURS_PER_YEAR)}`);
  const wars = liveWars(state).filter((war) => war.status === 'active');
  const warSystems = new Set(wars.flatMap((war) => war.fronts.map((front) => front.systemId)));
  const figures = liveHistoricalFigures(state, context).filter(
    (figure) => figure.civilizationId === civilization.id && figure.status === 'active'
  );

  const updatedArtifacts = artifacts.map((artifact) => {
    const atWar = artifact.currentSystemId ? warSystems.has(artifact.currentSystemId) : false;
    const lost = atWar && rng.chance(0.18);
    const integrity = clamp(artifact.integrity - (atWar ? rng.int(2, 8) : rng.int(0, 1)));
    const next: LiveArtifactState = {
      ...artifact,
      status: integrity <= 0 ? 'destroyed' : lost ? 'disputed' : artifact.status,
      integrity,
      publicKnowledge: clamp(artifact.publicKnowledge + (artifact.status === 'recovered' ? 2 : 0)),
      eventHistory: lost ? [...artifact.eventHistory, `war:${Math.floor(atHour)}`] : artifact.eventHistory,
      lastUpdatedHour: atHour
    };
    writeArtifactSnapshot(state, next, atHour);
    return next;
  });

  const updatedArchives = archives.map((archive) => {
    const atWar = warSystems.has(archive.systemId);
    const next: LiveArchiveState = {
      ...archive,
      integrity: clamp(archive.integrity - (atWar ? rng.int(3, 10) : rng.int(0, 1))),
      accessibility: clamp(archive.accessibility + rng.int(-2, 4) - (atWar ? 8 : 0)),
      deciphered: clamp(archive.deciphered + (figures.some((figure) => figure.domain === 'science') ? 2 : 1)),
      status: archive.integrity <= 8 ? 'destroyed' : atWar && archive.integrity < 45 ? 'damaged' : archive.status,
      lastUpdatedHour: atHour
    };
    writeArchiveSnapshot(state, next, atHour);
    return next;
  });

  const updatedRuins = ruins.map((ruin) => {
    const atWar = warSystems.has(ruin.systemId);
    const looted = clamp(ruin.looted + (atWar ? rng.int(3, 12) : rng.int(0, 2)));
    const integrity = clamp(ruin.integrity - (atWar ? rng.int(2, 7) : rng.int(0, 1)));
    const next: LiveRuinState = {
      ...ruin,
      integrity,
      excavation: clamp(ruin.excavation + (atWar ? 0 : rng.int(0, 3))),
      looted,
      status: integrity <= 5 ? 'collapsed' : looted >= 75 ? 'looted' : ruin.excavation >= 70 ? 'excavated' : ruin.status,
      lastUpdatedHour: atHour
    };
    writeRuinSnapshot(state, next, atHour);
    return next;
  });

  const disputed = updatedArtifacts.find((artifact) => artifact.status === 'disputed' && artifact.integrity > 0);
  if (disputed && !recentEvent(state, civilization.id, 'artifact-disputed', atHour, 2)) {
    return {
      kind: 'conflict',
      title: `${disputed.name}: спор о владении`,
      summary: 'Военные действия разорвали прежнюю цепочку владельцев. Государства, институты и наследники предъявили несовместимые права на артефакт.',
      severity: 7,
      visibility: 'public',
      systemIds: disputed.currentSystemId ? [disputed.currentSystemId] : [],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'heritage', 'artifact-disputed'],
      data: { artifactId: disputed.id, artifactIntegrity: disputed.integrity }
    };
  }

  const damagedArchive = updatedArchives.find((archive) => archive.status === 'damaged' || archive.status === 'destroyed');
  if (damagedArchive && !recentEvent(state, civilization.id, 'archive-damaged', atHour, 2)) {
    return {
      kind: 'disaster',
      title: `${damagedArchive.name}: архив повреждён`,
      summary: `Целостность хранилища упала до ${Math.round(damagedArchive.integrity)}/100. Часть документов утрачена или недоступна.`,
      severity: damagedArchive.status === 'destroyed' ? 9 : 6,
      visibility: 'public',
      systemIds: [damagedArchive.systemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'heritage', 'archive-damaged'],
      data: { archiveId: damagedArchive.id, archiveIntegrity: damagedArchive.integrity }
    };
  }

  const recoveredRuin = updatedRuins.find((ruin) => ruin.excavation >= 65 && ruin.status !== 'collapsed');
  if (recoveredRuin && !recentEvent(state, civilization.id, 'ruin-excavation', atHour, 3)) {
    return {
      kind: 'discovery',
      title: `${civilization.name}: вскрыт исторический комплекс`,
      summary: `Раскопки достигли ${Math.round(recoveredRuin.excavation)}/100. Археологи восстановили план поселения и нашли связанные архивы или артефакты.`,
      severity: 6,
      visibility: 'public',
      systemIds: [recoveredRuin.systemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'heritage', 'ruin-excavation'],
      data: { ruinId: recoveredRuin.id, excavation: recoveredRuin.excavation }
    };
  }

  const creator = figures.sort((a, b) => b.importance + b.influence - (a.importance + a.influence))[0];
  if (
    creator &&
    creator.importance + creator.influence >= 145 &&
    rng.chance(0.2) &&
    !recentEvent(state, civilization.id, 'artifact-created', atHour, 5)
  ) {
    return {
      kind: 'discovery',
      title: `${creator.name}: создан новый исторический артефакт`,
      summary: `${creator.role} заказал или создал объект, связанный с важным институтом. Его история начинается внутри живой симуляции.`,
      severity: 5,
      visibility: 'public',
      systemIds: [creator.systemId],
      civilizationIds: [civilization.id],
      factionIds: [],
      tags: ['simulation', 'living-history', 'heritage', 'artifact-created'],
      data: { creatorId: creator.id, generatedArtifactId: `artifact_living_${creator.id}_${Math.floor(atHour)}` }
    };
  }
  return null;
}
