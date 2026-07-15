import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Не найден файл: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function write(path, content) { fs.writeFileSync(path, content, 'utf8'); }
function replaceRequired(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) throw new Error(`Не удалось применить ${label}: исходный фрагмент не найден`);
  return content.replace(search, replacement);
}

// 1. Extend the shared game types without replacing the entire large file.
{
  const path = 'src/game/types.ts';
  let content = read(path);
  const marker = "export type PointOfInterestAccess = 'surface' | 'orbital' | 'remote';";
  const insertion = `${marker}\nexport type ExpeditionObjectiveKind =\n  | 'recover-artifact'\n  | 'restore-archive'\n  | 'determine-cause'\n  | 'recover-black-box'\n  | 'rescue-survivors'\n  | 'collect-sample'\n  | 'disable-system'\n  | 'document-site'\n  | 'establish-contact'\n  | 'investigate-anomaly';\nexport interface ExpeditionObjective {\n  kind: ExpeditionObjectiveKind;\n  title: string;\n  description: string;\n  requiredObjects: number;\n  requiredEvidence: number;\n  requiresArtifact?: boolean;\n  completionText: string;\n}`;
  content = replaceRequired(content, marker, insertion, 'типов лорной экспедиции');

  const poiMarker = `  lastVisitedYear?: number;\n  access: PointOfInterestAccess;\n}`;
  const poiFields = `  lastVisitedYear?: number;\n  access: PointOfInterestAccess;\n  confirmedSummary?: string;\n  completionSummary?: string;\n  sourceEventIds?: string[];\n  historicalSettlementId?: string;\n  ruinId?: string;\n  warId?: string;\n  artifactIds?: string[];\n  figureIds?: string[];\n  polityIds?: string[];\n  archiveId?: string;\n  loreTags?: string[];\n  objective?: ExpeditionObjective;\n}`;
  content = replaceRequired(content, poiMarker, poiFields, 'ссылок точки интереса на историю');

  const resultMarker = `  locationState: LocationState;\n  defeatedEnemyIds: string[];\n}`;
  const resultFields = `  locationState: LocationState;\n  defeatedEnemyIds: string[];\n  objectiveProgress?: number;\n  objectiveTotal?: number;\n  revealedEventIds?: string[];\n}`;
  content = replaceRequired(content, resultMarker, resultFields, 'результата лорной экспедиции');
  write(path, content);
}

// 2. Never substitute an unrelated artifact into an expedition.
{
  const path = 'src/App.tsx';
  let content = read(path);
  const oldFunction = `function artifactForPoint(point: PointOfInterest, artifacts: Artifact[]) {\n  return artifacts.find((entry) => entry.civilizationId === point.civilizationId && !entry.discovered) ?? artifacts.find((entry) => !entry.discovered);\n}`;
  const newFunction = `function artifactForPoint(point: PointOfInterest, artifacts: Artifact[]) {\n  return (point.artifactIds ?? [])\n    .map((id) => artifacts.find((entry) => entry.id === id))\n    .find((entry): entry is Artifact => Boolean(entry && !entry.discovered));\n}`;
  content = replaceRequired(content, oldFunction, newFunction, 'привязки артефакта к локации');
  write(path, content);
}

// 3. Feed completed field work back into progressive knowledge and contracts.
{
  const path = 'src/game/store.ts';
  let content = read(path);

  content = replaceRequired(
    content,
    `import { generatePointsOfInterest } from '../exploration/pointsOfInterest';`,
    `import { generatePointsOfInterest, refreshLoreboundPoints } from '../exploration/pointsOfInterest';`,
    'импорта обновления старых точек интереса'
  );
  const scanBlock = `      const existing = state.pointsOfInterest.filter((entry) => entry.planetId === planetId);
      const generated = existing.length > 0 ? existing : generatePointsOfInterest(projectedGalaxy ?? galaxy, projectedSystem, projectedPlanet).map((entry) => ({ ...entry, discoveredYear: nextYear }));
      const allPoints = existing.length > 0 ? state.pointsOfInterest : [...generated, ...state.pointsOfInterest];`;
  const loreScanBlock = `      const existing = state.pointsOfInterest.filter((entry) => entry.planetId === planetId);
      const generated = refreshLoreboundPoints(projectedGalaxy ?? galaxy, projectedSystem, projectedPlanet, existing)
        .map((entry) => existing.some((previous) => previous.id === entry.id) ? entry : { ...entry, discoveredYear: nextYear });
      const allPoints = [...generated, ...state.pointsOfInterest.filter((entry) => entry.planetId !== planetId)];`;
  content = replaceRequired(content, scanBlock, loreScanBlock, 'перепривязки старых не посещённых сигналов');
  const knowledgeMarker = `      const newDiscoveries = [...state.discoveries];\n      let playerKnowledge = state.knowledge;\n\n      if (result.artifact`;
  const knowledgePatch = `      const newDiscoveries = [...state.discoveries];\n      let playerKnowledge = state.knowledge;\n      if (result.outcome === 'resolved') {\n        const confirmedAt = advanced.patch.simulation?.clock.absoluteHour ?? state.simulation.clock.absoluteHour;\n        playerKnowledge = revealKnowledge(playerKnowledge, 'system', point.systemId, ['history', 'expedition', 'localEvents'], confirmedAt, 'direct', 94);\n        if (point.civilizationId) {\n          playerKnowledge = revealKnowledge(playerKnowledge, 'civilization', point.civilizationId, ['history', 'culture', 'artifacts'], confirmedAt, 'archive', 90);\n        }\n        for (const artifactId of point.artifactIds ?? []) {\n          playerKnowledge = revealKnowledge(playerKnowledge, 'artifact', artifactId, ['identity', 'location', 'history'], confirmedAt, 'direct', 84);\n        }\n      }\n\n      if (result.artifact`;
  content = replaceRequired(content, knowledgeMarker, knowledgePatch, 'раскрытия знаний после экспедиции');

  content = replaceRequired(
    content,
    `description: 'Объект извлечён. Назначение и происхождение требуют анализа.',`,
    `description: point.confirmedSummary ?? 'Объект извлечён. Назначение и происхождение требуют анализа.',`,
    'описания найденного артефакта'
  );
  content = replaceRequired(
    content,
    `description: \`${'${newEvidence.length}'} новых улик. Гипотеза: ${'${hypothesis.title}'}.\`,`,
    `description: result.outcome === 'resolved' ? (point.completionSummary ?? point.confirmedSummary ?? \`${'${newEvidence.length}'} улик подтвердили задачу «${'${hypothesis.title}'}».\`) : \`${'${newEvidence.length}'} новых улик. Гипотеза: ${'${hypothesis.title}'}.\`,`,
    'полевого описания'
  );
  content = replaceRequired(
    content,
    `logs.unshift(makeLog(gameYear, \`Экспедиция: ${'${point.name}'}\`, \`Получено улик: ${'${newEvidence.length}'}. Статус гипотезы: ${'${hypothesis.status}'}.\`, result.outcome === 'resolved' ? 'good' : 'warning'));`,
    `logs.unshift(makeLog(gameYear, \`Экспедиция: ${'${point.name}'}\`, result.outcome === 'resolved' ? (point.completionSummary ?? \`Задача выполнена. Улик: ${'${newEvidence.length}'}.\`) : \`Задача не завершена. Улик: ${'${newEvidence.length}'}. Статус гипотезы: ${'${hypothesis.status}'}.\`, result.outcome === 'resolved' ? 'good' : 'warning'));`,
    'итоговой записи экспедиции'
  );
  content = replaceRequired(
    content,
    `        if ((contract.type === 'recovery' || contract.type === 'rescue') && newEvidence.length > 0) progress = contract.requiredProgress;`,
    `        if ((contract.type === 'recovery' || contract.type === 'rescue') && result.outcome === 'resolved') progress = contract.requiredProgress;`,
    'закрытия контрактов только по выполненной цели'
  );
  write(path, content);
}

// 4. Update the README without duplicating the section on repeated runs.
{
  const path = 'README.md';
  if (fs.existsSync(path)) {
    let content = read(path);
    content = content.replace(/\*\*Current version: v[^*]+\*\*/, '**Current version: v0.30.0 — Lorebound Expeditions & True Offline**');
    if (!content.includes('## v0.30.0 Lorebound Expeditions & True Offline')) {
      const anchor = 'Procedural single-player space exploration roguelike and autonomous galaxy-history simulator built with React, TypeScript and Canvas.\n';
      const section = `\n## v0.30.0 Lorebound Expeditions & True Offline\n\n- every generated expedition is tied to a real ruin, settlement, war, event, figure, artifact, biosphere or anomaly;\n- numbered generic locations and unrelated artifact fallbacks are removed;\n- field maps use a concrete mission objective and named evidence;\n- completed expeditions reveal linked history through the progressive intelligence model;\n- an unfinished surface expedition is checkpointed locally and restored after closing the browser;\n- the PWA precaches the full application, exposes an offline indicator and only applies updates after the player confirms them.\n\n`;
      if (content.includes(anchor)) content = content.replace(anchor, `${anchor}${section}`);
      else content = `${section}${content}`;
    }
    write(path, content);
  }
}

console.log('v0.30 patch applied successfully.');
