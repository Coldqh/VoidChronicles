import Dexie, { type EntityTable } from 'dexie';
import type { GameStateSnapshot, SaveMetadata } from '../game/types';
import {
  CURRENT_SCHEMA_VERSION,
  getSnapshotVersion,
  parseSnapshot,
  prepareSnapshotForSave
} from './snapshot';

export interface SaveRecord {
  id: string;
  updatedAt: string;
  schemaVersion: number;
  snapshot: unknown;
}

export interface BackupRecord {
  id: string;
  createdAt: string;
  source: string;
  schemaVersion: number | null;
  snapshot: unknown;
}

export interface LoadSnapshotResult {
  snapshot: GameStateSnapshot;
  migrated: boolean;
  recoveredFromBackup: boolean;
  warning: string | null;
}

class VoidDatabase extends Dexie {
  saves!: EntityTable<SaveRecord, 'id'>;
  backups!: EntityTable<BackupRecord, 'id'>;

  constructor() {
    super('void-chronicles');
    this.version(1).stores({ saves: 'id, updatedAt' });
    this.version(2).stores({
      saves: 'id, updatedAt, schemaVersion',
      backups: 'id, createdAt, source, schemaVersion'
    });
  }
}

export const db = new VoidDatabase();

const SAVE_ID = 'ironman';
const RESCUE_STORAGE_KEY = 'void-chronicles:ironman-rescue-v1';
const MAX_BACKUPS = 5;
const SAVE_TIMEOUT_MS = 8_000;


function rescueStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function writeRescueCopy(snapshot: GameStateSnapshot): void {
  const storage = rescueStorage();
  if (!storage) return;
  try {
    storage.setItem(RESCUE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Failed to write rescue save copy', error);
  }
}

function readRescueCopy(): unknown | null {
  const storage = rescueStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(RESCUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to read rescue save copy', error);
    return null;
  }
}

function deleteRescueCopy(): void {
  try { rescueStorage()?.removeItem(RESCUE_STORAGE_KEY); } catch { /* ignore */ }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { globalThis.clearTimeout(timer); resolve(value); },
      (error) => { globalThis.clearTimeout(timer); reject(error); }
    );
  });
}

async function ensureDatabase(): Promise<void> {
  if (db.isOpen()) return;
  await withTimeout(db.open(), SAVE_TIMEOUT_MS, 'Локальная база сохранений не отвечает');
}

async function addBackup(record: SaveRecord, source: string): Promise<void> {
  const createdAt = new Date().toISOString();
  await db.backups.put({
    id: `${createdAt}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt,
    source,
    schemaVersion: getSnapshotVersion(record.snapshot),
    snapshot: record.snapshot
  });

  const backups = await db.backups.orderBy('createdAt').reverse().toArray();
  const stale = backups.slice(MAX_BACKUPS);
  if (stale.length > 0) await db.backups.bulkDelete(stale.map((entry) => entry.id));
}

async function writeSnapshotNow(
  snapshot: GameStateSnapshot,
  reason: string,
  createBackup: boolean
): Promise<GameStateSnapshot> {
  await ensureDatabase();
  const current = await db.saves.get(SAVE_ID);
  let previousMeta: SaveMetadata | undefined;

  if (current) {
    try {
      previousMeta = parseSnapshot(current.snapshot).saveMeta;
    } catch {
      previousMeta = undefined;
    }
    if (createBackup) await addBackup(current, `before-${reason}`);
  }

  const safeSnapshot = prepareSnapshotForSave(snapshot, reason, previousMeta);
  await withTimeout(
    db.saves.put({
      id: SAVE_ID,
      updatedAt: safeSnapshot.saveMeta?.savedAt ?? new Date().toISOString(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshot: safeSnapshot
    }).then(() => undefined),
    SAVE_TIMEOUT_MS,
    'Не удалось записать ironman-сохранение'
  );
  writeRescueCopy(safeSnapshot);
  return safeSnapshot;
}

interface PendingSave {
  snapshot: GameStateSnapshot;
  reason: string;
  createBackup: boolean;
  waiters: Array<{
    resolve(value: GameStateSnapshot): void;
    reject(error: unknown): void;
  }>;
}

let pendingSave: PendingSave | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function startPendingWrite(): Promise<GameStateSnapshot | null> {
  if (!pendingSave) return Promise.resolve(null);
  if (pendingTimer !== null) {
    globalThis.clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  const job = pendingSave;
  pendingSave = null;
  const write = writeChain.then(() => writeSnapshotNow(job.snapshot, job.reason, job.createBackup));
  writeChain = write.then(() => undefined, () => undefined);
  write.then(
    (saved) => job.waiters.forEach((waiter) => waiter.resolve(saved)),
    (error) => job.waiters.forEach((waiter) => waiter.reject(error))
  );
  return write;
}

export function scheduleSnapshotSave(
  snapshot: GameStateSnapshot,
  reason = 'autosave',
  delayMs = 180
): Promise<GameStateSnapshot> {
  // The rescue copy is synchronous, so a refresh cannot erase the newest player action
  // while the IndexedDB write is still waiting in the debounce queue.
  try { writeRescueCopy(prepareSnapshotForSave(snapshot, `${reason}-rescue`, snapshot.saveMeta)); } catch { /* IndexedDB remains primary */ }
  return new Promise<GameStateSnapshot>((resolve, reject) => {
    if (pendingSave) {
      pendingSave.snapshot = snapshot;
      pendingSave.reason = reason;
      pendingSave.waiters.push({ resolve, reject });
    } else {
      pendingSave = { snapshot, reason, createBackup: false, waiters: [{ resolve, reject }] };
    }

    if (pendingTimer !== null) globalThis.clearTimeout(pendingTimer);
    pendingTimer = globalThis.setTimeout(() => { void startPendingWrite(); }, Math.max(0, delayMs));
  });
}

export async function saveSnapshotImmediately(
  snapshot: GameStateSnapshot,
  reason: string,
  createBackup = false
): Promise<GameStateSnapshot> {
  await flushPendingSave();
  const write = writeChain.then(() => writeSnapshotNow(snapshot, reason, createBackup));
  writeChain = write.then(() => undefined, () => undefined);
  return write;
}

export async function flushPendingSave(): Promise<void> {
  await startPendingWrite();
  await writeChain;
}

export async function loadSnapshot(): Promise<LoadSnapshotResult | null> {
  await ensureDatabase();
  const record = await withTimeout(
    db.saves.get(SAVE_ID),
    SAVE_TIMEOUT_MS,
    'Не удалось прочитать локальное сохранение'
  );
  const rescue = readRescueCopy();

  if (!record && !rescue) return null;

  if (record) {
    const sourceVersion = getSnapshotVersion(record.snapshot);
    try {
      const safe = parseSnapshot(record.snapshot);
      const migrated = sourceVersion !== CURRENT_SCHEMA_VERSION;
      if (migrated) {
        await addBackup(record, `migration-v${sourceVersion ?? 'unknown'}`);
        const saved = await writeSnapshotNow(safe, 'schema-migration', false);
        return { snapshot: saved, migrated: true, recoveredFromBackup: false, warning: `Сохранение обновлено с версии ${sourceVersion ?? '?'} до ${CURRENT_SCHEMA_VERSION}` };
      }
      if (rescue) {
        try {
          const rescueSnapshot = parseSnapshot(rescue, { verifyChecksum: false });
          const rescueSequence = rescueSnapshot.saveMeta?.sequence ?? 0;
          const primarySequence = safe.saveMeta?.sequence ?? 0;
          const rescueTime = Date.parse(rescueSnapshot.saveMeta?.savedAt ?? '') || 0;
          const primaryTime = Date.parse(safe.saveMeta?.savedAt ?? '') || 0;
          if (rescueSequence > primarySequence || (rescueSequence === primarySequence && rescueTime > primaryTime)) {
            const saved = await writeSnapshotNow(rescueSnapshot, 'newer-rescue-recovery', true);
            return { snapshot: saved, migrated: false, recoveredFromBackup: true, warning: 'Восстановлено более новое действие из аварийной копии браузера.' };
          }
        } catch { /* The validated IndexedDB record remains authoritative. */ }
      }
      writeRescueCopy(safe);
      return { snapshot: safe, migrated: false, recoveredFromBackup: false, warning: null };
    } catch (primaryError) {
      const backups = await db.backups.orderBy('createdAt').reverse().toArray();
      for (const backup of backups) {
        try {
          const recovered = parseSnapshot(backup.snapshot);
          await addBackup(record, 'corrupted-primary');
          const saved = await writeSnapshotNow(recovered, 'automatic-recovery', false);
          return { snapshot: saved, migrated: getSnapshotVersion(backup.snapshot) !== CURRENT_SCHEMA_VERSION, recoveredFromBackup: true, warning: `Основной сейв повреждён. Восстановлена резервная копия от ${new Date(backup.createdAt).toLocaleString('ru-RU')}` };
        } catch { /* Try the next backup. */ }
      }
      if (rescue) {
        try {
          const recovered = parseSnapshot(rescue, { verifyChecksum: false });
          const saved = await writeSnapshotNow(recovered, 'local-rescue-recovery', true);
          return { snapshot: saved, migrated: true, recoveredFromBackup: true, warning: 'IndexedDB-сейв не прочитан. Партия восстановлена из аварийной копии браузера.' };
        } catch { /* rethrow the primary error below */ }
      }
      throw primaryError;
    }
  }

  // Some browser/PWA updates can temporarily expose an empty IndexedDB connection.
  // A mirrored rescue copy keeps the ironman party alive and repopulates IndexedDB.
  const recovered = parseSnapshot(rescue, { verifyChecksum: false });
  const saved = await writeSnapshotNow(recovered, 'local-rescue-restore', false);
  return { snapshot: saved, migrated: true, recoveredFromBackup: true, warning: 'Партия восстановлена из аварийной копии браузера.' };
}

export async function createManualBackup(source = 'manual'): Promise<boolean> {
  await flushPendingSave();
  await ensureDatabase();
  const record = await db.saves.get(SAVE_ID);
  if (!record) return false;
  await addBackup(record, source);
  return true;
}

export async function getBackupCount(): Promise<number> {
  await ensureDatabase();
  return db.backups.count();
}

export async function deleteSnapshot(): Promise<void> {
  await flushPendingSave();
  await ensureDatabase();
  await db.transaction('rw', db.saves, db.backups, async () => {
    await db.saves.clear();
    await db.backups.clear();
  });
  deleteRescueCopy();
}

export function exportSnapshot(snapshot: GameStateSnapshot): void {
  const safeSnapshot = prepareSnapshotForSave(snapshot, 'export', snapshot.saveMeta);
  const blob = new Blob([JSON.stringify(safeSnapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `void-chronicles-${safeSnapshot.galaxy.seed}-v${safeSnapshot.schemaVersion}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function readSnapshotFile(file: File): Promise<GameStateSnapshot> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Файл сохранения превышает 25 МБ');
  const raw = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Файл не является корректным JSON-сохранением');
  }
  return parseSnapshot(parsed);
}
