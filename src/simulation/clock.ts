import type { WorldTime } from '../game/types';

export const HOURS_PER_DAY = 24;
export const DAYS_PER_YEAR = 360;
export const HOURS_PER_YEAR = HOURS_PER_DAY * DAYS_PER_YEAR;

export function createWorldTime(absoluteHour = 0): WorldTime {
  const safe = Math.max(0, Math.floor(absoluteHour));
  return {
    absoluteHour: safe,
    day: Math.floor(safe / HOURS_PER_DAY),
    year: Math.floor(safe / HOURS_PER_YEAR)
  };
}

export function addHours(time: WorldTime, hours: number): WorldTime {
  return createWorldTime(time.absoluteHour + Math.max(0, Math.floor(hours)));
}

export function hoursForDays(days: number): number {
  return Math.max(0, Math.round(days * HOURS_PER_DAY));
}
