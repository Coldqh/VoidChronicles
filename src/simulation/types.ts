import type { PlanetEcologyState } from '../ecology/types';
export type SimulationEventKind =
  | 'demography'
  | 'migration'
  | 'economy'
  | 'shortage'
  | 'conflict'
  | 'politics'
  | 'research'
  | 'discovery'
  | 'disaster'
  | 'ecology';

export type SimulationEventVisibility = 'public' | 'local' | 'hidden';
export type SimulationEntityType = 'system' | 'planet' | 'civilization' | 'faction' | 'hub' | 'artifact' | 'ecosystem' | 'species';
export type KnowledgeSource = 'direct' | 'scan' | 'contact' | 'news' | 'archive' | 'rumor';

export interface WorldClock {
  /** Hours elapsed since the player campaign began. */
  absoluteHour: number;
  /** Calendar year at campaign start. Kept separate from deep-history negative years. */
  epochYear: number;
}

export interface SimulationSystemState {
  systemId: string;
  population: number;
  prosperity: number;
  security: number;
  supply: number;
  tradePressure: number;
  migrationPressure: number;
  lastUpdatedHour: number;
}

export interface SimulationCivilizationState {
  civilizationId: string;
  population: number;
  stability: number;
  economy: number;
  military: number;
  research: number;
  cohesion: number;
  expansionPressure: number;
  alive: boolean;
  lastUpdatedHour: number;
}

export interface SimulationFactionState {
  factionId: string;
  wealth: number;
  military: number;
  research: number;
  influence: number;
  tension: number;
  lastUpdatedHour: number;
}

export interface WorldEvent {
  id: string;
  atHour: number;
  kind: SimulationEventKind;
  title: string;
  summary: string;
  severity: number;
  visibility: SimulationEventVisibility;
  systemIds: string[];
  civilizationIds: string[];
  factionIds: string[];
  tags: string[];
  data?: Record<string, string | number | boolean>;
}

export type ScheduledEventKind = 'civilization-cycle' | 'faction-cycle' | 'system-cycle' | 'war-cycle' | 'ecology-cycle';

export interface ScheduledWorldEvent {
  id: string;
  kind: ScheduledEventKind;
  dueHour: number;
  repeatHours?: number;
  entityId?: string;
  seedKey: string;
}

export interface SimulationState {
  version: 2;
  clock: WorldClock;
  systems: Record<string, SimulationSystemState>;
  civilizations: Record<string, SimulationCivilizationState>;
  factions: Record<string, SimulationFactionState>;
  ecosystems: Record<string, PlanetEcologyState>;
  scheduledEvents: ScheduledWorldEvent[];
  events: WorldEvent[];
  nextSequence: number;
  lastAdvanceReason: string;
}

export interface KnowledgeRecord {
  entityId: string;
  entityType: SimulationEntityType;
  confidence: number;
  discoveredAtHour: number;
  lastConfirmedAtHour: number;
  source: KnowledgeSource;
  knownFields: string[];
}

export interface PlayerKnowledgeState {
  version: 1;
  records: Record<string, KnowledgeRecord>;
}

export interface SimulationAdvanceResult {
  simulation: SimulationState;
  emittedEvents: WorldEvent[];
}
