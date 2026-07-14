import type { EquipmentId, EvidenceDraft, LocationState, Planet, PointOfInterest } from '../game/types';
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

function evidenceFor(point: PointOfInterest, kind: EvidenceDraft['kind'], index: number): EvidenceDraft {
  const records: Record<EvidenceDraft['kind'], string[]> = {
    record: ['частично восстановленная запись', 'личный журнал', 'служебный приказ'],
    body: ['останки с необычными повреждениями', 'тело в защитном костюме', 'мумифицированные останки'],
    weapon: ['оружие с чужой маркировкой', 'разряженный боевой модуль', 'следы направленного взрыва'],
    architecture: ['перестроенная стена', 'скрытый технический проход', 'чужой фундамент под комплексом'],
    sample: ['биологический образец', 'минеральный налёт', 'активная ткань'],
    terminal: ['повреждённый терминал', 'архивный узел', 'закрытый журнал доступа'],
    damage: ['следы внутренней атаки', 'оплавленный корпус', 'повреждение изнутри'],
    signal: ['повторяющийся сигнал', 'искажённая передача', 'закодированный маяк']
  };
  const description = records[kind][index % records[kind].length] ?? records[kind][0] ?? 'неизвестная улика';
  return {
    key: `${point.id}:${kind}:${index}`,
    kind,
    title: description[0]?.toUpperCase() + description.slice(1),
    description: `${description}. Улика связана с объектом «${point.name}» и противоречит его очевидной версии происхождения.`,
    reliability: 48 + (index * 13) % 43,
    tags: [point.type, kind]
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
  while (pool.length && selected.length < count) {
    selected.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  }
  return selected;
}

function edgeStart(width: number, height: number, rng: ReturnType<typeof createRng>) {
  const side = rng.int(0, 3);
  if (side === 0) return { x: 1, y: rng.int(1, height - 2) };
  if (side === 1) return { x: width - 2, y: rng.int(1, height - 2) };
  if (side === 2) return { x: rng.int(1, width - 2), y: 1 };
  return { x: rng.int(1, width - 2), y: height - 2 };
}

export function generateSurface(seed: string, planet: Planet, point: PointOfInterest, locationState?: LocationState, width?: number, height?: number): SurfaceMap {
  const rng = createRng(`${seed}:surface:v2:${point.id}`);
  const tutorialMap = planet.imageKey === 'tutorial-target';
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
      let kind: SurfaceTileKind = border ? 'rock' : roll < rockChance ? 'rock' : roll < rockChance + hazardChance ? 'hazard' : roll < rockChance + hazardChance + 0.08 ? 'cover' : roll < rockChance + hazardChance + 0.15 ? 'ruin' : 'floor';
      tiles.push({ x, y, kind, revealed: Boolean(locationState?.revealedTileKeys.includes(`${x}:${y}`)) });
    }
  }

  const player = tutorialMap ? { x: 1, y: Math.floor(mapHeight / 2) } : edgeStart(mapWidth, mapHeight, rng);
  const exitTile = tileAt(tiles, mapWidth, player.x, player.y);
  if (exitTile) exitTile.kind = 'exit';

  const interior = tiles.filter((tile) => tile.x > 1 && tile.y > 1 && tile.x < mapWidth - 2 && tile.y < mapHeight - 2);
  const farCandidates = interior.filter((tile) => Math.abs(tile.x - player.x) + Math.abs(tile.y - player.y) > Math.floor((mapWidth + mapHeight) * 0.28));
  const rewardCount = tutorialMap ? 2 : rng.int(1, Math.min(6, Math.max(2, point.possibleRewards.length + 2)));
  const objectPositions = tutorialMap
    ? [
        { x: Math.min(mapWidth - 3, player.x + 4), y: player.y },
        { x: mapWidth - 3, y: Math.max(2, player.y - 2) }
      ]
    : chooseDistinct(farCandidates.length ? farCandidates : interior, rewardCount, rng);
  objectPositions.forEach((position) => carvePath(tiles, mapWidth, player, position, rng));

  const objectKindPool: SurfaceObject['kind'][] = tutorialMap
    ? ['terminal', 'sample']
    : point.type === 'biosphere' ? ['sample', 'evidence', 'sample', 'terminal']
      : point.type === 'smugglerCamp' ? ['door', 'terminal', 'evidence', 'artifact']
        : point.type === 'cave' ? ['sample', 'evidence', 'artifact']
          : ['door', 'terminal', 'sample', 'evidence', 'artifact'];
  const evidenceKinds: EvidenceDraft['kind'][] = ['architecture', 'terminal', 'sample', 'damage', 'record', 'signal'];
  let artifactPlaced = false;
  const objects: SurfaceObject[] = objectPositions.map((position, index) => {
    let kind = tutorialMap ? objectKindPool[index] ?? 'evidence' : rng.pick(objectKindPool);
    if (kind === 'artifact' && (artifactPlaced || rng.chance(0.42))) kind = rng.pick(['terminal', 'sample', 'evidence'] as const);
    if (index === objectPositions.length - 1 && !tutorialMap && !artifactPlaced && point.possibleRewards.some((reward) => reward.includes('артефакт')) && rng.chance(0.72)) kind = 'artifact';
    if (kind === 'artifact') artifactPlaced = true;
    const tile = tileAt(tiles, mapWidth, position.x, position.y);
    if (tile) tile.kind = kind === 'door' ? 'door' : kind === 'terminal' ? 'terminal' : kind === 'sample' ? 'sample' : kind === 'artifact' ? 'artifact' : 'evidence';
    const requiredEquipment: EquipmentId | undefined = kind === 'door' ? 'cutter' : kind === 'terminal' ? 'translator' : kind === 'sample' ? 'sampleContainer' : kind === 'artifact' ? 'scanner' : 'scanner';
    const id = `object_${point.id}_${index}`;
    return {
      id,
      ...position,
      kind,
      title: kind === 'artifact' ? 'Неизвестная находка' : kind === 'door' ? 'Запечатанный проход' : kind === 'terminal' ? 'Узел данных' : kind === 'sample' ? 'Полевой образец' : 'След события',
      requiredEquipment,
      evidence: kind === 'door' ? evidenceFor(point, 'architecture', index) : evidenceFor(point, evidenceKinds[index % evidenceKinds.length]!, index),
      resolved: Boolean(locationState?.resolvedObjectIds.includes(id))
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
  for (const tile of tiles) {
    if (Math.hypot(tile.x - player.x, tile.y - player.y) <= revealRadius) tile.revealed = true;
  }
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
    baseTurns: tutorialMap ? 60 : point.danger === 'extreme' ? rng.int(26, 34) : point.danger === 'danger' ? rng.int(32, 42) : rng.int(40, 55)
  };
}
