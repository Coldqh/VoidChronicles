import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => writeFileSync(path, content, 'utf8');

function removeBlock(source, start, end, label) {
  if (!source.includes(start)) return source;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex < 0) throw new Error(`v0.32.3: end marker not found for ${label}`);
  return source.slice(0, startIndex) + source.slice(endIndex);
}

let app = read('src/App.tsx');
app = removeBlock(app, 'function CivilizationsScreen() {', 'function CrewScreen() {', 'legacy civilization screens');
app = app.replace(/\n\s*Civilization,\n/, '\n');
app = app.replace("import { contactStageLabel } from './world/civilizations';\n", '');
write('src/App.tsx', app);

let store = read('src/game/store.ts');
store = store.replace(
  "      storyScenes: state.storyScenes.map((scene) => scene.status === 'available' && scene.expiresYear !== undefined && scene.expiresYear < nextYear ? { ...scene, status: 'expired' as const } : scene),",
  "      storyScenes,"
);
if (store.includes("storyScenes: state.storyScenes.map((scene) => scene.status === 'available'")) throw new Error('v0.32.3: projected storyScenes consolidation failed');
write('src/game/store.ts', store);

let version = read('src/version.ts');
version = version.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.32.3';");
version = version.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'INTERFACE_CONSOLIDATED';");
write('src/version.ts', version);

if (app.includes('function CivilizationsScreen()')) throw new Error('v0.32.3: legacy civilization screen remains');
if (!app.includes("<ContactsScreen chrome={<AppChrome/>}/>")) throw new Error('v0.32.3: ContactsScreen route missing');
console.log('Void Chronicles v0.32.3 installed: legacy civilization UI removed and projected story scenes consolidated.');
