import type {
  CivilizationalEra,
  CivilizationSpaceAccess,
  CivilizationTechnologyProfile,
  DeepTechnologyField
} from './types';

export const ERA_ORDER: readonly CivilizationalEra[] = [
  'pre-sapient',
  'tribal',
  'neolithic',
  'urban',
  'bronze',
  'iron',
  'medieval',
  'gunpowder',
  'industrial',
  'modern',
  'atomic',
  'early-space',
  'interplanetary',
  'interstellar',
  'advanced'
];

export const TECHNOLOGY_FIELDS: readonly DeepTechnologyField[] = [
  'subsistence',
  'agriculture',
  'materials',
  'writing',
  'governance',
  'medicine',
  'navigation',
  'military',
  'industry',
  'energy',
  'computing',
  'biology',
  'spaceflight',
  'ftl'
];

export const ERA_LABELS: Record<CivilizationalEra, string> = {
  'pre-sapient': 'Доразумная',
  tribal: 'Племенная',
  neolithic: 'Неолитическая',
  urban: 'Ранние города',
  bronze: 'Бронзовый век',
  iron: 'Железный век',
  medieval: 'Средневековая',
  gunpowder: 'Пороховая',
  industrial: 'Индустриальная',
  modern: 'Современная',
  atomic: 'Атомная',
  'early-space': 'Ранняя космическая',
  interplanetary: 'Межпланетная',
  interstellar: 'Межзвёздная',
  advanced: 'Высокотехнологическая'
};

export const ERA_BASE_DURATION_YEARS: Record<CivilizationalEra, number> = {
  'pre-sapient': 180_000,
  tribal: 28_000,
  neolithic: 8_000,
  urban: 3_200,
  bronze: 2_200,
  iron: 2_000,
  medieval: 1_500,
  gunpowder: 650,
  industrial: 280,
  modern: 160,
  atomic: 180,
  'early-space': 260,
  interplanetary: 480,
  interstellar: 900,
  advanced: Number.POSITIVE_INFINITY
};

const FIELD_UNLOCK_ERA: Record<DeepTechnologyField, CivilizationalEra> = {
  subsistence: 'pre-sapient',
  agriculture: 'neolithic',
  materials: 'tribal',
  writing: 'urban',
  governance: 'urban',
  medicine: 'tribal',
  navigation: 'tribal',
  military: 'tribal',
  industry: 'industrial',
  energy: 'bronze',
  computing: 'modern',
  biology: 'modern',
  spaceflight: 'early-space',
  ftl: 'interstellar'
};

export function eraIndex(era: CivilizationalEra): number {
  return ERA_ORDER.indexOf(era);
}

export function nextEra(era: CivilizationalEra): CivilizationalEra | null {
  const index = eraIndex(era);
  return index >= 0 && index < ERA_ORDER.length - 1 ? ERA_ORDER[index + 1]! : null;
}

export function previousEra(era: CivilizationalEra): CivilizationalEra {
  return ERA_ORDER[Math.max(0, eraIndex(era) - 1)]!;
}

export function isSpacefaringEra(era: CivilizationalEra): boolean {
  return eraIndex(era) >= eraIndex('early-space');
}

export function spaceAccessForEra(era: CivilizationalEra): CivilizationSpaceAccess {
  if (eraIndex(era) < eraIndex('early-space')) return 'none';
  if (era === 'early-space') return 'orbital';
  if (era === 'interplanetary') return 'interplanetary';
  if (era === 'interstellar') return 'interstellar';
  return 'ftl';
}

export function legacyTechLevelForEra(era: CivilizationalEra): number {
  const index = eraIndex(era);
  if (index <= eraIndex('neolithic')) return 1;
  if (index <= eraIndex('bronze')) return 2;
  if (index <= eraIndex('medieval')) return 3;
  if (era === 'gunpowder') return 4;
  if (era === 'industrial') return 5;
  if (era === 'modern') return 6;
  if (era === 'atomic') return 7;
  if (era === 'early-space') return 8;
  if (era === 'interplanetary') return 9;
  return 10;
}

export function technologyTargetForEra(
  era: CivilizationalEra
): CivilizationTechnologyProfile {
  const currentIndex = eraIndex(era);
  return Object.fromEntries(
    TECHNOLOGY_FIELDS.map((field) => {
      const unlockIndex = eraIndex(FIELD_UNLOCK_ERA[field]);
      if (currentIndex < unlockIndex) return [field, 0];
      const depth = currentIndex - unlockIndex + 1;
      const value = Math.min(100, 8 + depth * 13 + currentIndex * 1.8);
      return [field, Math.round(value)];
    })
  ) as CivilizationTechnologyProfile;
}
