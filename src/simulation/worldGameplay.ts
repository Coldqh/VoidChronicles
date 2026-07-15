import type { Contract } from '../game/types';
import type { WorldEvent } from './types';

export type WorldNeedKind =
  | 'relief'
  | 'evacuation'
  | 'route-security'
  | 'ecological-restoration'
  | 'investigation'
  | 'heritage-recovery'
  | 'mediation'
  | 'containment';

export interface WorldNeed {
  id: string;
  sourceEventId: string;
  kind: WorldNeedKind;
  title: string;
  summary: string;
  urgency: number;
  targetSystemId: string;
  targetPointOfInterestId?: string;
  civilizationIds: string[];
  factionIds: string[];
  contractType: Contract['type'];
  requiredProgress: number;
  rewardMultiplier: number;
  illegal: boolean;
  successImpact: string;
  failureImpact: string;
  expiresAfterYears: number;
}

const visibleEvent = (event: WorldEvent): boolean =>
  event.visibility !== 'hidden' &&
  !event.tags.includes('state-snapshot') &&
  !event.tags.includes('player-world-consequence');

function heritageEvent(event: WorldEvent): boolean {
  return event.tags.some((tag) =>
    tag.includes('heritage') ||
    tag.includes('artifact') ||
    tag.includes('archive') ||
    tag.includes('ruin')
  );
}

function needKind(event: WorldEvent): WorldNeedKind | null {
  if (heritageEvent(event)) return 'heritage-recovery';
  if (event.kind === 'shortage') return 'relief';
  if (event.kind === 'migration' || event.kind === 'demography') return 'evacuation';
  if (event.kind === 'ecology' || event.tags.some((tag) => tag.includes('ecosystem') || tag.includes('planetary'))) return 'ecological-restoration';
  if (event.kind === 'conflict') {
    if (event.tags.some((tag) => tag.includes('peace') || tag.includes('ceasefire') || tag.includes('diplom'))) return 'mediation';
    return 'route-security';
  }
  if (event.kind === 'disaster') return 'containment';
  if (event.kind === 'politics' || event.kind === 'economy' || event.kind === 'research' || event.kind === 'discovery') return 'investigation';
  return null;
}

function contractType(kind: WorldNeedKind): Contract['type'] {
  if (kind === 'relief') return 'delivery';
  if (kind === 'evacuation' || kind === 'containment') return 'rescue';
  if (kind === 'route-security') return 'bounty';
  if (kind === 'heritage-recovery') return 'recovery';
  return 'survey';
}

function titleFor(kind: WorldNeedKind, event: WorldEvent): string {
  const subject = event.title.split(':')[0]?.trim();
  if (kind === 'relief') return `Снабжение: ${subject || 'зона дефицита'}`;
  if (kind === 'evacuation') return `Эвакуация: ${subject || 'гражданское население'}`;
  if (kind === 'route-security') return `Безопасность маршрута: ${subject || 'зона конфликта'}`;
  if (kind === 'ecological-restoration') return `Экологическая операция: ${subject || 'пострадавшая планета'}`;
  if (kind === 'heritage-recovery') return `Возврат наследия: ${subject || 'исторический объект'}`;
  if (kind === 'mediation') return `Посредничество: ${subject || 'воюющие стороны'}`;
  if (kind === 'containment') return `Ликвидация последствий: ${subject || 'район катастрофы'}`;
  return `Проверка данных: ${subject || 'нестабильный регион'}`;
}

function impacts(kind: WorldNeedKind): { success: string; failure: string } {
  if (kind === 'relief') return { success: 'запасы восстановятся, здоровье и порядок вырастут', failure: 'дефицит усилится, население начнёт уезжать и умирать' };
  if (kind === 'evacuation') return { success: 'часть населения будет вывезена в безопасный узел', failure: 'потери и миграционное давление вырастут' };
  if (kind === 'route-security') return { success: 'маршрут вернётся в работу, снабжение улучшится', failure: 'маршрут останется сорванным, фронт получит новые потери' };
  if (kind === 'ecological-restoration') return { success: 'загрязнение снизится, устойчивость биосферы вырастет', failure: 'биосфера продолжит деградировать' };
  if (kind === 'heritage-recovery') return { success: 'артефакт или архив вернётся в историческую цепочку', failure: 'объект может быть разграблен, утрачен или уничтожен' };
  if (kind === 'mediation') return { success: 'интенсивность войны и потери снизятся', failure: 'война продолжится без ограничений' };
  if (kind === 'containment') return { success: 'катастрофа будет локализована', failure: 'последствия затронут соседние поселения' };
  return { success: 'скрытая причина станет известна и откроет точное решение', failure: 'кризис останется неразобранным' };
}

export function worldNeedsFromEvents(events: WorldEvent[], limit = 80): WorldNeed[] {
  const seen = new Set<string>();
  const needs: WorldNeed[] = [];
  for (const event of events) {
    if (!visibleEvent(event) || event.severity < 4 || seen.has(event.id)) continue;
    const kind = needKind(event);
    const targetSystemId = event.systemIds[0];
    if (!kind || !targetSystemId) continue;
    seen.add(event.id);
    const impact = impacts(kind);
    const urgency = Math.max(1, Math.min(100, event.severity * 10 + (event.visibility === 'local' ? 4 : 0)));
    needs.push({
      id: `need_${event.id}`,
      sourceEventId: event.id,
      kind,
      title: titleFor(kind, event),
      summary: event.summary,
      urgency,
      targetSystemId,
      targetPointOfInterestId: typeof event.data?.pointOfInterestId === 'string'
        ? event.data.pointOfInterestId
        : typeof event.data?.livingRuinId === 'string'
          ? event.data.livingRuinId
          : undefined,
      civilizationIds: [...event.civilizationIds],
      factionIds: [...event.factionIds],
      contractType: contractType(kind),
      requiredProgress: kind === 'route-security' ? Math.max(2, Math.ceil(event.severity / 3)) : 1,
      rewardMultiplier: 1 + event.severity * 0.18 + (kind === 'heritage-recovery' ? 0.5 : 0),
      illegal: false,
      successImpact: impact.success,
      failureImpact: impact.failure,
      expiresAfterYears: Math.max(1, 6 - Math.floor(event.severity / 2))
    });
    if (needs.length >= limit) break;
  }
  return needs.sort((a, b) => b.urgency - a.urgency);
}

export function sourceEventIdForContract(contract: Contract): string | undefined {
  if (contract.id.startsWith('contract_from_')) return contract.id.slice('contract_from_'.length);
  if (contract.id.startsWith('contract_need_')) return contract.id.slice('contract_need_'.length);
  return undefined;
}

export function worldNeedForContract(contract: Contract, events: WorldEvent[]): WorldNeed | undefined {
  const sourceEventId = sourceEventIdForContract(contract);
  if (!sourceEventId) return undefined;
  return worldNeedsFromEvents(events, 500).find((need) => need.sourceEventId === sourceEventId);
}

export function contractFromWorldNeed(
  need: WorldNeed,
  params: {
    issuerHubId: string;
    issuerFactionId: string;
    year: number;
  }
): Contract {
  const reward = Math.round((650 + need.urgency * 22) * need.rewardMultiplier);
  const advance = Math.max(100, Math.round(reward * 0.16));
  const cargoId = need.contractType === 'delivery'
    ? `cargo_relief_${need.sourceEventId}`
    : undefined;
  return {
    id: `contract_from_${need.sourceEventId}`,
    type: need.contractType,
    status: 'available',
    issuerHubId: params.issuerHubId,
    issuerFactionId: params.issuerFactionId,
    title: need.title,
    description: `${need.summary} Успех: ${need.successImpact}.`,
    reward,
    advance,
    deadlineYear: params.year + need.expiresAfterYears,
    targetSystemId: need.targetSystemId,
    targetPointOfInterestId: need.targetPointOfInterestId,
    progress: 0,
    requiredProgress: need.requiredProgress,
    illegal: need.illegal,
    hiddenClause: `Провал: ${need.failureImpact}. Источник заявки: ${need.sourceEventId}.`,
    cargoId
  };
}

export function worldNeedKindLabel(kind: WorldNeedKind): string {
  return {
    relief: 'Снабжение',
    evacuation: 'Эвакуация',
    'route-security': 'Безопасность',
    'ecological-restoration': 'Экология',
    investigation: 'Расследование',
    'heritage-recovery': 'Наследие',
    mediation: 'Переговоры',
    containment: 'Локализация'
  }[kind];
}
