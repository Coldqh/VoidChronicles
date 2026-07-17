import { useMemo, useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { buildKnownChronicle, chronicleDomainLabel, knownChronicleStatus, traceKnownCausalChain, type ChronicleDomain } from '../simulation/chronicle';
import { intelligenceLabel } from '../simulation/intelligence';

type ChronicleTab = 'feed' | 'player' | 'captains';
type DetailTab = 'event' | 'causes' | 'participants' | 'results';

const domains: ChronicleDomain[] = ['politics', 'war', 'economy', 'society', 'culture', 'science', 'ecology', 'heritage', 'demography', 'player'];

export function MobileChronicleScreenV361({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<ChronicleTab>('feed');
  const [domain, setDomain] = useState<ChronicleDomain | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('event');

  const context = useMemo(() => store.galaxy ? ({ seed: store.galaxy.seed, galaxy: store.galaxy, factions: store.factions, hubs: store.hubs }) : null, [store.galaxy, store.factions, store.hubs]);
  const archiveCivilizationIds = useMemo(() => [...new Set(store.archaeologyChains.filter((chain) => chain.stages.some((stage) => stage.status === 'completed')).map((chain) => chain.civilizationId))], [store.archaeologyChains]);
  const access = useMemo(() => ({ knowledge: store.knowledge, contacts: store.civilizationContacts, currentHour: store.simulation?.clock.absoluteHour ?? 0, archiveCivilizationIds }), [store.knowledge, store.civilizationContacts, store.simulation?.clock.absoluteHour, archiveCivilizationIds]);
  const chronicle = useMemo(() => {
    if (!store.simulation || !context) return [];
    return buildKnownChronicle(store.simulation, context, access, {
      domains: domain === 'all' ? undefined : [domain],
      playerOnly: tab === 'player',
      minimumIntelligence: tab === 'player' ? 'observed' : 'confirmed',
      limit: 600
    });
  }, [store.simulation, context, access, domain, tab]);
  const selected = chronicle.find((entry) => entry.id === selectedId);
  const causalChain = useMemo(() => store.simulation && selected?.source === 'live-simulation'
    ? traceKnownCausalChain(store.simulation, selected.id, access, 'confirmed', 5)
    : [], [store.simulation, selected, access]);

  const entityNames = (ids: string[], type: 'system' | 'civilization' | 'faction') => ids.map((id) => {
    if (type === 'system') return store.galaxy?.systems.find((entry) => entry.id === id)?.name;
    if (type === 'civilization') return store.galaxy?.civilizations.find((entry) => entry.id === id)?.name;
    return store.factions.find((entry) => entry.id === id)?.name;
  }).filter((entry): entry is string => Boolean(entry)).join(' · ') || 'не установлены';

  const changeTab = (next: ChronicleTab) => {
    setTab(next);
    setSelectedId(null);
    setDetailTab('event');
  };

  return <div className="game-shell v361-shell">{chrome}<main className="mobile-data-screen v361-screen">
    <header className="v361-screen-header"><div><span>ГОД {store.gameYear}</span><h1>Хроника</h1></div><button className="v361-filter-button" onClick={() => setFilterOpen(true)}>Фильтр</button></header>
    <nav className="v361-tabs three"><button className={tab === 'feed' ? 'active' : ''} onClick={() => changeTab('feed')}>Лента</button><button className={tab === 'player' ? 'active' : ''} onClick={() => changeTab('player')}>Мои решения</button><button className={tab === 'captains' ? 'active' : ''} onClick={() => changeTab('captains')}>Капитаны</button></nav>

    <section className={`v361-tab-body ${selected ? 'detail-open' : ''}`}>
      {tab === 'captains' && <div className="v361-scroll-list">{store.legacy.captains.map((captain) => <article className="v361-list-static" key={captain.id}><span>КАПИТАН · {captain.endedYear === undefined ? 'ДЕЙСТВУЕТ' : `${captain.startedYear}—${captain.endedYear}`}</span><b>{captain.name}</b><p>{captain.systemsVisited} систем · {captain.discoveries} открытий · {captain.battles} боёв</p></article>)}</div>}

      {tab !== 'captains' && !selected && <div className="v361-scroll-list">{chronicle.length ? chronicle.map((entry) => <button className={`v361-list-button ${entry.severity >= 8 ? 'danger' : ''}`} key={entry.id} onClick={() => setSelectedId(entry.id)}><span>ГОД {entry.year} · {chronicleDomainLabel(entry.domain).toUpperCase()}</span><b>{entry.title}</b><p>{knownChronicleStatus(entry)} · {entry.confidence}%</p><em>›</em></button>) : <div className="v361-empty"><b>Данных нет</b><p>Ищи архивы, сканируй системы и устанавливай контакт.</p></div>}</div>}

      {selected && <article className="v361-dossier">
        <button className="v361-back" onClick={() => setSelectedId(null)}>← Хроника</button>
        <span>{chronicleDomainLabel(selected.domain)} · ГОД {selected.year}</span><h2>{selected.title}</h2>
        <nav className="v361-subtabs"><button className={detailTab === 'event' ? 'active' : ''} onClick={() => setDetailTab('event')}>Событие</button><button className={detailTab === 'causes' ? 'active' : ''} onClick={() => setDetailTab('causes')}>Причины</button><button className={detailTab === 'participants' ? 'active' : ''} onClick={() => setDetailTab('participants')}>Участники</button><button className={detailTab === 'results' ? 'active' : ''} onClick={() => setDetailTab('results')}>Итоги</button></nav>
        {detailTab === 'event' && <><p>{selected.summary}</p><div className="v361-metric-row"><span>Достоверность <b>{selected.confidence}%</b></span><span>Уровень <b>{intelligenceLabel(selected.intelligenceLevel)}</b></span><span>Давность <b>{selected.staleYears}</b></span></div></>}
        {detailTab === 'causes' && <div className="v361-compact-list">{causalChain.length > 1 ? causalChain.map((event) => <article key={event.id}><span>ИЗВЕСТНАЯ ЦЕПОЧКА</span><b>{event.title}</b></article>) : <div className="v361-empty"><b>Причины не установлены</b><p>Нужны новые источники и архивы.</p></div>}</div>}
        {detailTab === 'participants' && <section className="v361-detail-block"><b>Системы</b><p>{entityNames(selected.systemIds, 'system')}</p><b>Цивилизации</b><p>{entityNames(selected.civilizationIds, 'civilization')}</p><b>Фракции</b><p>{entityNames(selected.factionIds, 'faction')}</p></section>}
        {detailTab === 'results' && <section className="v361-detail-block"><b>Известные последствия</b><p>{selected.unknownResultLinks ? 'Часть последствий скрыта текущим уровнем разведки.' : 'Доступная причинная цепочка полностью отражена в известных данных.'}</p></section>}
      </article>}
    </section>

    {filterOpen && <div className="v361-sheet-backdrop"><button aria-label="Закрыть фильтр" onClick={() => setFilterOpen(false)}/><section className="v361-filter-sheet"><header><h2>Фильтр хроники</h2><button onClick={() => setFilterOpen(false)}>×</button></header><div className="v361-filter-grid"><button className={domain === 'all' ? 'active' : ''} onClick={() => { setDomain('all'); setSelectedId(null); }}>Все</button>{domains.map((entry) => <button className={domain === entry ? 'active' : ''} key={entry} onClick={() => { setDomain(entry); setSelectedId(null); }}>{chronicleDomainLabel(entry)}</button>)}</div></section></div>}
  </main></div>;
}
