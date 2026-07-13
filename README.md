# Void Chronicles

Procedural single-player space exploration roguelike built with React, TypeScript and Canvas.

## v0.6 Relics, Technology & Living World

- connected artifact recovery to laboratory research, risky experiments, blueprints and installed ship upgrades;
- added personal equipment assignment that changes combat, analysis, healing and protection during expeditions;
- added technology domains and civilization-specific research outcomes instead of one linear tech tree;
- added persistent world threads that turn discoveries, political conflicts and research into ongoing situations;
- rebuilt the Command Deck around decisions, active opportunities, urgent processes and recent consequences;
- added dedicated Living World and Laboratory screens with direct routes to related systems;
- upgraded civilization dossiers and expedition briefings so data explains why it matters and what the player can do;
- migrated save schema from v6 to v7 while preserving existing ironman saves.

## Development

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

## v0.3 Command Deck

- dedicated bridge/home screen;
- separate galaxy and star-system maps;
- crew recruitment, contracts, payroll, morale and memories;
- expedition team selection with role bonuses;
- save schema v4 with v3 migration.
