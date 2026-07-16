import { useState, type ReactNode } from 'react';
import type { ShipCompartmentId } from '../game/types';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';

const compartmentIcon: Record<ShipCompartmentId, string> = {
  bridge: '◆', engineering: '⚙', reactor: '◉', medbay: '✚', laboratory: '◈', quarters: '▦', cargo: '▤', airlock: '◇'
};

export function ShipScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const ship = store.ship;
  const [selectedId, setSelectedId] = useState<ShipCompartmentId>('bridge');
  if (!ship || !store.captain) return null;
  const life = ship.life;
  const selected = life?.compartments.find((entry) => entry.id === selectedId) ?? life?.compartments[0];
  const openIssues = life?.issues.filter((entry) => entry.status === 'open') ?? [];
  const assigned = selected ? store.crew.filter((member) => member.shipCompartmentId === selected.id) : [];
  const lowestCondition = life?.compartments.reduce((lowest, entry) => Math.min(lowest, entry.condition), 100) ?? 100;
  const repair = (id: ShipCompartmentId) => void store.repairCompartment(id);

  return <div className="game-shell">{chrome}<main className="v35-ship">
    <div className="v35-ship-space" aria-hidden="true"><i/><i/><i/></div>
    <header className="v35-screen-hero ship">
      <div><span className="eyebrow">КОРАБЛЬ · ДОМ · СВИДЕТЕЛЬ</span><h1>{ship.name}</h1><p>{ship.registration} · {ship.transponder}</p></div>
      <div className="v35-ship-actions"><button onClick={() => void store.repairShip()}>Ремонт корпуса</button><button onClick={() => void store.refuelShip()}>Заправка</button><button onClick={() => void store.resupplyShip()}>Запасы · ₡180</button><button onClick={() => void store.restCrew()}>Отдых</button></div>
    </header>

    <section className="v35-ship-vitals">
      <article className={ship.hull < 35 ? 'critical' : ''}><span>Корпус</span><b>{formatInteger(ship.hull)}%</b><i style={{ width: `${ship.hull}%` }}/></article>
      <article className={ship.fuel < 25 ? 'critical' : ''}><span>Топливо</span><b>{formatInteger(ship.fuel)}%</b><i style={{ width: `${ship.fuel}%` }}/></article>
      <article className={(life?.supplies.food ?? 100) < 25 ? 'critical' : ''}><span>Еда</span><b>{formatInteger(life?.supplies.food ?? 100)}%</b><i style={{ width: `${life?.supplies.food ?? 100}%` }}/></article>
      <article className={(life?.supplies.oxygen ?? 100) < 25 ? 'critical' : ''}><span>Кислород</span><b>{formatInteger(life?.supplies.oxygen ?? 100)}%</b><i style={{ width: `${life?.supplies.oxygen ?? 100}%` }}/></article>
      <article><span>Медицина</span><b>{formatInteger(life?.supplies.medicine ?? 0)}</b><small>комплектов</small></article>
      <article><span>Запчасти</span><b>{formatInteger(life?.supplies.parts ?? 0)}</b><small>единиц</small></article>
    </section>

    <section className="v35-ship-layout">
      <article className="v35-ship-blueprint">
        <header><div><span className="eyebrow">ВНУТРЕННЯЯ СХЕМА</span><h2>Живой корабль</h2></div><span className={lowestCondition < 40 ? 'critical' : ''}>минимальная целостность {formatInteger(lowestCondition)}%</span></header>
        <div className="v35-hull-diagram">
          <i className="v35-hull-spine"/><i className="v35-hull-wing left"/><i className="v35-hull-wing right"/>
          {(life?.compartments ?? []).map((compartment) => <button key={compartment.id} className={`v35-ship-node node-${compartment.id} ${selected?.id === compartment.id ? 'active' : ''} ${compartment.disabled ? 'disabled' : ''} ${compartment.condition < 45 ? 'damaged' : ''}`} onClick={() => setSelectedId(compartment.id)}>
            <i>{compartmentIcon[compartment.id]}</i><span><b>{compartment.name}</b><small>{formatInteger(compartment.condition)}%</small></span><em style={{ '--condition': `${compartment.condition * 3.6}deg` } as React.CSSProperties}/>
          </button>)}
        </div>
        <footer><span><i className="ok"/> исправно</span><span><i className="warn"/> износ</span><span><i className="bad"/> критично</span></footer>
      </article>

      <aside className="v35-compartment-dossier">
        {selected ? <>
          <header><i>{compartmentIcon[selected.id]}</i><div><span className="eyebrow">{selected.id.toUpperCase()}</span><h2>{selected.name}</h2></div><strong>{formatInteger(selected.condition)}%</strong></header>
          <p>{selected.function}</p>
          <div className="v35-compartment-meta"><span>Уровень <b>{formatInteger(selected.level)}</b></span><span>Вместимость <b>{formatInteger(selected.capacity)}</b></span><span>На посту <b>{assigned.length}</b></span></div>
          <section><h3>Люди в отсеке</h3>{assigned.length ? assigned.map((member) => <button key={member.id} onClick={() => store.setScreen('crew')}><i>{member.name.slice(0, 1)}</i><span><b>{member.name}</b><small>{member.primaryRole}</small></span></button>) : <p>Пост не занят.</p>}</section>
          {selected.tags.length > 0 && <div className="tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          {selected.condition < 100 && <button className="v35-cta" disabled={(life?.supplies.parts ?? 0) <= 0} onClick={() => repair(selected.id)}>Ремонтировать отсек <i>→</i></button>}
        </> : <p>Выбери отсек.</p>}
      </aside>
    </section>

    <section className="v35-ship-bottom">
      <article><header><span className="eyebrow">КОРАБЕЛЬНЫЕ СИСТЕМЫ</span><h2>Состояние</h2></header>{ship.systems.map((system) => <div key={system.id}><span>{system.label}</span><b>{formatInteger(system.integrity)}%</b><i style={{ width: `${system.integrity}%` }}/></div>)}</article>
      <article className="v35-trophy-wall"><header><span className="eyebrow">ПАМЯТЬ КОРАБЛЯ</span><h2>Трофеи</h2></header>{life?.trophies.length ? life.trophies.map((entry) => <div key={entry.id}><i>◇</i><span><b>{entry.name}</b><p>{entry.description}</p></span></div>) : <p>Стены ещё пусты. Корабль только начинает собирать свою историю.</p>}</article>
      <article className={openIssues.length ? 'v35-ship-problems active' : 'v35-ship-problems'}><header><span className="eyebrow">ОТКРЫТЫЕ ПРОБЛЕМЫ</span><h2>{openIssues.length}</h2></header>{openIssues.length ? openIssues.map((issue) => <button key={issue.id} onClick={() => store.setScreen('crew')}><em>{formatInteger(issue.severity)}</em><span><b>{issue.title}</b><small>{issue.summary}</small></span></button>) : <p>Критических конфликтов нет.</p>}</article>
    </section>
  </main></div>;
}
