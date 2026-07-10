# Architecture v0.1

## Runtime layers
- `generation/`: deterministic seed streams, systems, civilizations, history and surfaces.
- `game/`: entities and Zustand command/state layer.
- `components/`: Canvas galaxy renderer and tactical modal systems.
- `persistence/`: IndexedDB ironman save and JSON import/export.
- `workers/`: background galaxy generation.

## Save split
### Reconstructable from seed
System positions, base planets, initial civilizations, figures, historical events and artifacts.

### Stored as player changes
Current location, ship/captain state, discoveries, cargo, injuries, visited/scanned flags and log.

v0.1 currently stores the generated galaxy in the snapshot for reliable migration. A later optimization can rebuild immutable layers from the seed and keep only world deltas.

## Determinism
Each generation layer uses a dedicated derived seed. Adding new combat randomness must not change system coordinates or pre-game history.

## Performance
Galaxy generation runs in a Web Worker. Canvas draws only known systems and culls off-screen labels. IndexedDB operations occur after meaningful commands.
