import { useMemo, useState } from 'react';
import type { Artifact, Planet } from '../game/types';
import { generateSurface, type SurfaceMap } from '../generation/surface';

interface Props {
  seed: string;
  planet: Planet;
  artifact?: Artifact;
  onClose(): void;
  onComplete(artifact?: Artifact, injury?: { bodyPart: 'torso'; severity: number }): void | Promise<void>;
}

export function ExpeditionModal({ seed, planet, artifact, onClose, onComplete }: Props) {
  const initial = useMemo(() => generateSurface(`${seed}:${planet.id}`), [seed, planet.id]);
  const [map, setMap] = useState<SurfaceMap>(initial);
  const [playerHealth, setPlayerHealth] = useState(100);
  const [log, setLog] = useState<string[]>(['Высадка завершена. Связь с кораблём стабильна.']);
  const [hasArtifact, setHasArtifact] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const tileAt = (state: SurfaceMap, x: number, y: number) => state.tiles.find((tile) => tile.x === x && tile.y === y);
  const distance = (a: {x:number;y:number}, b:{x:number;y:number}) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

  const move = (x: number, y: number) => {
    if (isLeaving || playerHealth <= 0 || distance(map.player, { x, y }) !== 1) return;
    const tile = tileAt(map, x, y);
    if (!tile || tile.kind === 'rock') return;

    const nextMap: SurfaceMap = {
      ...map,
      player: { ...map.player },
      tiles: map.tiles.map((entry) => ({ ...entry })),
      enemies: map.enemies.map((enemy) => ({ ...enemy }))
    };
    let nextHealth = playerHealth;
    const nextLog = [...log];
    const occupying = nextMap.enemies.find((enemy) => enemy.x === x && enemy.y === y && enemy.health > 0);

    if (occupying) {
      const damage = 34;
      occupying.health -= damage;
      nextLog.unshift(`Выстрел: ${occupying.name} получает ${damage} урона.`);
      if (occupying.health <= 0) nextLog.unshift(`${occupying.name} уничтожен.`);
    } else {
      nextMap.player = { x, y };
      if (tile.kind === 'hazard') {
        nextHealth -= 8;
        nextLog.unshift('Опасная среда: повреждён костюм.');
      }
      if (tile.kind === 'artifact') {
        setHasArtifact(true);
        nextLog.unshift(`Найден объект: ${artifact?.name ?? 'неизвестный артефакт'}.`);
      }
    }

    const occupied = new Set(nextMap.enemies.filter((enemy) => enemy.health > 0).map((enemy) => `${enemy.x}:${enemy.y}`));
    for (const enemy of nextMap.enemies.filter((entry) => entry.health > 0)) {
      occupied.delete(`${enemy.x}:${enemy.y}`);
      if (distance(enemy, nextMap.player) <= 2) {
        nextHealth -= 11;
        nextLog.unshift(`${enemy.name} атакует. Получено 11 урона.`);
      } else {
        const dx = Math.sign(nextMap.player.x - enemy.x);
        const dy = Math.sign(nextMap.player.y - enemy.y);
        const candidate = Math.abs(nextMap.player.x - enemy.x) > Math.abs(nextMap.player.y - enemy.y)
          ? { x: enemy.x + dx, y: enemy.y }
          : { x: enemy.x, y: enemy.y + dy };
        const targetTile = tileAt(nextMap, candidate.x, candidate.y);
        const key = `${candidate.x}:${candidate.y}`;
        const hitsPlayer = candidate.x === nextMap.player.x && candidate.y === nextMap.player.y;
        if (targetTile && targetTile.kind !== 'rock' && !occupied.has(key) && !hitsPlayer) {
          enemy.x = candidate.x;
          enemy.y = candidate.y;
        }
      }
      occupied.add(`${enemy.x}:${enemy.y}`);
    }

    nextMap.tiles = nextMap.tiles.map((entry) => ({
      ...entry,
      revealed: entry.revealed || Math.hypot(entry.x - nextMap.player.x, entry.y - nextMap.player.y) < 4
    }));
    setMap(nextMap);
    setPlayerHealth(Math.max(0, nextHealth));
    if (nextHealth <= 0) nextLog.unshift('Капитан потерял сознание. Возможна только аварийная эвакуация.');
    setLog(nextLog.slice(0, 8));
  };

  const leave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      const injury = playerHealth < 75
        ? { bodyPart: 'torso' as const, severity: Math.min(10, Math.max(1, Math.ceil((100 - playerHealth) / 7))) }
        : undefined;
      await onComplete(hasArtifact ? artifact : undefined, injury);
    } finally {
      setIsLeaving(false);
    }
  };

  return <div className="modal-backdrop">
    <section className="modal expedition-modal">
      <header><div><span className="eyebrow">ПОВЕРХНОСТЬ</span><h2>{planet.name}</h2></div><button className="icon-button" disabled={isLeaving} onClick={onClose}>×</button></header>
      <div className="expedition-layout">
        <div className="surface-grid" style={{ gridTemplateColumns: `repeat(${map.width}, 1fr)` }}>
          {map.tiles.map((tile) => {
            const enemy = map.enemies.find((entry) => entry.x === tile.x && entry.y === tile.y && entry.health > 0);
            const player = map.player.x === tile.x && map.player.y === tile.y;
            return <button
              key={`${tile.x}-${tile.y}`}
              aria-label={`${tile.x},${tile.y}`}
              disabled={isLeaving || playerHealth <= 0}
              className={`tile tile-${tile.revealed ? tile.kind : 'hidden'} ${player ? 'tile-player' : ''} ${enemy ? 'tile-enemy' : ''}`}
              onClick={() => move(tile.x, tile.y)}
            >{player ? '◆' : enemy ? '▲' : tile.revealed && tile.kind === 'artifact' ? '✦' : ''}</button>;
          })}
        </div>
        <aside className="expedition-sidebar">
          <div className="meter"><span>Здоровье</span><strong>{playerHealth}</strong><i style={{ width: `${playerHealth}%` }} /></div>
          <div className="stat-row"><span>Угрозы</span><b>{map.enemies.filter((enemy) => enemy.health > 0).length}</b></div>
          <div className="stat-row"><span>Находка</span><b>{hasArtifact ? 'взята' : 'не найдена'}</b></div>
          <div className="field-log">{log.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}</div>
          <button className="primary-button" disabled={isLeaving} onClick={() => void leave()}>{isLeaving ? 'Сохранение…' : playerHealth <= 0 ? 'Аварийная эвакуация' : 'Эвакуация'}</button>
        </aside>
      </div>
    </section>
  </div>;
}
