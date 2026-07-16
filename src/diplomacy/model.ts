import type { Civilization, CivilizationContact, ContactStage } from '../game/types';
import type { WorldEvent } from '../simulation/types';

export type DiplomaticActionId =
  | 'offer-trade'
  | 'send-aid'
  | 'request-landing'
  | 'exchange-data'
  | 'return-heritage'
  | 'mediate-crisis';

export type DiplomaticOutcome = 'accepted' | 'conditional' | 'rejected';

export interface DiplomaticMessage {
  id: string;
  atHour: number;
  action: DiplomaticActionId;
  outcome: DiplomaticOutcome;
  title: string;
  summary: string;
}

export interface DiplomaticProfile {
  civilizationId: string;
  stage: ContactStage;
  trust: number;
  respect: number;
  suspicion: number;
  fear: number;
  agreements: string[];
  messages: DiplomaticMessage[];
}

export interface DiplomaticContextFlags {
  hasHeritage: boolean;
  hasSettlement: boolean;
  hasCrisis: boolean;
  hasTradeAgreement: boolean;
  hasLandingAccess: boolean;
}

export interface DiplomaticActionDefinition {
  id: DiplomaticActionId;
  label: string;
  description: string;
  cost: number;
  available: boolean;
  blockedReason?: string;
}

const stageRank: Record<ContactStage, number> = {
  unknown: 0,
  observed: 1,
  signals: 2,
  translated: 3,
  contacted: 4,
  trusted: 5,
  failed: 1
};

const numberData = (event: WorldEvent, key: string): number => {
  const value = event.data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const stringData = (event: WorldEvent, key: string): string => {
  const value = event.data?.[key];
  return typeof value === 'string' ? value : '';
};

export function diplomaticProfile(
  civilization: Civilization,
  contact: CivilizationContact,
  events: WorldEvent[]
): DiplomaticProfile {
  const related = events
    .filter((event) => event.civilizationIds.includes(civilization.id) && event.tags.includes('diplomacy'))
    .sort((a, b) => b.atHour - a.atHour);

  const agreements = [...new Set(related.map((event) => stringData(event, 'diplomaticAgreement')).filter(Boolean))];
  const respect = related.reduce((sum, event) => sum + numberData(event, 'diplomaticRespectDelta'), 0);
  const suspicion = Math.max(0, related.reduce((sum, event) => sum + numberData(event, 'diplomaticSuspicionDelta'), contact.stage === 'failed' ? 20 : 0));
  const fear = Math.max(0, related.reduce((sum, event) => sum + numberData(event, 'diplomaticFearDelta'), 0));

  return {
    civilizationId: civilization.id,
    stage: contact.stage,
    trust: Math.max(-100, Math.min(100, Math.round(contact.trust))),
    respect: Math.max(-100, Math.min(100, Math.round(respect))),
    suspicion: Math.max(0, Math.min(100, Math.round(suspicion))),
    fear: Math.max(0, Math.min(100, Math.round(fear))),
    agreements,
    messages: related.slice(0, 12).map((event) => ({
      id: event.id,
      atHour: event.atHour,
      action: (stringData(event, 'diplomaticAction') || 'exchange-data') as DiplomaticActionId,
      outcome: (stringData(event, 'diplomaticOutcome') || 'conditional') as DiplomaticOutcome,
      title: event.title,
      summary: event.summary
    }))
  };
}

export function diplomaticStanding(profile: DiplomaticProfile): string {
  const score = profile.trust + profile.respect * 0.55 - profile.suspicion * 0.7 - profile.fear * 0.25;
  if (score >= 75) return 'союзное';
  if (score >= 35) return 'доверительное';
  if (score >= 5) return 'рабочее';
  if (score >= -25) return 'настороженное';
  return 'враждебное';
}

export function availableDiplomaticActions(
  profile: DiplomaticProfile,
  flags: DiplomaticContextFlags
): DiplomaticActionDefinition[] {
  const contacted = stageRank[profile.stage] >= stageRank.contacted;
  const translated = stageRank[profile.stage] >= stageRank.translated;
  const trusted = stageRank[profile.stage] >= stageRank.trusted || profile.trust >= 45;
  const result: DiplomaticActionDefinition[] = [
    {
      id: 'offer-trade',
      label: flags.hasTradeAgreement ? 'Расширить торговлю' : 'Предложить торговлю',
      description: 'Открывает экономический канал и улучшает снабжение связанной системы.',
      cost: 0,
      available: contacted,
      blockedReason: contacted ? undefined : 'Нужен официальный контакт.'
    },
    {
      id: 'send-aid',
      label: 'Отправить помощь',
      description: 'Передать пищу и медикаменты ближайшему известному поселению.',
      cost: 180,
      available: contacted && flags.hasSettlement,
      blockedReason: !contacted ? 'Нужен официальный контакт.' : !flags.hasSettlement ? 'Нет подтверждённого поселения.' : undefined
    },
    {
      id: 'request-landing',
      label: flags.hasLandingAccess ? 'Подтвердить доступ' : 'Запросить посадку',
      description: 'Запросить официальный доступ к портам и поселениям.',
      cost: 0,
      available: translated,
      blockedReason: translated ? undefined : 'Сначала нужен перевод канала.'
    },
    {
      id: 'exchange-data',
      label: 'Обменяться данными',
      description: 'Передать научный пакет и запросить сведения об обществе и истории.',
      cost: 0,
      available: contacted,
      blockedReason: contacted ? undefined : 'Нужен официальный контакт.'
    },
    {
      id: 'return-heritage',
      label: 'Вернуть наследие',
      description: 'Передать найденный артефакт его создателям без продажи.',
      cost: 0,
      available: contacted && flags.hasHeritage,
      blockedReason: !contacted ? 'Нужен официальный контакт.' : !flags.hasHeritage ? 'На корабле нет их артефакта.' : undefined
    },
    {
      id: 'mediate-crisis',
      label: 'Предложить посредничество',
      description: 'Попытаться снизить напряжение вокруг известного кризиса.',
      cost: 0,
      available: trusted && flags.hasCrisis,
      blockedReason: !flags.hasCrisis ? 'Нет известного кризиса.' : !trusted ? 'Нужен высокий уровень доверия.' : undefined
    }
  ];
  return result;
}

export function resolveDiplomaticOutcome(
  action: DiplomaticActionId,
  profile: DiplomaticProfile,
  civilization: Civilization,
  roll: number,
  specialistBonus = 0
): DiplomaticOutcome {
  const policy = `${civilization.outsiderPolicy ?? ''} ${civilization.ideology}`.toLowerCase();
  const openness = policy.includes('торг') || policy.includes('гостеп') || policy.includes('обмен') ? 0.12 : policy.includes('изоля') || policy.includes('вражд') ? -0.16 : 0;
  const actionBias = action === 'send-aid' || action === 'return-heritage' ? 0.18 : action === 'mediate-crisis' ? -0.08 : 0;
  const relation = profile.trust / 260 + profile.respect / 420 - profile.suspicion / 300 - profile.fear / 520;
  const chance = Math.max(0.08, Math.min(0.94, 0.5 + openness + actionBias + relation + specialistBonus));
  if (roll <= chance - 0.18) return 'accepted';
  if (roll <= chance) return 'conditional';
  return 'rejected';
}
