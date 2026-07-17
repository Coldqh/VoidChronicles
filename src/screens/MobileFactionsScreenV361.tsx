import { useMemo, useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';

type FactionTab = 'all' | 'allies' | 'enemies';
type DossierTab = 'overview' | 'relations' | 'laws' | 'links';

export function MobileFactionsScreenV361({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<FactionTab>('all');
  const [dossierTab, setDossierTab] = useState<DossierTab>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const knownFactionIds = useMemo(() => {
    const ids = new Set(store.hubs.filter((hub) => hub.visited || hub.id === store.currentHubId).map((hub) => hub.factionId));
    store.contracts.filter((contract) => contract.status !== 'available').forEach((contract) => ids.add(contract.issuerFactionId));
    return ids;
  }, [store.hubs, store.currentHubId, store.contracts]);

  const known = store.factions.filter((faction) => knownFactionIds.has(faction.id));
  const visible = known.filter((faction) => tab === 'all' || (tab === 'allies' ? faction.reputation >= 20 : faction.reputation <= -20));
  const selected = known.find((faction) => faction.id === selectedId);
  const linkedHubs = selected ? store.hubs.filter((hub) => hub.factionId === selected.id) : [];
  const linkedContracts = selected ? store.contracts.filter((contract) => contract.issuerFactionId === selected.id) : [];

  const changeTab = (next: FactionTab) => {
    setTab(next);
    setSelectedId(null);
    setDossierTab('overview');
  };

  return <div className="game-shell v361-shell">{chrome}<main className="mobile-data-screen v361-screen">
    <header className="v361-screen-header"><div><span>ПОЛИТИЧЕСКАЯ КАРТА</span><h1>Фракции</h1></div><b>{known.length}</b></header>
    <nav className="v361-tabs three"><button className={tab === 'all' ? 'active' : ''} onClick={() => changeTab('all')}>Все</button><button className={tab === 'allies' ? 'active' : ''} onClick={() => changeTab('allies')}>Союзники</button><button className={tab === 'enemies' ? 'active' : ''} onClick={() => changeTab('enemies')}>Враги</button></nav>

    <section className={`v361-tab-body ${selected ? 'detail-open' : ''}`}>
      {!selected && <div className="v361-scroll-list">{visible.length ? visible.map((faction) => <button className={`v361-list-button ${faction.reputation <= -20 ? 'danger' : faction.reputation >= 20 ? 'good' : ''}`} key={faction.id} onClick={() => setSelectedId(faction.id)}><span>{faction.kind} · {faction.disposition}</span><b>{faction.name}</b><p>Репутация {formatInteger(faction.reputation)}</p><em>›</em></button>) : <div className="v361-empty"><b>Фракций нет</b><p>Нужен контакт, стыковка или контракт.</p></div>}</div>}

      {selected && <article className="v361-dossier">
        <button className="v361-back" onClick={() => setSelectedId(null)}>← Фракции</button>
        <span>{selected.kind} · {selected.disposition}</span><h2>{selected.name}</h2>
        <nav className="v361-subtabs"><button className={dossierTab === 'overview' ? 'active' : ''} onClick={() => setDossierTab('overview')}>Обзор</button><button className={dossierTab === 'relations' ? 'active' : ''} onClick={() => setDossierTab('relations')}>Отношения</button><button className={dossierTab === 'laws' ? 'active' : ''} onClick={() => setDossierTab('laws')}>Законы</button><button className={dossierTab === 'links' ? 'active' : ''} onClick={() => setDossierTab('links')}>Связи</button></nav>
        {dossierTab === 'overview' && <><div className="v361-metric-row"><span>Репутация <b>{formatInteger(selected.reputation)}</b></span><span>Хабы <b>{linkedHubs.length}</b></span><span>Контракты <b>{linkedContracts.length}</b></span></div><section className="v361-detail-block"><b>Последняя известная позиция</b><p>{selected.memories.length ? selected.memories[selected.memories.length - 1].text : 'Взаимодействий ещё не было.'}</p></section></>}
        {dossierTab === 'relations' && <div className="v361-compact-list">{selected.memories.length ? [...selected.memories].reverse().map((memory) => <article key={memory.id}><span>ПАМЯТЬ ОТНОШЕНИЙ</span><b>{memory.text}</b></article>) : <div className="v361-empty"><b>Память пуста</b><p>Фракция ещё не запомнила действия капитана.</p></div>}</div>}
        {dossierTab === 'laws' && <div className="v361-chip-list">{selected.laws.map((law) => <span key={law}>{law}</span>)}</div>}
        {dossierTab === 'links' && <div className="v361-compact-list">{linkedHubs.map((hub) => <button className="v361-list-button" key={hub.id} onClick={() => { if (hub.systemId) store.selectSystem(hub.systemId); store.setScreen('galaxy'); }}><span>{hub.kind}</span><b>{hub.name}</b><p>{hub.visited ? 'Посещён' : 'Известен'}</p><em>›</em></button>)}{!linkedHubs.length && <div className="v361-empty"><b>Связей нет</b><p>Известные узлы этой фракции не обнаружены.</p></div>}</div>}
      </article>}
    </section>
  </main></div>;
}
