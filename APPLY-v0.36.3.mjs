import { readFile, writeFile } from 'node:fs/promises';

async function read(path) {
  return (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
}

async function write(path, value) {
  await writeFile(path, value, 'utf8');
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label}: anchor not found`);
  return source.replace(before, after);
}

function replaceRegex(source, pattern, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!pattern.test(source)) throw new Error(`${label}: pattern not found`);
  return source.replace(pattern, replacement);
}

const chromePath = 'src/components/ExperienceChrome.tsx';
let chrome = await read(chromePath);

const oldMenu = `  const allMenu = open && <div className="v35-command-menu v361-command-menu">
    <button className="v35-command-menu-scrim" aria-label="Закрыть меню" onClick={() => setOpen(false)}/>
    <section className="v35-command-menu-panel" role="dialog" aria-label="Все разделы корабля">
      <header>
        <div><span className="eyebrow">VOID CHRONICLES · v{APP_VERSION}</span><h2>Разделы корабля</h2></div>
        <button aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="v35-menu-primary">
        {mainItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
          <i>{item.icon}</i><span><b>{item.label}</b><small>{item.description}</small></span>{Boolean(item.badge) && <em>{item.badge}</em>}
        </button>)}
      </div>
      <div className="v35-menu-secondary">
        {secondaryItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
          <i>{item.icon}</i><span><b>{item.label}</b><small>{item.description}</small></span>{Boolean(item.badge) && <em>{item.badge}</em>}
        </button>)}
      </div>
    </section>
  </div>;`;

const newMenu = `  const renderMenuItem = (item: NavigationItem) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
    <i>{item.icon}</i><span><b>{item.label}</b><small>{item.description}</small></span>{Boolean(item.badge) && <em>{item.badge}</em>}
  </button>;

  const worldMenu = secondaryItems.filter((item) => ['world', 'civilizations', 'factions', 'chronicle'].includes(item.id));
  const shipMenu = secondaryItems.filter((item) => ['crew', 'ship', 'laboratory', 'archive'].includes(item.id));
  const serviceMenu = secondaryItems.filter((item) => item.id === 'settings');

  const allMenu = open && <div className="v35-command-menu v361-command-menu">
    <button className="v35-command-menu-scrim" aria-label="Закрыть меню" onClick={() => setOpen(false)}/>
    <section className="v35-command-menu-panel v363-menu-panel" role="dialog" aria-label="Разделы">
      <header>
        <div><span className="eyebrow">VOID CHRONICLES · v{APP_VERSION}</span><h2>Разделы</h2></div>
        <button aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="v363-menu-scroll">
        <section className="v363-menu-group"><h3>Основное</h3><div className="v363-menu-grid">{mainItems.map(renderMenuItem)}</div></section>
        <section className="v363-menu-group"><h3>Мир</h3><div className="v363-menu-grid">{worldMenu.map(renderMenuItem)}</div></section>
        <section className="v363-menu-group"><h3>Корабль</h3><div className="v363-menu-grid">{shipMenu.map(renderMenuItem)}</div></section>
        <section className="v363-menu-group"><h3>Служебное</h3><div className="v363-menu-grid">{serviceMenu.map(renderMenuItem)}</div></section>
      </div>
      <footer className="v363-menu-footer">
        <span>Текущая система<b>{current?.name ?? 'Неизвестно'}</b></span>
        <strong>{formatInteger(hull)}% · {formatInteger(fuel)}%</strong>
      </footer>
    </section>
  </div>;`;

chrome = replaceOnce(chrome, oldMenu, newMenu, 'grouped navigation');

const oldCompact = `  if (compact) return <>
    <header className="app-hud v361-mobile-hud">
      <button className="v361-menu-button" aria-label="Открыть все разделы" onClick={() => setOpen((value) => !value)}><span/><span/><span/></button>
      <button className="v361-mobile-brand" aria-label="Открыть мостик" onClick={() => navigate('command')}><img src={BRAND_MARK} alt=""/></button>
      <button className="v361-mobile-location" onClick={() => navigate('system')}>
        <b>{current?.name ?? 'НЕИЗВЕСТНАЯ СИСТЕМА'}</b>
        <span>{urgent ? urgent.title : current?.region ?? 'КОРАБЛЬ В КОСМОСЕ'}</span>
      </button>
      <div className="v361-mobile-vitals"><span className={hull < 35 ? 'critical' : ''}>{formatInteger(hull)}%</span><span className={fuel < 25 ? 'critical' : ''}>{formatInteger(fuel)}%</span></div>
    </header>
    <nav className="mobile-dock v35-mobile-dock v361-mobile-dock" aria-label="Главная навигация">
      {mainItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
        <i>{item.icon}</i><span>{item.label}</span>{Boolean(item.badge) && <em>{item.badge}</em>}
      </button>)}
      <button className={open || secondaryItems.some((item) => item.id === store.screen) ? 'active' : ''} onClick={() => setOpen((value) => !value)}><i>•••</i><span>Ещё</span>{shipIssueCount > 0 && <em>{shipIssueCount}</em>}</button>
    </nav>
    {allMenu}
  </>;`;

const newCompact = `  if (compact) return <>
    <header className="app-hud v361-mobile-hud v363-mobile-hud">
      <button className="v361-mobile-location v363-mobile-location" onClick={() => navigate('system')}>
        <b>{current?.name ?? 'НЕИЗВЕСТНАЯ СИСТЕМА'}</b>
        <span>{urgent ? urgent.title : current?.region ?? 'КОРАБЛЬ В КОСМОСЕ'}</span>
      </button>
      <div className="v361-mobile-vitals"><span className={hull < 35 ? 'critical' : ''}>{formatInteger(hull)}%</span><span className={fuel < 25 ? 'critical' : ''}>{formatInteger(fuel)}%</span></div>
    </header>
    <nav className="mobile-dock v35-mobile-dock v361-mobile-dock" aria-label="Главная навигация">
      {mainItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
        <i>{item.icon}</i><span>{item.label}</span>{Boolean(item.badge) && <em>{item.badge}</em>}
      </button>)}
      <button className={open || secondaryItems.some((item) => item.id === store.screen) ? 'active' : ''} onClick={() => setOpen((value) => !value)}><i>•••</i><span>Ещё</span>{shipIssueCount > 0 && <em>{shipIssueCount}</em>}</button>
    </nav>
    {allMenu}
  </>;`;

chrome = replaceOnce(chrome, oldCompact, newCompact, 'compact hud cleanup');
await write(chromePath, chrome);

const commandPath = 'src/screens/MobileCommandScreenV361.tsx';
let command = await read(commandPath);
command = replaceOnce(
  command,
  'mobile-data-screen v361-screen v361-command-screen',
  'mobile-data-screen v361-screen v361-command-screen v363-command-screen',
  'bridge screen class'
);
command = replaceOnce(
  command,
  'v361-primary-card tone-${journey.focus.tone}',
  'v361-primary-card v363-primary-card tone-${journey.focus.tone}',
  'bridge focus card class'
);
command = replaceOnce(
  command,
  '<div className="v361-quick-rows">',
  '<div className="v361-quick-rows v363-quick-rows">',
  'bridge quick rows class'
);

const oldOrder = `      {tab === 'order' && <article className="v361-focus-panel">
        <span>ТЕКУЩИЙ ПРИКАЗ</span><h2>{journey.focus.title}</h2><p>{journey.focus.text}</p>
        <button className="primary-button" onClick={() => runAction(journey.focus.action)}>{journey.focus.label}</button>
      </article>}`;

const newOrder = `      {tab === 'order' && <article className="v361-focus-panel">
        <span>ТЕКУЩИЙ ПРИКАЗ</span><h2>{journey.focus.title}</h2><p>{journey.focus.text}</p>
        <small className="v363-order-hint">Основное действие находится в верхнем блоке.</small>
      </article>}`;

command = replaceOnce(command, oldOrder, newOrder, 'remove duplicate bridge action');
await write(commandPath, command);

const expeditionPath = 'src/components/ExpeditionModal.tsx';
let expedition = await read(expeditionPath);
expedition = replaceOnce(
  expedition,
  "import { generateSurface, type SurfaceMap, type SurfaceObject, type SurfaceTile } from '../generation/surface';",
  "import { generateSurface, type SurfaceMap, type SurfaceObject, type SurfaceTile } from '../generation/surface';\nimport { ExpeditionEnemyToken, ExpeditionObjectToken, ExpeditionPlayerToken, enemyVisualForName } from './ExpeditionTokens';",
  'expedition token import'
);
expedition = replaceOnce(expedition, 'const STEP_DELAY_MS = 145;', 'const STEP_DELAY_MS = 72;', 'movement delay');
expedition = replaceOnce(
  expedition,
  "const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));",
  "const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));\nconst nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));",
  'movement frame helper'
);
expedition = replaceOnce(
  expedition,
  "        if (!next || !performStep(next.x, next.y)) break;\n        await wait(STEP_DELAY_MS);",
  "        if (!next || !performStep(next.x, next.y)) break;\n        await nextFrame();\n        await wait(STEP_DELAY_MS);",
  'movement frame synchronization'
);
expedition = replaceOnce(
  expedition,
  "    try { performStep(enemy.x, enemy.y); await wait(STEP_DELAY_MS); }",
  "    try { if (performStep(enemy.x, enemy.y)) { await nextFrame(); await wait(STEP_DELAY_MS); } }",
  'attack frame synchronization'
);
expedition = replaceOnce(
  expedition,
  '<section className="modal expedition-modal field-modal">',
  '<section className={`modal expedition-modal field-modal expedition-biome-${planet.type} expedition-site-${point.type}`} data-moving={isMoving ? \'true\' : \'false\'}>',
  'expedition biome class'
);
expedition = replaceOnce(
  expedition,
  "<p>{isMoving ? 'Перемещение…' : `${map.hazardName} · ${turnsLeft} ходов`}</p>",
  "<p>{map.hazardName} · {turnsLeft} ходов</p>",
  'stable expedition header'
);

const oldTarget = `    <section className={\`field-target-panel \${selectedEnemy ? 'has-target' : ''}\`}>
      {selectedEnemy ? <><div><span>ЦЕЛЬ</span><b>{selectedEnemy.name}</b></div><div><span>HP</span><b>{Math.max(0, selectedEnemy.health)}/{selectedEnemy.maxHealth}</b></div><div><span>УРОН</span><b>{selectedEnemy.damage}</b></div><button disabled={isMoving || distance(map.player, selectedEnemy) !== 1} onClick={() => void attackSelected()}>{distance(map.player, selectedEnemy) === 1 ? 'Атаковать' : 'Слишком далеко'}</button></> : <p>Объекты с меткой цели двигают конкретную задачу. Остальные дают контекст и повышают достоверность вывода.</p>}
    </section>`;

const newTarget = `    <section className={\`field-target-panel \${selectedEnemy ? 'has-target' : ''}\`}>
      {selectedEnemy && <><div className="field-target-identity"><ExpeditionEnemyToken variant={enemyVisualForName(selectedEnemy.name)}/><div><span>ЦЕЛЬ</span><b>{selectedEnemy.name}</b></div></div><div><span>HP</span><b>{Math.max(0, selectedEnemy.health)}/{selectedEnemy.maxHealth}</b></div><div><span>УРОН</span><b>{selectedEnemy.damage}</b></div><button disabled={isMoving || distance(map.player, selectedEnemy) !== 1} onClick={() => void attackSelected()}>{distance(map.player, selectedEnemy) === 1 ? 'Атаковать' : 'Далеко'}</button></>}
    </section>`;

expedition = replaceOnce(expedition, oldTarget, newTarget, 'compact target panel');

const oldTile = `        const object = map.objects.find((entry) => entry.x === tile.x && entry.y === tile.y && !entry.resolved);
        return <button key={\`\${tile.x}-\${tile.y}\`} aria-label={\`\${tile.x},\${tile.y}\`} data-tutorial={tile.revealed && object?.id === tutorialObjectId ? 'collect-data' : undefined} disabled={isLeaving || playerHealth <= 0 || isMoving} className={\`tile tile-\${tile.revealed ? tile.kind : 'hidden'} \${player ? 'tile-player' : ''} \${enemy ? 'tile-enemy' : ''} \${enemy?.id === selectedEnemyId ? 'tile-selected-enemy' : ''} \${object ? 'tile-object' : ''} \${object?.objective ? 'tile-objective' : ''}\`} onClick={() => void moveTo(tile.x, tile.y)}>{player ? '◆' : enemy ? '▲' : tile.revealed && object ? object.kind === 'artifact' ? '✦' : object.kind === 'terminal' ? '▣' : object.kind === 'sample' ? '●' : object.objective ? '◆' : '▥' : ''}</button>;`;

const newTile = `        const object = map.objects.find((entry) => entry.x === tile.x && entry.y === tile.y && !entry.resolved);
        const reachable = tile.revealed && tile.kind !== 'rock' && distance(map.player, tile) === 1;
        return <button key={\`\${tile.x}-\${tile.y}\`} aria-label={\`\${tile.x},\${tile.y}\`} aria-current={player ? 'true' : undefined} data-tutorial={tile.revealed && object?.id === tutorialObjectId ? 'collect-data' : undefined} disabled={isLeaving || playerHealth <= 0 || isMoving} className={\`tile tile-\${tile.revealed ? tile.kind : 'hidden'} \${reachable ? 'tile-reachable' : ''} \${player ? 'tile-player' : ''} \${enemy ? 'tile-enemy' : ''} \${enemy?.id === selectedEnemyId ? 'tile-selected-enemy' : ''} \${object ? 'tile-object' : ''} \${object?.objective ? 'tile-objective' : ''}\`} onClick={() => void moveTo(tile.x, tile.y)}>{player ? <ExpeditionPlayerToken/> : enemy ? <ExpeditionEnemyToken variant={enemyVisualForName(enemy.name)}/> : tile.revealed && object ? <ExpeditionObjectToken kind={object.kind} objective={object.objective}/> : null}</button>;`;

expedition = replaceOnce(expedition, oldTile, newTile, 'textured expedition tiles');
await write(expeditionPath, expedition);

const appPath = 'src/App.tsx';
let app = await read(appPath);
app = replaceOnce(
  app,
  "import './styles/mobileCoverageV362.css';",
  "import './styles/mobileCoverageV362.css';\nimport './styles/mobilePolishV363.css';",
  'mobile polish stylesheet import'
);
await write(appPath, app);

const versionPath = 'src/version.ts';
let version = await read(versionPath);
version = version.replace(/export const APP_VERSION = '[^']+';/, "export const APP_VERSION = '0.36.3';");
version = version.replace(/export const APP_CODENAME = '[^']+';/, "export const APP_CODENAME = 'TACTICAL_MOBILE_POLISH';");
await write(versionPath, version);

for (const path of ['package.json', 'package-lock.json']) {
  const raw = await read(path);
  const parsed = JSON.parse(raw);
  parsed.version = '0.36.3';
  if (path === 'package-lock.json' && parsed.packages?.['']) parsed.packages[''].version = '0.36.3';
  await write(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

const readmePath = 'README.md';
let readme = await read(readmePath);
readme = readme.replace(/\*\*Current version:.*?\*\*/, '**Current version: v0.36.3 — Tactical Mobile Polish**');
if (!readme.includes('## v0.36.3 Tactical Mobile Polish')) {
  const anchor = '## v0.36.2 Full Mobile Coverage';
  const section = `## v0.36.3 Tactical Mobile Polish

- compact bridge rows replace oversized empty panels;
- the compact header no longer duplicates the logo or the More button;
- the sections menu is grouped into Main, World, Ship and Service areas;
- expedition movement renders one synchronized state per step without disabled-state dimming;
- player, enemy and objective markers use inline SVG models and biome-aware procedural textures;
- SAVE_SCHEMA_VERSION remains 13.

`;
  if (!readme.includes(anchor)) throw new Error('README v0.36.2 anchor not found');
  readme = readme.replace(anchor, `${section}${anchor}`);
}
await write(readmePath, readme);

console.log('v0.36.3 TACTICAL_MOBILE_POLISH applied.');
