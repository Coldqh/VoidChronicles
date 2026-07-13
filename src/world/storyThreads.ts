import type { ArchaeologyChain, Civilization, Contract, Faction, NewsItem, ResearchProject, WorldThread } from '../game/types';

export function initializeWorldThreads(civilizations: Civilization[], factions: Faction[], chains: ArchaeologyChain[], year: number): WorldThread[] {
  const threads: WorldThread[] = [];
  for (const chain of chains.slice(0, 4)) {
    const civ = civilizations.find((entry) => entry.id === chain.civilizationId);
    threads.push({
      id: `thread_arch_${chain.id}`,
      category: 'discovery', status: 'active', title: chain.title,
      summary: `${civ?.name ?? 'Неизвестная цивилизация'} оставила связанную цепь следов. История пока неполна.`,
      urgency: 35, progress: 0, systemIds: chain.stages.map((stage) => stage.targetSystemId), civilizationIds: [chain.civilizationId],
      factionIds: [], relatedArtifactIds: [], playerInvolved: false, nextAction: chain.stages.find((stage) => stage.status === 'active')?.title,
      updates: [{ id: `update_${chain.id}_0`, year, text: 'Архив связал несколько объектов в единую историческую линию.', tone: 'info' }]
    });
  }
  for (const faction of factions.filter((entry) => entry.enemies.length > 0).slice(0, 3)) {
    const enemy = factions.find((entry) => entry.id === faction.enemies[0]);
    threads.push({
      id: `thread_conflict_${faction.id}`,
      category: 'conflict', status: faction.disposition === 'hostile' ? 'escalating' : 'emerging', title: `${faction.name}: борьба за влияние`,
      summary: `${faction.name} и ${enemy?.name ?? 'неизвестный противник'} расширяют давление на маршруты и хабы.`,
      urgency: 45 + faction.military / 3, progress: 12, systemIds: [], civilizationIds: [faction.civilizationId].filter(Boolean) as string[],
      factionIds: [faction.id, ...(enemy ? [enemy.id] : [])], relatedArtifactIds: [], playerInvolved: false,
      nextAction: 'Следить за новостями и контрактами сторон.', updates: [{ id: `update_${faction.id}_0`, year, text: 'Зафиксировано усиление патрулей и торговых ограничений.', tone: 'warning' }]
    });
  }
  return threads.slice(0, 8);
}

export function syncWorldThreads(threads: WorldThread[], contracts: Contract[], news: NewsItem[], research: ResearchProject[], year: number): WorldThread[] {
  const activeContracts = contracts.filter((entry) => entry.status === 'active');
  const next = threads.map((thread) => {
    const relevantContract = activeContracts.find((contract) => thread.systemIds.includes(contract.targetSystemId) || thread.factionIds.includes(contract.issuerFactionId));
    const relevantNews = news.find((item) => item.year >= year - 2 && item.systemIds.some((id) => thread.systemIds.includes(id)));
    const delta = relevantContract ? 8 : relevantNews ? 4 : 1;
    const progress = Math.min(100, thread.progress + delta);
    const status = progress >= 100 ? 'resolved' as const : progress >= 70 ? 'escalating' as const : thread.status;
    const updates = relevantNews && !thread.updates.some((update) => update.text === relevantNews.headline)
      ? [{ id: `thread_update_${thread.id}_${year}_${thread.updates.length}`, year, text: relevantNews.headline, tone: relevantNews.category === 'security' ? 'warning' as const : 'info' as const }, ...thread.updates].slice(0, 8)
      : thread.updates;
    return { ...thread, progress, status, playerInvolved: thread.playerInvolved || Boolean(relevantContract), updates };
  });
  for (const project of research.filter((entry) => entry.status === 'active')) {
    if (next.some((thread) => thread.id === `thread_research_${project.id}`)) continue;
    next.unshift({
      id: `thread_research_${project.id}`, category: 'research', status: 'active', title: project.title,
      summary: 'Лаборатория пытается превратить неизвестный принцип в работающую технологию.', urgency: project.risk * 8,
      progress: Math.round(project.progress / project.requiredProgress * 100), systemIds: [], civilizationIds: [], factionIds: [],
      relatedArtifactIds: [project.artifactId], playerInvolved: true, nextAction: 'Провести следующий исследовательский цикл.',
      updates: [{ id: `thread_research_update_${project.id}`, year, text: 'Объект переведён в активную фазу анализа.', tone: 'info' }]
    });
  }
  return next.slice(0, 12);
}
