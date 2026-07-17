import type {
  Faction,
  Hub,
  LocalNpc,
  OperationCategory,
  OperationOutcome,
  OperationRequest,
  PendingConsequence,
  PlayerObjective,
  StoryScene
} from '../game/types';
import { createRng, stableHash } from '../generation/rng';
import { operationStagesFor } from '../operations/runtime';

interface ConsequenceNarrative {
  title: string;
  text: string;
  followUpTitle: string;
  followUpSummary: string;
  nextCategory: OperationCategory;
  finalTitle: string;
}

interface ProjectionInput {
  due: PendingConsequence[];
  existingScenes: StoryScene[];
  factions: Faction[];
  hubs: Hub[];
  localNpcs: LocalNpc[];
  year: number;
}

interface ProjectionResult {
  storyScenes: StoryScene[];
  factions: Faction[];
  localNpcs: LocalNpc[];
}

const successfulNarratives: Record<OperationCategory, ConsequenceNarrative> = {
  relief: {
    title: 'Часть помощи исчезла со складов',
    text: 'Получатели подтверждают доставку, но часть груза уже появилась на закрытом рынке.',
    followUpTitle: 'Куда ушла помощь',
    followUpSummary: 'Проверить склады, посредников и тех, кто получил доступ к грузу после передачи.',
    nextCategory: 'investigation',
    finalTitle: 'Снабжение перешло под устойчивый контроль'
  },
  evacuation: {
    title: 'В списках эвакуации не хватает людей',
    text: 'Спасённые добрались до безопасного узла. Семьи утверждают, что несколько пассажиров исчезли после регистрации.',
    followUpTitle: 'Пропавшие после эвакуации',
    followUpSummary: 'Сверить списки, записи шлюзов и маршруты транспортов после прибытия.',
    nextCategory: 'investigation',
    finalTitle: 'Судьба эвакуированных установлена'
  },
  escort: {
    title: 'Открытый коридор снова атакован',
    text: 'Караваны пошли по маршруту, но новая группа использует данные о безопасном проходе для засад.',
    followUpTitle: 'Кто читает маршрут',
    followUpSummary: 'Найти источник утечки и обезопасить коридор до следующего каравана.',
    nextCategory: 'investigation',
    finalTitle: 'Коридор закреплён'
  },
  mediation: {
    title: 'Перемирие нарушено на окраине',
    text: 'Основные силы соблюдают договор, но полевой командир отказался признать подписанный протокол.',
    followUpTitle: 'Сторона вне соглашения',
    followUpSummary: 'Открыть отдельный канал и не дать локальному столкновению сорвать перемирие.',
    nextCategory: 'mediation',
    finalTitle: 'Договорённость пережила первый кризис'
  },
  investigation: {
    title: 'Ключевой свидетель исчез',
    text: 'Выводы начали распространяться. Человек, подтвердивший главную часть версии, пропал из открытой сети.',
    followUpTitle: 'Последний канал свидетеля',
    followUpSummary: 'Восстановить маршрут свидетеля и выяснить, кто пытался закрыть расследование.',
    nextCategory: 'recovery',
    finalTitle: 'Расследование выдержало проверку'
  },
  recovery: {
    title: 'Право на находку оспорено',
    text: 'Передача завершена, но другая сторона предъявила архивные доказательства владения.',
    followUpTitle: 'Спор о наследии',
    followUpSummary: 'Проверить происхождение документов и решить, кому принадлежит найденный объект.',
    nextCategory: 'mediation',
    finalTitle: 'Судьба наследия определена'
  },
  containment: {
    title: 'Очаг изменился после локализации',
    text: 'Основной контур держится. Вторичные датчики фиксируют новую форму угрозы за его пределами.',
    followUpTitle: 'Вторичный очаг',
    followUpSummary: 'Собрать образцы и определить, является ли новый сигнал мутацией или отдельным источником.',
    nextCategory: 'investigation',
    finalTitle: 'Угроза переведена в контролируемое состояние'
  }
};

const failedNarratives: Record<OperationCategory, ConsequenceNarrative> = {
  relief: {
    title: 'Дефицит перерос в беспорядки',
    text: 'Снабжение не стабилизировалось. Местные склады закрыты, а цены растут каждый цикл.',
    followUpTitle: 'Аварийное снабжение',
    followUpSummary: 'Вернуться с новым маршрутом поставок до полного распада распределительной сети.',
    nextCategory: 'relief',
    finalTitle: 'Кризис снабжения получил окончательный исход'
  },
  evacuation: {
    title: 'Зона эвакуации закрылась',
    text: 'Оставшиеся жители потеряли доступ к прежнему коридору. Сигналы идут из нескольких разрозненных укрытий.',
    followUpTitle: 'Последний выход',
    followUpSummary: 'Найти новый путь и вывести тех, кто не успел к первой эвакуации.',
    nextCategory: 'evacuation',
    finalTitle: 'Эвакуационный кризис завершён'
  },
  escort: {
    title: 'Торговый путь захвачен',
    text: 'После срыва сопровождения противник закрепился на маршруте и начал досматривать гражданские суда.',
    followUpTitle: 'Вернуть коридор',
    followUpSummary: 'Снять блокаду, вывести застрявшие корабли и восстановить движение.',
    nextCategory: 'escort',
    finalTitle: 'Судьба торгового пути решена'
  },
  mediation: {
    title: 'Переговоры стали поводом для удара',
    text: 'Одна из сторон использовала встречу для перегруппировки. Гражданские районы готовятся к новой атаке.',
    followUpTitle: 'Коридор из зоны конфликта',
    followUpSummary: 'Не дать провалу переговоров превратиться в массовые потери.',
    nextCategory: 'evacuation',
    finalTitle: 'Последствия проваленных переговоров исчерпаны'
  },
  investigation: {
    title: 'Официальная версия укрепилась',
    text: 'Недостаток доказательств позволил заинтересованной стороне закрыть доступ к свидетелям и архивам.',
    followUpTitle: 'Закрытый архив',
    followUpSummary: 'Найти независимый источник и восстановить уничтожаемые материалы.',
    nextCategory: 'investigation',
    finalTitle: 'Спорная версия получила окончательный статус'
  },
  recovery: {
    title: 'Артефакт сменил владельца',
    text: 'Пока операция была сорвана, объект вывезли через неучтённый транспортный канал.',
    followUpTitle: 'След нового владельца',
    followUpSummary: 'Найти объект до того, как он исчезнет в закрытой торговой сети.',
    nextCategory: 'recovery',
    finalTitle: 'Поиск утраченного наследия закончен'
  },
  containment: {
    title: 'Заражение вышло за контур',
    text: 'Угроза продолжила распространяться. Соседние сектора вводят ограничения на движение.',
    followUpTitle: 'Расширенная зона заражения',
    followUpSummary: 'Установить новый периметр и остановить распространение до соседних систем.',
    nextCategory: 'containment',
    finalTitle: 'Распространение угрозы остановлено или признано необратимым'
  }
};

function toneForOutcome(outcome: OperationOutcome): PendingConsequence['tone'] {
  if (outcome === 'failed') return 'danger';
  if (outcome === 'partial') return 'warning';
  if (outcome === 'exceptional') return 'good';
  return 'info';
}

function reputationImpact(outcome: OperationOutcome): number {
  if (outcome === 'exceptional') return 3;
  if (outcome === 'successful') return 2;
  if (outcome === 'partial') return 0;
  return -3;
}

function factionDisposition(reputation: number): Faction['disposition'] {
  if (reputation <= -45) return 'hostile';
  if (reputation < -5) return 'wary';
  if (reputation >= 25) return 'friendly';
  return 'neutral';
}

function narrativeFor(category: OperationCategory, outcome: OperationOutcome): ConsequenceNarrative {
  return outcome === 'failed' ? failedNarratives[category] : successfulNarratives[category];
}

export function createOperationConsequence(input: {
  objective: PlayerObjective;
  year: number;
  seed: string;
}): PendingConsequence | null {
  const operation = input.objective.operation;
  if (!operation || input.objective.status !== 'completed' || !operation.outcome) return null;

  const rng = createRng(`${input.seed}:operation-consequence:${operation.requestId}:${operation.chain?.stage ?? 1}:${operation.outcome}`);
  const currentStage = operation.chain?.stage ?? 1;
  const maxStages = operation.chain?.maxStages ?? rng.int(2, 4);
  const chain = operation.chain ?? {
    id: `chain_${stableHash(`${input.seed}:${operation.requestId}`)}`,
    stage: currentStage,
    maxStages,
    originObjectiveId: input.objective.id,
    previousOutcome: operation.outcome
  };
  const final = currentStage >= maxStages;
  const narrative = narrativeFor(operation.category, operation.outcome);
  const partialPrefix = operation.outcome === 'partial' ? 'Результат оказался временным. ' : '';
  const title = final ? `Итог цепочки: ${narrative.finalTitle}` : narrative.title;
  const text = final
    ? `${operation.issuerName} закрывает дело после ${currentStage} связанных операций. Последний результат: ${operation.outcome}.`
    : `${partialPrefix}${narrative.text}`;

  return {
    id: `consequence_operation_${chain.id}_${currentStage}_${operation.outcome}`,
    status: 'pending',
    createdYear: input.year,
    triggerYear: input.year + rng.int(1, 3),
    title,
    text,
    tone: toneForOutcome(operation.outcome),
    systemId: operation.targetSystemId,
    factionId: operation.issuerFactionId,
    sourceSceneId: `operation:${input.objective.id}`,
    operation: {
      chain: { ...chain, stage: currentStage, previousOutcome: operation.outcome },
      sourceObjectiveId: input.objective.id,
      threadId: operation.threadId,
      category: operation.category,
      outcome: operation.outcome,
      quality: operation.quality,
      issuerName: operation.issuerName,
      issuerCivilizationId: operation.issuerCivilizationId,
      issuerFactionId: operation.issuerFactionId,
      targetSystemId: operation.targetSystemId,
      reward: operation.reward
    }
  };
}

function followUpRequest(consequence: PendingConsequence, year: number): OperationRequest | undefined {
  const context = consequence.operation;
  if (!context || context.chain.stage >= context.chain.maxStages) return undefined;
  const narrative = narrativeFor(context.category, context.outcome);
  const nextStage = context.chain.stage + 1;
  const urgency = context.outcome === 'failed' ? 86 : context.outcome === 'partial' ? 72 : 58;
  const reward = Math.max(320, Math.round(context.reward * 0.72 + nextStage * 110));

  return {
    id: `operation_followup_${context.chain.id}_${nextStage}`,
    threadId: context.threadId,
    category: narrative.nextCategory,
    title: `Глава ${nextStage}/${context.chain.maxStages}: ${narrative.followUpTitle}`,
    summary: narrative.followUpSummary,
    issuerName: context.issuerName,
    issuerCivilizationId: context.issuerCivilizationId,
    issuerFactionId: context.issuerFactionId,
    targetSystemId: context.targetSystemId,
    reward,
    deadlineYear: year + Math.max(2, 6 - Math.floor(urgency / 24)),
    urgency,
    stages: operationStagesFor(narrative.nextCategory, context.targetSystemId),
    chain: {
      ...context.chain,
      stage: nextStage,
      previousOutcome: context.outcome
    }
  };
}

function chooseSourceNpc(context: NonNullable<PendingConsequence['operation']>, hubs: Hub[], localNpcs: LocalNpc[]): LocalNpc | undefined {
  const hub = hubs.find((entry) => entry.systemId === context.targetSystemId && (!context.issuerFactionId || entry.factionId === context.issuerFactionId))
    ?? hubs.find((entry) => entry.systemId === context.targetSystemId);
  return localNpcs.find((entry) => entry.present && entry.alive && entry.hubId === hub?.id);
}

function buildConsequenceScene(
  consequence: PendingConsequence,
  year: number,
  factions: Faction[],
  hubs: Hub[],
  localNpcs: LocalNpc[]
): StoryScene | null {
  const context = consequence.operation;
  if (!context) return null;
  const request = followUpRequest(consequence, year);
  const faction = factions.find((entry) => entry.id === context.issuerFactionId);
  const npc = chooseSourceNpc(context, hubs, localNpcs);
  const source = npc?.name ?? faction?.name ?? context.issuerName;
  const choices = request
    ? [
        {
          id: 'accept-operation',
          label: 'Продолжить цепочку',
          summary: `Принять следующую главу ${request.chain?.stage}/${request.chain?.maxStages}.`,
          risk: request.urgency >= 80 ? 'high' as const : 'medium' as const,
          effect: {}
        },
        {
          id: 'decline-operation',
          label: 'Закрыть канал',
          summary: 'Не возвращаться к последствиям прошлого решения.',
          risk: 'low' as const,
          effect: { factionId: context.issuerFactionId, factionReputation: -2 }
        }
      ]
    : [
        {
          id: 'acknowledge-consequence',
          label: 'Зафиксировать итог',
          summary: 'Закрыть связанную линию и сохранить результат в журнале.',
          risk: 'low' as const,
          effect: {
            factionId: context.issuerFactionId,
            factionReputation: context.outcome === 'exceptional' ? 1 : 0
          }
        }
      ];

  return {
    id: `scene_${consequence.id}`,
    category: 'consequence',
    status: 'available',
    title: consequence.title,
    summary: consequence.text,
    body: request
      ? `${source} выходит на связь после операции «${context.sourceObjectiveId}». Предыдущее решение изменило ситуацию, но не закрыло её. Это глава ${request.chain?.stage}/${request.chain?.maxStages}.`
      : `${source} передаёт итоговый отчёт. Связанная линия завершена после ${context.chain.maxStages} операций.`,
    source,
    systemId: context.targetSystemId,
    hubId: hubs.find((entry) => entry.systemId === context.targetSystemId && entry.factionId === context.issuerFactionId)?.id,
    npcIds: npc ? [npc.id] : [],
    factionIds: context.issuerFactionId ? [context.issuerFactionId] : [],
    createdYear: year,
    expiresYear: request?.deadlineYear,
    choices,
    operationRequest: request
  };
}

export function projectLivingConsequenceScenes(input: ProjectionInput): ProjectionResult {
  let factions = input.factions.map((entry) => ({ ...entry, memories: [...entry.memories] }));
  let localNpcs = input.localNpcs.map((entry) => ({ ...entry, memories: [...entry.memories] }));
  const scenes = [...input.existingScenes];
  const existingIds = new Set(scenes.map((entry) => entry.id));

  for (const consequence of input.due) {
    const context = consequence.operation;
    if (!context) continue;
    const scene = buildConsequenceScene(consequence, input.year, factions, input.hubs, localNpcs);
    if (scene && !existingIds.has(scene.id)) {
      scenes.unshift(scene);
      existingIds.add(scene.id);
    }

    const impact = reputationImpact(context.outcome);
    if (context.issuerFactionId) {
      factions = factions.map((faction) => {
        if (faction.id !== context.issuerFactionId) return faction;
        const reputation = Math.max(-100, Math.min(100, faction.reputation + impact));
        return {
          ...faction,
          reputation,
          disposition: factionDisposition(reputation),
          memories: [{
            id: `fmemory_consequence_${consequence.id}`,
            year: input.year,
            action: `operation-chain-${context.chain.id}`,
            impact,
            text: consequence.text
          }, ...faction.memories].slice(0, 40)
        };
      });
    }

    const npc = chooseSourceNpc(context, input.hubs, localNpcs);
    if (npc) {
      const trustImpact = impact > 0 ? 4 : impact < 0 ? -5 : 1;
      localNpcs = localNpcs.map((entry) => entry.id === npc.id ? {
        ...entry,
        trust: Math.max(-100, Math.min(100, entry.trust + trustImpact)),
        memories: [{
          id: `npc_consequence_${consequence.id}`,
          year: input.year,
          kind: impact > 0 ? 'help' as const : impact < 0 ? 'threat' as const : 'deal' as const,
          text: consequence.text,
          impact: trustImpact
        }, ...entry.memories].slice(0, 20)
      } : entry);
    }
  }

  return {
    storyScenes: scenes.slice(0, 180),
    factions,
    localNpcs
  };
}

export function worldEventDraftForConsequence(consequence: PendingConsequence) {
  const context = consequence.operation;
  if (!context) return null;
  const kind = context.category === 'containment'
    ? 'ecology' as const
    : context.category === 'mediation'
      ? 'politics' as const
      : context.category === 'investigation' || context.category === 'recovery'
        ? 'discovery' as const
        : context.category === 'escort' || context.category === 'evacuation'
          ? 'conflict' as const
          : 'economy' as const;

  return {
    kind,
    title: consequence.title,
    summary: consequence.text,
    severity: consequence.tone === 'danger' ? 7 : consequence.tone === 'warning' ? 5 : consequence.tone === 'good' ? 4 : 3,
    visibility: 'local' as const,
    systemIds: context.targetSystemId ? [context.targetSystemId] : [],
    civilizationIds: context.issuerCivilizationId ? [context.issuerCivilizationId] : [],
    factionIds: context.issuerFactionId ? [context.issuerFactionId] : [],
    tags: ['living-consequence', 'player-operation', context.category, context.outcome],
    data: {
      chainId: context.chain.id,
      chainStage: context.chain.stage,
      chainMaxStages: context.chain.maxStages,
      operationOutcome: context.outcome
    }
  };
}
