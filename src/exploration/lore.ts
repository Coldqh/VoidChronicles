import type {
  Artifact,
  DangerLevel,
  EquipmentId,
  ExpeditionObjective,
  Galaxy,
  Planet,
  PointOfInterest,
  PointOfInterestAccess,
  PointOfInterestType,
  StarSystem
} from '../game/types';
import type {
  DeepHistoricalSettlement,
  DeepTimeEvent,
  DeepTimeRuin,
  DeepTimeWar
} from '../deeptime/types';
import { createRng, stableHash } from '../generation/rng';

export interface ExpeditionLoreSource {
  key: string;
  name: string;
  type: PointOfInterestType;
  civilizationId?: string;
  age: number;
  origin: string;
  publicSummary: string;
  confirmedSummary: string;
  truth: string;
  requiredEquipment: EquipmentId[];
  possibleRewards: string[];
  danger: DangerLevel;
  access: PointOfInterestAccess;
  sourceEventIds: string[];
  historicalSettlementId?: string;
  ruinId?: string;
  warId?: string;
  artifactIds: string[];
  figureIds: string[];
  polityIds: string[];
  loreTags: string[];
  objective: ExpeditionObjective;
}

const unique = (values: Array<string | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

const ageFromYear = (year: number): number => Math.max(1, Math.abs(Math.min(0, year)));

function assignedPlanetId(system: StarSystem, key: string): string | undefined {
  const candidates = system.planets.filter((planet) => planet.type !== 'gas');
  const pool = candidates.length ? candidates : system.planets;
  if (!pool.length) return undefined;
  const index = parseInt(stableHash(key), 36) % pool.length;
  return pool[index]?.id;
}

function belongsToPlanet(system: StarSystem, planet: Planet, key: string, explicitPlanetId?: string): boolean {
  return explicitPlanetId ? explicitPlanetId === planet.id : assignedPlanetId(system, key) === planet.id;
}

function dangerFromSeverity(severity: number, planet: Planet): DangerLevel {
  const base = planet.danger === 'extreme' ? 2 : planet.danger === 'danger' ? 1 : 0;
  const score = severity + base;
  if (score >= 10) return 'extreme';
  if (score >= 7) return 'danger';
  if (score >= 4) return 'caution';
  return 'safe';
}

function accessFor(type: PointOfInterestType, planet: Planet, key: string): PointOfInterestAccess {
  const rng = createRng(`lore-access:${key}`);
  if (planet.type === 'gas') return type === 'anomaly' ? 'remote' : 'orbital';
  if (type === 'wreck' || type === 'distress') return rng.chance(0.34) ? 'orbital' : 'surface';
  if (type === 'anomaly') return rng.chance(0.5) ? 'remote' : rng.chance(0.45) ? 'orbital' : 'surface';
  if (type === 'laboratory' && ['ocean', 'artificial'].includes(planet.type)) return rng.chance(0.24) ? 'orbital' : 'surface';
  return 'surface';
}

function requiredFor(type: PointOfInterestType, objective: ExpeditionObjective): EquipmentId[] {
  const base: Record<PointOfInterestType, EquipmentId[]> = {
    ruin: ['scanner', 'translator', 'cutter'],
    wreck: ['scanner', 'cutter', 'oxygen'],
    settlement: ['translator', 'scanner'],
    laboratory: ['scanner', 'sampleContainer', 'cutter'],
    cave: ['scanner', 'oxygen'],
    ancientFactory: ['scanner', 'cutter', 'explosives'],
    graveyard: ['scanner', 'sampleContainer'],
    smugglerCamp: ['rifle', 'armor', 'scanner'],
    anomaly: ['scanner', 'armor'],
    biosphere: ['sampleContainer', 'scanner', 'armor'],
    distress: ['medkit', 'scanner', 'oxygen']
  };
  const objectiveGear: Partial<Record<ExpeditionObjective['kind'], EquipmentId[]>> = {
    'recover-artifact': ['scanner', 'cutter'],
    'restore-archive': ['translator', 'scanner'],
    'determine-cause': ['scanner'],
    'recover-black-box': ['cutter', 'scanner'],
    'rescue-survivors': ['medkit', 'oxygen'],
    'collect-sample': ['sampleContainer', 'scanner'],
    'disable-system': ['cutter', 'explosives'],
    'document-site': ['scanner'],
    'establish-contact': ['translator', 'scanner'],
    'investigate-anomaly': ['scanner', 'armor']
  };
  return unique([...(objectiveGear[objective.kind] ?? []), ...base[type]]).slice(0, 4) as EquipmentId[];
}

function objective(params: {
  kind: ExpeditionObjective['kind'];
  targetName: string;
  artifactName?: string;
  requiredObjects?: number;
  requiredEvidence?: number;
}): ExpeditionObjective {
  const requiredObjects = params.requiredObjects ?? 1;
  const requiredEvidence = params.requiredEvidence ?? 1;
  const common = { requiredObjects, requiredEvidence };
  switch (params.kind) {
    case 'recover-artifact':
      return { ...common, kind: params.kind, title: `Извлечь ${params.artifactName ?? 'связанный объект'}`, description: `Найти подтверждённое хранилище и вынести предмет, связанный с «${params.targetName}».`, requiresArtifact: true, completionText: 'Предмет извлечён, а его место в истории подтверждено.' };
    case 'restore-archive':
      return { ...common, kind: params.kind, title: 'Восстановить архив', description: `Запустить уцелевшие узлы данных объекта «${params.targetName}» и получить непротиворечивую запись.`, completionText: 'Архив восстановлен; записи добавлены в известную Хронику.' };
    case 'determine-cause':
      return { ...common, kind: params.kind, title: 'Установить причину гибели', description: `Собрать независимые следы и проверить, что произошло с объектом «${params.targetName}».`, completionText: 'Причина гибели подтверждена несколькими независимыми уликами.' };
    case 'recover-black-box':
      return { ...common, kind: params.kind, title: 'Восстановить чёрный ящик', description: `Добраться до регистратора объекта «${params.targetName}» и извлечь журнал последних событий.`, completionText: 'Последний журнал восстановлен и привязан к историческому событию.' };
    case 'rescue-survivors':
      return { ...common, kind: params.kind, title: 'Найти выживших', description: `Проверить аварийные отсеки «${params.targetName}» и вывести обнаруженных людей к точке эвакуации.`, completionText: 'Сигналы живых подтверждены; группа эвакуирована.' };
    case 'collect-sample':
      return { ...common, kind: params.kind, title: 'Изолировать образцы', description: `Получить пригодные образцы в районе «${params.targetName}» и не загрязнить исходную среду.`, completionText: 'Образцы изолированы и снабжены полевыми данными.' };
    case 'disable-system':
      return { ...common, kind: params.kind, title: 'Остановить автономную систему', description: `Найти управляющие контуры «${params.targetName}» и безопасно прекратить их работу.`, completionText: 'Управляющий контур отключён; объект больше не выполняет старый приказ.' };
    case 'establish-contact':
      return { ...common, kind: params.kind, title: 'Установить локальный контакт', description: `Найти рабочий канал поселения «${params.targetName}» и подтвердить намерения жителей.`, completionText: 'Канал подтверждён; происхождение и статус поселения установлены.' };
    case 'investigate-anomaly':
      return { ...common, kind: params.kind, title: 'Определить природу аномалии', description: `Провести несколько независимых измерений в зоне «${params.targetName}».`, completionText: 'Поведение аномалии зафиксировано и отделено от ошибок приборов.' };
    default:
      return { ...common, kind: 'document-site', title: 'Задокументировать объект', description: `Собрать доказательства происхождения объекта «${params.targetName}».`, completionText: 'Объект описан и привязан к истории региона.' };
  }
}

function eventType(event: DeepTimeEvent): PointOfInterestType {
  if (event.kind === 'war') return 'graveyard';
  if (event.kind === 'extinction' || event.kind === 'collapse' || event.kind === 'state-collapse') return 'ruin';
  if (event.kind === 'discovery' || event.kind === 'technology-transfer') return 'laboratory';
  if (event.kind === 'first-contact' || event.kind === 'trade') return 'settlement';
  if (event.kind === 'migration') return 'distress';
  return 'ruin';
}

function eventObjective(event: DeepTimeEvent, artifactName?: string): ExpeditionObjective {
  if (artifactName) return objective({ kind: 'recover-artifact', targetName: event.title, artifactName, requiredEvidence: 2 });
  if (event.kind === 'discovery' || event.kind === 'technology-transfer') return objective({ kind: 'restore-archive', targetName: event.title, requiredObjects: 2, requiredEvidence: 2 });
  if (event.kind === 'first-contact' || event.kind === 'trade') return objective({ kind: 'document-site', targetName: event.title, requiredObjects: 2, requiredEvidence: 2 });
  if (event.kind === 'migration') return objective({ kind: 'recover-black-box', targetName: event.title, requiredEvidence: 2 });
  return objective({ kind: 'determine-cause', targetName: event.title, requiredObjects: 3, requiredEvidence: 3 });
}

function sourceFromRuin(galaxy: Galaxy, system: StarSystem, planet: Planet, ruin: DeepTimeRuin): ExpeditionLoreSource | undefined {
  if (!belongsToPlanet(system, planet, ruin.id, ruin.planetId)) return undefined;
  const deep = galaxy.deepTime;
  const settlement = deep?.historicalSettlements?.find((entry) => entry.id === ruin.settlementId);
  const linkedEvents = deep?.events.filter((event) => event.settlementIds?.includes(ruin.settlementId)) ?? [];
  const linkedWar = deep?.wars?.find((war) => war.settlementIds.includes(ruin.settlementId));
  const artifactIds = unique([...ruin.artifactIds, ...linkedEvents.flatMap((event) => event.artifactIds ?? [])]);
  const artifact = artifactIds.map((id) => galaxy.artifacts.find((entry) => entry.id === id)).find(Boolean);
  const targetName = settlement?.name ?? `руины в системе ${system.name}`;
  const hasArchive = ruin.remains.some((entry) => /архив|запис|терминал|данн/i.test(entry));
  const mission = artifact
    ? objective({ kind: 'recover-artifact', targetName, artifactName: artifact.name, requiredEvidence: 2 })
    : hasArchive
      ? objective({ kind: 'restore-archive', targetName, requiredObjects: 2, requiredEvidence: 2 })
      : objective({ kind: 'determine-cause', targetName, requiredObjects: 3, requiredEvidence: 3 });
  const name = artifact
    ? `Хранилище «${artifact.name}» в руинах ${targetName}`
    : hasArchive
      ? `Разрушенный архив ${targetName}`
      : `Руины ${targetName}`;
  return {
    key: `ruin:${ruin.id}`,
    name,
    type: hasArchive ? 'ruin' : ruin.remains.some((entry) => /остан|захорон|саркоф/i.test(entry)) ? 'graveyard' : 'ruin',
    civilizationId: ruin.civilizationId,
    age: ageFromYear(ruin.createdYear),
    origin: ruin.cause,
    publicSummary: `Подтверждены остатки объекта ${settlement ? `цивилизации ${galaxy.civilizations.find((entry) => entry.id === ruin.civilizationId)?.name ?? ruin.civilizationId}` : 'неустановленного происхождения'}. Целостность оценивается в ${Math.round(ruin.integrity / 10) * 10}%.`,
    confirmedSummary: `${targetName} прекратил существование из-за: ${ruin.cause}. Уцелели: ${ruin.remains.join(', ') || 'разрозненные конструкции'}.`,
    truth: linkedEvents.length ? linkedEvents.map((event) => `${event.title}: ${event.summary}`).join(' ') : `${targetName}: ${ruin.cause}.`,
    requiredEquipment: requiredFor('ruin', mission),
    possibleRewards: artifact ? [artifact.name, 'архивные записи', 'подтверждение события'] : ['архивные записи', 'исторические свидетельства', 'координаты связанных объектов'],
    danger: dangerFromSeverity(Math.max(4, ...linkedEvents.map((event) => event.severity)), planet),
    access: accessFor('ruin', planet, ruin.id),
    sourceEventIds: linkedEvents.map((event) => event.id),
    historicalSettlementId: settlement?.id,
    ruinId: ruin.id,
    warId: linkedWar?.id,
    artifactIds,
    figureIds: unique(linkedEvents.flatMap((event) => event.figureIds ?? [])),
    polityIds: unique(linkedEvents.flatMap((event) => event.polityIds)),
    loreTags: unique(['deep-history', 'ruin', linkedWar ? 'war' : undefined, artifact ? 'artifact' : undefined]),
    objective: mission
  };
}

function sourceFromSettlement(galaxy: Galaxy, system: StarSystem, planet: Planet, settlement: DeepHistoricalSettlement): ExpeditionLoreSource | undefined {
  if (!belongsToPlanet(system, planet, settlement.id, settlement.planetId)) return undefined;
  const deep = galaxy.deepTime;
  if (deep?.ruins?.some((ruin) => ruin.settlementId === settlement.id)) return undefined;
  const events = deep?.events.filter((event) => event.settlementIds?.includes(settlement.id)) ?? [];
  const artifactIds = unique(events.flatMap((event) => event.artifactIds ?? []));
  const artifact = artifactIds.map((id) => galaxy.artifacts.find((entry) => entry.id === id)).find(Boolean);
  const living = settlement.status === 'active' || settlement.status === 'conquered';
  const mission = living
    ? objective({ kind: 'establish-contact', targetName: settlement.name, requiredEvidence: 1 })
    : artifact
      ? objective({ kind: 'recover-artifact', targetName: settlement.name, artifactName: artifact.name, requiredEvidence: 2 })
      : objective({ kind: 'determine-cause', targetName: settlement.name, requiredObjects: 3, requiredEvidence: 3 });
  const type: PointOfInterestType = living ? 'settlement' : settlement.kind === 'fortress' ? 'graveyard' : settlement.kind === 'industrial-city' ? 'ancientFactory' : 'ruin';
  return {
    key: `settlement:${settlement.id}`,
    name: living ? `${settlement.kind === 'fortress' ? 'Крепость' : 'Поселение'} «${settlement.name}»` : `Последний район ${settlement.name}`,
    type,
    civilizationId: settlement.civilizationId,
    age: ageFromYear(settlement.foundedYear),
    origin: settlement.foundingCause,
    publicSummary: living
      ? `Зафиксирована устойчивая инфраструктура поселения. Политический статус и намерения жителей не подтверждены.`
      : `Обнаружены остатки исторического поселения. Последняя активность датируется примерно ${ageFromYear(settlement.endedYear ?? settlement.foundedYear).toLocaleString('ru-RU')} лет назад.`,
    confirmedSummary: living
      ? `${settlement.name} основан по причине: ${settlement.foundingCause}. Текущий статус: ${settlement.status}.`
      : `${settlement.name} был покинут или уничтожен. Последняя известная причина: ${settlement.endCause ?? 'не установлена'}.`,
    truth: events.length ? events.map((event) => `${event.title}: ${event.summary}`).join(' ') : `${settlement.name}: ${settlement.endCause ?? settlement.foundingCause}.`,
    requiredEquipment: requiredFor(type, mission),
    possibleRewards: artifact ? [artifact.name, 'местные записи'] : living ? ['контакт', 'местная хроника'] : ['исторические свидетельства', 'архивные записи'],
    danger: living ? (planet.danger === 'extreme' ? 'caution' : 'safe') : dangerFromSeverity(Math.max(4, ...events.map((event) => event.severity)), planet),
    access: accessFor(type, planet, settlement.id),
    sourceEventIds: events.map((event) => event.id),
    historicalSettlementId: settlement.id,
    artifactIds,
    figureIds: unique(events.flatMap((event) => event.figureIds ?? [])),
    polityIds: unique([settlement.polityId, ...events.flatMap((event) => event.polityIds)]),
    loreTags: unique(['deep-history', living ? 'living-settlement' : 'historical-settlement']),
    objective: mission
  };
}

function sourceFromWar(galaxy: Galaxy, system: StarSystem, planet: Planet, war: DeepTimeWar): ExpeditionLoreSource | undefined {
  if (!war.systemIds.includes(system.id) || !belongsToPlanet(system, planet, war.id)) return undefined;
  const event = galaxy.deepTime?.events.find((entry) => entry.kind === 'war' && entry.systemIds.includes(system.id) && entry.civilizationIds.some((id) => war.civilizationIds.includes(id)) && Math.abs(entry.year - war.startYear) < 10);
  const artifactIds = unique(event?.artifactIds ?? []);
  const artifact = artifactIds.map((id) => galaxy.artifacts.find((entry) => entry.id === id)).find(Boolean);
  const mission = artifact
    ? objective({ kind: 'recover-artifact', targetName: war.name, artifactName: artifact.name, requiredEvidence: 2 })
    : objective({ kind: 'document-site', targetName: war.name, requiredObjects: 3, requiredEvidence: 3 });
  return {
    key: `war:${war.id}:${system.id}`,
    name: artifact ? `Полевое хранилище «${artifact.name}» — ${war.name}` : `Поле памяти — ${war.name}`,
    type: artifact ? 'wreck' : war.casualties > 100_000 ? 'graveyard' : 'wreck',
    civilizationId: war.civilizationIds[0],
    age: ageFromYear(war.endYear),
    origin: war.cause,
    publicSummary: `Следы крупного вооружённого конфликта. Масштаб потерь и стороны пока определены неточно.`,
    confirmedSummary: `${war.name}: причина — ${war.cause}; исход — ${war.outcome}; зарегистрированные потери — ${war.casualties.toLocaleString('ru-RU')}.`,
    truth: `${war.name} продолжалась с ${war.startYear} по ${war.endYear}. ${war.outcome}`,
    requiredEquipment: requiredFor('wreck', mission),
    possibleRewards: artifact ? [artifact.name, 'боевой журнал', 'идентификация погибших'] : ['боевой журнал', 'идентификация погибших', 'карта фронта'],
    danger: dangerFromSeverity(Math.min(10, 5 + Math.floor(Math.log10(Math.max(1, war.casualties)))), planet),
    access: accessFor('wreck', planet, war.id),
    sourceEventIds: event ? [event.id] : [],
    warId: war.id,
    artifactIds,
    figureIds: event?.figureIds ?? [],
    polityIds: unique([...war.attackerPolityIds, ...war.defenderPolityIds]),
    loreTags: ['deep-history', 'war', 'battlefield'],
    objective: mission
  };
}

function sourceFromEvent(galaxy: Galaxy, system: StarSystem, planet: Planet, event: DeepTimeEvent): ExpeditionLoreSource | undefined {
  if (!event.systemIds.includes(system.id) || !belongsToPlanet(system, planet, event.id)) return undefined;
  if (event.kind === 'war' || event.settlementIds?.length) return undefined;
  const artifactIds = unique(event.artifactIds ?? []);
  const artifact = artifactIds.map((id) => galaxy.artifacts.find((entry) => entry.id === id)).find(Boolean);
  const type = eventType(event);
  const mission = eventObjective(event, artifact?.name);
  const figure = event.figureIds?.map((id) => galaxy.figures.find((entry) => entry.id === id)).find(Boolean);
  const name = artifact
    ? `След «${artifact.name}» — ${event.title}`
    : figure
      ? `${event.title} · архив ${figure.name}`
      : event.title;
  return {
    key: `event:${event.id}`,
    name,
    type,
    civilizationId: event.civilizationIds[0],
    age: ageFromYear(event.year),
    origin: event.summary,
    publicSummary: `Сигнатура соответствует историческому событию категории «${event.kind}». Имена и точная последовательность пока не подтверждены.`,
    confirmedSummary: `${event.title}: ${event.summary}`,
    truth: `${event.title}: ${event.summary}`,
    requiredEquipment: requiredFor(type, mission),
    possibleRewards: artifact ? [artifact.name, 'первичный источник'] : ['первичный источник', 'архивные записи', 'координаты связанных объектов'],
    danger: dangerFromSeverity(event.severity, planet),
    access: accessFor(type, planet, event.id),
    sourceEventIds: [event.id],
    artifactIds,
    figureIds: event.figureIds ?? [],
    polityIds: event.polityIds,
    loreTags: unique(['deep-history', event.kind, ...event.tags]),
    objective: mission
  };
}

function naturalSource(galaxy: Galaxy, system: StarSystem, planet: Planet): ExpeditionLoreSource {
  const key = `natural:${planet.id}`;
  const anomaly = planet.type === 'anomalous' || system.anomaly;
  const living = planet.hasLife;
  const type: PointOfInterestType = anomaly ? 'anomaly' : living ? 'biosphere' : 'cave';
  const mission = anomaly
    ? objective({ kind: 'investigate-anomaly', targetName: planet.name, requiredObjects: 3, requiredEvidence: 3 })
    : living
      ? objective({ kind: 'collect-sample', targetName: planet.name, requiredObjects: 2, requiredEvidence: 2 })
      : objective({ kind: 'document-site', targetName: planet.name, requiredObjects: 2, requiredEvidence: 2 });
  const rng = createRng(`${galaxy.seed}:${key}`);
  const naturalName = anomaly
    ? `Аномальная зона «${planet.name}: ${rng.pick(['Обратный импульс', 'Тихий горизонт', 'Память поля'])}»`
    : living
      ? `Биосфера ${planet.name} — ${rng.pick(['споровый пояс', 'подвижный риф', 'единая колония'])}`
      : `Глубинный разлом ${planet.name} — ${rng.pick(['базальтовая камера', 'кристаллическая жила', 'подповерхностная полость'])}`;
  return {
    key,
    name: naturalName,
    type,
    age: rng.int(10_000, 4_000_000),
    origin: anomaly ? 'источник сигнала не соответствует известным физическим процессам' : living ? 'локальная экосистема развивалась без подтверждённого вмешательства цивилизаций' : 'структура образована геологическими процессами планеты',
    publicSummary: anomaly ? 'Приборы фиксируют устойчивое отклонение, но его причина неизвестна.' : living ? 'Обнаружена самостоятельная биологическая активность. Разумность и происхождение не подтверждены.' : 'Под поверхностью обнаружена крупная естественная полость без подтверждённых искусственных сигналов.',
    confirmedSummary: anomaly ? 'Сигнал повторяется и реагирует на активное сканирование.' : living ? 'Экосистема содержит несколько взаимосвязанных форм жизни и пригодна для полевого отбора проб.' : 'Разлом имеет естественное происхождение; ценность представляют геологические данные.',
    truth: anomaly ? 'Аномалия является устойчивым локальным процессом; её связь с историей галактики ещё не доказана.' : living ? 'Объект важен как самостоятельная экосистема, а не как хранилище случайного артефакта.' : 'Это природный объект без древней цивилизации и без спрятанного артефакта.',
    requiredEquipment: requiredFor(type, mission),
    possibleRewards: anomaly ? ['аномальные измерения', 'новая гипотеза'] : living ? ['биологические образцы', 'экологические данные'] : ['геологические данные', 'минеральный образец'],
    danger: planet.danger,
    access: accessFor(type, planet, key),
    sourceEventIds: [],
    artifactIds: [],
    figureIds: [],
    polityIds: [],
    loreTags: [anomaly ? 'anomaly' : living ? 'biosphere' : 'geology', 'planetary'],
    objective: mission
  };
}

export function buildExpeditionLoreSources(galaxy: Galaxy, system: StarSystem, planet: Planet): ExpeditionLoreSource[] {
  if (planet.imageKey === 'tutorial-target') return [];
  const deep = galaxy.deepTime;
  const sources: ExpeditionLoreSource[] = [];
  for (const ruin of deep?.ruins ?? []) {
    if (ruin.systemId !== system.id) continue;
    const source = sourceFromRuin(galaxy, system, planet, ruin);
    if (source) sources.push(source);
  }
  for (const settlement of deep?.historicalSettlements ?? []) {
    if (settlement.systemId !== system.id) continue;
    const source = sourceFromSettlement(galaxy, system, planet, settlement);
    if (source) sources.push(source);
  }
  for (const war of deep?.wars ?? []) {
    const source = sourceFromWar(galaxy, system, planet, war);
    if (source) sources.push(source);
  }
  for (const event of deep?.events ?? []) {
    const source = sourceFromEvent(galaxy, system, planet, event);
    if (source) sources.push(source);
  }
  if (planet.civilizationId && !sources.some((source) => source.type === 'settlement' && source.civilizationId === planet.civilizationId)) {
    const civilization = galaxy.civilizations.find((entry) => entry.id === planet.civilizationId);
    if (civilization) {
      const mission = objective({ kind: 'establish-contact', targetName: civilization.name, requiredEvidence: 1 });
      sources.push({
        key: `living-civilization:${civilization.id}:${planet.id}`,
        name: `Пограничный узел ${civilization.name} на ${planet.name}`,
        type: 'settlement',
        civilizationId: civilization.id,
        age: Math.max(1, Math.abs(civilization.foundedYear)),
        origin: `действующее поселение цивилизации ${civilization.name}`,
        publicSummary: 'Зафиксирована современная инфраструктура. Назначение объекта и отношение жителей к чужому кораблю не подтверждены.',
        confirmedSummary: `${civilization.name}: технологический уровень ${civilization.techLevel}; известная эпоха — ${civilization.era ?? 'не установлена'}.`,
        truth: `Это действующий локальный узел ${civilization.name}, а не безымянная древняя руина.`,
        requiredEquipment: requiredFor('settlement', mission),
        possibleRewards: ['контакт', 'местные записи', 'торговый канал'],
        danger: civilization.status === 'hidden' ? 'caution' : 'safe',
        access: 'surface',
        sourceEventIds: [],
        artifactIds: [],
        figureIds: [],
        polityIds: civilization.deepTimePolityIds ?? [],
        loreTags: ['living-civilization', 'settlement'],
        objective: mission
      });
    }
  }

  const deduplicated = [...new Map(sources.map((source) => [source.key, source])).values()]
    .sort((a, b) => {
      const aHistorical = a.sourceEventIds.length + (a.ruinId ? 2 : 0) + a.artifactIds.length * 2;
      const bHistorical = b.sourceEventIds.length + (b.ruinId ? 2 : 0) + b.artifactIds.length * 2;
      return bHistorical - aHistorical || b.age - a.age || a.name.localeCompare(b.name, 'ru');
    });
  if (!deduplicated.length || planet.hasLife || planet.type === 'anomalous' || system.anomaly) deduplicated.push(naturalSource(galaxy, system, planet));
  return deduplicated;
}

export function expeditionObjectiveForPoint(point: PointOfInterest): ExpeditionObjective {
  if (point.objective) return point.objective;
  if ((point.artifactIds?.length ?? 0) > 0) return objective({ kind: 'recover-artifact', targetName: point.name, requiredEvidence: 2 });
  if (point.type === 'biosphere') return objective({ kind: 'collect-sample', targetName: point.name, requiredObjects: 2, requiredEvidence: 2 });
  if (point.type === 'anomaly') return objective({ kind: 'investigate-anomaly', targetName: point.name, requiredObjects: 3, requiredEvidence: 3 });
  if (point.type === 'settlement') return objective({ kind: 'establish-contact', targetName: point.name, requiredEvidence: 1 });
  if (point.type === 'laboratory') return objective({ kind: 'restore-archive', targetName: point.name, requiredObjects: 2, requiredEvidence: 2 });
  if (point.type === 'wreck' || point.type === 'distress') return objective({ kind: 'recover-black-box', targetName: point.name, requiredEvidence: 2 });
  return objective({ kind: 'determine-cause', targetName: point.name, requiredObjects: 3, requiredEvidence: 3 });
}

export function linkedArtifactForPoint(point: PointOfInterest, artifacts: Artifact[]): Artifact | undefined {
  return (point.artifactIds ?? [])
    .map((id) => artifacts.find((artifact) => artifact.id === id))
    .find((artifact): artifact is Artifact => Boolean(artifact && !artifact.discovered));
}
