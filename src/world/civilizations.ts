import type {
  ArchaeologyChain,
  Civilization,
  CivilizationContact,
  Galaxy,
  Hub,
  HubDistrict,
  LocalNpc,
  LocalNpcRole
} from '../game/types';
import { createRng } from '../generation/rng';

const bodyPlans = ['двустороннее тело с четырьмя конечностями', 'радиальная форма с шестью рабочими отростками', 'колониальный организм из связанных особей', 'мягкотелая амфибийная форма', 'минерально-органический панцирный организм', 'искусственно выращенное модульное тело'];
const metabolisms = ['кислородный белковый обмен', 'аммиачный обмен', 'медленный кремниевый обмен', 'фотохимический обмен', 'симбиоз нескольких микроорганизмов', 'электрохимическое питание'];
const reproduction = ['парное живорождение', 'кладки с коллективным воспитанием', 'почкование колоний', 'генетическая сборка в инкубаторах', 'сезонные споровые циклы', 'копирование личности в выращенное тело'];
const adaptations = ['высокая гравитация', 'глубокие океаны', 'вечная темнота', 'токсичная атмосфера', 'низкая температура', 'сильная радиация', 'искусственные среды'];
const unusualTraits = ['воспринимают магнитные поля', 'обмениваются памятью при контакте', 'не различают личную и коллективную собственность', 'сохраняют части личности в произведениях искусства', 'меняют пол и социальную роль в течение жизни', 'считают сновидения юридическими свидетельствами'];
const values = ['точность обещаний', 'семейная память', 'личная свобода', 'служение общине', 'доказуемая истина', 'военная честь', 'богатство рода', 'сохранение биосферы', 'право на риск'];
const taboos = ['осквернение останков', 'скрытая запись разговора', 'торговля живыми организмами', 'публичное снятие маски', 'копирование личности', 'уничтожение архивов', 'прикосновение к чужому оружию'];
const artForms = ['резонансная архитектура', 'живые ткани', 'памятные запахи', 'гравитационная скульптура', 'ритуальная драматургия', 'хоровые вычисления', 'кинетические сады'];
const scripts = ['узловое письмо', 'многослойные пиктограммы', 'цветовые последовательности', 'ритмическая запись', 'объёмные глифы', 'логографическая сетка'];
const doctrines = ['личность существует, пока её помнят', 'мир обязан быть исследован', 'материя священна и не должна копироваться', 'истина принадлежит тому, кто заплатил её цену', 'предки продолжают судить живых', 'разум является временной формой океана'];
const governments = ['совет родов', 'экзаменационная республика', 'военная директория', 'торговая олигархия', 'теократический синод', 'распределённая сеть граждан', 'наследственная монархия'];
const outsiderPolicies = ['открытая торговля под наблюдением', 'осторожный научный обмен', 'изоляция до проверки намерений', 'ритуальное гостеприимство', 'контакт только через назначенных посредников', 'враждебность к незарегистрированным кораблям'];
const socialClasses = ['навигационные семьи', 'архивисты', 'свободные ремесленники', 'военные дома', 'долговые работники', 'жреческие коллегии', 'полноправные граждане', 'приписанные колонисты'];
const extinctionCauses = ['война между орбитальными государствами', 'неудачный климатический проект', 'эпидемия, скрытая властями', 'восстание автономных машин', 'религиозный раскол и массовая эвакуация', 'истощение ключевого ресурса', 'внешнее нападение неизвестного происхождения'];
const originMysteries = ['в древнейших геномах присутствует чужая правка', 'первые города старше официальной истории', 'родной мир не совпадает с биологической адаптацией вида', 'ранние архивы описывают уже существующие звёздные карты', 'основатель цивилизации мог быть цифровой личностью'];
const districtFunctions = ['жилой сектор', 'рынок и доки', 'научный квартал', 'медицинский блок', 'храмовый район', 'промышленная зона', 'старые нижние уровни', 'административное кольцо'];
const npcRoles: LocalNpcRole[] = ['administrator', 'merchant', 'scientist', 'doctor', 'fixer', 'priest', 'guard', 'resident'];
const npcGiven = ['Арен', 'Мира', 'Кеш', 'Тован', 'Ирис', 'Ваал', 'Нера', 'Сорин', 'Дакс', 'Яра', 'Омен', 'Тесс', 'Рай', 'Лио', 'Саэль'];
const npcFamily = ['Вейл', 'Оррикс', 'Таал', 'Немер', 'Серр', 'Каэль', 'Восс', 'Илиан', 'Кор', 'Марет', 'Дал', 'Рин'];

function pickMany<T>(pool: readonly T[], count: number, seed: string): T[] {
  const rng = createRng(seed);
  const copy = [...pool];
  const result: T[] = [];
  while (copy.length > 0 && result.length < count) {
    result.push(copy.splice(rng.int(0, copy.length - 1), 1)[0]!);
  }
  return result;
}

export function enrichCivilization(civilization: Civilization, galaxySeed: string): Civilization {
  if (civilization.speciesProfile && civilization.cultures?.length && civilization.languages?.length && civilization.states?.length) return civilization;
  const rng = createRng(`${galaxySeed}:civilization-detail:${civilization.id}`);
  const languageCount = civilization.status === 'dead' ? rng.int(1, 3) : rng.int(1, 2);
  const languages = Array.from({ length: languageCount }, (_, index) => ({
    id: `lang_${civilization.id}_${index}`,
    name: `${civilization.speciesName} ${['высокий', 'торговый', 'старый'][index] ?? `диалект ${index + 1}`}`,
    script: rng.pick(scripts),
    complexity: rng.int(2, 9)
  }));
  const religionCount = rng.int(1, 2);
  const religions = Array.from({ length: religionCount }, (_, index) => ({
    id: `religion_${civilization.id}_${index}`,
    name: `${rng.pick(['Путь', 'Хор', 'Завет', 'Память', 'Учение'])} ${rng.pick(['Первой Орбиты', 'Глубокого Света', 'Спящих Предков', 'Неразделённого Моря', 'Последней Формы'])}`,
    doctrine: rng.pick(doctrines),
    taboos: pickMany(taboos, 2, `${galaxySeed}:${civilization.id}:religion:${index}:taboo`),
    sacredObjects: pickMany(['останки основателей', 'навигационные карты', 'ритуальное оружие', 'архивные кристаллы', 'семена родного мира', 'маски правителей'], 2, `${galaxySeed}:${civilization.id}:religion:${index}:objects`)
  }));
  const cultureCount = civilization.status === 'living' ? rng.int(2, 4) : rng.int(1, 3);
  const cultures = Array.from({ length: cultureCount }, (_, index) => ({
    id: `culture_${civilization.id}_${index}`,
    name: `${rng.pick(['Орбитальная', 'Прибрежная', 'Пограничная', 'Династическая', 'Архивная', 'Кочевая'])} культура ${civilization.speciesName}`,
    values: pickMany(values, 3, `${galaxySeed}:${civilization.id}:culture:${index}:values`),
    taboos: pickMany(taboos, 2, `${galaxySeed}:${civilization.id}:culture:${index}:taboos`),
    artForms: pickMany(artForms, 2, `${galaxySeed}:${civilization.id}:culture:${index}:arts`),
    languageId: languages[index % languages.length]!.id,
    religionIds: rng.chance(0.28) ? [] : [religions[index % religions.length]!.id]
  }));
  const stateCount = civilization.status === 'living' ? rng.int(1, Math.min(4, Math.max(1, civilization.controlledSystems.length))) : rng.int(1, 3);
  const stateSystems = civilization.controlledSystems.length > 0 ? civilization.controlledSystems : [civilization.homeSystemId];
  const states = Array.from({ length: stateCount }, (_, index) => ({
    id: `state_${civilization.id}_${index}`,
    name: `${rng.pick(['Союз', 'Доминион', 'Республика', 'Синод', 'Династия', 'Лига'])} ${rng.pick(['Внутренних Миров', 'Семи Портов', 'Первой Памяти', 'Свободных Колоний', 'Стеклянных Орбит'])}`,
    government: rng.pick(governments),
    capitalSystemId: stateSystems[index % stateSystems.length]!,
    status: civilization.status === 'living' ? 'active' as const : rng.chance(0.25) ? 'exiled' as const : 'collapsed' as const,
    outsiderPolicy: rng.pick(outsiderPolicies)
  }));
  return {
    ...civilization,
    speciesProfile: {
      bodyPlan: rng.pick(bodyPlans),
      metabolism: rng.pick(metabolisms),
      reproduction: rng.pick(reproduction),
      lifespan: rng.int(35, 480),
      homeAdaptation: rng.pick(adaptations),
      unusualTrait: rng.pick(unusualTraits)
    },
    languages,
    religions,
    cultures,
    states,
    socialClasses: pickMany(socialClasses, rng.int(3, 6), `${galaxySeed}:${civilization.id}:classes`),
    outsiderPolicy: rng.pick(outsiderPolicies),
    originMystery: rng.pick(originMysteries),
    extinctionCause: civilization.status === 'dead' ? rng.pick(extinctionCauses) : undefined
  };
}

export function enrichGalaxyCivilizations(galaxy: Galaxy): Galaxy {
  return {
    ...galaxy,
    civilizations: galaxy.civilizations.map((civilization) => enrichCivilization(civilization, galaxy.seed))
  };
}

function makeDistricts(hub: Hub, galaxySeed: string): HubDistrict[] {
  const rng = createRng(`${galaxySeed}:hub-districts:${hub.id}`);
  return Array.from({ length: rng.int(3, 6) }, (_, index) => {
    const fn = rng.pick(districtFunctions);
    return {
      id: `district_${hub.id}_${index}`,
      name: `${rng.pick(['Кольцо', 'Сектор', 'Ярус', 'Узел', 'Квартал'])} ${rng.pick(['Альфа', 'Меридиан', 'Синий', 'Старый', 'Внешний', 'Нижний'])}`,
      function: fn,
      safety: fn === 'старые нижние уровни' ? 'danger' : hub.safety,
      description: `${fn[0]!.toUpperCase()}${fn.slice(1)}. Здесь действуют местные правила и собственные посредники.`
    };
  });
}

function npcDisposition(role: LocalNpcRole, hub: Hub): LocalNpc['disposition'] {
  if (hub.safety === 'danger' && (role === 'fixer' || role === 'guard')) return 'wary';
  if (role === 'merchant' || role === 'doctor' || role === 'scientist') return 'friendly';
  return 'neutral';
}

export function initializeCivilizationLayer(galaxy: Galaxy, inputHubs: Hub[]): {
  galaxy: Galaxy;
  hubs: Hub[];
  localNpcs: LocalNpc[];
  civilizationContacts: CivilizationContact[];
  archaeologyChains: ArchaeologyChain[];
} {
  const enrichedGalaxy = enrichGalaxyCivilizations(galaxy);
  const localNpcs: LocalNpc[] = [];
  const hubs = inputHubs.map((hub) => {
    const civilization = enrichedGalaxy.civilizations.find((entry) => entry.id === hub.civilizationId);
    const culture = civilization?.cultures?.[0]?.name ?? 'портовая смешанная культура';
    const npcCount = hub.safety === 'danger' ? 3 : 5;
    const ids: string[] = [];
    for (let index = 0; index < npcCount; index += 1) {
      const rng = createRng(`${enrichedGalaxy.seed}:npc:${hub.id}:${index}`);
      const role = npcRoles[index % npcRoles.length]!;
      const id = `npc_${hub.id}_${index}`;
      ids.push(id);
      localNpcs.push({
        id,
        hubId: hub.id,
        civilizationId: hub.civilizationId,
        name: `${rng.pick(npcGiven)} ${rng.pick(npcFamily)}`,
        species: civilization?.speciesName ?? rng.pick(['человек', 'смешанное происхождение', 'синтетик']),
        culture,
        role,
        disposition: npcDisposition(role, hub),
        trust: role === 'administrator' ? 5 : role === 'merchant' ? 12 : 0,
        alive: true,
        present: true,
        agenda: role === 'merchant' ? 'получить прибыль и постоянного клиента' : role === 'scientist' ? 'получить доступ к редким данным' : role === 'fixer' ? 'найти исполнителя, который не задаёт лишних вопросов' : 'сохранить своё положение',
        fear: role === 'administrator' ? 'скандала и потери контроля' : role === 'merchant' ? 'конфискации товара' : role === 'guard' ? 'диверсии в доках' : 'оказаться крайним в чужом конфликте',
        memories: []
      });
    }
    return {
      ...hub,
      districts: hub.districts?.length ? hub.districts : makeDistricts(hub, enrichedGalaxy.seed),
      localCustoms: hub.localCustoms?.length ? hub.localCustoms : pickMany(
        civilization?.cultures?.[0]?.taboos ?? ['оружие сдают на входе', 'сделки подтверждаются записью', 'долги наследуются'],
        2,
        `${enrichedGalaxy.seed}:hub-customs:${hub.id}`
      ),
      npcIds: ids
    };
  });

  const hubCivilizations = new Set(hubs.map((hub) => hub.civilizationId).filter(Boolean));
  const civilizationContacts: CivilizationContact[] = enrichedGalaxy.civilizations
    .filter((civilization) => civilization.status !== 'dead')
    .map((civilization) => {
      const established = hubCivilizations.has(civilization.id);
      return {
        civilizationId: civilization.id,
        stage: established ? 'contacted' : civilization.status === 'hidden' ? 'unknown' : 'observed',
        languageLevel: established ? 3 : 0,
        trust: established ? 15 : 0,
        attempts: 0,
        firstContactYear: established ? 0 : undefined,
        lastContactYear: established ? 0 : undefined,
        notes: established ? ['Торговые каналы и базовые правила общения уже известны.'] : []
      };
    });

  const archaeologyChains: ArchaeologyChain[] = enrichedGalaxy.civilizations
    .filter((civilization) => civilization.status === 'dead')
    .slice(0, 12)
    .map((civilization, index) => {
      const targets = civilization.controlledSystems.length > 0 ? civilization.controlledSystems : [civilization.homeSystemId];
      return {
        id: `archchain_${civilization.id}`,
        civilizationId: civilization.id,
        title: `Последняя хроника: ${civilization.name}`,
        summary: `Восстановить причины гибели ${civilization.name} и судьбу её последних колоний.`,
        status: 'active',
        createdYear: 0,
        stages: [
          { id: `archstage_${civilization.id}_0`, title: 'Найти первый подтверждённый след', summary: 'Получить материальную улику, связанную с погибшим обществом.', status: index < 3 ? 'active' : 'locked', targetSystemId: targets[0]! },
          { id: `archstage_${civilization.id}_1`, title: 'Сопоставить архивы', summary: 'Найти независимый источник в другой системе.', status: 'locked', targetSystemId: targets[1 % targets.length]! },
          { id: `archstage_${civilization.id}_2`, title: 'Установить судьбу последних жителей', summary: 'Добраться до финального объекта и проверить официальную версию гибели.', status: 'locked', targetSystemId: targets[2 % targets.length]! }
        ]
      };
    });

  return { galaxy: enrichedGalaxy, hubs, localNpcs, civilizationContacts, archaeologyChains };
}

export function contactStageLabel(stage: CivilizationContact['stage']): string {
  return stage === 'unknown' ? 'неизвестны' : stage === 'observed' ? 'наблюдение' : stage === 'signals' ? 'обмен сигналами' : stage === 'translated' ? 'частичный перевод' : stage === 'contacted' ? 'официальный контакт' : stage === 'trusted' ? 'доверительный контакт' : 'контакт сорван';
}

export function culturalArtifactMultiplier(channel: 'market' | 'museum' | 'heirs' | 'blackMarket', sameCivilization: boolean): number {
  if (channel === 'heirs') return sameCivilization ? 2.4 : 0.8;
  if (channel === 'museum') return sameCivilization ? 1.75 : 1.35;
  if (channel === 'blackMarket') return 1.18;
  return 0.72;
}
