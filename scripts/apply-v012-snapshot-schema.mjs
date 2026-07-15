import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/persistence/snapshot.ts');
let text = fs.readFileSync(file, 'utf8');

const settlementSchemas = `const settlementKindSchema = z.enum(['city','orbital','mining','research','military','trade','illegal','colony','abandoned']);
const settlementResourceSchema = z.object({
  food: finiteNumber, water: finiteNumber, energy: finiteNumber, medicine: finiteNumber,
  parts: finiteNumber, weapons: finiteNumber, luxury: finiteNumber, rareMaterials: finiteNumber
});
const settlementStateSchema = z.object({
  id: z.string(), name: z.string(), kind: settlementKindSchema, systemId: z.string(), planetId: z.string().optional(), hubId: z.string().optional(),
  civilizationId: z.string().optional(), ownerFactionId: z.string().optional(), population: finiteNumber, infrastructure: finiteNumber,
  security: finiteNumber, unrest: finiteNumber, housing: finiteNumber, health: finiteNumber,
  production: settlementResourceSchema, consumption: settlementResourceSchema, stocks: settlementResourceSchema,
  foundedHour: finiteNumber, abandoned: z.boolean(), lastUpdatedHour: finiteNumber
});
const populationGroupStateSchema = z.object({
  id: z.string(), settlementId: z.string(), civilizationId: z.string().optional(), species: z.string(), culture: z.string(),
  socialClass: z.enum(['workers','specialists','security','elite','migrants']), profession: z.string(), population: finiteNumber,
  wealth: finiteNumber, health: finiteNumber, loyalty: finiteNumber, radicalization: finiteNumber, migrationDesire: finiteNumber
});
const tradeRouteStateSchema = z.object({
  id: z.string(), originSettlementId: z.string(), destinationSettlementId: z.string(), pathSystemIds: z.array(z.string()),
  cargo: z.array(z.enum(['food','water','energy','medicine','parts','weapons','luxury','rareMaterials'])), capacity: finiteNumber,
  traffic: finiteNumber, danger: finiteNumber, disrupted: z.boolean(), lastUpdatedHour: finiteNumber
});
`;

if (!text.includes('const settlementKindSchema =')) {
  const marker = 'const simulationStateV2Schema = z.object({';
  if (!text.includes(marker)) throw new Error('v0.12: simulationStateV2Schema marker not found');
  text = text.replace(marker, `${settlementSchemas}\n${marker}`);
}

text = text.replace(
  "z.enum(['civilization-cycle','faction-cycle','system-cycle','war-cycle','ecology-cycle'])",
  "z.enum(['civilization-cycle','faction-cycle','system-cycle','war-cycle','ecology-cycle','settlement-cycle','trade-cycle','migration-cycle'])"
);

const simulationV2Pattern = /const simulationStateV2Schema = z\.object\(\{[\s\S]*?\n\}\);\nconst knowledgeRecordSchema/;
const simulationV2Replacement = `const simulationStateV2Schema = z.object({
  version: z.literal(2), clock: z.object({ absoluteHour: finiteNumber, epochYear: finiteNumber }),
  systems: z.record(z.string(), simulationSystemSchema), civilizations: z.record(z.string(), simulationCivilizationSchema), factions: z.record(z.string(), simulationFactionSchema),
  ecosystems: z.record(z.string(), planetEcologySchema),
  settlements: z.record(z.string(), settlementStateSchema).default({}),
  populationGroups: z.record(z.string(), populationGroupStateSchema).default({}),
  tradeRoutes: z.record(z.string(), tradeRouteStateSchema).default({}),
  scheduledEvents: z.array(scheduledEventV2Schema), events: z.array(worldEventSchema),
  nextSequence: finiteNumber, lastAdvanceReason: z.string()
});
const knowledgeRecordSchema`;
if (!simulationV2Pattern.test(text)) throw new Error('v0.12: simulationStateV2Schema block not found');
text = text.replace(simulationV2Pattern, simulationV2Replacement);

const oldUpgradeCondition = "if (migrated.simulation?.version !== 2 || !migrated.simulation?.ecosystems) {";
const newUpgradeCondition = "if (migrated.simulation?.version !== 2 || !migrated.simulation?.ecosystems || Object.keys(migrated.simulation?.settlements ?? {}).length === 0) {";
if (text.includes(oldUpgradeCondition)) text = text.replace(oldUpgradeCondition, newUpgradeCondition);
else if (!text.includes(newUpgradeCondition)) throw new Error('v0.12: simulation upgrade condition not found');

const knowledgeMarker = "    ...Object.values(snapshot.simulation.ecosystems).flatMap((entry) => entry.species.map((species) => species.id))";
const knowledgeReplacement = `${knowledgeMarker},\n    ...Object.keys(snapshot.simulation.settlements),\n    ...Object.keys(snapshot.simulation.populationGroups),\n    ...Object.keys(snapshot.simulation.tradeRoutes)`;
if (text.includes(knowledgeMarker) && !text.includes('...Object.keys(snapshot.simulation.settlements)')) {
  text = text.replace(knowledgeMarker, knowledgeReplacement);
}

fs.writeFileSync(file, text, 'utf8');
console.log('v0.12 settlement save compatibility applied');

const storeFile = path.join(process.cwd(), 'src/game/store.ts');
let storeText = fs.readFileSync(storeFile, 'utf8');
const advanceMarker = "  const advanced = advanceSimulation(simulation, { seed: galaxy.seed, galaxy, factions, hubs }, hours, reason);";
const hubProjection = `${advanceMarker}
  const projectedHubs = hubs.map((hub) => {
    const settlement = Object.values(advanced.simulation.settlements).find((entry) => entry.hubId === hub.id);
    if (!settlement) return hub;
    const safety = settlement.security < 25 ? 'danger' as const : settlement.security < 55 ? 'caution' as const : 'safe' as const;
    return { ...hub, population: settlement.population, safety };
  });`;
if (!storeText.includes('const projectedHubs = hubs.map((hub) => {')) {
  if (!storeText.includes(advanceMarker)) throw new Error('v0.12: store world advance marker not found');
  storeText = storeText.replace(advanceMarker, hubProjection);
}
storeText = storeText.replace(
  'const contracts = projectContractsFromEvents({ events: advanced.emittedEvents, existing: baseContracts, hubs, year: nextYear });',
  'const contracts = projectContractsFromEvents({ events: advanced.emittedEvents, existing: baseContracts, hubs: projectedHubs, year: nextYear });'
);
const patchMarker = `      simulation: advanced.simulation,
      galaxy: projectedGalaxy,`;
const patchReplacement = `      simulation: advanced.simulation,
      hubs: projectedHubs,
      galaxy: projectedGalaxy,`;
if (!storeText.includes('      hubs: projectedHubs,')) {
  if (!storeText.includes(patchMarker)) throw new Error('v0.12: store patch marker not found');
  storeText = storeText.replace(patchMarker, patchReplacement);
}
fs.writeFileSync(storeFile, storeText, 'utf8');
console.log('v0.12 living hubs projection applied');
