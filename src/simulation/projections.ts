import type { Contract, Hub, NewsItem, SimulationEvent } from '../game/types';

export function projectEventToNews(event: SimulationEvent, hubs: Hub[]): NewsItem | null {
  if (!event.visibleToPublic) return null;
  const sourceHub = hubs.find((hub) => hub.systemId === event.systemId);
  const category: NewsItem['category'] = event.kind === 'conflict' ? 'security'
    : event.kind === 'discovery' ? 'discovery'
      : event.kind === 'trade' || event.kind === 'shortage' ? 'trade'
        : 'politics';
  return {
    id: `news_from_${event.id}`,
    year: event.year,
    sourceHubId: sourceHub?.id,
    headline: event.title,
    text: event.summary,
    category,
    reliability: event.reliability,
    systemIds: event.systemId ? [event.systemId] : []
  };
}

export function projectEventToContract(event: SimulationEvent, hubs: Hub[], serial: number): Contract | null {
  if (!event.systemId || !['shortage', 'migration', 'conflict', 'discovery'].includes(event.kind)) return null;
  const issuer = hubs.find((hub) => hub.systemId !== event.systemId && hub.safety !== 'danger') ?? hubs[0];
  if (!issuer) return null;
  const type: Contract['type'] = event.kind === 'shortage' ? 'delivery'
    : event.kind === 'migration' ? 'rescue'
      : event.kind === 'conflict' ? 'bounty'
        : 'survey';
  return {
    id: `contract_event_${event.id}_${serial}`,
    type,
    status: 'available',
    issuerHubId: issuer.id,
    issuerFactionId: issuer.factionId,
    title: event.kind === 'shortage' ? 'Срочная поставка в дефицитный сектор'
      : event.kind === 'migration' ? 'Сопроводить гражданский транспорт'
        : event.kind === 'conflict' ? 'Проверить опасный маршрут'
          : 'Подтвердить новое открытие',
    description: event.summary,
    reward: 600 + Math.round(event.severity * 18),
    advance: 100,
    deadlineYear: event.year + 3,
    targetSystemId: event.systemId,
    progress: 0,
    requiredProgress: type === 'bounty' ? 2 : 1,
    illegal: false
  };
}
