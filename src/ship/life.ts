import type {
  CrewIssue,
  CrewMember,
  CrewRelationship,
  Ship,
  ShipCompartment,
  ShipCompartmentId,
  ShipLifeState
} from '../game/types';
import { createRng } from '../generation/rng';

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));

const compartmentBlueprints: Array<Pick<ShipCompartment, 'id' | 'name' | 'function' | 'capacity'>> = [
  { id: 'bridge', name: 'Мостик', function: 'Командование, связь и навигация', capacity: 4 },
  { id: 'engineering', name: 'Машинный отсек', function: 'Двигатель, ремонт и обслуживание', capacity: 3 },
  { id: 'reactor', name: 'Реакторный блок', function: 'Энергия и аварийное питание', capacity: 2 },
  { id: 'medbay', name: 'Медблок', function: 'Лечение, карантин и эвакуация', capacity: 4 },
  { id: 'laboratory', name: 'Лаборатория', function: 'Анализ образцов и артефактов', capacity: 3 },
  { id: 'quarters', name: 'Жилой модуль', function: 'Сон, отдых и личное пространство', capacity: 6 },
  { id: 'cargo', name: 'Грузовой отсек', function: 'Груз, реликвии и запасы', capacity: 8 },
  { id: 'airlock', name: 'Шлюзовой блок', function: 'Высадки, EVA и санитарный контроль', capacity: 3 }
];

export const compartmentRole: Record<ShipCompartmentId, CrewMember['primaryRole'][]> = {
  bridge: ['pilot', 'diplomat'],
  engineering: ['engineer'],
  reactor: ['engineer'],
  medbay: ['doctor', 'biologist'],
  laboratory: ['scientist', 'archaeologist', 'biologist'],
  quarters: ['pilot','engineer','doctor','scientist','archaeologist','soldier','diplomat','biologist','smuggler'],
  cargo: ['smuggler', 'engineer'],
  airlock: ['soldier', 'pilot']
};

function defaultRelationships(member: CrewMember, crew: CrewMember[], year: number): CrewRelationship[] {
  return crew.filter((other) => other.id !== member.id).map((other) => ({
    crewId: other.id,
    affinity: 0,
    tension: 0,
    lastChangedYear: year,
    reason: 'Совместная служба только началась'
  }));
}

export function createShipLifeState(year = 0): ShipLifeState {
  return {
    compartments: compartmentBlueprints.map((entry) => ({
      ...entry,
      condition: 100,
      level: 1,
      disabled: false,
      assignedCrewIds: [],
      tags: []
    })),
    supplies: { food: 100, oxygen: 100, medicine: 8, parts: 12 },
    issues: [],
    trophies: [],
    lastUpdatedHour: year * 365 * 24
  };
}

export function normalizeShipLife(ship: Ship, crew: CrewMember[], year: number): { ship: Ship; crew: CrewMember[] } {
  const life = ship.life ?? createShipLifeState(year);
  const compartments = compartmentBlueprints.map((blueprint) => {
    const current = life.compartments.find((entry) => entry.id === blueprint.id);
    return {
      ...blueprint,
      condition: clamp(current?.condition ?? 100),
      level: Math.max(1, Math.round(current?.level ?? 1)),
      disabled: Boolean(current?.disabled || (current?.condition ?? 100) <= 0),
      assignedCrewIds: [...new Set((current?.assignedCrewIds ?? []).filter((id) => crew.some((member) => member.id === id)))],
      tags: [...new Set(current?.tags ?? [])]
    };
  });
  const normalizedCrew = crew.map((member) => ({
    ...member,
    fatigue: clamp(member.fatigue ?? 0),
    stress: clamp(member.stress ?? 0),
    shipCompartmentId: member.shipCompartmentId ?? (member.primaryRole === 'engineer' ? 'engineering' : member.primaryRole === 'doctor' ? 'medbay' : member.primaryRole === 'scientist' || member.primaryRole === 'archaeologist' || member.primaryRole === 'biologist' ? 'laboratory' : member.primaryRole === 'pilot' || member.primaryRole === 'diplomat' ? 'bridge' : 'quarters'),
    relationships: crew.filter((other) => other.id !== member.id).map((other) => {
      const entry = member.relationships?.find((candidate) => candidate.crewId === other.id)
        ?? defaultRelationships(member, crew, year).find((candidate) => candidate.crewId === other.id)!;
      return {
        ...entry,
        affinity: Math.max(-100, Math.min(100, Math.round(entry.affinity))),
        tension: clamp(entry.tension),
        lastChangedYear: Math.round(entry.lastChangedYear)
      };
    }),
    personalArc: member.personalArc ?? {
      id: `arc_${member.id}`,
      title: `Незакрытый вопрос: ${member.belief}`,
      summary: `${member.name} пока не доверяет капитану достаточно, чтобы рассказать всё.`,
      stage: 0,
      status: 'dormant' as const
    }
  }));
  for (const compartment of compartments) {
    compartment.assignedCrewIds = normalizedCrew
      .filter((member) => member.shipCompartmentId === compartment.id && member.status !== 'deceased')
      .map((member) => member.id)
      .slice(0, compartment.capacity);
  }
  return {
    ship: {
      ...ship,
      life: {
        compartments,
        supplies: {
          food: clamp(life.supplies.food),
          oxygen: clamp(life.supplies.oxygen),
          medicine: Math.max(0, Math.round(life.supplies.medicine)),
          parts: Math.max(0, Math.round(life.supplies.parts))
        },
        issues: life.issues.slice(0, 40),
        trophies: life.trophies.slice(0, 30),
        lastUpdatedHour: Math.max(0, Math.round(life.lastUpdatedHour))
      }
    },
    crew: normalizedCrew
  };
}

export function crewReadiness(member: CrewMember): number {
  if (member.status !== 'active') return 0;
  const health = member.health / Math.max(1, member.maxHealth);
  return clamp((health * 55) + (100 - (member.fatigue ?? 0)) * .25 + (100 - (member.stress ?? 0)) * .2);
}

function relationship(member: CrewMember, otherId: string, year: number): CrewRelationship {
  return member.relationships?.find((entry) => entry.crewId === otherId) ?? {
    crewId: otherId, affinity: 0, tension: 0, lastChangedYear: year, reason: 'Нет общей истории'
  };
}

function withRelationship(member: CrewMember, next: CrewRelationship): CrewMember {
  return {
    ...member,
    relationships: [
      next,
      ...(member.relationships ?? []).filter((entry) => entry.crewId !== next.crewId)
    ]
  };
}

export function advanceShipLife(input: {
  ship: Ship;
  crew: CrewMember[];
  hours: number;
  seed: string;
  year: number;
  reason: string;
}): { ship: Ship; crew: CrewMember[]; incidents: CrewIssue[] } {
  const normalized = normalizeShipLife(input.ship, input.crew, input.year);
  const ship = structuredClone(normalized.ship);
  let crew = structuredClone(normalized.crew);
  const life = ship.life!;
  const active = crew.filter((member) => member.status === 'active');
  const span = Math.max(0, input.hours);
  const foodUse = active.length && span > 0 ? Math.round(active.length * span / (24 * 4)) : 0;
  const oxygenUse = active.length && span > 0 ? Math.round(active.length * span / (24 * 3)) : 0;
  life.supplies.food = clamp(life.supplies.food - foodUse);
  life.supplies.oxygen = clamp(life.supplies.oxygen - oxygenUse);
  life.lastUpdatedHour += Math.round(span);

  crew = crew.map((member) => {
    if (member.status !== 'active') return member;
    const quarters = life.compartments.find((entry) => entry.id === 'quarters');
    const fatigueGain = span / 12 * (quarters?.disabled ? 1.5 : 1);
    const scarcityStress = life.supplies.food < 20 || life.supplies.oxygen < 20 ? span / 18 : 0;
    return {
      ...member,
      fatigue: clamp((member.fatigue ?? 0) + fatigueGain),
      stress: clamp((member.stress ?? 0) + scarcityStress),
      morale: clamp(member.morale - (scarcityStress > 0 ? 2 : 0))
    };
  });

  const rng = createRng(`${input.seed}:ship-life:${input.reason}:${life.lastUpdatedHour}`);
  if (span >= 24) {
    const criticalWear = Math.floor(span / (24 * 5));
    const secondaryWear = Math.floor(span / (24 * 12));
    const secondaryId = life.compartments[rng.int(0, life.compartments.length - 1)]?.id;
    for (const compartment of life.compartments) {
      const decay = compartment.id === 'reactor' || compartment.id === 'engineering'
        ? criticalWear
        : compartment.id === secondaryId
          ? Math.max(1, secondaryWear)
          : secondaryWear;
      compartment.condition = clamp(compartment.condition - decay);
      compartment.disabled = compartment.condition <= 0;
    }
  }

  const incidents: CrewIssue[] = [];
  if (active.length >= 2 && span >= 6) {
    const activeCrew = crew.filter((member) => member.status === 'active');
    const a = activeCrew[rng.int(0, activeCrew.length - 1)]!;
    const candidates = activeCrew.filter((entry) => entry.id !== a.id);
    const b = candidates[rng.int(0, candidates.length - 1)]!;
    const relA = relationship(a, b.id, input.year);
    const relB = relationship(b, a.id, input.year);
    const pressure = Math.round(((a.stress ?? 0) + (b.stress ?? 0) + (a.fatigue ?? 0) + (b.fatigue ?? 0)) / 20);
    const alreadyOpen = life.issues.some((issue) => issue.status === 'open'
      && issue.kind === 'conflict'
      && issue.crewIds.includes(a.id)
      && issue.crewIds.includes(b.id));
    if (!alreadyOpen && pressure >= 8 && rng.chance(Math.min(.75, .08 + pressure / 100))) {
      const issue: CrewIssue = {
        id: `crew_issue_${a.id}_${b.id}_${life.lastUpdatedHour}`,
        kind: 'conflict',
        title: `${a.name} и ${b.name}: конфликт на борту`,
        summary: `Усталость и напряжение перешли в открытый спор. Причина: ${input.reason}.`,
        crewIds: [a.id, b.id],
        severity: clamp(35 + pressure * 3),
        createdYear: input.year,
        status: 'open'
      };
      incidents.push(issue);
      crew = crew.map((member) => member.id === a.id
        ? withRelationship(member, { ...relA, tension: clamp(relA.tension + 18), affinity: Math.max(-100, relA.affinity - 8), lastChangedYear: input.year, reason: issue.title })
        : member.id === b.id
          ? withRelationship(member, { ...relB, tension: clamp(relB.tension + 18), affinity: Math.max(-100, relB.affinity - 8), lastChangedYear: input.year, reason: issue.title })
          : member);
    }
  }
  const cargoTrophies = ship.cargo
    .filter((item) => Boolean(item.artifactId))
    .map((item) => ({
      id: `trophy_${item.artifactId}`,
      name: item.name,
      description: 'Этот объект находился на борту и остался в памяти корабля.',
      sourceId: item.artifactId
    }));
  life.trophies = [...cargoTrophies, ...life.trophies]
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index)
    .slice(0, 30);
  life.issues = [...incidents, ...life.issues].slice(0, 20);
  return { ship, crew, incidents };
}

export function restCrew(ship: Ship, crew: CrewMember[], year: number): { ship: Ship; crew: CrewMember[]; message: string } {
  const normalized = normalizeShipLife(ship, crew, year);
  if (normalized.ship.life!.supplies.food < 4 || normalized.ship.life!.supplies.oxygen < 4) {
    return { ...normalized, message: 'Недостаточно еды или кислорода для полноценного отдыха.' };
  }
  normalized.ship.life!.supplies.food = clamp(normalized.ship.life!.supplies.food - 4);
  normalized.ship.life!.supplies.oxygen = clamp(normalized.ship.life!.supplies.oxygen - 4);
  normalized.crew = normalized.crew.map((member) => member.status === 'active' ? {
    ...member,
    fatigue: clamp((member.fatigue ?? 0) - 35),
    stress: clamp((member.stress ?? 0) - 18),
    morale: clamp(member.morale + 5)
  } : member);
  return { ...normalized, message: 'Экипаж получил смену отдыха. Усталость и стресс снижены.' };
}

export function repairCompartment(ship: Ship, crew: CrewMember[], compartmentId: ShipCompartmentId, year: number): { ship: Ship; crew: CrewMember[]; partsUsed: number; message: string } {
  const normalized = normalizeShipLife(ship, crew, year);
  const compartment = normalized.ship.life!.compartments.find((entry) => entry.id === compartmentId);
  if (!compartment) return { ...normalized, partsUsed: 0, message: 'Отсек не найден.' };
  const missing = 100 - compartment.condition;
  if (missing <= 0) return { ...normalized, partsUsed: 0, message: 'Отсек уже исправен.' };
  const available = normalized.ship.life!.supplies.parts;
  const partsUsed = Math.min(available, Math.max(1, Math.ceil(missing / 12)));
  if (partsUsed <= 0) return { ...normalized, partsUsed: 0, message: 'Нет запасных частей.' };
  normalized.ship.life!.supplies.parts -= partsUsed;
  compartment.condition = clamp(compartment.condition + partsUsed * 12);
  compartment.disabled = false;
  return { ...normalized, partsUsed, message: `${compartment.name}: восстановлено до ${compartment.condition}%.` };
}

export function resolveCrewIssue(input: {
  ship: Ship;
  crew: CrewMember[];
  issueId: string;
  choice: 'mediate' | 'side-first' | 'side-second' | 'ignore';
  year: number;
}): { ship: Ship; crew: CrewMember[]; message: string } {
  const normalized = normalizeShipLife(input.ship, input.crew, input.year);
  const issue = normalized.ship.life!.issues.find((entry) => entry.id === input.issueId && entry.status === 'open');
  if (!issue) return { ...normalized, message: 'Конфликт уже закрыт.' };
  const [firstId, secondId] = issue.crewIds;
  normalized.ship.life!.issues = normalized.ship.life!.issues.map((entry) =>
    entry.id === issue.id ? { ...entry, status: 'resolved' as const, resolvedYear: input.year, resolution: input.choice } : entry
  );
  normalized.crew = normalized.crew.map((member) => {
    if (!issue.crewIds.includes(member.id)) return member;
    const otherId = member.id === firstId ? secondId! : firstId!;
    const current = relationship(member, otherId, input.year);
    const favored = input.choice === 'side-first' ? firstId : input.choice === 'side-second' ? secondId : undefined;
    const isFavored = favored === member.id;
    return withRelationship({
      ...member,
      stress: clamp((member.stress ?? 0) + (input.choice === 'ignore' ? 8 : -12)),
      morale: clamp(member.morale + (input.choice === 'mediate' ? 4 : isFavored ? 5 : input.choice === 'ignore' ? -5 : -7)),
      loyalty: clamp(member.loyalty + (input.choice === 'mediate' ? 2 : isFavored ? 3 : input.choice === 'ignore' ? -3 : -5))
    }, {
      ...current,
      tension: clamp(current.tension + (input.choice === 'mediate' ? -22 : input.choice === 'ignore' ? 12 : 5)),
      affinity: Math.max(-100, Math.min(100, current.affinity + (input.choice === 'mediate' ? 6 : input.choice === 'ignore' ? -5 : -2))),
      lastChangedYear: input.year,
      reason: `Решение капитана: ${input.choice}`
    });
  });
  return { ...normalized, message: input.choice === 'mediate' ? 'Капитан провёл разбор. Напряжение снизилось.' : input.choice === 'ignore' ? 'Конфликт оставлен без решения.' : 'Капитан занял сторону. Один член экипажа доволен, второй запомнил решение.' };
}

export function resolvePersonalArc(input: {
  crew: CrewMember[];
  crewId: string;
  choice: 'listen' | 'help' | 'refuse';
  year: number;
}): { crew: CrewMember[]; creditsCost: number; message: string } {
  const member = input.crew.find((entry) => entry.id === input.crewId);
  if (!member) return { crew: input.crew, creditsCost: 0, message: 'Член экипажа не найден.' };
  const arc = member.personalArc ?? {
    id: `arc_${member.id}`,
    title: `Незакрытый вопрос: ${member.belief}`,
    summary: `${member.name} не рассказывал об этом капитану.`,
    stage: 0,
    status: 'dormant' as const
  };
  if (input.choice === 'listen' && arc.status === 'dormant') {
    return {
      creditsCost: 0,
      message: `${member.name} рассказал о личной проблеме. Теперь нужно решить, помогать ли.`,
      crew: input.crew.map((entry) => entry.id === member.id ? {
        ...entry,
        stress: clamp((entry.stress ?? 0) - 6),
        personalArc: {
          ...arc,
          stage: 1,
          status: 'active',
          summary: `${member.name} просит капитана помочь закрыть долг из прошлого. Цена помощи — время, деньги и доверие.`
        }
      } : entry)
    };
  }
  if (arc.status !== 'active') return { crew: input.crew, creditsCost: 0, message: 'Эта личная история сейчас не требует решения.' };
  const help = input.choice === 'help';
  return {
    creditsCost: help ? 120 : 0,
    message: help ? `Капитан помог. ${member.name} запомнит это.` : `Капитан отказал. ${member.name} закрылся.`,
    crew: input.crew.map((entry) => entry.id === member.id ? {
      ...entry,
      morale: clamp(entry.morale + (help ? 10 : -8)),
      loyalty: clamp(entry.loyalty + (help ? 12 : -10)),
      stress: clamp((entry.stress ?? 0) + (help ? -14 : 10)),
      personalArc: {
        ...arc,
        stage: 2,
        status: help ? 'resolved' : 'failed',
        summary: help
          ? `Капитан помог выполнить просьбу. Эта история стала частью памяти экипажа.`
          : `Просьба была отклонена. Отношение к капитану изменилось.`
      },
      memories: [{
        id: `memory_${arc.id}_${help ? 'help' : 'refuse'}`,
        year: input.year,
        kind: help ? 'discovery' as const : 'betrayal' as const,
        text: help ? 'Капитан помог решить личную проблему.' : 'Капитан отказался помочь.',
        impact: help ? 12 : -10
      }, ...entry.memories].slice(0, 40)
    } : entry)
  };
}
