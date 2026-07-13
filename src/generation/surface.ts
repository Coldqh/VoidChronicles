import type { EquipmentId, EvidenceDraft, LocationState, Planet, PointOfInterest } from '../game/types';
import { createRng } from './rng';

export type SurfaceTileKind = 'floor' | 'rock' | 'hazard' | 'ruin' | 'exit' | 'artifact' | 'evidence' | 'door' | 'terminal' | 'sample' | 'cover';
export interface SurfaceTile { x: number; y: number; kind: SurfaceTileKind; revealed: boolean; resolved?: boolean; }
export interface SurfaceEnemy { id: string; x: number; y: number; health: number; name: string; damage: number; }
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
  artifactPosition: { x: number; y: number };
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
  rocky: ['базальтовая равнина', 'каменный разлом'],
  ocean: ['плавающая платформа', 'приливный риф'],
  desert: ['песчаное плато', 'соляная пустошь'],
  ice: ['ледяная трещина', 'замёрзший каньон'],
  gas: ['орбитальная платформа', 'атмосферный коллектор'],
  toxic: ['кислотная низина', 'ядовитое болото'],
  jungle: ['плотные заросли', 'живой лес'],
  artificial: ['искусственный сектор', 'машинная поверхность'],
  anomalous: ['искажённая зона', 'пространственный карман']
};

const hazardNames: Record<Planet['type'], string> = {
  rocky: 'каменный обвал',
  ocean: 'прилив и давление',
  desert: 'пылевая буря',
  ice: 'переохлаждение',
  gas: 'разгерметизация',
  toxic: 'токсичная атмосфера',
  jungle: 'агрессивная биосфера',
  artificial: 'нестабильная энергетика',
  anomalous: 'аномальное воздействие'
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

export function generateSurface(seed: string, planet: Planet, point: PointOfInterest, locationState?: LocationState, width = 22, height = 15): SurfaceMap {
  const rng = createRng(`${seed}:surface:${point.id}`);
  const tiles: SurfaceTile[] = [];
  const centerY = Math.floor(height / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let kind: SurfaceTileKind = 'floor';
      const roll = rng.next();
      if (roll < 0.13) kind = 'rock';
      else if (roll < 0.21) kind = 'hazard';
      else if (roll < 0.27) kind = 'cover';
      else if (roll < 0.34) kind = 'ruin';
      tiles.push({ x, y, kind, revealed: Math.hypot(x - 1, y - centerY) < 4 || Boolean(locationState?.revealedTileKeys.includes(`${x}:${y}`)) });
    }
  }

  // Guaranteed traversable spine so random generation never creates an unwinnable map.
  for (let x = 0; x < width; x += 1) {
    const tile = tiles.find((entry) => entry.x === x && entry.y === centerY);
    if (tile) tile.kind = x === 1 ? 'exit' : 'floor';
  }
  for (let y = 2; y <= centerY; y += 1) {
    const tile = tiles.find((entry) => entry.x === width - 3 && entry.y === y);
    if (tile) tile.kind = 'floor';
  }

  const artifactPosition = { x: width - 3, y: 2 };
  const positions = [
    { x: Math.floor(width * 0.3), y: centerY },
    { x: Math.floor(width * 0.52), y: centerY },
    { x: Math.floor(width * 0.73), y: centerY },
    artifactPosition
  ];
  const objectKinds: SurfaceObject['kind'][] = ['door', 'terminal', 'sample', 'artifact'];
  const evidenceKinds: EvidenceDraft['kind'][] = ['architecture', 'terminal', 'sample', 'damage'];
  const objects: SurfaceObject[] = positions.map((position, index) => {
    const kind = objectKinds[index] ?? 'evidence';
    const tile = tiles.find((entry) => entry.x === position.x && entry.y === position.y);
    if (tile) tile.kind = kind === 'door' ? 'door' : kind === 'terminal' ? 'terminal' : kind === 'sample' ? 'sample' : 'artifact';
    const requiredEquipment: EquipmentId | undefined = kind === 'door'
      ? 'cutter'
      : kind === 'terminal'
        ? 'translator'
        : kind === 'sample'
          ? 'sampleContainer'
          : 'scanner';
    return {
      id: `object_${point.id}_${index}`,
      ...position,
      kind,
      title: kind === 'artifact' ? 'Центральная находка' : kind === 'door' ? 'Запечатанный проход' : kind === 'terminal' ? 'Архивный терминал' : 'Неизвестный образец',
      requiredEquipment,
      evidence: kind === 'door' ? evidenceFor(point, 'architecture', index) : evidenceFor(point, evidenceKinds[index] ?? 'signal', index),
      resolved: Boolean(locationState?.resolvedObjectIds.includes(`object_${point.id}_${index}`))
    };
  });

  const friendlySettlement = point.type === 'settlement' && Boolean(point.civilizationId);
  const dangerCount = friendlySettlement ? 0 : point.danger === 'extreme' ? 5 : point.danger === 'danger' ? 4 : point.danger === 'caution' ? 3 : 1;
  const enemies = Array.from({ length: dangerCount }, (_, index) => {
    const id = `enemy_${point.id}_${index}`;
    const saved = locationState?.enemyStates.find((entry) => entry.id === id);
    return {
      id,
      x: saved?.x ?? rng.int(Math.floor(width / 2), width - 2),
      y: saved?.y ?? rng.int(1, height - 2),
      health: saved?.health ?? rng.int(35, 70),
      damage: rng.int(8, 15),
      name: rng.pick(enemyNames[point.type])
    };
  }).filter((enemy) => enemy.health > 0);

  if (locationState?.artifactTaken) {
    const artifactObject = objects.find((entry) => entry.kind === 'artifact');
    if (artifactObject) artifactObject.resolved = true;
  }
  for (const object of objects) {
    if (object.resolved) {
      const tile = tiles.find((entry) => entry.x === object.x && entry.y === object.y);
      if (tile) tile.resolved = true;
    }
  }

  return {
    width,
    height,
    tiles,
    player: { x: 1, y: centerY },
    enemies,
    objects,
    artifactPosition,
    biome: rng.pick(biomeNames[planet.type]),
    hazardName: hazardNames[planet.type],
    baseTurns: point.danger === 'extreme' ? 28 : point.danger === 'danger' ? 34 : 42
  };
}
