import { useMemo, useState } from 'react';
import type {
  Artifact,
  EquipmentId,
  EvidenceDraft,
  ExpeditionResult,
  Planet,
  PointOfInterest
} from '../game/types';
import { EQUIPMENT, equipmentWeight } from '../exploration/equipment';
import { generateSurface, type SurfaceMap, type SurfaceObject } from '../generation/surface';

interface Props {
  seed: string;
  planet: Planet;
  point: PointOfInterest;
  artifact?: Artifact;
  onClose(): void;
  onComplete(result: ExpeditionResult): void | Promise<void>;
}

type Phase = 'loadout' | 'field' | 'debrief';
const DEFAULT_LOADOUT: EquipmentId[] = ['pistol', 'armor', 'scanner', 'medkit', 'oxygen'];

export function ExpeditionModal({ seed, planet, point, artifact, onClose, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('loadout');
  const [selected, setSelected] = useState<EquipmentId[]>(DEFAULT_LOADOUT);
  const initial = useMemo(() => generateSurface(seed, planet, point), [seed, planet, point]);
  const [map, setMap] = useState<SurfaceMap>(initial);
  const [playerHealth, setPlayerHealth] = useState(100);
  const [turns, setTurns] = useState(0);
  const [log, setLog] = useState<string[]>([`Цель: ${point.name}. Данные сканирования ненадёжны.`]);
  const [collectedEvidence, setCollectedEvidence] = useState<EvidenceDraft[]>([]);
  const [hasArtifact, setHasArtifact] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | undefined>();
  const [medkitUsed, setMedkitUsed] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const capacity = 9;
  const usedWeight = equipmentWeight(selected);
  const has = (id: EquipmentId) => selected.includes(id);
  const turnsLimit = map.baseTurns + (has('oxygen') ? 12 : 0);
  const turnsLeft = Math.max(0, turnsLimit - turns);
  const tileAt = (state: SurfaceMap, x: number, y: number) => state.tiles.find((tile) => tile.x === x && tile.y === y);
  const distance = (a: {x:number;y:number}, b:{x:number;y:number}) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

  const toggle = (id: EquipmentId) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      const next = [...current, id];
      return equipmentWeight(next) <= capacity ? next : current;
    });
  };

  const resolveObject = (object: SurfaceObject, nextMap: SurfaceMap, nextLog: string[]): void => {
    if (object.resolved) return;
    const required = object.requiredEquipment;
    const canForceDoor = object.kind === 'door' && has('explosives');
    if (required && !has(required) && !canForceDoor) {
      const equipment = EQUIPMENT.find((entry) => entry.id === required)?.name ?? required;
      setBlockedReason(`Для объекта «${object.title}» требуется: ${equipment}.`);
      nextLog.unshift(`Доступ заблокирован: нужен ${equipment}.`);
      return;
    }

    object.resolved = true;
    const tile = tileAt(nextMap, object.x, object.y);
    if (tile) tile.resolved = true;
    if (object.evidence) {
      const reliabilityPenalty = canForceDoor && !has('cutter') ? 22 : has('scanner') ? 0 : 12;
      const evidence = { ...object.evidence, reliability: Math.max(20, object.evidence.reliability - reliabilityPenalty) };
      setCollectedEvidence((current) => current.some((entry) => entry.key === evidence.key) ? current : [...current, evidence]);
      nextLog.unshift(`Улика получена: ${evidence.title}.`);
    }
    if (object.kind === 'artifact') {
      setHasArtifact(Boolean(artifact));
      nextLog.unshift(artifact ? `Извлечён объект: ${artifact.name}.` : 'Центральный объект изучен, но пригодной находки нет.');
    }
    if (canForceDoor && !has('cutter')) nextLog.unshift('Взрыв повредил часть доказательств.');
  };

  const move = (x: number, y: number) => {
    if (phase !== 'field' || isLeaving || playerHealth <= 0 || turnsLeft <= 0 || distance(map.player, { x, y }) !== 1) return;
    const tile = tileAt(map, x, y);
    if (!tile || tile.kind === 'rock') return;

    const nextMap: SurfaceMap = {
      ...map,
      player: { ...map.player },
      tiles: map.tiles.map((entry) => ({ ...entry })),
      enemies: map.enemies.map((enemy) => ({ ...enemy })),
      objects: map.objects.map((object) => ({ ...object, evidence: object.evidence ? { ...object.evidence } : undefined }))
    };
    let nextHealth = playerHealth;
    const nextLog = [...log];
    const occupying = nextMap.enemies.find((enemy) => enemy.x === x && enemy.y === y && enemy.health > 0);

    if (occupying) {
      const baseDamage = has('rifle') ? 46 : has('pistol') ? 32 : 18;
      occupying.health -= baseDamage;
      nextLog.unshift(`Атака: ${occupying.name} получает ${baseDamage} урона.`);
      if (occupying.health <= 0) nextLog.unshift(`${occupying.name} уничтожен.`);
    } else {
      nextMap.player = { x, y };
      if (tile.kind === 'hazard') {
        const damage = has('armor') ? 4 : 10;
        nextHealth -= damage;
        nextLog.unshift(`${map.hazardName}: получено ${damage} урона.`);
      }
      const object = nextMap.objects.find((entry) => entry.x === x && entry.y === y);
      if (object) resolveObject(object, nextMap, nextLog);
    }

    const occupied = new Set(nextMap.enemies.filter((enemy) => enemy.health > 0).map((enemy) => `${enemy.x}:${enemy.y}`));
    for (const enemy of nextMap.enemies.filter((entry) => entry.health > 0)) {
      occupied.delete(`${enemy.x}:${enemy.y}`);
      if (distance(enemy, nextMap.player) <= 2) {
        const damage = Math.max(3, enemy.damage - (has('armor') ? 5 : 0));
        nextHealth -= damage;
        nextLog.unshift(`${enemy.name} атакует. Получено ${damage} урона.`);
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

    const revealRadius = has('scanner') ? 5 : 3.5;
    nextMap.tiles = nextMap.tiles.map((entry) => ({
      ...entry,
      revealed: entry.revealed || Math.hypot(entry.x - nextMap.player.x, entry.y - nextMap.player.y) < revealRadius
    }));
    const nextTurns = turns + 1;
    if (nextTurns >= turnsLimit) {
      const damage = has('armor') ? 7 : 15;
      nextHealth -= damage;
      nextLog.unshift(`Безопасное окно закрыто. ${map.hazardName}: ${damage} урона.`);
    }
    setMap(nextMap);
    setTurns(nextTurns);
    setPlayerHealth(Math.max(0, nextHealth));
    if (nextHealth <= 0) nextLog.unshift('Капитан потерял сознание. Возможна только аварийная эвакуация.');
    setLog(nextLog.slice(0, 10));
  };

  const heal = () => {
    if (!has('medkit') || medkitUsed || playerHealth >= 100) return;
    setMedkitUsed(true);
    setPlayerHealth((value) => Math.min(100, value + 32));
    setLog((entries) => ['Использована аптечка: +32 здоровья.', ...entries].slice(0, 10));
  };

  const leave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      const injury = playerHealth < 75
        ? { bodyPart: 'torso' as const, severity: Math.min(10, Math.max(1, Math.ceil((100 - playerHealth) / 7))) }
        : undefined;
      const resolved = collectedEvidence.length >= 2 && (hasArtifact || point.type === 'biosphere' || point.type === 'settlement');
      const result: ExpeditionResult = {
        pointOfInterestId: point.id,
        artifact: hasArtifact ? artifact : undefined,
        injury,
        evidence: collectedEvidence,
        outcome: playerHealth <= 0 ? 'failed' : resolved ? 'resolved' : 'evacuated',
        turnsSpent: turns,
        blockedReason
      };
      await onComplete(result);
      setPhase('debrief');
    } finally {
      setIsLeaving(false);
    }
  };

  if (phase === 'loadout') {
    return <div className="modal-backdrop"><section className="modal expedition-modal loadout-modal">
      <header><div><span className="eyebrow">ПОДГОТОВКА ЭКСПЕДИЦИИ</span><h2>{point.name}</h2><p>{point.publicSummary}</p></div><button className="icon-button" onClick={onClose}>×</button></header>
      <div className="mission-brief"><div><b>Среда</b><span>{planet.type} · {planet.danger}</span></div><div><b>Оценка угрозы</b><span>{point.danger}</span></div><div><b>Скан</b><span>{point.scanConfidence}%</span></div><div><b>Возможная добыча</b><span>{point.possibleRewards.join(', ')}</span></div></div>
      <div className="loadout-grid">{EQUIPMENT.map((item) => <button key={item.id} className={selected.includes(item.id) ? 'selected' : ''} onClick={() => toggle(item.id)}><b>{item.name}</b><span>{item.description}</span><em>{item.weight} ед.</em></button>)}</div>
      <footer className="loadout-footer"><span>Масса: {usedWeight}/{capacity}</span><button className="primary-button" onClick={() => setPhase('field')}>Начать высадку</button></footer>
    </section></div>;
  }

  if (phase === 'debrief') {
    return <div className="modal-backdrop"><section className="modal expedition-modal debrief-modal">
      <header><div><span className="eyebrow">ОТЧЁТ ЭКСПЕДИЦИИ</span><h2>{point.name}</h2></div></header>
      <div className="debrief-summary"><div><b>Улики</b><strong>{collectedEvidence.length}</strong></div><div><b>Находка</b><strong>{hasArtifact ? artifact?.name ?? 'получена' : 'не извлечена'}</strong></div><div><b>Ходы</b><strong>{turns}</strong></div><div><b>Здоровье</b><strong>{playerHealth}</strong></div></div>
      <div className="evidence-list">{collectedEvidence.length === 0 ? <p>Значимых доказательств не получено.</p> : collectedEvidence.map((entry) => <article key={entry.key}><span>{entry.kind} · надёжность {entry.reliability}%</span><b>{entry.title}</b><p>{entry.description}</p></article>)}</div>
      <button className="primary-button" onClick={onClose}>Вернуться на корабль</button>
    </section></div>;
  }

  return <div className="modal-backdrop">
    <section className="modal expedition-modal">
      <header><div><span className="eyebrow">{map.biome.toUpperCase()}</span><h2>{point.name}</h2><p>{map.hazardName} · безопасное окно {turnsLeft} ходов</p></div><button className="icon-button" disabled={isLeaving} onClick={onClose}>×</button></header>
      <div className="expedition-layout">
        <div className="surface-grid" style={{ gridTemplateColumns: `repeat(${map.width}, 1fr)` }}>
          {map.tiles.map((tile) => {
            const enemy = map.enemies.find((entry) => entry.x === tile.x && entry.y === tile.y && entry.health > 0);
            const player = map.player.x === tile.x && map.player.y === tile.y;
            const object = map.objects.find((entry) => entry.x === tile.x && entry.y === tile.y && !entry.resolved);
            return <button
              key={`${tile.x}-${tile.y}`}
              aria-label={`${tile.x},${tile.y}`}
              disabled={isLeaving || playerHealth <= 0}
              className={`tile tile-${tile.revealed ? tile.kind : 'hidden'} ${player ? 'tile-player' : ''} ${enemy ? 'tile-enemy' : ''} ${object ? 'tile-object' : ''}`}
              onClick={() => move(tile.x, tile.y)}
            >{player ? '◆' : enemy ? '▲' : tile.revealed && object ? object.kind === 'artifact' ? '✦' : object.kind === 'terminal' ? '▣' : object.kind === 'sample' ? '●' : '▥' : ''}</button>;
          })}
        </div>
        <aside className="expedition-sidebar">
          <div className="meter"><span>Здоровье</span><strong>{playerHealth}</strong><i style={{ width: `${playerHealth}%` }} /></div>
          <div className="meter warning"><span>Безопасное время</span><strong>{turnsLeft}</strong><i style={{ width: `${Math.max(0, turnsLeft / turnsLimit * 100)}%` }} /></div>
          <div className="stat-row"><span>Угрозы</span><b>{map.enemies.filter((enemy) => enemy.health > 0).length}</b></div>
          <div className="stat-row"><span>Улики</span><b>{collectedEvidence.length}</b></div>
          <div className="stat-row"><span>Находка</span><b>{hasArtifact ? 'извлечена' : 'нет'}</b></div>
          {blockedReason && <p className="warning-text">{blockedReason}</p>}
          <div className="field-log">{log.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}</div>
          <div className="field-actions">{has('medkit') && <button disabled={medkitUsed || playerHealth >= 100} onClick={heal}>{medkitUsed ? 'Аптечка использована' : 'Использовать аптечку'}</button>}<button className="primary-button" disabled={isLeaving} onClick={() => void leave()}>{isLeaving ? 'Сохранение…' : playerHealth <= 0 ? 'Аварийная эвакуация' : 'Эвакуация'}</button></div>
        </aside>
      </div>
    </section>
  </div>;
}
