import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, from, to, label) {
  const source = await readFile(path, 'utf8');
  if (source.includes(to)) return false;
  if (!source.includes(from)) throw new Error(`${label}: anchor not found in ${path}`);
  await writeFile(path, source.replace(from, to), 'utf8');
  return true;
}

let changes = 0;

changes += Number(await replaceOnce(
  'src/App.tsx',
  "import { normalizeMainScreenRoute } from './routing/routes';",
  "import { normalizeMainScreenRoute } from './routing/routes';\nimport { MobileCommandScreenV361 } from './screens/MobileCommandScreenV361';\nimport { MobileOperationsScreenV361 } from './screens/MobileOperationsScreenV361';\nimport { MobileSituationScreenV361 } from './screens/MobileSituationScreenV361';\nimport { MobileChronicleScreenV361 } from './screens/MobileChronicleScreenV361';\nimport { MobileFactionsScreenV361 } from './screens/MobileFactionsScreenV361';",
  'mobile screen imports'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "import './styles/experienceV35.css';",
  "import './styles/experienceV35.css';\nimport './styles/mobileCommandV361.css';",
  'mobile stylesheet import'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "  const screen = normalizeMainScreenRoute(rawScreen);\n  const galaxy = useGameStore((state) => state.galaxy);",
  "  const screen = normalizeMainScreenRoute(rawScreen);\n  const compact = useCompactLayout();\n  const galaxy = useGameStore((state) => state.galaxy);",
  'compact route state'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "  else if (screen === 'chronicle') content = <ChronicleScreen chrome={galaxy && useGameStore.getState().legacy.mode !== 'chronicle' ? <AppChrome/> : undefined}/>;",
  "  else if (screen === 'chronicle') content = compact && galaxy ? <MobileChronicleScreenV361 chrome={useGameStore.getState().legacy.mode !== 'chronicle' ? <AppChrome/> : undefined}/> : <ChronicleScreen chrome={galaxy && useGameStore.getState().legacy.mode !== 'chronicle' ? <AppChrome/> : undefined}/>;",
  'chronicle mobile route'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "  else if (screen === 'command') content = <CommandDeckScreen/>;",
  "  else if (screen === 'command') content = compact ? <MobileCommandScreenV361 chrome={<AppChrome/>}/> : <CommandDeckScreen/>;",
  'command mobile route'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "  else if (screen === 'system') content = <div className=\"game-shell\"><AppChrome/><SystemWorkspaceV352/></div>;",
  "  else if (screen === 'system') content = compact ? <SystemScreen/> : <div className=\"game-shell\"><AppChrome/><SystemWorkspaceV352/></div>;",
  'system mobile route'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "  else if (screen === 'contracts') content = <OperationsScreen chrome={<AppChrome/>}/>;",
  "  else if (screen === 'contracts') content = compact ? <MobileOperationsScreenV361 chrome={<AppChrome/>}/> : <OperationsScreen chrome={<AppChrome/>}/>;",
  'legacy contracts mobile route'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "  else if (screen === 'factions') content = <FactionsScreen/>;",
  "  else if (screen === 'factions') content = compact ? <MobileFactionsScreenV361 chrome={<AppChrome/>}/> : <FactionsScreen/>;",
  'factions mobile route'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "  else if (screen === 'world') content = <WorldScreen chrome={<AppChrome/>}/>;",
  "  else if (screen === 'world') content = compact ? <MobileSituationScreenV361 chrome={<AppChrome/>}/> : <WorldScreen chrome={<AppChrome/>}/>;",
  'world mobile route'
));

changes += Number(await replaceOnce(
  'src/App.tsx',
  "  else if (screen === 'operations') content = <OperationsScreen chrome={<AppChrome/>}/>;",
  "  else if (screen === 'operations') content = compact ? <MobileOperationsScreenV361 chrome={<AppChrome/>}/> : <OperationsScreen chrome={<AppChrome/>}/>;",
  'operations mobile route'
));

const lockPath = 'package-lock.json';
let lock = await readFile(lockPath, 'utf8');
if (!lock.includes('"version": "0.36.1"')) {
  let replacements = 0;
  lock = lock.replace(/"version": "0\.35\.3"/g, (match) => replacements++ < 2 ? '"version": "0.36.1"' : match);
  if (replacements < 2) throw new Error('package-lock version anchors not found');
  await writeFile(lockPath, lock, 'utf8');
  changes += 1;
}

const readmePath = 'README.md';
let readme = await readFile(readmePath, 'utf8');
const releaseSection = `## v0.36.1 Mobile Command UI\n\n- phone navigation now keeps Bridge, Current System, Galaxy Map and Operations permanently available;\n- Bridge, Operations, Situation, Chronicle and Factions use dedicated phone compositions;\n- the current System route returns to the full-screen orbital map on compact devices;\n- long dashboards are split into tabs, sub-tabs, lists and dossiers;\n- iPhone safe areas, 100dvh and one scroll owner are enforced by the mobile shell;\n- desktop workspaces and save schema 13 remain unchanged.\n\n`;
if (!readme.includes('## v0.36.1 Mobile Command UI')) {
  readme = readme.replace('**Current version: v0.35.3 — Routing Stable**', '**Current version: v0.36.1 — Mobile Command UI**');
  const anchor = '## v0.35.3 Routing Stable';
  if (!readme.includes(anchor)) throw new Error('README release anchor not found');
  readme = readme.replace(anchor, `${releaseSection}${anchor}`);
  await writeFile(readmePath, readme, 'utf8');
  changes += 1;
}

console.log(changes ? `v0.36.1 applied: ${changes} integration changes.` : 'v0.36.1 is already applied.');
