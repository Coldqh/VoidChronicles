import type { ReactNode } from 'react';
import { useState } from 'react';
import { useGameStore } from '../game/store';

const fateLabel: Record<string, string> = {
  active: 'командует', dead: 'погиб', missing: 'пропал', captured: 'захвачен', coma: 'в коме', stranded: 'оставлен на поверхности', retired: 'сложил полномочия'
};

async function destructiveReset(startAgain: boolean): Promise<void> {
  const store = useGameStore.getState();
  const message = startAgain
    ? 'Текущая ironman-кампания будет удалена. Настройки генерации сохранятся для нового старта. Продолжить?'
    : 'Удалить текущую кампанию и резервные копии? Это действие нельзя отменить.';
  if (!window.confirm(message)) return;
  if (startAgain && store.galaxy) {
    try { localStorage.setItem('void-chronicles:new-campaign-preset', JSON.stringify(store.galaxy.settings)); } catch { /* optional */ }
  }
  await store.clearGame();
}

export function ContinuityScreen() {
  const store = useGameStore();
  const ended = [...store.legacy.captains].reverse().find((entry) => entry.endedYear !== undefined);
  if (!store.ship || !store.captain) return null;
  const visited = store.galaxy?.systems.filter((entry) => entry.visited).length ?? 0;
  const title = store.captain.condition === 'dead' ? 'Капитан погиб' : store.captain.condition === 'captured' ? 'Капитан захвачен' : store.captain.condition === 'missing' ? 'Капитан пропал' : 'Командование потеряно';

  return <main className="game-over-screen">
    <section className="game-over-panel">
      <span className="eyebrow">IRONMAN · КАМПАНИЯ ОКОНЧЕНА</span>
      <h1>{title}</h1>
      <p>{store.legacy.continuityReason ?? `Статус: ${fateLabel[store.captain.condition] ?? store.captain.condition}.`}</p>
      <div className="game-over-metrics">
        <article><span>ГОД</span><b>{store.gameYear}</b></article>
        <article><span>СИСТЕМЫ</span><b>{visited}</b></article>
        <article><span>ОТКРЫТИЯ</span><b>{ended?.discoveries ?? store.discoveries.length}</b></article>
        <article><span>БОИ</span><b>{ended?.battles ?? 0}</b></article>
      </div>
      <div className="game-over-actions">
        <button onClick={() => void store.enterChronicleMode()}>Открыть хронику</button>
        <button className="primary-button" onClick={() => void destructiveReset(true)}>Новая кампания</button>
        <button className="danger-button" onClick={() => void destructiveReset(false)}>Удалить сейв</button>
      </div>
    </section>
  </main>;
}

export function ChronicleScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<'timeline' | 'captains' | 'lost' | 'memorials'>('timeline');
  const visited = store.galaxy?.systems.filter((entry) => entry.visited).length ?? 0;
  return <div className="game-shell">{chrome}<main className="scroll-screen chronicle-screen">
    <header className="chronicle-hero">
      <div><span className="eyebrow">ХРОНИКА ГАЛАКТИКИ · ГОД {store.gameYear}</span><h1>След экспедиции</h1><p>Командование завершено. Мир продолжает жить без капитана.</p></div>
      <div className="chronicle-actions"><button onClick={() => void store.advanceChronicle(5)}>Наблюдать 5 лет</button><button onClick={() => void store.advanceChronicle(20)}>Наблюдать 20 лет</button></div>
    </header>
    <section className="chronicle-metrics"><article><b>{store.legacy.captains.length}</b><span>капитанов</span></article><article><b>{visited}</b><span>систем посещено</span></article><article><b>{store.discoveries.length}</b><span>открытий</span></article><article><b>{store.legacy.lostExpeditions.filter((entry) => entry.status === 'unrecovered').length}</b><span>потерянных экспедиций</span></article></section>
    <nav className="tabs sticky-tabs"><button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>Летопись</button><button className={tab === 'captains' ? 'active' : ''} onClick={() => setTab('captains')}>Капитан</button><button className={tab === 'lost' ? 'active' : ''} onClick={() => setTab('lost')}>Потерянные</button><button className={tab === 'memorials' ? 'active' : ''} onClick={() => setTab('memorials')}>Мемориалы</button></nav>
    {tab === 'timeline' && <section className="chronicle-timeline">{store.legacy.chronicle.map((entry) => <article className={`chronicle-entry tone-${entry.tone}`} key={entry.id}><time>{entry.year}</time><div><span>{entry.category}</span><h3>{entry.title}</h3><p>{entry.text}</p></div></article>)}</section>}
    {tab === 'captains' && <section className="captain-legacy-grid">{store.legacy.captains.map((entry) => <article key={entry.id}><span className="eyebrow">КАПИТАН</span><h3>{entry.name}</h3><p>{entry.endedYear === undefined ? 'Командование продолжается' : `${entry.startedYear}—${entry.endedYear} · ${fateLabel[entry.fate ?? 'active']}`}</p><div className="legacy-stats"><span>системы <b>{entry.systemsVisited}</b></span><span>открытия <b>{entry.discoveries}</b></span><span>бои <b>{entry.battles}</b></span></div>{entry.epitaph && <blockquote>{entry.epitaph}</blockquote>}</article>)}</section>}
    {tab === 'lost' && <section className="lost-expedition-grid">{store.legacy.lostExpeditions.length === 0 ? <p className="empty-state">Потерянных экспедиций нет.</p> : store.legacy.lostExpeditions.map((entry) => <article key={entry.id}><span>{entry.status} · год {entry.year}</span><h3>{store.pointsOfInterest.find((point) => point.id === entry.pointOfInterestId)?.name ?? 'Неизвестная локация'}</h3><p>{entry.summary}</p><small>{store.galaxy?.systems.find((system) => system.id === entry.systemId)?.name}</small></article>)}</section>}
    {tab === 'memorials' && <section className="memorial-grid">{store.legacy.memorials.length === 0 ? <div className="legacy-empty"><b>Мемориалов нет</b></div> : store.legacy.memorials.map((entry) => <article key={entry.id}><span>{entry.type} · {entry.year}</span><h3>{store.legacy.captains.find((captain) => captain.id === entry.captainRecordId)?.name}</h3><p>{entry.text}</p></article>)}</section>}
    <footer className="chronicle-footer"><button className="danger-button" onClick={() => void destructiveReset(false)}>Сбросить кампанию</button><button className="primary-button" onClick={() => void destructiveReset(true)}>Начать новую кампанию</button></footer>
  </main></div>;
}
