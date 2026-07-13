import { z } from 'zod';
import type { GameStateSnapshot, SaveMetadata } from '../game/types';
import { APP_VERSION, SAVE_SCHEMA_VERSION } from '../version';
import { initializeLivingGalaxy } from '../world/livingGalaxy';
import { enrichGalaxyCivilizations, initializeCivilizationLayer } from '../world/civilizations';
import { initializeWorldThreads } from '../world/storyThreads';
import { initializeNarrative } from '../narrative/encounters';
import { createShipSystems, initializeWarFronts, normalizeShipSystems } from '../world/warfare';

export const CURRENT_SCHEMA_VERSION = SAVE_SCHEMA_VERSION;
export { APP_VERSION };

const finiteNumber = z.number().finite();
const dangerSchema = z.enum(['safe', 'caution', 'danger', 'extreme']);
const planetTypeSchema = z.enum(['rocky', 'ocean', 'desert', 'ice', 'gas', 'toxic', 'jungle', 'artificial', 'anomalous']);
const scanLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const planetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: planetTypeSchema,
  orbit: finiteNumber,
  moons: finiteNumber,
  habitability: finiteNumber,
  danger: dangerSchema,
  hasLife: z.boolean(),
  civilizationId: z.string().optional(),
  pointsOfInterest: finiteNumber,
  scanned: z.boolean(),
  scanLevel: scanLevelSchema.optional(),
  lastScanYear: finiteNumber.optional(),
  imageKey: z.string()
});

const systemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  coordinates: z.object({ x: finiteNumber, y: finiteNumber }),
  starClass: z.enum(['M', 'K', 'G', 'F', 'A', 'B', 'O', 'WHITE_DWARF', 'NEUTRON', 'BLACK_HOLE']),
  starCount: finiteNumber,
  planets: z.array(planetSchema),
  neighbors: z.array(z.string()),
  danger: dangerSchema,
  factionId: z.string().optional(),
  civilizationIds: z.array(z.string()),
  known: z.boolean(),
  visited: z.boolean(),
  scanned: z.boolean(),
  anomaly: z.boolean(),
  region: z.enum(['core', 'frontier', 'deep'])
});

const speciesProfileSchema = z.object({
  bodyPlan: z.string(), metabolism: z.string(), reproduction: z.string(), lifespan: finiteNumber,
  homeAdaptation: z.string(), unusualTrait: z.string()
});
const civilizationLanguageSchema = z.object({ id: z.string(), name: z.string(), script: z.string(), complexity: finiteNumber });
const civilizationReligionSchema = z.object({ id: z.string(), name: z.string(), doctrine: z.string(), taboos: z.array(z.string()), sacredObjects: z.array(z.string()) });
const civilizationCultureSchema = z.object({
  id: z.string(), name: z.string(), values: z.array(z.string()), taboos: z.array(z.string()), artForms: z.array(z.string()),
  languageId: z.string(), religionIds: z.array(z.string())
});
const civilizationStateSchema = z.object({
  id: z.string(), name: z.string(), government: z.string(), capitalSystemId: z.string(),
  status: z.enum(['active','collapsed','exiled']), outsiderPolicy: z.string()
});

const civilizationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  speciesName: z.string(),
  status: z.enum(['living', 'dead', 'hidden']),
  techLevel: finiteNumber,
  ideology: z.string(),
  homeSystemId: z.string(),
  controlledSystems: z.array(z.string()),
  foundedYear: finiteNumber,
  endedYear: finiteNumber.optional(),
  traits: z.array(z.string()),
  speciesProfile: speciesProfileSchema.optional(),
  languages: z.array(civilizationLanguageSchema).optional(),
  religions: z.array(civilizationReligionSchema).optional(),
  cultures: z.array(civilizationCultureSchema).optional(),
  states: z.array(civilizationStateSchema).optional(),
  socialClasses: z.array(z.string()).optional(),
  outsiderPolicy: z.string().optional(),
  originMystery: z.string().optional(),
  extinctionCause: z.string().optional()
});

const figureSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  civilizationId: z.string(),
  role: z.string(),
  bornYear: finiteNumber,
  diedYear: finiteNumber.optional(),
  importance: finiteNumber,
  achievements: z.array(z.string())
});

const historySchema = z.object({
  id: z.string().min(1),
  year: finiteNumber,
  title: z.string(),
  summary: z.string(),
  civilizationIds: z.array(z.string()),
  systemIds: z.array(z.string()),
  figureIds: z.array(z.string()),
  consequences: z.array(z.string())
});

const artifactSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.string(),
  civilizationId: z.string(),
  createdYear: finiteNumber,
  creatorId: z.string().optional(),
  ownerHistory: z.array(z.string()),
  value: finiteNumber,
  danger: finiteNumber,
  truth: z.string(),
  publicDescription: z.string(),
  discovered: z.boolean()
});

const galaxySettingsSchema = z.object({
  seed: z.string().min(1),
  systemCount: z.number().int().min(1),
  historyYears: z.number().int().min(1),
  civilizationCount: z.number().int().min(0),
  lifeFrequency: finiteNumber,
  anomalyFrequency: finiteNumber,
  difficulty: z.enum(['explorer', 'standard', 'brutal']),
  tutorialEnabled: z.boolean().optional()
});

const galaxySchema = z.object({
  id: z.string().min(1),
  seed: z.string().min(1),
  createdAt: z.string(),
  currentYear: finiteNumber,
  settings: galaxySettingsSchema,
  systems: z.array(systemSchema).min(1),
  civilizations: z.array(civilizationSchema),
  figures: z.array(figureSchema),
  history: z.array(historySchema),
  artifacts: z.array(artifactSchema),
  startSystemId: z.string().min(1)
});

const injurySchema = z.object({
  id: z.string(),
  bodyPart: z.enum(['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']),
  type: z.enum(['bruise', 'bleeding', 'fracture', 'burn', 'organ', 'lostLimb']),
  severity: finiteNumber,
  permanent: z.boolean()
});

const captainSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  level: finiteNumber,
  xp: finiteNumber,
  health: finiteNumber,
  maxHealth: finiteNumber,
  credits: finiteNumber,
  reputation: finiteNumber,
  skills: z.object({
    research: finiteNumber,
    archaeology: finiteNumber,
    trade: finiteNumber,
    combat: finiteNumber,
    crime: finiteNumber
  }),
  injuries: z.array(injurySchema),
  alive: z.boolean()
});

const cargoSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  quantity: finiteNumber,
  value: finiteNumber,
  artifactId: z.string().optional(),
  commodityId: z.string().optional(),
  contractId: z.string().optional(),
  illegal: z.boolean().optional()
});

const moduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  slot: z.enum(['engine', 'scanner', 'cargo', 'weapon', 'utility']),
  rarity: finiteNumber,
  effect: z.string()
});

const shipSystemIdSchema = z.enum(['engine','reactor','weapons','sensors','comms','lifeSupport','cargo']);
const shipSystemSchema = z.object({
  id: shipSystemIdSchema, label: z.string(), integrity: finiteNumber, maxIntegrity: finiteNumber, disabled: z.boolean(), effect: z.string()
});
const shipSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  hull: finiteNumber,
  maxHull: finiteNumber,
  fuel: finiteNumber,
  maxFuel: finiteNumber,
  jumpRange: finiteNumber,
  cargoCapacity: finiteNumber,
  cargo: z.array(cargoSchema),
  modules: z.array(moduleSchema),
  statuses: z.array(z.string()),
  systems: z.array(shipSystemSchema).default([]),
  transponder: z.string().default('WANDERER-01'),
  registration: z.string().default('VC-01-CORE')
});

const discoverySchema = z.object({
  id: z.string(),
  kind: z.enum(['signal', 'ruin', 'biosphere', 'artifact', 'settlement', 'anomaly']),
  name: z.string(),
  systemId: z.string(),
  planetId: z.string().optional(),
  description: z.string(),
  confidence: finiteNumber,
  year: finiteNumber,
  tags: z.array(z.string()),
  artifactId: z.string().optional(),
  pointOfInterestId: z.string().optional()
});

const logSchema = z.object({
  id: z.string(),
  year: finiteNumber,
  title: z.string(),
  text: z.string(),
  tone: z.enum(['info', 'good', 'warning', 'danger'])
});

const pointTypeSchema = z.enum(['ruin', 'wreck', 'settlement', 'laboratory', 'cave', 'ancientFactory', 'graveyard', 'smugglerCamp', 'anomaly', 'biosphere', 'distress']);
const equipmentSchema = z.enum(['pistol', 'rifle', 'armor', 'medkit', 'scanner', 'cutter', 'translator', 'sampleContainer', 'explosives', 'oxygen']);
const evidenceKindSchema = z.enum(['record', 'body', 'weapon', 'architecture', 'sample', 'terminal', 'damage', 'signal']);

const scanReportSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  planetId: z.string().optional(),
  level: scanLevelSchema,
  confidence: finiteNumber,
  createdYear: finiteNumber,
  summary: z.string(),
  warnings: z.array(z.string()),
  detectedPointOfInterestIds: z.array(z.string())
});

const pointOfInterestSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  planetId: z.string(),
  name: z.string(),
  type: pointTypeSchema,
  status: z.enum(['detected', 'visited', 'blocked', 'resolved']),
  danger: dangerSchema,
  age: finiteNumber,
  civilizationId: z.string().optional(),
  origin: z.string(),
  publicSummary: z.string(),
  truth: z.string(),
  requiredEquipment: z.array(equipmentSchema),
  possibleRewards: z.array(z.string()),
  scanConfidence: finiteNumber,
  visits: finiteNumber,
  discoveredYear: finiteNumber,
  lastVisitedYear: finiteNumber.optional()
});

const evidenceSchema = z.object({
  id: z.string(),
  pointOfInterestId: z.string(),
  systemId: z.string(),
  planetId: z.string(),
  kind: evidenceKindSchema,
  title: z.string(),
  description: z.string(),
  reliability: finiteNumber,
  discoveredYear: finiteNumber,
  tags: z.array(z.string())
});

const hypothesisSchema = z.object({
  id: z.string(),
  pointOfInterestId: z.string(),
  title: z.string(),
  summary: z.string(),
  confidence: finiteNumber,
  status: z.enum(['tentative', 'supported', 'confirmed', 'disproved']),
  evidenceIds: z.array(z.string()),
  updatedYear: finiteNumber,
  disposition: z.enum(['private','published','sold','suppressed']).optional(),
  beneficiaryFactionId: z.string().optional(),
  resolvedYear: finiteNumber.optional()
});

const artifactKnowledgeSchema = z.object({
  artifactId: z.string(),
  level: finiteNumber,
  knownFields: z.array(z.string()),
  notes: z.array(z.string()),
  revealedTruth: z.string().optional()
});

const crewRoleSchema = z.enum(['pilot', 'engineer', 'doctor', 'scientist', 'archaeologist', 'soldier', 'diplomat', 'biologist', 'smuggler']);
const crewMemorySchema = z.object({
  id: z.string(),
  year: finiteNumber,
  kind: z.enum(['hired', 'expedition', 'injury', 'payment', 'betrayal', 'discovery']),
  text: z.string(),
  impact: finiteNumber
});
const crewMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string(),
  culture: z.string(),
  primaryRole: crewRoleSchema,
  secondaryRole: crewRoleSchema.optional(),
  level: finiteNumber,
  health: finiteNumber,
  maxHealth: finiteNumber,
  morale: finiteNumber,
  loyalty: finiteNumber,
  salary: finiteNumber,
  sharePercent: finiteNumber,
  contractYears: finiteNumber,
  joinedYear: finiteNumber,
  paidUntilYear: finiteNumber,
  traits: z.array(z.string()),
  belief: z.string(),
  status: z.enum(['active', 'injured', 'unpaid', 'missing']),
  injuries: z.array(injurySchema),
  memories: z.array(crewMemorySchema)
});
const crewCandidateSchema = crewMemberSchema.extend({
  signingCost: finiteNumber,
  originSystemId: z.string()
});


const factionMemorySchema = z.object({ id: z.string(), year: finiteNumber, action: z.string(), impact: finiteNumber, text: z.string() });
const factionSchema = z.object({
  id: z.string(), name: z.string(), kind: z.enum(['government','corporation','university','cartel','tradeHouse','religious','pirates']),
  civilizationId: z.string().optional(), disposition: z.enum(['friendly','neutral','wary','hostile']), reputation: finiteNumber,
  wealth: finiteNumber, military: finiteNumber, research: finiteNumber, laws: z.array(z.string()), allies: z.array(z.string()), enemies: z.array(z.string()), memories: z.array(factionMemorySchema)
});
const hubDistrictSchema = z.object({ id: z.string(), name: z.string(), function: z.string(), safety: dangerSchema, description: z.string() });
const hubSchema = z.object({
  id: z.string(), systemId: z.string(), factionId: z.string(), civilizationId: z.string().optional(), name: z.string(),
  kind: z.enum(['station','colony','freeport','settlement']), population: finiteNumber, safety: dangerSchema,
  services: z.array(z.enum(['contracts','trade','repair','fuel','crew','news','blackMarket'])), description: z.string(),
  visited: z.boolean(), docked: z.boolean(), inspectionLevel: finiteNumber, marketSeed: z.string(),
  districts: z.array(hubDistrictSchema).optional(), localCustoms: z.array(z.string()).optional(), npcIds: z.array(z.string()).optional()
});
const npcMemorySchema = z.object({ id: z.string(), year: finiteNumber, kind: z.enum(['meeting','deal','help','threat','betrayal','discovery']), text: z.string(), impact: finiteNumber });
const localNpcSchema = z.object({
  id: z.string(), hubId: z.string(), civilizationId: z.string().optional(), name: z.string(), species: z.string(), culture: z.string(),
  role: z.enum(['administrator','merchant','scientist','doctor','fixer','priest','guard','resident']),
  disposition: z.enum(['friendly','neutral','wary','hostile']), trust: finiteNumber, alive: z.boolean(), present: z.boolean(),
  agenda: z.string(), fear: z.string(), memories: z.array(npcMemorySchema)
});
const civilizationContactSchema = z.object({
  civilizationId: z.string(), stage: z.enum(['unknown','observed','signals','translated','contacted','trusted','failed']),
  languageLevel: finiteNumber, trust: finiteNumber, attempts: finiteNumber, firstContactYear: finiteNumber.optional(),
  lastContactYear: finiteNumber.optional(), notes: z.array(z.string())
});
const archaeologyStageSchema = z.object({
  id: z.string(), title: z.string(), summary: z.string(), status: z.enum(['locked','active','completed']),
  targetSystemId: z.string(), targetPointOfInterestId: z.string().optional(), completedYear: finiteNumber.optional()
});
const archaeologyChainSchema = z.object({
  id: z.string(), civilizationId: z.string(), title: z.string(), summary: z.string(), status: z.enum(['active','completed','failed']),
  stages: z.array(archaeologyStageSchema), createdYear: finiteNumber
});

const technologyDomainSchema = z.enum(['energy','propulsion','medicine','materials','computing','weapons','biology','anomaly']);
const researchProjectSchema = z.object({
  id: z.string(), artifactId: z.string(), title: z.string(), domain: technologyDomainSchema,
  status: z.enum(['queued','active','completed','failed']), progress: finiteNumber, requiredProgress: finiteNumber,
  risk: finiteNumber, assignedCrewIds: z.array(z.string()), startedYear: finiteNumber, updatedYear: finiteNumber,
  completedYear: finiteNumber.optional(), complication: z.string().optional(), log: z.array(z.string())
});
const technologyBlueprintSchema = z.object({
  id: z.string(), sourceArtifactId: z.string(), name: z.string(), domain: technologyDomainSchema,
  status: z.enum(['discovered','available','installed','restricted']), rarity: finiteNumber, description: z.string(),
  benefit: z.string(), drawback: z.string(), installCost: finiteNumber,
  moduleSlot: z.enum(['engine','scanner','cargo','weapon','utility']), factionInterest: z.array(z.string()), discoveredYear: finiteNumber
});
const equipmentItemSchema = z.object({
  id: z.string(), name: z.string(), category: z.enum(['weapon','armor','tool','medical','implant','relic']), rarity: finiteNumber,
  description: z.string(), effect: z.string(), assignedToId: z.string().optional(), sourceArtifactId: z.string().optional(), condition: finiteNumber
});
const worldThreadUpdateSchema = z.object({ id: z.string(), year: finiteNumber, text: z.string(), tone: z.enum(['info','good','warning','danger']) });
const worldThreadSchema = z.object({
  id: z.string(), category: z.enum(['politics','discovery','conflict','culture','research','crew']),
  status: z.enum(['emerging','active','escalating','resolved','lost']), title: z.string(), summary: z.string(), urgency: finiteNumber,
  progress: finiteNumber, systemIds: z.array(z.string()), civilizationIds: z.array(z.string()), factionIds: z.array(z.string()),
  relatedArtifactIds: z.array(z.string()), playerInvolved: z.boolean(), nextAction: z.string().optional(), updates: z.array(worldThreadUpdateSchema)
});
const contractSchema = z.object({
  id: z.string(), type: z.enum(['survey','recovery','delivery','bounty','smuggling','rescue']), status: z.enum(['available','active','completed','failed','expired']),
  issuerHubId: z.string(), issuerFactionId: z.string(), title: z.string(), description: z.string(), reward: finiteNumber, advance: finiteNumber,
  deadlineYear: finiteNumber, acceptedYear: finiteNumber.optional(), completedYear: finiteNumber.optional(), targetSystemId: z.string(),
  targetPointOfInterestId: z.string().optional(), progress: finiteNumber, requiredProgress: finiteNumber, illegal: z.boolean(), hiddenClause: z.string().optional(), cargoId: z.string().optional()
});
const newsSchema = z.object({
  id: z.string(), year: finiteNumber, sourceHubId: z.string().optional(), headline: z.string(), text: z.string(),
  category: z.enum(['security','discovery','trade','politics']), reliability: finiteNumber, systemIds: z.array(z.string())
});
const locationEnemySchema = z.object({ id: z.string(), health: finiteNumber, x: finiteNumber, y: finiteNumber });
const locationStateSchema = z.object({
  pointOfInterestId: z.string(), visitCount: finiteNumber, enemyStates: z.array(locationEnemySchema), resolvedObjectIds: z.array(z.string()),
  collectedEvidenceKeys: z.array(z.string()), revealedTileKeys: z.array(z.string()), artifactTaken: z.boolean(),
  lastOutcome: z.enum(['evacuated','resolved','failed']), lastVisitedYear: finiteNumber
});

const storyChoiceEffectSchema = z.object({
  credits: finiteNumber.optional(), reputation: finiteNumber.optional(), factionId: z.string().optional(), factionReputation: finiteNumber.optional(),
  crewMorale: finiteNumber.optional(), objectiveTitle: z.string().optional(), objectiveDescription: z.string().optional(), objectiveSystemId: z.string().optional(),
  consequenceDelay: finiteNumber.optional(), consequenceTitle: z.string().optional(), consequenceText: z.string().optional(),
  consequenceTone: z.enum(['info','good','warning','danger']).optional()
});
const storyChoiceSchema = z.object({
  id: z.string(), label: z.string(), summary: z.string(), risk: z.enum(['low','medium','high','unknown']), requires: z.array(z.string()).optional(), effect: storyChoiceEffectSchema
});
const storySceneSchema = z.object({
  id: z.string(), category: z.enum(['distress','negotiation','crew','mystery','travel','hub','consequence']),
  status: z.enum(['available','resolved','expired']), title: z.string(), summary: z.string(), body: z.string(), source: z.string(), systemId: z.string(),
  hubId: z.string().optional(), npcIds: z.array(z.string()), factionIds: z.array(z.string()), createdYear: finiteNumber, expiresYear: finiteNumber.optional(),
  choices: z.array(storyChoiceSchema), resolvedChoiceId: z.string().optional()
});
const pendingConsequenceSchema = z.object({
  id: z.string(), status: z.enum(['pending','resolved']), createdYear: finiteNumber, triggerYear: finiteNumber, title: z.string(), text: z.string(),
  tone: z.enum(['info','good','warning','danger']), systemId: z.string().optional(), factionId: z.string().optional(), sourceSceneId: z.string().optional()
});
const objectiveSchema = z.object({
  id: z.string(), title: z.string(), description: z.string(), kind: z.enum(['urgent','opportunity','story','tutorial']), status: z.enum(['active','completed','failed']),
  createdYear: finiteNumber, deadlineYear: finiteNumber.optional(), systemId: z.string().optional(), hubId: z.string().optional(), sourceSceneId: z.string().optional(), progress: finiteNumber
});
const tutorialSchema = z.object({ enabled: z.boolean(), active: z.boolean(), currentStep: finiteNumber, completed: z.boolean(), targetPlanetId: z.string().optional(), targetPointOfInterestId: z.string().optional() });
const shipContactSchema = z.object({
  id: z.string(), kind: z.enum(['patrol','pirate','trader','bountyHunter','military','smuggler','refugee','wreck','researcher','unknown']),
  intent: z.enum(['inspection','robbery','trade','distress','hunt','escort','unknown']), name: z.string(), factionId: z.string().optional(),
  systemId: z.string(), threat: finiteNumber, demand: z.string(), description: z.string(), knowsIdentity: z.boolean(), knowsTransponder: z.boolean(), hostile: z.boolean()
});
const enemyShipSchema = z.object({ name: z.string(), hull: finiteNumber, maxHull: finiteNumber, systems: z.array(shipSystemSchema), crew: finiteNumber, morale: finiteNumber, cargoValue: finiteNumber });
const shipEncounterSchema = z.object({
  id: z.string(), phase: z.enum(['contact','combat','boarding','resolved']), contact: shipContactSchema, range: z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]),
  turn: finiteNumber, playerInitiative: z.boolean(), enemy: enemyShipSchema, combatLog: z.array(z.string()), brace: z.boolean(), evasion: finiteNumber,
  canBoard: z.boolean(), boardingProgress: finiteNumber, stationAssignments: z.record(shipSystemIdSchema, z.string()).default({}), outcome: z.enum(['victory','escaped','captured','surrendered','destroyed','boarded','peaceful']).optional()
});
const pursuitSchema = z.object({
  id: z.string(), sourceFactionId: z.string().optional(), sourceName: z.string(), reason: z.string(), intensity: finiteNumber,
  knownIdentity: z.boolean(), knownTransponder: z.boolean(), knownShipProfile: z.boolean(), lastKnownSystemId: z.string(), createdYear: finiteNumber,
  lastUpdateYear: finiteNumber, status: z.enum(['active','cold','resolved'])
});
const warFrontSchema = z.object({
  id: z.string(), attackerFactionId: z.string(), defenderFactionId: z.string(), systemIds: z.array(z.string()), intensity: finiteNumber,
  startedYear: finiteNumber, lastUpdateYear: finiteNumber, status: z.enum(['cold','active','ceasefire','resolved']), attackerScore: finiteNumber,
  defenderScore: finiteNumber, playerSide: z.string().optional()
});


const legacyPayloadSchema = z.object({
  galaxy: galaxySchema,
  captain: captainSchema,
  ship: shipSchema,
  currentSystemId: z.string().min(1),
  gameYear: finiteNumber,
  discoveries: z.array(discoverySchema),
  logs: z.array(logSchema)
});

const v3PayloadSchema = legacyPayloadSchema.extend({
  scanReports: z.array(scanReportSchema),
  pointsOfInterest: z.array(pointOfInterestSchema),
  evidence: z.array(evidenceSchema),
  hypotheses: z.array(hypothesisSchema),
  artifactKnowledge: z.array(artifactKnowledgeSchema)
});

const v4PayloadSchema = v3PayloadSchema.extend({
  crew: z.array(crewMemberSchema),
  crewCandidates: z.array(crewCandidateSchema)
});
const v5PayloadSchema = v4PayloadSchema.extend({
  factions: z.array(factionSchema),
  hubs: z.array(hubSchema),
  contracts: z.array(contractSchema),
  news: z.array(newsSchema),
  locationStates: z.array(locationStateSchema),
  currentHubId: z.string().nullable()
});
const v6PayloadSchema = v5PayloadSchema.extend({
  localNpcs: z.array(localNpcSchema),
  civilizationContacts: z.array(civilizationContactSchema),
  archaeologyChains: z.array(archaeologyChainSchema)
});
const v7PayloadSchema = v6PayloadSchema.extend({
  researchProjects: z.array(researchProjectSchema),
  technologyBlueprints: z.array(technologyBlueprintSchema),
  equipmentInventory: z.array(equipmentItemSchema),
  worldThreads: z.array(worldThreadSchema)
});
const v8PayloadSchema = v7PayloadSchema.extend({
  storyScenes: z.array(storySceneSchema),
  pendingConsequences: z.array(pendingConsequenceSchema),
  objectives: z.array(objectiveSchema),
  tutorial: tutorialSchema
});
const v9PayloadSchema = v8PayloadSchema.extend({
  activeShipEncounter: shipEncounterSchema.nullable(),
  pursuits: z.array(pursuitSchema),
  warFronts: z.array(warFrontSchema)
});

const saveMetadataSchema = z.object({
  savedAt: z.string().datetime(),
  appVersion: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  reason: z.string().min(1),
  checksum: z.string().regex(/^[0-9a-f]{8}$/)
});

const snapshotV1Schema = legacyPayloadSchema.extend({ schemaVersion: z.literal(1) });
const snapshotV2Schema = legacyPayloadSchema.extend({ schemaVersion: z.literal(2), saveMeta: saveMetadataSchema });
const snapshotV3Schema = v3PayloadSchema.extend({ schemaVersion: z.literal(3), saveMeta: saveMetadataSchema });
const snapshotV4Schema = v4PayloadSchema.extend({ schemaVersion: z.literal(4), saveMeta: saveMetadataSchema });
const snapshotV5Schema = v5PayloadSchema.extend({ schemaVersion: z.literal(5), saveMeta: saveMetadataSchema });
const snapshotV6Schema = v6PayloadSchema.extend({ schemaVersion: z.literal(6), saveMeta: saveMetadataSchema });
const snapshotV7Schema = v7PayloadSchema.extend({ schemaVersion: z.literal(7), saveMeta: saveMetadataSchema });
const snapshotV8Schema = v8PayloadSchema.extend({ schemaVersion: z.literal(8), saveMeta: saveMetadataSchema });
const snapshotV9Schema = v9PayloadSchema.extend({ schemaVersion: z.literal(9), saveMeta: saveMetadataSchema });

type SnapshotCurrent = z.infer<typeof snapshotV9Schema>;

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function checksumInput(snapshot: SnapshotCurrent): string {
  return JSON.stringify({ ...snapshot, saveMeta: { ...snapshot.saveMeta, checksum: '00000000' } });
}

export function computeSnapshotChecksum(snapshot: SnapshotCurrent): string {
  return hashText(checksumInput(snapshot));
}

function emptyExploration() {
  return { scanReports: [], pointsOfInterest: [], evidence: [], hypotheses: [], artifactKnowledge: [] };
}
function emptyCrew() { return { crew: [], crewCandidates: [] }; }
function emptyWarfare(galaxy: z.infer<typeof galaxySchema>, factions: z.infer<typeof factionSchema>[], year = 0) { return { activeShipEncounter: null, pursuits: [], warFronts: initializeWarFronts(galaxy.seed, factions, galaxy.systems, year) }; }
function livingState(galaxy: z.infer<typeof galaxySchema>) {
  const living = initializeLivingGalaxy(galaxy);
  const layer = initializeCivilizationLayer(galaxy as GameStateSnapshot['galaxy'], living.hubs);
  return {
    galaxy: layer.galaxy,
    factions: living.factions,
    hubs: layer.hubs,
    contracts: living.contracts,
    news: living.news,
    locationStates: [],
    currentHubId: null,
    localNpcs: layer.localNpcs,
    civilizationContacts: layer.civilizationContacts,
    archaeologyChains: layer.archaeologyChains,
    researchProjects: [],
    technologyBlueprints: [],
    equipmentInventory: [
      { id: 'gear_sidearm', name: 'Служебный пистолет', category: 'weapon' as const, rarity: 1, description: 'Надёжное оружие для аварийной защиты.', effect: '+базовая атака в экспедиции', assignedToId: 'captain_player', condition: 100 },
      { id: 'gear_field_armor', name: 'Полевой скафандр', category: 'armor' as const, rarity: 1, description: 'Изоляция от среды и лёгкая бронезащита.', effect: '-риск травмы от среды', assignedToId: 'captain_player', condition: 100 },
      { id: 'gear_multiscanner', name: 'Ручной мультисканер', category: 'tool' as const, rarity: 1, description: 'Собирает спектральные и структурные данные.', effect: '+достоверность полевого анализа', condition: 100 }
    ],
    worldThreads: initializeWorldThreads(layer.galaxy.civilizations, living.factions, layer.archaeologyChains, galaxy.currentYear ?? 0),
    ...initializeNarrative(layer.galaxy, layer.hubs, living.factions, false)
  };
}

function normalizeSnapshot(snapshot: SnapshotCurrent): SnapshotCurrent {
  const systemIds = new Set(snapshot.galaxy.systems.map((system) => system.id));
  const planetIds = new Set(snapshot.galaxy.systems.flatMap((system) => system.planets.map((planet) => planet.id)));
  const fallbackSystemId = systemIds.has(snapshot.galaxy.startSystemId) ? snapshot.galaxy.startSystemId : snapshot.galaxy.systems[0]?.id;
  if (!fallbackSystemId) throw new Error('В сохранении отсутствуют звёздные системы');

  snapshot.galaxy.systems.forEach((system) => system.planets.forEach((planet) => {
    planet.scanLevel = planet.scanLevel ?? (planet.scanned ? 1 : 0);
  }));

  const pointIds = new Set(snapshot.pointsOfInterest.map((point) => point.id));
  const evidenceIds = new Set(snapshot.evidence.map((entry) => entry.id));
  const crewIds = new Set<string>();
  const crew = snapshot.crew.filter((entry) => {
    if (crewIds.has(entry.id)) return false;
    crewIds.add(entry.id);
    return true;
  }).slice(0, 20).map((entry) => ({
    ...entry,
    health: Math.max(0, Math.min(entry.maxHealth, entry.health)),
    morale: Math.max(0, Math.min(100, entry.morale)),
    loyalty: Math.max(0, Math.min(100, entry.loyalty)),
    memories: entry.memories.slice(-20)
  }));

  const civilizationLayer = initializeCivilizationLayer(enrichGalaxyCivilizations(snapshot.galaxy as GameStateSnapshot['galaxy']), snapshot.hubs as GameStateSnapshot['hubs']);
  const normalized: SnapshotCurrent = {
    ...snapshot,
    galaxy: civilizationLayer.galaxy,
    currentSystemId: systemIds.has(snapshot.currentSystemId) ? snapshot.currentSystemId : fallbackSystemId,
    discoveries: snapshot.discoveries.filter((entry) => systemIds.has(entry.systemId)).slice(0, 7_500),
    logs: snapshot.logs.slice(0, 750),
    scanReports: snapshot.scanReports.filter((entry) => systemIds.has(entry.systemId) && (!entry.planetId || planetIds.has(entry.planetId))).slice(0, 3_000),
    pointsOfInterest: snapshot.pointsOfInterest.filter((entry) => systemIds.has(entry.systemId) && planetIds.has(entry.planetId)).slice(0, 5_000),
    evidence: snapshot.evidence.filter((entry) => pointIds.has(entry.pointOfInterestId)).slice(0, 10_000),
    hypotheses: snapshot.hypotheses.filter((entry) => pointIds.has(entry.pointOfInterestId)).map((entry) => ({ ...entry, evidenceIds: entry.evidenceIds.filter((id) => evidenceIds.has(id)) })).slice(0, 5_000),
    artifactKnowledge: snapshot.artifactKnowledge.filter((entry) => snapshot.galaxy.artifacts.some((artifact) => artifact.id === entry.artifactId)).slice(0, 2_000),
    crew,
    crewCandidates: snapshot.crewCandidates.filter((entry) => systemIds.has(entry.originSystemId) && !crewIds.has(entry.id)).slice(0, 12),
    factions: snapshot.factions.slice(0, 100),
    hubs: civilizationLayer.hubs.filter((hub) => systemIds.has(hub.systemId)).slice(0, 250),
    contracts: snapshot.contracts.filter((contract) => systemIds.has(contract.targetSystemId)).slice(0, 500),
    news: snapshot.news.filter((entry) => entry.systemIds.every((id) => systemIds.has(id))).slice(0, 500),
    locationStates: snapshot.locationStates.filter((entry) => pointIds.has(entry.pointOfInterestId)).slice(0, 5_000),
    currentHubId: snapshot.currentHubId && snapshot.hubs.some((hub) => hub.id === snapshot.currentHubId) ? snapshot.currentHubId : null,
    localNpcs: (snapshot.localNpcs.length ? snapshot.localNpcs : civilizationLayer.localNpcs).filter((npc) => civilizationLayer.hubs.some((hub) => hub.id === npc.hubId)).slice(0, 2_000),
    civilizationContacts: snapshot.civilizationContacts.length ? snapshot.civilizationContacts : civilizationLayer.civilizationContacts,
    archaeologyChains: snapshot.archaeologyChains.length ? snapshot.archaeologyChains : civilizationLayer.archaeologyChains,
    researchProjects: snapshot.researchProjects.filter((entry) => snapshot.galaxy.artifacts.some((artifact) => artifact.id === entry.artifactId)).slice(0, 100),
    technologyBlueprints: snapshot.technologyBlueprints.filter((entry) => snapshot.galaxy.artifacts.some((artifact) => artifact.id === entry.sourceArtifactId)).slice(0, 100),
    equipmentInventory: snapshot.equipmentInventory.slice(0, 250),
    worldThreads: snapshot.worldThreads.slice(0, 100),
    storyScenes: snapshot.storyScenes.filter((scene) => systemIds.has(scene.systemId)).slice(0, 160),
    pendingConsequences: snapshot.pendingConsequences.slice(0, 300),
    objectives: snapshot.objectives.filter((objective) => !objective.systemId || systemIds.has(objective.systemId)).slice(0, 250),
    tutorial: { ...snapshot.tutorial, currentStep: Math.max(0, Math.min(7, Math.floor(snapshot.tutorial.currentStep))) },
    activeShipEncounter: snapshot.activeShipEncounter && systemIds.has(snapshot.activeShipEncounter.contact.systemId) ? snapshot.activeShipEncounter : null,
    pursuits: snapshot.pursuits.filter((entry) => systemIds.has(entry.lastKnownSystemId)).slice(0, 100),
    warFronts: snapshot.warFronts.map((entry) => ({ ...entry, systemIds: entry.systemIds.filter((id) => systemIds.has(id)) })).filter((entry) => entry.systemIds.length > 0).slice(0, 50)
  };

  normalized.ship.systems = normalizeShipSystems(normalized.ship.systems);
  normalized.ship.transponder ||= 'WANDERER-01';
  normalized.ship.registration ||= 'VC-01-CORE';
  normalized.ship.hull = Math.max(0, Math.min(normalized.ship.maxHull, normalized.ship.hull));
  normalized.ship.fuel = Math.max(0, Math.min(normalized.ship.maxFuel, normalized.ship.fuel));
  normalized.captain.health = Math.max(0, Math.min(normalized.captain.maxHealth, normalized.captain.health));
  return normalized;
}

export interface ParseSnapshotOptions { verifyChecksum?: boolean; }

export function parseSnapshot(input: unknown, options: ParseSnapshotOptions = {}): GameStateSnapshot {
  const header = z.object({ schemaVersion: z.number().int() }).passthrough().parse(input);
  let migrated: SnapshotCurrent;

  if (header.schemaVersion === 1) {
    const legacy = snapshotV1Schema.parse(input);
    migrated = { ...legacy, ...emptyExploration(), ...emptyCrew(), ...livingState(legacy.galaxy), ...emptyWarfare(legacy.galaxy, livingState(legacy.galaxy).factions, legacy.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { savedAt: new Date().toISOString(), appVersion: APP_VERSION, sequence: 0, reason: 'migration-v1', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 2) {
    const legacy = snapshotV2Schema.parse(input);
    migrated = { ...legacy, ...emptyExploration(), ...emptyCrew(), ...livingState(legacy.galaxy), ...emptyWarfare(legacy.galaxy, livingState(legacy.galaxy).factions, legacy.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...legacy.saveMeta, appVersion: APP_VERSION, reason: 'migration-v2', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 3) {
    const previous = snapshotV3Schema.parse(input);
    migrated = { ...previous, ...emptyCrew(), ...livingState(previous.galaxy), ...emptyWarfare(previous.galaxy, livingState(previous.galaxy).factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v3', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 4) {
    const previous = snapshotV4Schema.parse(input);
    migrated = { ...previous, ...livingState(previous.galaxy), ...emptyWarfare(previous.galaxy, livingState(previous.galaxy).factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v4', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 5) {
    const previous = snapshotV5Schema.parse(input);
    const layer = initializeCivilizationLayer(previous.galaxy as GameStateSnapshot['galaxy'], previous.hubs as GameStateSnapshot['hubs']);
    migrated = { ...previous, galaxy: layer.galaxy, hubs: layer.hubs, localNpcs: layer.localNpcs, civilizationContacts: layer.civilizationContacts, archaeologyChains: layer.archaeologyChains, researchProjects: [], technologyBlueprints: [], equipmentInventory: livingState(previous.galaxy).equipmentInventory, worldThreads: initializeWorldThreads(layer.galaxy.civilizations, previous.factions, layer.archaeologyChains, previous.gameYear), ...initializeNarrative(layer.galaxy, layer.hubs, previous.factions as GameStateSnapshot['factions'], false), ...emptyWarfare(layer.galaxy, previous.factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v5', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 6) {
    const previous = snapshotV6Schema.parse(input);
    const threads = initializeWorldThreads(previous.galaxy.civilizations, previous.factions, previous.archaeologyChains, previous.gameYear);
    migrated = { ...previous, researchProjects: [], technologyBlueprints: [], equipmentInventory: livingState(previous.galaxy).equipmentInventory, worldThreads: threads, ...initializeNarrative(previous.galaxy as GameStateSnapshot['galaxy'], previous.hubs as GameStateSnapshot['hubs'], previous.factions as GameStateSnapshot['factions'], false), ...emptyWarfare(previous.galaxy, previous.factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v6', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 7) {
    const previous = snapshotV7Schema.parse(input);
    const narrative = initializeNarrative(previous.galaxy as GameStateSnapshot['galaxy'], previous.hubs as GameStateSnapshot['hubs'], previous.factions as GameStateSnapshot['factions'], false);
    migrated = { ...previous, ...narrative, ...emptyWarfare(previous.galaxy, previous.factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v7', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 8) {
    const previous = snapshotV8Schema.parse(input);
    const warfare = emptyWarfare(previous.galaxy, previous.factions, previous.gameYear);
    migrated = { ...previous, ship: { ...previous.ship, systems: normalizeShipSystems(previous.ship.systems), transponder: previous.ship.transponder || 'WANDERER-01', registration: previous.ship.registration || 'VC-01-CORE' }, ...warfare, schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v8', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {
    migrated = snapshotV9Schema.parse(input);
    if (options.verifyChecksum !== false) {
      const expected = computeSnapshotChecksum(migrated);
      if (migrated.saveMeta.checksum !== expected) throw new Error('Контрольная сумма сохранения не совпадает');
    }
  } else if (header.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Сохранение создано более новой версией игры: v${header.schemaVersion}`);
  } else {
    throw new Error(`Неподдерживаемая версия сохранения: v${header.schemaVersion}`);
  }

  const normalized = normalizeSnapshot(migrated);
  normalized.saveMeta.checksum = computeSnapshotChecksum(normalized);
  return normalized as GameStateSnapshot;
}

export function prepareSnapshotForSave(input: GameStateSnapshot, reason: string, previous?: SaveMetadata): GameStateSnapshot {
  const safe = parseSnapshot(input, { verifyChecksum: false }) as SnapshotCurrent;
  safe.schemaVersion = CURRENT_SCHEMA_VERSION;
  safe.saveMeta = {
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    sequence: (previous?.sequence ?? safe.saveMeta.sequence ?? 0) + 1,
    reason,
    checksum: '00000000'
  };
  safe.saveMeta.checksum = computeSnapshotChecksum(safe);
  return safe as GameStateSnapshot;
}

export function getSnapshotVersion(input: unknown): number | null {
  const result = z.object({ schemaVersion: z.number().int() }).passthrough().safeParse(input);
  return result.success ? result.data.schemaVersion : null;
}

export function snapshotErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return `Сохранение повреждено или устарело: ${first?.path.join('.') || 'неизвестное поле'} — ${first?.message || 'ошибка данных'}`;
  }
  return error instanceof Error ? error.message : 'Не удалось прочитать сохранение';
}
