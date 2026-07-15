import type { EquipmentId, EvidenceDraft, LocationState, Planet, PointOfInterest } from '../game/types';
import { expeditionObjectiveForPoint } from '../exploration/lore';
import { createRng } from './rng';

export type SurfaceTileKind = 'floor' | 'rock' | 'hazard' | 'ruin' | 'exit' | 'artifact' | 'evidence' | 'door' | 'terminal' | 'sample' | 'cover';
export interface SurfaceTile { x: number; y: number; kind: SurfaceTileKind; revealed: boolean; resolved?: boolean; }
export interface SurfaceEnemy { id: string; x: number; y: number; health: number; maxHealth: number; name: string; damage: number; }
export interface SurfaceObject {
  id: string;
  x: number;
  y: number;
  kind: 'terminal' | 'sample' | 'evidence' | 'door' | 'artifact';
  title: string;
  requiredEquipment?: EquipmentId;
  evidence?: EvidenceDraft;
  resolved: boolean;
  objective: boolean;
  objectiveText?: string;
  artifactId?: string;
}
export interface SurfaceMap {
  width: number;
  height: number;
  tiles: SurfaceTile[];
  player: { x: number; y: number };
  enemies: SurfaceEnemy[];
  objects: SurfaceObject[];
  artifactPosition?: { x: number; y: number };
  biome: string;
  hazardName: string;
  baseTurns: number;
  objectiveTitle: string;
  objectiveDescription: string;
  requiredObjectiveCount: number;
}

const enemyNames: Record<PointOfInterest['type'], readonly string[]> = {
  ruin: ['охранный автомат', 'мародёр руин', 'паразит комплекса'],
  wreck: ['аварийный дрон', 'чистильщик обломков', 'выживший рейдер'],
  settlement: ['местный ополченец', 'агент безопасности', 'испуганный охранник'],
  laboratory: ['лабораторный дрон', 'сбежавший образец', 'карантинный автомат'],
  cave: ['подземный хищник', 'кристаллическая колония', 'рой паразитов'],
  ancientFactory: ['сборочный дрон', 'машинный страж', 'ремонтный рой'],
  graveyard: ['страж саркофагов', 'падальщик', 'ритуальный автомат'],
  smugglerCamp: ['контрабандист', 'наёмный стрелок', 'охранный дрон'],
  anomaly: ['искажённая форма', 'эхо наблюдателя', 'аномальный сгусток'],
  biosphere: ['защитный организм', 'подвижная колония', 'хищная спора'],
  distress: ['обезумевший выживший', 'аварийный дрон', 'неизвестный преследователь']
};

const biomeNames: Record<Planet['type'], readonly string[]> = {
  rocky: ['базальтовая равнина', 'каменный разлом', 'вулканический уступ'],
  ocean: ['плавающая платформа', 'приливный риф', 'затопленный купол'],
  desert: ['песчаное плато', 'соляная пустошь', 'каменное море'],
  ice: ['ледяная трещина', 'замёрзший каньон', 'подлёдная полость'],
  gas: ['орбитальная платформа', 'атмосферный коллектор', 'дрейфующий узел'],
  toxic: ['кислотная низина', 'ядовитое болото', 'серная котловина'],
  jungle: ['плотные заросли', 'живой лес', 'споровая долина'],
  artificial: ['искусственный сектор', 'машинная поверхность', 'сервисный лабиринт'],
  anomalous: ['искажённая зона', 'пространственный карман', 'поле обратной тени']
};

const hazardNames: Record<Planet['type'], string> = {
  rocky: 'каменный обвал', ocean: 'прилив и давление', desert: 'пылевая буря', ice: 'переохлаждение',
  gas: 'разгерметизация', toxic: 'токсичная атмосфера', jungle: 'агрессивная биосфера',
  artificial: 'нестабильная энергетика', anomalous: 'аномальное воздействие'
};

const genericEvidence: Record<EvidenceDraft['kind'], readonly string[]> = {
  record: ['частично восстановленная запись', 'личный журнал', 'служебный приказ'],
  body: ['останки с необычными повреждениями', 'тело в защитном костюме', 'мумифицированные останки'],
  weapon: ['оружие с чужой маркировкой', 'разряженный боевой модуль', 'следы направленного взрыва'],
  architecture: ['перестроенная стена', 'скрытый технический проход', 'чужой фундамент под комплексом'],
  sample: ['биологический образец', 'минеральный налёт', 'активная ткань'],
  terminal: ['повреждённый терминал', 'архивный узел', 'закрытый журнал доступа'],
  damage: ['следы внутренней атаки', 'оплавленный корпус', 'повреждение изнутри'],
  signal: ['повторяющийся сигнал', 'искажённая передача', 'закодированный маяк']
};

function loreFragments(point: PointOfInterest): string[] {
  const raw = [point.confirmedSummary, point.origin, point.truth]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/(?<=[.!?])\s+/))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(raw)];
}

function evidenceFor(point: PointOfInterest, kind: EvidenceDraft['kind'], index: number, title?: string): EvidenceDraft {
  const generic = genericEvidence[kind][index % genericEvidence[kind].length] ?? genericEvidence[kind][0] ?? 'неизвестная улика';
  const fragments = loreFragments(point);
  const fragment = fragments[index % Math.max(1, fragments.length)] ?? `Улика относится к объекту «${point.name}».`;
  const resolvedTitle = title ?? `${generic[0]?.toUpperCase() ?? ''}${generic.slice(1)}`;
  return {
    key: `${point.id}:${kind}:${index}`,
    kind,
    title: resolvedTitle,
    description: `${generic}. ${fragment}`,
    reliability: Math.min(96, 52 + (index * 13) % 39 + Math.round(point.scanConfidence / 12)),
    tags: [point.type, kind, ...(point.loreTags ?? []).slice(0, 4), ...(point.sourceEventIds ?? []).slice(0, 2)]
  };
}

function tileAt(tiles: SurfaceTile[], width: number, x: number, y: number): SurfaceTile | undefined {
  if (x < 0 || y < 0 || x >= width) return undefined;
  return tiles[y * width + x];
}

function carvePath(tiles: SurfaceTile[], width: number, start: { x: number; y: number }, end: { x: number; y: number }, rng: ReturnType<typeof createRng>) {
  let x = start.x;
  let y = start.y;
  let guard = width * tiles.length;
  while ((x !== end.x || y !== end.y) && guard-- > 0) {
    const tile = tileAt(tiles, width, x, y);
    if (tile) tile.kind = 'floor';
    const horizontal = x !== end.x && (y === end.y || rng.chance(0.58));
    if (horizontal) x += Math.sign(end.x - x);
    else if (y !== end.y) y += Math.sign(end.y - y);
  }
  const last = tileAt(tiles, width, end.x, end.y);
  if (last) last.kind = 'floor';
}

function chooseDistinct<T>(items: T[], count: number, rng: ReturnType<typeof createRng>): T[] {
  const pool = [...items];
  const selected: T[] = [];
  while (pool.length && selected.length < count) selected.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  return selected;
}

function edgeStart(width: number, height: number, rng: ReturnType<typeof createRng>) {
  const side = rng.int(0, 3);
  if (side === 0) return { x: 1, y: rng.int(1, height - 2) };
  if (side === 1) return { x: width - 2, y: rng.int(1, height - 2) };
  if (side === 2) return { x: rng.int(1, width - 2), y: 1 };
  return { x: rng.int(1, width - 2), y: height - 2 };
}

type ObjectBlueprint = {
  kind: SurfaceObject['kind'];
  title: string;
  evidenceKind: EvidenceDraft['kind'];
  requiredEquipment?: EquipmentId;
  objective: boolean;
  objectiveText?: string;
  artifactId?: string;
};

function objectiveBlueprints(point: PointOfInterest): ObjectBlueprint[] {
  const mission = expeditionObjectiveForPoint(point);
  const total = Math.max(1, mission.requiredObjects);
  const artifactId = point.artifactIds?.[0];
  const artifactName = point.possibleRewards.find((reward) => reward !== 'архивные записи' && reward !== 'исторические свидетельства') ?? 'связанный артефакт';
  const result: ObjectBlueprint[] = [];

  for (let index = 0; index < total; index += 1) {
    if (mission.kind === 'recover-artifact' && index === total - 1 && artifactId) {
      result.push({ kind: 'artifact', title: `Хранилище: ${artifactName}`, evidenceKind: 'record', requiredEquipment: 'scanner', objective: true, objectiveText: 'Извлечь исторический предмет', artifactId });
    } else if (mission.kind === 'restore-archive') {
      result.push({ kind: 'terminal', title: index === 0 ? 'Узел питания архива' : `Секция архива ${index + 1}`, evidenceKind: 'terminal', requiredEquipment: index === 0 ? 'cutter' : 'translator', objective: true, objectiveText: 'Восстановить архивный узел' });
    } else if (mission.kind === 'recover-black-box') {
      result.push({ kind: index === total - 1 ? 'terminal' : 'door', title: index === total - 1 ? 'Регистратор последних событий' : 'Аварийная переборка', evidenceKind: index === total - 1 ? 'record' : 'damage', requiredEquipment: index === total - 1 ? 'scanner' : 'cutter', objective: true, objectiveText: 'Добраться до регистратора' });
    } else if (mission.kind === 'rescue-survivors') {
      result.push({ kind: index === total - 1 ? 'evidence' : 'door', title: index === total - 1 ? 'Аварийная капсула' : 'Заблокированный отсек', evidenceKind: index === total - 1 ? 'signal' : 'damage', requiredEquipment: index === total - 1 ? 'medkit' : 'cutter', objective: true, objectiveText: 'Подтвердить и вывести выживших' });
    } else if (mission.kind === 'collect-sample') {
      result.push({ kind: 'sample', title: `Контрольный образец ${index + 1}`, evidenceKind: 'sample', requiredEquipment: 'sampleContainer', objective: true, objectiveText: 'Изолировать образец' });
    } else if (mission.kind === 'disable-system') {
      result.push({ kind: index === total - 1 ? 'terminal' : 'door', title: index === total - 1 ? 'Главный управляющий контур' : `Контур питания ${index + 1}`, evidenceKind: 'terminal', requiredEquipment: index === total - 1 ? 'cutter' : 'explosives', objective: true, objectiveText: 'Остановить автономную систему' });
    } else if (mission.kind === 'establish-contact') {
      result.push({ kind: 'terminal', title: index === total - 1 ? 'Рабочий канал поселения' : `Ретранслятор ${index + 1}`, evidenceKind: 'signal', requiredEquipment: 'translator', objective: true, objectiveText: 'Подтвердить локальный канал' });
    } else if (mission.kind === 'investigate-anomaly') {
      result.push({ kind: index % 2 === 0 ? 'sample' : 'terminal', title: `Точка измерения ${index + 1}`, evidenceKind: index % 2 === 0 ? 'sample' : 'signal', requiredEquipment: 'scanner', objective: true, objectiveText: 'Получить независимое измерение' });
    } else {
      const kinds: SurfaceObject['kind'][] = ['evidence', 'terminal', 'sample'];
      const evidenceKinds: EvidenceDraft['kind'][] = ['damage', 'record', 'architecture', 'body'];
      result.push({ kind: kinds[index % kinds.length]!, title: `Ключевой след ${index + 1}: ${point.name}`, evidenceKind: evidenceKinds[index % evidenceKinds.length]!, requiredEquipment: 'scanner', objective: true, objectiveText: 'Задокументировать ключевой след' });
    }
  }
  return result;
}

function supportBlueprints(point: PointOfInterest, count: number): ObjectBlueprint[] {
  const kinds: SurfaceObject['kind'][] = point.type === 'biosphere'
    ? ['sample', 'evidence', 'terminal']
    : point.type === 'smugglerCamp'
      ? ['door', 'terminal', 'evidence']
      : ['door', 'terminal', 'sample', 'evidence'];
  const evidenceKinds: EvidenceDraft['kind'][] = ['architecture', 'terminal', 'sample', 'damage', 'record', 'signal'];
  return Array.from({ length: count }, (_, index) => ({
    kind: kinds[index % kinds.length]!,
    title: index === 0 ? `Вторичный след: ${point.origin}` : `Сопутствующее свидетельство ${index + 1}`,
    evidenceKind: evidenceKinds[index % evidenceKinds.length]!,
    requiredEquipment: kinds[index % kinds.length] === 'door' ? 'cutter' : kinds[index % kinds.length] === 'sample' ? 'sampleContainer' : kinds[index % kinds.length] === 'terminal' ? 'translator' : 'scanner',
    objective: false
  }));
}

export function generateSurface(seed: string, planet: Planet, point: PointOfInterest, locationState?: LocationState, width?: number, height?: number): SurfaceMap {
  const rng = createRng(`${seed}:surface:v3:${point.id}`);
  const tutorialMap = planet.imageKey === 'tutorial-target';
  const mission = expeditionObjectiveForPoint(point);
  const generatedSize = tutorialMap ? 13 : rng.int(13, point.type === 'ancientFactory' || point.type === 'cave' ? 18 : 17);
  const mapWidth = width ?? height ?? generatedSize;
  const mapHeight = height ?? width ?? generatedSize;
  const tiles: SurfaceTile[] = [];
  const rockChance = point.type === 'cave' ? 0.27 : point.type === 'ancientFactory' || point.type === 'laboratory' ? 0.18 : 0.12;
  const hazardChance = planet.danger === 'extreme' ? 0.16 : planet.danger === 'danger' ? 0.11 : 0.07;

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const border = x === 0 || y === 0 || x === mapWidth - 1 || y === mapHeight - 1;
      const roll = rng.next();
      const kind: SurfaceTileKind = border ? 'rock' : roll < rockChance ? 'rock' : roll < rockChance + hazardChance ? 'hazard' : roll < rockChance + hazardChance + 0.08 ? 'cover' : roll < rockChance + hazardChance + 0.15 ? 'ruin' : 'floor';
      tiles.push({ x, y, kind, revealed: Boolean(locationState?.revealedTileKeys.includes(`${x}:${y}`)) });
    }
  }

  const player = tutorialMap ? { x: 1, y: Math.floor(mapHeight / 2) } : edgeStart(mapWidth, mapHeight, rng);
  const exitTile = tileAt(tiles, mapWidth, player.x, player.y);
  if (exitTile) exitTile.kind = 'exit';
  const interior = tiles.filter((tile) => tile.x > 1 && tile.y > 1 && tile.x < mapWidth - 2 && tile.y < mapHeight - 2);
  const farCandidates = interior.filter((tile) => Math.abs(tile.x - player.x) + Math.abs(tile.y - player.y) > Math.floor((mapWidth + mapHeight) * 0.28));
  const objectiveItems = objectiveBlueprints(point);
  const supportCount = tutorialMap ? 0 : Math.max(1, Math.min(3, mission.requiredEvidence - 1));
  const blueprints = [...objectiveItems, ...supportBlueprints(point, supportCount)];
  const positions = tutorialMap
    ? [{ x: Math.min(mapWidth - 3, player.x + 4), y: player.y }, { x: mapWidth - 3, y: Math.max(2, player.y - 2) }].slice(0, blueprints.length)
    : chooseDistinct(farCandidates.length ? farCandidates : interior, blueprints.length, rng);
  positions.forEach((position) => carvePath(tiles, mapWidth, player, position, rng));

  const objects: SurfaceObject[] = positions.map((position, index) => {
    const blueprint = blueprints[index] ?? supportBlueprints(point, 1)[0]!;
    const tile = tileAt(tiles, mapWidth, position.x, position.y);
    if (tile) tile.kind = blueprint.kind === 'door' ? 'door' : blueprint.kind === 'terminal' ? 'terminal' : blueprint.kind === 'sample' ? 'sample' : blueprint.kind === 'artifact' ? 'artifact' : 'evidence';
    const id = `object_${point.id}_${index}`;
    return {
      id,
      ...position,
      kind: blueprint.kind,
      title: blueprint.title,
      requiredEquipment: blueprint.requiredEquipment,
      evidence: evidenceFor(point, blueprint.evidenceKind, index, blueprint.title),
      resolved: Boolean(locationState?.resolvedObjectIds.includes(id)),
      objective: blueprint.objective,
      objectiveText: blueprint.objectiveText,
      artifactId: blueprint.artifactId
    };
  });

  const friendlySettlement = point.type === 'settlement' && Boolean(point.civilizationId);
  const dangerRange: Record<PointOfInterest['danger'], [number, number]> = { safe: [0, 1], caution: [0, 3], danger: [2, 6], extreme: [4, 9] };
  const [minEnemies, maxEnemies] = friendlySettlement || tutorialMap ? [0, tutorialMap ? 1 : 0] : dangerRange[point.danger];
  const enemyCount = rng.int(minEnemies, maxEnemies);
  const enemyPositions = chooseDistinct(interior.filter((tile) => tile.kind !== 'rock' && Math.abs(tile.x - player.x) + Math.abs(tile.y - player.y) > 5), enemyCount, rng);
  const enemies = enemyPositions.map((position, index) => {
    const id = `enemy_${point.id}_${index}`;
    const saved = locationState?.enemyStates.find((entry) => entry.id === id);
    const generatedHealth = tutorialMap ? 28 : rng.int(30, 78);
    const health = saved?.health ?? generatedHealth;
    return {
      id,
      x: saved?.x ?? position.x,
      y: saved?.y ?? position.y,
      health,
      maxHealth: Math.max(generatedHealth, health),
      damage: tutorialMap ? 5 : rng.int(7, 16),
      name: tutorialMap ? 'повреждённый сервисный дрон' : rng.pick(enemyNames[point.type])
    };
  }).filter((enemy) => enemy.health > 0);

  const revealRadius = tutorialMap ? 5 : 3;
  for (const tile of tiles) if (Math.hypot(tile.x - player.x, tile.y - player.y) <= revealRadius) tile.revealed = true;
  if (locationState?.artifactTaken) {
    const artifactObject = objects.find((entry) => entry.kind === 'artifact');
    if (artifactObject) artifactObject.resolved = true;
  }
  for (const object of objects) {
    if (object.resolved) {
      const tile = tileAt(tiles, mapWidth, object.x, object.y);
      if (tile) tile.resolved = true;
    }
  }

  return {
    width: mapWidth,
    height: mapHeight,
    tiles,
    player,
    enemies,
    objects,
    artifactPosition: objects.find((entry) => entry.kind === 'artifact'),
    biome: rng.pick(biomeNames[planet.type]),
    hazardName: hazardNames[planet.type],
    baseTurns: tutorialMap ? 60 : point.danger === 'extreme' ? rng.int(30, 38) : point.danger === 'danger' ? rng.int(36, 46) : rng.int(44, 58),
    objectiveTitle: mission.title,
    objectiveDescription: mission.description,
    requiredObjectiveCount: Math.max(1, mission.requiredObjects)
  };
}
