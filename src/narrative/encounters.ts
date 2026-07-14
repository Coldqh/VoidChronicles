import type {
  Faction,
  Galaxy,
  Hub,
  PendingConsequence,
  PlayerObjective,
  StoryScene,
  TutorialState
} from '../game/types';
import { createRng } from '../generation/rng';

export interface NarrativeState {
  storyScenes: StoryScene[];
  pendingConsequences: PendingConsequence[];
  objectives: PlayerObjective[];
  tutorial: TutorialState;
}

function initialScene(galaxy: Galaxy, hubs: Hub[], factions: Faction[]): StoryScene {
  const start = galaxy.systems.find((system) => system.id === galaxy.startSystemId) ?? galaxy.systems[0];
  const hub = hubs.find((entry) => entry.systemId === start.id);
  const faction = factions.find((entry) => entry.id === hub?.factionId);
  return {
    id: `scene_first_signal_${galaxy.seed}`,
    category: 'mystery',
    status: 'available',
    title: 'Сигнал на границе гражданского коридора',
    summary: 'Слабая передача повторяется каждые девяносто семь секунд. Официальные диспетчеры её игнорируют.',
    body: hub
      ? `Сигнал идёт из внешнего сектора системы ${start.name}. ${hub.name} продолжает обычный трафик. ${faction?.name ?? 'Местная власть'} не объявляла тревогу. В передаче есть координаты и фрагмент чужого языка.`
      : `Сигнал идёт из внешнего сектора системы ${start.name}. Он содержит координаты, короткий цифровой отпечаток и фрагмент чужого языка.`,
    source: hub?.name ?? 'корабельный приёмник',
    systemId: start.id,
    hubId: hub?.id,
    npcIds: [],
    factionIds: faction ? [faction.id] : [],
    createdYear: 0,
    expiresYear: 5,
    choices: [
      {
        id: 'trace',
        label: 'Отследить источник',
        summary: 'Внести координаты в журнал и подготовить исследовательский маршрут.',
        risk: 'medium',
        effect: {
          reputation: 1,
          objectiveTitle: 'Источник повторяющегося сигнала',
          objectiveDescription: 'Просканировать систему и найти объект, который передаёт сигнал.',
          objectiveSystemId: start.id,
          consequenceDelay: 2,
          consequenceTitle: 'Кто-то заметил сканирование',
          consequenceText: 'После твоего анализа в сети появился встречный запрос к идентификатору корабля.',
          consequenceTone: 'warning'
        }
      },
      {
        id: 'sell',
        label: 'Продать координаты',
        summary: 'Передать сырые данные местному посреднику и не вмешиваться лично.',
        risk: 'unknown',
        effect: {
          credits: 180,
          factionId: faction?.id,
          factionReputation: faction ? -2 : 0,
          consequenceDelay: 3,
          consequenceTitle: 'Координаты сменили владельца',
          consequenceText: 'К переданному сектору направилась частная экспедиция. Её транспондер скрыт.',
          consequenceTone: 'warning'
        }
      },
      {
        id: 'ignore',
        label: 'Игнорировать',
        summary: 'Не рисковать кораблём ради неизвестного сигнала.',
        risk: 'low',
        effect: {
          consequenceDelay: 4,
          consequenceTitle: 'Сигнал оборвался',
          consequenceText: 'Повторяющаяся передача исчезла. Последний пакет содержал аварийный код.',
          consequenceTone: 'danger'
        }
      }
    ]
  };
}

export function initializeNarrative(_galaxy: Galaxy, _hubs: Hub[], _factions: Faction[], tutorialEnabled: boolean): NarrativeState {
  return {
    // A new captain begins with no omniscient inbox. Scenes appear only after scans,
    // travel, docking or field discoveries create a believable source for them.
    storyScenes: [],
    pendingConsequences: [],
    objectives: tutorialEnabled ? [{
      id: 'objective_tutorial_bridge',
      title: 'Первый маршрут',
      description: 'Открыть систему, просканировать учебную цель и вернуться с первыми данными.',
      kind: 'tutorial',
      status: 'active',
      createdYear: 0,
      progress: 0
    }] : [],
    tutorial: {
      enabled: tutorialEnabled,
      active: tutorialEnabled,
      currentStep: 0,
      completed: !tutorialEnabled
    }
  };
}

export function generateTravelScene(
  seed: string,
  sourceSystemId: string,
  targetSystemId: string,
  targetName: string,
  year: number,
  hubs: Hub[],
  factions: Faction[]
): StoryScene | null {
  const rng = createRng(`${seed}:narrative-travel:${sourceSystemId}:${targetSystemId}:${year}`);
  if (!rng.chance(0.58)) return null;
  const localHub = hubs.find((hub) => hub.systemId === targetSystemId);
  const localFaction = factions.find((faction) => faction.id === localHub?.factionId);
  const templates = localHub ? ['inspection', 'courier', 'refugees'] as const : ['wreck', 'distress', 'ghost'] as const;
  const template = rng.pick(templates);
  if (template === 'inspection') return {
    id: `scene_inspection_${targetSystemId}_${year}`,
    category: 'negotiation', status: 'available',
    title: `Пограничный досмотр у ${localHub?.name}`,
    summary: 'Патруль просит сбросить тягу и передать грузовую декларацию.',
    body: `${localFaction?.name ?? 'Местная служба'} сверяет идентификатор корабля. Офицер сообщает, что в регионе ищут контрабандистов с похожим профилем двигателя.`,
    source: localFaction?.name ?? 'пограничный патруль', systemId: targetSystemId, hubId: localHub?.id,
    npcIds: [], factionIds: localFaction ? [localFaction.id] : [], createdYear: year, expiresYear: year + 1,
    choices: [
      { id: 'comply', label: 'Подчиниться досмотру', summary: 'Передать декларацию и потерять время.', risk: 'low', effect: { factionId: localFaction?.id, factionReputation: 2 } },
      { id: 'bribe', label: 'Предложить 120 кредитов', summary: 'Закрыть вопрос быстро и неофициально.', risk: 'medium', effect: { credits: -120, factionId: localFaction?.id, factionReputation: -1 } },
      { id: 'run', label: 'Уйти на форсаже', summary: 'Сорвать досмотр и стать заметной целью.', risk: 'high', effect: { factionId: localFaction?.id, factionReputation: -12, consequenceDelay: 1, consequenceTitle: 'Ориентировка на корабль', consequenceText: 'Патруль передал описание судна соседним постам.', consequenceTone: 'danger' } }
    ]
  };
  if (template === 'courier') return {
    id: `scene_courier_${targetSystemId}_${year}`,
    category: 'hub', status: 'available', title: 'Курьер с повреждённым приводом',
    summary: 'Небольшой корабль просит довести пакет до ближайшего гражданского узла.',
    body: 'Пилот говорит коротко и не называет отправителя. Контейнер опечатан, но сканер фиксирует внутри только керамику и память.',
    source: 'частный курьер', systemId: targetSystemId, hubId: localHub?.id, npcIds: [], factionIds: [], createdYear: year, expiresYear: year + 2,
    choices: [
      { id: 'help', label: 'Принять пакет', summary: 'Взять небольшую доставку и чужую ответственность.', risk: 'medium', effect: { objectiveTitle: 'Закрытый курьерский пакет', objectiveDescription: `Доставить пакет в ${localHub?.name ?? targetName}.`, objectiveSystemId: targetSystemId, reputation: 1 } },
      { id: 'scan', label: 'Потребовать вскрыть контейнер', summary: 'Проверить содержимое до согласия.', risk: 'unknown', effect: { consequenceDelay: 1, consequenceTitle: 'Курьер исчез из сети', consequenceText: 'Корабль отключил транспондер и покинул маршрут.', consequenceTone: 'warning' } },
      { id: 'decline', label: 'Отказать', summary: 'Не брать чужой груз.', risk: 'low', effect: {} }
    ]
  };
  if (template === 'refugees') return {
    id: `scene_refugees_${targetSystemId}_${year}`,
    category: 'distress', status: 'available', title: 'Перегруженный транспорт',
    summary: 'Гражданское судно просит топливо и медицинские расходники.',
    body: 'На борту десятки пассажиров. Капитан транспорта утверждает, что порт закрыли после политических беспорядков. Связь с портом подтверждает только часть истории.',
    source: 'гражданский транспорт', systemId: targetSystemId, hubId: localHub?.id, npcIds: [], factionIds: localFaction ? [localFaction.id] : [], createdYear: year, expiresYear: year + 1,
    choices: [
      { id: 'aid', label: 'Передать помощь', summary: 'Потратить ресурсы и получить живых свидетелей кризиса.', risk: 'medium', effect: { credits: -160, reputation: 3, crewMorale: 4, consequenceDelay: 3, consequenceTitle: 'Беженцы добрались до порта', consequenceText: 'Спасённые пассажиры начали рассказывать о помощи твоего корабля.', consequenceTone: 'good' } },
      { id: 'information', label: 'Обменять помощь на данные', summary: 'Получить координаты закрытого маршрута.', risk: 'medium', effect: { credits: -80, objectiveTitle: 'Маршрут беженцев', objectiveDescription: 'Проверить координаты, скрытые из официальной навигации.', objectiveSystemId: targetSystemId } },
      { id: 'leave', label: 'Продолжить путь', summary: 'Не вмешиваться.', risk: 'low', effect: { crewMorale: -3 } }
    ]
  };
  if (template === 'wreck') return {
    id: `scene_wreck_${targetSystemId}_${year}`,
    category: 'mystery', status: 'available', title: 'Тёплый обломок в пустом секторе',
    summary: 'Фрагмент корпуса ещё держит давление, хотя рядом нет основного судна.',
    body: 'На металле нет регистрационных меток. Аварийный маяк работает на частоте, которой не пользуются современные флоты.',
    source: 'пассивный радар', systemId: targetSystemId, npcIds: [], factionIds: [], createdYear: year, expiresYear: year + 4,
    choices: [
      { id: 'mark', label: 'Отметить координаты', summary: 'Добавить объект в план экспедиции.', risk: 'low', effect: { objectiveTitle: 'Тёплый обломок', objectiveDescription: 'Найти способ исследовать герметичный фрагмент корпуса.', objectiveSystemId: targetSystemId } },
      { id: 'recover', label: 'Подойти ближе', summary: 'Попытаться забрать данные прямо сейчас.', risk: 'high', effect: { credits: 120, consequenceDelay: 2, consequenceTitle: 'Неизвестный ответил на старой частоте', consequenceText: 'После извлечения данных в пустом секторе появился короткий направленный импульс.', consequenceTone: 'warning' } },
      { id: 'destroy', label: 'Уничтожить обломок', summary: 'Не оставлять опасный объект на маршруте.', risk: 'unknown', effect: { reputation: -1 } }
    ]
  };
  if (template === 'distress') return {
    id: `scene_distress_${targetSystemId}_${year}`,
    category: 'distress', status: 'available', title: 'Аварийный вызов без голоса',
    summary: 'Автоматический маяк передаёт биометрию одного выжившего.',
    body: 'Корабль находится за пределами безопасного коридора. Двигатель разрушен. На борту есть движение, но никто не отвечает словами.',
    source: 'аварийный канал', systemId: targetSystemId, npcIds: [], factionIds: [], createdYear: year, expiresYear: year + 1,
    choices: [
      { id: 'rescue', label: 'Начать спасение', summary: 'Изменить курс и принять неизвестного на борт.', risk: 'high', effect: { reputation: 2, objectiveTitle: 'Выживший без голоса', objectiveDescription: 'Подготовить карантин и разобраться, кто находится на аварийном корабле.', objectiveSystemId: targetSystemId, consequenceDelay: 2, consequenceTitle: 'Спасённый пришёл в сознание', consequenceText: 'Медицинская система зафиксировала неизвестную нейронную активность.', consequenceTone: 'warning' } },
      { id: 'relay', label: 'Передать координаты', summary: 'Сообщить ближайшим службам и не менять курс.', risk: 'medium', effect: { reputation: 1 } },
      { id: 'ignore', label: 'Не отвечать', summary: 'Сохранить ресурсы.', risk: 'low', effect: { crewMorale: -2 } }
    ]
  };
  return {
    id: `scene_ghost_${targetSystemId}_${year}`,
    category: 'travel', status: 'available', title: 'Корабль, которого нет в каталоге',
    summary: 'На секунду рядом появляется навигационная отметка с датой из далёкого прошлого.',
    body: 'Объект повторяет твою скорость, затем исчезает. В журнале остаётся только вектор движения и короткая строка телеметрии.',
    source: 'навигационный компьютер', systemId: targetSystemId, npcIds: [], factionIds: [], createdYear: year,
    choices: [
      { id: 'follow', label: 'Сохранить вектор', summary: 'Добавить след в архив долгих историй.', risk: 'unknown', effect: { objectiveTitle: 'Призрачный вектор', objectiveDescription: 'Найти систему, к которой вёл исчезнувший навигационный след.', objectiveSystemId: targetSystemId } },
      { id: 'purge', label: 'Удалить запись', summary: 'Не позволять неизвестным данным влиять на навигацию.', risk: 'low', effect: {} }
    ]
  };
}

export function processDueConsequences(consequences: PendingConsequence[], year: number) {
  const due = consequences.filter((entry) => entry.status === 'pending' && entry.triggerYear <= year);
  const next = consequences.map((entry) => due.some((dueEntry) => dueEntry.id === entry.id) ? { ...entry, status: 'resolved' as const } : entry);
  return { due, consequences: next };
}

export function generateHubScene(seed: string, hub: Hub, faction: Faction | undefined, npcId: string | undefined, year: number): StoryScene | null {
  const rng = createRng(`${seed}:hub-scene:${hub.id}:${year}:${hub.visited}`);
  if (!rng.chance(hub.visited ? 0.34 : 0.82)) return null;
  const isFriendly = faction?.disposition === 'friendly';
  return {
    id: `scene_hub_${hub.id}_${year}_${rng.int(10, 99)}`,
    category: 'hub',
    status: 'available',
    title: isFriendly ? `Личное приглашение в ${hub.name}` : `Разговор в транзитном секторе`,
    summary: isFriendly
      ? 'Местный представитель предлагает доступ к закрытому району в обмен на услугу.'
      : 'Посредник утверждает, что знает, почему один из доков внезапно закрыли.',
    body: isFriendly
      ? `${faction?.name ?? 'Администрация'} готова доверить тебе работу, которую не публикуют на общей доске. Взамен обещают доступ к архиву и свободный коридор.`
      : `Разговор проходит без официальной записи. Посредник называет имя пропавшего техника и просит не обращаться к службе безопасности.`,
    source: isFriendly ? faction?.name ?? hub.name : 'местный посредник',
    systemId: hub.systemId,
    hubId: hub.id,
    npcIds: npcId ? [npcId] : [],
    factionIds: faction ? [faction.id] : [],
    createdYear: year,
    expiresYear: year + 2,
    choices: [
      {
        id: 'accept', label: 'Принять разговор', summary: 'Взять личную зацепку и открыть продолжение.', risk: 'medium',
        effect: { objectiveTitle: isFriendly ? 'Закрытая услуга администрации' : 'Пропавший техник', objectiveDescription: isFriendly ? 'Уточнить условия непубличной работы в закрытом районе.' : 'Выяснить, что произошло в закрытом доке.', objectiveSystemId: hub.systemId, factionId: faction?.id, factionReputation: 2 }
      },
      {
        id: 'trade', label: 'Продать информацию дальше', summary: 'Передать сам факт предложения конкурентам.', risk: 'high',
        effect: { credits: 240, factionId: faction?.id, factionReputation: -8, consequenceDelay: 2, consequenceTitle: 'Утечка дошла до источника', consequenceText: 'Кто-то в хабе понял, что приватное предложение было продано.', consequenceTone: 'danger' }
      },
      { id: 'decline', label: 'Отказаться', summary: 'Не связываться с местной политикой.', risk: 'low', effect: {} }
    ]
  };
}

export function generateScanScene(
  seed: string,
  systemId: string,
  systemName: string,
  year: number,
  planetName?: string
): StoryScene | null {
  const rng = createRng(`${seed}:scan-scene:${systemId}:${planetName ?? 'system'}:${year}`);
  if (!rng.chance(planetName ? .68 : .52)) return null;
  const title = planetName ? `Ответ на сканирование ${planetName}` : `Неожиданный ответ из системы ${systemName}`;
  return {
    id: `scene_scan_${systemId}_${planetName ?? 'system'}_${year}`.replace(/\s+/g, '_'),
    category: 'mystery',
    status: 'available',
    title,
    summary: planetName
      ? 'Фокусировка сканера вызвала короткий направленный ответ.'
      : 'После системного импульса один из неизвестных источников изменил частоту.',
    body: planetName
      ? `Источник рядом с ${planetName} передал пакет координат, затем замолчал. Сигнал не совпадает с гражданскими протоколами.`
      : `В системе ${systemName} появился узкий канал связи. Отправитель не называет себя и просит отключить повторный скан.`,
    source: 'сенсорный комплекс',
    systemId,
    npcIds: [],
    factionIds: [],
    createdYear: year,
    expiresYear: year + 2,
    choices: [
      { id: 'trace', label: 'Отследить ответ', summary: 'Сохранить направление и открыть новую цель.', risk: 'medium', effect: { objectiveTitle: 'Источник встречного сигнала', objectiveDescription: `Найти источник ответа в системе ${systemName}.`, objectiveSystemId: systemId, reputation: 1 } },
      { id: 'reply', label: 'Ответить', summary: 'Передать идентификатор корабля и запросить контакт.', risk: 'high', effect: { consequenceDelay: 1, consequenceTitle: 'Неизвестный получил идентификатор', consequenceText: 'После ответа в сети появился запрос по транспондеру корабля.', consequenceTone: 'warning' } },
      { id: 'silence', label: 'Закрыть канал', summary: 'Не раскрывать присутствие.', risk: 'low', effect: {} }
    ]
  };
}
