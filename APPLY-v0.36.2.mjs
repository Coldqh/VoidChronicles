import { readFile, writeFile, stat } from 'node:fs/promises';

const appPath = 'src/App.tsx';
let app = (await readFile(appPath, 'utf8')).replace(/\r\n/g, '\n');
let changes = 0;

function ensureImport(anchor, addition, label) {
  if (app.includes(addition.trim())) return;
  if (!app.includes(anchor)) throw new Error(`${label}: anchor not found`);
  app = app.replace(anchor, `${anchor}\n${addition}`);
  changes += 1;
}

function replaceRoute(screen, replacement) {
  const wanted = `  else if (screen === '${screen}') content = ${replacement};`;
  if (app.includes(wanted)) return;
  const pattern = new RegExp(`^\\s*else if \\(screen === '${screen}'\\) content = .*?;\\s*$`, 'm');
  if (!pattern.test(app)) throw new Error(`route not found: ${screen}`);
  app = app.replace(pattern, wanted);
  changes += 1;
}

ensureImport(
  "import { MobileFactionsScreenV361 } from './screens/MobileFactionsScreenV361';",
  "import { MobileShipScreenV362 } from './screens/MobileShipScreenV362';\nimport { MobileCrewScreenV362 } from './screens/MobileCrewScreenV362';\nimport { MobileContactsScreenV362 } from './screens/MobileContactsScreenV362';\nimport { MobileArchiveScreenV362 } from './screens/MobileArchiveScreenV362';\nimport { MobileLaboratoryScreenV362 } from './screens/MobileLaboratoryScreenV362';\nimport { MobileHubScreenV362 } from './screens/MobileHubScreenV362';\nimport { MobileSettingsScreenV362 } from './screens/MobileSettingsScreenV362';",
  'v0.36.2 screen imports'
);
ensureImport("import './styles/mobileCommandV361.css';", "import './styles/mobileCoverageV362.css';", 'v0.36.2 stylesheet');

const settingsWanted = "  if (screen === 'settings') content = compact && galaxy ? <MobileSettingsScreenV362 chrome={<AppChrome/>}/> : <SettingsScreen/>;";
if (!app.includes(settingsWanted)) {
  const pattern = /^\s*if \(screen === 'settings'\) content = .*?;\s*$/m;
  if (!pattern.test(app)) throw new Error('route not found: settings');
  app = app.replace(pattern, settingsWanted);
  changes += 1;
}

replaceRoute('hub', "compact ? <MobileHubScreenV362 chrome={<AppChrome/>}/> : <HubScreen/>");
replaceRoute('civilizations', "compact ? <MobileContactsScreenV362 chrome={<AppChrome/>}/> : <ContactsScreen chrome={<AppChrome/>}/>");
replaceRoute('crew', "compact ? <MobileCrewScreenV362 chrome={<AppChrome/>}/> : <CrewScreenV33 chrome={<AppChrome/>}/>");
replaceRoute('archive', "compact ? <MobileArchiveScreenV362 chrome={<AppChrome/>}/> : <div className=\"game-shell\"><AppChrome/><ArchiveWorkspaceV352/></div>");
replaceRoute('laboratory', "compact ? <MobileLaboratoryScreenV362 chrome={<AppChrome/>}/> : <LaboratoryScreen chrome={<AppChrome/>}/>");

const shipWanted = "  else content = compact ? <MobileShipScreenV362 chrome={<AppChrome/>}/> : <ShipScreenV33 chrome={<AppChrome/>}/>;";
if (!app.includes(shipWanted)) {
  const pattern = /^\s*else content = <ShipScreenV33 chrome=\{<AppChrome\/>\}\/?>;\s*$/m;
  if (!pattern.test(app)) throw new Error('final ship route not found');
  app = app.replace(pattern, shipWanted);
  changes += 1;
}

await writeFile(appPath, app, 'utf8');

for (const required of [
  'src/components/MobileCoverageV362.tsx',
  'src/screens/MobileShipScreenV362.tsx',
  'src/screens/MobileCrewScreenV362.tsx',
  'src/screens/MobileContactsScreenV362.tsx',
  'src/screens/MobileArchiveScreenV362.tsx',
  'src/screens/MobileLaboratoryScreenV362.tsx',
  'src/screens/MobileHubScreenV362.tsx',
  'src/screens/MobileSettingsScreenV362.tsx',
  'src/styles/mobileCoverageV362.css',
  'src/tests/interfaceV362.test.ts'
]) {
  const info = await stat(required);
  if (info.size < 100) throw new Error(`${required} is empty or damaged; extract the ZIP over the repository again`);
}

const versionPath = 'src/version.ts';
let version = await readFile(versionPath, 'utf8');
version = version.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.36.2';");
version = version.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'FULL_MOBILE_COVERAGE';");
await writeFile(versionPath, version, 'utf8');

const packagePath = 'package.json';
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
packageJson.version = '0.36.2';
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

const lockPath = 'package-lock.json';
const lockJson = JSON.parse(await readFile(lockPath, 'utf8'));
lockJson.version = '0.36.2';
if (lockJson.packages?.['']) lockJson.packages[''].version = '0.36.2';
await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, 'utf8');

const legacyTestPath = 'src/tests/interfaceV361.test.ts';
let legacyTest = await readFile(legacyTestPath, 'utf8');
legacyTest = legacyTest.replace("expect(versionSource).toContain(\"APP_VERSION = '0.36.1'\");", "expect(versionSource).toContain('export const APP_VERSION');");
legacyTest = legacyTest.replace("expect(versionSource).toContain(\"APP_CODENAME = 'MOBILE_COMMAND_UI'\");", "expect(versionSource).toContain('export const APP_CODENAME');");
await writeFile(legacyTestPath, legacyTest, 'utf8');

const readmePath = 'README.md';
let readme = await readFile(readmePath, 'utf8');
readme = readme.replace(/\*\*Current version:.*?\*\*/, '**Current version: v0.36.2 — Full Mobile Coverage**');
if (!readme.includes('## v0.36.2 Full Mobile Coverage')) {
  const section = `## v0.36.2 Full Mobile Coverage\n\n- Ship, Crew, Contacts, Archive, Laboratory, Hub and Settings now use dedicated compact phone screens;\n- all remaining mobile screens share one fixed-height shell, tabs and one controlled scroll body;\n- dense dashboards are replaced by list-to-dossier navigation and compact sub-tabs;\n- original repair, crew, diplomacy, research, trade, archive and save actions remain reachable;\n- desktop layouts remain unchanged;\n- SAVE_SCHEMA_VERSION remains 13.\n\n`;
  const anchor = '## v0.36.1 Mobile Command UI';
  if (!readme.includes(anchor)) throw new Error('README v0.36.1 anchor not found');
  readme = readme.replace(anchor, `${section}${anchor}`);
}
await writeFile(readmePath, readme, 'utf8');

console.log(`v0.36.2 FULL_MOBILE_COVERAGE applied. App route repairs: ${changes}.`);
