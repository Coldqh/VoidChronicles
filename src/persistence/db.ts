import Dexie, { type EntityTable } from 'dexie';
import type { GameStateSnapshot } from '../game/types';
import { parseSnapshot } from './snapshot';

export interface SaveRecord {
  id: string;
  updatedAt: string;
  snapshot: GameStateSnapshot;
}

class VoidDatabase extends Dexie {
  saves!: EntityTable<SaveRecord, 'id'>;

  constructor() {
    super('void-chronicles');
    this.version(1).stores({
      saves: 'id, updatedAt'
    });
  }
}

export const db = new VoidDatabase();

export async function saveSnapshot(snapshot: GameStateSnapshot): Promise<void> {
  const safeSnapshot = parseSnapshot(snapshot);
  await db.saves.put({ id: 'ironman', updatedAt: new Date().toISOString(), snapshot: safeSnapshot });
}

export async function loadSnapshot(): Promise<GameStateSnapshot | null> {
  const record = await db.saves.get('ironman');
  return record ? parseSnapshot(record.snapshot) : null;
}

export async function deleteSnapshot(): Promise<void> {
  await db.saves.delete('ironman');
}

export function exportSnapshot(snapshot: GameStateSnapshot): void {
  const safeSnapshot = parseSnapshot(snapshot);
  const blob = new Blob([JSON.stringify(safeSnapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `void-chronicles-${safeSnapshot.galaxy.seed}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function readSnapshotFile(file: File): Promise<GameStateSnapshot> {
  const raw = await file.text();
  return parseSnapshot(JSON.parse(raw) as unknown);
}
