import { useState } from 'react';

interface Props {
  playerHull: number;
  onVictory(): void;
  onEscape(): void;
  onDamage(amount: number, status?: string): void;
}

export function ShipCombatModal({ playerHull, onVictory, onEscape, onDamage }: Props) {
  const [enemyHull, setEnemyHull] = useState(72);
  const [range, setRange] = useState(3);
  const [message, setMessage] = useState('Неопознанный перехватчик берёт корабль на сопровождение.');
  const enemyTurn = () => {
    const damage = range <= 1 ? 17 : range === 2 ? 11 : 6;
    onDamage(damage, damage > 14 ? 'повреждение корпуса' : undefined);
    setMessage(`Вражеский залп: ${damage} урона корпусу.`);
  };
  const attack = () => {
    const damage = range <= 1 ? 24 : range === 2 ? 17 : 10;
    const next = enemyHull - damage;
    setEnemyHull(next);
    setMessage(`Рельсовая установка наносит ${damage} урона.`);
    if (next <= 0) onVictory(); else enemyTurn();
  };
  const maneuver = (delta: number) => {
    setRange((old) => Math.max(1, Math.min(4, old + delta)));
    setMessage(delta < 0 ? 'Корабль сближается.' : 'Корабль разрывает дистанцию.');
    enemyTurn();
  };
  const escape = () => {
    const success = range >= 3 || Math.random() > 0.48;
    if (success) onEscape(); else { setMessage('Манёвр сорван. Противник держит захват.'); enemyTurn(); }
  };
  return <div className="modal-backdrop">
    <section className="modal ship-combat-modal">
      <span className="eyebrow">КОРАБЕЛЬНЫЙ БОЙ</span>
      <h2>Перехватчик класса «Rake»</h2>
      <div className="combat-radar"><div className="radar-ring r1"/><div className="radar-ring r2"/><div className="player-blip">◆</div><div className="enemy-blip" style={{ transform: `translateX(${range * 34}px)` }}>▲</div></div>
      <div className="combat-bars"><div className="meter"><span>Ваш корпус</span><strong>{playerHull}</strong><i style={{ width: `${playerHull}%` }} /></div><div className="meter enemy"><span>Враг</span><strong>{Math.max(0, enemyHull)}</strong><i style={{ width: `${Math.max(0, enemyHull / 72 * 100)}%` }} /></div></div>
      <p className="combat-message">{message}</p>
      <div className="button-grid"><button onClick={attack}>Атаковать</button><button onClick={() => maneuver(-1)}>Сблизиться</button><button onClick={() => maneuver(1)}>Увеличить дистанцию</button><button onClick={escape}>Попытка бегства</button></div>
    </section>
  </div>;
}
