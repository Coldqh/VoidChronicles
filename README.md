# Void Chronicles

**Current version: v0.28.0 — Simulation Stability**

Procedural single-player space exploration roguelike and autonomous galaxy-history simulator built with React, TypeScript and Canvas.

The captain is a participant, not the center of the universe. Species, settlements, states, economies, cultures, social classes, ecosystems and wars continue to exist and change without player involvement.

## v0.28.0 Simulation Stability

This release hardens the autonomous world for long campaigns and large galaxies without changing save schema 13.

### Central history retention

- the simulation no longer destroys all history after the thousandth event;
- one centralized maintenance policy replaces local event truncation;
- the live event graph keeps up to 8,000 useful records with an 8,500-event working buffer;
- current polity, war, economy, culture, society, figure, institution, artifact, archive, ruin and planetary snapshots are compacted to the latest state per entity;
- era transitions, regressions, collapses, occupations, peace treaties and player consequences are protected from routine cleanup;
- causal dependencies are retained when their result remains in history;
- duplicate event identifiers and broken cause/result references are repaired deterministically.

### State integrity

- invalid, negative and non-finite simulation values are normalized;
- orphaned population groups, settlements and trade routes are removed or repaired;
- population groups are reconciled with their settlement totals;
- invalid ecosystem species, biome, predator, prey and pathogen references are cleaned;
- scheduled events are deduplicated and capped at 25,000 entries;
- event sequence numbers are repaired after old or damaged saves are loaded.

### Runaway-process control

- active wars cannot remain unresolved for centuries;
- exhausted, idle and overlong wars receive one deterministic stability resolution;
- the same war cannot update more than once every 30 days;
- revolts, riots, strikes, reforms and demographic decline use centralized cooldowns;
- repeated social events are compacted without deleting causally referenced events.

### Long-run validation

- deterministic maintenance tests cover 100, 1,000 and 10,000 simulated years;
- a valid 1,500-system state remains intact;
- event and schedule limits remain bounded;
- repeated maintenance is idempotent;
- the kernel retains important history beyond 1,000 events;
- `SAVE_SCHEMA_VERSION` remains 13 and no save migration is required.

### Applying the kernel integration

The archive includes an idempotent installer because `kernel.ts` must replace three legacy 1,000-event truncation points. Run it once after extracting the patch:

```bash
node APPLY-v0.28.mjs
```

Running the installer again is safe and reports that the kernel is already updated.

## v0.27.0 Chronicle, World Gameplay & Consequences

This release combines roadmap versions v0.25, v0.26 and v0.27. It turns the autonomous simulation into a readable history and makes player work arise from real conditions in that history.

### Chronicle 2.0

- Deep Time history and live simulation events are shown in one chronological record;
- the Chronicle can be filtered by period, domain, system, civilization, faction, entity and player involvement;
- causes and consequences can be traversed in both directions;
- created, changed and destroyed entities are attached to readable events;
- two dates can be compared by population, crises, wars, ecological damage and historical activity;
- hidden service snapshots remain excluded from the public record;
- the post-death observer advances the same Chronicle instead of a separate summary feed.

### World-generated gameplay

- contracts are derived from actual shortages, migration, wars, ecological crises, disasters, political failures, discoveries and endangered heritage;
- every request records the source event, affected systems and the concrete condition that created it;
- tasks describe both the expected success effect and the cost of failure;
- available work includes relief deliveries, evacuations, route security, mediation, containment, investigation, ecological restoration and heritage recovery;
- generated contract identifiers remain compatible with existing saves and contract handling.

### Player consequences

- completed, failed and expired world-generated contracts now alter the real simulation;
- successful relief restores stocks, health and order;
- evacuation transfers population and population groups;
- route security repairs trade traffic, while failure increases disruption;
- ecological work changes contamination, biodiversity and resilience;
- heritage recovery changes artifact and archive state;
- mediation can reduce war intensity and exhaustion;
- sabotage, abandonment and failure can worsen shortages, unrest, ecological damage and faction tension;
- every intervention becomes a causal `player-world-consequence` event in the Chronicle;
- reconciliation is idempotent, so loading or projecting the world twice cannot apply the same result twice.

### Compatibility

- `SAVE_SCHEMA_VERSION` remains 13;
- no save migration is required;
- the release retains the v0.24.1 living-history priority fix for era transitions and regressions.

## v0.24.0 Living Figures, Heritage & Planets

This release combines roadmap versions v0.22, v0.23 and v0.24 and includes the v0.21 economy compatibility hotfix.

### Historical figures and institutions

- historical figures from generated galaxy history continue into the living simulation;
- civilizations without surviving named figures receive deterministic rulers, commanders, scientists, merchants, religious leaders and explorers;
- figures track role, influence, competence, ambition, loyalty, achievements, rivals, institution and polity membership;
- age and species lifespan can end careers and create succession pressure;
- scientists can create institutional breakthroughs;
- governments, academies, military structures, religions, trade organizations, intelligence networks and archives become persistent institutions;
- institutions track influence, wealth, membership, cohesion, corruption and research;
- corruption scandals and the death of important figures become causal world events.

### Living artifacts, archives and ruins

- generated artifacts now have current owners, locations, integrity, authenticity, cultural value, danger and public knowledge;
- ownership and event histories continue after campaign start;
- wars can damage, displace or make artifacts disputed;
- each living civilization receives an event-sourced historical archive;
- archives track records, integrity, accessibility, secrecy and deciphering progress;
- Deep Time ruins continue as active archaeological entities;
- ruins track integrity, excavation, looting, linked archives and linked artifacts;
- excavations, archive destruction and artifact disputes enter the causal Chronicle;
- important living figures can create new historical artifacts during the campaign.

### Planetary consequences

- civilization settlements now apply direct pressure to their real planetary ecosystems;
- industry, agriculture, extraction, warfare, population and trade determine ecological pressure;
- conservation values and advanced technology can reduce damage;
- interstellar societies can conduct persistent terraforming and restoration;
- contamination, biomass, biodiversity, resilience, climate stability, carrying capacity and biological resources change from civilization activity;
- trade can spread invasive organisms;
- dense settlement and ecological disruption can activate pathogens;
- ecological crisis, invasive spread and planetary restoration become causal world events.

### v0.21 compatibility hotfix

- restored `simulateSettlementCycle` for the simulation kernel;
- restored `recomputeSystemFromSettlements` for the kernel, trade and migration layers;
- restored `settlementShortages` for migration decisions;
- added a regression test that verifies all three exports remain available.

### Living World interface

- known historical figures and their active roles are visible;
- institutions show influence, cohesion, corruption and membership;
- artifacts, archives and ruins expose their current condition;
- known inhabited planets show industrial, military, conservation and terraforming pressure.

## v0.21.0 Living Economies, Cultures & Society

This release combines the planned v0.19, v0.20 and v0.21 simulation layers into one compatible upgrade.

### Economy and industry

- each civilization receives an event-sourced live economy;
- nine industrial sectors track output, capacity, employment, productivity and input pressure;
- agriculture, water, energy, extraction, manufacturing, medicine, armaments, consumer production and advanced technology use real settlement resources;
- production reacts to infrastructure, worker health, unrest, technology, stockpiles and functioning trade routes;
- civilizations track gross product, growth, employment, unemployment, inequality, import dependence, consumer supply, industrial capacity and treasury flow;
- broken routes and missing inputs can trigger supply-chain collapse, recession and industrial crises;
- industrial growth changes civilization economy, research, faction wealth and political tension.

### Cultures, languages and religions

- Deep Time cultures continue into the living simulation;
- static civilization cultures, languages and religions are connected to real population groups;
- each culture tracks population, share, influence, cohesion, assimilation pressure and radicalization;
- dominant languages and religions change with demographic influence;
- mixed populations can form syncretic cultures;
- assimilation, language standardization, religious reform and cultural conflict become causal world events;
- cultural tension directly changes loyalty, radicalization, civilization cohesion and stability.

### Population and social conflict

- population groups now change between simulation cycles instead of remaining fixed records;
- birth and death rates depend on health, housing, shortages, unrest and consumer supply;
- settlement population is recalculated from real population groups;
- worker, specialist, security, elite and migrant classes track wealth, health, loyalty, radicalization and migration desire;
- education, research and infrastructure create class mobility and new elites;
- unemployment, inequality and cultural tension produce class tension;
- strikes reduce production;
- riots damage infrastructure and security;
- severe radicalization can produce mass revolt and civil conflict;
- successful reforms can reduce tension and redistribute wealth.

### Integrated causal simulation

- economy, culture and population advance inside the civilization cycle;
- all three layers update before the game chooses the most important public event;
- hidden state snapshots stay out of news, contracts and the readable Chronicle;
- public social events link to wars, shortages, migration, ecology and prior political crises;
- old save files remain compatible because the new state uses existing scalar WorldEvent data.

### Living World interface

- known states now show their economy, unemployment, import dependence and class tension;
- dominant cultures, cultural diversity and social loyalty are visible;
- the strongest industrial sector is shown for known civilizations;
- social crises appear in the same causal Chronicle as wars, state collapses and ecological disasters.

## v0.18.0 Causal Polities & War

- bidirectional cause and result links between world events;
- event records for created, changed and destroyed entities;
- active Deep Time states continue into live history;
- capitals, territories, legitimacy, treasuries, mobilization and war exhaustion;
- state collapse, reform, capital relocation and secession;
- deterministic wars with goals, fronts, logistics, casualties, occupation and peace;
- battles damage settlements, systems and trade routes.

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
