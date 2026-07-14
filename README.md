# Void Chronicles

**Current version: v0.9.8 — Expedition Flow & Roguelike Cleanup**

Procedural single-player space exploration roguelike built with React, TypeScript and Canvas.

## v0.9.8 Expedition Flow & Roguelike Cleanup

- square tactical expedition maps with enemy inspection;
- tap-to-path movement with animated turns;
- contextual event windows instead of a separate scene database;
- restored crew recruitment and clearer signal access rules;
- denser living-civilization territories;
- strict roguelike death with no AI continuation;
- compact loadout, combat and game-over windows.

## v0.9.7 Mobile Combat & Windows

- compact phone layouts for expedition preparation, tactical exploration and debriefing;
- compact ship contact, combat and boarding windows;
- mobile gameplay modals now cover the HUD and dock instead of rendering underneath them;
- settings and story-event cards use reduced spacing and typography on phone web builds.

## v0.9.6 Navigation & Generation Recovery

- compact bottom-center phone section menu without duplicated primary tabs;
- smaller desktop drawer;
- centered route, planet and gameplay windows;
- clean orbital touch targets without grey overlays;
- tutorial target highlighting without blurring the game;
- exact system-count validation, worker recovery and a 300-system generation test;
- anonymous sensor returns show that unexplored systems exist without revealing their data.

## v0.9.5.1 Start Screen Scroll Hotfix

- mobile new-campaign screen owns vertical scrolling in browser and installed PWA mode;
- campaign creation controls remain reachable on short displays;
- start-screen form, title, spacing and buttons are compacted without touching save data.

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
