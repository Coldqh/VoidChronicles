import type {
  Captain,
  CaptainCondition,
  CaptainLegacyRecord,
  ChronicleEntry,
  CrewMember,
  LegacyState,
  Ship
} from '../game/types';

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
    commandIdentity: 'organic',
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
    observerYear: year
  };
}

/**
 * Ironman rule: captain loss ends the playable campaign.
 */
export function closeCurrentCaptain(
  legacy: LegacyState,
  captain: Captain,
  _ship: Ship,
  _crew: CrewMember[],
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
    campaignEnded: true,
    continuityReason: reason,
    captains,
    successionCandidates: [],
    chronicle: [{
      id: `chronicle_loss_${recordId}_${year}`,
      year,
      category: fate === 'dead' ? 'death' as const : 'command' as const,
      title: fate === 'dead' ? 'Гибель капитана' : 'Экспедиция завершена',
      text: `${captain.name}: ${reason}`,
      tone: 'danger' as const,
      captainRecordId: recordId,
      systemId
    }, ...legacy.chronicle].slice(0, 1000)
  };
}

export function chronicleEntry(input: Omit<ChronicleEntry, 'id'> & { id?: string }): ChronicleEntry {
  return { ...input, id: input.id ?? `chronicle_${input.category}_${input.year}_${Math.random().toString(36).slice(2, 8)}` };
}
