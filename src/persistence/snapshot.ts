import { z } from 'zod';
import type { GameStateSnapshot, SaveMetadata } from '../game/types';
import { APP_VERSION, SAVE_SCHEMA_VERSION } from '../version';
import { initializeLivingGalaxy } from '../world/livingGalaxy';
import { enrichGalaxyCivilizations, initializeCivilizationLayer } from '../world/civilizations';
import { initializeWorldThreads } from '../world/storyThreads';
import { initializeNarrative } from '../narrative/encounters';
import { createShipSystems, initializeWarFronts, normalizeShipSystems } from '../world/warfare';
import { createInitialLegacy } from '../world/legacy';
import { initializeSimulation, upgradeSimulationPersistence } from '../simulation/kernel';
import { repairSimulationPersistence } from '../simulation/integrity';
import { createKnowledgeFromLegacy, projectKnowledgeToGalaxy } from '../simulation/knowledge';
import { projectWorldThreads } from '../simulation/projections';
import { worldYear } from '../simulation/clock';

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
  alive: z.boolean(),
  condition: z.enum(['active','dead','missing','captured','coma','stranded','retired']).default('active'),
  commandIdentity: z.preprocess(() => 'organic', z.literal('organic'))
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
  lastVisitedYear: finiteNumber.optional(),
  access: z.enum(['surface','orbital','remote']).default('surface')
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
  id: z.string(), category: z.enum(['politics','discovery','conflict','culture','research','crew','ecology']),
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


const captainLegacyRecordSchema = z.object({
  id: z.string(), captainId: z.string(), name: z.string(), commandIdentity: z.preprocess(() => 'organic', z.literal('organic')), startedYear: finiteNumber,
  endedYear: finiteNumber.optional(), fate: z.enum(['active','dead','missing','captured','coma','stranded','retired']).optional(), finalSystemId: z.string().optional(),
  shipName: z.string(), systemsVisited: finiteNumber, discoveries: finiteNumber, battles: finiteNumber, reputation: finiteNumber,
  epitaph: z.string().optional(), memorialId: z.string().optional()
});
const successionCandidateSchema = z.object({ id: z.string(), source: z.literal('crew'), sourceId: z.string(), name: z.string(), role: z.string(), loyalty: finiteNumber, eligible: z.boolean(), consequences: z.array(z.string()) });
const lostExpeditionSchema = z.object({ id: z.string(), year: finiteNumber, systemId: z.string(), pointOfInterestId: z.string().optional(), captainRecordId: z.string(), crewIds: z.array(z.string()), cargoIds: z.array(z.string()), status: z.enum(['unrecovered','recovered','lost']), summary: z.string(), recoveredYear: finiteNumber.optional() });
const memorialSchema = z.object({ id: z.string(), captainRecordId: z.string(), type: z.enum(['space','archive','homeworld','hidden']), year: finiteNumber, systemId: z.string(), text: z.string(), public: z.boolean() });
const chronicleEntrySchema = z.object({ id: z.string(), year: finiteNumber, category: z.enum(['command','death','succession','discovery','war','memorial','recovery','world']), title: z.string(), text: z.string(), tone: z.enum(['info','good','warning','danger']), captainRecordId: z.string().optional(), systemId: z.string().optional() });
const legacyStateSchema = z.object({
  mode: z.enum(['active','succession','chronicle']), campaignEnded: z.boolean(), continuityReason: z.string().optional(), currentCaptainRecordId: z.string(),
  captains: z.array(captainLegacyRecordSchema), successionCandidates: z.array(successionCandidateSchema), lostExpeditions: z.array(lostExpeditionSchema),
  memorials: z.array(memorialSchema), chronicle: z.array(chronicleEntrySchema), observerYear: finiteNumber
});


const simulationEventKindSchema = z.enum(['demography','migration','economy','shortage','conflict','politics','research','discovery','disaster','ecology']);
const worldEventSchema = z.object({
  id: z.string(), atHour: finiteNumber, kind: simulationEventKindSchema, title: z.string(), summary: z.string(), severity: finiteNumber,
  visibility: z.enum(['public','local','hidden']), systemIds: z.array(z.string()), civilizationIds: z.array(z.string()), factionIds: z.array(z.string()),
  tags: z.array(z.string()), data: z.record(z.string(), z.union([z.string(), finiteNumber, z.boolean()])).optional()
});
const scheduledEventV1Schema = z.object({
  id: z.string(), kind: z.enum(['civilization-cycle','faction-cycle','system-cycle','war-cycle','ecology-cycle','settlement-cycle','trade-cycle','migration-cycle']), dueHour: finiteNumber,
  repeatHours: finiteNumber.optional(), entityId: z.string().optional(), seedKey: z.string()
});
const scheduledEventV2Schema = z.object({
  id: z.string(), kind: z.enum(['civilization-cycle','faction-cycle','system-cycle','war-cycle','ecology-cycle','settlement-cycle','trade-cycle','migration-cycle']), dueHour: finiteNumber,
  repeatHours: finiteNumber.optional(), entityId: z.string().optional(), seedKey: z.string()
});
const simulationSystemSchema = z.object({
  systemId: z.string(), population: finiteNumber, prosperity: finiteNumber, security: finiteNumber, supply: finiteNumber,
  tradePressure: finiteNumber, migrationPressure: finiteNumber, lastUpdatedHour: finiteNumber
});
const simulationCivilizationSchema = z.object({
  civilizationId: z.string(), population: finiteNumber, stability: finiteNumber, economy: finiteNumber, military: finiteNumber,
  research: finiteNumber, cohesion: finiteNumber, expansionPressure: finiteNumber, alive: z.boolean(), lastUpdatedHour: finiteNumber
});
const simulationFactionSchema = z.object({
  factionId: z.string(), wealth: finiteNumber, military: finiteNumber, research: finiteNumber, influence: finiteNumber, tension: finiteNumber, lastUpdatedHour: finiteNumber
});
const biomeTypeSchema = z.enum(['oceanic','coastal','forest','grassland','desert','tundra','wetland','cavern','volcanic','toxic','crystal','aerial','artificial']);
const trophicLevelSchema = z.enum(['producer','grazer','predator','scavenger','decomposer','parasite']);
const speciesStatusSchema = z.enum(['thriving','stable','declining','threatened','extinct']);
const ecosystemBiomeSchema = z.object({
  id: z.string(), name: z.string(), type: biomeTypeSchema, coverage: finiteNumber, temperature: finiteNumber, humidity: finiteNumber,
  productivity: finiteNumber, hazard: finiteNumber, resourceTags: z.array(z.string())
});
const ecosystemSpeciesSchema = z.object({
  id: z.string(), name: z.string(), biomeIds: z.array(z.string()), trophicLevel: trophicLevelSchema, abundance: finiteNumber,
  resilience: finiteNumber, mobility: finiteNumber, aggression: finiteNumber, toxicity: finiteNumber, traits: z.array(z.string()),
  preyIds: z.array(z.string()), predatorIds: z.array(z.string()), status: speciesStatusSchema
});
const ecosystemPathogenSchema = z.object({
  id: z.string(), name: z.string(), hostSpeciesIds: z.array(z.string()), virulence: finiteNumber, spread: finiteNumber, lethality: finiteNumber, active: z.boolean()
});
const planetEcologySchema = z.object({
  planetId: z.string(), climateStability: finiteNumber, biomass: finiteNumber, biodiversity: finiteNumber, resilience: finiteNumber,
  contamination: finiteNumber, carryingCapacity: finiteNumber,
  resources: z.object({ biomass: finiteNumber, medicinal: finiteNumber, organics: finiteNumber, rareCompounds: finiteNumber }),
  biomes: z.array(ecosystemBiomeSchema), species: z.array(ecosystemSpeciesSchema), pathogens: z.array(ecosystemPathogenSchema),
  extinctSpeciesIds: z.array(z.string()), invasiveSpeciesIds: z.array(z.string()), cycle: finiteNumber, lastUpdatedHour: finiteNumber
});
const simulationStateV1Schema = z.object({
  version: z.literal(1), clock: z.object({ absoluteHour: finiteNumber, epochYear: finiteNumber }),
  systems: z.record(z.string(), simulationSystemSchema), civilizations: z.record(z.string(), simulationCivilizationSchema), factions: z.record(z.string(), simulationFactionSchema),
  scheduledEvents: z.array(scheduledEventV1Schema), events: z.array(worldEventSchema), nextSequence: finiteNumber, lastAdvanceReason: z.string()
});
const settlementKindSchema = z.enum(['city','orbital','mining','research','military','trade','illegal','colony','abandoned']);
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

const simulationStateV2Schema = z.object({
  version: z.literal(2), clock: z.object({ absoluteHour: finiteNumber, epochYear: finiteNumber }),
  systems: z.record(z.string(), simulationSystemSchema), civilizations: z.record(z.string(), simulationCivilizationSchema), factions: z.record(z.string(), simulationFactionSchema),
  ecosystems: z.record(z.string(), planetEcologySchema),
  settlements: z.record(z.string(), settlementStateSchema).default({}),
  populationGroups: z.record(z.string(), populationGroupStateSchema).default({}),
  tradeRoutes: z.record(z.string(), tradeRouteStateSchema).default({}),
  scheduledEvents: z.array(scheduledEventV2Schema), events: z.array(worldEventSchema),
  nextSequence: finiteNumber, lastAdvanceReason: z.string()
});
const simulationStateV3Schema = simulationStateV2Schema.extend({
  version: z.literal(3),
  settlements: z.record(z.string(), settlementStateSchema),
  populationGroups: z.record(z.string(), populationGroupStateSchema),
  tradeRoutes: z.record(z.string(), tradeRouteStateSchema),
  scheduledEvents: z.array(scheduledEventV2Schema)
});
const knowledgeRecordSchema = z.object({
  entityId: z.string(), entityType: z.enum(['system','planet','civilization','faction','hub','artifact','ecosystem','species','settlement','populationGroup','tradeRoute']), confidence: finiteNumber,
  discoveredAtHour: finiteNumber, lastConfirmedAtHour: finiteNumber, source: z.enum(['direct','scan','contact','news','archive','rumor']), knownFields: z.array(z.string())
});
const playerKnowledgeSchema = z.object({ version: z.literal(1), records: z.record(z.string(), knowledgeRecordSchema) });


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
const v10PayloadSchema = v9PayloadSchema.extend({ legacy: legacyStateSchema });
const v11PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateV1Schema, knowledge: playerKnowledgeSchema });
const v12PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateV2Schema, knowledge: playerKnowledgeSchema });
const v13PayloadSchema = v10PayloadSchema.extend({ simulation: simulationStateV3Schema, knowledge: playerKnowledgeSchema });

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
const snapshotV10Schema = v10PayloadSchema.extend({ schemaVersion: z.literal(10), saveMeta: saveMetadataSchema });
const snapshotV11Schema = v11PayloadSchema.extend({ schemaVersion: z.literal(11), saveMeta: saveMetadataSchema });
const snapshotV12Schema = v12PayloadSchema.extend({ schemaVersion: z.literal(12), saveMeta: saveMetadataSchema });
const snapshotV13Schema = v13PayloadSchema.extend({ schemaVersion: z.literal(13), saveMeta: saveMetadataSchema });

type SnapshotCurrent = z.infer<typeof snapshotV13Schema>;

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
function emptyLegacy(captain: z.infer<typeof captainSchema>, ship: z.infer<typeof shipSchema>, year: number, systemId: string) { return { legacy: createInitialLegacy(captain as GameStateSnapshot['captain'], ship as GameStateSnapshot['ship'], year, systemId) }; }
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
  snapshot = {
    ...snapshot,
    simulation: repairSimulationPersistence(snapshot.simulation, {
      galaxy: civilizationLayer.galaxy,
      factions: snapshot.factions,
      hubs: civilizationLayer.hubs
    })
  };
  const validEntityIds = new Set<string>([
    ...systemIds,
    ...planetIds,
    ...civilizationLayer.galaxy.civilizations.map((entry) => entry.id),
    ...snapshot.factions.map((entry) => entry.id),
    ...civilizationLayer.hubs.map((entry) => entry.id),
    ...civilizationLayer.galaxy.artifacts.map((entry) => entry.id),
    ...Object.keys(snapshot.simulation.ecosystems),
    ...Object.values(snapshot.simulation.ecosystems).flatMap((entry) => entry.species.map((species) => species.id)),
    ...Object.keys(snapshot.simulation.settlements),
    ...Object.keys(snapshot.simulation.populationGroups),
    ...Object.keys(snapshot.simulation.tradeRoutes)
  ]);
  const knowledge = {
    ...snapshot.knowledge,
    records: Object.fromEntries(Object.entries(snapshot.knowledge.records).filter(([, record]) => validEntityIds.has(record.entityId)))
  };
  const simulation = {
    ...snapshot.simulation,
    clock: { epochYear: snapshot.simulation.clock.epochYear, absoluteHour: Math.max(0, Math.floor(snapshot.simulation.clock.absoluteHour)) },
    systems: Object.fromEntries(Object.entries(snapshot.simulation.systems).filter(([id]) => systemIds.has(id))),
    civilizations: Object.fromEntries(Object.entries(snapshot.simulation.civilizations).filter(([id]) => civilizationLayer.galaxy.civilizations.some((entry) => entry.id === id))),
    factions: Object.fromEntries(Object.entries(snapshot.simulation.factions).filter(([id]) => snapshot.factions.some((entry) => entry.id === id))),
    ecosystems: Object.fromEntries(Object.entries(snapshot.simulation.ecosystems).filter(([id]) => planetIds.has(id))),
    scheduledEvents: snapshot.simulation.scheduledEvents.slice(0, 10_000),
    events: snapshot.simulation.events.slice(0, 1_000),
    nextSequence: Math.max(1, Math.floor(snapshot.simulation.nextSequence))
  };
  const projectedGalaxy = projectKnowledgeToGalaxy({ ...civilizationLayer.galaxy, currentYear: worldYear(simulation.clock) }, knowledge);
  const normalized: SnapshotCurrent = {
    ...snapshot,
    simulation,
    knowledge,
    galaxy: projectedGalaxy,
    gameYear: worldYear(simulation.clock),
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
    worldThreads: projectWorldThreads({ simulation, warFronts: snapshot.warFronts, factions: snapshot.factions, contracts: snapshot.contracts, research: snapshot.researchProjects }),
    storyScenes: snapshot.storyScenes.filter((scene) => systemIds.has(scene.systemId)).slice(0, 160),
    pendingConsequences: snapshot.pendingConsequences.slice(0, 300),
    objectives: snapshot.objectives.filter((objective) => !objective.systemId || systemIds.has(objective.systemId)).slice(0, 250),
    tutorial: { ...snapshot.tutorial, currentStep: Math.max(0, Math.min(7, Math.floor(snapshot.tutorial.currentStep))) },
    activeShipEncounter: snapshot.activeShipEncounter && systemIds.has(snapshot.activeShipEncounter.contact.systemId) ? snapshot.activeShipEncounter : null,
    pursuits: snapshot.pursuits.filter((entry) => systemIds.has(entry.lastKnownSystemId)).slice(0, 100),
    warFronts: snapshot.warFronts.map((entry) => ({ ...entry, systemIds: entry.systemIds.filter((id) => systemIds.has(id)) })).filter((entry) => entry.systemIds.length > 0).slice(0, 50),
    legacy: {
      ...snapshot.legacy,
      captains: snapshot.legacy.captains.slice(-100),
      successionCandidates: snapshot.legacy.successionCandidates.filter((entry) => entry.source === 'crew').slice(0, 12),
      lostExpeditions: snapshot.legacy.lostExpeditions.filter((entry) => systemIds.has(entry.systemId)).slice(0, 100),
      memorials: snapshot.legacy.memorials.filter((entry) => systemIds.has(entry.systemId)).slice(0, 200),
      chronicle: snapshot.legacy.chronicle.slice(0, 1000),
      observerYear: Math.max(snapshot.gameYear, snapshot.legacy.observerYear)
    }
  };

  normalized.ship.systems = normalizeShipSystems(normalized.ship.systems);
  normalized.ship.transponder ||= 'WANDERER-01';
  normalized.ship.registration ||= 'VC-01-CORE';
  normalized.ship.hull = Math.max(0, Math.min(normalized.ship.maxHull, normalized.ship.hull));
  normalized.ship.fuel = Math.max(0, Math.min(normalized.ship.maxFuel, normalized.ship.fuel));
  normalized.captain.health = Math.max(0, Math.min(normalized.captain.maxHealth, normalized.captain.health));
  normalized.captain.condition ||= normalized.captain.alive ? 'active' : 'dead';
  normalized.captain.commandIdentity = 'organic';
  return normalized;
}

export interface ParseSnapshotOptions { verifyChecksum?: boolean; }

function sanitizeRetiredContinuation(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const sanitized = structuredClone(input) as Record<string, any>;
  const captain = sanitized.captain as Record<string, any> | undefined;
  const ship = sanitized.ship as Record<string, any> | undefined;
  const legacy = sanitized.legacy as Record<string, any> | undefined;
  const retiredContinuation = captain?.commandIdentity === 'shipAI' || legacy?.mode === 'ai';
  if (ship) delete ship.aiCore;
  if (captain) captain.commandIdentity = 'organic';
  if (legacy) {
    if (legacy.mode === 'ai') legacy.mode = 'succession';
    legacy.captains = Array.isArray(legacy.captains) ? legacy.captains.map((record: Record<string, any>) => ({ ...record, commandIdentity: 'organic' })) : [];
    legacy.successionCandidates = Array.isArray(legacy.successionCandidates) ? legacy.successionCandidates.filter((candidate: Record<string, any>) => candidate.source === 'crew') : [];
    delete legacy.aiTurns;
  }
  if (retiredContinuation) {
    if (captain) { captain.alive = false; captain.health = 0; captain.condition = 'dead'; }
    if (legacy) {
      legacy.mode = 'succession';
      legacy.campaignEnded = true;
      legacy.continuityReason ||= 'Капитан погиб. Кампания завершена по правилам ironman.';
      legacy.successionCandidates = [];
    }
  }
  return sanitized;
}

export function parseSnapshot(input: unknown, options: ParseSnapshotOptions = {}): GameStateSnapshot {
  const rawInput = input;
  input = sanitizeRetiredContinuation(input);
  const header = z.object({ schemaVersion: z.number().int() }).passthrough().parse(input);
  let migrated: any;

  if (header.schemaVersion === 1) {
    const legacy = snapshotV1Schema.parse(input);
    migrated = { ...legacy, ...emptyExploration(), ...emptyCrew(), ...livingState(legacy.galaxy), ...emptyWarfare(legacy.galaxy, livingState(legacy.galaxy).factions, legacy.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { savedAt: new Date().toISOString(), appVersion: APP_VERSION, sequence: 0, reason: 'migration-v1', checksum: '00000000' } };
    migrated = { ...migrated, ...emptyLegacy(migrated.captain, migrated.ship, migrated.gameYear, migrated.currentSystemId) };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 2) {
    const legacy = snapshotV2Schema.parse(input);
    migrated = { ...legacy, ...emptyExploration(), ...emptyCrew(), ...livingState(legacy.galaxy), ...emptyWarfare(legacy.galaxy, livingState(legacy.galaxy).factions, legacy.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...legacy.saveMeta, appVersion: APP_VERSION, reason: 'migration-v2', checksum: '00000000' } };
    migrated = { ...migrated, ...emptyLegacy(migrated.captain, migrated.ship, migrated.gameYear, migrated.currentSystemId) };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 3) {
    const previous = snapshotV3Schema.parse(input);
    migrated = { ...previous, ...emptyCrew(), ...livingState(previous.galaxy), ...emptyWarfare(previous.galaxy, livingState(previous.galaxy).factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v3', checksum: '00000000' } };
    migrated = { ...migrated, ...emptyLegacy(migrated.captain, migrated.ship, migrated.gameYear, migrated.currentSystemId) };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 4) {
    const previous = snapshotV4Schema.parse(input);
    migrated = { ...previous, ...livingState(previous.galaxy), ...emptyWarfare(previous.galaxy, livingState(previous.galaxy).factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v4', checksum: '00000000' } };
    migrated = { ...migrated, ...emptyLegacy(migrated.captain, migrated.ship, migrated.gameYear, migrated.currentSystemId) };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 5) {
    const previous = snapshotV5Schema.parse(input);
    const layer = initializeCivilizationLayer(previous.galaxy as GameStateSnapshot['galaxy'], previous.hubs as GameStateSnapshot['hubs']);
    migrated = { ...previous, galaxy: layer.galaxy, hubs: layer.hubs, localNpcs: layer.localNpcs, civilizationContacts: layer.civilizationContacts, archaeologyChains: layer.archaeologyChains, researchProjects: [], technologyBlueprints: [], equipmentInventory: livingState(previous.galaxy).equipmentInventory, worldThreads: initializeWorldThreads(layer.galaxy.civilizations, previous.factions, layer.archaeologyChains, previous.gameYear), ...initializeNarrative(layer.galaxy, layer.hubs, previous.factions as GameStateSnapshot['factions'], false), ...emptyWarfare(layer.galaxy, previous.factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v5', checksum: '00000000' } };
    migrated = { ...migrated, ...emptyLegacy(migrated.captain, migrated.ship, migrated.gameYear, migrated.currentSystemId) };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 6) {
    const previous = snapshotV6Schema.parse(input);
    const threads = initializeWorldThreads(previous.galaxy.civilizations, previous.factions, previous.archaeologyChains, previous.gameYear);
    migrated = { ...previous, researchProjects: [], technologyBlueprints: [], equipmentInventory: livingState(previous.galaxy).equipmentInventory, worldThreads: threads, ...initializeNarrative(previous.galaxy as GameStateSnapshot['galaxy'], previous.hubs as GameStateSnapshot['hubs'], previous.factions as GameStateSnapshot['factions'], false), ...emptyWarfare(previous.galaxy, previous.factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v6', checksum: '00000000' } };
    migrated = { ...migrated, ...emptyLegacy(migrated.captain, migrated.ship, migrated.gameYear, migrated.currentSystemId) };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 7) {
    const previous = snapshotV7Schema.parse(input);
    const narrative = initializeNarrative(previous.galaxy as GameStateSnapshot['galaxy'], previous.hubs as GameStateSnapshot['hubs'], previous.factions as GameStateSnapshot['factions'], false);
    migrated = { ...previous, ...narrative, ...emptyWarfare(previous.galaxy, previous.factions, previous.gameYear), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v7', checksum: '00000000' } };
    migrated = { ...migrated, ...emptyLegacy(migrated.captain, migrated.ship, migrated.gameYear, migrated.currentSystemId) };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 8) {
    const previous = snapshotV8Schema.parse(input);
    const warfare = emptyWarfare(previous.galaxy, previous.factions, previous.gameYear);
    migrated = { ...previous, ship: { ...previous.ship, systems: normalizeShipSystems(previous.ship.systems), transponder: previous.ship.transponder || 'WANDERER-01', registration: previous.ship.registration || 'VC-01-CORE' }, ...warfare, schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v8', checksum: '00000000' } };
    migrated = { ...migrated, ...emptyLegacy(migrated.captain, migrated.ship, migrated.gameYear, migrated.currentSystemId) };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 9) {
    const previous = snapshotV9Schema.parse(input);
    migrated = { ...previous, ...emptyLegacy(previous.captain, previous.ship, previous.gameYear, previous.currentSystemId), schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v9', checksum: '00000000' } };
    migrated.saveMeta.checksum = computeSnapshotChecksum(migrated);
  } else if (header.schemaVersion === 10) {
    const previous = snapshotV10Schema.parse(input);
    migrated = { ...previous, schemaVersion: CURRENT_SCHEMA_VERSION, saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v10', checksum: '00000000' } };
  } else if (header.schemaVersion === 11) {
    const previous = snapshotV11Schema.parse(input);
    const simulation = upgradeSimulationPersistence(previous.simulation as any, {
      seed: previous.galaxy.seed,
      galaxy: previous.galaxy as GameStateSnapshot['galaxy'],
      factions: previous.factions as GameStateSnapshot['factions'],
      hubs: previous.hubs as GameStateSnapshot['hubs']
    });
    migrated = {
      ...previous,
      simulation,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v11-ecology', checksum: '00000000' }
    };
  } else if (header.schemaVersion === 12) {
    const previous = snapshotV12Schema.parse(input);
    const simulation = upgradeSimulationPersistence(previous.simulation as any, {
      seed: previous.galaxy.seed,
      galaxy: previous.galaxy as GameStateSnapshot['galaxy'],
      factions: previous.factions as GameStateSnapshot['factions'],
      hubs: previous.hubs as GameStateSnapshot['hubs']
    });
    migrated = {
      ...previous,
      simulation,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      saveMeta: { ...previous.saveMeta, appVersion: APP_VERSION, reason: 'migration-v12-persistence-v3', checksum: '00000000' }
    };
  } else if (header.schemaVersion === CURRENT_SCHEMA_VERSION) {
    migrated = snapshotV13Schema.parse(input);
    if (options.verifyChecksum !== false) {
      const expected = computeSnapshotChecksum(migrated);
      if (migrated.saveMeta.checksum !== expected) {
        const raw = rawInput as SnapshotCurrent;
        const rawExpected = hashText(JSON.stringify({ ...raw, saveMeta: { ...raw.saveMeta, checksum: '00000000' } }));
        if (raw.saveMeta?.checksum !== rawExpected) throw new Error('Контрольная сумма сохранения не совпадает');
      }
    }
  } else if (header.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Сохранение создано более новой версией игры: v${header.schemaVersion}`);
  } else {
    throw new Error(`Неподдерживаемая версия сохранения: v${header.schemaVersion}`);
  }

  if (!migrated.simulation || !migrated.knowledge) {
    const simulation = initializeSimulation({ seed: migrated.galaxy.seed, galaxy: migrated.galaxy, factions: migrated.factions, hubs: migrated.hubs }, Math.max(0, Math.floor((migrated.gameYear ?? 0) * 365 * 24)));
    const knowledge = createKnowledgeFromLegacy(migrated.galaxy, simulation.clock.absoluteHour);
    const galaxy = projectKnowledgeToGalaxy({ ...migrated.galaxy, currentYear: worldYear(simulation.clock) }, knowledge);
    migrated = {
      ...migrated,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      simulation,
      knowledge,
      galaxy,
      gameYear: worldYear(simulation.clock),
      worldThreads: projectWorldThreads({ simulation, warFronts: migrated.warFronts ?? [], factions: migrated.factions ?? [], contracts: migrated.contracts ?? [], research: migrated.researchProjects ?? [] }),
      saveMeta: { ...migrated.saveMeta, appVersion: APP_VERSION, checksum: '00000000' }
    };
  }
  if (migrated.simulation?.version !== 3 || !migrated.simulation?.ecosystems || Object.keys(migrated.simulation?.settlements ?? {}).length === 0) {
    migrated.simulation = upgradeSimulationPersistence(migrated.simulation, {
      seed: migrated.galaxy.seed,
      galaxy: migrated.galaxy,
      factions: migrated.factions,
      hubs: migrated.hubs
    });
    migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
    migrated.saveMeta = { ...migrated.saveMeta, appVersion: APP_VERSION, checksum: '00000000' };
  }
  const normalized = normalizeSnapshot(snapshotV13Schema.parse(migrated));
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
