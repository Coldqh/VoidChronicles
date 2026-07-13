import type {
  Captain,
  CaptainCondition,
  CaptainLegacyRecord,
  ChronicleEntry,
  CrewMember,
  LegacyState,
  Ship,
  SuccessionCandidate
} from '../game/types';

function roleConsequences(member: CrewMember): string[] {
  const base = [`Унаследует договоры и долги прежней экспедиции.`, `Экипаж начнёт с доверием ${member.loyalty}/100.`];
  const role: Record<CrewMember['primaryRole'], string> = {
    pilot: 'Лучше уходит от преследования, слабее в научных переговорах.',
    engineer: 'Быстрее восстанавливает корабль, хуже ведёт публичную дипломатию.',
    doctor: 'Снижает риск смертей экипажа, слабее управляет боевыми постами.',
    scientist: 'Ускоряет исследования, хуже переносит криминальные решения.',
    archaeologist: 'Сильнее в руинах и наследии, слабее в торговле.',
    soldier: 'Увереннее ведёт бой, быстрее наживает врагов.',
    diplomat: 'Легче сохраняет старые связи, слабее в прямом бою.',
    biologist: 'Сильнее в живых мирах, хуже управляет техникой.',
    smuggler: 'Лучше скрывает груз и документы, получает меньше доверия официальных властей.'
  };
  return [...base, role[member.primaryRole]];
}

export function createCaptainRecord(
  captain: Captain,
  ship: Ship,
  year: number,
  systemId: string,
  stats: { systemsVisited?: number; discoveries?: number; battles?: number } = {}
): CaptainLegacyRecord {
  return {
    id: `captain_record_${captain.id}_${year}_${Math.abs(captain.name.length * 97)}`,
    captainId: captain.id,
    name: captain.name,
    commandIdentity: captain.commandIdentity,
    startedYear: year,
    finalSystemId: systemId,
    shipName: ship.name,
    systemsVisited: stats.systemsVisited ?? 1,
    discoveries: stats.discoveries ?? 0,
    battles: stats.battles ?? 0,
    reputation: captain.reputation
  };
}

export function createInitialLegacy(captain: Captain, ship: Ship, year: number, systemId: string): LegacyState {
  const record = createCaptainRecord(captain, ship, year, systemId);
  return {
    mode: 'active',
    campaignEnded: false,
    currentCaptainRecordId: record.id,
    captains: [record],
    successionCandidates: [],
    lostExpeditions: [],
    memorials: [],
    chronicle: [{
      id: `chronicle_command_${record.id}`,
      year,
      category: 'command',
      title: 'Начало командования',
      text: `${captain.name} принял командование кораблём «${ship.name}».`,
      tone: 'info',
      captainRecordId: record.id,
      systemId
    }],
    observerYear: year,
    aiTurns: 0
  };
}

export function buildSuccessionCandidates(crew: CrewMember[], ship: Ship): SuccessionCandidate[] {
  const organic = crew
    .filter((member) => member.status !== 'deceased' && member.health > 0)
    .sort((a, b) => b.loyalty - a.loyalty || b.level - a.level)
    .slice(0, 8)
    .map((member): SuccessionCandidate => ({
      id: `successor_crew_${member.id}`,
      source: 'crew',
      sourceId: member.id,
      name: member.name,
      role: member.primaryRole,
      loyalty: member.loyalty,
      eligible: member.status !== 'missing',
      consequences: roleConsequences(member)
    }));
  const ai: SuccessionCandidate[] = ship.aiCore.operational && ship.aiCore.integrity > 0 && ship.hull > 0
    ? [{
        id: `successor_ai_${ship.aiCore.id}`,
        source: 'ai',
        sourceId: ship.aiCore.id,
        name: ship.aiCore.name,
        role: 'корабельный ИИ',
        loyalty: Math.round(ship.aiCore.integrity),
        eligible: true,
        consequences: [
          'Корабль продолжит движение без живого капитана.',
          'Доступны перелёты, связь и поиск нового командира.',
          'Дипломатия, высадки и часть контрактов ограничены до найма капитана.'
        ]
      }]
    : [];
  return [...organic, ...ai];
}

export function captainFromCrew(member: CrewMember, previous: Captain): Captain {
  const roleSkills: Record<CrewMember['primaryRole'], Partial<Captain['skills']>> = {
    pilot: { trade: 2, combat: 2 }, engineer: { research: 2, combat: 1 }, doctor: { research: 2 }, scientist: { research: 3 },
    archaeologist: { archaeology: 3, research: 1 }, soldier: { combat: 3 }, diplomat: { trade: 3 }, biologist: { research: 2, archaeology: 1 }, smuggler: { crime: 3, trade: 2 }
  };
  const bonus = roleSkills[member.primaryRole];
  return {
    id: member.id,
    name: member.name,
    level: Math.max(1, member.level),
    xp: 0,
    health: member.health,
    maxHealth: member.maxHealth,
    credits: previous.credits,
    reputation: Math.round(previous.reputation * 0.55),
    skills: {
      research: bonus.research ?? 1,
      archaeology: bonus.archaeology ?? 1,
      trade: bonus.trade ?? 1,
      combat: bonus.combat ?? 1,
      crime: bonus.crime ?? 0
    },
    injuries: member.injuries,
    alive: true,
    condition: 'active',
    commandIdentity: 'organic'
  };
}

export function captainFromAI(ship: Ship, previous: Captain): Captain {
  return {
    id: ship.aiCore.id,
    name: ship.aiCore.name,
    level: 1,
    xp: 0,
    health: ship.aiCore.integrity,
    maxHealth: 100,
    credits: previous.credits,
    reputation: 0,
    skills: { research: 2, archaeology: 1, trade: 0, combat: 1, crime: 0 },
    injuries: [],
    alive: true,
    condition: 'active',
    commandIdentity: 'shipAI'
  };
}

export function closeCurrentCaptain(
  legacy: LegacyState,
  captain: Captain,
  ship: Ship,
  crew: CrewMember[],
  year: number,
  systemId: string,
  fate: CaptainCondition,
  reason: string,
  stats: { systemsVisited: number; discoveries: number; battles: number }
): LegacyState {
  const recordId = legacy.currentCaptainRecordId;
  const captains = legacy.captains.map((record) => record.id === recordId ? {
    ...record,
    endedYear: year,
    fate,
    finalSystemId: systemId,
    systemsVisited: stats.systemsVisited,
    discoveries: stats.discoveries,
    battles: stats.battles,
    reputation: captain.reputation,
    epitaph: reason
  } : record);
  return {
    ...legacy,
    mode: 'succession',
    continuityReason: reason,
    captains,
    successionCandidates: buildSuccessionCandidates(crew, ship),
    chronicle: [{
      id: `chronicle_loss_${recordId}_${year}`,
      year,
      category: fate === 'dead' ? 'death' as const : 'command' as const,
      title: fate === 'dead' ? 'Гибель капитана' : 'Командование прервано',
      text: `${captain.name}: ${reason}`,
      tone: 'danger' as const,
      captainRecordId: recordId,
      systemId
    }, ...legacy.chronicle].slice(0, 1000)
  };
}

export function successorRecord(captain: Captain, ship: Ship, year: number, systemId: string): CaptainLegacyRecord {
  return createCaptainRecord(captain, ship, year, systemId);
}

export function chronicleEntry(input: Omit<ChronicleEntry, 'id'> & { id?: string }): ChronicleEntry {
  return { ...input, id: input.id ?? `chronicle_${input.category}_${input.year}_${Math.random().toString(36).slice(2, 8)}` };
}
