import { useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { useCompactLayout } from '../hooks/useCompactLayout';

export function OperationsScreen({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const compact = useCompactLayout();
  const [mobileTab, setMobileTab] = useState<'pursuits' | 'wars'>('pursuits');
  const activePursuits = store.pursuits.filter((entry) => entry.status === 'active');
  const activeWars = store.warFronts.filter((entry) => entry.status === 'active' || entry.status === 'cold');
  const currentSystem = store.galaxy?.systems.find((entry) => entry.id === store.currentSystemId);
  const localWars = activeWars.filter((entry) => currentSystem && entry.systemIds.includes(currentSystem.id));

  const pursuitContent = activePursuits.length ? activePursuits.map((entry) => <article className="mobile-threat-row" key={entry.id}>
    <div><span>УРОВЕНЬ {entry.intensity}</span><b>{entry.sourceName}</b></div>
    <details className="mobile-inline-details"><summary>Что им известно</summary><p>{entry.reason}</p><ul><li>{entry.knownIdentity ? 'капитан' : 'личность скрыта'}</li><li>{entry.knownTransponder ? 'транспондер' : 'сигнал скрыт'}</li><li>{entry.knownShipProfile ? 'корпус' : 'профиль скрыт'}</li></ul></details>
  </article>) : <div className="mobile-empty"><b>Розыска нет</b></div>;

  const warContent = activeWars.length ? activeWars.map((front) => {
    const attacker = store.factions.find((entry) => entry.id === front.attackerFactionId);
    const defender = store.factions.find((entry) => entry.id === front.defenderFactionId);
    const here = currentSystem && front.systemIds.includes(currentSystem.id);
    const width = Math.max(10, Math.min(90, 50 + (front.attackerScore - front.defenderScore) * 5));
    return <article className={`mobile-war-row ${here ? 'local' : ''}`} key={front.id}>
      <span>{front.status} · интенсивность {front.intensity}</span><b>{attacker?.name ?? front.attackerFactionId}</b><small>против {defender?.name ?? front.defenderFactionId}</small>
      <i><em style={{ width: `${width}%` }}/></i>{here && <strong>Ты находишься в зоне конфликта</strong>}
    </article>;
  }) : <div className="mobile-empty"><b>Фронтов нет</b><p>Подтверждённых войн не обнаружено.</p></div>;

  if (compact) {
    return <div className="game-shell">{chrome}<main className="mobile-data-screen operations-mobile">
      <header className="mobile-screen-header"><div><span className="eyebrow">РОЗЫСК · ВОЙНЫ</span><h1>Операции</h1></div><b>{activePursuits.length + localWars.length}</b></header>
      {store.activeShipEncounter && <article className="mobile-alert-card"><span>НЕЗАВЕРШЁННЫЙ КОНТАКТ</span><b>{store.activeShipEncounter.contact.name}</b><small>{store.activeShipEncounter.contact.demand}</small></article>}
      <nav className="mobile-segmented two" aria-label="Раздел операций"><button className={mobileTab === 'pursuits' ? 'active' : ''} onClick={() => setMobileTab('pursuits')}>Розыск {activePursuits.length || ''}</button><button className={mobileTab === 'wars' ? 'active' : ''} onClick={() => setMobileTab('wars')}>Войны {activeWars.length || ''}</button></nav>
      <section className="mobile-tab-content">{mobileTab === 'pursuits' ? pursuitContent : warContent}</section>
    </main></div>;
  }

  return <div className="game-shell">{chrome}<main className="scroll-screen operations-screen operations-two-column">
    <header className="screen-hero operations-hero"><div><span className="eyebrow">РОЗЫСК · ВОЙНЫ</span><h1>Оперативная обстановка</h1><p>Кто ищет корабль и где война меняет маршруты.</p></div><div className="hero-counter"><b>{activePursuits.length + localWars.length}</b><span>активных угроз</span></div></header>
    {store.activeShipEncounter && <section className="operations-alert"><div><span>НЕЗАВЕРШЁННЫЙ КОНТАКТ</span><h2>{store.activeShipEncounter.contact.name}</h2><p>{store.activeShipEncounter.contact.demand}</p></div><b>{store.activeShipEncounter.phase}</b></section>}
    <section className="operations-grid">
      <article><span className="eyebrow">РОЗЫСК</span><h2>Кто идёт по следу</h2>{activePursuits.length ? activePursuits.map((entry) => <div className="pursuit-row" key={entry.id}><div><b>{entry.sourceName}</b><small>{entry.reason}</small></div><strong>{entry.intensity}</strong><ul><li>{entry.knownIdentity ? 'знают капитана' : 'личность не подтверждена'}</li><li>{entry.knownTransponder ? 'знают транспондер' : 'сигнал не подтверждён'}</li><li>{entry.knownShipProfile ? 'знают профиль корпуса' : 'профиль скрыт'}</li></ul></div>) : <p>Активных ориентировок нет.</p>}</article>
      <article className="warfront-card"><span className="eyebrow">ЛОКАЛЬНЫЕ ВОЙНЫ</span><h2>Фронты галактики</h2>{activeWars.length ? activeWars.map((front) => { const attacker = store.factions.find((entry) => entry.id === front.attackerFactionId); const defender = store.factions.find((entry) => entry.id === front.defenderFactionId); const here = currentSystem && front.systemIds.includes(currentSystem.id); return <div className={`warfront-row ${here ? 'local' : ''}`} key={front.id}><div><b>{attacker?.name ?? front.attackerFactionId}</b><span>против</span><b>{defender?.name ?? front.defenderFactionId}</b></div><small>{front.status} · интенсивность {front.intensity} · систем {front.systemIds.length}</small><div className="war-score"><i style={{ width: `${Math.max(10, Math.min(90, 50 + (front.attackerScore - front.defenderScore) * 5))}%` }}/></div>{here && <em>ТЕКУЩАЯ СИСТЕМА В ЗОНЕ КОНФЛИКТА</em>}</div>; }) : <p>Подтверждённых войн нет.</p>}</article>
    </section>
  </main></div>;
}
