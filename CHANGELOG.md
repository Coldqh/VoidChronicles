# Changelog

## v0.9.3 — Adaptive Interface

- replaced the failed horizontal mobile layout with one vertical document flow;
- rebuilt the star-system map with percentage-based circular orbits instead of fixed 620 px geometry;
- removed document-level horizontal rails and made tabs wrap into readable rows;
- allowed ordinary touch and trackpad gestures over the galaxy map to keep scrolling the page;
- reserved map panning for deliberate horizontal touch movement and Ctrl/Cmd-wheel zoom;
- reduced the phone dock from five actions to four and simplified phone HUD density;
- added phone, tablet, laptop and desktop layout regression checks;
- kept save schema v10 unchanged; total suite: 53 tests.

## v0.9.2 — Responsive Shell

- replaced the fixed-height global layout with a scroll-safe responsive application shell;
- restored vertical touch scrolling on every long screen and removed the global body scroll lock on compact devices;
- added a compact mobile HUD and a fixed five-action navigation dock;
- added dedicated phone, tablet, laptop and wide-desktop breakpoints;
- converted dense multi-column panels to device-appropriate grids and horizontal rails;
- made maps, system inspectors, modals, combat, expedition, archive and settings layouts usable on narrow screens;
- added safe-area padding for installed PWA mode and landscape-phone handling;
- added automated responsive-shell regression checks.

## v0.9.0 — Legacy & Continuity

- added captain conditions for death, capture, disappearance, coma, stranding and retirement;
- added succession after captain loss with eligible crew candidates and role-specific consequences;
- added autonomous ship-AI command when no organic captain remains;
- preserved ship, archive, crew, contracts, debts, pursuits and world state across succession;
- added persistent captain records, memorials, lost expeditions and a readable campaign chronicle;
- added Chronicle mode with accelerated observation of wars and galaxy changes after the run ends;
- made ship capture interrupt command and open succession instead of returning the same captain automatically;
- added confirmed **Reset campaign** and **Start over** actions in Settings, succession and Chronicle screens;
- start-over keeps galaxy generation settings while deleting the current ironman, backups and browser rescue copy;
- migrated save schema from v9 to v10 with automatic legacy initialization;
- added legacy, migration and destructive-reset persistence coverage; total suite: 53 tests.

## v0.8.0 — War, Pursuit & Ship Operations

- replaced instant random ship battles with a contact phase: patrols, pirates, traders, refugees, researchers, smugglers, military vessels and bounty hunters;
- added documents, bribery, hidden cargo, aid, surrender, communication, escape and first-strike responses before combat;
- rebuilt ship combat around range, targeted subsystem damage, evasion, emergency jumps, negotiation and boarding conditions;
- added persistent ship systems for engines, reactor, weapons, sensors, communications, life support and cargo;
- added boarding operations for the bridge, cargo hold, prisoners and reactor sabotage;
- added defeat outcomes that can preserve the run through capture, cargo loss, debt and emergency repairs;
- added concrete pursuit records showing who is hunting the player and what information they know;
- added transponder replacement and partial pursuit reduction;
- added local war fronts that advance during travel and increase contact danger in contested systems;
- added a dedicated Operations screen and integrated threat summaries into the Command Deck and ship dossier;
- persisted active combat, pursuits, war fronts and subsystem damage in ironman saves;
- migrated save schema from v8 to v9 and added mid-combat restoration coverage;
- split React, state and validation libraries into separate production chunks; test suite: 46 tests.

## v0.7.1 — Clarity & Persistence

- mirrored every ironman autosave into a synchronous browser rescue copy;
- restored saves automatically after refresh, PWA replacement or temporary IndexedDB loss;
- forced updates now flush pending writes before reloading;
- varied expedition map dimensions, terrain, enemy counts, reward counts and reward positions;
- preserved defeated enemies, collected data, opened objects and revealed terrain across visits;
- removed omniscient starting data and hidden unknown factions, civilizations, news and history;
- replaced slideshow onboarding with contextual interface tasks;
- added a stable tutorial start system and first expedition;
- reduced command deck, system map and navigation density.

## v0.7.0 — Encounters & Consequences

- added a reusable scene engine for distress calls, negotiations, crew moments, mysteries, travel and hub encounters;
- added meaningful choices with credits, reputation, faction standing, crew morale, objectives and delayed consequences;
- added deterministic travel encounters and local hub scenes tied to real systems, factions and NPCs;
- added an objective layer that separates urgent decisions, opportunities, long stories and tutorial goals;
- added a dedicated Scenes screen and placed the highest-priority incoming scene directly on the Command Deck;
- added a seven-step modern onboarding experience with progress, context and a checkbox to disable it before galaxy generation;
- added tutorial restart controls in Settings without touching the ironman archive;
- redesigned the interface with layered spatial glass, animated scan lines, orbital compositions, cinematic scene cards and responsive mobile layouts;
- added lazy loading for Living World and Laboratory screens;
- migrated save schema from v7 to v8 with automatic narrative defaults for existing parties;
- expanded deterministic narrative, migration and UI coverage; total suite: 36 tests.

## v0.6.0 — Relics, Technology & Living World

- added a ship laboratory with multi-cycle artifact research, specialist bonuses, costs, risks and accidents;
- added technology domains, recovered blueprints, prototype equipment and installable ship modifications;
- connected equipment assignment to expedition combat, evidence quality, healing and damage mitigation;
- added persistent world threads for discoveries, faction conflicts, civilization changes, archaeology and research;
- rebuilt the Command Deck around current decisions, opportunities, urgent situations and visible consequences;
- added dedicated Living World and Laboratory screens with actionable navigation into related systems;
- upgraded civilization dossiers, expedition preparation and bridge summaries to explain context instead of listing raw data;
- migrated save schema from v6 to v7 while preserving existing ironman saves;
- expanded deterministic research, world-thread, migration and UI tests; total suite: 32 tests.

## v0.5.0 — Civilizations & Lost Worlds

- added deterministic species biology, cultures, languages, religions, states, social classes and outsider policies;
- added staged first contact with translation progress, trust, failure and faction consequences;
- expanded hubs into settlements with districts, customs and persistent local NPCs;
- added NPC agendas, fears, trust, memories and direct interactions;
- added archaeology chains for dead civilizations and multi-stage lost-world investigations;
- added publication, sale and suppression of historical hypotheses;
- added cultural artifact valuation for markets, museums, heirs and black markets;
- added a dedicated civilization dossier screen and deeper archive connections;
- replaced the crowded top navigation with a slide-out side drawer;
- fixed vertical scrolling across long screens, tabs, maps, archives and mobile layouts;
- migrated save schema from v5 to v6 while preserving existing ironman saves;
- added civilization, migration and interface smoke tests.

## v0.4.0 — Living Galaxy

- added governments, corporations, universities, trade houses, cartels, religious groups and pirates;
- added friendly, neutral, wary and hostile faction dispositions with concrete action memories;
- added orbital hubs, civilian settlements, ports, research stations, black markets and trade services;
- added contracts for surveys, recovery, delivery, rescue, bounties and smuggling;
- added faction reputation, contract deadlines, rewards, contraband inspections and confiscation;
- added regional markets, legal goods, drugs and restricted cargo;
- added local news generated from visited regions and world events;
- added persistent expedition locations: defeated enemies stay dead, surviving enemies retain damage and position, looted terminals and artifacts remain empty, opened areas remain revealed;
- made living settlements non-hostile by default;
- migrated save schema from v4 to v5 while preserving existing ironman saves;
- expanded bridge, system, hub, contracts, factions, trade and archive interfaces;
- added deterministic living-galaxy and location-memory tests.

## v0.3.0 — Command Deck

- added a dedicated Command Deck home screen for the active run;
- separated galaxy navigation from the current star-system map;
- added dedicated Galaxy, System and Crew screens;
- added deterministic crew candidates, hiring, contracts, salaries and dismissal;
- added crew morale, loyalty, memories, beliefs, injuries and status;
- added expedition team selection and profession bonuses;
- added schema v4 migration preserving existing v0.2 ironman saves;
- added responsive mobile bottom navigation;
- kept forced PWA refresh and permanent version display;
- added crew generation tests; total suite: 16 tests.

## v0.2.0 — Deep Discovery

- added orbital star-system exploration screen;
- added system scan, detailed planet scan and field confirmation levels;
- added deterministic causal points of interest;
- added expedition loadout with weapon, armor, tools, oxygen and sample containers;
- expanded surface maps with doors, terminals, samples, hazards, cover and safe-time pressure;
- added evidence and hypothesis systems;
- added repeat visits and blocked/resolved POI states;
- added progressive artifact analysis;
- added Settings screen, visible app version and forced PWA refresh;
- migrated save schema from v2 to v3 while preserving old ironman saves;
- added discovery generation and hypothesis tests.

## v0.1.1 — Stability & Save Integrity

- added save validation, migration, checksum, queue, backups and recovery;
- fixed startup hydration loops and runtime instability.

## v0.1.0 — First Expedition Foundation

- initialized the galaxy, travel, scanning, expedition, combat and persistence foundation.
