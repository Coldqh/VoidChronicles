import type { WorldClock } from './types';

export const HOURS_PER_DAY = 24;
export const DAYS_PER_YEAR = 360;
export const HOURS_PER_YEAR = HOURS_PER_DAY * DAYS_PER_YEAR;

export interface ActionTimeMap extends Readonly<Record<string, number>> {
  systemScan: number;
  planetScan: number;
  orbitalSignal: number;
  remoteSignal: number;
  transponderChange: number;
  researchCycle: number;
  repair: number;
  refuel: number;
  recruit: number;
  dock: number;
  leaveHub: number;
  marketTrade: number;
  firstContact: number;
  npcInteraction: number;
  artifactTransfer: number;
}

const ACTION_TIME_VALUES: ActionTimeMap = {
  systemScan: 4,
  planetScan: 8,
  orbitalSignal: 6,
  remoteSignal: 3,
  transponderChange: 12,
  researchCycle: 30 * HOURS_PER_DAY,
  repair: 2 * HOURS_PER_DAY,
  refuel: 4,
  recruit: 6,
  dock: 2,
  leaveHub: 1,
  marketTrade: 1,
  firstContact: 12,
  npcInteraction: 2,
  artifactTransfer: 2
};

export const ACTION_TIME: ActionTimeMap = ACTION_TIME_VALUES;

export function worldYear(clock: WorldClock): number {
  return clock.epochYear + Math.floor(Math.max(0, clock.absoluteHour) / HOURS_PER_YEAR);
}

export function travelHours(distance: number): number {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  return Math.max(8, Math.round(safeDistance * 1.8));
}

export function expeditionHours(turnsSpent: number): number {
  const safeTurns = Number.isFinite(turnsSpent) ? Math.max(0, Math.floor(turnsSpent)) : 0;
  return Math.max(4, Math.ceil(safeTurns * 0.75));
}

export function hoursForDays(days: number): number {
  const safeDays = Number.isFinite(days) ? Math.max(0, days) : 0;
  return Math.round(safeDays * HOURS_PER_DAY);
}
