import type { Faction, Galaxy, Hub } from '../game/types';

export interface SimulationContext {
  seed: string;
  galaxy: Galaxy;
  factions: Faction[];
  hubs: Hub[];
}
