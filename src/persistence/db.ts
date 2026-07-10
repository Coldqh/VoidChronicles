import Dexie, { type EntityTable } from 'dexie';
import type { GameStateSnapshot } from '../game/types';

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
  await db.saves.put({ id: 'ironman', updatedAt: new Date().toISOString(), snapshot });
}

export async function loadSnapshot(): Promise<GameStateSnapshot | null> {
  const record = await db.saves.get('ironman');
  return record?.snapshot ?? null;
}

export async function deleteSnapshot(): Promise<void> {
  await db.saves.delete('ironman');
}

export function exportSnapshot(snapshot: GameStateSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `void-chronicles-${snapshot.galaxy.seed}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readSnapshotFile(file: File): Promise<GameStateSnapshot> {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as GameStateSnapshot;
  if (parsed.schemaVersion !== 1 || !parsed.galaxy || !parsed.captain || !parsed.ship) {
    throw new Error('Неподдерживаемый или повреждённый файл сохранения');
  }
  return parsed;
}
