import { useMemo, useState } from 'react';
import { CivilizationProfileWindow } from '../components/CivilizationProfileWindow';
import { useGameStore, type MainScreen } from '../game/store';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { cultureSummaryForCivilization } from '../simulation/culture';
import { industrySectorLabel, liveEconomies } from '../simulation/economy';
import { liveHistoricalFigures, liveInstitutions } from '../simulation/figures';
import { liveArchives, liveArtifacts, liveRuins } from '../simulation/heritage';
import {
  civilizationIntelligence,
  combineIntelligence,
  eventIntelligence,
  intelligenceAtLeast,
  intelligenceFieldKnown,
  intelligenceFor,
  intelligenceLabel,
  intelligenceMetric,
  intelligenceName,
  intelligenceNumber,
  intelligenceSourceLabel,
  publicRumor,
  redactExactFigures,
  type EntityIntelligence,
  type IntelligenceLevel
} from '../simulation/intelligence';
import { planetaryImpacts } from '../simulation/planetaryConsequences';
import { livePolities, polityFormLabel, type LivePolityState } from '../simulation/polities';
import { liveSocieties } from '../simulation/population';
import type { SettlementResource, SettlementState } from '../simulation/types';
import { liveWars, warGoalLabel, type LiveWarState } from '../simulation/war';
import { worldNeedKindLabel, worldNeedsFromEvents } from '../simulation/worldGameplay';

const HOURS_PER_YEAR = 365 * 24;
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

function manualIntel(entityId: string, entityType: EntityIntelligence['entityType'], level: IntelligenceLevel, fields: string[], source: EntityIntelligence['source']): EntityIntelligence {
  const confidence = level === 'verified' ? 98 : level === 'confirmed' ? 82 : level === 'observed' ? 58 : level === 'rumor' ? 30 : 0;
  return { entityId, entityType, level, confidence, source, knownFields: fields, staleYears: 0 };
}

function IntelHeader({ intelligence }: { intelligence: EntityIntelligence }) {
  return <span className="eyebrow">{intelligenceLabel(intelligence.level).toUpperCase()} · {Math.round(intelligence.confidence)}% · {intelligenceSourceLabel(intelligence.source)}</span>;
}

function SettlementDetail({ settlement, systemName, intelligence, onBack }: { settlement: SettlementState; systemName: string; intelligence: EntityIntelligence; onBack?(): void }) {
  const vital: SettlementResource[] = ['food', 'water', 'energy', 'medicine'];
  const canSeeStocks = intelligenceAtLeast(intelligence, 'confirmed');
  const canSeeProduction = intelligenceAtLeast(intelligence, 'verified');
  const shortages = canSeeStocks ? vital.filter((resource) => stockDays(settlement, resource) < 20) : [];
  return <section className="mobile-detail-view settlement-detail">
    {onBack && <button className="mobile-back" onClick={onBack}>← Назад</button>}
    <IntelHeader intelligence={intelligence}/>
    <h2>{intelligenceName(settlement.name, intelligence, 'Неидентифицированное поселение')}</h2>
    <p className="mobile-lead">{systemName} · население {intelligenceNumber(settlement.population, intelligence, 'population')}</p>
    <div className="mobile-inline-stats settlement-core-stats">
      <span>Инфраструктура <b>{intelligenceMetric(settlement.infrastructure, intelligence, 'infrastructure')}</b></span>
      <span>Безопасность <b>{intelligenceMetric(settlement.security, intelligence, 'security')}</b></span>
      <span>Беспорядки <b>{intelligenceMetric(settlement.unrest, intelligence, 'society')}</b></span>
      <span>Здоровье <b>{intelligenceMetric(settlement.health, intelligence, 'health')}</b></span>
    </div>
    {!canSeeStocks && <article className="mobile-action-card"><b>Запасы не подтверждены</b><p>Нужна стыковка, агентурный источник или прямое обследование.</p></article>}
    {shortages.length > 0 && <article className="mobile-action-card warning"><b>Подтверждённый дефицит</b><p>{shortages.map((resource) => resourceLabel[resource]).join(' · ')}</p></article>}
    {canSeeStocks && <section className="settlement-stock-grid">{vital.map((resource) => <div className={stockDays(settlement, resource) < 20 ? 'shortage' : ''} key={resource}><span>{resourceLabel[resource]}</span><b>{stockDays(settlement, resource)} дн.</b></div>)}</section>}
    {canSeeProduction && <details className="mobile-collapsible"><summary>Проверенные производственные данные</summary>{Object.keys(resourceLabel).map((key) => { const resource = key as SettlementResource; return <div className="settlement-resource-row" key={resource}><span>{resourceLabel[resource]}</span><b>+{settlement.production[resource].toFixed(1)} / −{settlement.consumption[resource].toFixed(1)}</b></div>; })}</details>}
  </section>;
}

function PolityDetail({ polity, intelligence, civilizationName, systemName, onBack }: { polity: LivePolityState; intelligence: EntityIntelligence; civilizationName: string; systemName(id: string): string; onBack?(): void }) {
  return <section className="mobile-detail-view">
    {onBack && <button className="mobile-back" onClick={onBack}>← Назад</button>}
    <IntelHeader intelligence={intelligence}/>
    <h2>{intelligenceName(polity.name, intelligence, 'Неидентифицированная держава')}</h2>
    <p className="mobile-lead">{intelligenceFieldKnown(intelligence, 'identity') ? civilizationName : 'Происхождение не установлено'}</p>
    <div className="mobile-inline-stats">
      <span>Форма <b>{intelligenceFieldKnown(intelligence, 'politics') ? polityFormLabel(polity.form) : 'неизвестна'}</b></span>
      <span>Столица <b>{intelligenceFieldKnown(intelligence, 'territory') ? systemName(polity.capitalSystemId) : 'не установлена'}</b></span>
      <span>Население <b>{intelligenceNumber(polity.population, intelligence, 'population')}</b></span>
      <span>Армия <b>{intelligenceMetric(polity.military, intelligence, 'military')}</b></span>
      <span>Легитимность <b>{intelligenceMetric(polity.legitimacy, intelligence, 'politics')}</b></span>
      <span>Территория <b>{intelligenceFieldKnown(intelligence, 'territory') ? `${polity.territorySystemIds.length} систем` : 'границы неизвестны'}</b></span>
    </div>
    {!intelligenceAtLeast(intelligence, 'verified') && <article className="mobile-action-card"><b>Досье неполно</b><p>Перевод сигналов откроет культуру. Контакт — политику и экономику. Доверие — население, армию, личности и институты.</p></article>}
  </section>;
}

function WarDetail({ war, intelligence, systemName, onBack }: { war: LiveWarState; intelligence: EntityIntelligence; systemName(id: string): string; onBack?(): void }) {
  const confirmed = intelligenceAtLeast(intelligence, 'confirmed');
  return <section className="mobile-detail-view">
    {onBack && <button className="mobile-back" onClick={onBack}>← Назад</button>}
    <IntelHeader intelligence={intelligence}/>
    <h2>{intelligenceAtLeast(intelligence, 'observed') ? war.name : 'Возможные боевые действия'}</h2>
    <p className="mobile-lead">{confirmed ? warGoalLabel(war.goal) : 'Цели сторон не установлены'}</p>
    <div className="mobile-inline-stats">
      <span>Фронты <b>{intelligenceAtLeast(intelligence, 'observed') ? war.fronts.length : 'неизвестно'}</b></span>
      <span>Потери <b>{intelligenceNumber(war.casualties, intelligence, 'military')}</b></span>
      <span>Снабжение атакующих <b>{intelligenceMetric(war.attackerSupply, intelligence, 'military')}</b></span>
      <span>Снабжение обороны <b>{intelligenceMetric(war.defenderSupply, intelligence, 'military')}</b></span>
    </div>
    {confirmed && <details className="mobile-collapsible" open><summary>Известные фронты</summary>{war.fronts.map((front) => <div className="mobile-timeline-row" key={front.id}><span>{systemName(front.systemId)}</span><p>Интенсивность {intelligenceMetric(front.intensity, intelligence, 'military')} · оккупация {intelligenceMetric(front.occupation, intelligence, 'military')}</p></div>)}</details>}
  </section>;
}

export function WorldScreen({ chrome }: { chrome: React.ReactNode }) {
  const store = useGameStore();
  const compact = useCompactLayout();
  const nowHour = store.simulation?.clock.absoluteHour ?? 0;
  const contactByCivilization = useMemo(() => new Map(store.civilizationContacts.map((contact) => [contact.civilizationId, contact])), [store.civilizationContacts]);
  const systemIntel = (systemId: string): EntityIntelligence => {
    const base = intelligenceFor(store.knowledge, 'system', systemId, nowHour);
    if (base.level !== 'unknown') return base;
    const system = store.galaxy?.systems.find((entry) => entry.id === systemId);
    if (system?.visited) return manualIntel(systemId, 'system', 'confirmed', ['identity', 'visited', 'events'], 'direct');
    if (system?.scanned) return manualIntel(systemId, 'system', 'observed', ['identity', 'planets'], 'scan');
    if (system?.known) return publicRumor('system', systemId, 30);
    return base;
  };
  const knownSystemIds = useMemo(() => new Set(store.galaxy?.systems.filter((system) => intelligenceAtLeast(systemIntel(system.id), 'rumor')).map((system) => system.id) ?? []), [store.galaxy, store.knowledge, nowHour]);
  const civIntel = (civilizationId: string, territorySystemIds: string[] = []): EntityIntelligence => {
    const strongestSystem = territorySystemIds.map(systemIntel).sort((a, b) => b.confidence - a.confidence)[0];
    const fallback = strongestSystem?.level === 'verified' || strongestSystem?.level === 'confirmed' ? 'observed' : strongestSystem?.level === 'observed' ? 'rumor' : 'unknown';
    return civilizationIntelligence(store.knowledge, contactByCivilization.get(civilizationId), civilizationId, nowHour, fallback);
  };
  const settlementIntel = (settlement: SettlementState): EntityIntelligence => {
    const direct = store.hubs.some((hub) => hub.systemId === settlement.systemId && (hub.visited || hub.id === store.currentHubId));
    if (direct) return manualIntel(settlement.id, 'settlement', 'verified', ['identity', 'population', 'infrastructure', 'security', 'society', 'health', 'stocks'], 'direct');
    const system = systemIntel(settlement.systemId);
    if (intelligenceFieldKnown(system, 'visited')) return manualIntel(settlement.id, 'settlement', 'confirmed', ['identity', 'population', 'infrastructure', 'security', 'society', 'health'], 'direct');
    if (intelligenceAtLeast(system, 'observed')) return manualIntel(settlement.id, 'settlement', 'observed', ['identity', 'population'], 'scan');
    return publicRumor('settlement', settlement.id, intelligenceAtLeast(system, 'rumor') ? 28 : 0);
  };
  const simulationContext = useMemo(() => store.galaxy ? ({ seed: store.galaxy.seed, galaxy: store.galaxy, factions: store.factions, hubs: store.hubs }) : null, [store.galaxy, store.factions, store.hubs]);
  const polities = useMemo(() => store.galaxy && store.simulation ? livePolities(store.simulation, simulationContext!) : [], [store.galaxy, store.simulation, simulationContext]);
  const visiblePolities = useMemo(() => polities.filter((polity) => polity.status === 'active' && intelligenceAtLeast(civIntel(polity.civilizationId, polity.territorySystemIds), 'rumor')), [polities, store.knowledge, store.civilizationContacts, nowHour, knownSystemIds]);
  const wars = useMemo(() => store.simulation ? liveWars(store.simulation) : [], [store.simulation]);
  const warIntel = (war: LiveWarState): EntityIntelligence => {
    const combined = combineIntelligence(
      ...war.fronts.map((front) => systemIntel(front.systemId)),
      ...war.civilizationIds.map((id) => civIntel(id))
    );
    return intelligenceAtLeast(combined, 'observed')
      ? { ...combined, knownFields: [...new Set([...combined.knownFields, 'military'])] }
      : combined;
  };
  const visibleWars = useMemo(() => wars.filter((war) => war.status === 'active' && intelligenceAtLeast(warIntel(war), 'rumor')), [wars, store.knowledge, store.civilizationContacts, nowHour]);
  const economies = useMemo(() => store.simulation && simulationContext ? liveEconomies(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const societies = useMemo(() => store.simulation && simulationContext ? liveSocieties(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const figures = useMemo(() => store.simulation && simulationContext ? liveHistoricalFigures(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const institutions = useMemo(() => store.simulation && simulationContext ? liveInstitutions(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const artifacts = useMemo(() => store.simulation && simulationContext ? liveArtifacts(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const archives = useMemo(() => store.simulation && simulationContext ? liveArchives(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const ruins = useMemo(() => store.simulation && simulationContext ? liveRuins(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const impacts = useMemo(() => store.simulation && simulationContext ? planetaryImpacts(store.simulation, simulationContext) : [], [store.simulation, simulationContext]);
  const visibleSettlements = useMemo(() => (Object.values(store.simulation?.settlements ?? {}) as SettlementState[]).filter((settlement) => intelligenceAtLeast(settlementIntel(settlement), 'rumor')).sort((a, b) => b.population - a.population), [store.simulation?.settlements, store.knowledge, store.hubs, store.currentHubId, nowHour]);
  const visibleThreads = useMemo(() => store.worldThreads.filter((thread) => thread.playerInvolved || thread.systemIds.some((id) => intelligenceAtLeast(systemIntel(id), 'observed')) || thread.civilizationIds.some((id) => intelligenceAtLeast(civIntel(id), 'confirmed'))), [store.worldThreads, store.knowledge, store.civilizationContacts, nowHour]);
  const visibleNews = useMemo(() => store.news.filter((entry) => entry.systemIds.some((id) => intelligenceAtLeast(systemIntel(id), entry.reliability >= 70 ? 'observed' : 'rumor'))), [store.news, store.knowledge, nowHour]);
  const worldNeeds = useMemo(() => worldNeedsFromEvents(store.simulation?.events ?? [], 30), [store.simulation?.events]);
  const visibleNeeds = useMemo(() => worldNeeds.filter((need) => intelligenceAtLeast(systemIntel(need.targetSystemId), 'observed') || need.civilizationIds.some((id) => intelligenceAtLeast(civIntel(id), 'confirmed'))), [worldNeeds, store.knowledge, store.civilizationContacts, nowHour]);
  const discoveredHistorySystems = useMemo(() => new Set(store.discoveries.filter((entry) => entry.kind === 'ruin' || entry.kind === 'artifact' || entry.tags.some((tag) => ['history', 'archive', 'ruin', 'heritage'].includes(tag))).map((entry) => entry.systemId)), [store.discoveries]);
  const visibleArchives = archives.filter((archive) => discoveredHistorySystems.has(archive.systemId) || intelligenceFieldKnown(civIntel(archive.civilizationId), 'history'));
  const visibleRuins = ruins.filter((ruin) => discoveredHistorySystems.has(ruin.systemId));
  const artifactIntel = (artifactId: string, publicKnowledge: number): EntityIntelligence => {
    const direct = intelligenceFor(store.knowledge, 'artifact', artifactId, nowHour);
    return direct.level !== 'unknown' ? direct : publicRumor('artifact', artifactId, Math.min(65, publicKnowledge));
  };
  const visibleArtifacts = artifacts.filter((artifact) => intelligenceAtLeast(artifactIntel(artifact.id, artifact.publicKnowledge), 'rumor') && intelligenceAtLeast(civIntel(artifact.civilizationId), 'observed'));
  const visibleFigures = figures.filter((figure) => intelligenceFieldKnown(civIntel(figure.civilizationId), 'figures'));
  const visibleInstitutions = institutions.filter((institution) => intelligenceFieldKnown(civIntel(institution.civilizationId), 'institutions'));
  const visibleImpacts = impacts.filter((impact) => {
    const planet = store.galaxy?.systems.flatMap((system) => system.planets).find((entry) => entry.id === impact.planetId);
    return Boolean(planet && intelligenceAtLeast(intelligenceFor(store.knowledge, 'planet', planet.id, nowHour), 'confirmed'));
  });
  const visibleEconomies = economies.filter((economy) => intelligenceFieldKnown(civIntel(economy.civilizationId), 'economy'));
  const visibleSocieties = societies.filter((society) => intelligenceFieldKnown(civIntel(society.civilizationId), 'society'));
  const cultureSummaries = store.simulation && simulationContext ? visiblePolities.filter((polity) => intelligenceFieldKnown(civIntel(polity.civilizationId), 'culture')).map((polity) => cultureSummaryForCivilization(store.simulation!, simulationContext, polity.civilizationId)) : [];
  const knownEvents = useMemo(() => (store.simulation?.events ?? []).map((event) => ({ event, intel: eventIntelligence(event, store.knowledge, store.civilizationContacts, nowHour) })).filter((entry) => intelligenceAtLeast(entry.intel, 'rumor')).slice(0, 24), [store.simulation?.events, store.knowledge, store.civilizationContacts, nowHour]);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [selectedPolityId, setSelectedPolityId] = useState<string | null>(null);
  const [selectedWarId, setSelectedWarId] = useState<string | null>(null);
  const [profileCivilizationId, setProfileCivilizationId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'processes' | 'entities' | 'chronicle'>('processes');
  const selectedThread = visibleThreads.find((entry) => entry.id === selectedThreadId) ?? (!compact ? visibleThreads[0] : undefined);
  const selectedSettlement = visibleSettlements.find((entry) => entry.id === selectedSettlementId);
  const selectedPolity = visiblePolities.find((entry) => entry.id === selectedPolityId);
  const selectedWar = visibleWars.find((entry) => entry.id === selectedWarId);
  const clearSelection = () => { setSelectedThreadId(null); setSelectedSettlementId(null); setSelectedPolityId(null); setSelectedWarId(null); };
  const selectPolity = (id: string) => { clearSelection(); setSelectedPolityId(id); };
  const selectWar = (id: string) => { clearSelection(); setSelectedWarId(id); };
  const selectSettlement = (id: string) => { clearSelection(); setSelectedSettlementId(id); };
  const selectThread = (id: string) => { clearSelection(); setSelectedThreadId(id); };
  const systemName = (systemId: string) => intelligenceAtLeast(systemIntel(systemId), 'rumor') ? store.galaxy?.systems.find((entry) => entry.id === systemId)?.name ?? 'неизвестная система' : 'неизвестная система';
  const civilizationName = (civilizationId: string) => store.galaxy?.civilizations.find((entry) => entry.id === civilizationId)?.name ?? 'неизвестная цивилизация';
  const openRelated = () => {
    if (!selectedThread) return;
    const screen: MainScreen = selectedThread.category === 'research' ? 'laboratory' : selectedThread.category === 'ecology' ? 'system' : selectedThread.category === 'discovery' ? 'archive' : selectedThread.category === 'conflict' || selectedThread.category === 'politics' ? 'factions' : 'civilizations';
    store.setScreen(screen);
  };
  const renderDetail = (back = false) => selectedSettlement
    ? <SettlementDetail settlement={selectedSettlement} systemName={systemName(selectedSettlement.systemId)} intelligence={settlementIntel(selectedSettlement)} onBack={back ? clearSelection : undefined}/>
    : selectedPolity
      ? <PolityDetail polity={selectedPolity} intelligence={civIntel(selectedPolity.civilizationId, selectedPolity.territorySystemIds)} civilizationName={civilizationName(selectedPolity.civilizationId)} systemName={systemName} onBack={back ? clearSelection : undefined}/>
      : selectedWar
        ? <WarDetail war={selectedWar} intelligence={warIntel(selectedWar)} systemName={systemName} onBack={back ? clearSelection : undefined}/>
        : selectedThread
          ? <section className="mobile-detail-view">{back && <button className="mobile-back" onClick={clearSelection}>← Назад</button>}<span className="eyebrow">{categoryLabel[selectedThread.category]} · срочность {Math.round(selectedThread.urgency)}</span><h2>{selectedThread.title}</h2><p className="mobile-lead">{selectedThread.summary}</p><div className="mobile-progress"><i style={{ width: `${selectedThread.progress}%` }}/><span>{selectedThread.progress}% · {selectedThread.status}</span></div><article className="mobile-action-card"><b>Что можно сделать</b><p>{selectedThread.nextAction ?? 'Наблюдать за изменениями.'}</p><button className="primary-button" onClick={openRelated}>Открыть связанный раздел</button></article></section>
          : <div className="unknown-state large"><b>Данных недостаточно</b><p>Сканируй системы, посещай хабы, переводи сигналы и ищи архивы.</p></div>;

  const polityRows = visiblePolities.slice(0, 6).map((polity) => {
    const intel = civIntel(polity.civilizationId, polity.territorySystemIds);
    const economy = visibleEconomies.find((entry) => entry.civilizationId === polity.civilizationId);
    const society = visibleSocieties.find((entry) => entry.civilizationId === polity.civilizationId);
    const culture = cultureSummaries.find((entry) => entry.civilizationId === polity.civilizationId);
    return <button className="mobile-list-row" key={polity.id} onClick={() => { selectPolity(polity.id); setProfileCivilizationId(polity.civilizationId); }}><span>{intelligenceLabel(intel.level)} · {intelligenceFieldKnown(intel, 'politics') ? polityFormLabel(polity.form) : 'политика неизвестна'}</span><b>{intelligenceName(polity.name, intel, 'Неидентифицированная держава')}</b><small>Население {intelligenceNumber(polity.population, intel, 'population')} · армия {intelligenceMetric(polity.military, intel, 'military')}</small>{economy && <small>Экономика: {industrySectorLabel([...economy.sectors].sort((a, b) => b.output - a.output)[0]?.sector ?? 'consumer')} · безработица {intelligenceMetric(economy.unemployment, intel, 'economy')}</small>}{society && <small>Напряжение {intelligenceMetric(society.classTension, intel, 'society')}</small>}{culture?.dominantCulture && <small>Культура: {culture.dominantCulture.name}</small>}</button>;
  });

  const timeline = [
    ...knownEvents.map(({ event, intel }) => ({ id: event.id, year: (store.simulation?.clock.epochYear ?? 0) + Math.floor(event.atHour / HOURS_PER_YEAR), title: intel.level === 'rumor' ? `Непроверенный сигнал: ${event.kind}` : event.title, text: intel.level === 'rumor' ? 'Получены неполные сведения.' : intel.level === 'observed' ? redactExactFigures(event.summary) : event.summary, tone: event.severity >= 8 ? 'danger' : event.severity >= 6 ? 'warning' : 'info', intel })),
    ...visibleNews.slice(0, 8).map((entry) => ({ id: `news_${entry.id}`, year: entry.year, title: entry.headline, text: entry.reliability < 60 ? redactExactFigures(entry.text) : entry.text, tone: entry.category === 'security' ? 'warning' : 'info', intel: publicRumor('system', entry.id, entry.reliability) }))
  ].sort((a, b) => b.year - a.year).slice(0, 24);

  if (compact) {
    const hasSelection = Boolean(selectedThread || selectedSettlement || selectedPolity || selectedWar);
    return <div className="game-shell">{chrome}<main className="mobile-data-screen world-mobile">
      <header className="mobile-screen-header"><div><span className="eyebrow">РАЗВЕДЫВАТЕЛЬНАЯ КАРТИНА</span><h1>Живой мир</h1></div><b>{visibleThreads.length + visibleSettlements.length + visiblePolities.length + visibleWars.length}</b></header>
      {hasSelection ? renderDetail(true) : <>
        <div className="mobile-inline-stats"><span>Известно держав <b>{visiblePolities.length}</b></span><span>Войн <b>{visibleWars.length}</b></span><span>Поселений <b>{visibleSettlements.length}</b></span><span>Запросов <b>{visibleNeeds.length}</b></span></div>
        <nav className="mobile-segmented three"><button className={mobileTab === 'processes' ? 'active' : ''} onClick={() => setMobileTab('processes')}>Процессы</button><button className={mobileTab === 'entities' ? 'active' : ''} onClick={() => setMobileTab('entities')}>Досье</button><button className={mobileTab === 'chronicle' ? 'active' : ''} onClick={() => setMobileTab('chronicle')}>Сигналы</button></nav>
        {mobileTab === 'processes' ? <section className="mobile-list">{visibleWars.map((war) => <button className="mobile-list-row has-shortage" key={war.id} onClick={() => selectWar(war.id)}><span>{intelligenceLabel(warIntel(war).level)} · война</span><b>{intelligenceAtLeast(warIntel(war), 'observed') ? war.name : 'Возможные боевые действия'}</b><small>Потери {intelligenceNumber(war.casualties, warIntel(war), 'military')}</small></button>)}{visibleThreads.map((thread) => <button className="mobile-list-row" key={thread.id} onClick={() => selectThread(thread.id)}><span>{categoryLabel[thread.category]} · {thread.status}</span><b>{thread.title}</b><i style={{ width: `${thread.progress}%` }}/></button>)}{visibleNeeds.map((need) => <article className="mobile-action-card warning" key={need.id}><b>{worldNeedKindLabel(need.kind)} · {need.title}</b><p>{need.summary}</p></article>)}</section>
          : mobileTab === 'entities' ? <section className="mobile-list">{polityRows}{visibleSettlements.slice(0, 12).map((settlement) => <button className="mobile-list-row" key={settlement.id} onClick={() => selectSettlement(settlement.id)}><span>{intelligenceLabel(settlementIntel(settlement).level)} · {systemName(settlement.systemId)}</span><b>{intelligenceName(settlement.name, settlementIntel(settlement), 'Неизвестное поселение')}</b><small>Население {intelligenceNumber(settlement.population, settlementIntel(settlement), 'population')}</small></button>)}</section>
            : <section className="mobile-list">{timeline.length ? timeline.map((entry) => <article className={`mobile-feed-row tone-${entry.tone}`} key={entry.id}><span>Год {entry.year} · {intelligenceLabel(entry.intel.level)} · {Math.round(entry.intel.confidence)}%</span><b>{entry.title}</b><p>{entry.text}</p></article>) : <div className="mobile-empty"><b>Сигналов нет</b><p>Нужны новые источники.</p></div>}</section>}
      </>}
    </main><CivilizationProfileWindow civilizationId={profileCivilizationId} onClose={() => setProfileCivilizationId(null)} onOpenContacts={() => { setProfileCivilizationId(null); store.setScreen('civilizations'); }}/></div>;
  }

  return <div className="game-shell">{chrome}<main className="world-screen world-screen-known">
    <aside className="world-thread-list"><header><span className="eyebrow">РАЗВЕДЫВАТЕЛЬНАЯ КАРТИНА</span><h1>Живой мир</h1><p>Здесь показано только то, что капитан реально смог узнать.</p></header><div>{visibleThreads.map((thread) => <button key={thread.id} className={`${selectedThread?.id === thread.id ? 'active' : ''} thread-${thread.status}`} onClick={() => selectThread(thread.id)}><span>{categoryLabel[thread.category]} · {thread.status}</span><b>{thread.title}</b><small>{thread.summary}</small><i style={{ width: `${thread.progress}%` }}/></button>)}{visibleThreads.length === 0 && <div className="unknown-state"><b>Связь молчит</b><p>Мир продолжает жить вне твоего поля зрения.</p></div>}</div></aside>
    <section className="world-thread-detail">{renderDetail(false)}</section>
    <aside className="world-news-column"><span className="eyebrow">ИЗВЕСТНЫЕ ДЕРЖАВЫ</span><h2>{visiblePolities.length}</h2><div className="desktop-settlement-list">{polityRows}</div><span className="eyebrow world-feed-heading">ИЗВЕСТНЫЕ ВОЙНЫ</span>{visibleWars.map((war) => <button className="world-feed-item tone-danger" key={war.id} onClick={() => selectWar(war.id)}><span>{intelligenceLabel(warIntel(war).level)} · {Math.round(warIntel(war).confidence)}%</span><b>{intelligenceAtLeast(warIntel(war), 'observed') ? war.name : 'Возможные боевые действия'}</b><p>Потери {intelligenceNumber(war.casualties, warIntel(war), 'military')} · фронты {intelligenceAtLeast(warIntel(war), 'observed') ? war.fronts.length : 'не установлены'}</p></button>)}<span className="eyebrow world-feed-heading">ИЗВЕСТНЫЕ ПОСЕЛЕНИЯ</span>{visibleSettlements.slice(0, 8).map((settlement) => <button className="world-feed-item tone-info" key={settlement.id} onClick={() => selectSettlement(settlement.id)}><span>{intelligenceLabel(settlementIntel(settlement).level)} · {systemName(settlement.systemId)}</span><b>{intelligenceName(settlement.name, settlementIntel(settlement), 'Неизвестное поселение')}</b><p>Население {intelligenceNumber(settlement.population, settlementIntel(settlement), 'population')}</p></button>)}<span className="eyebrow world-feed-heading">ЛИЧНОСТИ И ИНСТИТУТЫ</span>{visibleFigures.slice(0, 3).map((figure) => <article className="world-feed-item tone-info" key={figure.id}><span>{figure.role}</span><b>{figure.name}</b><p>{figure.achievements.slice(-1)[0] ?? 'Данные подтверждены доверенным контактом.'}</p></article>)}{visibleInstitutions.slice(0, 3).map((institution) => <article className="world-feed-item tone-info" key={institution.id}><span>{institution.kind}</span><b>{institution.name}</b><p>Влияние {Math.round(institution.influence)} · коррупция {Math.round(institution.corruption)}</p></article>)}{visibleFigures.length === 0 && visibleInstitutions.length === 0 && <p>Нужен доверенный контакт.</p>}<span className="eyebrow world-feed-heading">НАСЛЕДИЕ И ПЛАНЕТЫ</span>{visibleArtifacts.slice(0, 3).map((artifact) => { const intel = artifactIntel(artifact.id, artifact.publicKnowledge); return <article className="world-feed-item tone-info" key={artifact.id}><span>{intelligenceLabel(intel.level)} · {artifact.kind}</span><b>{intelligenceName(artifact.name, intel, 'Неидентифицированный объект')}</b><p>Статус {intelligenceAtLeast(intel, 'confirmed') ? artifact.status : 'не подтверждён'} · целостность {intelligenceMetric(artifact.integrity, intel, 'details')}</p></article>; })}{visibleArchives.slice(0, 2).map((archive) => <article className="world-feed-item tone-info" key={archive.id}><span>Архив · {archive.status}</span><b>{archive.name}</b><p>Расшифровано {Math.round(archive.deciphered)}%</p></article>)}{visibleRuins.slice(0, 2).map((ruin) => <article className="world-feed-item tone-info" key={ruin.id}><span>Руины · {ruin.status}</span><b>{systemName(ruin.systemId)}</b><p>Раскопки {Math.round(ruin.excavation)}%</p></article>)}{visibleImpacts.slice(0, 2).map((impact) => { const intel = intelligenceFor(store.knowledge, 'planet', impact.planetId, nowHour); return <article className="world-feed-item tone-warning" key={impact.id}><span>{intelligenceLabel(intel.level)} · планетарная нагрузка</span><b>{store.galaxy?.systems.flatMap((system) => system.planets).find((planet) => planet.id === impact.planetId)?.name ?? 'Планета'}</b><p>Давление {intelligenceMetric(impact.netPressure, intel, 'habitability')} · охрана {intelligenceMetric(impact.conservation, intel, 'habitability')}</p></article>; })}<span className="eyebrow world-feed-heading">ПОСЛЕДНИЕ СИГНАЛЫ</span>{timeline.slice(0, 8).map((entry) => <article className={`world-feed-item tone-${entry.tone}`} key={entry.id}><span>Год {entry.year} · {intelligenceLabel(entry.intel.level)} · {Math.round(entry.intel.confidence)}%</span><b>{entry.title}</b><p>{entry.text}</p></article>)}</aside>
  </main><CivilizationProfileWindow civilizationId={profileCivilizationId} onClose={() => setProfileCivilizationId(null)} onOpenContacts={() => { setProfileCivilizationId(null); store.setScreen('civilizations'); }}/></div>;
}
