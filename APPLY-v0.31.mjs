import { readFileSync, writeFileSync } from 'node:fs';

function read(path) { return readFileSync(path, 'utf8'); }
function write(path, content) { writeFileSync(path, content, 'utf8'); }

function insertAfter(content, anchor, addition, label) {
  if (content.includes(addition.trim())) return content;
  if (!content.includes(anchor)) throw new Error(`v0.31: anchor not found for ${label}`);
  return content.replace(anchor, `${anchor}${addition}`);
}

function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v0.31: expected fragment not found for ${label}`);
  return content.replace(before, after);
}

function patchApp() {
  const path = 'src/App.tsx';
  let source = read(path);
  source = insertAfter(
    source,
    "const OperationsScreen = lazy(() => import('./screens/OperationsScreen').then((module) => ({ default: module.OperationsScreen })));",
    "\nconst ContactsScreen = lazy(() => import('./screens/ContactsScreen').then((module) => ({ default: module.ContactsScreen })));",
    'ContactsScreen import'
  );
  source = insertAfter(source, "import './styles/mobileGameplay.css';", "\nimport './styles/interfaceV31.css';", 'v0.31 styles');
  source = replaceOnce(source, "{ id: 'civilizations', label: 'Цивилизации', icon: '⌬' },", "{ id: 'civilizations', label: 'Контакты', icon: '⌬' },", 'contacts navigation label');
  source = replaceOnce(source, "else if (screen === 'civilizations') content = <CivilizationsScreen/>;", "else if (screen === 'civilizations') content = <ContactsScreen chrome={<AppChrome/>}/>;", 'contacts route');
  write(path, source);
}

function patchKernel() {
  const path = 'src/simulation/kernel.ts';
  let source = read(path);
  source = insertAfter(source, "import { simulateEcologyCycle } from '../ecology/simulate';", "\nimport { normalizeEcologyState } from '../ecology/integrity';", 'kernel ecology integrity import');
  source = replaceOnce(
    source,
    "  return { ...input, ecosystems: { ...input.ecosystems, [planetId]: next } };",
    "  return { ...input, ecosystems: { ...input.ecosystems, [planetId]: normalizeEcologyState(next) } };",
    'adjustEcosystem integer normalization'
  );
  write(path, source);
}

function patchPlanetaryConsequences() {
  const path = 'src/simulation/planetaryConsequences.ts';
  let source = read(path);
  source = insertAfter(source, "import type { PlanetEcologyState } from '../ecology/types';", "\nimport { normalizeEcologyState } from '../ecology/integrity';", 'planetary ecology integrity import');
  if (!source.includes('return normalizeEcologyState({')) {
    const start = source.indexOf('function applyImpact(');
    const end = source.indexOf('\nfunction recentEvent(', start);
    if (start < 0 || end < 0) throw new Error('v0.31: applyImpact block not found');
    let block = source.slice(start, end);
    const returnIndex = block.indexOf('  return {');
    const closeIndex = block.lastIndexOf('  };\n}');
    if (returnIndex < 0 || closeIndex < 0) throw new Error('v0.31: applyImpact return block not found');
    block = `${block.slice(0, returnIndex)}  return normalizeEcologyState({${block.slice(returnIndex + '  return {'.length, closeIndex)}  });\n}${block.slice(closeIndex + '  };\n}'.length)}`;
    source = `${source.slice(0, start)}${block}${source.slice(end)}`;
  }
  write(path, source);
}

function patchSnapshot() {
  const path = 'src/persistence/snapshot.ts';
  let source = read(path);
  source = insertAfter(source, "import { worldYear } from '../simulation/clock';", "\nimport { normalizeEcologyState } from '../ecology/integrity';", 'snapshot ecology integrity import');
  source = replaceOnce(
    source,
    "    ecosystems: Object.fromEntries(Object.entries(snapshot.simulation.ecosystems).filter(([id]) => planetIds.has(id))),",
    "    ecosystems: Object.fromEntries(Object.entries(snapshot.simulation.ecosystems).filter(([id]) => planetIds.has(id)).map(([id, ecology]) => [id, normalizeEcologyState(ecology)])),",
    'old save ecology normalization'
  );
  write(path, source);
}

function patchVersion() {
  const path = 'src/version.ts';
  let source = read(path);
  source = source.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.31.0';");
  source = source.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'LIVING_CONTACTS';");
  write(path, source);
}

patchApp();
patchKernel();
patchPlanetaryConsequences();
patchSnapshot();
patchVersion();
console.log('Void Chronicles v0.31 installed: living contacts, interface rework, integer ecology metrics.');
