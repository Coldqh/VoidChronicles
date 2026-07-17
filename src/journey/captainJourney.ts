import type {
  ArchaeologyChain,
  Captain,
  Discovery,
  GameLogEntry,
  NavigationState,
  PendingConsequence,
  PlayerObjective,
  ResearchProject,
  Ship,
  StarSystem,
  StoryScene,
  TutorialState,
  WorldThread
} from '../game/types';
import type { MainScreen } from '../game/store';

export type JourneyAction =
  | { kind: 'screen'; screen: MainScreen }
  | { kind: 'scene'; sceneId: string };

export interface JourneyFocus {
  eyebrow: string;
  title: string;
  text: string;
  label: string;
  tone: 'signal' | 'danger' | 'warning' | 'calm';
  action: JourneyAction;
}

export interface JourneyStage {
  id: string;
  title: string;
  summary: string;
  status: 'completed' | 'active' | 'locked';
}

export interface CareerMilestone {
  title: string;
  summary: string;
  completedOperations: number;
  renown: number;
  progress: number;
  nextRequired: number;
}

export interface CaptainJourney {
  focus: JourneyFocus;
  firstVoyageProgress: number;
  firstVoyageComplete: boolean;
  firstVoyageStages: JourneyStage[];
  career: CareerMilestone;
  campaignThread?: {
    title: string;
    summary: string;
    status: string;
    action: JourneyAction;
  };
  recentConsequences: GameLogEntry[];
}

export interface CaptainJourneyInput {
  tutorial: TutorialState;
  captain: Captain;
  ship: Ship;
  currentSystem: StarSystem;
  storyScenes: StoryScene[];
  objectives: PlayerObjective[];
  worldThreads: WorldThread[];
  researchProjects: ResearchProject[];
  archaeologyChains: ArchaeologyChain[];
  navigation: NavigationState;
  discoveries: Discovery[];
  logs: GameLogEntry[];
  pendingConsequences: PendingConsequence[];
  openShipIssues: number;
}

const firstVoyageStep = [
  {
    eyebrow: 'ПЕРВЫЙ РЕЙС · ПРИКАЗ 1',
    title: 'Открой локальную систему',
    text: 'Корабль вышел из спящего режима. До первого скана вокруг только неподтверждённые отметки.',
    label: 'Перейти к системе',
    tone: 'signal' as const,
    action: { kind: 'screen', screen: 'system' } as JourneyAction
  },
  {
    eyebrow: 'ПЕРВЫЙ РЕЙС · ПРИКАЗ 2',
    title: 'Сними слепую зону',
    text: 'Проведи системный скан и зафиксируй орбиты, сигналы и доступные точки подхода.',
    label: 'Открыть сенсоры',
    tone: 'signal' as const,
    action: { kind: 'screen', screen: 'system' } as JourneyAction
  },
  {
    eyebrow: 'ПЕРВЫЙ РЕЙС · ПРИКАЗ 3',
    title: 'Выбери К-1 «Эхо»',
    text: 'На безопасной орбите отмечен объект с повторяющимся слабым сигналом.',
    label: 'Открыть карту системы',
    tone: 'warning' as const,
    action: { kind: 'screen', screen: 'system' } as JourneyAction
  },
  {
    eyebrow: 'ПЕРВЫЙ РЕЙС · ПРИКАЗ 4',
    title: 'Проведи детальный анализ',
    text: 'Уточни поверхность, опасность и источник сигнала до решения о высадке.',
    label: 'Открыть досье объекта',
    tone: 'warning' as const,
    action: { kind: 'screen', screen: 'system' } as JourneyAction
  },
  {
    eyebrow: 'ПЕРВЫЙ РЕЙС · ПРИКАЗ 5',
    title: 'Разбери найденный сигнал',
    text: 'Скан выделил конкретную точку. Проверь задачу экспедиции и условия доступа.',
    label: 'Открыть сигнал',
    tone: 'danger' as const,
    action: { kind: 'screen', screen: 'system' } as JourneyAction
  },
  {
    eyebrow: 'ПЕРВЫЙ РЕЙС · ПРИКАЗ 6',
    title: 'Подготовь высадку',
    text: 'Выбери снаряжение. Первый выход должен вернуть данные, а не оставить ещё один аварийный маяк.',
    label: 'Вернуться к экспедиции',
    tone: 'danger' as const,
    action: { kind: 'screen', screen: 'system' } as JourneyAction
  },
  {
    eyebrow: 'ПЕРВЫЙ РЕЙС · ПРИКАЗ 7',
    title: 'Добудь подтверждённые данные',
    text: 'Найди терминал, образец или запись, связанную с источником сигнала.',
    label: 'Продолжить высадку',
    tone: 'danger' as const,
    action: { kind: 'screen', screen: 'system' } as JourneyAction
  },
  {
    eyebrow: 'ПЕРВЫЙ РЕЙС · ПРИКАЗ 8',
    title: 'Верни находку на корабль',
    text: 'Эвакуируйся с данными. После возвращения запись войдёт в Архив и начнёт историю капитана.',
    label: 'Завершить экспедицию',
    tone: 'warning' as const,
    action: { kind: 'screen', screen: 'system' } as JourneyAction
  }
] as const;

function stageStatus(done: boolean, active: boolean): JourneyStage['status'] {
  if (done) return 'completed';
  if (active) return 'active';
  return 'locked';
}

function firstVoyageStages(tutorial: TutorialState): JourneyStage[] {
  const step = tutorial.completed ? 8 : tutorial.currentStep;
  return [
    {
      id: 'command',
      title: 'Принять командование',
      summary: 'Открыть локальную систему и отдать первый приказ.',
      status: stageStatus(step >= 1, step === 0)
    },
    {
      id: 'survey',
      title: 'Увидеть систему',
      summary: 'Провести системный скан и выбрать орбитальную цель.',
      status: stageStatus(step >= 3, step >= 1 && step < 3)
    },
    {
      id: 'analysis',
      title: 'Найти источник',
      summary: 'Уточнить объект и открыть конкретный сигнал.',
      status: stageStatus(step >= 5, step >= 3 && step < 5)
    },
    {
      id: 'landing',
      title: 'Выйти в поле',
      summary: 'Подготовить снаряжение и начать высадку.',
      status: stageStatus(step >= 6, step === 5)
    },
    {
      id: 'evidence',
      title: 'Вернуться с данными',
      summary: 'Добрать доказательства и эвакуироваться.',
      status: stageStatus(tutorial.completed, step >= 6 && !tutorial.completed)
    }
  ];
}

function careerMilestone(captain: Captain): CareerMilestone {
  const completedOperations = captain.career?.completedOperations ?? 0;
  const renown = Object.values(captain.career?.renown ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
  const thresholds = [1, 3, 7, 12, 20];
  const nextRequired = thresholds.find((value) => value > completedOperations) ?? 30;
  const previousRequired = [...thresholds].reverse().find((value) => value <= completedOperations) ?? 0;
  const span = Math.max(1, nextRequired - previousRequired);
  const progress = Math.max(0, Math.min(100, Math.round((completedOperations - previousRequired) / span * 100)));

  const title = completedOperations >= 12
    ? 'Имя известно далеко за пределами сектора'
    : completedOperations >= 7
      ? 'Капитан регионального масштаба'
      : completedOperations >= 3
        ? 'Проверенный командир'
        : completedOperations >= 1
          ? 'Первое дело закрыто'
          : 'Имя ещё ничего не значит';

  const summary = completedOperations >= 12
    ? 'Следующий рубеж требует серии решений, которые изменят несколько систем.'
    : `До следующего рубежа: ${Math.max(0, nextRequired - completedOperations)} операций.`;

  return { title, summary, completedOperations, renown, progress, nextRequired };
}

export function buildCaptainJourney(input: CaptainJourneyInput): CaptainJourney {
  const tutorialStep = Math.max(0, Math.min(firstVoyageStep.length - 1, input.tutorial.currentStep));
  const availableScene = input.storyScenes.find((scene) => scene.status === 'available' && scene.category === 'consequence')
    ?? input.storyScenes.find((scene) => scene.status === 'available');
  const activeOperation = input.objectives.find((objective) => objective.status === 'active' && objective.operation);
  const activeObjective = input.objectives.find((objective) => objective.status === 'active' && objective.kind !== 'tutorial');
  const activeResearch = input.researchProjects.find((project) => project.status === 'active');
  const activeChain = input.archaeologyChains.find((chain) => chain.status === 'active');
  const urgentThread = [...input.worldThreads]
    .filter((thread) => thread.status === 'active' || thread.status === 'escalating')
    .sort((a, b) => b.urgency - a.urgency)[0];
  const activeRoute = input.navigation.activePlan?.status === 'active' ? input.navigation.activePlan : undefined;

  let focus: JourneyFocus;
  if (input.tutorial.active && !input.tutorial.completed) {
    focus = firstVoyageStep[tutorialStep];
  } else if (availableScene) {
    focus = {
      eyebrow: availableScene.category === 'consequence' ? 'ПОСЛЕДСТВИЕ РЕШЕНИЯ' : availableScene.operationRequest ? 'НОВАЯ ОПЕРАЦИЯ' : 'ВХОДЯЩИЙ СИГНАЛ',
      title: availableScene.title,
      text: availableScene.summary,
      label: 'Открыть сообщение',
      tone: availableScene.operationRequest ? 'danger' : 'warning',
      action: { kind: 'scene', sceneId: availableScene.id }
    };
  } else if (activeOperation) {
    focus = {
      eyebrow: 'ОПЕРАЦИЯ В РАБОТЕ',
      title: activeOperation.title,
      text: activeOperation.description,
      label: 'Открыть центр операций',
      tone: 'warning',
      action: { kind: 'screen', screen: 'operations' }
    };
  } else if (activeRoute) {
    focus = {
      eyebrow: 'МАРШРУТ ПРОЛОЖЕН',
      title: `Продолжить путь: этап ${activeRoute.currentLegIndex + 1}`,
      text: `${activeRoute.legs.length - activeRoute.currentLegIndex} прыжков осталось. Общий риск ${activeRoute.totalRisk}.`,
      label: 'Открыть карту',
      tone: 'signal',
      action: { kind: 'screen', screen: 'galaxy' }
    };
  } else if (activeObjective) {
    focus = {
      eyebrow: 'АКТИВНАЯ ЦЕЛЬ',
      title: activeObjective.title,
      text: activeObjective.description,
      label: 'Открыть операции',
      tone: 'warning',
      action: { kind: 'screen', screen: 'operations' }
    };
  } else if (activeResearch) {
    focus = {
      eyebrow: 'ЛАБОРАТОРИЯ ЖДЁТ',
      title: activeResearch.title,
      text: `Исследование продолжено на ${activeResearch.progress}/${activeResearch.requiredProgress}.`,
      label: 'Провести исследовательский цикл',
      tone: 'signal',
      action: { kind: 'screen', screen: 'laboratory' }
    };
  } else if (activeChain) {
    focus = {
      eyebrow: 'ОТКРЫТОЕ РАССЛЕДОВАНИЕ',
      title: activeChain.title,
      text: activeChain.summary,
      label: 'Открыть Архив',
      tone: 'signal',
      action: { kind: 'screen', screen: 'archive' }
    };
  } else if (urgentThread) {
    focus = {
      eyebrow: 'МИР ТРЕБУЕТ РЕШЕНИЯ',
      title: urgentThread.title,
      text: urgentThread.summary,
      label: 'Открыть живой мир',
      tone: urgentThread.status === 'escalating' ? 'danger' : 'warning',
      action: { kind: 'screen', screen: 'world' }
    };
  } else if (input.openShipIssues > 0) {
    focus = {
      eyebrow: 'КОРАБЛЬ ТРЕБУЕТ ВНИМАНИЯ',
      title: `${input.openShipIssues} проблем на борту`,
      text: 'Неисправности и конфликты уже влияют на готовность экипажа.',
      label: 'Открыть корабль',
      tone: 'danger',
      action: { kind: 'screen', screen: 'ship' }
    };
  } else {
    focus = {
      eyebrow: 'СВОБОДНОЕ КОМАНДОВАНИЕ',
      title: `Выбери следующий ход в системе ${input.currentSystem.name}`,
      text: input.discoveries.length
        ? 'Архив уже содержит первые находки. Теперь реши, куда вести корабль дальше.'
        : 'Галактика движется без тебя. Найди место, где вмешательство будет иметь цену.',
      label: 'Открыть карту',
      tone: 'calm',
      action: { kind: 'screen', screen: 'galaxy' }
    };
  }

  const operationChain = activeOperation?.operation?.chain;
  const campaignThread = operationChain
    ? {
        title: activeOperation.title,
        summary: activeOperation.description,
        status: `связанная линия · глава ${operationChain.stage}/${operationChain.maxStages}`,
        action: { kind: 'screen', screen: 'operations' } as JourneyAction
      }
    : urgentThread
    ? {
        title: urgentThread.title,
        summary: urgentThread.summary,
        status: `${urgentThread.status} · срочность ${urgentThread.urgency}`,
        action: { kind: 'screen', screen: 'world' } as JourneyAction
      }
    : activeChain
      ? {
          title: activeChain.title,
          summary: activeChain.summary,
          status: `${activeChain.status} · этапов ${activeChain.stages.length}`,
          action: { kind: 'screen', screen: 'archive' } as JourneyAction
        }
      : undefined;

  return {
    focus,
    firstVoyageProgress: input.tutorial.completed
      ? 100
      : Math.round(Math.max(0, Math.min(8, input.tutorial.currentStep)) / 8 * 100),
    firstVoyageComplete: input.tutorial.completed,
    firstVoyageStages: firstVoyageStages(input.tutorial),
    career: careerMilestone(input.captain),
    campaignThread,
    recentConsequences: input.pendingConsequences
      .filter((entry) => entry.status === 'resolved')
      .sort((a, b) => b.triggerYear - a.triggerYear)
      .slice(0, 3)
      .map((entry) => ({ id: entry.id, year: entry.triggerYear, title: entry.title, text: entry.text, tone: entry.tone }))
  };
}
