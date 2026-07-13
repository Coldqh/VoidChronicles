# Save System v0.1.1

## Boot flow

The application has an explicit hydration phase. UI routing does not begin until IndexedDB is checked, preventing menu/game mount loops and stale asynchronous restores.

## Schema

Current save schema: `2`.

Schema v1 is migrated automatically. Before migration, the untouched record is stored in the rotating backup table.

## Integrity

Every v2 snapshot contains:

- application version;
- UTC save time;
- monotonically increasing sequence;
- save reason;
- FNV-1a checksum over the normalized snapshot.

The checksum detects partial or externally modified saves before they reach the runtime store.

## Write coordination

Gameplay saves are debounced and serialized. Multiple actions cannot write IndexedDB concurrently. Immediate writes are used for new games, imports and migrations.

## Recovery

Up to five backups are retained. If the primary ironman record cannot be validated, backups are checked newest-first and the first valid record is restored automatically.

## Diagnostics

Runtime errors and unhandled promise rejections are stored in session diagnostics. The crash screen can export them as JSON without exposing or modifying the ironman save.
