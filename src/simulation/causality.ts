import type { SimulationState, WorldEvent, WorldEventDraft } from './types';

const LINK_SEPARATOR = '|';

export interface CausalEventLinks {
  causedByEventIds: string[];
  resultedInEventIds: string[];
  createdEntityIds: string[];
  changedEntityIds: string[];
  destroyedEntityIds: string[];
}

export interface CausalDraftOptions {
  causeEventIds?: string[];
  createdEntityIds?: string[];
  changedEntityIds?: string[];
  destroyedEntityIds?: string[];
  prospectiveEventId?: string;
}

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value?.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

function decode(value: unknown): string[] {
  return typeof value === 'string'
    ? unique(value.split(LINK_SEPARATOR))
    : [];
}

function encode(values: string[]): string | undefined {
  const clean = unique(values);
  return clean.length ? clean.join(LINK_SEPARATOR) : undefined;
}

export function causalLinksForEvent(event: WorldEvent): CausalEventLinks {
  return {
    causedByEventIds: decode(event.data?.causedByEventIds),
    resultedInEventIds: decode(event.data?.resultedInEventIds),
    createdEntityIds: decode(event.data?.createdEntityIds),
    changedEntityIds: decode(event.data?.changedEntityIds),
    destroyedEntityIds: decode(event.data?.destroyedEntityIds)
  };
}

export function prospectiveCivilizationCycleEventId(
  state: SimulationState,
  civilizationId: string,
  atHour: number
): string {
  return `world_${state.nextSequence}_civilization-cycle_${civilizationId}_${atHour}`;
}

export function recentCausalEvents(
  state: SimulationState,
  params: {
    civilizationIds?: string[];
    systemIds?: string[];
    tags?: string[];
    kinds?: WorldEvent['kind'][];
    beforeHour?: number;
    limit?: number;
  }
): WorldEvent[] {
  const civilizationIds = new Set(params.civilizationIds ?? []);
  const systemIds = new Set(params.systemIds ?? []);
  const tags = new Set(params.tags ?? []);
  const kinds = new Set(params.kinds ?? []);
  const beforeHour = params.beforeHour ?? Number.POSITIVE_INFINITY;
  const limit = Math.max(1, params.limit ?? 3);

  return state.events
    .filter((event) => event.atHour < beforeHour)
    .filter((event) => {
      const civilizationMatch =
        civilizationIds.size === 0 ||
        event.civilizationIds.some((id) => civilizationIds.has(id));
      const systemMatch =
        systemIds.size === 0 || event.systemIds.some((id) => systemIds.has(id));
      const causalSelectorMatch =
        (tags.size === 0 && kinds.size === 0) ||
        kinds.has(event.kind) ||
        event.tags.some((tag) => tags.has(tag));
      return civilizationMatch && systemMatch && causalSelectorMatch;
    })
    .slice(0, limit);
}

function appendResultLink(
  state: SimulationState,
  causeEventId: string,
  resultEventId: string
): void {
  const cause = state.events.find((event) => event.id === causeEventId);
  if (!cause) return;
  const links = causalLinksForEvent(cause);
  const resultedInEventIds = unique([...links.resultedInEventIds, resultEventId]);
  cause.data = {
    ...(cause.data ?? {}),
    resultedInEventIds: encode(resultedInEventIds) ?? ''
  };
}

export function causalizeDraft(
  state: SimulationState,
  draft: WorldEventDraft,
  options: CausalDraftOptions = {}
): WorldEventDraft {
  const causeEventIds = unique(options.causeEventIds ?? []);
  const createdEntityIds = unique(options.createdEntityIds ?? []);
  const changedEntityIds = unique(options.changedEntityIds ?? []);
  const destroyedEntityIds = unique(options.destroyedEntityIds ?? []);

  if (options.prospectiveEventId) {
    for (const causeEventId of causeEventIds) {
      appendResultLink(state, causeEventId, options.prospectiveEventId);
    }
  }

  return {
    ...draft,
    tags: unique([...draft.tags, 'causal-history']),
    data: {
      ...(draft.data ?? {}),
      ...(encode(causeEventIds)
        ? { causedByEventIds: encode(causeEventIds)! }
        : {}),
      ...(encode(createdEntityIds)
        ? { createdEntityIds: encode(createdEntityIds)! }
        : {}),
      ...(encode(changedEntityIds)
        ? { changedEntityIds: encode(changedEntityIds)! }
        : {}),
      ...(encode(destroyedEntityIds)
        ? { destroyedEntityIds: encode(destroyedEntityIds)! }
        : {})
    }
  };
}

export function causalChain(
  state: SimulationState,
  eventId: string,
  direction: 'causes' | 'results',
  maxDepth = 4
): WorldEvent[] {
  const byId = new Map(state.events.map((event) => [event.id, event]));
  const visited = new Set<string>([eventId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: eventId, depth: 0 }];
  const result: WorldEvent[] = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;
    const event = byId.get(current.id);
    if (!event) continue;
    const links = causalLinksForEvent(event);
    const nextIds =
      direction === 'causes' ? links.causedByEventIds : links.resultedInEventIds;
    for (const nextId of nextIds) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      const next = byId.get(nextId);
      if (!next) continue;
      result.push(next);
      queue.push({ id: nextId, depth: current.depth + 1 });
    }
  }

  return result;
}
