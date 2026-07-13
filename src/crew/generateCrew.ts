import type { CrewCandidate, CrewRole, StarSystem } from '../game/types';
import { createRng } from '../generation/rng';

const FIRST = ['Ада', 'Иллар', 'Мира', 'Рен', 'Сол', 'Тарек', 'Неви', 'Каэл', 'Ора', 'Весс', 'Лио', 'Зара', 'Тесс', 'Кейр', 'Нокс'];
const LAST = ['Рейн', 'Вар', 'Келл', 'Сорн', 'Иш', 'Вей', 'Тал', 'Мор', 'Дрей', 'Касс', 'Нери', 'Холт'];
const SPECIES = ['человек', 'сарий', 'мирр', 'кхаал', 'синтет', 'орикс', 'велари', 'талассиец'];
const CULTURES = ['ядро', 'пограничные колонии', 'вольные станции', 'торговые дома', 'военный протекторат', 'университетские миры', 'кочевые флоты'];
const ROLES: CrewRole[] = ['pilot', 'engineer', 'doctor', 'scientist', 'archaeologist', 'soldier', 'diplomat', 'biologist', 'smuggler'];
const TRAITS = ['хладнокровный', 'жадный', 'верный', 'подозрительный', 'азартный', 'дисциплинированный', 'любопытный', 'мстительный', 'бережливый', 'молчаливый'];
const BELIEFS = ['знание должно быть свободным', 'деньги важнее славы', 'экипаж нельзя бросать', 'древние технологии нужно уничтожать', 'контракт выше дружбы', 'любая тайна имеет цену'];

export function roleLabel(role: CrewRole): string {
  return ({ pilot: 'пилот', engineer: 'инженер', doctor: 'врач', scientist: 'учёный', archaeologist: 'археолог', soldier: 'солдат', diplomat: 'дипломат', biologist: 'биолог', smuggler: 'контрабандист' } as const)[role];
}

export function generateCrewCandidates(seed: string, system: StarSystem, gameYear: number, count = 4): CrewCandidate[] {
  const rng = createRng(`${seed}:crew:${system.id}:${Math.floor(gameYear / 3)}`);
  return Array.from({ length: count }, (_, index) => {
    const primaryRole = rng.pick(ROLES);
    const secondaryPool = ROLES.filter((role) => role !== primaryRole);
    const level = rng.int(1, Math.max(2, system.region === 'core' ? 3 : 4));
    const salary = 70 + level * 45 + rng.int(0, 45);
    const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    return {
      id: `crew_${system.id}_${Math.floor(gameYear / 3)}_${index}`,
      name,
      species: rng.pick(SPECIES),
      culture: rng.pick(CULTURES),
      primaryRole,
      secondaryRole: rng.chance(0.48) ? rng.pick(secondaryPool) : undefined,
      level,
      health: 100,
      maxHealth: 100,
      morale: rng.int(48, 78),
      loyalty: rng.int(35, 65),
      salary,
      sharePercent: rng.int(2, 7),
      contractYears: rng.int(4, 12),
      joinedYear: gameYear,
      paidUntilYear: gameYear,
      traits: (() => { const first = rng.pick(TRAITS); return [first, rng.pick(TRAITS.filter((trait) => trait !== first))]; })(),
      belief: rng.pick(BELIEFS),
      status: 'active',
      injuries: [],
      memories: [],
      signingCost: salary * 2,
      originSystemId: system.id
    };
  });
}

export function crewRoleBonus(role: CrewRole): { equipment?: string; combat?: number; evidence?: number; turns?: number; healing?: number } {
  switch (role) {
    case 'engineer': return { equipment: 'cutter', turns: 2 };
    case 'doctor': return { healing: 18 };
    case 'scientist': return { evidence: 8 };
    case 'archaeologist': return { evidence: 12 };
    case 'soldier': return { combat: 14 };
    case 'biologist': return { equipment: 'sampleContainer', evidence: 8 };
    case 'smuggler': return { equipment: 'explosives', combat: 5 };
    case 'pilot': return { turns: 4 };
    case 'diplomat': return { evidence: 5 };
  }
}
