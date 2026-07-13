import type {
  Civilization,
  EquipmentId,
  Galaxy,
  Planet,
  PointOfInterest,
  PointOfInterestType,
  StarSystem
} from '../game/types';
import { createRng, stableHash } from '../generation/rng';

const typesByPlanet: Record<Planet['type'], readonly PointOfInterestType[]> = {
  rocky: ['ruin', 'wreck', 'cave', 'graveyard', 'laboratory'],
  ocean: ['biosphere', 'wreck', 'laboratory', 'settlement', 'anomaly'],
  desert: ['ruin', 'wreck', 'smugglerCamp', 'graveyard', 'ancientFactory'],
  ice: ['wreck', 'laboratory', 'cave', 'distress', 'graveyard'],
  gas: ['wreck', 'laboratory', 'distress', 'anomaly'],
  toxic: ['laboratory', 'ancientFactory', 'biosphere', 'wreck', 'anomaly'],
  jungle: ['biosphere', 'ruin', 'settlement', 'cave', 'laboratory'],
  artificial: ['ancientFactory', 'laboratory', 'settlement', 'wreck', 'anomaly'],
  anomalous: ['anomaly', 'ruin', 'laboratory', 'biosphere', 'distress']
};

const typeNames: Record<PointOfInterestType, readonly string[]> = {
  ruin: ['Погребённый комплекс', 'Город без света', 'Разрушенный архив', 'Кольцо руин'],
  wreck: ['Разбитое судно', 'Поле обломков', 'Мёртвый транспорт', 'Аварийный модуль'],
  settlement: ['Изолированное поселение', 'Скрытая колония', 'Пограничный форпост', 'Немой город'],
  laboratory: ['Запечатанная лаборатория', 'Исследовательский узел', 'Биотехнический блок', 'Комплекс наблюдения'],
  cave: ['Глубинная полость', 'Система пещер', 'Подземный разлом', 'Кристаллическая шахта'],
  ancientFactory: ['Древний завод', 'Автоматический литейный узел', 'Сборочный храм', 'Машинный колодец'],
  graveyard: ['Массовое захоронение', 'Поле саркофагов', 'Мемориальный некрополь', 'Зона останков'],
  smugglerCamp: ['Лагерь контрабандистов', 'Тайный склад', 'Чёрный причал', 'Полевой наркоцех'],
  anomaly: ['Нестабильная зона', 'Искажённый сигнал', 'Объект без массы', 'Живой туман'],
  biosphere: ['Неизвестная биосфера', 'Колония организмов', 'Движущийся лес', 'Разумный риф'],
  distress: ['Сигнал бедствия', 'Пропавшая экспедиция', 'Аварийный маяк', 'Затихший лагерь']
};

const requirements: Record<PointOfInterestType, readonly EquipmentId[]> = {
  ruin: ['scanner', 'cutter', 'translator'],
  wreck: ['cutter', 'scanner', 'oxygen'],
  settlement: ['translator', 'scanner'],
  laboratory: ['scanner', 'sampleContainer', 'cutter'],
  cave: ['scanner', 'oxygen'],
  ancientFactory: ['cutter', 'scanner', 'explosives'],
  graveyard: ['scanner', 'sampleContainer'],
  smugglerCamp: ['rifle', 'armor', 'explosives'],
  anomaly: ['scanner', 'armor'],
  biosphere: ['sampleContainer', 'scanner', 'armor'],
  distress: ['medkit', 'scanner', 'oxygen']
};

const rewardPools: Record<PointOfInterestType, readonly string[]> = {
  ruin: ['архив', 'артефакт', 'координаты', 'культурные данные'],
  wreck: ['корабельный модуль', 'чёрный ящик', 'груз', 'карта маршрута'],
  settlement: ['контакт', 'торговый доступ', 'контракт', 'местная технология'],
  laboratory: ['научные данные', 'образец', 'технология', 'опасный препарат'],
  cave: ['редкий минерал', 'биологический образец', 'скрытый проход', 'древняя камера'],
  ancientFactory: ['прототип', 'чертёж', 'военная технология', 'активный ИИ'],
  graveyard: ['генетические данные', 'личные записи', 'ритуальный предмет', 'доказательство преступления'],
  smugglerCamp: ['контрабанда', 'наркотики', 'оружие', 'данные картеля'],
  anomaly: ['аномальный материал', 'неизвестная энергия', 'координаты', 'искажённый артефакт'],
  biosphere: ['живой образец', 'лекарство', 'опасный организм', 'экологические данные'],
  distress: ['выживший', 'чёрный ящик', 'долг', 'координаты угрозы']
};

const origins: Record<PointOfInterestType, readonly string[]> = {
  ruin: ['поселение было разрушено после внутреннего конфликта', 'комплекс оставили во время массовой эвакуации', 'город вырос вокруг чужой технологии'],
  wreck: ['судно погибло при попытке скрыть груз', 'корабль был сбит неизвестным оружием', 'экипаж покинул судно до удара'],
  settlement: ['колония скрылась от собственной цивилизации', 'поселение держится на запрещённой технологии', 'жители выдают себя за другой народ'],
  laboratory: ['объект создавал биологическое оружие', 'лаборатория изучала форму жизни, принятую за природное явление', 'исследователи подделывали результаты'],
  cave: ['полости вырыты организмом', 'пещеры использовались как убежище', 'разлом ведёт к искусственной структуре'],
  ancientFactory: ['завод продолжает выполнять древний приказ', 'комплекс производил тела для цифровых личностей', 'машины уничтожили своих операторов'],
  graveyard: ['жертвы принадлежали разным видам', 'захоронение скрывает государственное преступление', 'саркофаги являются работающими капсулами'],
  smugglerCamp: ['лагерь связан с межзвёздным картелем', 'склад принадлежал правительственной разведке', 'наркотик создан из местной формы жизни'],
  anomaly: ['явление является распределённым разумом', 'объект построен цивилизацией, исчезнувшей из галактики', 'аномалия реагирует на память наблюдателя'],
  biosphere: ['экосистема представляет единый организм', 'вид был искусственно занесён сюда', 'лес хранит записи в генетической памяти'],
  distress: ['экспедиция нашла то, что не должна была', 'сигнал передаёт не выживший, а корабельный ИИ', 'лагерь уничтожен собственными членами']
};

function dangerScore(planet: Planet, index: number): PointOfInterest['danger'] {
  const order: PointOfInterest['danger'][] = ['safe', 'caution', 'danger', 'extreme'];
  const base = order.indexOf(planet.danger);
  return order[Math.max(0, Math.min(3, base + (index % 3 === 0 ? 1 : 0)))] ?? 'caution';
}

function chooseCivilization(galaxy: Galaxy, planet: Planet, system: StarSystem, index: number): Civilization | undefined {
  if (planet.civilizationId) return galaxy.civilizations.find((entry) => entry.id === planet.civilizationId);
  const candidates = galaxy.civilizations.filter((entry) => entry.controlledSystems.includes(system.id) || entry.status === 'dead');
  return candidates[index % Math.max(1, candidates.length)];
}

export function generatePointsOfInterest(galaxy: Galaxy, system: StarSystem, planet: Planet): PointOfInterest[] {
  const count = Math.max(1, Math.min(8, planet.pointsOfInterest));
  const rng = createRng(`${galaxy.seed}:poi:${system.id}:${planet.id}`);
  const pool = typesByPlanet[planet.type];
  const result: PointOfInterest[] = [];

  for (let index = 0; index < count; index += 1) {
    let type = rng.pick(pool);
    if (planet.hasLife && index === 0 && rng.chance(0.6)) type = 'biosphere';
    if (planet.civilizationId && index === 0 && rng.chance(0.7)) type = 'settlement';
    if (planet.type === 'gas' && type !== 'wreck' && type !== 'laboratory' && type !== 'distress' && type !== 'anomaly') type = 'wreck';
    const civilization = chooseCivilization(galaxy, planet, system, index);
    const age = civilization
      ? Math.max(12, Math.abs(rng.int(civilization.foundedYear, civilization.endedYear ?? -1)))
      : rng.int(20, 200_000);
    const needed = requirements[type];
    const requiredEquipment = Array.from(new Set([
      rng.pick(needed),
      ...(rng.chance(0.45) ? [rng.pick(needed)] : [])
    ]));
    const possibleRewards = Array.from(new Set([rng.pick(rewardPools[type]), rng.pick(rewardPools[type])]));
    const origin = rng.pick(origins[type]);
    const id = `poi_${stableHash(`${galaxy.seed}:${planet.id}:${index}`)}`;
    result.push({
      id,
      systemId: system.id,
      planetId: planet.id,
      name: `${rng.pick(typeNames[type])} ${index + 1}`,
      type,
      status: 'detected',
      danger: dangerScore(planet, index),
      age,
      civilizationId: civilization?.id,
      origin,
      publicSummary: `Сигнал типа «${type}». Оценочный возраст: ${age.toLocaleString('ru-RU')} лет. Данные неполные.`,
      truth: `${origin}. ${civilization ? `Объект связан с ${civilization.name}.` : 'Происхождение не установлено.'}`,
      requiredEquipment,
      possibleRewards,
      scanConfidence: rng.int(38, 72),
      visits: 0,
      discoveredYear: galaxy.currentYear
    });
  }

  return result;
}
