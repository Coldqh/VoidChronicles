import type {
  Artifact,
  Civilization,
  GalaxySettings,
  HistoricalEvent,
  HistoricalFigure,
  Planet,
  StarSystem
} from '../game/types';
import { figureName } from '../generation/names';
import { createRng, stableHash, type RandomSource } from '../generation/rng';
import { ERA_LABELS, eraIndex, isSpacefaringEra } from './eras';
import type {
  CivilizationalEra,
  DeepHistoricalSettlement,
  DeepHistoricalSettlementKind,
  DeepTechnologyDiscovery,
  DeepTechnologyField,
  DeepTimeCultureState,
  DeepTimeEvent,
  DeepTimeMigration,
  DeepTimePolityForm,
  DeepTimePolityState,
  DeepTimeRuin,
  DeepTimeState,
  DeepTimeWar
} from './types';

export interface DeepHistoryResult {
  deepTime: DeepTimeState;
  figures: HistoricalFigure[];
  artifacts: Artifact[];
  history: HistoricalEvent[];
}

const milestoneKinds: Array<{
  era: CivilizationalEra;
  kind: DeepHistoricalSettlementKind;
  label: string;
  population: number;
}> = [
  { era: 'tribal', kind: 'camp', label: 'Стоянка', population: 1_400 },
  { era: 'neolithic', kind: 'village', label: 'Поселение', population: 7_500 },
  { era: 'urban', kind: 'town', label: 'Городище', population: 42_000 },
  { era: 'bronze', kind: 'capital', label: 'Столица', population: 170_000 },
  { era: 'iron', kind: 'fortress', label: 'Крепость', population: 280_000 },
  { era: 'medieval', kind: 'city', label: 'Город', population: 650_000 },
  { era: 'gunpowder', kind: 'port', label: 'Порт', population: 1_300_000 },
  { era: 'industrial', kind: 'industrial-city', label: 'Промышленный центр', population: 5_500_000 },
  { era: 'modern', kind: 'metropolis', label: 'Метрополия', population: 18_000_000 },
  { era: 'early-space', kind: 'orbital-habitat', label: 'Орбитальный комплекс', population: 2_400_000 },
  { era: 'interplanetary', kind: 'planetary-colony', label: 'Планетарная колония', population: 9_000_000 },
  { era: 'interstellar', kind: 'stellar-colony', label: 'Звёздная колония', population: 14_000_000 }
];

const discoveryByEra: Partial<Record<CivilizationalEra, Array<{
  field: DeepTechnologyField;
  name: string;
}>>> = {
  neolithic: [{ field: 'agriculture', name: 'Устойчивое производство пищи' }],
  urban: [
    { field: 'writing', name: 'Системная письменность' },
    { field: 'governance', name: 'Профессиональное управление' }
  ],
  bronze: [{ field: 'materials', name: 'Сложная металлургия' }],
  iron: [{ field: 'military', name: 'Массовое железное вооружение' }],
  medieval: [{ field: 'medicine', name: 'Институциональная медицина' }],
  gunpowder: [{ field: 'military', name: 'Пороховые составы' }],
  industrial: [
    { field: 'industry', name: 'Механизированное производство' },
    { field: 'energy', name: 'Промышленная энергетика' }
  ],
  modern: [
    { field: 'computing', name: 'Электронные вычисления' },
    { field: 'medicine', name: 'Массовая профилактическая медицина' }
  ],
  atomic: [{ field: 'energy', name: 'Управляемые ядерные процессы' }],
  'early-space': [{ field: 'spaceflight', name: 'Устойчивая орбитальная инфраструктура' }],
  interplanetary: [{ field: 'navigation', name: 'Межпланетная навигация' }],
  interstellar: [{ field: 'ftl', name: 'Межзвёздный транспорт' }],
  advanced: [
    { field: 'biology', name: 'Управляемое проектирование жизни' },
    { field: 'computing', name: 'Планетарные вычислительные среды' }
  ]
};

const polityStems = [
  'Семи Рек',
  'Высоких Плато',
  'Старого Моря',
  'Красных Гор',
  'Первого Берега',
  'Свободных Городов',
  'Внутреннего Круга',
  'Лунных Портов'
] as const;

const warCauses = [
  'контроль плодородных земель',
  'доступ к металлам и топливу',
  'династический спор',
  'религиозный раскол',
  'торговый маршрут',
  'сепаратизм пограничных областей',
  'борьба за орбитальную инфраструктуру',
  'колониальная независимость'
] as const;

const migrationCauses = [
  'война',
  'разрушение поселений',
  'голод',
  'религиозное преследование',
  'экологический кризис',
  'распад государства'
] as const;

const artifactNouns = [
  'Корона',
  'Клинок',
  'Архив',
  'Печать',
  'Навигационный модуль',
  'Реликварий',
  'Прототип',
  'Кодекс',
  'Знамя',
  'Чёрный ящик'
] as const;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function eventId(prefix: string, key: string): string {
  return `${prefix}_${stableHash(key)}`;
}

function eventYearForEra(
  deepTime: DeepTimeState,
  civilization: Civilization,
  era: CivilizationalEra
): number | undefined {
  if (era === 'tribal') {
    return deepTime.species.find((species) => species.civilizationId === civilization.id)?.sapienceYear;
  }

  return deepTime.transitions.find(
    (transition) =>
      transition.civilizationId === civilization.id &&
      transition.to === era &&
      !transition.regression
  )?.year;
}

function bestPlanet(system: StarSystem | undefined, preferEmpty = false): Planet | undefined {
  const planets = [...(system?.planets ?? [])].filter((planet) => planet.type !== 'gas');
  if (preferEmpty) {
    const empty = planets.filter((planet) => !planet.civilizationId);
    if (empty.length > 0) return empty.sort((a, b) => b.habitability - a.habitability)[0];
  }
  return planets.sort((a, b) => b.habitability - a.habitability)[0];
}

function polityFormForEra(era: CivilizationalEra, rng: RandomSource): DeepTimePolityForm {
  if (eraIndex(era) <= eraIndex('bronze')) return rng.pick(['city-state', 'kingdom', 'theocracy'] as const);
  if (eraIndex(era) <= eraIndex('medieval')) return rng.pick(['kingdom', 'empire', 'republic', 'theocracy'] as const);
  if (era === 'gunpowder') return rng.pick(['empire', 'republic', 'kingdom'] as const);
  if (era === 'industrial') return 'industrial-state';
  if (era === 'modern' || era === 'atomic') return rng.pick(['industrial-state', 'planetary-union', 'republic'] as const);
  if (era === 'early-space') return 'orbital-polity';
  if (era === 'interplanetary') return 'interplanetary-state';
  return 'stellar-state';
}

function polityPrefix(form: DeepTimePolityForm): string {
  if (form === 'city-state') return 'Город-государство';
  if (form === 'kingdom') return 'Королевство';
  if (form === 'empire') return 'Империя';
  if (form === 'republic') return 'Республика';
  if (form === 'theocracy') return 'Священный союз';
  if (form === 'industrial-state') return 'Индустриальная держава';
  if (form === 'planetary-union') return 'Планетарный союз';
  if (form === 'orbital-polity') return 'Орбитальная администрация';
  if (form === 'interplanetary-state') return 'Межпланетная лига';
  if (form === 'stellar-state') return 'Звёздный доминион';
  return form === 'tribal-confederation' ? 'Союз племён' : 'Род';
}

function activeAt(polity: DeepTimePolityState, year: number): boolean {
  return polity.formedYear <= year && (polity.endedYear === undefined || polity.endedYear >= year);
}

function settlementActiveAt(settlement: DeepHistoricalSettlement, year: number): boolean {
  return settlement.foundedYear <= year && (settlement.endedYear === undefined || settlement.endedYear >= year);
}

function createHistoricalPolities(
  civilization: Civilization,
  deepTime: DeepTimeState,
  rng: RandomSource
): { polities: DeepTimePolityState[]; events: DeepTimeEvent[] } {
  const structuralEras: CivilizationalEra[] = [
    'urban',
    'bronze',
    'iron',
    'medieval',
    'gunpowder',
    'industrial',
    'modern',
    'atomic',
    'early-space',
    'interplanetary',
    'interstellar'
  ];
  const reached = structuralEras
    .map((era) => ({ era, year: eventYearForEra(deepTime, civilization, era) }))
    .filter((entry): entry is { era: CivilizationalEra; year: number } => entry.year !== undefined)
    .sort((a, b) => a.year - b.year);

  const polities: DeepTimePolityState[] = [];
  const events: DeepTimeEvent[] = [];

  reached.forEach((entry, eraIndexValue) => {
    const nextYear = reached[eraIndexValue + 1]?.year ?? civilization.endedYear;
    const isCurrentStage = nextYear === undefined;
    if (isCurrentStage) return;

    const count = entry.era === 'urban' || entry.era === 'bronze' ? 3 : 2;
    for (let index = 0; index < count; index += 1) {
      const form = polityFormForEra(entry.era, rng);
      const polity: DeepTimePolityState = {
        id: eventId('historical_polity', `${civilization.id}:${entry.era}:${index}`),
        civilizationId: civilization.id,
        name: `${polityPrefix(form)} ${rng.pick(polityStems)}`,
        form,
        status: 'collapsed',
        formedYear: entry.year,
        endedYear: nextYear,
        capitalSystemId: civilization.homeSystemId,
        territorySystemIds: [civilization.homeSystemId],
        cultureIds: civilization.deepTimeCultureIds?.length
          ? [civilization.deepTimeCultureIds[index % civilization.deepTimeCultureIds.length]!]
          : [],
        population: Math.max(
          1_000,
          Math.round((civilization.development?.population ?? 100_000) / (count * Math.max(2, reached.length - eraIndexValue)))
        ),
        stability: rng.int(28, 82),
        legitimacy: rng.int(22, 88),
        military: clamp(eraIndex(entry.era) * 6 + rng.int(4, 24))
      };
      polities.push(polity);
      events.push({
        id: eventId('deep_event_state_formation', polity.id),
        year: polity.formedYear,
        kind: 'state-formation',
        title: `${polity.name}: возникновение государства`,
        summary: `Государство типа «${polity.form}» объединило часть поселений ${civilization.speciesName}.`,
        severity: 4,
        civilizationIds: [civilization.id],
        polityIds: [polity.id],
        systemIds: polity.territorySystemIds,
        tags: ['polity', 'formation', entry.era]
      });
      events.push({
        id: eventId('deep_event_state_collapse', polity.id),
        year: polity.endedYear ?? -1,
        kind: 'state-collapse',
        title: `${polity.name}: прекращение существования`,
        summary: 'Государственные структуры распались, были поглощены или заменены новым политическим порядком.',
        severity: 6,
        civilizationIds: [civilization.id],
        polityIds: [polity.id],
        systemIds: polity.territorySystemIds,
        tags: ['polity', 'collapse', entry.era]
      });
    }
  });

  return { polities, events };
}

function createSettlements(
  civilization: Civilization,
  systems: StarSystem[],
  deepTime: DeepTimeState,
  polities: DeepTimePolityState[],
  rng: RandomSource
): { settlements: DeepHistoricalSettlement[]; events: DeepTimeEvent[] } {
  const homeSystem = systems.find((system) => system.id === civilization.homeSystemId);
  const home = bestPlanet(homeSystem);
  if (!homeSystem || !home) return { settlements: [], events: [] };

  const reached = milestoneKinds
    .map((milestone) => ({
      ...milestone,
      year: eventYearForEra(deepTime, civilization, milestone.era)
    }))
    .filter((entry): entry is typeof milestoneKinds[number] & { year: number } => entry.year !== undefined)
    .sort((a, b) => a.year - b.year);

  const settlements: DeepHistoricalSettlement[] = [];
  const events: DeepTimeEvent[] = [];

  reached.forEach((milestone, index) => {
    const nextYear = reached[index + 1]?.year;
    const finalEnd = civilization.endedYear;
    const endedYear = finalEnd ?? nextYear;
    const status: DeepHistoricalSettlement['status'] =
      finalEnd !== undefined ? 'ruined' : nextYear !== undefined ? 'abandoned' : 'active';
    const owner = polities.find((polity) => activeAt(polity, milestone.year));
    const settlement: DeepHistoricalSettlement = {
      id: eventId('historical_settlement', `${civilization.id}:${milestone.era}:home`),
      civilizationId: civilization.id,
      polityId: owner?.id,
      name: `${milestone.label} ${home.name}`,
      kind: milestone.kind,
      systemId: homeSystem.id,
      planetId: home.id,
      foundedYear: milestone.year,
      endedYear,
      status,
      populationPeak: Math.max(
        80,
        Math.min(
          civilization.development?.population ?? milestone.population,
          Math.round(milestone.population * (0.55 + rng.next() * 1.15))
        )
      ),
      populationAtEnd: status === 'active' ? Math.max(50, Math.round(milestone.population * 0.8)) : 0,
      cultureIds: owner?.cultureIds ?? civilization.deepTimeCultureIds?.slice(0, 1) ?? [],
      foundingCause: `Переход в эпоху «${ERA_LABELS[milestone.era]}»`,
      endCause: finalEnd !== undefined
        ? civilization.extinctionCause ?? 'окончательная гибель цивилизации'
        : nextYear !== undefined
          ? 'население и функции перешли в более крупные центры'
          : undefined
    };
    settlements.push(settlement);

    events.push({
      id: eventId('deep_event_settlement_founded', settlement.id),
      year: settlement.foundedYear,
      kind: 'settlement-founded',
      title: `${settlement.name}: основание`,
      summary: `${milestone.label} стало устойчивым центром населения и производства.`,
      severity: Math.min(7, 2 + Math.floor(eraIndex(milestone.era) / 2)),
      civilizationIds: [civilization.id],
      polityIds: owner ? [owner.id] : [],
      systemIds: [homeSystem.id],
      settlementIds: [settlement.id],
      tags: ['settlement', 'founded', milestone.kind, milestone.era]
    });

    if (settlement.endedYear !== undefined) {
      events.push({
        id: eventId('deep_event_settlement_ended', settlement.id),
        year: settlement.endedYear,
        kind: 'settlement-destroyed',
        title: `${settlement.name}: прекращение существования`,
        summary: settlement.endCause ?? 'Поселение было покинуто.',
        severity: status === 'ruined' ? 8 : 3,
        civilizationIds: [civilization.id],
        polityIds: owner ? [owner.id] : [],
        systemIds: [homeSystem.id],
        settlementIds: [settlement.id],
        tags: ['settlement', status, milestone.kind]
      });
    }
  });

  const interstellarYear = eventYearForEra(deepTime, civilization, 'interstellar');
  if (interstellarYear !== undefined) {
    const colonySystems = civilization.controlledSystems
      .filter((systemId) => systemId !== civilization.homeSystemId)
      .map((systemId) => systems.find((system) => system.id === systemId))
      .filter((system): system is StarSystem => Boolean(system));

    colonySystems.forEach((system, index) => {
      const planet = bestPlanet(system, true) ?? bestPlanet(system);
      const foundedYear = Math.min(-1, interstellarYear + 8 + index * 17 + rng.int(0, 30));
      const settlement: DeepHistoricalSettlement = {
        id: eventId('historical_settlement', `${civilization.id}:stellar:${system.id}`),
        civilizationId: civilization.id,
        polityId: polities.find((polity) => activeAt(polity, foundedYear))?.id,
        name: `Колония ${system.name}`,
        kind: 'stellar-colony',
        systemId: system.id,
        planetId: planet?.id,
        foundedYear,
        endedYear: civilization.endedYear,
        status: civilization.endedYear !== undefined ? 'ruined' : 'active',
        populationPeak: Math.max(1_200, Math.round((civilization.development?.population ?? 1_000_000) * (0.003 + rng.next() * 0.02))),
        populationAtEnd: civilization.endedYear !== undefined ? 0 : Math.max(600, rng.int(1_000, 900_000)),
        cultureIds: civilization.deepTimeCultureIds?.slice(index % Math.max(1, civilization.deepTimeCultureIds.length), index % Math.max(1, civilization.deepTimeCultureIds.length) + 1) ?? [],
        foundingCause: 'межзвёздная колонизация',
        endCause: civilization.endedYear !== undefined ? civilization.extinctionCause : undefined
      };
      settlements.push(settlement);
      events.push({
        id: eventId('deep_event_settlement_founded', settlement.id),
        year: foundedYear,
        kind: 'settlement-founded',
        title: `${settlement.name}: основание`,
        summary: `${civilization.name} создала постоянное поселение в другой звёздной системе.`,
        severity: 8,
        civilizationIds: [civilization.id],
        polityIds: settlement.polityId ? [settlement.polityId] : [],
        systemIds: [system.id],
        settlementIds: [settlement.id],
        tags: ['settlement', 'stellar-colony', 'colonization']
      });
    });
  }

  return { settlements, events };
}

function createDiscoveries(
  civilization: Civilization,
  deepTime: DeepTimeState,
  polities: DeepTimePolityState[],
  settlements: DeepHistoricalSettlement[],
  rng: RandomSource
): { discoveries: DeepTechnologyDiscovery[]; events: DeepTimeEvent[] } {
  const discoveries: DeepTechnologyDiscovery[] = [];
  const events: DeepTimeEvent[] = [];

  for (const [era, definitions] of Object.entries(discoveryByEra) as Array<
    [CivilizationalEra, Array<{ field: DeepTechnologyField; name: string }>]
  >) {
    const year = eventYearForEra(deepTime, civilization, era);
    if (year === undefined) continue;

    definitions.forEach((definition, index) => {
      const settlement = settlements.find((entry) => settlementActiveAt(entry, year));
      const polity = polities.find((entry) => activeAt(entry, year));
      const discovery: DeepTechnologyDiscovery = {
        id: eventId('deep_discovery', `${civilization.id}:${era}:${definition.field}:${index}`),
        civilizationId: civilization.id,
        polityId: polity?.id,
        settlementId: settlement?.id,
        field: definition.field,
        year,
        name: definition.name,
        method: 'independent',
        impact: clamp(45 + eraIndex(era) * 4 + rng.int(-8, 10))
      };
      discoveries.push(discovery);
      events.push({
        id: eventId('deep_event_discovery', discovery.id),
        year,
        kind: 'discovery',
        title: `${civilization.name}: ${definition.name}`,
        summary: `Открытие в области «${definition.field}» изменило производство, войну или общественное устройство.`,
        severity: Math.min(9, 4 + Math.floor(eraIndex(era) / 2)),
        civilizationIds: [civilization.id],
        polityIds: polity ? [polity.id] : [],
        systemIds: settlement ? [settlement.systemId] : [civilization.homeSystemId],
        settlementIds: settlement ? [settlement.id] : [],
        tags: ['technology', definition.field, era]
      });
    });
  }

  return { discoveries, events };
}

function createWar(
  key: string,
  civilizationIds: string[],
  attackers: DeepTimePolityState[],
  defenders: DeepTimePolityState[],
  startYear: number,
  endYear: number,
  systems: string[],
  settlements: DeepHistoricalSettlement[],
  rng: RandomSource
): { war: DeepTimeWar; events: DeepTimeEvent[]; migration?: DeepTimeMigration } {
  const affected = settlements
    .filter((settlement) =>
      civilizationIds.includes(settlement.civilizationId) &&
      settlementActiveAt(settlement, startYear)
    )
    .sort((a, b) => b.populationPeak - a.populationPeak);
  const target = affected[0];
  const cause = rng.pick(warCauses);
  const casualties = Math.max(
    500,
    Math.round(attackers.concat(defenders).reduce((sum, polity) => sum + polity.population, 0) * (0.015 + rng.next() * 0.12))
  );
  const outcome = rng.pick([
    'победа атакующей стороны',
    'победа обороняющейся стороны',
    'истощение обеих сторон',
    'распад одного из участников',
    'мир без решающей победы'
  ] as const);
  const collapsed = outcome === 'распад одного из участников'
    ? [rng.pick(defenders.length > 0 ? defenders : attackers).id]
    : [];

  const war: DeepTimeWar = {
    id: eventId('deep_war', key),
    name: `Война за ${rng.pick(['долины', 'порты', 'орбиты', 'границы', 'священные земли', 'колонии'])}`,
    startYear,
    endYear,
    attackerPolityIds: attackers.map((polity) => polity.id),
    defenderPolityIds: defenders.map((polity) => polity.id),
    civilizationIds,
    systemIds: systems,
    cause,
    outcome,
    casualties,
    settlementIds: target ? [target.id] : [],
    endedPolityIds: collapsed
  };

  const events: DeepTimeEvent[] = [{
    id: `deep_event_war_${war.id}`,
    year: startYear,
    kind: 'war',
    title: war.name,
    summary: `${cause}. Итог: ${outcome}. Потери оцениваются в ${casualties.toLocaleString('ru-RU')}.`,
    severity: clamp(5 + Math.log10(Math.max(10, casualties)), 1, 10),
    civilizationIds,
    polityIds: [...war.attackerPolityIds, ...war.defenderPolityIds],
    systemIds: systems,
    settlementIds: war.settlementIds,
    tags: ['war', cause, outcome]
  }];

  let migration: DeepTimeMigration | undefined;
  if (target) {
    const destroy = rng.chance(0.34) || collapsed.length > 0;
    if (destroy && (target.endedYear === undefined || target.endedYear > endYear)) {
      target.endedYear = endYear;
      target.status = 'ruined';
      target.populationAtEnd = 0;
      target.endCause = war.name;
      events.push({
        id: eventId('deep_event_war_destroyed_settlement', `${war.id}:${target.id}`),
        year: endYear,
        kind: 'settlement-destroyed',
        title: `${target.name}: разрушение`,
        summary: `Поселение было уничтожено или окончательно покинуто во время конфликта «${war.name}».`,
        severity: 8,
        civilizationIds: [target.civilizationId],
        polityIds: [...war.attackerPolityIds, ...war.defenderPolityIds],
        systemIds: [target.systemId],
        settlementIds: [target.id],
        tags: ['war', 'ruin', target.kind]
      });
    }

    const destination = affected.find(
      (settlement) =>
        settlement.id !== target.id &&
        (settlement.endedYear === undefined || settlement.endedYear > endYear)
    );
    const moved = Math.max(50, Math.round(Math.min(target.populationPeak * 0.22, casualties * (0.25 + rng.next() * 0.55))));
    migration = {
      id: eventId('deep_migration', `${war.id}:${target.id}`),
      civilizationId: target.civilizationId,
      year: endYear,
      sourceSettlementId: target.id,
      destinationSettlementId: destination?.id,
      population: moved,
      cause: rng.pick(migrationCauses),
      cultureIds: target.cultureIds,
      createdCultureId: moved >= 50_000 ? eventId('deep_culture_diaspora', `${war.id}:${target.id}`) : undefined
    };
    events.push({
      id: eventId('deep_event_migration', migration.id),
      year: endYear,
      kind: 'migration',
      title: `Исход из ${target.name}`,
      summary: `${moved.toLocaleString('ru-RU')} жителей покинули район боевых действий.`,
      severity: moved >= 100_000 ? 7 : 5,
      civilizationIds: [target.civilizationId],
      polityIds: [...war.attackerPolityIds, ...war.defenderPolityIds],
      systemIds: destination ? [target.systemId, destination.systemId] : [target.systemId],
      settlementIds: [target.id, ...(destination ? [destination.id] : [])],
      tags: ['migration', 'war', migration.cause]
    });
  }

  return { war, events, migration };
}

function createInternalWars(
  civilizations: Civilization[],
  polities: DeepTimePolityState[],
  settlements: DeepHistoricalSettlement[],
  rng: RandomSource
): { wars: DeepTimeWar[]; migrations: DeepTimeMigration[]; events: DeepTimeEvent[] } {
  const wars: DeepTimeWar[] = [];
  const migrations: DeepTimeMigration[] = [];
  const events: DeepTimeEvent[] = [];

  for (const civilization of civilizations) {
    const local = polities.filter((polity) => polity.civilizationId === civilization.id);
    const groups = new Map<number, DeepTimePolityState[]>();
    for (const polity of local) {
      const group = groups.get(polity.formedYear) ?? [];
      group.push(polity);
      groups.set(polity.formedYear, group);
    }

    let count = 0;
    for (const [formedYear, group] of groups) {
      if (group.length < 2 || count >= 4) continue;
      const possibleEnd = Math.min(
        ...group.map((polity) => polity.endedYear ?? -1)
      );
      const endLimit = possibleEnd > formedYear ? possibleEnd : Math.min(-1, formedYear + 100);
      const startYear = Math.min(-2, formedYear + Math.max(1, Math.floor((endLimit - formedYear) * (0.25 + rng.next() * 0.35))));
      const endYear = Math.min(-1, startYear + Math.max(1, rng.int(2, Math.max(3, Math.min(80, endLimit - startYear)))));
      const result = createWar(
        `${civilization.id}:${formedYear}:${count}`,
        [civilization.id],
        [group[0]!],
        [group[1]!],
        startYear,
        endYear,
        [civilization.homeSystemId],
        settlements,
        rng
      );
      wars.push(result.war);
      events.push(...result.events);
      if (result.migration) migrations.push(result.migration);
      count += 1;
    }
  }

  return { wars, migrations, events };
}

function territoriesTouch(a: Civilization, b: Civilization, systems: Map<string, StarSystem>): boolean {
  const bTerritory = new Set(b.controlledSystems);
  for (const systemId of a.controlledSystems) {
    if (bTerritory.has(systemId)) return true;
    const system = systems.get(systemId);
    if (system?.neighbors.some((neighbor) => bTerritory.has(neighbor))) return true;
  }
  return false;
}

function createIntercivilizationEvents(
  civilizations: Civilization[],
  systems: StarSystem[],
  deepTime: DeepTimeState,
  polities: DeepTimePolityState[],
  settlements: DeepHistoricalSettlement[],
  discoveries: DeepTechnologyDiscovery[],
  rng: RandomSource
): { wars: DeepTimeWar[]; events: DeepTimeEvent[]; migrations: DeepTimeMigration[] } {
  const wars: DeepTimeWar[] = [];
  const events: DeepTimeEvent[] = [];
  const migrations: DeepTimeMigration[] = [];
  const bySystem = new Map(systems.map((system) => [system.id, system]));
  const spacefaring = civilizations.filter(
    (civilization) =>
      civilization.status !== 'dead' &&
      civilization.era !== undefined &&
      isSpacefaringEra(civilization.era) &&
      civilization.development?.spaceAccess !== 'none'
  );

  for (let leftIndex = 0; leftIndex < spacefaring.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < spacefaring.length; rightIndex += 1) {
      const left = spacefaring[leftIndex]!;
      const right = spacefaring[rightIndex]!;
      if (!territoriesTouch(left, right, bySystem)) continue;

      const leftInterstellar = eventYearForEra(deepTime, left, 'interstellar') ?? -300;
      const rightInterstellar = eventYearForEra(deepTime, right, 'interstellar') ?? -300;
      const contactYear = Math.min(-1, Math.max(leftInterstellar, rightInterstellar) + rng.int(5, 90));
      const contactSystems = Array.from(new Set([...left.controlledSystems, ...right.controlledSystems])).slice(0, 4);

      events.push({
        id: eventId('deep_event_first_contact', `${left.id}:${right.id}`),
        year: contactYear,
        kind: 'first-contact',
        title: `Первый контакт: ${left.name} и ${right.name}`,
        summary: 'Две независимо развившиеся цивилизации подтвердили существование друг друга и начали обмен сигналами.',
        severity: 9,
        civilizationIds: [left.id, right.id],
        polityIds: [],
        systemIds: contactSystems,
        tags: ['first-contact', 'intercivilization']
      });

      if (rng.chance(0.62)) {
        const receiver = rng.chance(0.5) ? left : right;
        const source = receiver.id === left.id ? right : left;
        const discovery: DeepTechnologyDiscovery = {
          id: eventId('deep_discovery_transfer', `${left.id}:${right.id}`),
          civilizationId: receiver.id,
          field: rng.pick(['medicine', 'navigation', 'materials', 'computing', 'biology'] as const),
          year: Math.min(-1, contactYear + rng.int(2, 35)),
          name: `Заимствование технологии у ${source.name}`,
          method: 'trade',
          sourceCivilizationId: source.id,
          impact: rng.int(28, 74)
        };
        discoveries.push(discovery);
        events.push({
          id: eventId('deep_event_technology_transfer', discovery.id),
          year: discovery.year,
          kind: 'technology-transfer',
          title: `${receiver.name}: технологический обмен`,
          summary: `${receiver.name} получила знания в области «${discovery.field}» от ${source.name}.`,
          severity: 6,
          civilizationIds: [receiver.id, source.id],
          polityIds: [],
          systemIds: contactSystems,
          tags: ['technology-transfer', discovery.field, 'trade']
        });
        events.push({
          id: eventId('deep_event_trade', `${left.id}:${right.id}`),
          year: discovery.year,
          kind: 'trade',
          title: `Торговый обмен между ${left.name} и ${right.name}`,
          summary: 'Появился устойчивый обмен материалами, данными и биологическими образцами.',
          severity: 5,
          civilizationIds: [left.id, right.id],
          polityIds: [],
          systemIds: contactSystems,
          tags: ['trade', 'intercivilization']
        });
      }

      if (rng.chance(0.2)) {
        const leftPolity = polities.find(
          (polity) => polity.civilizationId === left.id && activeAt(polity, contactYear)
        );
        const rightPolity = polities.find(
          (polity) => polity.civilizationId === right.id && activeAt(polity, contactYear)
        );
        if (leftPolity && rightPolity) {
          const result = createWar(
            `${left.id}:${right.id}:contact-war`,
            [left.id, right.id],
            [leftPolity],
            [rightPolity],
            Math.min(-2, contactYear + rng.int(5, 40)),
            Math.min(-1, contactYear + rng.int(45, 140)),
            contactSystems,
            settlements,
            rng
          );
          wars.push(result.war);
          events.push(...result.events);
          if (result.migration) migrations.push(result.migration);
        }
      }
    }
  }

  return { wars, events, migrations };
}

function figureRole(kind: DeepTimeEvent['kind']): string {
  if (kind === 'war') return 'полководец';
  if (kind === 'discovery' || kind === 'technology-transfer') return 'учёный';
  if (kind === 'state-formation') return 'основатель государства';
  if (kind === 'migration') return 'вождь переселения';
  if (kind === 'first-contact') return 'дипломат';
  if (kind === 'extinction' || kind === 'collapse') return 'последний хранитель';
  return 'реформатор';
}

function createFiguresFromEvents(
  settings: GalaxySettings,
  civilizations: Civilization[],
  events: DeepTimeEvent[]
): HistoricalFigure[] {
  const figures: HistoricalFigure[] = [];

  for (const civilization of civilizations) {
    const candidates = events
      .filter(
        (event) =>
          event.civilizationIds.includes(civilization.id) &&
          (event.severity >= 7 ||
            ['discovery', 'state-formation', 'first-contact', 'technology-transfer'].includes(event.kind))
      )
      .sort((a, b) => b.severity - a.severity || a.year - b.year)
      .slice(0, 10);

    candidates.forEach((event, index) => {
      const rng = createRng(`${settings.seed}:historical-figure:${event.id}:${civilization.id}`);
      const bornYear = Math.max(civilization.foundedYear, event.year - rng.int(24, 68));
      const possibleDeath = event.year + rng.int(12, 95);
      const figure: HistoricalFigure = {
        id: eventId('figure', `${event.id}:${civilization.id}:${index}`),
        name: figureName(rng),
        civilizationId: civilization.id,
        role: figureRole(event.kind),
        bornYear,
        diedYear: possibleDeath < 0 ? possibleDeath : undefined,
        importance: clamp(Math.round(event.severity * 9 + rng.int(-8, 12))),
        achievements: [
          `${event.title}: ${event.summary}`,
          `Участие подтверждено хроникой события ${event.id}.`
        ]
      };
      figures.push(figure);
      event.figureIds = [...(event.figureIds ?? []), figure.id];
    });
  }

  return figures;
}

function createArtifactsFromEvents(
  settings: GalaxySettings,
  civilizations: Civilization[],
  polities: DeepTimePolityState[],
  settlements: DeepHistoricalSettlement[],
  events: DeepTimeEvent[],
  figures: HistoricalFigure[]
): Artifact[] {
  const artifacts: Artifact[] = [];

  for (const civilization of civilizations) {
    const candidates = events
      .filter(
        (event) =>
          event.civilizationIds.includes(civilization.id) &&
          ['war', 'discovery', 'state-collapse', 'extinction', 'first-contact', 'technology-transfer'].includes(event.kind)
      )
      .sort((a, b) => b.severity - a.severity || a.year - b.year)
      .slice(0, 6);

    candidates.forEach((event, index) => {
      const rng = createRng(`${settings.seed}:historical-artifact:${event.id}:${civilization.id}`);
      if (index > 1 && !rng.chance(0.58)) return;
      const creatorId = event.figureIds?.find((figureId) =>
        figures.some((figure) => figure.id === figureId && figure.civilizationId === civilization.id)
      );
      const polityName = event.polityIds
        .map((id) => polities.find((polity) => polity.id === id)?.name)
        .find(Boolean);
      const settlementName = event.settlementIds
        ?.map((id) => settlements.find((settlement) => settlement.id === id)?.name)
        .find(Boolean);
      const noun = rng.pick(artifactNouns);
      const artifact: Artifact = {
        id: eventId('artifact', `${event.id}:${civilization.id}`),
        name: `${noun} «${rng.pick(['Последний Свет', 'Сломанная Клятва', 'Первый Берег', 'Тихая Орбита', 'Красная Память', 'Нулевой День'])}»`,
        kind: event.kind === 'discovery' || event.kind === 'technology-transfer'
          ? 'научный прототип'
          : event.kind === 'war'
            ? 'военная реликвия'
            : event.kind === 'first-contact'
              ? 'дипломатический объект'
              : 'историческая реликвия',
        civilizationId: civilization.id,
        createdYear: event.year,
        creatorId,
        ownerHistory: [
          polityName ?? civilization.name,
          settlementName ?? civilization.homeSystemId,
          event.title
        ],
        value: Math.round(1_000 + event.severity * event.severity * rng.int(280, 1_500)),
        danger: clamp(event.kind === 'war' ? rng.int(3, 9) : rng.int(0, 6), 0, 10),
        truth: `Объект непосредственно связан с событием «${event.title}»: ${event.summary}`,
        publicDescription: `Предмет культуры ${civilization.name}. Его происхождение связано с крупным историческим событием.`,
        discovered: false
      };
      artifacts.push(artifact);
      event.artifactIds = [...(event.artifactIds ?? []), artifact.id];
    });
  }

  return artifacts;
}

function createRuins(
  settings: GalaxySettings,
  settlements: DeepHistoricalSettlement[],
  events: DeepTimeEvent[]
): DeepTimeRuin[] {
  return settlements
    .filter((settlement) => settlement.status !== 'active' && settlement.endedYear !== undefined)
    .map((settlement) => {
      const rng = createRng(`${settings.seed}:ruin:${settlement.id}`);
      const linkedEvents = events.filter((event) => event.settlementIds?.includes(settlement.id));
      return {
        id: eventId('deep_ruin', settlement.id),
        settlementId: settlement.id,
        civilizationId: settlement.civilizationId,
        systemId: settlement.systemId,
        planetId: settlement.planetId,
        createdYear: settlement.endedYear ?? -1,
        cause: settlement.endCause ?? 'постепенное запустение',
        integrity: clamp(rng.int(8, settlement.status === 'ruined' ? 55 : 78)),
        remains: [
          settlement.kind,
          rng.pick(['архивные слои', 'фундаменты', 'погребальные комплексы', 'промышленные отходы', 'оборонительные сооружения']),
          rng.pick(['биологические следы', 'обломки транспорта', 'керамика и инструменты', 'повреждённые записи'])
        ],
        artifactIds: Array.from(new Set(linkedEvents.flatMap((event) => event.artifactIds ?? [])))
      };
    });
}

function toHistoricalEvents(events: DeepTimeEvent[]): HistoricalEvent[] {
  return [...events]
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id))
    .map((event) => ({
      id: `history_${event.kind}_${event.id}`,
      year: event.year,
      title: event.title,
      summary: event.summary,
      civilizationIds: event.civilizationIds,
      systemIds: event.systemIds,
      figureIds: event.figureIds ?? [],
      consequences: Array.from(new Set([
        ...event.tags,
        ...(event.settlementIds ?? []).map((id) => `settlement:${id}`),
        ...(event.artifactIds ?? []).map((id) => `artifact:${id}`)
      ]))
    }));
}

export function generateDeepHistory(
  settings: GalaxySettings,
  systems: StarSystem[],
  civilizations: Civilization[],
  input: DeepTimeState
): DeepHistoryResult {
  const rng = createRng(`${settings.seed}:deep-history`);
  const events: DeepTimeEvent[] = input.events.map((event) => ({ ...event }));
  const cultures: DeepTimeCultureState[] = input.cultures.map((culture) => ({ ...culture }));
  const polities: DeepTimePolityState[] = input.polities.map((polity) => ({ ...polity }));

  for (const civilization of civilizations) {
    const generated = createHistoricalPolities(civilization, input, rng.fork(`polities:${civilization.id}`));
    polities.push(...generated.polities);
    events.push(...generated.events);
  }

  const settlements: DeepHistoricalSettlement[] = [];
  for (const civilization of civilizations) {
    const generated = createSettlements(
      civilization,
      systems,
      input,
      polities.filter((polity) => polity.civilizationId === civilization.id),
      rng.fork(`settlements:${civilization.id}`)
    );
    settlements.push(...generated.settlements);
    events.push(...generated.events);
  }

  const discoveries: DeepTechnologyDiscovery[] = [];
  for (const civilization of civilizations) {
    const generated = createDiscoveries(
      civilization,
      input,
      polities.filter((polity) => polity.civilizationId === civilization.id),
      settlements.filter((settlement) => settlement.civilizationId === civilization.id),
      rng.fork(`discoveries:${civilization.id}`)
    );
    discoveries.push(...generated.discoveries);
    events.push(...generated.events);
  }

  const internal = createInternalWars(
    civilizations,
    polities,
    settlements,
    rng.fork('internal-wars')
  );
  const wars: DeepTimeWar[] = [...internal.wars];
  const migrations: DeepTimeMigration[] = [...internal.migrations];
  events.push(...internal.events);

  for (const migration of migrations) {
    if (!migration.createdCultureId) continue;
    const sourceCulture = cultures.find((culture) => migration.cultureIds.includes(culture.id));
    if (!sourceCulture || cultures.some((culture) => culture.id === migration.createdCultureId)) continue;
    cultures.push({
      id: migration.createdCultureId,
      civilizationId: migration.civilizationId,
      name: `Диаспора ${sourceCulture.name}`,
      originYear: migration.year,
      status: 'living',
      values: sourceCulture.values,
      adaptation: 'жизнь вдали от родного региона',
      parentCultureId: sourceCulture.id
    });
  }

  const contacts = createIntercivilizationEvents(
    civilizations,
    systems,
    input,
    polities,
    settlements,
    discoveries,
    rng.fork('intercivilization')
  );
  wars.push(...contacts.wars);
  migrations.push(...contacts.migrations);
  events.push(...contacts.events);

  events.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  const figures = createFiguresFromEvents(settings, civilizations, events);
  const artifacts = createArtifactsFromEvents(
    settings,
    civilizations,
    polities,
    settlements,
    events,
    figures
  );
  const ruins = createRuins(settings, settlements, events);
  const history = toHistoricalEvents(events);

  const deepTime: DeepTimeState = {
    ...input,
    cultures,
    polities,
    events,
    historicalSettlements: settlements,
    wars,
    migrations,
    discoveries,
    ruins,
    statistics: {
      ...input.statistics,
      events: events.length,
      settlements: settlements.length,
      wars: wars.length,
      migrations: migrations.length,
      discoveries: discoveries.length,
      ruins: ruins.length,
      figures: figures.length,
      artifacts: artifacts.length
    }
  };

  return { deepTime, figures, artifacts, history };
}
