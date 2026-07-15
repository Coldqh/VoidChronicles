import type { EquipmentId, EvidenceDraft } from '../game/types';
import type { SurfaceMap } from '../generation/surface';

export interface ExpeditionCheckpoint {
  version: 1;
  seed: string;
  pointOfInterestId: string;
  phase: 'loadout' | 'field';
  selected: EquipmentId[];
  selectedCrewIds: string[];
  map: SurfaceMap;
  playerHealth: number;
  turns: number;
  log: string[];
  collectedEvidence: EvidenceDraft[];
  hasArtifact: boolean;
  blockedReason?: string;
  medkitUsed: boolean;
  savedAt: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const expeditionCheckpointKey = (seed: string, pointOfInterestId: string): string =>
  `void-chronicles:expedition:v1:${seed}:${pointOfInterestId}`;

export function loadExpeditionCheckpoint(
  storage: KeyValueStorage | undefined,
  seed: string,
  pointOfInterestId: string
): ExpeditionCheckpoint | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(expeditionCheckpointKey(seed, pointOfInterestId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<ExpeditionCheckpoint>;
    if (
      parsed.version !== 1 ||
      parsed.seed !== seed ||
      parsed.pointOfInterestId !== pointOfInterestId ||
      !parsed.map ||
      !Array.isArray(parsed.selected) ||
      !Array.isArray(parsed.selectedCrewIds) ||
      !Array.isArray(parsed.log) ||
      !Array.isArray(parsed.collectedEvidence)
    ) return undefined;
    return parsed as ExpeditionCheckpoint;
  } catch {
    return undefined;
  }
}

export function saveExpeditionCheckpoint(storage: KeyValueStorage | undefined, checkpoint: ExpeditionCheckpoint): void {
  if (!storage) return;
  try {
    storage.setItem(expeditionCheckpointKey(checkpoint.seed, checkpoint.pointOfInterestId), JSON.stringify(checkpoint));
  } catch {
    // A full or unavailable localStorage must never break the expedition itself.
  }
}

export function clearExpeditionCheckpoint(storage: KeyValueStorage | undefined, seed: string, pointOfInterestId: string): void {
  if (!storage) return;
  try {
    storage.removeItem(expeditionCheckpointKey(seed, pointOfInterestId));
  } catch {
    // Ignore unavailable storage.
  }
}
