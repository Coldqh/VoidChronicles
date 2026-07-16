import type { ReactNode } from 'react';
import type { ShipCompartmentId } from '../game/types';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';

export function ShipScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const ship=store.ship;
  if(!ship || !store.captain) return null;
  const life=ship.life;
  const repair=(id:ShipCompartmentId)=>void store.repairCompartment(id);
  return <div className="game-shell">{chrome}<main className="ship-life-screen">
    <header className="ship-life-hero"><div><span className="eyebrow">КОРАБЛЬ КАК ДОМ</span><h1>{ship.name}</h1><p>{ship.registration} · {ship.transponder}</p></div><div className="ship-life-actions"><button onClick={()=>void store.repairShip()}>Ремонт корпуса</button><button onClick={()=>void store.refuelShip()}>Заправка</button><button onClick={()=>void store.restCrew()}>Отдых экипажа</button><button onClick={()=>void store.resupplyShip()}>Пополнить запасы · ₡180</button></div></header>
    <section className="ship-life-vitals">
      <article><span>Корпус</span><b>{formatInteger(ship.hull)}%</b></article>
      <article><span>Топливо</span><b>{formatInteger(ship.fuel)}%</b></article>
      <article><span>Еда</span><b>{formatInteger(life?.supplies.food ?? 100)}%</b></article>
      <article><span>Кислород</span><b>{formatInteger(life?.supplies.oxygen ?? 100)}%</b></article>
      <article><span>Медицина</span><b>{formatInteger(life?.supplies.medicine ?? 0)}</b></article>
      <article><span>Запчасти</span><b>{formatInteger(life?.supplies.parts ?? 0)}</b></article>
    </section>
    <section className="ship-interior">
      <header><span className="eyebrow">ВНУТРЕННЯЯ СХЕМА</span><h2>Отсеки</h2></header>
      <div className="ship-compartment-grid">{(life?.compartments ?? []).map((compartment)=><article key={compartment.id} className={compartment.disabled?'disabled':''}>
        <header><div><span>{compartment.id}</span><h3>{compartment.name}</h3></div><strong>{formatInteger(compartment.condition)}%</strong></header>
        <p>{compartment.function}</p>
        <small>Уровень {compartment.level} · мест {compartment.capacity}</small>
        <div className="ship-assigned-crew">{store.crew.filter((member)=>member.shipCompartmentId===compartment.id).map((member)=><span key={member.id}>{member.name}</span>)}</div>
        {compartment.condition<100 && <button disabled={(life?.supplies.parts??0)<=0} onClick={()=>repair(compartment.id)}>Ремонтировать</button>}
      </article>)}</div>
    </section>
    <section className="ship-life-bottom">
      <article><h2>Корабельные системы</h2>{ship.systems.map((system)=><div className="ship-system-line" key={system.id}><span>{system.label}</span><b>{formatInteger(system.integrity)}%</b></div>)}</article>
      <article><h2>Трофеи и память</h2>{life?.trophies.length ? life.trophies.map((entry)=><p key={entry.id}><b>{entry.name}</b><span>{entry.description}</span></p>):<p>Корабль ещё не хранит памятных предметов.</p>}</article>
      <article><h2>Открытые проблемы</h2>{life?.issues.filter((entry)=>entry.status==='open').map((issue)=><button key={issue.id} onClick={()=>store.setScreen('crew')}><b>{issue.title}</b><span>{issue.summary}</span></button>)}{!life?.issues.some((entry)=>entry.status==='open')&&<p>Критических конфликтов нет.</p>}</article>
    </section>
  </main></div>;
}
