# Void Chronicles

**Current version: v0.9.5 — Mobile Density & Scroll Core**

Procedural single-player space exploration roguelike built with React, TypeScript and Canvas.

## v0.9.5 Mobile Density & Scroll Core

- fixed vertical scrolling in installed mobile PWA mode with one internal scroll owner per data screen;
- changed the galaxy camera to open on the local sector instead of fitting the whole known galaxy;
- added explicit local-sector and overview camera controls;
- reduced mobile HUD, dock, cards, spacing and headings by roughly 35–50%;
- removed secondary text and repeated statistics from compact lists and bridge shortcuts;
- shortened Living World and Operations rows and moved details behind deliberate disclosure;
- kept map screens fixed while data screens scroll independently.

## v0.9.4 Mobile Interface Rebuild

- full-screen touch-native galaxy and system maps;
- compact bridge and bottom-sheet object inspection;
- list/detail navigation for Living World and Civilizations;
- segmented mobile Operations and Ship screens;
- no document-level horizontal movement and no squeezed desktop panels.

## v0.9.3 Adaptive Interface

- one vertical scroll flow on phones and tablets;
- no document-level horizontal scrolling or tab rails;
- circular responsive star-system orbits on every viewport;
- galaxy-map gestures no longer block normal page scrolling;
- separate density rules for phone, tablet, laptop and wide desktop screens.

## v0.9.2 Responsive Shell

- device-specific layouts for phones, tablets, laptops and wide desktop screens;
- natural vertical page scrolling restored across the application;
- compact mobile HUD and fixed five-action mobile dock;
- responsive maps, panels, cards, modals, combat and expedition layouts;
- safe-area support for installed iOS/Android PWA mode.

## v0.9 Legacy & Continuity

- captain loss can lead to death, capture, disappearance, retirement or an interrupted command instead of deleting the run;
- living crew members and the ship AI can inherit command with different strengths and restrictions;
- lost expeditions, captain records, memorials and a readable campaign chronicle persist in the ironman archive;
- a finished run enters Chronicle mode where the galaxy can be observed for future years;
- ship defeat now interrupts command and opens succession instead of silently restoring the captured captain;
- Settings, succession and chronicle screens include confirmed campaign reset and start-over actions;
- save schema v10 migrates v9 warfare saves automatically.

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
