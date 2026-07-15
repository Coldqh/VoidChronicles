import { useMemo, useState } from 'react';
import { useGameStore, type MainScreen } from '../game/store';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { causalLinksForEvent } from '../simulation/causality';
import { cultureSummaryForCivilization } from '../simulation/culture';
import { industrySectorLabel, liveEconomies } from '../simulation/economy';
import { liveHistoricalFigures, liveInstitutions } from '../simulation/figures';
import { liveArchives, liveArtifacts, liveRuins } from '../simulation/heritage';
import { planetaryImpacts } from '../simulation/planetaryConsequences';
import { livePolities, polityFormLabel } from '../simulation/polities';
import { liveSocieties } from '../simulation/population';
import type { SettlementResource, SettlementState } from '../simulation/types';
import { liveWars, warGoalLabel } from '../simulation/war';

const categoryLabel: Record<string, string> = {
  politics: 'Политика', discovery: 'Открытие', conflict: 'Конфликт',
  culture: 'Культура', research: 'Исследование', crew: 'Экипаж', ecology: 'Экология'
};
const resourceLabel: Record<SettlementResource, string> = {
  food: 'пища', water: 'вода', energy: 'энергия', medicine: 'лекарства', parts: 'детали',
  weapons: 'оружие', luxury: 'предметы роскоши', rareMaterials: 'редкие материалы'
};

function stockDays(settlement: SettlementState, resource: SettlementResource): number {
  return Math.floor(settlement.stocks[resource] / Math.max(0.01, settlement.consumption[resource]));
}

function SettlementDetail({ settlement, systemName, onBack }: { settlement: SettlementState; systemName: string; onBack?(): void }) {
  const vital: SettlementResource[] = ['food', 'water', 'energy', 'medicine'];
  const shortages = vital.filter((resource) => stockDays(settlement, resource) < 20);
  return <section className="mobile-detail-view settlement-detail">
    {onBack && <button className="mobile-back" onClick={onBack}>← Все поселения</button>}
    <span className="eyebrow">{settlement.kind.toUpperCase()} · {systemName}</span>
    <h2>{settlement.name}</h2>
    <p className="mobile-lead">Население {settlement.population.toLocaleString('ru-RU')} · {settlement.abandoned ? 'покинуто' : 'действует'}</p>
    <div className="mobile-inline-stats settlement-core-stats">
      <span>Инфраструктура <b>{settlement.infrastructure}</b></span>
      <span>Безопасность <b>{settlement.security}</b></span>
      <span>Беспорядки <b>{settlement.unrest}</b></span>
      <span>Здоровье <b>{settlement.health}</b></span>
    </div>
    {shortages.length > 0 && <article className="mobile-action-card warning"><b>Дефицит</b><p>{shortages.map((resource) => resourceLabel[resource]).join(' · ')}</p></article>}
    <section className="settlement-stock-grid">{vital.map((resource) => <div className={stockDays(settlement, resource) < 20 ? 'shortage' : ''} key={resource}><span>{resourceLabel[resource]}</span><b>{stockDays(settlement, resource)} дн.</b></div>)}</section>
    <details className="mobile-collapsible"><summary>Производство и потребление</summary>{Object.keys(resourceLabel).map((key) => { const resource = key as SettlementResource; return <div className="settlement-resource-row" key={resource}><span>{resourceLabel[resource]}</span><b>+{settlement.production[resource].toFixed(1)} / −{settlement.consumption[resource].toFixed(1)}</b></div>; })}</details>
  </section>;
}

export function WorldScreen({ chrome }: { chrome: React.ReactNode }) {
  const store = useGameStore();
  const compact = useCompactLayout();
  const knownSystemIds = useMemo(() => new Set(store.galaxy?.systems.filter((system) => system.visited || system.scanned).map((system) => system.id) ?? []), [store.galaxy]);
  const knownFactionIds = useMemo(() => new Set(store.hubs.filter((hub) => hub.visited || hub.id === store.currentHubId).map((hub) => hub.factionId)), [store.hubs, store.currentHubId]);
  const knownCivilizationIds = useMemo(() => new Set(store.civilizationContacts.filter((contact) => contact.stage !== 'unknown').map((contact) => contact.civilizationId)), [store.civilizationContacts]);
  const visibleThreads = useMemo(() => store.worldThreads.filter((thread) =>
    thread.playerInvolved || thread.systemIds.some((id) => knownSystemIds.has(id)) || thread.factionIds.some((id) => knownFactionIds.has(id)) || thread.civilizationIds.some((id) => knownCivilizationIds.has(id))
  ), [store.worldThreads, knownSystemIds, knownFactionIds, knownCivilizationIds]);
  const visibleNews = useMemo(() => store.news.filter((entry) => entry.systemIds.some((id) => knownSystemIds.has(id))), [store.news, knownSystemIds]);
  const visibleSettlements = useMemo(() => (Object.values(store.simulation?.settlements ?? {}) as SettlementState[])
    .filter((entry) => knownSystemIds.has(entry.systemId))
    .sort((a, b) => b.population - a.population), [store.simulation?.settlements, knownSystemIds]);
  const polities = useMemo(() => {
    if (!store.galaxy || !store.simulation) return [];
    return livePolities(store.simulation, { seed: store.galaxy.seed, galaxy: store.galaxy, factions: store.factions, hubs: store.hubs });
  }, [store.galaxy, store.simulation, store.factions, store.hubs]);
  const visiblePolities = useMemo(() => polities.filter((polity) => polity.status === 'active' && polity.territorySystemIds.some((id) => knownSystemIds.has(id))), [polities, knownSystemIds]);
  const wars = useMemo(() => store.simulation ? liveWars(store.simulation) : [], [store.simulation]);
  const visibleWars = useMemo(() => wars.filter((war) => war.status === 'active' && war.fronts.some((front) => knownSystemIds.has(front.systemId))), [wars, knownSystemIds]);
  const simulationContext = useMemo(() => store.galaxy ? ({ seed: store.galaxy.seed, galaxy: store.galaxy, factions: store.factions, hubs: store.hubs }) : null, [store.galaxy, store.factions, store.hubs]);
  const economies = useMemo(() => store.simulation && simulationContext ? liveEconomies(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const societies = useMemo(() => store.simulation && simulationContext ? liveSocieties(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const visibleCivilizationIds = useMemo(() => new Set(visiblePolities.map((polity) => polity.civilizationId)), [visiblePolities]);
  const visibleEconomies = useMemo(() => economies.filter((economy) => visibleCivilizationIds.has(economy.civilizationId)), [economies, visibleCivilizationIds]);
  const visibleSocieties = useMemo(() => societies.filter((society) => visibleCivilizationIds.has(society.civilizationId)), [societies, visibleCivilizationIds]);
  const cultureSummaries = useMemo(() => store.simulation && simulationContext ? [...visibleCivilizationIds].map((civilizationId) => cultureSummaryForCivilization(store.simulation!, simulationContext, civilizationId)) : [], [store.simulation, simulationContext, visibleCivilizationIds]);
  const figures = useMemo(() => store.simulation && simulationContext ? liveHistoricalFigures(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const institutions = useMemo(() => store.simulation && simulationContext ? liveInstitutions(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const artifacts = useMemo(() => store.simulation && simulationContext ? liveArtifacts(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const archives = useMemo(() => store.simulation && simulationContext ? liveArchives(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const ruins = useMemo(() => store.simulation && simulationContext ? liveRuins(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const impacts = useMemo(() => store.simulation && simulationContext ? planetaryImpacts(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const visibleFigures = useMemo(() => figures.filter((figure) => figure.status === 'active' && (knownSystemIds.has(figure.systemId) || visibleCivilizationIds.has(figure.civilizationId))), [figures, knownSystemIds, visibleCivilizationIds]);
  const visibleInstitutions = useMemo(() => institutions.filter((institution) => institution.status === 'active' && (knownSystemIds.has(institution.headquartersSystemId) || visibleCivilizationIds.has(institution.civilizationId))), [institutions, knownSystemIds, visibleCivilizationIds]);
  const visibleArtifacts = useMemo(() => artifacts.filter((artifact) => artifact.publicKnowledge >= 25 && (!artifact.currentSystemId || knownSystemIds.has(artifact.currentSystemId) || visibleCivilizationIds.has(artifact.civilizationId))), [artifacts, knownSystemIds, visibleCivilizationIds]);
  const visibleArchives = useMemo(() => archives.filter((archive) => knownSystemIds.has(archive.systemId) || visibleCivilizationIds.has(archive.civilizationId)), [archives, knownSystemIds, visibleCivilizationIds]);
  const visibleRuins = useMemo(() => ruins.filter((ruin) => knownSystemIds.has(ruin.systemId)), [ruins, knownSystemIds]);
  const visibleImpacts = useMemo(() => impacts.filter((impact) => impact.settlementIds.some((settlementId) => visibleSettlements.some((settlement) => settlement.id === settlementId))), [impacts, visibleSettlements]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'threads' | 'settlements' | 'news'>('threads');
  const selected = visibleThreads.find((entry) => entry.id === selectedId) ?? (!compact ? visibleThreads[0] : undefined);
  const selectedSettlement = visibleSettlements.find((entry) => entry.id === selectedSettlementId);
  const causalTimeline = useMemo(() => (store.simulation?.events ?? [])
    .filter((event) => event.visibility !== 'hidden' && event.systemIds.some((id) => knownSystemIds.has(id)))
    .slice(0, 18)
    .map((event) => {
      const causeIds = causalLinksForEvent(event).causedByEventIds;
      const causes = causeIds
        .map((id) => store.simulation?.events.find((candidate) => candidate.id === id)?.title)
        .filter((title): title is string => Boolean(title))
        .join(' · ');
      return {
        id: `world_${event.id}`,
        year: (store.simulation?.clock.epochYear ?? 0) + Math.floor(event.atHour / (365 * 24)),
        title: event.title,
        text: event.summary,
        tone: event.severity >= 8 ? 'danger' : event.severity >= 6 ? 'warning' : 'info',
        causeCount: causeIds.length,
        causes
      };
    }), [store.simulation, knownSystemIds]);
  const timeline = useMemo(() => [
    ...causalTimeline,
    ...visibleNews.slice(0, 12).map((entry) => ({ id: `news_${entry.id}`, year: entry.year, title: entry.headline, text: entry.text, tone: entry.category === 'security' ? 'warning' : 'info', causeCount: 0, causes: '' })),
    ...store.logs.slice(0, 12).map((entry) => ({ id: `log_${entry.id}`, year: entry.year, title: entry.title, text: entry.text, tone: entry.tone, causeCount: 0, causes: '' }))
  ].sort((a, b) => b.year - a.year).slice(0, 24), [causalTimeline, visibleNews, store.logs]);

  const openRelated = () => {
    if (!selected) return;
    const screen: MainScreen = selected.category === 'research' ? 'laboratory' : selected.category === 'ecology' ? 'system' : selected.category === 'discovery' ? 'archive' : selected.category === 'conflict' || selected.category === 'politics' ? 'factions' : 'civilizations';
    store.setScreen(screen);
  };
  const systemName = (systemId: string) => store.galaxy?.systems.find((entry) => entry.id === systemId)?.name ?? 'неизвестная система';

  if (compact) {
    return <div className="game-shell">{chrome}<main className="mobile-data-screen world-mobile">
      <header className="mobile-screen-header"><div><span className="eyebrow">ПОДТВЕРЖДЁННАЯ СВЯЗЬ</span><h1>Живой мир</h1></div><b>{visibleThreads.length + visibleSettlements.length + visiblePolities.length + visibleFigures.length}</b></header>
      {!selected && !selectedSettlement && <><div className="mobile-inline-stats"><span>Государства <b>{visiblePolities.length}</b></span><span>Войны <b>{visibleWars.length}</b></span><span>Экономики <b>{visibleEconomies.length}</b></span><span>Общества <b>{visibleSocieties.length}</b></span><span>Личности <b>{visibleFigures.length}</b></span><span>Институты <b>{visibleInstitutions.length}</b></span></div>{visibleWars.slice(0, 2).map((war) => <article className="mobile-action-card warning" key={war.id}><b>{war.name}</b><p>{warGoalLabel(war.goal)} · потери {war.casualties.toLocaleString('ru-RU')} · фронтов {war.fronts.length}</p></article>)}<nav className="mobile-segmented three" aria-label="Раздел живого мира">
        <button className={mobileTab === 'threads' ? 'active' : ''} onClick={() => setMobileTab('threads')}>Процессы</button>
        <button className={mobileTab === 'settlements' ? 'active' : ''} onClick={() => setMobileTab('settlements')}>Поселения</button>
        <button className={mobileTab === 'news' ? 'active' : ''} onClick={() => setMobileTab('news')}>Хроника</button>
      </nav></>}
      {selectedSettlement ? <SettlementDetail settlement={selectedSettlement} systemName={systemName(selectedSettlement.systemId)} onBack={() => setSelectedSettlementId(null)}/> : selected ? <section className="mobile-detail-view">
        <button className="mobile-back" onClick={() => setSelectedId(null)}>← Все процессы</button>
        <span className="eyebrow">{categoryLabel[selected.category]} · срочность {Math.round(selected.urgency)}</span><h2>{selected.title}</h2><p className="mobile-lead">{selected.summary}</p>
        <div className="mobile-progress"><i style={{ width: `${selected.progress}%` }}/><span>{selected.progress}% · {selected.status}</span></div>
        <article className="mobile-action-card"><b>Что можно сделать</b><p>{selected.nextAction ?? 'Наблюдать за изменениями.'}</p><button className="primary-button" onClick={openRelated}>Открыть связанный раздел</button></article>
        <details className="mobile-collapsible"><summary>Изменения · {selected.updates.length}</summary>{selected.updates.slice(-3).reverse().map((update) => <div className={`mobile-timeline-row tone-${update.tone}`} key={update.id}><span>{update.year < 0 ? `${Math.abs(update.year)} до старта` : `Год ${update.year}`}</span><p>{update.text}</p></div>)}</details>
      </section> : mobileTab === 'threads' ? <section className="mobile-list">{visiblePolities.slice(0, 4).map((polity) => { const economy = visibleEconomies.find((entry) => entry.civilizationId === polity.civilizationId); const society = visibleSocieties.find((entry) => entry.civilizationId === polity.civilizationId); const culture = cultureSummaries.find((entry) => entry.civilizationId === polity.civilizationId); return <article className="mobile-feed-row" key={polity.id}><span>{polityFormLabel(polity.form)} · {polity.territorySystemIds.length} систем</span><b>{polity.name}</b><p>Население {polity.population.toLocaleString('ru-RU')} · легитимность {Math.round(polity.legitimacy)} · армия {Math.round(polity.military)}</p>{economy && <small>Экономика {Math.round(economy.grossProduct)} · безработица {Math.round(economy.unemployment)} · импорт {Math.round(economy.importDependence)}</small>}{society && <small>Классовое напряжение {Math.round(society.classTension)} · радикализация {Math.round(society.radicalization)}</small>}{culture?.dominantCulture && <small>Культура: {culture.dominantCulture.name} · разнообразие {Math.round(culture.diversity)}</small>}</article>; })}{visibleFigures.slice(0, 3).map((figure) => <article className="mobile-feed-row" key={figure.id}><span>{figure.role} · влияние {Math.round(figure.influence)}</span><b>{figure.name}</b><p>{figure.achievements.slice(-1)[0] ?? 'Действующая историческая личность.'}</p></article>)}{visibleImpacts.slice(0, 2).map((impact) => <article className={`mobile-action-card ${impact.netPressure >= 65 ? 'warning' : ''}`} key={impact.id}><b>Планетарная нагрузка {Math.round(impact.netPressure)}/100</b><p>Промышленность {Math.round(impact.industrialPressure)} · охрана {Math.round(impact.conservation)} · терраформирование {Math.round(impact.terraforming)}</p></article>)}{visibleThreads.length ? visibleThreads.map((thread) => <button className="mobile-list-row" key={thread.id} onClick={() => setSelectedId(thread.id)}><span>{categoryLabel[thread.category]} · {thread.status}</span><b>{thread.title}</b><i style={{ width: `${thread.progress}%` }}/></button>) : visiblePolities.length === 0 && <div className="mobile-empty"><b>Связь молчит</b><p>Посети поселение или установи контакт.</p></div>}</section>
        : mobileTab === 'settlements' ? <section className="mobile-list settlement-list">{visibleSettlements.length ? visibleSettlements.map((settlement) => { const shortage = (['food','water','energy','medicine'] as SettlementResource[]).some((resource) => stockDays(settlement, resource) < 20); return <button className={`mobile-list-row ${shortage ? 'has-shortage' : ''}`} key={settlement.id} onClick={() => setSelectedSettlementId(settlement.id)}><span>{settlement.kind} · {systemName(settlement.systemId)}</span><b>{settlement.name}</b><small>{settlement.population.toLocaleString('ru-RU')} · беспорядки {settlement.unrest}</small></button>; }) : <div className="mobile-empty"><b>Поселения не известны</b><p>Просканируй систему или пристыкуйся к хабу.</p></div>}</section>
          : <section className="mobile-list">{timeline.length ? timeline.map((entry) => <article className={`mobile-feed-row tone-${entry.tone}`} key={entry.id}><span>Год {entry.year}{entry.causeCount > 0 ? ` · причин ${entry.causeCount}` : ''}</span><b>{entry.title}</b><p>{entry.text}</p>{entry.causes && <small>Причины: {entry.causes}</small>}</article>) : <div className="mobile-empty"><b>Хроника пуста</b><p>Нужна связь с хабом или посещённым регионом.</p></div>}</section>}
    </main></div>;
  }

  return <div className="game-shell">{chrome}<main className="world-screen world-screen-known">
    <aside className="world-thread-list"><header><span className="eyebrow">ПОДТВЕРЖДЁННАЯ СВЯЗЬ</span><h1>Живой мир</h1><p>Процессы возникают из экономики, населения, экологии, государств и войн.</p></header><div>{visibleThreads.length ? visibleThreads.map((thread) => <button key={thread.id} className={`${selected?.id === thread.id ? 'active' : ''} thread-${thread.status}`} onClick={() => setSelectedId(thread.id)}><span>{categoryLabel[thread.category]} · {thread.status}</span><b>{thread.title}</b><small>{thread.summary}</small><i style={{ width: `${thread.progress}%` }}/></button>) : <div className="unknown-state"><b>Связь молчит</b><p>Мир продолжает работать, но капитан ещё не получил данные.</p></div>}</div></aside>
    <section className="world-thread-detail">{selected ? <><header className={`thread-hero thread-${selected.status}`}><div><span className="eyebrow">{categoryLabel[selected.category]} · СРОЧНОСТЬ {Math.round(selected.urgency)}</span><h1>{selected.title}</h1><p>{selected.summary}</p></div><div className="thread-progress-ring"><b>{selected.progress}%</b><span>{selected.status}</span></div></header><section className="thread-context-grid"><article><span className="eyebrow">ИСТОЧНИК</span><p>{selected.playerInvolved ? 'Твои действия стали частью процесса.' : 'Сведения получены через известный канал связи.'}</p></article><article><span className="eyebrow">ДЕЙСТВИЕ</span><p>{selected.nextAction ?? 'Наблюдать.'}</p><button className="primary-button" onClick={openRelated}>Перейти к данным</button></article></section><section className="thread-timeline"><h2>Подтверждённые изменения</h2>{selected.updates.map((update) => <article className={`timeline-entry tone-${update.tone}`} key={update.id}><span>{update.year < 0 ? `${Math.abs(update.year)} до старта` : `Год ${update.year}`}</span><p>{update.text}</p></article>)}</section></> : <div className="unknown-state large"><b>Пока нечего отслеживать</b><p>Мир существует независимо от капитана.</p></div>}</section>
    <aside className="world-news-column"><span className="eyebrow">ЖИВЫЕ ГОСУДАРСТВА</span><h2>{visiblePolities.length} держав</h2><div className="desktop-settlement-list">{visiblePolities.slice(0, 6).map((polity) => <article key={polity.id}><b>{polity.name}</b><span>{polityFormLabel(polity.form)} · {polity.territorySystemIds.length} систем · легитимность {Math.round(polity.legitimacy)}</span></article>)}</div><span className="eyebrow world-feed-heading">ЭКОНОМИКА И ОБЩЕСТВО</span>{visibleEconomies.slice(0, 5).map((economy) => { const society = visibleSocieties.find((entry) => entry.civilizationId === economy.civilizationId); const culture = cultureSummaries.find((entry) => entry.civilizationId === economy.civilizationId); const strongest = [...economy.sectors].sort((a, b) => b.output - a.output)[0]; const name = store.galaxy?.civilizations.find((entry) => entry.id === economy.civilizationId)?.name ?? 'Неизвестная цивилизация'; return <article className={`world-feed-item tone-${society && society.classTension >= 70 ? 'warning' : 'info'}`} key={`economy_${economy.civilizationId}`}><span>ВВП {Math.round(economy.grossProduct)} · рост {economy.growth.toFixed(1)}</span><b>{name}</b><p>Безработица {Math.round(economy.unemployment)} · неравенство {Math.round(economy.inequality)} · импорт {Math.round(economy.importDependence)}</p>{strongest && <small>Ведущий сектор: {industrySectorLabel(strongest.sector)} · выпуск {Math.round(strongest.output)}</small>}{culture?.dominantCulture && <small>Культура: {culture.dominantCulture.name} · напряжение {Math.round(culture.tension)}</small>}{society && <small>Классовое напряжение {Math.round(society.classTension)} · лояльность {Math.round(society.loyalty)}</small>}</article>; })}<span className="eyebrow world-feed-heading">ЛИЧНОСТИ И ИНСТИТУТЫ</span>{visibleFigures.slice(0, 4).map((figure) => <article className="world-feed-item tone-info" key={figure.id}><span>{figure.role} · влияние {Math.round(figure.influence)}</span><b>{figure.name}</b><p>Компетентность {Math.round(figure.competence)} · амбиции {Math.round(figure.ambition)} · лояльность {Math.round(figure.loyalty)}</p></article>)}{visibleInstitutions.slice(0, 3).map((institution) => <article className={`world-feed-item tone-${institution.corruption >= 70 ? 'warning' : 'info'}`} key={institution.id}><span>{institution.kind} · участников {institution.membership.toLocaleString('ru-RU')}</span><b>{institution.name}</b><p>Влияние {Math.round(institution.influence)} · сплочённость {Math.round(institution.cohesion)} · коррупция {Math.round(institution.corruption)}</p></article>)}<span className="eyebrow world-feed-heading">НАСЛЕДИЕ И ПЛАНЕТЫ</span>{visibleArtifacts.slice(0, 3).map((artifact) => <article className="world-feed-item tone-info" key={artifact.id}><span>{artifact.kind} · {artifact.status}</span><b>{artifact.name}</b><p>Целостность {Math.round(artifact.integrity)} · культурная ценность {Math.round(artifact.culturalValue)} · известность {Math.round(artifact.publicKnowledge)}</p></article>)}{visibleArchives.slice(0, 2).map((archive) => <article className={`world-feed-item tone-${archive.status === 'damaged' || archive.status === 'destroyed' ? 'warning' : 'info'}`} key={archive.id}><span>Архив · записей {archive.records.toLocaleString('ru-RU')}</span><b>{archive.name}</b><p>Целостность {Math.round(archive.integrity)} · расшифровано {Math.round(archive.deciphered)}%</p></article>)}{visibleRuins.slice(0, 2).map((ruin) => <article className="world-feed-item tone-info" key={ruin.id}><span>Руины · {ruin.status}</span><b>{systemName(ruin.systemId)}</b><p>Целостность {Math.round(ruin.integrity)} · раскопки {Math.round(ruin.excavation)} · разграблено {Math.round(ruin.looted)}</p></article>)}{visibleImpacts.slice(0, 3).map((impact) => <article className={`world-feed-item tone-${impact.netPressure >= 65 ? 'warning' : 'info'}`} key={impact.id}><span>Планетарная нагрузка {Math.round(impact.netPressure)}/100</span><b>{impact.planetId}</b><p>Промышленность {Math.round(impact.industrialPressure)} · война {Math.round(impact.militaryPressure)} · охрана {Math.round(impact.conservation)}</p></article>)}<span className="eyebrow world-feed-heading">АКТИВНЫЕ ВОЙНЫ</span>{visibleWars.length ? visibleWars.slice(0, 4).map((war) => <article className="world-feed-item tone-danger" key={war.id}><span>{warGoalLabel(war.goal)} · фронтов {war.fronts.length}</span><b>{war.name}</b><p>Потери {war.casualties.toLocaleString('ru-RU')} · снабжение {Math.round(war.attackerSupply)}/{Math.round(war.defenderSupply)}</p></article>) : <p>Известных войн нет.</p>}<span className="eyebrow world-feed-heading">ИЗВЕСТНЫЕ ПОСЕЛЕНИЯ</span><h2>{visibleSettlements.length} узлов</h2><div className="desktop-settlement-list">{visibleSettlements.slice(0, 8).map((settlement) => <button key={settlement.id} onClick={() => setSelectedSettlementId(settlement.id)}><b>{settlement.name}</b><span>{settlement.population.toLocaleString('ru-RU')} · {systemName(settlement.systemId)}</span></button>)}</div>{selectedSettlement && <SettlementDetail settlement={selectedSettlement} systemName={systemName(selectedSettlement.systemId)}/>}<span className="eyebrow world-feed-heading">ПРИЧИННАЯ ХРОНИКА</span>{timeline.slice(0, 8).map((entry) => <article className={`world-feed-item tone-${entry.tone}`} key={entry.id}><span>Год {entry.year}{entry.causeCount > 0 ? ` · причин ${entry.causeCount}` : ''}</span><b>{entry.title}</b><p>{entry.text}</p>{entry.causes && <small>Причины: {entry.causes}</small>}</article>)}</aside>
  </main></div>;
}
