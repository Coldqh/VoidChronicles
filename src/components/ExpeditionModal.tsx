import { useMemo, useState } from 'react';
import type { Artifact, Planet } from '../game/types';
import { generateSurface, type SurfaceMap } from '../generation/surface';

interface Props {
  seed: string;
  planet: Planet;
  artifact?: Artifact;
  onClose(): void;
  onComplete(artifact?: Artifact, injury?: { bodyPart: 'torso'; severity: number }): void;
}

export function ExpeditionModal({ seed, planet, artifact, onClose, onComplete }: Props) {
  const initial = useMemo(() => generateSurface(`${seed}:${planet.id}`), [seed, planet.id]);
  const [map, setMap] = useState<SurfaceMap>(initial);
  const [playerHealth, setPlayerHealth] = useState(100);
  const [log, setLog] = useState<string[]>(['Высадка завершена. Связь с кораблём стабильна.']);
  const [hasArtifact, setHasArtifact] = useState(false);

  const tileAt = (x: number, y: number) => map.tiles.find((tile) => tile.x === x && tile.y === y);
  const distance = (a: {x:number;y:number}, b:{x:number;y:number}) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const move = (x: number, y: number) => {
    if (distance(map.player, { x, y }) !== 1) return;
    const tile = tileAt(x, y);
    if (!tile || tile.kind === 'rock') return;
    let nextHealth = playerHealth;
    const nextEnemies = map.enemies.map((enemy) => ({ ...enemy }));
    let nextLog = [...log];
    const occupying = nextEnemies.find((enemy) => enemy.x === x && enemy.y === y && enemy.health > 0);
    if (occupying) {
      const damage = 34;
      occupying.health -= damage;
      nextLog = [`Выстрел: ${occupying.name} получает ${damage} урона.`, ...nextLog];
      if (occupying.health <= 0) nextLog.unshift(`${occupying.name} уничтожен.`);
    } else {
      map.player = { x, y };
      if (tile.kind === 'hazard') { nextHealth -= 8; nextLog.unshift('Опасная среда: повреждён костюм.'); }
      if (tile.kind === 'artifact') { setHasArtifact(true); nextLog.unshift(`Найден объект: ${artifact?.name ?? 'неизвестный артефакт'}.`); }
    }
    for (const enemy of nextEnemies.filter((entry) => entry.health > 0)) {
      if (distance(enemy, map.player) <= 2) {
        nextHealth -= 11;
        nextLog.unshift(`${enemy.name} атакует. Получено 11 урона.`);
      } else {
        const dx = Math.sign(map.player.x - enemy.x);
        const dy = Math.sign(map.player.y - enemy.y);
        const candidate = Math.abs(map.player.x - enemy.x) > Math.abs(map.player.y - enemy.y)
          ? { x: enemy.x + dx, y: enemy.y }
          : { x: enemy.x, y: enemy.y + dy };
        const targetTile = tileAt(candidate.x, candidate.y);
        if (targetTile && targetTile.kind !== 'rock') { enemy.x = candidate.x; enemy.y = candidate.y; }
      }
    }
    const revealed = map.tiles.map((entry) => ({ ...entry, revealed: entry.revealed || Math.hypot(entry.x - map.player.x, entry.y - map.player.y) < 4 }));
    setMap({ ...map, tiles: revealed, enemies: nextEnemies });
    setPlayerHealth(Math.max(0, nextHealth));
    setLog(nextLog.slice(0, 8));
  };

  const leave = () => {
    const injury = playerHealth < 75 ? { bodyPart: 'torso' as const, severity: Math.min(10, Math.ceil((100 - playerHealth) / 7)) } : undefined;
    onComplete(hasArtifact ? artifact : undefined, injury);
  };

  return <div className="modal-backdrop">
    <section className="modal expedition-modal">
      <header><div><span className="eyebrow">ПОВЕРХНОСТЬ</span><h2>{planet.name}</h2></div><button className="icon-button" onClick={onClose}>×</button></header>
      <div className="expedition-layout">
        <div className="surface-grid" style={{ gridTemplateColumns: `repeat(${map.width}, 1fr)` }}>
          {map.tiles.map((tile) => {
            const enemy = map.enemies.find((entry) => entry.x === tile.x && entry.y === tile.y && entry.health > 0);
            const player = map.player.x === tile.x && map.player.y === tile.y;
            return <button
              key={`${tile.x}-${tile.y}`}
              aria-label={`${tile.x},${tile.y}`}
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
          <button className="primary-button" onClick={leave}>Эвакуация</button>
        </aside>
      </div>
    </section>
  </div>;
}
