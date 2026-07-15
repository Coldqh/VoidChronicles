import type {
  Civilization,
  GalaxySettings,
  HistoricalEvent,
  Planet,
  StarSystem
} from '../game/types';
import { createRng, type RandomSource } from '../generation/rng';
import {
  ERA_BASE_DURATION_YEARS,
  ERA_LABELS,
  eraIndex,
  isSpacefaringEra,
  legacyTechLevelForEra,
  nextEra,
  previousEra,
  spaceAccessForEra,
  technologyTargetForEra
} from './eras';
import type {
  CivilizationDevelopmentState,
  CivilizationTechnologyProfile,
  CivilizationalEra,
  DeepTimeCultureState,
  DeepTimeEvent,
  DeepTimePolityForm,
  DeepTimePolityState,
  DeepTimeSpeciesState,
  DeepTimeState,
  EraTransition
} from './types';

export interface DeepTimeFoundationResult {
  civilizations: Civilization[];
  deepTime: DeepTimeState;
  history: HistoricalEvent[];
}

const CULTURE_PREFIXES = [
  'Речная',
  'Горная',
  'Прибрежная',
  'Кочевая',
  'Лесная',
  'Пустынная',
  'Дворцовая',
  'Островная',
  'Подземная',
  'Орбитальная'
] as const;

const CULTURE_VALUES = [
  'родовая память',
  'личная свобода',
  'воинская честь',
  'сохранение природы',
  'ритуальная чистота',
  'доказуемое знание',
  'торговая репутация',
  'служение общине',
  'право на риск',
  'неприкосновенность архивов'
] as const;

const POLITY_STEMS = [
  'Первого Берега',
  'Девяти Долин',
  'Старого Огня',
  'Внутреннего Моря',
  'Красных Гор',
  'Семи Городов',
  'Высокого Неба',
  'Свободных Рек',
  'Лунного Круга',
  'Дальних Орбит'
] as const;

const TRANSITION_REASONS: Partial<Record<CivilizationalEra, readonly string[]>> = {
  neolithic: ['одомашнивание местных организмов', 'переход к устойчивому производству пищи'],
  urban: ['рост постоянных поселений', 'появление учёта, налогов и профессионального управления'],
  bronze: ['освоение сложной металлургии', 'формирование дальних торговых связей'],
  iron: ['массовое производство прочных инструментов', 'военная и сельскохозяйственная перестройка'],
  medieval: ['стабилизация крупных государств', 'расширение письменной культуры'],
  gunpowder: ['создание метательных химических составов', 'революция в осадном и полевом оружии'],
  industrial: ['механизация производства', 'использование концентрированных источников энергии'],
  modern: ['электрификация, массовая медицина и связь', 'создание индустриального образования'],
  atomic: ['освоение ядерных процессов', 'выход науки на планетарный масштаб'],
  'early-space': ['первый устойчивый выход на орбиту', 'создание внеземной инфраструктуры'],
  interplanetary: ['постоянное заселение других миров системы', 'межпланетная экономика'],
  interstellar: ['создание надёжного межзвёздного транспорта', 'первое поселение у другой звезды'],
  advanced: ['слияние нескольких технологических направлений', 'устойчивая высокоэнергетическая экономика']
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function homePlanet(system: StarSystem | undefined): Planet | undefined {
  return [...(system?.planets ?? [])]
    .filter((planet) => planet.type !== 'gas')
    .sort((a, b) => b.habitability - a.habitability)[0];
}

function populationMultiplierForEra(era: CivilizationalEra): number {
  const index = eraIndex(era);
  if (index <= eraIndex('neolithic')) return 1.35;
  if (index <= eraIndex('medieval')) return 1.7;
  if (index <= eraIndex('modern')) return 2.1;
  if (index <= eraIndex('interplanetary')) return 1.55;
  return 1.25;
}

function collapseRiskForEra(era: CivilizationalEra): number {
  if (era === 'tribal') return 0.025;
  if (era === 'urban' || era === 'bronze') return 0.035;
  if (era === 'industrial') return 0.055;
  if (era === 'atomic') return 0.13;
  if (era === 'early-space') return 0.075;
  if (era === 'interstellar') return 0.05;
  return 0.025;
}

function polityFormForEra(era: CivilizationalEra, rng: RandomSource): DeepTimePolityForm {
  if (eraIndex(era) <= eraIndex('tribal')) return rng.pick(['band', 'tribal-confederation'] as const);
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
  if (form === 'band') return 'Род';
  if (form === 'tribal-confederation') return 'Союз племён';
  if (form === 'city-state') return 'Город';
  if (form === 'kingdom') return 'Королевство';
  if (form === 'empire') return 'Империя';
  if (form === 'republic') return 'Республика';
  if (form === 'theocracy') return 'Священный союз';
  if (form === 'industrial-state') return 'Индустриальная держава';
  if (form === 'planetary-union') return 'Планетарный союз';
  if (form === 'orbital-polity') return 'Орбитальная администрация';
  if (form === 'interplanetary-state') return 'Межпланетная лига';
  return 'Звёздный доминион';
}

function transitionReason(to: CivilizationalEra, rng: RandomSource): string {
  const reasons = TRANSITION_REASONS[to];
  return reasons?.length ? rng.pick(reasons) : 'накопление знаний и изменение общественного устройства';
}

function mergeTechnology(
  previous: CivilizationTechnologyProfile,
  era: CivilizationalEra,
  rng: RandomSource
): CivilizationTechnologyProfile {
  const target = technologyTargetForEra(era);
  return Object.fromEntries(
    Object.entries(target).map(([field, value]) => [
      field,
      clamp(Math.max(previous[field as keyof CivilizationTechnologyProfile], value + rng.int(-5, 5)))
    ])
  ) as CivilizationTechnologyProfile;
}

function territoryForEra(civilization: Civilization, era: CivilizationalEra): string[] {
  const available = unique([civilization.homeSystemId, ...(civilization.expansionCandidateSystemIds ?? civilization.controlledSystems)]);
  if (eraIndex(era) < eraIndex('interstellar')) return [civilization.homeSystemId];
  if (era === 'interstellar') return available.slice(0, Math.max(2, Math.min(4, available.length)));
  return available;
}

function createCultures(
  civilization: Civilization,
  era: CivilizationalEra,
  sapienceYear: number,
  extinctionYear: number | undefined,
  rng: RandomSource
): DeepTimeCultureState[] {
  const index = eraIndex(era);
  const count = Math.max(1, Math.min(5, 1 + Math.floor(index / 3) + rng.int(0, 1)));
  return Array.from({ length: count }, (_, cultureIndex) => {
    const originYear = Math.min(
      -1,
      sapienceYear + Math.round((Math.max(1, -sapienceYear) * (cultureIndex + 1)) / (count + 2))
    );
    return {
      id: `deep_culture_${civilization.id}_${cultureIndex}`,
      civilizationId: civilization.id,
      name: `${rng.pick(CULTURE_PREFIXES)} культура ${civilization.speciesName}`,
      originYear,
      endedYear: extinctionYear,
      status: extinctionYear !== undefined ? 'extinct' : cultureIndex > 0 && rng.chance(0.18) ? 'absorbed' : 'living',
      values: unique([rng.pick(CULTURE_VALUES), rng.pick(CULTURE_VALUES), rng.pick(CULTURE_VALUES)]),
      adaptation: civilization.speciesProfile?.homeAdaptation ?? 'родная биосфера',
      parentCultureId: cultureIndex > 0 ? `deep_culture_${civilization.id}_0` : undefined
    };
  });
}

function createPolities(
  civilization: Civilization,
  era: CivilizationalEra,
  currentPopulation: number,
  cultures: DeepTimeCultureState[],
  currentTerritory: string[],
  foundedYear: number,
  extinctionYear: number | undefined,
  rng: RandomSource
): DeepTimePolityState[] {
  const index = eraIndex(era);
  const count = index <= eraIndex('tribal')
    ? rng.int(1, 3)
    : index <= eraIndex('medieval')
      ? rng.int(2, 5)
      : index <= eraIndex('atomic')
        ? rng.int(1, 4)
        : rng.int(1, 3);

  return Array.from({ length: count }, (_, polityIndex) => {
    const form = polityFormForEra(era, rng);
    const population = Math.max(50, Math.round(currentPopulation / count * (0.75 + rng.next() * 0.5)));
    return {
      id: `deep_polity_${civilization.id}_${polityIndex}`,
      civilizationId: civilization.id,
      name: `${polityPrefix(form)} ${rng.pick(POLITY_STEMS)}`,
      form,
      status: extinctionYear !== undefined ? 'collapsed' : polityIndex > 0 && rng.chance(0.12) ? 'absorbed' : 'active',
      formedYear: Math.min(-1, foundedYear + rng.int(0, Math.max(1, Math.floor(Math.abs(foundedYear) * 0.4)))),
      endedYear: extinctionYear,
      capitalSystemId: currentTerritory[polityIndex % currentTerritory.length] ?? civilization.homeSystemId,
      territorySystemIds: currentTerritory,
      cultureIds: cultures.length ? [cultures[polityIndex % cultures.length]!.id] : [],
      population,
      stability: clamp(rng.int(35, 82)),
      legitimacy: clamp(rng.int(25, 88)),
      military: clamp(Math.round(index * 5.5 + rng.int(5, 28)))
    };
  });
}

function rebuildTerritoryMarkers(systems: StarSystem[], civilizations: Civilization[]): void {
  const civilizationIds = new Set(civilizations.map((civilization) => civilization.id));

  for (const system of systems) {
    system.civilizationIds = system.civilizationIds.filter((id) => !civilizationIds.has(id));
    if (system.factionId && civilizationIds.has(system.factionId)) system.factionId = undefined;
    for (const planet of system.planets) {
      if (planet.civilizationId && civilizationIds.has(planet.civilizationId)) {
        planet.civilizationId = undefined;
      }
    }
  }

  for (const civilization of civilizations) {
    for (const systemId of civilization.controlledSystems) {
      const system = systems.find((entry) => entry.id === systemId);
      if (!system) continue;
      if (!system.civilizationIds.includes(civilization.id)) {
        system.civilizationIds.push(civilization.id);
      }
      if (
        civilization.status === 'living' &&
        civilization.development?.spaceAccess !== 'none' &&
        !system.factionId
      ) {
        system.factionId = civilization.id;
      }
    }

    const home = systems.find((system) => system.id === civilization.homeSystemId);
    const planet = homePlanet(home);
    if (planet) planet.civilizationId = civilization.id;
  }
}

export function buildDeepTimeFoundation(
  settings: GalaxySettings,
  systems: StarSystem[],
  inputCivilizations: Civilization[]
): DeepTimeFoundationResult {
  const species: DeepTimeSpeciesState[] = [];
  const cultures: DeepTimeCultureState[] = [];
  const polities: DeepTimePolityState[] = [];
  const transitions: EraTransition[] = [];
  const events: DeepTimeEvent[] = [];
  const developmentByCivilization: Record<string, CivilizationDevelopmentState> = {};
  const civilizations: Civilization[] = [];

  for (const original of inputCivilizations) {
    const rng = createRng(`${settings.seed}:deep-time:${original.id}`);
    const home = systems.find((system) => system.id === original.homeSystemId);
    const planet = homePlanet(home);
    if (!home || !planet) continue;

    const maximumAge = Math.max(500, settings.historyYears);
    const civilizationAge = Math.max(
      250,
      Math.round(maximumAge * (0.0002 + Math.pow(rng.next(), 3.7) * 0.9998))
    );
    const sapienceYear = -Math.min(maximumAge, civilizationAge);
    const biologicalOriginYear = Math.max(
      -maximumAge,
      sapienceYear - Math.round(maximumAge * (0.02 + rng.next() * 0.22))
    );

    const speciesState: DeepTimeSpeciesState = {
      id: `deep_species_${original.id}`,
      civilizationId: original.id,
      name: original.speciesName,
      originPlanetId: planet.id,
      biologicalOriginYear,
      sapienceYear,
      status: 'extant',
      population: rng.int(8_000, 180_000),
      adaptability: rng.int(25, 92),
      cooperation: rng.int(20, 95),
      aggression: rng.int(10, 88),
      cognition: rng.int(55, 96),
      homeEnvironment: `${planet.type}, пригодность ${planet.habitability}/100`
    };

    events.push({
      id: `deep_event_origin_${original.id}`,
      year: biologicalOriginYear,
      kind: 'biological-origin',
      title: `${original.speciesName}: сформировалась устойчивая линия`,
      summary: `На мире ${planet.name} закрепилась линия организмов, из которой позднее возник разумный вид.`,
      severity: 2,
      civilizationIds: [original.id],
      polityIds: [],
      systemIds: [home.id],
      tags: ['biology', 'origin']
    });
    events.push({
      id: `deep_event_sapience_${original.id}`,
      year: sapienceYear,
      kind: 'sapience',
      title: `${original.speciesName}: возникновение разумного поведения`,
      summary: 'Популяции начали передавать сложные навыки, создавать устойчивые социальные группы и изменять среду.',
      severity: 5,
      civilizationIds: [original.id],
      polityIds: [],
      systemIds: [home.id],
      tags: ['sapience', 'society']
    });

    let era: CivilizationalEra = 'tribal';
    let eraStartedYear = sapienceYear;
    let year = sapienceYear;
    let population = speciesState.population;
    let stability = rng.int(42, 78);
    let ecologicalPressure = rng.int(1, 12);
    let innovation = rng.int(35, 86);
    let regressions = 0;
    let technology = technologyTargetForEra(era);
    let extinctionYear: number | undefined;
    let extinctionCause: string | undefined;
    const pace = 0.38 + rng.next() * 1.55;
    const stagnation = 0.72 + rng.next() * 2.4;

    for (let iteration = 0; iteration < 80 && year < 0; iteration += 1) {
      const upcoming = nextEra(era);
      if (!upcoming) break;

      const baseDuration = ERA_BASE_DURATION_YEARS[era];
      const duration = Math.max(
        1,
        Math.round(baseDuration * stagnation * (0.72 + rng.next() * 0.72) / pace)
      );
      const transitionYear = year + duration;
      if (transitionYear >= 0) break;

      const eraRisk = collapseRiskForEra(era);
      const ecologicalRisk = ecologicalPressure / 1_800;
      const aggressionRisk = speciesState.aggression / 2_400;
      const extinctionRisk = eraRisk + ecologicalRisk + aggressionRisk;
      const crisisRoll = rng.next();

      if (crisisRoll < extinctionRisk) {
        extinctionYear = transitionYear;
        extinctionCause = era === 'atomic'
          ? rng.pick(['планетарная война', 'неуправляемая технологическая катастрофа', 'разрушение биосферы'])
          : era === 'industrial'
            ? rng.pick(['экологический коллапс', 'ресурсный крах', 'серия пандемий и войн'])
            : rng.pick(['длительный климатический кризис', 'межгосударственная война', 'разрушение пищевой системы']);
        population = 0;
        speciesState.status = 'extinct';
        speciesState.population = 0;
        events.push({
          id: `deep_event_extinction_${original.id}`,
          year: extinctionYear,
          kind: 'extinction',
          title: `${original.speciesName}: окончательное исчезновение`,
          summary: `Последние самостоятельные популяции исчезли. Причина: ${extinctionCause}.`,
          severity: 10,
          civilizationIds: [original.id],
          polityIds: [],
          systemIds: [home.id],
          tags: ['extinction', era]
        });
        break;
      }

      const canRegress = eraIndex(era) >= eraIndex('urban') && regressions < 4;
      const regressionRisk = 0.035 + Math.max(0, 55 - stability) / 500 + ecologicalPressure / 1_200;
      if (canRegress && crisisRoll < extinctionRisk + regressionRisk) {
        const from = era;
        const to = previousEra(era);
        regressions += 1;
        year = transitionYear;
        era = to;
        eraStartedYear = year;
        population = Math.max(500, Math.round(population * (0.2 + rng.next() * 0.55)));
        stability = clamp(stability - rng.int(12, 34));
        ecologicalPressure = clamp(ecologicalPressure - rng.int(2, 12));
        const transition: EraTransition = {
          id: `deep_transition_regression_${original.id}_${regressions}_${year}`,
          civilizationId: original.id,
          from,
          to,
          year,
          reason: rng.pick(['война и распад институтов', 'эпидемия и потеря специализации', 'ресурсный кризис', 'разрушение инфраструктуры']),
          regression: true
        };
        transitions.push(transition);
        events.push({
          id: `deep_event_${transition.id}`,
          year,
          kind: 'regression',
          title: `${original.name}: откат в эпоху «${ERA_LABELS[to]}»`,
          summary: `Цивилизация потеряла часть инфраструктуры и знаний. Причина: ${transition.reason}.`,
          severity: 8,
          civilizationIds: [original.id],
          polityIds: [],
          systemIds: [home.id],
          tags: ['regression', from, to]
        });
        continue;
      }

      const from = era;
      era = upcoming;
      year = transitionYear;
      eraStartedYear = year;
      technology = mergeTechnology(technology, era, rng);
      population = Math.min(
        9_000_000_000_000,
        Math.round(population * populationMultiplierForEra(era) * (0.82 + rng.next() * 0.5))
      );
      stability = clamp(stability + rng.int(-8, 12));
      innovation = clamp(innovation + rng.int(-4, 9));
      ecologicalPressure = clamp(
        ecologicalPressure +
          (eraIndex(era) >= eraIndex('industrial') ? rng.int(5, 16) : rng.int(-2, 5))
      );

      const transition: EraTransition = {
        id: `deep_transition_${original.id}_${era}_${year}`,
        civilizationId: original.id,
        from,
        to: era,
        year,
        reason: transitionReason(era, rng),
        regression: false
      };
      transitions.push(transition);
      events.push({
        id: `deep_event_${transition.id}`,
        year,
        kind: 'era-transition',
        title: `${original.name}: ${ERA_LABELS[era]}`,
        summary: `Переход вызван изменением производства, знаний и устройства общества: ${transition.reason}.`,
        severity: Math.min(8, 3 + Math.floor(eraIndex(era) / 2)),
        civilizationIds: [original.id],
        polityIds: [],
        systemIds: [home.id],
        tags: ['era', from, era]
      });
    }

    const hidden =
      extinctionYear === undefined &&
      eraIndex(era) >= eraIndex('interstellar') &&
      (original.traits.includes('secretive') || rng.chance(0.14));
    const status: Civilization['status'] = extinctionYear !== undefined ? 'dead' : hidden ? 'hidden' : 'living';
    const currentTerritory = territoryForEra(original, era);
    const civilizationCultures = createCultures(original, era, sapienceYear, extinctionYear, rng);
    const civilizationPolities = createPolities(
      original,
      era,
      population,
      civilizationCultures,
      currentTerritory,
      sapienceYear,
      extinctionYear,
      rng
    );

    cultures.push(...civilizationCultures);
    polities.push(...civilizationPolities);
    species.push(speciesState);

    for (const polity of civilizationPolities) {
      events.push({
        id: `deep_event_polity_${polity.id}`,
        year: polity.formedYear,
        kind: 'state-formation',
        title: `${polity.name}: формирование государства`,
        summary: `Политическая структура типа «${polity.form}» закрепила управление частью населения.`,
        severity: 4,
        civilizationIds: [original.id],
        polityIds: [polity.id],
        systemIds: polity.territorySystemIds,
        tags: ['polity', polity.form]
      });
    }

    const development: CivilizationDevelopmentState = {
      civilizationId: original.id,
      era,
      eraStartedYear,
      technology,
      population,
      urbanization: clamp(eraIndex(era) * 7 + rng.int(-5, 8)),
      literacy: clamp(Math.max(0, (eraIndex(era) - eraIndex('urban') + 1) * 9 + rng.int(-5, 8))),
      industrialization: clamp(Math.max(0, (eraIndex(era) - eraIndex('industrial') + 1) * 22 + rng.int(-4, 8))),
      energyUse: clamp(eraIndex(era) * 6.8 + rng.int(-5, 7)),
      ecologicalPressure,
      stability,
      innovation,
      spaceAccess: spaceAccessForEra(era),
      regressionCount: regressions,
      collapseRisk: clamp(collapseRiskForEra(era) * 100 + ecologicalPressure * 0.45 + Math.max(0, 50 - stability) * 0.5),
      extinct: extinctionYear !== undefined,
      extinctionYear
    };
    developmentByCivilization[original.id] = development;

    civilizations.push({
      ...original,
      status,
      techLevel: legacyTechLevelForEra(era),
      controlledSystems: currentTerritory,
      foundedYear: sapienceYear,
      endedYear: extinctionYear,
      era,
      technology,
      development,
      deepTimeCultureIds: civilizationCultures.map((culture) => culture.id),
      deepTimePolityIds: civilizationPolities.map((polity) => polity.id),
      extinctionCause
    });
  }

  rebuildTerritoryMarkers(systems, civilizations);

  events.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  transitions.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

  const history: HistoricalEvent[] = events.map((event) => ({
    id: `history_${event.kind}_${event.id}`,
    year: event.year,
    title: event.title,
    summary: event.summary,
    civilizationIds: event.civilizationIds,
    systemIds: event.systemIds,
    figureIds: [],
    consequences: event.tags
  }));

  const living = civilizations.filter((civilization) => civilization.status === 'living').length;
  const dead = civilizations.filter((civilization) => civilization.status === 'dead').length;
  const hiddenCount = civilizations.filter((civilization) => civilization.status === 'hidden').length;
  const spacefaring = civilizations.filter((civilization) => civilization.era && isSpacefaringEra(civilization.era)).length;

  const deepTime: DeepTimeState = {
    version: 1,
    startYear: -settings.historyYears,
    endYear: 0,
    species,
    cultures,
    polities,
    civilizations: developmentByCivilization,
    transitions,
    events,
    statistics: {
      generatedCivilizations: civilizations.length,
      livingCivilizations: living,
      extinctCivilizations: dead,
      hiddenCivilizations: hiddenCount,
      preSpaceCivilizations: civilizations.length - spacefaring,
      spacefaringCivilizations: spacefaring,
      transitions: transitions.length,
      regressions: transitions.filter((transition) => transition.regression).length,
      events: events.length
    }
  };

  return { civilizations, deepTime, history };
}
