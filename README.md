# Void Chronicles

**Current version: v0.9.1 — Legacy & Brand**

Procedural single-player space exploration roguelike built with React, TypeScript and Canvas.

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
