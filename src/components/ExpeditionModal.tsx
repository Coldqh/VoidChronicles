import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Artifact,
  CrewMember,
  EquipmentId,
  EvidenceDraft,
  EquipmentItem,
  ExpeditionResult,
  LocationState,
  Planet,
  PointOfInterest
} from '../game/types';
import { EQUIPMENT, equipmentWeight } from '../exploration/equipment';
import { crewRoleBonus, roleLabel } from '../crew/generateCrew';
import { expeditionObjectiveForPoint } from '../exploration/lore';
import {
  clearExpeditionCheckpoint,
  loadExpeditionCheckpoint,
  saveExpeditionCheckpoint
} from '../exploration/expeditionCheckpoint';
import { generateSurface, type SurfaceMap, type SurfaceObject, type SurfaceTile } from '../generation/surface';
import { ExpeditionEnemyToken, ExpeditionObjectToken, ExpeditionPlayerToken, enemyVisualForName } from './ExpeditionTokens';

interface Props {
  seed: string;
  planet: Planet;
  point: PointOfInterest;
  artifact?: Artifact;
  crew: CrewMember[];
  personalEquipment: EquipmentItem[];
  locationState?: LocationState;
  onClose(): void;
  onComplete(result: ExpeditionResult): void | Promise<void>;
  onTutorialAction?(action: 'launch-expedition' | 'collect-data' | 'evacuate'): void;
}

type Phase = 'loadout' | 'field' | 'debrief';
const DEFAULT_LOADOUT: EquipmentId[] = ['pistol', 'armor', 'scanner', 'medkit', 'oxygen'];
const STEP_DELAY_MS = 72;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
const distance = (a: {x:number;y:number}, b:{x:number;y:number}) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

function tileAt(state: SurfaceMap, x: number, y: number): SurfaceTile | undefined {
  return state.tiles.find((tile) => tile.x === x && tile.y === y);
}

export function findFastestPath(state: SurfaceMap, target: { x: number; y: number }): { x: number; y: number }[] {
  const start = state.player;
  if (start.x === target.x && start.y === target.y) return [start];
  const targetTile = tileAt(state, target.x, target.y);
  if (!targetTile || !targetTile.revealed || targetTile.kind === 'rock') return [];
  const occupied = new Set(state.enemies.filter((enemy) => enemy.health > 0).map((enemy) => `${enemy.x}:${enemy.y}`));
  if (occupied.has(`${target.x}:${target.y}`)) return [];
  const queue = [start];
  const previous = new Map<string, string | null>([[`${start.x}:${start.y}`, null]]);
  const directions = [[1,0],[-1,0],[0,1],[0,-1]] as const;
  while (queue.length) {
    const current = queue.shift()!;
    if (current.x === target.x && current.y === target.y) break;
    for (const [dx,dy] of directions) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x}:${next.y}`;
      const tile = tileAt(state, next.x, next.y);
      if (!tile || !tile.revealed || tile.kind === 'rock' || occupied.has(key) || previous.has(key)) continue;
      previous.set(key, `${current.x}:${current.y}`);
      queue.push(next);
    }
  }
  const targetKey = `${target.x}:${target.y}`;
  if (!previous.has(targetKey)) return [];
  const path: { x: number; y: number }[] = [];
  let cursor: string | null = targetKey;
  while (cursor) {
    const [x,y] = cursor.split(':').map(Number);
    path.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }
  return path.reverse();
}

function storage(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}

export function ExpeditionModal({ seed, planet, point, artifact, crew, personalEquipment, locationState, onClose, onComplete, onTutorialAction }: Props) {
  const mission = expeditionObjectiveForPoint(point);
  const initial = useMemo(() => generateSurface(seed, planet, point, locationState), [seed, planet, point, locationState]);
  const checkpoint = useMemo(() => loadExpeditionCheckpoint(storage(), seed, point.id), [seed, point.id]);
  const restored = Boolean(checkpoint);
  const restoredMap = checkpoint?.map ?? initial;
  const [phase, setPhase] = useState<Phase>(checkpoint?.phase ?? 'loadout');
  const [selected, setSelected] = useState<EquipmentId[]>(checkpoint?.selected ?? DEFAULT_LOADOUT);
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>(checkpoint?.selectedCrewIds ?? []);
  const [map, setMap] = useState<SurfaceMap>(restoredMap);
  const mapRef = useRef(restoredMap);
  const [playerHealth, setPlayerHealth] = useState(checkpoint?.playerHealth ?? 100);
  const healthRef = useRef(checkpoint?.playerHealth ?? 100);
  const [turns, setTurns] = useState(checkpoint?.turns ?? 0);
  const turnsRef = useRef(checkpoint?.turns ?? 0);
  const initialLog = checkpoint?.log ?? [mission.description, point.publicSummary];
  const [log, setLog] = useState<string[]>(initialLog);
  const logRef = useRef<string[]>(initialLog);
  const [collectedEvidence, setCollectedEvidence] = useState<EvidenceDraft[]>(checkpoint?.collectedEvidence ?? []);
  const evidenceRef = useRef<EvidenceDraft[]>(checkpoint?.collectedEvidence ?? []);
  const [hasArtifact, setHasArtifact] = useState(checkpoint?.hasArtifact ?? false);
  const artifactRef = useRef(checkpoint?.hasArtifact ?? false);
  const [blockedReason, setBlockedReason] = useState<string | undefined>(checkpoint?.blockedReason);
  const [medkitUsed, setMedkitUsed] = useState(checkpoint?.medkitUsed ?? false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const movingRef = useRef(false);
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<ExpeditionResult['outcome'] | null>(null);

  const selectedCrew = crew.filter((member) => selectedCrewIds.includes(member.id));
  const issuedEquipment = personalEquipment.filter((item) => item.assignedToId === 'captain_player' || selectedCrewIds.includes(item.assignedToId ?? ''));
  const personalCombatBonus = issuedEquipment.filter((item) => item.category === 'weapon' || item.category === 'implant').reduce((sum, item) => sum + item.rarity * 3, 0);
  const personalEvidenceBonus = issuedEquipment.filter((item) => item.category === 'tool' || item.category === 'relic').reduce((sum, item) => sum + item.rarity * 3, 0);
  const personalHealingBonus = issuedEquipment.filter((item) => item.category === 'medical').reduce((sum, item) => sum + item.rarity * 4, 0);
  const personalArmorBonus = issuedEquipment.filter((item) => item.category === 'armor' || item.category === 'implant').reduce((sum, item) => sum + item.rarity * 2, 0);
  const roleBonuses = selectedCrew.flatMap((member) => [crewRoleBonus(member.primaryRole), ...(member.secondaryRole ? [crewRoleBonus(member.secondaryRole)] : [])]);
  const equipmentSubstitutes = new Set(roleBonuses.map((bonus) => bonus.equipment).filter(Boolean));
  const combatBonus = roleBonuses.reduce((sum, bonus) => sum + (bonus.combat ?? 0), 0) + personalCombatBonus;
  const evidenceBonus = roleBonuses.reduce((sum, bonus) => sum + (bonus.evidence ?? 0), 0) + personalEvidenceBonus;
  const healingBonus = roleBonuses.reduce((sum, bonus) => sum + (bonus.healing ?? 0), 0) + personalHealingBonus;
  const crewTurnBonus = roleBonuses.reduce((sum, bonus) => sum + (bonus.turns ?? 0), 0);
  const capacity = 9 + selectedCrew.length * 2;
  const usedWeight = equipmentWeight(selected);
  const has = (id: EquipmentId) => selected.includes(id) || equipmentSubstitutes.has(id);
  const turnsLimit = map.baseTurns + (has('oxygen') ? 12 : 0) + crewTurnBonus;
  const turnsLeft = Math.max(0, turnsLimit - turns);
  const selectedEnemy = map.enemies.find((enemy) => enemy.id === selectedEnemyId && enemy.health > 0);
  const objectiveObjects = map.objects.filter((object) => object.objective);
  const objectiveResolved = objectiveObjects.filter((object) => object.resolved).length;
  const objectiveTotal = Math.max(map.requiredObjectiveCount, objectiveObjects.length ? Math.min(objectiveObjects.length, map.requiredObjectiveCount) : 1);

  useEffect(() => {
    if (phase !== 'field' || isLeaving) return;
    saveExpeditionCheckpoint(storage(), {
      version: 1,
      seed,
      pointOfInterestId: point.id,
      phase: 'field',
      selected,
      selectedCrewIds,
      map,
      playerHealth,
      turns,
      log,
      collectedEvidence,
      hasArtifact,
      blockedReason,
      medkitUsed,
      savedAt: Date.now()
    });
  }, [phase, isLeaving, seed, point.id, selected, selectedCrewIds, map, playerHealth, turns, log, collectedEvidence, hasArtifact, blockedReason, medkitUsed]);

  const toggleCrew = (id: string) => setSelectedCrewIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : current.length < 3 ? [...current, id] : current);
  const toggle = (id: EquipmentId) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      const next = [...current, id];
      return equipmentWeight(next) <= capacity ? next : current;
    });
  };

  const commitLog = (entries: string[]) => {
    const next = entries.slice(0, 12);
    logRef.current = next;
    setLog(next);
  };

  const resolveObject = (object: SurfaceObject, nextMap: SurfaceMap, nextLog: string[]): void => {
    if (object.resolved) return;
    const required = object.requiredEquipment;
    const canForceDoor = object.kind === 'door' && has('explosives');
    if (required && !has(required) && !canForceDoor) {
      const equipment = EQUIPMENT.find((entry) => entry.id === required)?.name ?? required;
      const reason = `Для объекта «${object.title}» требуется: ${equipment}.`;
      setBlockedReason(reason);
      nextLog.unshift(`Доступ заблокирован: нужен ${equipment}.`);
      return;
    }
    object.resolved = true;
    const tile = tileAt(nextMap, object.x, object.y);
    if (tile) tile.resolved = true;
    if (object.evidence) {
      const reliabilityPenalty = canForceDoor && !has('cutter') ? 22 : has('scanner') ? 0 : 12;
      const evidence = { ...object.evidence, reliability: Math.min(100, Math.max(20, object.evidence.reliability - reliabilityPenalty + evidenceBonus)) };
      if (!evidenceRef.current.some((entry) => entry.key === evidence.key)) {
        evidenceRef.current = [...evidenceRef.current, evidence];
        setCollectedEvidence(evidenceRef.current);
      }
      onTutorialAction?.('collect-data');
      nextLog.unshift(`${object.objective ? 'Цель' : 'Улика'}: ${object.title}.`);
    }
    if (object.kind === 'artifact') {
      artifactRef.current = Boolean(artifact && object.artifactId === artifact.id);
      setHasArtifact(artifactRef.current);
      nextLog.unshift(artifactRef.current ? `Извлечён объект: ${artifact?.name}.` : 'Хранилище пусто: связанный предмет уже был вынесен ранее.');
    }
    if (canForceDoor && !has('cutter')) nextLog.unshift('Взрыв открыл проход, но повредил часть данных.');
  };

  const performStep = (x: number, y: number): boolean => {
    if (phase !== 'field' || isLeaving || healthRef.current <= 0 || turnsRef.current >= turnsLimit || distance(mapRef.current.player, { x, y }) !== 1) return false;
    const source = mapRef.current;
    const targetTile = tileAt(source, x, y);
    if (!targetTile || targetTile.kind === 'rock') return false;
    const nextMap: SurfaceMap = {
      ...source,
      player: { ...source.player },
      tiles: source.tiles.map((entry) => ({ ...entry })),
      enemies: source.enemies.map((enemy) => ({ ...enemy })),
      objects: source.objects.map((object) => ({ ...object, evidence: object.evidence ? { ...object.evidence } : undefined }))
    };
    let nextHealth = healthRef.current;
    const nextLog = [...logRef.current];
    const occupying = nextMap.enemies.find((enemy) => enemy.x === x && enemy.y === y && enemy.health > 0);
    if (occupying) {
      const baseDamage = (has('rifle') ? 46 : has('pistol') ? 32 : 18) + combatBonus;
      occupying.health -= baseDamage;
      nextLog.unshift(`Атака: ${occupying.name} получает ${baseDamage} урона.`);
      if (occupying.health <= 0) {
        nextLog.unshift(`${occupying.name} уничтожен.`);
        if (selectedEnemyId === occupying.id) setSelectedEnemyId(null);
      }
    } else {
      nextMap.player = { x, y };
      if (targetTile.kind === 'hazard') {
        const damage = Math.max(1, (has('armor') ? 4 : 10) - personalArmorBonus);
        nextHealth -= damage;
        nextLog.unshift(`${nextMap.hazardName}: получено ${damage} урона.`);
      }
      const object = nextMap.objects.find((entry) => entry.x === x && entry.y === y);
      if (object) resolveObject(object, nextMap, nextLog);
    }

    const occupied = new Set(nextMap.enemies.filter((enemy) => enemy.health > 0).map((enemy) => `${enemy.x}:${enemy.y}`));
    for (const enemy of nextMap.enemies.filter((entry) => entry.health > 0)) {
      occupied.delete(`${enemy.x}:${enemy.y}`);
      if (distance(enemy, nextMap.player) <= 2) {
        const damage = Math.max(1, enemy.damage - (has('armor') ? 5 : 0) - personalArmorBonus);
        nextHealth -= damage;
        nextLog.unshift(`${enemy.name} атакует. Получено ${damage} урона.`);
      } else {
        const dx = Math.sign(nextMap.player.x - enemy.x);
        const dy = Math.sign(nextMap.player.y - enemy.y);
        const candidate = Math.abs(nextMap.player.x - enemy.x) > Math.abs(nextMap.player.y - enemy.y)
          ? { x: enemy.x + dx, y: enemy.y }
          : { x: enemy.x, y: enemy.y + dy };
        const enemyTile = tileAt(nextMap, candidate.x, candidate.y);
        const key = `${candidate.x}:${candidate.y}`;
        const hitsPlayer = candidate.x === nextMap.player.x && candidate.y === nextMap.player.y;
        if (enemyTile && enemyTile.kind !== 'rock' && !occupied.has(key) && !hitsPlayer) {
          enemy.x = candidate.x;
          enemy.y = candidate.y;
        }
      }
      occupied.add(`${enemy.x}:${enemy.y}`);
    }

    const revealRadius = has('scanner') ? 5 : 3.5;
    nextMap.tiles = nextMap.tiles.map((entry) => ({ ...entry, revealed: entry.revealed || Math.hypot(entry.x - nextMap.player.x, entry.y - nextMap.player.y) < revealRadius }));
    const nextTurns = turnsRef.current + 1;
    if (nextTurns >= turnsLimit) {
      const damage = Math.max(1, (has('armor') ? 7 : 15) - personalArmorBonus);
      nextHealth -= damage;
      nextLog.unshift(`Безопасное окно закрыто. ${nextMap.hazardName}: ${damage} урона.`);
    }
    if (nextHealth <= 0) nextLog.unshift('Капитан потерял сознание. Возможна только аварийная эвакуация.');
    mapRef.current = nextMap;
    healthRef.current = Math.max(0, nextHealth);
    turnsRef.current = nextTurns;
    setMap(nextMap);
    setPlayerHealth(healthRef.current);
    setTurns(nextTurns);
    commitLog(nextLog);
    return true;
  };

  const moveTo = async (x: number, y: number) => {
    if (movingRef.current || isLeaving || healthRef.current <= 0) return;
    const enemy = mapRef.current.enemies.find((entry) => entry.x === x && entry.y === y && entry.health > 0);
    if (enemy) { setSelectedEnemyId(enemy.id); return; }
    const target = tileAt(mapRef.current, x, y);
    if (!target?.revealed || target.kind === 'rock') return;
    movingRef.current = true;
    setIsMoving(true);
    try {
      let guard = mapRef.current.width * mapRef.current.height;
      while (guard-- > 0 && healthRef.current > 0 && turnsRef.current < turnsLimit) {
        if (mapRef.current.player.x === x && mapRef.current.player.y === y) break;
        const path = findFastestPath(mapRef.current, { x, y });
        const next = path[1];
        if (!next || !performStep(next.x, next.y)) break;
        await nextFrame();
        await wait(STEP_DELAY_MS);
      }
    } finally {
      movingRef.current = false;
      setIsMoving(false);
    }
  };

  const attackSelected = async () => {
    const enemy = mapRef.current.enemies.find((entry) => entry.id === selectedEnemyId && entry.health > 0);
    if (!enemy || movingRef.current) return;
    if (distance(mapRef.current.player, enemy) !== 1) {
      commitLog([`${enemy.name}: цель слишком далеко для атаки.`, ...logRef.current]);
      return;
    }
    movingRef.current = true;
    setIsMoving(true);
    try { if (performStep(enemy.x, enemy.y)) { await nextFrame(); await wait(STEP_DELAY_MS); } }
    finally { movingRef.current = false; setIsMoving(false); }
  };

  const heal = () => {
    if (!has('medkit') || medkitUsed || healthRef.current >= 100) return;
    setMedkitUsed(true);
    healthRef.current = Math.min(100, healthRef.current + 32 + healingBonus);
    setPlayerHealth(healthRef.current);
    commitLog(['Использована аптечка.', ...logRef.current]);
  };

  const leave = async () => {
    if (isLeaving || movingRef.current) return;
    setIsLeaving(true);
    try {
      const currentHealth = healthRef.current;
      const injury = currentHealth < 75 ? { bodyPart: 'torso' as const, severity: Math.min(10, Math.max(1, Math.ceil((100 - currentHealth) / 7))) } : undefined;
      const currentObjectiveResolved = mapRef.current.objects.filter((object) => object.objective && object.resolved).length;
      const objectiveSatisfied = currentObjectiveResolved >= Math.max(1, mission.requiredObjects);
      const evidenceSatisfied = evidenceRef.current.length >= Math.max(0, mission.requiredEvidence);
      const artifactSatisfied = !mission.requiresArtifact || artifactRef.current;
      const resolved = objectiveSatisfied && evidenceSatisfied && artifactSatisfied;
      const outcome = currentHealth <= 0 ? 'failed' as const : resolved ? 'resolved' as const : 'evacuated' as const;
      const previousEnemies = new Map((locationState?.enemyStates ?? []).map((enemy) => [enemy.id, enemy]));
      for (const enemy of mapRef.current.enemies) previousEnemies.set(enemy.id, { id: enemy.id, health: Math.max(0, enemy.health), x: enemy.x, y: enemy.y });
      const defeatedEnemyIds = mapRef.current.enemies.filter((enemy) => enemy.health <= 0).map((enemy) => enemy.id);
      const nextLocationState: LocationState = {
        pointOfInterestId: point.id,
        visitCount: (locationState?.visitCount ?? 0) + 1,
        enemyStates: Array.from(previousEnemies.values()),
        resolvedObjectIds: Array.from(new Set([...(locationState?.resolvedObjectIds ?? []), ...mapRef.current.objects.filter((object) => object.resolved).map((object) => object.id)])),
        collectedEvidenceKeys: Array.from(new Set([...(locationState?.collectedEvidenceKeys ?? []), ...evidenceRef.current.map((entry) => entry.key)])),
        revealedTileKeys: Array.from(new Set([...(locationState?.revealedTileKeys ?? []), ...mapRef.current.tiles.filter((tile) => tile.revealed).map((tile) => `${tile.x}:${tile.y}`)])),
        artifactTaken: Boolean(locationState?.artifactTaken || artifactRef.current),
        lastOutcome: outcome,
        lastVisitedYear: 0
      };
      const result: ExpeditionResult = {
        pointOfInterestId: point.id,
        crewIds: selectedCrewIds,
        artifact: artifactRef.current ? artifact : undefined,
        injury,
        evidence: evidenceRef.current,
        outcome,
        turnsSpent: turnsRef.current,
        blockedReason,
        locationState: nextLocationState,
        defeatedEnemyIds,
        objectiveProgress: currentObjectiveResolved,
        objectiveTotal: Math.max(1, mission.requiredObjects),
        revealedEventIds: resolved ? point.sourceEventIds ?? [] : []
      };
      onTutorialAction?.('evacuate');
      await onComplete(result);
      clearExpeditionCheckpoint(storage(), seed, point.id);
      setLastOutcome(outcome);
      setPhase('debrief');
    } finally { setIsLeaving(false); }
  };

  if (phase === 'loadout') {
    return <div className="modal-backdrop"><section className="modal expedition-modal loadout-modal">
      <header><div><span className="eyebrow">ПОДГОТОВКА ЭКСПЕДИЦИИ</span><h2>{point.name}</h2><p>{point.publicSummary}</p></div><button className="icon-button" onClick={onClose}>×</button></header>
      <article className="mission-objective-card"><span>ЗАДАЧА</span><h3>{mission.title}</h3><p>{mission.description}</p><small>{point.sourceEventIds?.length ? `Связано с ${point.sourceEventIds.length} историческими записями` : 'Источник будет определён по полевым данным'}</small></article>
      <div className="mission-brief"><div><b>Память</b><span>{locationState ? `визитов ${locationState.visitCount}` : 'первый заход'}</span></div><div><b>Среда</b><span>{planet.type}</span></div><div><b>Угроза</b><span>{point.danger}</span></div><div><b>Скан</b><span>{point.scanConfidence}%</span></div></div>
      <section className="crew-selection"><h3>Группа · капитан + {selectedCrew.length}</h3><div className="crew-selection-grid">{crew.length === 0 ? <p>Высадка в одиночку.</p> : crew.map((member) => <button key={member.id} className={selectedCrewIds.includes(member.id) ? 'selected' : ''} onClick={() => toggleCrew(member.id)}><b>{member.name}</b><span>{roleLabel(member.primaryRole)} · {member.morale}</span></button>)}</div></section>
      {issuedEquipment.length > 0 && <section className="issued-equipment"><h3>Личное снаряжение</h3><div className="issued-equipment-grid">{issuedEquipment.map((item) => <article key={item.id}><b>{item.name}</b></article>)}</div></section>}
      <div className="loadout-grid">{EQUIPMENT.map((item) => <button key={item.id} className={selected.includes(item.id) ? 'selected' : ''} onClick={() => toggle(item.id)}><b>{item.name}</b><span>{item.description}</span><em>{item.weight}</em></button>)}</div>
      <footer className="loadout-footer"><span>{usedWeight}/{capacity} · группа {selectedCrew.length + 1}</span><button data-tutorial="launch-expedition" className="primary-button" onClick={() => { setPhase('field'); onTutorialAction?.('launch-expedition'); }}>Начать</button></footer>
    </section></div>;
  }

  if (phase === 'debrief') {
    return <div className="modal-backdrop"><section className="modal expedition-modal debrief-modal">
      <header><div><span className="eyebrow">ОТЧЁТ ЭКСПЕДИЦИИ</span><h2>{point.name}</h2></div></header>
      <article className={`mission-objective-card ${lastOutcome === 'resolved' ? 'complete' : ''}`}><span>{lastOutcome === 'resolved' ? 'ЗАДАЧА ВЫПОЛНЕНА' : lastOutcome === 'failed' ? 'ЭКСПЕДИЦИЯ ПРОВАЛЕНА' : 'ЗАДАЧА НЕ ЗАВЕРШЕНА'}</span><h3>{mission.title}</h3><p>{lastOutcome === 'resolved' ? point.completionSummary ?? mission.completionText : 'Собранные данные сохранены. Локация останется в текущем состоянии для повторного захода.'}</p></article>
      <div className="debrief-summary"><div><b>Улики</b><strong>{collectedEvidence.length}/{mission.requiredEvidence}</strong></div><div><b>Цели</b><strong>{objectiveResolved}/{objectiveTotal}</strong></div><div><b>Находка</b><strong>{hasArtifact ? artifact?.name ?? 'получена' : 'нет'}</strong></div><div><b>Здоровье</b><strong>{playerHealth}</strong></div></div>
      <div className="evidence-list">{collectedEvidence.length === 0 ? <p>Значимых доказательств не получено.</p> : collectedEvidence.map((entry) => <article key={entry.key}><span>{entry.kind} · {entry.reliability}%</span><b>{entry.title}</b><p>{entry.description}</p></article>)}</div>
      <button className="primary-button" onClick={onClose}>Вернуться на корабль</button>
    </section></div>;
  }

  const tutorialObjectId = map.objects.find((entry) => !entry.resolved && entry.evidence)?.id;
  return <div className="modal-backdrop"><section className={`modal expedition-modal field-modal expedition-biome-${planet.type} expedition-site-${point.type}`} data-moving={isMoving ? 'true' : 'false'}>
    <header><div><span className="eyebrow">{restored ? 'ВОССТАНОВЛЕННЫЙ ЗАХОД' : map.biome.toUpperCase()}</span><h2>{point.name}</h2><p>{map.hazardName} · {turnsLeft} ходов</p></div><button className="icon-button" disabled={isLeaving || isMoving} onClick={onClose}>×</button></header>
    <section className="field-mission-strip"><div><span>ЗАДАЧА</span><b>{map.objectiveTitle}</b><small>{map.objectiveDescription}</small></div><strong>{objectiveResolved}/{objectiveTotal}</strong></section>
    <section className={`field-target-panel ${selectedEnemy ? 'has-target' : ''}`}>
      {selectedEnemy && <><div className="field-target-identity"><ExpeditionEnemyToken variant={enemyVisualForName(selectedEnemy.name)}/><div><span>ЦЕЛЬ</span><b>{selectedEnemy.name}</b></div></div><div><span>HP</span><b>{Math.max(0, selectedEnemy.health)}/{selectedEnemy.maxHealth}</b></div><div><span>УРОН</span><b>{selectedEnemy.damage}</b></div><button disabled={isMoving || distance(map.player, selectedEnemy) !== 1} onClick={() => void attackSelected()}>{distance(map.player, selectedEnemy) === 1 ? 'Атаковать' : 'Далеко'}</button></>}
    </section>
    <div className="expedition-layout"><div className="surface-grid" style={{ gridTemplateColumns: `repeat(${map.width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${map.height}, minmax(0, 1fr))` }}>
      {map.tiles.map((tile) => {
        const enemy = map.enemies.find((entry) => entry.x === tile.x && entry.y === tile.y && entry.health > 0);
        const player = map.player.x === tile.x && map.player.y === tile.y;
        const object = map.objects.find((entry) => entry.x === tile.x && entry.y === tile.y && !entry.resolved);
        const reachable = tile.revealed && tile.kind !== 'rock' && distance(map.player, tile) === 1;
        return <button key={`${tile.x}-${tile.y}`} aria-label={`${tile.x},${tile.y}`} aria-current={player ? 'true' : undefined} data-tutorial={tile.revealed && object?.id === tutorialObjectId ? 'collect-data' : undefined} disabled={isLeaving || playerHealth <= 0 || isMoving} className={`tile tile-${tile.revealed ? tile.kind : 'hidden'} ${reachable ? 'tile-reachable' : ''} ${player ? 'tile-player' : ''} ${enemy ? 'tile-enemy' : ''} ${enemy?.id === selectedEnemyId ? 'tile-selected-enemy' : ''} ${object ? 'tile-object' : ''} ${object?.objective ? 'tile-objective' : ''}`} onClick={() => void moveTo(tile.x, tile.y)}>{player ? <ExpeditionPlayerToken/> : enemy ? <ExpeditionEnemyToken variant={enemyVisualForName(enemy.name)}/> : tile.revealed && object ? <ExpeditionObjectToken kind={object.kind} objective={object.objective}/> : null}</button>;
      })}
    </div><aside className="expedition-sidebar">
      <div className="meter"><span>HP</span><strong>{playerHealth}</strong><i style={{ width: `${playerHealth}%` }} /></div>
      <div className="meter warning"><span>ВРЕМЯ</span><strong>{turnsLeft}</strong><i style={{ width: `${Math.max(0, turnsLeft / turnsLimit * 100)}%` }} /></div>
      <div className="stat-row"><span>Цель</span><b>{objectiveResolved}/{objectiveTotal}</b></div><div className="stat-row"><span>Улики</span><b>{collectedEvidence.length}/{mission.requiredEvidence}</b></div>
      {blockedReason && <p className="warning-text">{blockedReason}</p>}
      <div className="field-log">{log.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}</div>
      <div className="field-actions">{has('medkit') && <button disabled={medkitUsed || playerHealth >= 100 || isMoving} onClick={heal}>{medkitUsed ? 'Аптечка использована' : 'Аптечка'}</button>}<button data-tutorial="evacuate" className="primary-button" disabled={isLeaving || isMoving} onClick={() => void leave()}>{isLeaving ? 'Сохранение…' : playerHealth <= 0 ? 'Аварийная эвакуация' : objectiveResolved >= objectiveTotal ? 'Завершить и эвакуироваться' : 'Эвакуация'}</button></div>
    </aside></div>
  </section></div>;
}
