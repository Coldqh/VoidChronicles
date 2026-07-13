# Changelog

## v0.1.1 — Stability & Save Integrity

- added explicit boot/hydration state and removed menu/game restore races;
- serialized and debounced ironman writes to prevent overlapping IndexedDB updates;
- introduced schema v2 with automatic migration from v1;
- added save metadata, sequence numbers and checksum validation;
- added automatic recovery from rotating local backups;
- added manual backup creation and import safety checks;
- added global runtime diagnostics and downloadable crash report;
- blocked duplicate asynchronous game actions;
- added save status indicators and recovery notices;
- expanded snapshot corruption and migration tests.

## v0.1.0 — First Expedition Foundation

- initialized React 18 + TypeScript 5.9 + Vite 8 project;
- added PWA and GitHub Pages deployment workflow;
- added deterministic 20–1500 system galaxy generation;
- added multi-scale historical simulation, civilizations, figures, events and artifacts;
- moved galaxy generation to a Web Worker;
- added Canvas galaxy map with zoom, drag, routes and jump range;
- added fuel-based travel, scan results and travel encounters;
- added cellular surface expedition and turn-based ground combat;
- added compact turn-based ship combat;
- added persistent injuries, ship damage, repair, refuel, cargo and selling;
- added archive, timeline, civilizations and discovery search;
- added IndexedDB ironman save, import and export;
- added deterministic and causal generation tests;
- added responsive desktop/mobile interface;
- dependency audit: 0 known vulnerabilities at build time.
