import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(cwd, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(cwd, relativePath), content, 'utf8');
}

function replaceRequired(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`v0.13.1: marker not found — ${label}`);
  return text.replace(search, replacement);
}

function replaceRegexRequired(text, regex, replacement, label) {
  if (!regex.test(text)) throw new Error(`v0.13.1: regex marker not found — ${label}`);
  return text.replace(regex, replacement);
}

// 1. Public chronicle IDs now preserve the real deep-time event kind.
{
  const file = 'src/deeptime/foundation.ts';
  let text = read(file);
  text = replaceRequired(
    text,
    '    id: `history_${event.id}`,',
    '    id: `history_${event.kind}_${event.id}`,',
    'deep-time history event kind'
  );
  write(file, text);
}

// 2. The old territory test assumed every living species was already interstellar.
{
  const file = 'src/tests/generation.test.ts';
  let text = read(file);
  const oldBlock = `  it('spreads living civilizations across visible connected territories', async () => {
    const galaxy = await generateGalaxy({ ...settings, seed: 'LIVING-TERRITORIES', systemCount: 120, civilizationCount: 18 });
    const living = galaxy.civilizations.filter((civilization) => civilization.status === 'living');
    expect(living.length).toBeGreaterThan(galaxy.civilizations.length / 2);
    expect(living.every((civilization) => civilization.controlledSystems.length >= 2)).toBe(true);
    for (const civilization of living) {
      expect(civilization.controlledSystems.every((systemId) => galaxy.systems.find((system) => system.id === systemId)?.civilizationIds.includes(civilization.id))).toBe(true);
    }
  });`;
  const newBlock = `  it('keeps pre-space civilizations local and territory markers consistent', async () => {
    const galaxy = await generateGalaxy({ ...settings, seed: 'LIVING-TERRITORIES', systemCount: 120, civilizationCount: 18 });
    const surviving = galaxy.civilizations.filter((civilization) => civilization.status !== 'dead');

    expect(surviving.length).toBeGreaterThan(0);
    expect(galaxy.deepTime).toBeDefined();

    for (const civilization of surviving) {
      expect(civilization.controlledSystems.length).toBeGreaterThanOrEqual(1);

      if (civilization.development?.spaceAccess === 'none') {
        expect(civilization.controlledSystems).toEqual([civilization.homeSystemId]);
      }

      expect(
        civilization.controlledSystems.every((systemId) =>
          galaxy.systems.find((system) => system.id === systemId)?.civilizationIds.includes(civilization.id)
        )
      ).toBe(true);
    }
  });`;
  text = replaceRequired(text, oldBlock, newBlock, 'generation territory test');
  write(file, text);
}

// 3. A galaxy may legitimately start with fewer than five space hubs.
{
  const file = 'src/tests/livingGalaxy.test.ts';
  let text = read(file);
  const oldLine = '    expect(living.hubs.length).toBeGreaterThanOrEqual(5);';
  const newBlock = `    expect(living.hubs.length).toBeGreaterThan(0);
    const spacefaringIds = new Set(
      world.civilizations
        .filter((civilization) => civilization.development?.spaceAccess && civilization.development.spaceAccess !== 'none')
        .map((civilization) => civilization.id)
    );
    expect(
      living.hubs.every((hub) => !hub.civilizationId || spacefaringIds.has(hub.civilizationId))
    ).toBe(true);`;
  text = replaceRequired(text, oldLine, newBlock, 'living galaxy hub test');
  write(file, text);
}

// Version metadata.
{
  const file = 'src/version.ts';
  let text = read(file);
  text = replaceRegexRequired(
    text,
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.13.1';",
    'APP_VERSION'
  );
  write(file, text);
}

for (const relativePath of ['package.json', 'package-lock.json']) {
  const fullPath = path.join(cwd, relativePath);
  if (!fs.existsSync(fullPath)) continue;
  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (typeof json.version === 'string') json.version = '0.13.1';
  if (json.packages?.[''] && typeof json.packages[''] === 'object') {
    json.packages[''].version = '0.13.1';
  }
  fs.writeFileSync(fullPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

console.log('v0.13.1 Deep Time test alignment applied');
