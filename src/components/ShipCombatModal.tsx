import { useEffect, useRef, useState } from 'react';

interface Props {
  playerHull: number;
  onVictory(): void | Promise<void>;
  onEscape(): void;
  onDefeat(): void;
  onDamage(amount: number, status?: string): void | Promise<void>;
}

export function ShipCombatModal({ playerHull, onVictory, onEscape, onDefeat, onDamage }: Props) {
  const [enemyHull, setEnemyHull] = useState(72);
  const [range, setRange] = useState(3);
  const [message, setMessage] = useState('Неопознанный перехватчик берёт корабль на сопровождение.');
  const [busy, setBusy] = useState(false);
  const resolved = useRef(false);

  useEffect(() => {
    if (playerHull <= 0 && !resolved.current) {
      resolved.current = true;
      onDefeat();
    }
  }, [onDefeat, playerHull]);

  const enemyTurn = async (activeRange = range) => {
    const damage = activeRange <= 1 ? 17 : activeRange === 2 ? 11 : 6;
    await onDamage(damage, damage > 14 ? 'повреждение корпуса' : undefined);
    setMessage(`Вражеский залп: ${damage} урона корпусу.`);
  };

  const attack = async () => {
    if (busy || resolved.current) return;
    setBusy(true);
    try {
      const damage = range <= 1 ? 24 : range === 2 ? 17 : 10;
      const next = enemyHull - damage;
      setEnemyHull(next);
      setMessage(`Рельсовая установка наносит ${damage} урона.`);
      if (next <= 0) {
        resolved.current = true;
        await onVictory();
      } else {
        await enemyTurn();
      }
    } finally {
      setBusy(false);
    }
  };

  const maneuver = async (delta: number) => {
    if (busy || resolved.current) return;
    setBusy(true);
    try {
      const nextRange = Math.max(1, Math.min(4, range + delta));
      setRange(nextRange);
      setMessage(delta < 0 ? 'Корабль сближается.' : 'Корабль разрывает дистанцию.');
      await enemyTurn(nextRange);
    } finally {
      setBusy(false);
    }
  };

  const escape = async () => {
    if (busy || resolved.current) return;
    setBusy(true);
    try {
      const success = range >= 3 || Math.random() > 0.48;
      if (success) {
        resolved.current = true;
        onEscape();
      } else {
        setMessage('Манёвр сорван. Противник держит захват.');
        await enemyTurn();
      }
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-backdrop">
    <section className="modal ship-combat-modal">
      <span className="eyebrow">КОРАБЕЛЬНЫЙ БОЙ</span>
      <h2>Перехватчик класса «Rake»</h2>
      <div className="combat-radar"><div className="radar-ring r1"/><div className="radar-ring r2"/><div className="player-blip">◆</div><div className="enemy-blip" style={{ transform: `translateX(${range * 34}px)` }}>▲</div></div>
      <div className="combat-bars"><div className="meter"><span>Ваш корпус</span><strong>{playerHull}</strong><i style={{ width: `${Math.max(0, playerHull)}%` }} /></div><div className="meter enemy"><span>Враг</span><strong>{Math.max(0, enemyHull)}</strong><i style={{ width: `${Math.max(0, enemyHull / 72 * 100)}%` }} /></div></div>
      <p className="combat-message">{message}</p>
      <div className="button-grid"><button disabled={busy} onClick={() => void attack()}>Атаковать</button><button disabled={busy} onClick={() => void maneuver(-1)}>Сблизиться</button><button disabled={busy} onClick={() => void maneuver(1)}>Увеличить дистанцию</button><button disabled={busy} onClick={() => void escape()}>Попытка бегства</button></div>
    </section>
  </div>;
}
