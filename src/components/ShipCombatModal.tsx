import { useState } from 'react';
import { useGameStore } from '../game/store';
import type { ShipSystemState } from '../game/types';

function SystemStrip({ systems, enemy = false }: { systems: ShipSystemState[]; enemy?: boolean }) {
  return <div className={`ship-system-strip ${enemy ? 'enemy' : ''}`}>
    {systems.map((system) => <div className={`ship-system ${system.disabled ? 'disabled' : ''}`} key={system.id} title={system.effect}>
      <span>{system.label}</span><b>{Math.round(system.integrity)}%</b><i><em style={{ width: `${Math.max(0, system.integrity)}%` }}/></i>
    </div>)}
  </div>;
}

export function ShipCombatModal() {
  const store = useGameStore();
  const encounter = store.activeShipEncounter;
  const [message, setMessage] = useState('');
  if (!encounter || !store.ship) return null;

  const act = async (action: Parameters<typeof store.shipCombatAction>[0]) => setMessage((await store.shipCombatAction(action)).message);
  const respond = async (action: Parameters<typeof store.respondToShipContact>[0]) => setMessage((await store.respondToShipContact(action)).message);
  const board = async (action: Parameters<typeof store.boardingAction>[0]) => setMessage((await store.boardingAction(action)).message);
  const playerSystems = store.ship.systems;
  const contact = encounter.contact;

  return <div className="modal-backdrop ship-operation-backdrop">
    <section className={`ship-operation-modal phase-${encounter.phase}`}>
      <header className="ship-operation-header">
        <div><span className="eyebrow">КОРАБЕЛЬНЫЕ ОПЕРАЦИИ · {encounter.phase.toUpperCase()}</span><h2>{contact.name}</h2><p>{contact.description}</p></div>
        <div className={`threat-seal threat-${contact.threat >= 70 ? 'critical' : contact.threat >= 40 ? 'high' : 'low'}`}><b>{contact.threat}</b><span>УГРОЗА</span></div>
      </header>

      {encounter.phase !== 'resolved' && <details className="combat-stations" open={encounter.phase === 'combat'}><summary>Боевые посты экипажа</summary><div>{playerSystems.map((system) => <label key={system.id}><span>{system.label}</span><select value={encounter.stationAssignments[system.id] ?? ''} onChange={(event) => void store.assignCombatStation(system.id, event.target.value || null)}><option value="">Автоматика</option>{store.crew.filter((member) => member.status === 'active').map((member) => <option key={member.id} value={member.id}>{member.name} · {member.primaryRole}</option>)}</select></label>)}</div></details>}

      {encounter.phase === 'contact' && <>
        <section className="contact-brief">
          <article><span>ТИП</span><b>{contact.kind}</b></article><article><span>НАМЕРЕНИЕ</span><b>{contact.intent}</b></article><article><span>ЗНАЕТ ЛИЧНОСТЬ</span><b>{contact.knowsIdentity ? 'ДА' : 'НЕТ'}</b></article><article><span>ЗНАЕТ ТРАНСПОНДЕР</span><b>{contact.knowsTransponder ? 'ДА' : 'НЕТ'}</b></article>
        </section>
        <div className="contact-demand"><span>ПЕРЕДАЧА</span><p>{contact.demand}</p></div>
        <div className="operation-actions contact-actions">
          <button onClick={() => void respond('communicate')}>Выйти на связь<small>дипломатия и связь</small></button>
          <button onClick={() => void respond('documents')}>Показать документы<small>регистрация и манифест</small></button>
          <button onClick={() => void respond('hideCargo')}>Скрыть груз<small>тайники и контрабанда</small></button>
          <button onClick={() => void respond('bribe')}>Предложить деньги<small>риск фиксации подкупа</small></button>
          {['distress', 'trade'].includes(contact.intent) && <button onClick={() => void respond('help')}>Оказать помощь<small>топливо и репутация</small></button>}
          <button onClick={() => void respond('escape')}>Уйти манёвром<small>пилот и двигатель</small></button>
          <button className="danger-button" onClick={() => void respond('attack')}>Открыть огонь<small>создаёт врагов</small></button>
          <button onClick={() => void respond('surrender')}>Подчиниться<small>возможна потеря груза</small></button>
        </div>
      </>}

      {encounter.phase === 'combat' && <>
        <section className="battle-space">
          <div className="combatant player"><span>ТЫ</span><b>{store.ship.name}</b><strong>{store.ship.hull}/{store.ship.maxHull}</strong></div>
          <div className="range-lane"><i className={`range-pulse r${encounter.range}`}/><span>ДИСТАНЦИЯ {encounter.range}</span><small>{encounter.range === 1 ? 'стыковочная' : encounter.range === 2 ? 'ближняя' : encounter.range === 3 ? 'средняя' : 'дальняя'}</small></div>
          <div className="combatant enemy"><span>ЦЕЛЬ</span><b>{encounter.enemy.name}</b><strong>{encounter.enemy.hull}/{encounter.enemy.maxHull}</strong></div>
        </section>
        <div className="dual-system-grid"><section><h3>Системы «Странника»</h3><SystemStrip systems={playerSystems}/></section><section><h3>Известные системы цели</h3><SystemStrip systems={encounter.enemy.systems} enemy/></section></div>
        <div className="operation-actions combat-actions">
          <button onClick={() => void act('fire')}>Огонь по корпусу<small>стабильная атака</small></button>
          <button onClick={() => void act('targetEngine')}>Бить по двигателю<small>открывает абордаж</small></button>
          <button onClick={() => void act('targetWeapons')}>Бить по оружию<small>снижает ответный урон</small></button>
          <button onClick={() => void act('close')}>Сблизиться<small>выше урон и риск</small></button>
          <button onClick={() => void act('withdraw')}>Разорвать дистанцию<small>подготовить прыжок</small></button>
          <button onClick={() => void act('evade')}>Уклонение<small>пилот и двигатель</small></button>
          <button onClick={() => void act('jump')}>Аварийный прыжок<small>только на дистанции 3–4</small></button>
          <button onClick={() => void act('negotiate')}>Прекратить огонь<small>связь и мораль цели</small></button>
          <button className="primary-button" disabled={!encounter.canBoard || encounter.range !== 1} onClick={() => void act('board')}>Абордаж<small>{encounter.canBoard ? 'цель обездвижена' : 'сначала отключи цель'}</small></button>
        </div>
      </>}

      {encounter.phase === 'boarding' && <>
        <section className="boarding-map">
          <div className="boarding-node secured">Шлюз</div><div className={`boarding-line p${Math.min(100, encounter.boardingProgress)}`}/><div className="boarding-node">Груз</div><div className="boarding-node">Медблок</div><div className="boarding-node critical">Реактор</div><div className="boarding-node command">Мостик</div>
          <strong>{encounter.boardingProgress}% КОНТРОЛЯ</strong>
        </section>
        <div className="operation-actions boarding-actions">
          <button className="primary-button" onClick={() => void board('bridge')}>Штурмовать мостик<small>захватить судно</small></button>
          <button onClick={() => void board('cargo')}>Вскрыть грузовой отсек<small>немедленная добыча</small></button>
          <button onClick={() => void board('rescue')}>Освободить пленников<small>репутация и люди</small></button>
          <button className="danger-button" onClick={() => void board('sabotage')}>Саботировать реактор<small>оставить корабль дрейфовать</small></button>
          <button onClick={() => void board('withdraw')}>Отступить<small>вернуться к корабельному бою</small></button>
        </div>
      </>}

      {encounter.phase === 'resolved' && <section className={`operation-resolution outcome-${encounter.outcome}`}>
        <span className="eyebrow">КОНТАКТ ЗАВЕРШЁН</span><h3>{encounter.outcome}</h3><p>{encounter.combatLog[0]}</p><button className="primary-button" onClick={() => void store.closeShipEncounter()}>Вернуться к управлению</button>
      </section>}

      {message && <p className="operation-message">{message}</p>}
      <details className="combat-log"><summary>Журнал операции · ход {encounter.turn}</summary>{encounter.combatLog.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}</details>
    </section>
  </div>;
}
