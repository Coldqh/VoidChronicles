import type { Evidence, Hypothesis, PointOfInterest } from '../game/types';

const titles: Record<PointOfInterest['type'], string> = {
  ruin: 'Причина гибели поселения',
  wreck: 'Причина катастрофы судна',
  settlement: 'Истинное происхождение колонии',
  laboratory: 'Назначение исследовательского комплекса',
  cave: 'Природа подземной структуры',
  ancientFactory: 'Последний приказ комплекса',
  graveyard: 'Происхождение захоронения',
  smugglerCamp: 'Владельцы тайного лагеря',
  anomaly: 'Природа аномалии',
  biosphere: 'Разумность экосистемы',
  distress: 'Причина исчезновения экспедиции'
};

export function buildHypothesis(
  point: PointOfInterest,
  evidence: Evidence[],
  year: number,
  previous?: Hypothesis
): Hypothesis {
  const reliability = evidence.length === 0
    ? 0
    : evidence.reduce((sum, entry) => sum + entry.reliability, 0) / evidence.length;
  const diversity = new Set(evidence.map((entry) => entry.kind)).size;
  const confidence = Math.max(18, Math.min(98, Math.round(reliability * 0.7 + evidence.length * 7 + diversity * 4)));
  const status: Hypothesis['status'] = confidence >= 85
    ? 'confirmed'
    : confidence >= 60
      ? 'supported'
      : 'tentative';

  const strongest = [...evidence].sort((a, b) => b.reliability - a.reliability)[0];
  const summary = strongest
    ? `${strongest.description} ${evidence.length > 1 ? `Сопоставлено ${evidence.length} независимых улик.` : 'Версия требует дополнительных данных.'}`
    : 'Недостаточно данных для уверенного вывода.';

  return {
    id: previous?.id ?? `hyp_${point.id}`,
    pointOfInterestId: point.id,
    title: titles[point.type],
    summary,
    confidence,
    status,
    evidenceIds: evidence.map((entry) => entry.id),
    updatedYear: year
  };
}
