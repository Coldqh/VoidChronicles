import type { Civilization } from '../game/types';
import type { SimulationContext } from './context';
import {
  causalizeDraft,
  prospectiveCivilizationCycleEventId,
  recentCausalEvents
} from './causality';
import { simulateCultureCycle } from './culture';
import { simulateEconomyCycle } from './economy';
import { simulatePopulationCycle } from './population';
import type { SimulationState, WorldEventDraft } from './types';

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function createdEntities(draft: WorldEventDraft): string[] {
  return unique([
    typeof draft.data?.cultureId === 'string' && draft.tags.includes('culture-formation')
      ? draft.data.cultureId
      : undefined
  ]);
}

export function simulateLivingSocietyCycle(
  state: SimulationState,
  civilization: Civilization,
  context: SimulationContext,
  atHour: number
): WorldEventDraft | null {
  const drafts = [
    simulateEconomyCycle(state, civilization, context, atHour),
    simulateCultureCycle(state, civilization, context, atHour),
    simulatePopulationCycle(state, civilization, context, atHour)
  ].filter((draft): draft is WorldEventDraft => Boolean(draft));

  if (!drafts.length) return null;
  const draft = drafts.sort((a, b) => b.severity - a.severity)[0]!;
  const causes = recentCausalEvents(state, {
    civilizationIds: [civilization.id],
    systemIds: draft.systemIds,
    kinds: ['shortage', 'conflict', 'politics', 'migration', 'disaster', 'ecology', 'economy', 'demography'],
    tags: ['living-war', 'living-polity', 'living-economy', 'living-culture', 'living-society', 'causal-history'],
    beforeHour: atHour,
    limit: 4
  }).map((event) => event.id);

  return causalizeDraft(state, draft, {
    causeEventIds: causes,
    createdEntityIds: createdEntities(draft),
    changedEntityIds: unique([
      civilization.id,
      ...draft.systemIds,
      ...Object.values(state.settlements)
        .filter((settlement) =>
          settlement.civilizationId === civilization.id && draft.systemIds.includes(settlement.systemId)
        )
        .map((settlement) => settlement.id)
    ]),
    prospectiveEventId: prospectiveCivilizationCycleEventId(state, civilization.id, atHour)
  });
}
