import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const write = (path, value) => writeFileSync(path, value, 'utf8');

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`v0.35: missing extracted file ${path}`);
}

function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`v0.35: anchor not found: ${label}`);
  return source.replace(anchor, `${anchor}${addition}`);
}

function replaceBlock(source, pattern, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  if (!pattern.test(source)) throw new Error(`v0.35: block not found: ${label}`);
  return source.replace(pattern, replacement);
}

function patchApp() {
  const path = 'src/App.tsx';
  let source = read(path);

  source = insertAfter(
    source,
    "import { contactStageLabel } from './world/civilizations';",
    "\nimport { ExperienceChrome } from './components/ExperienceChrome';\nimport { CommandDeckV35 } from './screens/CommandDeckV35';",
    'v0.35 component imports'
  );
  source = insertAfter(
    source,
    "import './styles/galacticGeography.css';",
    "\nimport './styles/experienceV35.css';",
    'v0.35 style import'
  );

  source = replaceBlock(
    source,
    /function AppChrome\(\) \{[\s\S]*?\n\}\nfunction StoryScenePopup\(\) \{/,
    `function AppChrome() {\n  return <ExperienceChrome/>;\n}\nfunction StoryScenePopup() {`,
    'application chrome'
  );

  source = replaceBlock(
    source,
    /function CommandDeckScreen\(\) \{[\s\S]*?\n\}\n\nfunction artifactForPoint/,
    `function CommandDeckScreen() {\n  return <CommandDeckV35 chrome={<AppChrome/>}/>;\n}\n\nfunction artifactForPoint`,
    'command deck'
  );

  write(path, source);
}

function patchContacts() {
  const path = 'src/screens/ContactsScreen.tsx';
  let source = read(path);
  source = source.replace(
    `              onClick={() => {\n                setSelectedId(entry.civilization.id);\n                setProfileCivilizationId(entry.civilization.id);\n                setNotice('');\n              }}`,
    `              onClick={() => {\n                setSelectedId(entry.civilization.id);\n                setNotice('');\n              }}`
  );
  write(path, source);
}

function patchVersion() {
  const path = 'src/version.ts';
  let source = read(path);
  source = source.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.35.0';");
  source = source.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'CINEMATIC_COMMAND';");
  write(path, source);
}

[
  'src/components/ExperienceChrome.tsx',
  'src/screens/CommandDeckV35.tsx',
  'src/screens/OperationsScreen.tsx',
  'src/screens/CrewScreen.tsx',
  'src/screens/ShipScreen.tsx',
  'src/styles/experienceV35.css',
  'src/tests/experienceV35.test.ts'
].forEach(requireFile);

patchApp();
patchContacts();
patchVersion();
console.log('Void Chronicles v0.35 installed: cinematic command, persistent navigation and rebuilt core screens.');
