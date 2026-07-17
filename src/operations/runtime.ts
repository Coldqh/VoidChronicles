import type {
  Captain,
  CaptainCareerPath,
  Civilization,
  CivilizationContact,
  CrewMember,
  Faction,
  OperationApproach,
  OperationCategory,
  OperationOutcome,
  OperationRequest,
  OperationStage,
  PlayerObjective,
  StoryScene,
  WorldThread
} from '../game/types';
import { createRng, stableHash } from '../generation/rng';
import { crewReadiness } from '../ship/life';

const contactRank: Record<CivilizationContact['stage'], number> = {
  unknown: 0,
  observed: 1,
  signals: 2,
  translated: 3,
  contacted: 4,
  trusted: 5,
  failed: 1
};

export const careerLabels: Record<CaptainCareerPath, string> = {
  explorer: 'Исследователь',
  archaeologist: 'Хранитель прошлого',
  diplomat: 'Посредник',
  rescuer: 'Спасатель',
  hunter: 'Охотник',
  smuggler: 'Контрабандист',
  scientist: 'Полевой учёный',
  trader: 'Независимый торговец'
};

export const operationLabels: Record<OperationCategory, string> = {
  relief: 'Снабжение',
  evacuation: 'Эвакуация',
  escort: 'Защита маршрута',
  mediation: 'Посредничество',
  investigation: 'Расследование',
  recovery: 'Возвращение наследия',
  containment: 'Локализация угрозы'
};

const categoryCareer: Record<OperationCategory, CaptainCareerPath> = {
  relief: 'rescuer',
  evacuation: 'rescuer',
  escort: 'hunter',
  mediation: 'diplomat',
  investigation: 'explorer',
  recovery: 'archaeologist',
  containment: 'scientist'
};

const stageTemplates: Record<OperationCategory, Array<Pick<OperationStage, 'kind' | 'title' | 'description'>>> = {
  relief: [
    { kind: 'travel', title: 'Добраться до системы', description: 'Прибыть к получателю и подтвердить безопасный коридор.' },
    { kind: 'scan', title: 'Проверить обстановку', description: 'Уточнить блокаду, дефициты и доступные точки передачи.' },
    { kind: 'delivery', title: 'Передать груз', description: 'Распределить ограниченные ресурсы и не сорвать снабжение.' },
    { kind: 'report', title: 'Закрыть операцию', description: 'Передать отчёт заказчику и зафиксировать последствия.' }
  ],
  evacuation: [
    { kind: 'travel', title: 'Войти в кризисную систему', description: 'Добраться до зоны эвакуации.' },
    { kind: 'scan', title: 'Найти безопасный маршрут', description: 'Установить точки посадки и опасные сектора.' },
    { kind: 'field', title: 'Вывести людей', description: 'Организовать посадку, сортировку и отход.' },
    { kind: 'report', title: 'Передать списки', description: 'Зафиксировать спасённых, пропавших и оставленных.' }
  ],
  escort: [
    { kind: 'travel', title: 'Выйти на маршрут', description: 'Прибыть к повреждённому торговому коридору.' },
    { kind: 'scan', title: 'Определить источник угрозы', description: 'Найти засаду, минное поле или нестабильный участок.' },
    { kind: 'field', title: 'Открыть коридор', description: 'Устранить угрозу, договориться или провести караван обходом.' },
    { kind: 'report', title: 'Подтвердить проход', description: 'Передать координаты и состояние маршрута.' }
  ],
  mediation: [
    { kind: 'travel', title: 'Прибыть к сторонам', description: 'Войти в систему конфликта и открыть защищённый канал.' },
    { kind: 'scan', title: 'Проверить заявления', description: 'Собрать независимые данные о потерях и позициях сторон.' },
    { kind: 'negotiation', title: 'Провести переговоры', description: 'Согласовать условия, заложников, коридоры или прекращение огня.' },
    { kind: 'report', title: 'Закрепить договорённость', description: 'Передать итоговый протокол и проверить первые действия сторон.' }
  ],
  investigation: [
    { kind: 'travel', title: 'Добраться до источника', description: 'Прибыть к месту события.' },
    { kind: 'scan', title: 'Собрать первичные данные', description: 'Проверить сигналы, свидетелей и повреждения.' },
    { kind: 'analysis', title: 'Установить причину', description: 'Сопоставить данные и отделить факт от официальной версии.' },
    { kind: 'report', title: 'Распорядиться выводами', description: 'Передать, опубликовать или скрыть итог расследования.' }
  ],
  recovery: [
    { kind: 'travel', title: 'Найти место хранения', description: 'Прибыть к объекту, архиву или владельцу.' },
    { kind: 'scan', title: 'Подтвердить подлинность', description: 'Проверить происхождение и состояние объекта.' },
    { kind: 'field', title: 'Вернуть наследие', description: 'Извлечь, выкупить или получить предмет без уничтожения контекста.' },
    { kind: 'report', title: 'Оформить передачу', description: 'Передать предмет законному получателю и открыть архивную запись.' }
  ],
  containment: [
    { kind: 'travel', title: 'Войти в заражённую систему', description: 'Добраться до зоны экологической или технической угрозы.' },
    { kind: 'scan', title: 'Определить распространение', description: 'Найти очаги и безопасные участки.' },
    { kind: 'field', title: 'Локализовать угрозу', description: 'Разместить маяки, реагенты или изолирующие контуры.' },
    { kind: 'report', title: 'Передать протокол', description: 'Зафиксировать остаточный риск и долгосрочные меры.' }
  ]
};

function categoryForThread(thread: WorldThread): OperationCategory {
  if (thread.category === 'ecology') return 'containment';
  if (thread.category === 'conflict') return thread.urgency >= 76 ? 'evacuation' : 'escort';
  if (thread.category === 'politics' || thread.category === 'culture') return 'mediation';
  if (thread.category === 'discovery') return thread.relatedArtifactIds.length ? 'recovery' : 'investigation';
  if (thread.category === 'research') return 'investigation';
  return 'relief';
}

function stagesFor(category: OperationCategory, systemId: string): OperationStage[] {
  return stageTemplates[category].map((stage, index) => ({
    id: `stage_${index + 1}_${stage.kind}`,
    kind: stage.kind,
    title: stage.title,
    description: stage.description,
    status: index === 0 ? 'active' : 'locked',
    progress: 0,
    requiredProgress: 100,
    systemId
  }));
}

export function operationStagesFor(category: OperationCategory, systemId: string): OperationStage[] {
  return stagesFor(category, systemId);
}

export function initialCareerState(): NonNullable<Captain['career']> {
  return { renown: {}, titles: [], completedOperations: 0 };
}

export function normalizeCareer(captain: Captain): NonNullable<Captain['career']> {
  return {
    primary: captain.career?.primary,
    renown: { ...(captain.career?.renown ?? {}) },
    titles: [...(captain.career?.titles ?? [])],
    completedOperations: Math.max(0, Math.round(captain.career?.completedOperations ?? 0))
  };
}

export function projectOperationRequests(input: {
  threads: WorldThread[];
  contacts: CivilizationContact[];
  civilizations: Civilization[];
  factions: Faction[];
  existingScenes: StoryScene[];
  year: number;
}): StoryScene[] {
  const existing = new Set(input.existingScenes.map((scene) => scene.operationRequest?.threadId ?? scene.id));
  const known = new Map(input.contacts.filter((contact) => contactRank[contact.stage] >= 4).map((contact) => [contact.civilizationId, contact]));
  const candidates = input.threads
    .filter((thread) => ['active', 'escalating'].includes(thread.status) && thread.urgency >= 42 && !existing.has(thread.id))
    .filter((thread) => thread.playerInvolved || thread.civilizationIds.some((id) => known.has(id)))
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 4);

  const requests = candidates.map((thread): StoryScene => {
    const civilizationId = thread.civilizationIds.find((id) => known.has(id));
    const civilization = input.civilizations.find((entry) => entry.id === civilizationId);
    const faction = input.factions.find((entry) => thread.factionIds.includes(entry.id))
      ?? input.factions.find((entry) => entry.civilizationId === civilizationId);
    const systemId = thread.systemIds[0] ?? civilization?.homeSystemId ?? '';
    const category = categoryForThread(thread);
    const issuerName = faction?.name ?? civilization?.name ?? 'неизвестный канал';
    const request: OperationRequest = {
      id: `operation_request_${stableHash(thread.id)}`,
      threadId: thread.id,
      category,
      title: `${operationLabels[category]}: ${thread.title}`,
      summary: thread.summary,
      issuerName,
      issuerCivilizationId: civilizationId,
      issuerFactionId: faction?.id,
      targetSystemId: systemId,
      reward: Math.max(260, Math.round(220 + thread.urgency * 8)),
      deadlineYear: input.year + Math.max(2, 7 - Math.floor(thread.urgency / 20)),
      urgency: Math.round(thread.urgency),
      stages: stagesFor(category, systemId)
    };
    return {
      id: `scene_${request.id}`,
      category: category === 'mediation' ? 'negotiation' : category === 'investigation' || category === 'recovery' ? 'mystery' : 'distress',
      status: 'available',
      title: request.title,
      summary: `${issuerName}: ${request.summary}`,
      body: `Канал подтверждён. Запрос связан с реальным кризисом мира. Награда: ₡${request.reward}. Срок: до ${request.deadlineYear} года.`,
      source: 'operation-request',
      systemId,
      npcIds: [],
      factionIds: faction ? [faction.id] : [],
      createdYear: input.year,
      expiresYear: request.deadlineYear,
      choices: [
        { id: 'accept-operation', label: 'Принять операцию', summary: 'Запрос появится в оперативном центре с несколькими этапами.', risk: thread.urgency >= 75 ? 'high' : 'medium', effect: {} },
        { id: 'decline-operation', label: 'Отказать', summary: 'Кризис продолжит развиваться без участия капитана.', risk: 'low', effect: { factionId: faction?.id, factionReputation: -2 } }
      ],
      operationRequest: request
    };
  });

  return [...requests, ...input.existingScenes].slice(0, 180);
}

export function createOperationObjective(request: OperationRequest, year: number): PlayerObjective {
  return {
    id: `objective_${request.id}`,
    title: request.title,
    description: request.summary,
    kind: request.urgency >= 72 ? 'urgent' : 'story',
    status: 'active',
    createdYear: year,
    deadlineYear: request.deadlineYear,
    systemId: request.targetSystemId,
    progress: 0,
    operation: {
      requestId: request.id,
      threadId: request.threadId,
      category: request.category,
      issuerName: request.issuerName,
      issuerCivilizationId: request.issuerCivilizationId,
      issuerFactionId: request.issuerFactionId,
      reward: request.reward,
      targetSystemId: request.targetSystemId,
      stages: request.stages.map((stage) => ({ ...stage })),
      currentStageIndex: 0,
      quality: 0,
      attempts: 0,
      log: [`Операция принята в ${year} году.`],
      chain: request.chain ? { ...request.chain } : undefined
    }
  };
}

export function currentOperationStage(objective: PlayerObjective): OperationStage | undefined {
  return objective.operation?.stages[objective.operation.currentStageIndex];
}

function careerFor(category: OperationCategory): CaptainCareerPath {
  return categoryCareer[category];
}

function crewBonus(category: OperationCategory, crew: CrewMember[]): number {
  const desired = category === 'mediation' ? ['diplomat']
    : category === 'escort' ? ['soldier', 'pilot']
      : category === 'containment' ? ['biologist', 'doctor', 'engineer']
        : category === 'recovery' || category === 'investigation' ? ['archaeologist', 'scientist']
          : ['doctor', 'engineer', 'pilot'];
  const primary = crew.find((member) => member.status === 'active' && desired.includes(member.primaryRole));
  const secondary = primary ? undefined : crew.find((member) => member.status === 'active' && member.secondaryRole && desired.includes(member.secondaryRole));
  const specialist = primary ?? secondary;
  if (!specialist) return 0;
  const readiness = crewReadiness(specialist) / 100;
  return (primary ? 0.14 : 0.08) * Math.max(0.25, readiness);
}

function skillFor(category: OperationCategory, captain: Captain): number {
  if (category === 'escort') return captain.skills.combat;
  if (category === 'recovery') return captain.skills.archaeology;
  if (category === 'investigation' || category === 'containment') return captain.skills.research;
  return captain.skills.trade;
}

export interface OperationStepInput {
  objective: PlayerObjective;
  approach: OperationApproach;
  seed: string;
  currentSystemId: string;
  currentSystemScanned: boolean;
  captain: Captain;
  crew: CrewMember[];
  contactTrust: number;
  absoluteHour: number;
}

export interface OperationStepResult {
  ok: boolean;
  message: string;
  objective: PlayerObjective;
  hours: number;
  creditsCost: number;
  healthLoss: number;
  reward: number;
  reputation: number;
  career: CaptainCareerPath;
  careerGain: number;
  completed: boolean;
  outcome?: OperationOutcome;
}

export function resolveOperationStep(input: OperationStepInput): OperationStepResult {
  const operation = input.objective.operation;
  const stage = currentOperationStage(input.objective);
  if (!operation || !stage || input.objective.status !== 'active') {
    return { ok: false, message: 'Активная операция не найдена.', objective: input.objective, hours: 0, creditsCost: 0, healthLoss: 0, reward: 0, reputation: 0, career: 'explorer', careerGain: 0, completed: false };
  }
  const career = careerFor(operation.category);
  if (stage.kind !== 'report' && input.currentSystemId !== operation.targetSystemId) {
    return { ok: false, message: 'Сначала прибудь в целевую систему.', objective: input.objective, hours: 0, creditsCost: 0, healthLoss: 0, reward: 0, reputation: 0, career, careerGain: 0, completed: false };
  }
  if (stage.kind === 'scan' && !input.currentSystemScanned) {
    return { ok: false, message: 'Сначала выполни системный скан.', objective: input.objective, hours: 0, creditsCost: 0, healthLoss: 0, reward: 0, reputation: 0, career, careerGain: 0, completed: false };
  }

  const automatic = stage.kind === 'travel' || stage.kind === 'scan' || stage.kind === 'report';
  const creditsCost = automatic ? 0 : input.approach === 'careful' ? 80 : input.approach === 'negotiate' ? 30 : 0;
  if (input.captain.credits < creditsCost) {
    return { ok: false, message: `Нужно ₡${creditsCost} на выбранный подход.`, objective: input.objective, hours: 0, creditsCost: 0, healthLoss: 0, reward: 0, reputation: 0, career, careerGain: 0, completed: false };
  }

  const base = automatic ? 1 : input.approach === 'careful' ? 0.82 : input.approach === 'negotiate' ? 0.75 : 0.64;
  const skill = skillFor(operation.category, input.captain) * 0.035;
  const people = crewBonus(operation.category, input.crew);
  const trust = operation.issuerCivilizationId ? Math.max(-0.12, Math.min(0.16, input.contactTrust / 500)) : 0;
  const chance = Math.max(0.18, Math.min(0.97, base + skill + people + trust));
  const rng = createRng(`${input.seed}:${input.objective.id}:${stage.id}:${operation.attempts}:${input.absoluteHour}:${input.approach}`);
  const success = automatic || rng.chance(chance);
  const progressGain = success ? 100 : input.approach === 'careful' ? 48 : input.approach === 'negotiate' ? 40 : 30;
  const qualityGain = success ? (input.approach === 'careful' ? 24 : input.approach === 'negotiate' ? 22 : 19) : (input.approach === 'careful' ? 8 : input.approach === 'negotiate' ? 6 : 3);
  const healthLoss = success || automatic ? 0 : input.approach === 'direct' ? 9 : input.approach === 'careful' ? 2 : 0;
  const nextStages = operation.stages.map((entry) => ({ ...entry }));
  const current = nextStages[operation.currentStageIndex]!;
  current.progress = Math.min(current.requiredProgress, current.progress + progressGain);
  const stageCompleted = current.progress >= current.requiredProgress;
  if (stageCompleted) current.status = 'completed';

  let currentStageIndex = operation.currentStageIndex;
  if (stageCompleted && currentStageIndex < nextStages.length - 1) {
    currentStageIndex += 1;
    nextStages[currentStageIndex] = { ...nextStages[currentStageIndex]!, status: 'active' };
  }
  const completed = stageCompleted && currentStageIndex === nextStages.length - 1 && nextStages[currentStageIndex]?.status === 'completed';
  const quality = Math.max(0, Math.min(100, operation.quality + qualityGain));
  const outcome: OperationOutcome | undefined = completed
    ? quality >= 72 ? 'exceptional' : quality >= 50 ? 'successful' : quality >= 28 ? 'partial' : 'failed'
    : undefined;
  const rewardMultiplier = outcome === 'exceptional' ? 1.35 : outcome === 'successful' ? 1 : outcome === 'partial' ? 0.6 : 0;
  const reward = outcome ? Math.round(operation.reward * rewardMultiplier) : 0;
  const reputation = outcome === 'exceptional' ? 5 : outcome === 'successful' ? 3 : outcome === 'partial' ? 1 : outcome === 'failed' ? -2 : 0;
  const updated: PlayerObjective = {
    ...input.objective,
    status: completed ? (outcome === 'failed' ? 'failed' : 'completed') : input.objective.status,
    progress: Math.round(nextStages.filter((entry) => entry.status === 'completed').length / nextStages.length * 100),
    operation: {
      ...operation,
      stages: nextStages,
      currentStageIndex,
      quality,
      attempts: operation.attempts + 1,
      outcome,
      completedYear: completed ? Math.floor(input.absoluteHour / (365 * 24)) : operation.completedYear,
      log: [
        `${stage.title}: ${success ? 'этап выполнен' : `частичный результат +${progressGain}%`} (${input.approach}).`,
        ...operation.log
      ].slice(0, 24)
    }
  };
  const message = completed
    ? `Операция завершена: ${outcome}. Награда ₡${reward}.`
    : stageCompleted
      ? `Этап «${stage.title}» завершён.`
      : `Получен частичный результат: ${current.progress}/${current.requiredProgress}.`;

  return {
    ok: true,
    message,
    objective: updated,
    hours: automatic ? 1 : input.approach === 'careful' ? 12 : input.approach === 'negotiate' ? 8 : 6,
    creditsCost,
    healthLoss,
    reward,
    reputation,
    career,
    careerGain: completed ? (outcome === 'exceptional' ? 28 : outcome === 'successful' ? 20 : outcome === 'partial' ? 12 : 4) : success ? 5 : 2,
    completed,
    outcome
  };
}

export function applyCaptainCareer(captain: Captain, path: CaptainCareerPath, gain: number, completed: boolean): Captain {
  const career = normalizeCareer(captain);
  const renown = Math.max(0, Math.round((career.renown[path] ?? 0) + gain));
  career.renown[path] = renown;
  if (!career.primary && renown >= 35) career.primary = path;
  const title = renown >= 90 ? `${careerLabels[path]} галактического уровня` : renown >= 45 ? careerLabels[path] : undefined;
  if (title && !career.titles.includes(title)) career.titles.unshift(title);
  career.titles = career.titles.slice(0, 8);
  if (completed) career.completedOperations += 1;
  const xp = captain.xp + Math.max(1, Math.round(gain * 3 + (completed ? 35 : 0)));
  return {
    ...captain,
    xp,
    level: Math.max(captain.level, 1 + Math.floor(xp / 250)),
    career
  };
}
