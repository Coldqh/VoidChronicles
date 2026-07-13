import type { ReactNode } from 'react';
import { useState } from 'react';
import { useGameStore } from '../game/store';

const fateLabel: Record<string, string> = {
  active: 'командует', dead: 'погиб', missing: 'пропал', captured: 'в плену', coma: 'в коме', stranded: 'оставлен на поверхности', retired: 'сложил полномочия'
};

async function destructiveReset(startAgain: boolean): Promise<void> {
  const store = useGameStore.getState();
  const message = startAgain
    ? 'Текущая ironman-кампания будет удалена. Настройки генерации сохранятся для нового старта. Продолжить?'
    : 'Удалить текущую кампанию, резервные копии и аварийный сейв? Это действие нельзя отменить.';
  if (!window.confirm(message)) return;
  if (startAgain && store.galaxy) {
    try { localStorage.setItem('void-chronicles:new-campaign-preset', JSON.stringify(store.galaxy.settings)); } catch { /* optional */ }
  }
  await store.clearGame();
}

export function ContinuityScreen() {
  const store = useGameStore();
  const [message, setMessage] = useState('');
  const currentRecord = store.legacy.captains.find((entry) => entry.id === store.legacy.currentCaptainRecordId);
  const ended = [...store.legacy.captains].reverse().find((entry) => entry.endedYear !== undefined);
  if (!store.ship || !store.captain) return null;

  const choose = async (id: string) => {
    const result = await store.chooseSuccessor(id);
    setMessage(result.message);
  };

  return <main className="continuity-screen">
    <div className="continuity-stars" />
    <section className="continuity-panel">
      <header>
        <span className="eyebrow">КОМАНДОВАНИЕ ПРЕРВАНО</span>
        <h1>{store.captain.name}</h1>
        <p>{store.legacy.continuityReason ?? `Статус: ${fateLabel[store.captain.condition] ?? store.captain.condition}.`}</p>
      </header>

      <section className="continuity-status-grid">
        <article><span>КОРАБЛЬ</span><b>{store.ship.name}</b><small>корпус {store.ship.hull}/{store.ship.maxHull}</small></article>
        <article><span>ЭКИПАЖ</span><b>{store.crew.filter((entry) => entry.status !== 'deceased').length}</b><small>доступных преемников {store.legacy.successionCandidates.filter((entry) => entry.eligible).length}</small></article>
        <article><span>РОЗЫСК</span><b>{store.pursuits.filter((entry) => entry.status === 'active').length}</b><small>источников угрозы</small></article>
        <article><span>НАСЛЕДИЕ</span><b>{ended?.discoveries ?? currentRecord?.discoveries ?? store.discoveries.length}</b><small>открытий в архиве</small></article>
      </section>

      <section className="successor-section">
        <div className="section-heading"><span className="eyebrow">ПРЕЕМНИКИ</span><h2>Кто продолжит путь</h2></div>
        {store.legacy.successionCandidates.length === 0 ? <div className="legacy-empty"><b>Командование принять некому</b><p>Можно завершить кампанию и открыть режим хроники.</p></div> : <div className="successor-grid">
          {store.legacy.successionCandidates.map((candidate) => <article className={`successor-card ${candidate.source}`} key={candidate.id}>
            <div className="successor-mark">{candidate.source === 'ai' ? 'AI' : candidate.name.slice(0, 2).toUpperCase()}</div>
            <span className="eyebrow">{candidate.source === 'ai' ? 'АВТОНОМНЫЙ РЕЖИМ' : candidate.role.toUpperCase()}</span>
            <h3>{candidate.name}</h3>
            <p>Готовность {candidate.loyalty}/100</p>
            <ul>{candidate.consequences.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            <button className="primary-button" disabled={!candidate.eligible || Boolean(store.busyAction)} onClick={() => void choose(candidate.id)}>Передать командование</button>
          </article>)}
        </div>}
      </section>

      {message && <p className="continuity-message">{message}</p>}
      <footer className="continuity-actions">
        <button onClick={() => void store.createMemorial('archive')}>Записать память в архив</button>
        <button onClick={() => void store.enterChronicleMode()}>Завершить экспедицию</button>
        <button className="danger-button" onClick={() => void destructiveReset(false)}>Сбросить кампанию</button>
        <button className="danger-button" onClick={() => void destructiveReset(true)}>Начать заново</button>
      </footer>
    </section>
  </main>;
}

export function ChronicleScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<'timeline' | 'captains' | 'lost' | 'memorials'>('timeline');
  const visited = store.galaxy?.systems.filter((entry) => entry.visited).length ?? 0;
  return <div className="game-shell">{chrome}<main className="scroll-screen chronicle-screen">
    <header className="chronicle-hero">
      <div><span className="eyebrow">ХРОНИКА ГАЛАКТИКИ · ГОД {store.gameYear}</span><h1>След экспедиции</h1><p>Командование завершено. Мир продолжает двигаться, воевать и хранить последствия прежних решений.</p></div>
      <div className="chronicle-actions"><button onClick={() => void store.advanceChronicle(5)}>Наблюдать 5 лет</button><button onClick={() => void store.advanceChronicle(20)}>Наблюдать 20 лет</button></div>
    </header>
    <section className="chronicle-metrics"><article><b>{store.legacy.captains.length}</b><span>капитанов</span></article><article><b>{visited}</b><span>систем посещено</span></article><article><b>{store.discoveries.length}</b><span>открытий</span></article><article><b>{store.legacy.lostExpeditions.filter((entry) => entry.status === 'unrecovered').length}</b><span>потерянных экспедиций</span></article></section>
    <nav className="tabs sticky-tabs"><button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>Летопись</button><button className={tab === 'captains' ? 'active' : ''} onClick={() => setTab('captains')}>Капитаны</button><button className={tab === 'lost' ? 'active' : ''} onClick={() => setTab('lost')}>Потерянные</button><button className={tab === 'memorials' ? 'active' : ''} onClick={() => setTab('memorials')}>Мемориалы</button></nav>
    {tab === 'timeline' && <section className="chronicle-timeline">{store.legacy.chronicle.map((entry) => <article className={`chronicle-entry tone-${entry.tone}`} key={entry.id}><time>{entry.year}</time><div><span>{entry.category}</span><h3>{entry.title}</h3><p>{entry.text}</p></div></article>)}</section>}
    {tab === 'captains' && <section className="captain-legacy-grid">{store.legacy.captains.map((entry) => <article key={entry.id}><span className="eyebrow">{entry.commandIdentity === 'shipAI' ? 'КОРАБЕЛЬНЫЙ ИИ' : 'КАПИТАН'}</span><h3>{entry.name}</h3><p>{entry.endedYear === undefined ? 'Командование продолжается' : `${entry.startedYear}—${entry.endedYear} · ${fateLabel[entry.fate ?? 'active']}`}</p><div className="legacy-stats"><span>системы <b>{entry.systemsVisited}</b></span><span>открытия <b>{entry.discoveries}</b></span><span>бои <b>{entry.battles}</b></span></div>{entry.epitaph && <blockquote>{entry.epitaph}</blockquote>}</article>)}</section>}
    {tab === 'lost' && <section className="lost-expedition-grid">{store.legacy.lostExpeditions.length === 0 ? <p className="empty-state">Потерянных экспедиций нет.</p> : store.legacy.lostExpeditions.map((entry) => <article key={entry.id}><span>{entry.status} · год {entry.year}</span><h3>{store.pointsOfInterest.find((point) => point.id === entry.pointOfInterestId)?.name ?? 'Неизвестная локация'}</h3><p>{entry.summary}</p><small>{store.galaxy?.systems.find((system) => system.id === entry.systemId)?.name}</small></article>)}</section>}
    {tab === 'memorials' && <section className="memorial-grid">{store.legacy.memorials.length === 0 ? <div className="legacy-empty"><b>Мемориалов нет</b><p>Память пока существует только в корабельном архиве.</p></div> : store.legacy.memorials.map((entry) => <article key={entry.id}><span>{entry.type} · {entry.year}</span><h3>{store.legacy.captains.find((captain) => captain.id === entry.captainRecordId)?.name}</h3><p>{entry.text}</p></article>)}</section>}
    <footer className="chronicle-footer"><button className="danger-button" onClick={() => void destructiveReset(false)}>Сбросить кампанию</button><button className="primary-button" onClick={() => void destructiveReset(true)}>Начать новую кампанию</button></footer>
  </main></div>;
}
