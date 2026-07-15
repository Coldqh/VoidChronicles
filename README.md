# Void Chronicles

**Current version: v0.18.0 — Causal Polities & War**

Procedural single-player space exploration roguelike and autonomous galaxy-history simulator built with React, TypeScript and Canvas.

The captain is a participant, not the center of the universe. Species, settlements, states, economies, ecosystems and wars continue to exist and change without player involvement.

## v0.18.0 Causal Polities & War

This release combines the planned v0.16, v0.17 and v0.18 layers into one compatible simulation upgrade.

### Causal history

- world events store machine-readable cause and result links inside the existing event data model;
- causes link back to their results without changing the save schema;
- events record created, changed and destroyed entities;
- causal chains can be traversed in either direction;
- era transitions, regressions, state crises, secessions, declarations, battles, occupations and peace treaties use the same history graph;
- the Living World screen shows causal event counts, resolves known cause titles and mixes simulation events into the readable chronicle.

### Living polities

- active Deep Time polities continue into the live campaign;
- living civilizations without an active historical state receive a continuity polity;
- each polity tracks form of government, capital, territory, cultures, population, stability, legitimacy, military power, treasury, mobilization and war exhaustion;
- polity state is persisted through compact hidden state events, so legacy saves remain compatible;
- state metrics are recalculated from real settlements, population, security, unrest, infrastructure, supply and civilization cohesion;
- states can collapse, reform, relocate capitals and split through secession;
- the Living World screen exposes known states and their current strength.

### War, territory and logistics

- neighboring hostile states can start deterministic wars;
- civil wars can emerge after secession;
- wars have goals, fronts, strength, supply, exhaustion, casualties and occupied systems;
- military strength depends on polity forces, mobilization and civilization military capacity;
- logistics depend on system supply and functioning trade routes;
- battles kill population, damage infrastructure, reduce health and security, increase unrest and migration pressure;
- contested routes gain danger, lose traffic and become disrupted;
- successful offensives occupy systems, transfer territory between states and replace the political owner of local settlements;
- loss of a capital damages legitimacy and forces relocation;
- exhaustion, territorial defeat and military collapse can produce peace or capitulation.

## Existing simulation foundation

### v0.15 Living History Continuity

- active Deep Time settlements are projected into the live simulation;
- pre-space civilizations remain living planetary societies;
- civilizations continue advancing or regressing after campaign start;
- historical founding dates survive the transition into live time.

### v0.14 Deep History

- settlements, states, wars, migrations, technologies, ruins and long historical event chains;
- millions of years of deterministic pre-campaign history;
- historical entities remain linked through stable identifiers.

### v0.13 Deep Time

- civilizational eras from pre-sapient life to advanced interstellar societies;
- population, literacy, urbanization, industry, energy use, innovation, stability and collapse risk;
- technological development and regression.

### v0.12 Settlements, Trade and Migration

- persistent settlements and population groups;
- production, consumption, stockpiles and shortages;
- trade routes and migration cycles;
- settlement state drives system population and economy.

### v0.11 Ecosystems

- deterministic planetary biomes, species, food webs and pathogens;
- climate stability, biomass, biodiversity, resilience and contamination;
- extinctions, outbreaks, collapses, blooms and recoveries;
- expeditions can extract samples and damage ecosystems.

### v0.10 Simulation Kernel

- independent world clock measured in hours;
- deterministic scheduled simulation;
- world events drive news, contracts and Living World projections;
- player knowledge is stored separately from real state;
- travel, research, trade, repairs and expeditions consume world time;
- Chronicle observation advances the same galaxy after the captain dies.

## Player layer

The existing game includes:

- captain, ship and crew management;
- galaxy and star-system maps;
- scans, discoveries and persistent expedition locations;
- tactical surface expeditions;
- artifacts, evidence, hypotheses and research;
- factions, hubs, contracts, markets and local NPCs;
- ship contacts, combat, boarding and pursuit;
- strict death, succession records, memorials and Chronicle mode;
- responsive desktop, tablet and mobile PWA layouts.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
```

The full validation command is:

```bash
npm run check
```
