import type { Contract, Faction, NewsItem, ResearchProject, WarFront, WorldThread } from '../game/types';
import type { PlayerKnowledgeState, SimulationState, WorldEvent } from './types';
import { knowsEntity } from './knowledge';
import { worldYear } from './clock';

function categoryFor(event: WorldEvent): NewsItem['category'] {
  if (['conflict', 'disaster', 'shortage'].includes(event.kind)) return 'security';
  if (event.kind === 'discovery' || event.kind === 'research' || event.kind === 'ecology') return 'discovery';
  if (event.kind === 'politics' || event.kind === 'migration') return 'politics';
  return 'trade';
}

export function projectNewsFromEvents(
  events: WorldEvent[],
  knowledge: PlayerKnowledgeState,
  existing: NewsItem[],
  currentSystemId?: string
): NewsItem[] {
  const known = events.filter((event) => {
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

  for (const event of simulation.events.filter((entry) => entry.severity >= 4).slice(0, 12)) {
    threads.push({
      id: `thread_event_${event.id}`,
      category: event.kind === 'conflict' ? 'conflict' : event.kind === 'ecology' || (event.kind === 'disaster' && event.tags.includes('ecology')) ? 'ecology' : event.kind === 'research' || event.kind === 'discovery' ? 'discovery' : event.kind === 'politics' ? 'politics' : 'culture',
      status: event.severity >= 7 ? 'escalating' : 'active',
      title: event.title,
      summary: event.summary,
      urgency: Math.min(100, event.severity * 11),
      progress: 15,
      systemIds: event.systemIds,
      civilizationIds: event.civilizationIds,
      factionIds: event.factionIds,
      relatedArtifactIds: [],
      playerInvolved: false,
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
    .slice(0, 24);
}

export function projectContractsFromEvents(args: {
  events: WorldEvent[];
  existing: Contract[];
  hubs: { id: string; systemId: string; factionId: string; safety: string }[];
  year: number;
}): Contract[] {
  const { events, existing, hubs, year } = args;
  const generated: Contract[] = [];
  for (const event of events.filter((entry) => ['shortage', 'migration', 'conflict', 'disaster', 'ecology'].includes(entry.kind))) {
    const targetSystemId = event.systemIds[0];
    const issuer = hubs.find((hub) => hub.safety !== 'danger' && hub.systemId !== targetSystemId) ?? hubs.find((hub) => hub.safety !== 'danger');
    if (!targetSystemId || !issuer) continue;
    const id = `contract_from_${event.id}`;
    if (existing.some((entry) => entry.id === id)) continue;
    const ecologyCrisis = event.kind === 'ecology' || event.tags.includes('ecology');
    const type: Contract['type'] = event.kind === 'shortage' ? 'delivery' : ecologyCrisis ? 'survey' : event.kind === 'migration' || event.kind === 'disaster' ? 'rescue' : 'bounty';
    generated.push({
      id,
      type,
      status: 'available',
      issuerHubId: issuer.id,
      issuerFactionId: issuer.factionId,
      title: event.kind === 'shortage' ? 'Срочная поставка в зону дефицита' : ecologyCrisis ? 'Исследование экологического кризиса' : event.kind === 'migration' ? 'Сопровождение гражданского транспорта' : event.kind === 'disaster' ? 'Поиск выживших после катастрофы' : 'Работа в зоне конфликта',
      description: event.summary,
      reward: 700 + event.severity * 180,
      advance: 100 + event.severity * 20,
      deadlineYear: year + Math.max(1, 5 - Math.floor(event.severity / 3)),
      targetSystemId,
      progress: 0,
      requiredProgress: type === 'bounty' ? 3 : 1,
      illegal: false,
      hiddenClause: event.visibility === 'local' ? 'Данные о ситуации могут быть неполными.' : undefined
    });
  }
  return [...generated, ...existing].slice(0, 500);
}
