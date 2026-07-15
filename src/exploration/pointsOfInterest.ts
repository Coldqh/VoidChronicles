import type {
  ExpeditionObjective,
  Galaxy,
  Planet,
  PointOfInterest,
  StarSystem
} from '../game/types';
import { stableHash } from '../generation/rng';
import { buildExpeditionLoreSources } from './lore';

const tutorialObjective: ExpeditionObjective = {
  kind: 'recover-black-box',
  title: 'Восстановить навигационный архив',
  description: 'Добраться до аварийного ретранслятора, снять журнал маршрута и получить технический образец.',
  requiredObjects: 2,
  requiredEvidence: 1,
  completionText: 'Маршрут восстановлен; архив ретранслятора добавлен в навигационную базу.'
};

function tutorialPoint(galaxy: Galaxy, system: StarSystem, planet: Planet): PointOfInterest {
  return {
    id: `poi_${stableHash(`${galaxy.seed}:${planet.id}:tutorial`)}`,
    systemId: system.id,
    planetId: planet.id,
    name: 'Аварийный ретранслятор «Эхо»',
    type: 'wreck',
    status: 'detected',
    danger: 'caution',
    age: 17,
    origin: 'ретранслятор потерял связь после аварии сервисного дрона',
    publicSummary: 'Слабый гражданский сигнал. Подтверждён корпус аварийного ретранслятора, но состояние архива неизвестно.',
    confirmedSummary: 'Сервисный дрон повредил питание. Навигационный архив пережил аварию и содержит первый маршрут за пределы стартовой системы.',
    truth: 'Ретранслятор повреждён, но его архив содержит первый подтверждённый маршрут за пределы стартовой системы.',
    requiredEquipment: ['scanner'],
    possibleRewards: ['навигационный архив', 'технический образец'],
    scanConfidence: 88,
    visits: 0,
    discoveredYear: galaxy.currentYear,
    access: 'surface',
    sourceEventIds: [],
    artifactIds: [],
    figureIds: [],
    polityIds: [],
    loreTags: ['tutorial', 'navigation', 'wreck'],
    objective: tutorialObjective,
    completionSummary: tutorialObjective.completionText
  };
}

export function generatePointsOfInterest(galaxy: Galaxy, system: StarSystem, planet: Planet): PointOfInterest[] {
  if (planet.imageKey === 'tutorial-target') return [tutorialPoint(galaxy, system, planet)];

  const desiredCount = Math.max(1, Math.min(8, planet.pointsOfInterest));
  const sources = buildExpeditionLoreSources(galaxy, system, planet).slice(0, desiredCount);
  const usedNames = new Set<string>();

  return sources.map((source, index) => {
    let name = source.name;
    if (usedNames.has(name)) name = `${source.name} · ${planet.name}`;
    usedNames.add(name);
    return {
      id: `poi_${stableHash(`${galaxy.seed}:${planet.id}:${source.key}:${index}`)}`,
      systemId: system.id,
      planetId: planet.id,
      name,
      type: source.type,
      status: 'detected',
      danger: source.danger,
      age: source.age,
      civilizationId: source.civilizationId,
      origin: source.origin,
      publicSummary: source.publicSummary,
      confirmedSummary: source.confirmedSummary,
      truth: source.truth,
      requiredEquipment: source.requiredEquipment,
      possibleRewards: source.possibleRewards,
      scanConfidence: Math.max(38, Math.min(92, 46 + source.sourceEventIds.length * 8 + (source.ruinId ? 8 : 0) + (source.artifactIds.length ? 6 : 0))),
      visits: 0,
      discoveredYear: galaxy.currentYear,
      access: source.access,
      sourceEventIds: source.sourceEventIds,
      historicalSettlementId: source.historicalSettlementId,
      ruinId: source.ruinId,
      warId: source.warId,
      artifactIds: source.artifactIds,
      figureIds: source.figureIds,
      polityIds: source.polityIds,
      loreTags: source.loreTags,
      objective: source.objective,
      completionSummary: source.objective.completionText
    } satisfies PointOfInterest;
  });
}

const fallbackSectors = [
  'Северный уступ',
  'Нижний разлом',
  'Приполярная впадина',
  'Теневой склон',
  'Экваториальный шрам',
  'Подповерхностная камера',
  'Дальний кратер',
  'Западная гряда'
] as const;

function planetaryFallback(
  galaxy: Galaxy,
  system: StarSystem,
  planet: Planet,
  previous: PointOfInterest,
  index: number
): PointOfInterest {
  const sector = fallbackSectors[index % fallbackSectors.length]!;
  const biological = planet.hasLife;
  const anomalous = planet.type === 'anomalous' || system.anomaly;
  const type: PointOfInterest['type'] = anomalous ? 'anomaly' : biological ? 'biosphere' : 'cave';
  const objective: ExpeditionObjective = anomalous
    ? { kind: 'investigate-anomaly', title: `Проверить ${sector.toLowerCase()}`, description: `Провести независимые измерения в секторе «${planet.name}: ${sector}».`, requiredObjects: 3, requiredEvidence: 3, completionText: 'Аномальные показания проверены несколькими измерениями.' }
    : biological
      ? { kind: 'collect-sample', title: `Исследовать ${sector.toLowerCase()}`, description: `Изолировать образцы локальной экосистемы в секторе «${planet.name}: ${sector}».`, requiredObjects: 2, requiredEvidence: 2, completionText: 'Образцы изолированы и привязаны к среде планеты.' }
      : { kind: 'document-site', title: `Картировать ${sector.toLowerCase()}`, description: `Задокументировать геологическое строение сектора «${planet.name}: ${sector}».`, requiredObjects: 2, requiredEvidence: 2, completionText: 'Геологическая структура сектора добавлена в каталог.' };
  return {
    ...previous,
    name: anomalous ? `Аномальный сектор «${planet.name}: ${sector}»` : biological ? `Биосферный сектор «${planet.name}: ${sector}»` : `Геологический сектор «${planet.name}: ${sector}»`,
    type,
    danger: planet.danger,
    age: Math.max(1, previous.age || 10_000),
    civilizationId: undefined,
    origin: anomalous ? 'устойчивое отклонение приборов' : biological ? 'самостоятельная локальная экосистема' : 'естественная геологическая структура',
    publicSummary: anomalous ? 'Зафиксировано устойчивое отклонение без подтверждённого искусственного источника.' : biological ? 'Обнаружена самостоятельная биологическая активность.' : 'Под поверхностью выявлена естественная структура без искусственных сигналов.',
    confirmedSummary: anomalous ? 'Сигнал повторяется и требует нескольких независимых измерений.' : biological ? 'Сектор пригоден для контролируемого отбора образцов.' : 'Сектор имеет естественное происхождение и представляет научную ценность.',
    truth: anomalous ? 'Связь аномалии с древними цивилизациями не доказана.' : biological ? 'На объекте нет спрятанного древнего артефакта; ценность представляет сама экосистема.' : 'На объекте нет руин или артефакта; это природная геологическая локация.',
    requiredEquipment: anomalous ? ['scanner', 'armor'] : biological ? ['sampleContainer', 'scanner'] : ['scanner', 'oxygen'],
    possibleRewards: anomalous ? ['аномальные измерения'] : biological ? ['биологические образцы', 'экологические данные'] : ['геологические данные', 'минеральный образец'],
    scanConfidence: Math.max(45, previous.scanConfidence),
    access: 'surface',
    sourceEventIds: [],
    historicalSettlementId: undefined,
    ruinId: undefined,
    warId: undefined,
    artifactIds: [],
    figureIds: [],
    polityIds: [],
    loreTags: [anomalous ? 'anomaly' : biological ? 'biosphere' : 'geology', 'migrated-v030'],
    objective,
    completionSummary: objective.completionText,
    discoveredYear: previous.discoveredYear || galaxy.currentYear
  };
}

/**
 * Rebinds only untouched legacy signals. Visited/resolved locations remain exactly as the player remembers them.
 * Existing IDs are preserved so contracts, tutorial targets and archaeology chains do not break.
 */
export function refreshLoreboundPoints(
  galaxy: Galaxy,
  system: StarSystem,
  planet: Planet,
  existing: PointOfInterest[]
): PointOfInterest[] {
  if (!existing.length) return generatePointsOfInterest(galaxy, system, planet);
  const generated = generatePointsOfInterest(galaxy, system, planet);
  let generatedIndex = 0;
  let fallbackIndex = 0;
  return existing.map((point) => {
    if (point.visits > 0 || point.status !== 'detected') return point;
    const source = generated[generatedIndex++];
    const replacement = source ?? planetaryFallback(galaxy, system, planet, point, fallbackIndex++);
    return {
      ...replacement,
      id: point.id,
      status: point.status,
      visits: point.visits,
      discoveredYear: point.discoveredYear,
      lastVisitedYear: point.lastVisitedYear
    };
  });
}
