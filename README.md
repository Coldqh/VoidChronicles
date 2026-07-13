# Void Chronicles

Procedural single-player space exploration roguelike built with React, TypeScript and Canvas.

## v0.7 Encounters & Consequences

- added playable narrative scenes with concrete participants, locations, risks and choices;
- added delayed consequences that return after later jumps and years;
- added active objectives created by scenes instead of raw data lists;
- added travel and hub encounters that react to local factions and settlements;
- added a modern seven-step onboarding flow with a creation-screen opt-out;
- rebuilt the visual language around cinematic scenes, layered glass, responsive spatial navigation and animated system feedback;
- added lazy-loaded world and laboratory screens;
- migrated save schema from v7 to v8 while preserving existing ironman saves.

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


### v0.7.1 corrective layer

- resilient IndexedDB + localStorage ironman rescue;
- contextual interface onboarding with real actions;
- unknown-by-default knowledge model;
- varied persistent expedition locations;
- simplified command and navigation surfaces.
