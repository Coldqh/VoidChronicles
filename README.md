# Void Chronicles

Procedural single-player space exploration roguelike built with React, TypeScript and Canvas.

## v0.8 War, Pursuit & Ship Operations

- ship contacts begin with intent, demands and incomplete information instead of automatic gunfire;
- tactical ship combat uses range, engines, reactor, weapons, sensors, communications, life support and cargo damage;
- disabled targets can be boarded for prisoners, cargo, sabotage or capture;
- pursuit records track who knows the captain, transponder and ship profile;
- local wars affect systems, routes and the contacts generated during travel;
- defeat can lead to capture, debt, confiscation and emergency recovery instead of always ending the run;
- active battles and damaged systems survive refreshes and version updates through save schema v9;
- heavy dependencies are split into production chunks for faster loading.

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
