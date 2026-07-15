import type { Contract, Faction, NewsItem, ResearchProject, WarFront, WorldThread } from '../game/types';
import type { PlayerKnowledgeState, SimulationState, WorldEvent } from './types';
import { knowsEntity } from './knowledge';
import { worldYear } from './clock';
import { reconcileWorldContractConsequences } from './playerConsequences';
import {
  contractFromWorldNeed,
  sourceEventIdForContract,
  worldNeedKindLabel,
  worldNeedsFromEvents
} from './worldGameplay';

function visibleProjectionEvent(event: WorldEvent): boolean {
  return event.visibility !== 'hidden' && !event.tags.includes('state-snapshot');
}

function categoryFor(event: WorldEvent): NewsItem['category'] {
  if (['conflict', 'disaster', 'shortage'].includes(event.kind)) return 'security';
  if (event.kind === 'discovery' || event.kind === 'research' || event.kind === 'ecology') return 'discovery';
  if (['politics', 'migration', 'demography'].includes(event.kind)) return 'politics';
  return 'trade';
}

export function projectNewsFromEvents(
  events: WorldEvent[],
  knowledge: PlayerKnowledgeState,
  existing: NewsItem[],
  currentSystemId?: string
): NewsItem[] {
  const known = events.filter((event) => {
    if (!visibleProjectionEvent(event)) return false;
    if (event.visibility === 'public') return true;
    if (currentSystemId && event.systemIds.includes(currentSystemId)) return true;
    return event.systemIds.some((id) => knowsEntity(knowledge, 'system', id));
  });
  const projected = known.map<NewsItem>((event) => ({
    id: `news_from_${event.id}`,
    year: Math.floor(event.atHour / (24 * 365)),
    headline: event.title,
    text: event.summary,
    category: categoryFor(event),
    reliability: event.visibility === 'public' ? 88 : event.visibility === 'local' ? 72 : 48,
    systemIds: event.systemIds
  }));
  const ids = new Set(projected.map((entry) => entry.id));
  return [...projected, ...existing.filter((entry) => !ids.has(entry.id))].slice(0, 500);
}

export function projectWorldThreads(args: {
  simulation: SimulationState;
  warFronts: WarFront[];
  factions: Faction[];
  contracts: Contract[];
  research: ResearchProject[];
}): WorldThread[] {
  const { simulation, warFronts, factions, contracts, research } = args;
  reconcileWorldContractConsequences(simulation, contracts, factions);
  const year = worldYear(simulation.clock);
  const threads: WorldThread[] = [];

  for (const front of warFronts.filter((entry) => entry.status !== 'resolved')) {
    const attacker = factions.find((entry) => entry.id === front.attackerFactionId);
    const defender = factions.find((entry) => entry.id === front.defenderFactionId);
    threads.push({
      id: `thread_war_${front.id}`,
      category: 'conflict',
      status: front.status === 'active' ? 'escalating' : 'active',
      title: `${attacker?.name ?? 'Неизвестная сила'} против ${defender?.name ?? 'неизвестного противника'}`,
      summary: `Интенсивность ${front.intensity}/100. Счёт ${front.attackerScore}:${front.defenderScore}.`,
      urgency: front.intensity,
      progress: Math.min(99, Math.abs(front.attackerScore - front.defenderScore) * 10),
      systemIds: front.systemIds,
      civilizationIds: [],
      factionIds: [front.attackerFactionId, front.defenderFactionId],
      relatedArtifactIds: [],
      playerInvolved: Boolean(front.playerSide),
      nextAction: 'Следить за фронтом и доступными контрактами.',
      updates: [{ id: `world_update_${front.id}_${year}`, year, text: `Состояние фронта обновлено в году ${year}.`, tone: front.status === 'active' ? 'warning' : 'info' }]
    });
  }

  const activeSourceIds = new Set(
    contracts
      .filter((contract) => contract.status === 'active')
      .map(sourceEventIdForContract)
      .filter((id): id is string => Boolean(id))
  );
  for (const need of worldNeedsFromEvents(simulation.events, 12)) {
    const contract = contracts.find((entry) => sourceEventIdForContract(entry) === need.sourceEventId);
    const resolved = contract && ['completed', 'failed', 'expired'].includes(contract.status);
    if (resolved) continue;
    threads.push({
      id: `thread_need_${need.sourceEventId}`,
      category: need.kind === 'ecological-restoration' ? 'ecology' :
        need.kind === 'heritage-recovery' || need.kind === 'investigation' ? 'discovery' :
          need.kind === 'route-security' || need.kind === 'mediation' || need.kind === 'containment' ? 'conflict' : 'politics',
      status: need.urgency >= 75 ? 'escalating' : activeSourceIds.has(need.sourceEventId) ? 'active' : 'emerging',
      title: need.title,
      summary: need.summary,
      urgency: need.urgency,
      progress: activeSourceIds.has(need.sourceEventId) ? 35 : 5,
      systemIds: [need.targetSystemId],
      civilizationIds: need.civilizationIds,
      factionIds: need.factionIds,
      relatedArtifactIds: [],
      playerInvolved: activeSourceIds.has(need.sourceEventId),
      nextAction: activeSourceIds.has(need.sourceEventId)
        ? `Выполнить задачу: ${worldNeedKindLabel(need.kind).toLowerCase()}.`
        : 'Найти безопасный хаб и проверить доску контрактов.',
      updates: [{
        id: `need_update_${need.sourceEventId}_${year}`,
        year,
        text: `Успех: ${need.successImpact}. Провал: ${need.failureImpact}.`,
        tone: need.urgency >= 75 ? 'danger' : 'warning'
      }]
    });
  }

  for (const event of simulation.events
    .filter((entry) => visibleProjectionEvent(entry) && entry.severity >= 4)
    .slice(0, 18)) {
    if (threads.some((thread) => thread.id === `thread_need_${event.id}`)) continue;
    threads.push({
      id: `thread_event_${event.id}`,
      category: event.kind === 'conflict' ? 'conflict' : event.kind === 'ecology' || (event.kind === 'disaster' && event.tags.includes('ecology')) ? 'ecology' : event.kind === 'research' || event.kind === 'discovery' ? 'discovery' : event.kind === 'politics' || event.kind === 'economy' || event.kind === 'shortage' ? 'politics' : 'culture',
      status: event.severity >= 7 ? 'escalating' : event.tags.includes('player-world-consequence') ? 'resolved' : 'active',
      title: event.title,
      summary: event.summary,
      urgency: Math.min(100, event.severity * 11),
      progress: event.tags.includes('player-world-consequence') ? 100 : 15,
      systemIds: event.systemIds,
      civilizationIds: event.civilizationIds,
      factionIds: event.factionIds,
      relatedArtifactIds: [],
      playerInvolved: event.tags.includes('player-world-consequence'),
      nextAction: event.tags.includes('player-world-consequence') ? 'Последствие записано в Хронику.' : undefined,
      updates: [{ id: `thread_event_update_${event.id}`, year, text: event.summary, tone: event.severity >= 7 ? 'warning' : 'info' }]
    });
  }

  for (const project of research.filter((entry) => entry.status === 'active')) {
    threads.push({
      id: `thread_research_${project.id}`,
      category: 'research',
      status: 'active',
      title: project.title,
      summary: 'Исследовательская работа идёт на борту корабля.',
      urgency: project.risk * 8,
      progress: Math.round(project.progress / project.requiredProgress * 100),
      systemIds: [], civilizationIds: [], factionIds: [], relatedArtifactIds: [project.artifactId],
      playerInvolved: true,
      nextAction: 'Провести следующий исследовательский цикл.',
      updates: [{ id: `thread_research_${project.id}_${year}`, year, text: `Прогресс ${project.progress}/${project.requiredProgress}.`, tone: 'info' }]
    });
  }

  const activeContractSystems = new Set(contracts.filter((entry) => entry.status === 'active').map((entry) => entry.targetSystemId));
  return threads
    .map((thread) => ({ ...thread, playerInvolved: thread.playerInvolved || thread.systemIds.some((id) => activeContractSystems.has(id)) }))
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 36);
}

export function projectContractsFromEvents(args: {
  events: WorldEvent[];
  existing: Contract[];
  hubs: { id: string; systemId: string; factionId: string; safety: string }[];
  year: number;
}): Contract[] {
  const { events, existing, hubs, year } = args;
  const generated: Contract[] = [];
  for (const need of worldNeedsFromEvents(events, 80)) {
    const id = `contract_from_${need.sourceEventId}`;
    if (existing.some((entry) => entry.id === id)) continue;
    const issuer = hubs.find((hub) => hub.safety !== 'danger' && hub.systemId === need.targetSystemId) ??
      hubs.find((hub) => hub.safety !== 'danger' && hub.systemId !== need.targetSystemId) ??
      hubs.find((hub) => hub.safety !== 'danger');
    if (!issuer) continue;
    generated.push(contractFromWorldNeed(need, {
      issuerHubId: issuer.id,
      issuerFactionId: issuer.factionId,
      year
    }));
  }
  return [...generated, ...existing].slice(0, 500);
}
