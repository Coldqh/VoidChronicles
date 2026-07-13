# Void Chronicles

Procedural single-player space exploration roguelike built with React, TypeScript and Canvas.

## v0.1.1 — Stability & Save Integrity

- deterministic seed-based galaxy generation;
- 20–1500 systems with routes, stars and planets;
- multi-scale historical simulation;
- living, dead and hidden civilizations;
- historical figures, events and artifacts;
- interactive Canvas galaxy map;
- fuel, travel, scanning and discoveries;
- cellular surface expeditions with hazards and combat;
- compact turn-based ship combat;
- injuries, cargo, ship damage and repairs;
- archive, timeline and civilization records;
- queued IndexedDB ironman save, schema migrations, rotating backups and JSON import/export;
- responsive PC/mobile UI and PWA support;
- GitHub Pages deployment workflow.

## Development

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

## Save integrity

Schema v2 validates every snapshot, migrates v1 saves, serializes writes and automatically recovers from up to five local backups.
