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
  "import { normalizeMainScreenRoute } from './routing/routes';",
  "import { MobileCommandScreenV361 } from './screens/MobileCommandScreenV361';\nimport { MobileOperationsScreenV361 } from './screens/MobileOperationsScreenV361';\nimport { MobileSituationScreenV361 } from './screens/MobileSituationScreenV361';\nimport { MobileChronicleScreenV361 } from './screens/MobileChronicleScreenV361';\nimport { MobileFactionsScreenV361 } from './screens/MobileFactionsScreenV361';",
  'mobile screen imports'
);
ensureImport("import './styles/experienceV35.css';", "import './styles/mobileCommandV361.css';", 'mobile stylesheet import');

if (!/const compact = useCompactLayout\(\);/.test(app.slice(app.indexOf('export default function App()')))) {
  const pattern = /(const screen = normalizeMainScreenRoute\(rawScreen\);\n)/;
  if (!pattern.test(app)) throw new Error('compact route anchor not found');
  app = app.replace(pattern, "$1  const compact = useCompactLayout();\n");
  changes += 1;
}

replaceRoute('chronicle', "compact && galaxy ? <MobileChronicleScreenV361 chrome={useGameStore.getState().legacy.mode !== 'chronicle' ? <AppChrome/> : undefined}/> : <ChronicleScreen chrome={galaxy && useGameStore.getState().legacy.mode !== 'chronicle' ? <AppChrome/> : undefined}/>");
replaceRoute('command', "compact ? <MobileCommandScreenV361 chrome={<AppChrome/>}/> : <CommandDeckScreen/>");
replaceRoute('system', "compact ? <SystemScreen/> : <div className=\"game-shell\"><AppChrome/><SystemWorkspaceV352/></div>");
replaceRoute('contracts', "compact ? <MobileOperationsScreenV361 chrome={<AppChrome/>}/> : <OperationsScreen chrome={<AppChrome/>}/>");
replaceRoute('factions', "compact ? <MobileFactionsScreenV361 chrome={<AppChrome/>}/> : <FactionsScreen/>");
replaceRoute('world', "compact ? <MobileSituationScreenV361 chrome={<AppChrome/>}/> : <WorldScreen chrome={<AppChrome/>}/>");
replaceRoute('operations', "compact ? <MobileOperationsScreenV361 chrome={<AppChrome/>}/> : <OperationsScreen chrome={<AppChrome/>}/>");

await writeFile(appPath, app, 'utf8');

const cssInfo = await stat('src/styles/mobileCommandV361.css');
if (cssInfo.size < 1000) throw new Error('src/styles/mobileCommandV361.css is empty or damaged; extract the hotfix ZIP over the repository again');

const lockPath = 'package-lock.json';
const lockJson = JSON.parse(await readFile(lockPath, 'utf8'));
let lockChanged = false;
if (lockJson.version !== '0.36.1') {
  lockJson.version = '0.36.1';
  lockChanged = true;
}
if (lockJson.packages?.['']?.version !== '0.36.1') {
  lockJson.packages[''].version = '0.36.1';
  lockChanged = true;
}
if (lockChanged) {
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, 'utf8');
  changes += 1;
}

const readmePath = 'README.md';
let readme = await readFile(readmePath, 'utf8');
const releaseSection = `## v0.36.1 Mobile Command UI\n\n- phone navigation keeps Bridge, Current System, Galaxy Map and Operations permanently available;\n- Bridge, Operations, Situation, Chronicle and Factions use dedicated compact compositions;\n- the current System route uses the full-screen orbital map on compact devices;\n- long dashboards are split into tabs, lists and dossiers;\n- iPhone safe areas, 100dvh and one scroll owner are enforced by the mobile shell;\n- desktop workspaces and save schema 13 remain unchanged.\n\n`;
if (!readme.includes('## v0.36.1 Mobile Command UI')) {
  readme = readme.replace(/\*\*Current version:.*?\*\*/, '**Current version: v0.36.1 — Mobile Command UI**');
  const anchor = '## v0.35.3 Routing Stable';
  if (!readme.includes(anchor)) throw new Error('README release anchor not found');
  readme = readme.replace(anchor, `${releaseSection}${anchor}`);
  await writeFile(readmePath, readme, 'utf8');
  changes += 1;
}

console.log(changes ? `v0.36.1 hotfix applied: ${changes} repairs.` : 'v0.36.1 hotfix is already applied.');
