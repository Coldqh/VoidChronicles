import type {
  Civilization,
  Contract,
  ContractType,
  Faction,
  Hub,
  MarketGood,
  NewsItem,
  StarSystem
} from '../game/types';
import { createRng } from '../generation/rng';

const factionKinds: Faction['kind'][] = ['government', 'corporation', 'university', 'cartel', 'tradeHouse', 'religious', 'pirates'];
const governmentNames = ['Союз Навигационных Миров', 'Администрация Внутреннего Кольца', 'Конкордат Свободных Орбит'];
const corporateNames = ['Helix Prospecting', 'Astra Meridian', 'Pale Star Logistics'];
const universityNames = ['Институт Дальних Эпох', 'Коллегия Ксенологии', 'Архивная Лига'];
const criminalNames = ['Картель Чёрного Каскада', 'Синдикат Пустых Трюмoв', 'Братство Красной Метки'];
const tradeNames = ['Дом Семнадцати Маршрутов', 'Гильдия Тихих Доков', 'Караван Синей Нити'];
const religiousNames = ['Орден Последнего Света', 'Хранители Первой Памяти', 'Церковь Спящего Океана'];
const pirateNames = ['Флот Без Флага', 'Стаи Кривой Орбиты', 'Корсары Мёртвого Солнца'];
const hubPrefixes = ['Порт', 'Станция', 'Анклав', 'Колония', 'Док', 'Свободный город'];
const hubSuffixes = ['Рассвет', 'Меридиан', 'Предел', 'Тихая Орбита', 'Ковчег', 'Кассини', 'Латунный Берег'];

function pickFactionName(kind: Faction['kind'], rng: ReturnType<typeof createRng>): string {
  const pool = kind === 'government' ? governmentNames
    : kind === 'corporation' ? corporateNames
      : kind === 'university' ? universityNames
        : kind === 'cartel' ? criminalNames
          : kind === 'tradeHouse' ? tradeNames
            : kind === 'religious' ? religiousNames
              : pirateNames;
  return rng.pick(pool);
}

function dispositionFor(kind: Faction['kind']): Faction['disposition'] {
  if (kind === 'pirates') return 'hostile';
  if (kind === 'cartel') return 'wary';
  if (kind === 'government' || kind === 'university' || kind === 'tradeHouse') return 'friendly';
  return 'neutral';
}

function lawsFor(kind: Faction['kind']): string[] {
  if (kind === 'government') return ['лицензия на оружие', 'запрет тяжёлых наркотиков', 'обязательный досмотр'];
  if (kind === 'corporation') return ['защита коммерческих данных', 'налог на добычу'];
  if (kind === 'university') return ['регистрация артефактов', 'карантин биологических образцов'];
  if (kind === 'religious') return ['запрет осквернения святынь', 'контроль древних останков'];
  if (kind === 'cartel') return ['дань за маршрут', 'запрет работы с конкурентами'];
  return [];
}

function makeFaction(index: number, civilization: Civilization | undefined, rng: ReturnType<typeof createRng>): Faction {
  const kind = civilization && index < 3 ? (index === 0 ? 'government' : index === 1 ? 'tradeHouse' : 'university') : rng.pick(factionKinds);
  const disposition = dispositionFor(kind);
  return {
    id: `faction_${index}`,
    name: civilization ? `${civilization.name}: ${pickFactionName(kind, rng)}` : pickFactionName(kind, rng),
    kind,
    civilizationId: civilization?.id,
    disposition,
    reputation: disposition === 'friendly' ? 18 : disposition === 'hostile' ? -35 : 0,
    wealth: rng.int(30, 95),
    military: rng.int(20, 90),
    research: rng.int(15, 95),
    laws: lawsFor(kind),
    allies: [],
    enemies: [],
    memories: []
  };
}

function makeHub(index: number, system: StarSystem, faction: Faction, rng: ReturnType<typeof createRng>): Hub {
  const friendly = faction.disposition !== 'hostile';
  const kind: Hub['kind'] = system.region === 'core' ? 'station' : rng.pick(['station', 'colony', 'freeport', 'settlement']);
  return {
    id: `hub_${system.id}_${index}`,
    systemId: system.id,
    factionId: faction.id,
    civilizationId: faction.civilizationId,
    name: `${rng.pick(hubPrefixes)} «${rng.pick(hubSuffixes)}»`,
    kind,
    population: rng.int(system.region === 'core' ? 80_000 : 900, system.region === 'core' ? 4_000_000 : 240_000),
    safety: friendly ? (system.region === 'core' ? 'safe' : 'caution') : 'danger',
    services: friendly
      ? ['contracts', 'trade', 'repair', 'fuel', 'crew', 'news']
      : ['blackMarket', 'contracts', 'crew'],
    description: friendly
      ? 'Рабочий порт с гражданскими доками, рынком, связью и охраной. Местные не открывают огонь без причины.'
      : 'Полулегальный узел, где власть держится на долгах, оружии и личных договорённостях.',
    visited: false,
    docked: false,
    inspectionLevel: faction.kind === 'government' ? 70 : faction.kind === 'corporation' ? 45 : 12,
    marketSeed: `${system.id}:${faction.id}:${index}`
  };
}

const contractTypes: ContractType[] = ['survey', 'recovery', 'delivery', 'bounty', 'smuggling', 'rescue'];

function contractTitle(type: ContractType): string {
  return type === 'survey' ? 'Проверить неизвестный сигнал'
    : type === 'recovery' ? 'Вернуть архивный модуль'
      : type === 'delivery' ? 'Доставить защищённый груз'
        : type === 'bounty' ? 'Зачистить вооружённую группу'
          : type === 'smuggling' ? 'Провести запрещённый товар'
            : 'Найти пропавшую экспедицию';
}

export function generateContracts(seed: string, hubs: Hub[], systems: StarSystem[], gameYear: number, count = 18): Contract[] {
  const rng = createRng(`${seed}:contracts:${gameYear}`);
  const friendlyHubs = hubs.filter((hub) => hub.safety !== 'danger');
  if (friendlyHubs.length === 0 || systems.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const issuer = rng.pick(friendlyHubs);
    const type = rng.pick(contractTypes);
    const targetSystem = rng.pick(systems.filter((system) => system.id !== issuer.systemId).length
      ? systems.filter((system) => system.id !== issuer.systemId)
      : systems);
    const illegal = type === 'smuggling';
    const reward = rng.int(illegal ? 1200 : 450, illegal ? 3200 : 2100);
    return {
      id: `contract_${gameYear}_${index}_${issuer.id}`,
      type,
      status: 'available',
      issuerHubId: issuer.id,
      issuerFactionId: issuer.factionId,
      title: contractTitle(type),
      description: type === 'survey'
        ? `Провести детальный скан в системе ${targetSystem.name} и передать результаты.`
        : type === 'recovery'
          ? `Высадиться в системе ${targetSystem.name}, найти объект и вернуть доказательства.`
          : type === 'delivery'
            ? `Доставить контейнер в систему ${targetSystem.name}. Вскрытие запрещено.`
            : type === 'bounty'
              ? `Уничтожить минимум трёх вооружённых противников в системе ${targetSystem.name}.`
              : type === 'smuggling'
                ? `Провести нелегальный груз в систему ${targetSystem.name}, минуя досмотр.`
                : `Найти следы пропавшей группы в системе ${targetSystem.name}.`,
      reward,
      advance: Math.round(reward * 0.15),
      deadlineYear: gameYear + rng.int(4, 14),
      acceptedYear: undefined,
      completedYear: undefined,
      targetSystemId: targetSystem.id,
      progress: 0,
      requiredProgress: type === 'bounty' ? 3 : 1,
      illegal,
      hiddenClause: rng.chance(0.35) ? 'Заказчик не сообщил всю правду о цели.' : undefined,
      cargoId: type === 'delivery' || type === 'smuggling' ? `contract_cargo_${gameYear}_${index}` : undefined
    };
  });
}

const marketTemplates: Omit<MarketGood, 'id' | 'price' | 'stock'>[] = [
  { name: 'Топливные ячейки', category: 'fuel', basePrice: 90, illegal: false },
  { name: 'Медицинские наборы', category: 'medicine', basePrice: 180, illegal: false },
  { name: 'Корабельные детали', category: 'parts', basePrice: 260, illegal: false },
  { name: 'Научное оборудование', category: 'science', basePrice: 420, illegal: false },
  { name: 'Военные боеприпасы', category: 'weapons', basePrice: 330, illegal: false },
  { name: 'Синтетический опиат «Резонанс»', category: 'drugs', basePrice: 760, illegal: true },
  { name: 'Запрещённые нейрочипы', category: 'contraband', basePrice: 980, illegal: true }
];

export function generateMarket(hub: Hub, gameYear: number): MarketGood[] {
  const rng = createRng(`${hub.marketSeed}:market:${Math.floor(gameYear / 3)}`);
  return marketTemplates.map((template, index) => ({
    ...template,
    id: `market_${hub.id}_${index}`,
    price: Math.max(20, Math.round(template.basePrice * 0.72 + rng.next() * 0.73)),
    stock: rng.int(template.illegal ? 1 : 3, template.illegal ? 5 : 16)
  }));
}

export function initializeLivingGalaxy(galaxy: { seed: string; systems: StarSystem[]; civilizations: Civilization[] }): {
  factions: Faction[];
  hubs: Hub[];
  contracts: Contract[];
  news: NewsItem[];
} {
  const rng = createRng(`${galaxy.seed}:living-galaxy`);
  const livingCivilizations = galaxy.civilizations.filter((civilization) => civilization.status === 'living');
  const factionCount = Math.max(6, Math.min(14, livingCivilizations.length + 5));
  const factions = Array.from({ length: factionCount }, (_, index) => makeFaction(index, livingCivilizations[index % Math.max(1, livingCivilizations.length)], rng));
  factions.forEach((faction, index) => {
    const next = factions[(index + 1) % factions.length];
    const rival = factions[(index + Math.ceil(factions.length / 2)) % factions.length];
    if (next && next.id !== faction.id) faction.allies = [next.id];
    if (rival && rival.id !== faction.id) faction.enemies = [rival.id];
  });

  const candidateSystems = galaxy.systems
    .filter((system) => system.region === 'core' || system.civilizationIds.length > 0)
    .sort((a, b) => (a.region === 'core' ? -1 : 1) - (b.region === 'core' ? -1 : 1));
  const hubSystems = candidateSystems.slice(0, Math.max(5, Math.min(16, candidateSystems.length)));
  const hubs = hubSystems.map((system, index) => {
    const civilizationFaction = factions.find((faction) => faction.civilizationId && system.civilizationIds.includes(faction.civilizationId));
    const faction = civilizationFaction ?? factions[index % factions.length]!;
    system.factionId = faction.id;
    return makeHub(index, system, faction, rng);
  });
  const startSystem = galaxy.systems.find((system) => system.id === (galaxy as { startSystemId?: string }).startSystemId) ?? galaxy.systems[0];
  if (startSystem && !hubs.some((hub) => hub.systemId === startSystem.id)) {
    const friendly = factions.find((faction) => faction.disposition === 'friendly') ?? factions[0]!;
    startSystem.factionId = friendly.id;
    hubs.unshift(makeHub(99, startSystem, friendly, rng));
  }

  const contracts = generateContracts(galaxy.seed, hubs, galaxy.systems, 0);
  const news: NewsItem[] = [
    {
      id: 'news_start_0',
      year: 0,
      sourceHubId: hubs[0]?.id,
      headline: 'Навигационные каналы открыты для частных капитанов',
      text: 'Гражданские порты публикуют первые исследовательские и транспортные контракты.',
      category: 'trade',
      reliability: 92,
      systemIds: hubs.slice(0, 3).map((hub) => hub.systemId)
    },
    {
      id: 'news_start_1',
      year: 0,
      headline: 'На границе отмечена активность вооружённых групп',
      text: 'Власти предупреждают: неизвестный контакт не всегда является враждебным, но отказ отвечать на запрос увеличивает риск боя.',
      category: 'security',
      reliability: 78,
      systemIds: []
    }
  ];
  return { factions, hubs, contracts, news };
}

export function generateNews(seed: string, systems: StarSystem[], hubs: Hub[], gameYear: number, index: number): NewsItem {
  const rng = createRng(`${seed}:news:${gameYear}:${index}`);
  const system = rng.pick(systems);
  const hub = hubs.find((entry) => entry.systemId === system.id);
  const variants = [
    ['security', 'Локальный конфликт нарушил движение', `В системе ${system.name} отмечены перестрелки и задержки гражданских рейсов.`],
    ['discovery', 'Найдены следы неизвестной культуры', `Исследователи сообщают о новых объектах в системе ${system.name}.`],
    ['trade', 'Изменился спрос на топливо и детали', `Торговые дома корректируют цены на маршрутах рядом с ${system.name}.`],
    ['politics', 'Фракции заключили временное соглашение', `Представители местных сил договорились о безопасном проходе через ${system.name}.`]
  ] as const;
  const [category, headline, text] = rng.pick(variants);
  return {
    id: `news_${gameYear}_${index}_${system.id}`,
    year: gameYear,
    sourceHubId: hub?.id,
    headline,
    text,
    category,
    reliability: rng.int(55, 96),
    systemIds: [system.id]
  };
}
