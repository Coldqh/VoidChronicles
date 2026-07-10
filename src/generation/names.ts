import type { RandomSource } from './rng';

const starPrefixes = ['Astra', 'Vel', 'Nox', 'Ilyr', 'Khar', 'Sol', 'Ere', 'Myr', 'Tess', 'Or', 'Zan', 'Qel', 'Var', 'Nyx', 'Cal'];
const starSuffixes = ['ion', 'ara', 'os', 'eth', 'um', 'is', 'ae', 'or', 'ex', 'une', 'ath', 'on'];
const speciesRoots = ['Thal', 'Vey', 'Keth', 'Orr', 'Maal', 'Zhir', 'Nemi', 'Qari', 'Ixo', 'Saal', 'Dren', 'Uru'];
const civTitles = ['Concord', 'Dominion', 'Collective', 'Choir', 'League', 'Dynasty', 'Archive', 'Syndicate', 'Pilgrimage', 'Mandate'];
const figureGiven = ['Aren', 'Mira', 'Kesh', 'Tovan', 'Iris', 'Vaal', 'Nera', 'Sorin', 'Dax', 'Yara', 'Omen', 'Thess'];
const figureFamily = ['Vale', 'Orrix', 'Taal', 'Nemer', 'Serr', 'Kael', 'Voss', 'Ilyan', 'Qor', 'Mareth'];

export function starName(rng: RandomSource): string {
  return `${rng.pick(starPrefixes)}${rng.pick(starSuffixes)}-${rng.int(2, 999)}`;
}
export function planetName(rng: RandomSource, systemName: string, index: number): string {
  return `${systemName.split('-')[0]} ${String.fromCharCode(98 + index)}`;
}
export function speciesName(rng: RandomSource): string {
  return `${rng.pick(speciesRoots)}${rng.pick(['ari', 'en', 'oth', 'i', 'uun', 'esh'])}`;
}
export function civilizationName(rng: RandomSource, species: string): string {
  return `${rng.pick(civTitles)} of ${species}`;
}
export function figureName(rng: RandomSource): string {
  return `${rng.pick(figureGiven)} ${rng.pick(figureFamily)}`;
}
