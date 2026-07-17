import { useMemo, useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';

type SituationTab = 'crises' | 'wars' | 'states' | 'news';
type DetailTab = 'summary' | 'context' | 'action';

const situationCategoryLabel: Record<string, string> = { politics: 'ПОЛИТИКА', discovery: 'ОТКРЫТИЕ', conflict: 'ВОЙНА', culture: 'КУЛЬТУРА', research: 'ИССЛЕДОВАНИЕ', crew: 'ЭКИПАЖ', ecology: 'ЭКОЛОГИЯ' };

export function MobileSituationScreenV361({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<SituationTab>('crises');
  const [detailTab, setDetailTab] = useState<DetailTab>('summary');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const crises = useMemo(() => store.worldThreads
    .filter((thread) => thread.category !== 'conflict' && (thread.status === 'active' || thread.status === 'escalating'))
    .sort((a, b) => b.urgency - a.urgency), [store.worldThreads]);
  const wars = useMemo(() => store.worldThreads
    .filter((thread) => thread.category === 'conflict' && thread.status !== 'resolved')
    .sort((a, b) => b.urgency - a.urgency), [store.worldThreads]);
  const knownFactionIds = useMemo(() => {
    const ids = new Set(store.hubs.filter((hub) => hub.visited || hub.id === store.currentHubId).map((hub) => hub.factionId));
    store.contracts.filter((contract) => contract.status !== 'available').forEach((contract) => ids.add(contract.issuerFactionId));
    return ids;
  }, [store.hubs, store.currentHubId, store.contracts]);
  const states = store.factions.filter((faction) => knownFactionIds.has(faction.id));
  const news = store.news.slice(0, 60);

  const selectedThread = (tab === 'crises' ? crises : wars).find((entry) => entry.id === selectedId);
  const selectedFaction = tab === 'states' ? states.find((entry) => entry.id === selectedId) : undefined;
  const selectedNews = tab === 'news' ? news.find((entry) => entry.id === selectedId) : undefined;
  const hasSelection = Boolean(selectedThread || selectedFaction || selectedNews);

  const setSection = (next: SituationTab) => {
    setTab(next);
    setSelectedId(null);
    setDetailTab('summary');
  };

  const systemName = (id: string) => store.galaxy?.systems.find((system) => system.id === id)?.name ?? 'неизвестная система';
  const categoryLabel = (category: string) => situationCategoryLabel[category] ?? category.toUpperCase();

  const items = tab === 'crises'
    ? crises.map((thread) => <button className="v361-list-button" key={thread.id} onClick={() => setSelectedId(thread.id)}><span>{categoryLabel(thread.category)} · {formatInteger(thread.urgency)}</span><b>{thread.title}</b><p>{thread.systemIds[0] ? systemName(thread.systemIds[0]) : 'регион не установлен'} · {thread.status}</p><em>›</em></button>)
    : tab === 'wars'
      ? wars.map((thread) => <button className="v361-list-button danger" key={thread.id} onClick={() => setSelectedId(thread.id)}><span>ВОЕННЫЙ КОНФЛИКТ · {formatInteger(thread.urgency)}</span><b>{thread.title}</b><p>{thread.systemIds[0] ? systemName(thread.systemIds[0]) : 'фронт не установлен'} · {thread.status}</p><em>›</em></button>)
      : tab === 'states'
        ? states.map((faction) => <button className="v361-list-button" key={faction.id} onClick={() => setSelectedId(faction.id)}><span>{faction.kind} · {faction.disposition}</span><b>{faction.name}</b><p>Репутация {formatInteger(faction.reputation)}</p><em>›</em></button>)
        : news.map((entry) => <button className="v361-list-button" key={entry.id} onClick={() => setSelectedId(entry.id)}><span>ГОД {entry.year} · {entry.category.toUpperCase()}</span><b>{entry.headline}</b><p>{entry.reliability}% достоверности</p><em>›</em></button>);

  return <div className="game-shell v361-shell">{chrome}<main className="mobile-data-screen v361-screen">
    <header className="v361-screen-header"><div><span>РАЗВЕДЫВАТЕЛЬНАЯ КАРТИНА</span><h1>Обстановка</h1></div><b>{crises.length + wars.length}</b></header>
    <nav className="v361-tabs four">
      <button className={tab === 'crises' ? 'active' : ''} onClick={() => setSection('crises')}>Кризисы <b>{crises.length}</b></button>
      <button className={tab === 'wars' ? 'active' : ''} onClick={() => setSection('wars')}>Войны <b>{wars.length}</b></button>
      <button className={tab === 'states' ? 'active' : ''} onClick={() => setSection('states')}>Силы <b>{states.length}</b></button>
      <button className={tab === 'news' ? 'active' : ''} onClick={() => setSection('news')}>Новости</button>
    </nav>

    <section className={`v361-tab-body ${hasSelection ? 'detail-open' : ''}`}>
      {!hasSelection && <div className="v361-scroll-list">{items.length ? items : <div className="v361-empty"><b>Подтверждённых данных нет</b><p>Сканируй системы, посещай хабы и устанавливай контакт.</p></div>}</div>}

      {selectedThread && <article className="v361-dossier">
        <button className="v361-back" onClick={() => setSelectedId(null)}>← Обстановка</button>
        <span>{categoryLabel(selectedThread.category)} · СРОЧНОСТЬ {formatInteger(selectedThread.urgency)}</span>
        <h2>{selectedThread.title}</h2>
        <nav className="v361-subtabs"><button className={detailTab === 'summary' ? 'active' : ''} onClick={() => setDetailTab('summary')}>Сводка</button><button className={detailTab === 'context' ? 'active' : ''} onClick={() => setDetailTab('context')}>Участники</button><button className={detailTab === 'action' ? 'active' : ''} onClick={() => setDetailTab('action')}>Действие</button></nav>
        {detailTab === 'summary' && <section className="v361-detail-block"><p>{selectedThread.summary}</p><div className="v361-metric-row"><span>Прогресс <b>{formatInteger(selectedThread.progress)}%</b></span><span>Статус <b>{selectedThread.status}</b></span></div></section>}
        {detailTab === 'context' && <section className="v361-detail-block"><b>Известные системы</b><p>{selectedThread.systemIds.length ? selectedThread.systemIds.map(systemName).join(' · ') : 'Не установлены'}</p><b>Цивилизации</b><p>{selectedThread.civilizationIds.length || 'Не установлены'}</p></section>}
        {detailTab === 'action' && <section className="v361-detail-block"><b>Что можно сделать</b><p>{selectedThread.nextAction ?? 'Наблюдать за изменениями и искать новые источники.'}</p></section>}
        <footer><button className="primary-button" onClick={() => store.setScreen(selectedThread.category === 'research' ? 'laboratory' : selectedThread.category === 'ecology' ? 'system' : selectedThread.category === 'discovery' ? 'archive' : 'operations')}>Открыть связанный раздел</button></footer>
      </article>}

      {selectedFaction && <article className="v361-dossier"><button className="v361-back" onClick={() => setSelectedId(null)}>← Силы</button><span>{selectedFaction.kind} · {selectedFaction.disposition}</span><h2>{selectedFaction.name}</h2><div className="v361-metric-row"><span>Репутация <b>{formatInteger(selectedFaction.reputation)}</b></span><span>Законы <b>{selectedFaction.laws.length}</b></span><span>Память <b>{selectedFaction.memories.length}</b></span></div><section className="v361-detail-block"><b>Текущая позиция</b><p>{selectedFaction.memories[selectedFaction.memories.length - 1]?.text ?? 'Подтверждённых действий между сторонами ещё нет.'}</p></section><footer><button className="primary-button" onClick={() => store.setScreen('factions')}>Полное досье</button></footer></article>}

      {selectedNews && <article className="v361-dossier"><button className="v361-back" onClick={() => setSelectedId(null)}>← Новости</button><span>ГОД {selectedNews.year} · {selectedNews.reliability}%</span><h2>{selectedNews.headline}</h2><p>{selectedNews.text}</p></article>}
    </section>
  </main></div>;
}
