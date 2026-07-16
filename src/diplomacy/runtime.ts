import { createRng } from '../generation/rng';
import { useGameStore } from '../game/store';
import { adjustSystemEconomy, recordWorldEvent } from '../simulation/kernel';
import { revealKnowledge } from '../simulation/knowledge';
import { worldYear } from '../simulation/clock';
import {
  availableDiplomaticActions,
  diplomaticProfile,
  resolveDiplomaticOutcome,
  type DiplomaticActionId,
  type DiplomaticOutcome
} from './model';

const running = new Set<string>();
const clamp = (value: number, min = -100, max = 100): number => Math.max(min, Math.min(max, Math.round(value)));

const outcomeText: Record<DiplomaticOutcome, string> = {
  accepted: 'Предложение принято.',
  conditional: 'Предложение принято с ограничениями.',
  rejected: 'Предложение отклонено.'
};

const actionTitle: Record<DiplomaticActionId, string> = {
  'offer-trade': 'Торговое предложение',
  'send-aid': 'Гуманитарная помощь',
  'request-landing': 'Запрос посадочного доступа',
  'exchange-data': 'Научный обмен',
  'return-heritage': 'Возвращение культурного наследия',
  'mediate-crisis': 'Предложение посредничества'
};

function dispositionFor(reputation: number) {
  if (reputation >= 35) return 'friendly' as const;
  if (reputation <= -35) return 'hostile' as const;
  if (reputation < -5) return 'wary' as const;
  return 'neutral' as const;
}

export async function executeDiplomaticAction(
  civilizationId: string,
  actionId: DiplomaticActionId
): Promise<{ ok: boolean; message: string }> {
  const key = `${civilizationId}:${actionId}`;
  if (running.has(key)) return { ok: false, message: 'Ответ по этому каналу уже обрабатывается.' };
  running.add(key);
  try {
    const state = useGameStore.getState();
    if (!state.galaxy || !state.simulation || !state.captain || !state.ship) return { ok: false, message: 'Нет активной кампании.' };
    const civilization = state.galaxy.civilizations.find((entry) => entry.id === civilizationId);
    const contact = state.civilizationContacts.find((entry) => entry.civilizationId === civilizationId);
    if (!civilization || !contact || civilization.status === 'dead') return { ok: false, message: 'Канал недоступен.' };

    const heritageItem = state.ship.cargo.find((item) => {
      if (!item.artifactId) return false;
      return state.galaxy?.artifacts.find((artifact) => artifact.id === item.artifactId)?.civilizationId === civilizationId;
    });
    const settlement = Object.values(state.simulation.settlements).find((entry) => entry.civilizationId === civilizationId && entry.systemId === state.currentSystemId)
      ?? Object.values(state.simulation.settlements).find((entry) => entry.civilizationId === civilizationId && !entry.abandoned);
    const hasCrisis = state.worldThreads.some((thread) => thread.civilizationIds.includes(civilizationId) && ['active', 'escalating'].includes(thread.status));
    const profile = diplomaticProfile(civilization, contact, state.simulation.events);
    const actions = availableDiplomaticActions(profile, {
      hasHeritage: Boolean(heritageItem),
      hasSettlement: Boolean(settlement),
      hasCrisis,
      hasTradeAgreement: profile.agreements.includes('trade'),
      hasLandingAccess: profile.agreements.includes('landing')
    });
    const action = actions.find((entry) => entry.id === actionId);
    if (!action?.available) return { ok: false, message: action?.blockedReason ?? 'Действие недоступно.' };
    if (state.captain.credits < action.cost) return { ok: false, message: `Нужно ${action.cost} кредитов.` };

    const diplomatBonus = state.crew.some((member) => member.status === 'active' && (member.primaryRole === 'diplomat' || member.secondaryRole === 'diplomat')) ? 0.14 : 0;
    const rng = createRng(`${state.galaxy.seed}:diplomacy:${civilizationId}:${actionId}:${state.simulation.nextSequence}:${contact.attempts}`);
    const outcome = resolveDiplomaticOutcome(actionId, profile, civilization, rng.next(), diplomatBonus);
    const accepted = outcome !== 'rejected';
    const full = outcome === 'accepted';
    const trustDelta = accepted ? (actionId === 'return-heritage' ? 20 : actionId === 'send-aid' ? 13 : full ? 8 : 4) : -7;
    const respectDelta = accepted ? (actionId === 'return-heritage' ? 24 : actionId === 'mediate-crisis' ? 12 : 5) : -2;
    const suspicionDelta = accepted ? -Math.max(2, actionId === 'exchange-data' ? 5 : 3) : 8;
    const agreement = accepted
      ? actionId === 'offer-trade' ? 'trade'
        : actionId === 'request-landing' ? 'landing'
          : actionId === 'exchange-data' ? 'research'
            : actionId === 'mediate-crisis' ? 'mediation'
              : ''
      : '';

    let simulation = structuredClone(state.simulation);
    const relatedFaction = state.factions.find((faction) => faction.civilizationId === civilizationId);
    let knowledge = state.knowledge;
    let captain = { ...state.captain, credits: state.captain.credits - (accepted ? action.cost : 0) };
    let ship = { ...state.ship, cargo: [...state.ship.cargo] };
    let worldThreads = state.worldThreads;
    let warFronts = state.warFronts;

    if (accepted && actionId === 'offer-trade') {
      const targetSystemId = settlement?.systemId ?? state.currentSystemId;
      if (targetSystemId) simulation = adjustSystemEconomy(simulation, targetSystemId, { supply: full ? 8 : 4, tradePressure: full ? 7 : 3, prosperity: full ? 4 : 2 });
      if (settlement) {
        const current = simulation.settlements[settlement.id]!;
        simulation.settlements[settlement.id] = {
          ...current,
          stocks: {
            ...current.stocks,
            food: current.stocks.food + (full ? 90 : 45),
            medicine: current.stocks.medicine + (full ? 60 : 30),
            parts: current.stocks.parts + (full ? 50 : 25)
          }
        };
        const route = Object.values(simulation.tradeRoutes).find((entry) => entry.originSettlementId === settlement.id || entry.destinationSettlementId === settlement.id);
        if (route) simulation.tradeRoutes[route.id] = { ...route, disrupted: false, danger: Math.max(0, Math.round(route.danger - (full ? 10 : 5))), traffic: Math.min(100, Math.round(route.traffic + (full ? 12 : 6))), capacity: Math.round(route.capacity + (full ? 8 : 4)) };
      }
    }

    if (accepted && actionId === 'send-aid' && settlement) {
      const current = simulation.settlements[settlement.id]!;
      simulation.settlements[settlement.id] = {
        ...current,
        health: Math.min(100, Math.round(current.health + (full ? 7 : 4))),
        unrest: Math.max(0, Math.round(current.unrest - (full ? 6 : 3))),
        stocks: {
          ...current.stocks,
          food: current.stocks.food + (full ? 160 : 90),
          medicine: current.stocks.medicine + (full ? 120 : 70),
          water: current.stocks.water + (full ? 110 : 60)
        }
      };
    }

    if (accepted && actionId === 'exchange-data') {
      const civilizationState = simulation.civilizations[civilizationId];
      if (civilizationState) simulation.civilizations[civilizationId] = { ...civilizationState, research: Math.min(100, Math.round(civilizationState.research + (full ? 6 : 3))) };
      knowledge = revealKnowledge(knowledge, 'civilization', civilizationId, ['economy', 'society', 'history', 'figures', 'institutions'], simulation.clock.absoluteHour, 'contact', full ? 90 : 76);
    }

    if (accepted && actionId === 'request-landing') {
      knowledge = revealKnowledge(knowledge, 'civilization', civilizationId, ['territory', 'politics', 'settlements'], simulation.clock.absoluteHour, 'contact', full ? 92 : 78);
    }

    if (accepted && actionId === 'return-heritage' && heritageItem) {
      ship = { ...ship, cargo: ship.cargo.filter((item) => item.id !== heritageItem.id) };
      captain = { ...captain, reputation: captain.reputation + 4 };
      knowledge = revealKnowledge(knowledge, 'civilization', civilizationId, ['history', 'culture', 'institutions'], simulation.clock.absoluteHour, 'contact', 96);
    }

    if (accepted && actionId === 'mediate-crisis') {
      worldThreads = state.worldThreads.map((thread) => thread.civilizationIds.includes(civilizationId) && ['active', 'escalating'].includes(thread.status)
        ? { ...thread, urgency: Math.max(0, thread.urgency - (full ? 12 : 6)), progress: Math.min(100, thread.progress + (full ? 14 : 7)), updates: [{ id: `diplomacy_update_${simulation.nextSequence}_${thread.id}`, year: state.gameYear, text: 'Посредничество капитана снизило локальное напряжение.', tone: 'good' as const }, ...thread.updates].slice(0, 24) }
        : thread);
      if (settlement) simulation = adjustSystemEconomy(simulation, settlement.systemId, { security: full ? 6 : 3, migrationPressure: full ? -7 : -3 });
      if (relatedFaction) warFronts = state.warFronts.map((front) => front.attackerFactionId === relatedFaction.id || front.defenderFactionId === relatedFaction.id
        ? { ...front, intensity: Math.max(0, Math.round(front.intensity - (full ? 14 : 7))), status: front.intensity <= (full ? 14 : 7) ? 'ceasefire' as const : front.status, lastUpdateYear: state.gameYear }
        : front);
    }

    const factions = state.factions.map((faction) => {
      if (faction.id !== relatedFaction?.id) return faction;
      const reputation = clamp(faction.reputation + (accepted ? (full ? 7 : 4) : -5));
      return {
        ...faction,
        reputation,
        disposition: dispositionFor(reputation),
        memories: [{
          id: `faction_diplomacy_${simulation.nextSequence}_${actionId}`,
          year: state.gameYear,
          action: `diplomacy-${actionId}`,
          impact: accepted ? (full ? 7 : 4) : -5,
          text: `${actionTitle[actionId]}: ${outcomeText[outcome]}`
        }, ...faction.memories].slice(0, 30)
      };
    });

    const recorded = recordWorldEvent(simulation, {
      kind: 'politics',
      title: `${actionTitle[actionId]} — ${civilization.name}`,
      summary: `${outcomeText[outcome]} Доверие ${trustDelta >= 0 ? '+' : ''}${trustDelta}, уважение ${respectDelta >= 0 ? '+' : ''}${respectDelta}.`,
      severity: outcome === 'rejected' ? 5 : actionId === 'mediate-crisis' ? 6 : 3,
      visibility: outcome === 'rejected' ? 'local' : 'public',
      systemIds: [...new Set([state.currentSystemId, settlement?.systemId].filter((id): id is string => Boolean(id)))],
      civilizationIds: [civilizationId],
      factionIds: relatedFaction ? [relatedFaction.id] : [],
      tags: ['diplomacy', 'player-action', actionId, outcome],
      data: {
        diplomaticAction: actionId,
        diplomaticOutcome: outcome,
        diplomaticTrustDelta: trustDelta,
        diplomaticRespectDelta: respectDelta,
        diplomaticSuspicionDelta: suspicionDelta,
        diplomaticFearDelta: 0,
        diplomaticAgreement: agreement,
        diplomaticArtifactId: heritageItem?.artifactId ?? ''
      }
    });
    simulation = recorded.simulation;
    const nextContact = {
      ...contact,
      trust: clamp(contact.trust + trustDelta),
      lastContactYear: worldYear(simulation.clock),
      notes: [`${actionTitle[actionId]}: ${outcomeText[outcome]}`, ...contact.notes].slice(0, 16)
    };

    useGameStore.setState({
      simulation,
      knowledge,
      captain,
      ship,
      factions,
      worldThreads,
      warFronts,
      civilizationContacts: [nextContact, ...state.civilizationContacts.filter((entry) => entry.civilizationId !== civilizationId)],
      logs: [{
        id: `log_diplomacy_${recorded.event.id}`,
        year: worldYear(simulation.clock),
        title: actionTitle[actionId],
        text: `${civilization.name}: ${outcomeText[outcome]}`,
        tone: outcome === 'rejected' ? 'warning' as const : 'good' as const
      }, ...state.logs].slice(0, 750)
    });
    await useGameStore.getState().advanceWorld(1, `diplomacy:${actionId}:${civilizationId}`);
    return { ok: accepted, message: `${outcomeText[outcome]} ${civilization.name}` };
  } finally {
    running.delete(key);
  }
}
