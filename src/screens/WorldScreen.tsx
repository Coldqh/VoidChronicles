import { useMemo, useState } from 'react';
import { useGameStore, type MainScreen } from '../game/store';

const categoryLabel: Record<string, string> = { politics: 'Политика', discovery: 'Открытие', conflict: 'Конфликт', culture: 'Культура', research: 'Исследование', crew: 'Экипаж' };

export function WorldScreen({ chrome }: { chrome: React.ReactNode }) {
  const store = useGameStore();
  const [selectedId, setSelectedId] = useState(store.worldThreads[0]?.id ?? null);
  const selected = store.worldThreads.find((entry) => entry.id === selectedId) ?? store.worldThreads[0];
  const timeline = useMemo(() => [
    ...store.news.slice(0, 15).map((entry) => ({ id: `news_${entry.id}`, year: entry.year, title: entry.headline, text: entry.text, tone: entry.category === 'security' ? 'warning' : 'info' })),
    ...store.logs.slice(0, 15).map((entry) => ({ id: `log_${entry.id}`, year: entry.year, title: entry.title, text: entry.text, tone: entry.tone }))
  ].sort((a, b) => b.year - a.year).slice(0, 24), [store.news, store.logs]);

  const openRelated = () => {
    if (!selected) return;
    const screen: MainScreen = selected.category === 'research' ? 'laboratory' : selected.category === 'discovery' ? 'archive' : selected.category === 'conflict' || selected.category === 'politics' ? 'factions' : 'civilizations';
    store.setScreen(screen);
  };

  return <div className="game-shell">{chrome}<main className="world-screen">
    <aside className="world-thread-list"><header><span className="eyebrow">ЖИВАЯ ГАЛАКТИКА</span><h1>Нити событий</h1><p>Здесь не справочник. Это процессы, которые продолжаются без игрока и меняются после его действий.</p></header><div>{store.worldThreads.map((thread) => <button key={thread.id} className={`${selected?.id === thread.id ? 'active' : ''} thread-${thread.status}`} onClick={() => setSelectedId(thread.id)}><span>{categoryLabel[thread.category]} · {thread.status}</span><b>{thread.title}</b><small>{thread.summary}</small><i style={{ width: `${thread.progress}%` }}/></button>)}</div></aside>
    <section className="world-thread-detail">{selected ? <><header className={`thread-hero thread-${selected.status}`}><div><span className="eyebrow">{categoryLabel[selected.category]} · СРОЧНОСТЬ {Math.round(selected.urgency)}</span><h1>{selected.title}</h1><p>{selected.summary}</p></div><div className="thread-progress-ring"><b>{selected.progress}%</b><span>{selected.status}</span></div></header><section className="thread-context-grid"><article><span className="eyebrow">ПОЧЕМУ ЭТО ВАЖНО</span><p>{selected.playerInvolved ? 'Твои решения уже стали частью этой истории. Стороны помнят участие и будут реагировать дальше.' : 'Процесс развивается сам. Игрок может вмешаться сейчас или увидеть последствия позднее.'}</p></article><article><span className="eyebrow">СЛЕДУЮЩИЙ ШАГ</span><p>{selected.nextAction ?? 'Наблюдать за изменениями.'}</p><button className="primary-button" onClick={openRelated}>Открыть связанную систему</button></article><article><span className="eyebrow">УЧАСТНИКИ</span><div className="tags">{selected.factionIds.map((id) => <span key={id}>{store.factions.find((entry) => entry.id === id)?.name ?? id}</span>)}{selected.civilizationIds.map((id) => <span key={id}>{store.galaxy?.civilizations.find((entry) => entry.id === id)?.name ?? id}</span>)}</div></article></section><section className="thread-timeline"><h2>Как менялась ситуация</h2>{selected.updates.map((update) => <article className={`timeline-entry tone-${update.tone}`} key={update.id}><span>{update.year < 0 ? `${Math.abs(update.year)} до старта` : `Год ${update.year}`}</span><p>{update.text}</p></article>)}</section></> : <p>Нет активных мировых процессов.</p>}</section>
    <aside className="world-news-column"><span className="eyebrow">ПОТОК ИЗМЕНЕНИЙ</span><h2>Что произошло</h2>{timeline.map((entry) => <article className={`world-feed-item tone-${entry.tone}`} key={entry.id}><span>Год {entry.year}</span><b>{entry.title}</b><p>{entry.text}</p></article>)}</aside>
  </main></div>;
}
