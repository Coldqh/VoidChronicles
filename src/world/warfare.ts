import type {
  Faction,
  PursuitRecord,
  ShipContact,
  ShipEncounterState,
  ShipSystemId,
  ShipSystemState,
  StarSystem,
  WarFront
} from '../game/types';
import { createRng } from '../generation/rng';

const systemLabels: Record<ShipSystemId, string> = {
  engine: 'Двигатель',
  reactor: 'Реактор',
  weapons: 'Вооружение',
  sensors: 'Сенсоры',
  comms: 'Связь',
  lifeSupport: 'Жизнеобеспечение',
  cargo: 'Грузовой отсек'
};

const systemEffects: Record<ShipSystemId, string> = {
  engine: 'манёвры и аварийный прыжок',
  reactor: 'энергия для всех систем',
  weapons: 'точность и урон',
  sensors: 'анализ цели и уклонение',
  comms: 'переговоры и помехи',
  lifeSupport: 'выживание экипажа',
  cargo: 'сохранность груза'
};

export function createShipSystems(integrity = 100): ShipSystemState[] {
  return (Object.keys(systemLabels) as ShipSystemId[]).map((id) => ({
    id,
    label: systemLabels[id],
    integrity,
    maxIntegrity: 100,
    disabled: integrity <= 0,
    effect: systemEffects[id]
  }));
}

export function normalizeShipSystems(systems?: ShipSystemState[]): ShipSystemState[] {
  const source = systems ?? [];
  return createShipSystems().map((fallback) => {
    const current = source.find((entry) => entry.id === fallback.id);
    if (!current) return fallback;
    const integrity = Math.max(0, Math.min(current.maxIntegrity || 100, current.integrity));
    return { ...fallback, ...current, integrity, maxIntegrity: current.maxIntegrity || 100, disabled: integrity <= 0 || current.disabled };
  });
}

export function initializeWarFronts(seed: string, factions: Faction[], systems: StarSystem[], year = 0): WarFront[] {
  if (factions.length < 2 || systems.length === 0) return [];
  const rng = createRng(`${seed}:war-fronts`);
  const candidates = factions.filter((entry) => entry.enemies.length > 0 || entry.kind === 'government' || entry.kind === 'pirates');
  const count = Math.min(4, Math.max(1, Math.floor(factions.length / 4)));
  const fronts: WarFront[] = [];
  for (let index = 0; index < count; index += 1) {
    const attacker = candidates[index % Math.max(1, candidates.length)] ?? factions[index % factions.length]!;
    const defender = factions.find((entry) => attacker.enemies.includes(entry.id)) ?? factions[(index + 1) % factions.length]!;
    if (!defender || defender.id === attacker.id) continue;
    const contested = systems
      .filter((system) => system.factionId === attacker.id || system.factionId === defender.id || system.region !== 'core')
      .sort(() => rng.next() - 0.5)
      .slice(0, rng.int(2, 5));
    if (!contested.length) contested.push(rng.pick(systems));
    fronts.push({
      id: `war_${attacker.id}_${defender.id}_${index}`,
      attackerFactionId: attacker.id,
      defenderFactionId: defender.id,
      systemIds: contested.map((entry) => entry.id),
      intensity: rng.int(25, 78),
      startedYear: year - rng.int(1, 12),
      lastUpdateYear: year,
      status: rng.chance(0.72) ? 'active' : 'cold',
      attackerScore: rng.int(0, 4),
      defenderScore: rng.int(0, 4)
    });
  }
  return fronts;
}

export function advanceWarFronts(seed: string, fronts: WarFront[], year: number): WarFront[] {
  return fronts.map((front) => {
    if (front.status === 'resolved' || year <= front.lastUpdateYear) return front;
    const rng = createRng(`${seed}:${front.id}:${year}`);
    const elapsed = Math.max(1, year - front.lastUpdateYear);
    let attackerScore = front.attackerScore;
    let defenderScore = front.defenderScore;
    if (rng.chance(0.5)) attackerScore += rng.int(0, elapsed);
    else defenderScore += rng.int(0, elapsed);
    const gap = Math.abs(attackerScore - defenderScore);
    const status: WarFront['status'] = gap >= 9 ? 'resolved' : rng.chance(0.08) ? 'ceasefire' : front.intensity > 35 ? 'active' : 'cold';
    return {
      ...front,
      attackerScore,
      defenderScore,
      intensity: Math.max(8, Math.min(100, front.intensity + rng.int(-8, 12))),
      status,
      lastUpdateYear: year
    };
  });
}

function contactIdentity(kind: ShipContact['kind'], rng: ReturnType<typeof createRng>): { name: string; demand: string; intent: ShipContact['intent']; hostile: boolean } {
  if (kind === 'patrol') return { name: `Патруль «${rng.pick(['Гранит', 'Сигма', 'Копьё', 'Север'])}»`, demand: 'Передать регистрацию, маршрут и манифест груза.', intent: 'inspection', hostile: false };
  if (kind === 'pirate') return { name: `Рейдер «${rng.pick(['Клык', 'Молот', 'Чёрный прилив', 'Пепел'])}»`, demand: 'Заглушить двигатель и передать груз.', intent: 'robbery', hostile: true };
  if (kind === 'bountyHunter') return { name: `Охотник «${rng.pick(['Немезида', 'Резак', 'Слепой судья'])}»`, demand: 'Сдаться для передачи заказчику.', intent: 'hunt', hostile: true };
  if (kind === 'military') return { name: `Фрегат «${rng.pick(['Долг', 'Знамя', 'Рубеж'])}»`, demand: 'Покинуть военный коридор или подчиниться досмотру.', intent: 'inspection', hostile: false };
  if (kind === 'trader') return { name: `Караван «${rng.pick(['Вектор', 'Ладья', 'Содружество'])}»`, demand: 'Предлагает обмен топливом и навигационными данными.', intent: 'trade', hostile: false };
  if (kind === 'refugee') return { name: `Ковчег «${rng.pick(['Последний дом', 'Тихий берег', 'Надежда'])}»`, demand: 'Просит медикаменты и безопасный маршрут.', intent: 'distress', hostile: false };
  if (kind === 'wreck') return { name: 'Дрейфующий корабль без ответа', demand: 'Сигнал аварии повторяется автоматически.', intent: 'distress', hostile: false };
  if (kind === 'researcher') return { name: `Экспедиция «${rng.pick(['Априори', 'Меридиан', 'Тезис'])}»`, demand: 'Предлагает обмен результатами наблюдений.', intent: 'trade', hostile: false };
  if (kind === 'smuggler') return { name: `Транспорт «${rng.pick(['Серый канал', 'Ложный свет', 'Пилигрим'])}»`, demand: 'Предлагает закрытую сделку без регистрации.', intent: 'trade', hostile: false };
  return { name: 'Неизвестный корабль', demand: 'Передача не расшифрована.', intent: 'unknown', hostile: false };
}

export function createTravelEncounter(args: {
  seed: string;
  system: StarSystem;
  factions: Faction[];
  pursuits: PursuitRecord[];
  warFronts: WarFront[];
  year: number;
  serial: number;
}): ShipEncounterState | null {
  const { seed, system, factions, pursuits, warFronts, year, serial } = args;
  const activePursuit = pursuits.find((entry) => entry.status === 'active' && entry.intensity >= 30);
  const war = warFronts.find((entry) => entry.status === 'active' && entry.systemIds.includes(system.id));
  const faction = factions.find((entry) => entry.id === system.factionId);
  const rng = createRng(`${seed}:ship-contact:${system.id}:${year}:${serial}`);
  const dangerChance = system.danger === 'extreme' ? 0.72 : system.danger === 'danger' ? 0.48 : system.danger === 'caution' ? 0.28 : 0.14;
  const chance = Math.min(0.92, dangerChance + (activePursuit ? activePursuit.intensity / 180 : 0) + (war ? war.intensity / 250 : 0));
  if (!rng.chance(chance)) return null;

  let kind: ShipContact['kind'];
  if (activePursuit && rng.chance(0.68)) kind = 'bountyHunter';
  else if (war && rng.chance(0.68)) kind = 'military';
  else if (faction?.kind === 'pirates' || faction?.disposition === 'hostile') kind = 'pirate';
  else kind = rng.pick<ShipContact['kind']>(['patrol', 'trader', 'refugee', 'wreck', 'researcher', 'smuggler', 'unknown']);

  const identity = contactIdentity(kind, rng);
  const threat = kind === 'pirate' || kind === 'bountyHunter' ? rng.int(58, 92) : kind === 'military' ? rng.int(45, 86) : rng.int(8, 42);
  const hostile = identity.hostile || (kind === 'military' && war !== undefined && rng.chance(0.42));
  const contact: ShipContact = {
    id: `contact_${system.id}_${year}_${serial}`,
    kind,
    intent: identity.intent,
    name: identity.name,
    factionId: faction?.id ?? activePursuit?.sourceFactionId,
    systemId: system.id,
    threat,
    demand: identity.demand,
    description: hostile ? 'Орудийные системы активны. Корабль удерживает боевой курс.' : 'Контакт держит дистанцию и ожидает ответа.',
    knowsIdentity: Boolean(activePursuit?.knownIdentity || kind === 'patrol' || kind === 'military'),
    knowsTransponder: Boolean(activePursuit?.knownTransponder || kind === 'patrol' || kind === 'military'),
    hostile
  };
  const enemyHull = 62 + Math.round(threat * 0.55);
  const enemyIntegrity = Math.max(45, Math.min(100, 55 + Math.round(threat * 0.45)));
  return {
    id: `encounter_${contact.id}`,
    phase: 'contact',
    contact,
    range: rng.pick([2, 3, 4] as const),
    turn: 0,
    playerInitiative: rng.chance(0.55),
    enemy: {
      name: contact.name,
      hull: enemyHull,
      maxHull: enemyHull,
      systems: createShipSystems(enemyIntegrity),
      crew: rng.int(3, 14),
      morale: rng.int(45, 90),
      cargoValue: rng.int(350, 2600)
    },
    combatLog: [`Обнаружен контакт: ${contact.name}.`, contact.demand],
    brace: false,
    evasion: 0,
    canBoard: false,
    boardingProgress: 0,
    stationAssignments: {}
  };
}

export function damageSystem(systems: ShipSystemState[], id: ShipSystemId, amount: number): ShipSystemState[] {
  return systems.map((entry) => {
    if (entry.id !== id) return entry;
    const integrity = Math.max(0, entry.integrity - Math.max(0, amount));
    return { ...entry, integrity, disabled: integrity <= 0 };
  });
}

export function systemIntegrity(systems: ShipSystemState[], id: ShipSystemId): number {
  return systems.find((entry) => entry.id === id)?.integrity ?? 0;
}
