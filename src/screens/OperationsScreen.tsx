import { useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';

export function OperationsScreen({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const [message, setMessage] = useState('');
  const activePursuits = store.pursuits.filter((entry) => entry.status === 'active');
  const activeWars = store.warFronts.filter((entry) => entry.status === 'active' || entry.status === 'cold');
  const currentSystem = store.galaxy?.systems.find((entry) => entry.id === store.currentSystemId);
  const localWars = activeWars.filter((entry) => currentSystem && entry.systemIds.includes(currentSystem.id));
  return <div className="game-shell">{chrome}<main className="scroll-screen operations-screen">
    <header className="screen-hero operations-hero"><div><span className="eyebrow">РОЗЫСК · ВОЙНЫ · КОРАБЕЛЬНАЯ БЕЗОПАСНОСТЬ</span><h1>Оперативная обстановка</h1><p>Здесь показано, кто ищет корабль, что именно им известно и где война меняет маршруты.</p></div><div className="hero-counter"><b>{activePursuits.length + localWars.length}</b><span>активных угроз</span></div></header>

    {store.activeShipEncounter && <section className="operations-alert"><div><span>НЕЗАВЕРШЁННЫЙ КОНТАКТ</span><h2>{store.activeShipEncounter.contact.name}</h2><p>{store.activeShipEncounter.contact.demand}</p></div><b>{store.activeShipEncounter.phase}</b></section>}

    <section className="operations-grid">
      <article className="ship-identity-card"><span className="eyebrow">ИДЕНТИЧНОСТЬ КОРАБЛЯ</span><h2>{store.ship?.name}</h2><div className="stat-row"><span>Регистрация</span><b>{store.ship?.registration}</b></div><div className="stat-row"><span>Транспондер</span><b>{store.ship?.transponder}</b></div><p>Замена транспондера сбивает только те ориентировки, которые привязаны к старому сигналу. Внешний профиль корабля и имя капитана могут оставаться известны.</p><button onClick={async () => setMessage((await store.changeTransponder()).message)}>Сменить транспондер · ₡420</button></article>

      <article><span className="eyebrow">РОЗЫСК</span><h2>Кто идёт по следу</h2>{activePursuits.length ? activePursuits.map((entry) => <div className="pursuit-row" key={entry.id}><div><b>{entry.sourceName}</b><small>{entry.reason}</small></div><strong>{entry.intensity}</strong><ul><li>{entry.knownIdentity ? 'знают капитана' : 'личность не подтверждена'}</li><li>{entry.knownTransponder ? 'знают транспондер' : 'сигнал не подтверждён'}</li><li>{entry.knownShipProfile ? 'знают профиль корпуса' : 'профиль скрыт'}</li></ul></div>) : <p>Активных ориентировок нет.</p>}</article>

      <article className="warfront-card"><span className="eyebrow">ЛОКАЛЬНЫЕ ВОЙНЫ</span><h2>Фронты галактики</h2>{activeWars.length ? activeWars.map((front) => { const attacker = store.factions.find((entry) => entry.id === front.attackerFactionId); const defender = store.factions.find((entry) => entry.id === front.defenderFactionId); const here = currentSystem && front.systemIds.includes(currentSystem.id); return <div className={`warfront-row ${here ? 'local' : ''}`} key={front.id}><div><b>{attacker?.name ?? front.attackerFactionId}</b><span>против</span><b>{defender?.name ?? front.defenderFactionId}</b></div><small>{front.status} · интенсивность {front.intensity} · систем {front.systemIds.length}</small><div className="war-score"><i style={{ width: `${Math.max(10, Math.min(90, 50 + (front.attackerScore - front.defenderScore) * 5))}%` }}/></div>{here && <em>ТЕКУЩАЯ СИСТЕМА В ЗОНЕ КОНФЛИКТА</em>}</div>; }) : <p>Подтверждённых войн нет.</p>}</article>

      <article><span className="eyebrow">СИСТЕМЫ КОРАБЛЯ</span><h2>Боеготовность</h2>{store.ship?.systems.map((system) => <div className={`operation-system-row ${system.disabled ? 'disabled' : ''}`} key={system.id}><div><b>{system.label}</b><small>{system.effect}</small></div><strong>{Math.round(system.integrity)}%</strong><i><em style={{ width: `${system.integrity}%` }}/></i></div>)}</article>
    </section>
    {message && <button className="notice" onClick={() => setMessage('')}>{message}</button>}
  </main></div>;
}
