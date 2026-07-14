import { useMemo, useState } from 'react';
import { useGameStore, type MainScreen } from '../game/store';
import { useCompactLayout } from '../hooks/useCompactLayout';

const categoryLabel: Record<string, string> = {
  politics: 'Политика', discovery: 'Открытие', conflict: 'Конфликт',
  culture: 'Культура', research: 'Исследование', crew: 'Экипаж'
};

export function WorldScreen({ chrome }: { chrome: React.ReactNode }) {
  const store = useGameStore();
  const compact = useCompactLayout();
  const knownSystemIds = useMemo(() => new Set(store.galaxy?.systems.filter((system) => system.visited || system.scanned).map((system) => system.id) ?? []), [store.galaxy]);
  const knownFactionIds = useMemo(() => new Set(store.hubs.filter((hub) => hub.visited || hub.id === store.currentHubId).map((hub) => hub.factionId)), [store.hubs, store.currentHubId]);
  const knownCivilizationIds = useMemo(() => new Set(store.civilizationContacts.filter((contact) => contact.stage !== 'unknown').map((contact) => contact.civilizationId)), [store.civilizationContacts]);
  const visibleThreads = useMemo(() => store.worldThreads.filter((thread) =>
    thread.playerInvolved ||
    thread.factionIds.some((id) => knownFactionIds.has(id)) ||
    thread.civilizationIds.some((id) => knownCivilizationIds.has(id))
  ), [store.worldThreads, knownFactionIds, knownCivilizationIds]);
  const visibleNews = useMemo(() => store.news.filter((entry) => entry.systemIds.some((id) => knownSystemIds.has(id))), [store.news, knownSystemIds]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'threads' | 'news'>('threads');
  const selected = visibleThreads.find((entry) => entry.id === selectedId) ?? (!compact ? visibleThreads[0] : undefined);
  const timeline = useMemo(() => [
    ...visibleNews.slice(0, 12).map((entry) => ({ id: `news_${entry.id}`, year: entry.year, title: entry.headline, text: entry.text, tone: entry.category === 'security' ? 'warning' : 'info' })),
    ...store.logs.slice(0, 12).map((entry) => ({ id: `log_${entry.id}`, year: entry.year, title: entry.title, text: entry.text, tone: entry.tone }))
  ].sort((a, b) => b.year - a.year).slice(0, 18), [visibleNews, store.logs]);

  const openRelated = () => {
    if (!selected) return;
    const screen: MainScreen = selected.category === 'research' ? 'laboratory' : selected.category === 'discovery' ? 'archive' : selected.category === 'conflict' || selected.category === 'politics' ? 'factions' : 'civilizations';
    store.setScreen(screen);
  };

  if (compact) {
    return <div className="game-shell">{chrome}<main className="mobile-data-screen world-mobile">
      <header className="mobile-screen-header">
        <div><span className="eyebrow">ПОДТВЕРЖДЁННАЯ СВЯЗЬ</span><h1>Живой мир</h1></div>
        <b>{visibleThreads.length}</b>
      </header>

      {!selected && <nav className="mobile-segmented" aria-label="Раздел живого мира">
        <button className={mobileTab === 'threads' ? 'active' : ''} onClick={() => setMobileTab('threads')}>Процессы</button>
        <button className={mobileTab === 'news' ? 'active' : ''} onClick={() => setMobileTab('news')}>Новости</button>
      </nav>}

      {selected ? <section className="mobile-detail-view">
        <button className="mobile-back" onClick={() => setSelectedId(null)}>← Все процессы</button>
        <span className="eyebrow">{categoryLabel[selected.category]} · срочность {Math.round(selected.urgency)}</span>
        <h2>{selected.title}</h2>
        <p className="mobile-lead">{selected.summary}</p>
        <div className="mobile-progress"><i style={{ width: `${selected.progress}%` }}/><span>{selected.progress}% · {selected.status}</span></div>
        <article className="mobile-action-card"><b>Что можно сделать</b><p>{selected.nextAction ?? 'Наблюдать за изменениями.'}</p><button className="primary-button" onClick={openRelated}>Открыть связанный раздел</button></article>
        <details className="mobile-collapsible"><summary>Изменения · {selected.updates.length}</summary>{selected.updates.slice(-3).reverse().map((update) => <div className={`mobile-timeline-row tone-${update.tone}`} key={update.id}><span>{update.year < 0 ? `${Math.abs(update.year)} до старта` : `Год ${update.year}`}</span><p>{update.text}</p></div>)}</details>
      </section> : mobileTab === 'threads' ? <section className="mobile-list">
        {visibleThreads.length ? visibleThreads.map((thread) => <button className="mobile-list-row" key={thread.id} onClick={() => setSelectedId(thread.id)}>
          <span>{categoryLabel[thread.category]} · {thread.status}</span>
          <b>{thread.title}</b>
          <i style={{ width: `${thread.progress}%` }}/>
        </button>) : <div className="mobile-empty"><b>Связь молчит</b><p>Посети поселение или установи контакт.</p></div>}
      </section> : <section className="mobile-list">
        {timeline.length ? timeline.map((entry) => <article className={`mobile-feed-row tone-${entry.tone}`} key={entry.id}><span>Год {entry.year}</span><b>{entry.title}</b></article>) : <div className="mobile-empty"><b>Новостей нет</b><p>Нужна связь с хабом или посещённым регионом.</p></div>}
      </section>}
    </main></div>;
  }

  return <div className="game-shell">{chrome}<main className="world-screen world-screen-known">
    <aside className="world-thread-list"><header><span className="eyebrow">ПОДТВЕРЖДЁННАЯ СВЯЗЬ</span><h1>Живой мир</h1><p>Здесь появляются только процессы, о которых корабль узнал через контакт, новости или твои действия.</p></header><div>{visibleThreads.length ? visibleThreads.map((thread) => <button key={thread.id} className={`${selected?.id === thread.id ? 'active' : ''} thread-${thread.status}`} onClick={() => setSelectedId(thread.id)}><span>{categoryLabel[thread.category]} · {thread.status}</span><b>{thread.title}</b><small>{thread.summary}</small><i style={{ width: `${thread.progress}%` }}/></button>) : <div className="unknown-state"><b>Связь молчит</b><p>Посети поселение, установи контакт или получи новости. Игра не показывает события, о которых капитан не может знать.</p></div>}</div></aside>
    <section className="world-thread-detail">{selected ? <><header className={`thread-hero thread-${selected.status}`}><div><span className="eyebrow">{categoryLabel[selected.category]} · СРОЧНОСТЬ {Math.round(selected.urgency)}</span><h1>{selected.title}</h1><p>{selected.summary}</p></div><div className="thread-progress-ring"><b>{selected.progress}%</b><span>{selected.status}</span></div></header><section className="thread-context-grid"><article><span className="eyebrow">ПОЧЕМУ ТЫ ЭТО ЗНАЕШЬ</span><p>{selected.playerInvolved ? 'Твои действия стали частью этой истории.' : 'Сведения получены от известной стороны или через доступный канал связи.'}</p></article><article><span className="eyebrow">ДОСТУПНОЕ ДЕЙСТВИЕ</span><p>{selected.nextAction ?? 'Наблюдать за изменениями.'}</p><button className="primary-button" onClick={openRelated}>Перейти к связанным данным</button></article></section><section className="thread-timeline"><h2>Подтверждённые изменения</h2>{selected.updates.map((update) => <article className={`timeline-entry tone-${update.tone}`} key={update.id}><span>{update.year < 0 ? `${Math.abs(update.year)} до старта` : `Год ${update.year}`}</span><p>{update.text}</p></article>)}</section></> : <div className="unknown-state large"><b>Пока нечего отслеживать</b><p>Ты начинаешь без галактической разведсети. Мир существует, но знания о нём придётся добыть.</p></div>}</section>
    <aside className="world-news-column"><span className="eyebrow">ИЗВЕСТНЫЕ ИЗМЕНЕНИЯ</span><h2>Что дошло до корабля</h2>{timeline.length ? timeline.map((entry) => <article className={`world-feed-item tone-${entry.tone}`} key={entry.id}><span>Год {entry.year}</span><b>{entry.title}</b><p>{entry.text}</p></article>) : <div className="unknown-state"><b>Нет новостей</b><p>Для получения данных нужна связь с хабом или посещённым регионом.</p></div>}</aside>
  </main></div>;
}
