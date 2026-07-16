import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => writeFileSync(path, content, 'utf8');

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`v0.32.2: missing extracted file ${path}`);
}

function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`v0.32.2: anchor not found: ${label}`);
  return source.replace(anchor, `${anchor}${addition}`);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v0.32.2: fragment not found: ${label}`);
  return source.replace(before, after);
}

function patchApp() {
  const path = 'src/App.tsx';
  let source = read(path);

  source = insertAfter(
    source,
    "import { useCompactLayout } from './hooks/useCompactLayout';",
    "\nimport { formatInteger } from './ui/format';",
    'integer formatter import'
  );
  source = insertAfter(
    source,
    "import './styles/interfaceV31.css';",
    "\nimport './styles/civilizationProfiles.css';",
    'civilization profile styles'
  );

  const replacements = [
    ['{ecology.biodiversity}/100', '{formatInteger(ecology.biodiversity)}/100'],
    ['<b>{ecology.biomass}</b>', '<b>{formatInteger(ecology.biomass)}</b>'],
    ['<b>{ecology.climateStability}</b>', '<b>{formatInteger(ecology.climateStability)}</b>'],
    ['<b>{ecology.contamination}</b>', '<b>{formatInteger(ecology.contamination)}</b>'],
    ['<b>{ecology.biodiversity}</b>', '<b>{formatInteger(ecology.biodiversity)}</b>'],
    ['ЭКОСИСТЕМА · ЦИКЛ {ecology.cycle}', 'ЭКОСИСТЕМА · ЦИКЛ {formatInteger(ecology.cycle)}'],
    ['численность {entry.abundance}', 'численность {formatInteger(entry.abundance)}']
  ];
  for (const [before, after] of replacements) {
    source = source.split(before).join(after);
  }

  write(path, source);
}

function patchWorldScreen() {
  const path = 'src/screens/WorldScreen.tsx';
  let source = read(path);

  source = insertAfter(
    source,
    "import { useMemo, useState } from 'react';",
    "\nimport { CivilizationProfileWindow } from '../components/CivilizationProfileWindow';",
    'profile window import'
  );

  source = insertAfter(
    source,
    "  const [selectedWarId, setSelectedWarId] = useState<string | null>(null);",
    "\n  const [profileCivilizationId, setProfileCivilizationId] = useState<string | null>(null);",
    'profile selection state'
  );

  source = source.split("onClick={() => selectPolity(polity.id)}").join(
    "onClick={() => { selectPolity(polity.id); setProfileCivilizationId(polity.civilizationId); }}"
  );

  const compactEnd = `      </>}
    </main></div>;
  }

  return <div className="game-shell">{chrome}<main className="world-screen world-screen-known">`;
  const compactReplacement = `      </>}
    </main><CivilizationProfileWindow civilizationId={profileCivilizationId} onClose={() => setProfileCivilizationId(null)} onOpenContacts={() => { setProfileCivilizationId(null); store.setScreen('civilizations'); }}/></div>;
  }

  return <div className="game-shell">{chrome}<main className="world-screen world-screen-known">`;
  source = replaceOnce(source, compactEnd, compactReplacement, 'compact profile window');

  const desktopEnd = `  </main></div>;
}`;
  const desktopReplacement = `  </main><CivilizationProfileWindow civilizationId={profileCivilizationId} onClose={() => setProfileCivilizationId(null)} onOpenContacts={() => { setProfileCivilizationId(null); store.setScreen('civilizations'); }}/></div>;
}`;
  source = replaceOnce(source, desktopEnd, desktopReplacement, 'desktop profile window');

  write(path, source);
}

function patchKernel() {
  const path = 'src/simulation/kernel.ts';
  let source = read(path);

  source = replaceOnce(
    source,
    "  state.ecosystems[planetId] = result.ecology;",
    "  state.ecosystems[planetId] = normalizeEcologyState(result.ecology);",
    'ecology cycle state boundary'
  );

  const legacyBefore = `  const ecosystems =
    input.ecosystems ?? initializeEcosystems(context.galaxy, input.clock.absoluteHour);`;
  const legacyAfter = `  const ecosystems = Object.fromEntries(
    Object.entries(
      input.ecosystems ?? initializeEcosystems(context.galaxy, input.clock.absoluteHour)
    ).map(([planetId, ecology]) => [planetId, normalizeEcologyState(ecology)])
  );`;
  source = replaceOnce(source, legacyBefore, legacyAfter, 'legacy ecology normalization');

  source = replaceOnce(
    source,
    "  return { ...input, ecosystems: { ...input.ecosystems, [planetId]: next } };",
    "  return { ...input, ecosystems: { ...input.ecosystems, [planetId]: normalizeEcologyState(next) } };",
    'player ecology adjustment boundary'
  );

  write(path, source);
}


function patchPlayerConsequences() {
  const path = 'src/simulation/playerConsequences.ts';
  let source = read(path);

  source = insertAfter(
    source,
    "import type { Contract, Faction } from '../game/types';",
    "\nimport { normalizeEcologyState } from '../ecology/integrity';",
    'player consequence ecology normalization import'
  );

  source = insertAfter(
    source,
    "  ecology.lastUpdatedHour = atHour;",
    "\n  state.ecosystems[resolvedPlanetId] = normalizeEcologyState(ecology);",
    'player restoration ecology state boundary'
  );

  write(path, source);
}

function patchVersion() {
  const path = 'src/version.ts';
  let source = read(path);
  source = source.replace(
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.32.2';"
  );
  source = source.replace(
    /export const APP_CODENAME = '[^']+';/,
    "export const APP_CODENAME = 'CIVILIZATION_PROFILES';"
  );
  write(path, source);
}

[
  'src/components/CivilizationProfileWindow.tsx',
  'src/screens/ContactsScreen.tsx',
  'src/styles/civilizationProfiles.css'
].forEach(requireFile);

patchApp();
patchWorldScreen();
patchKernel();
patchPlayerConsequences();
patchVersion();

console.log('Void Chronicles v0.32.2 installed: civilization profiles, real UI routing and integer ecology boundaries.');
