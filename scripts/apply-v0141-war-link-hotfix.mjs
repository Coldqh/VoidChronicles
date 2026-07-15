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
  if (!text.includes(search)) {
    throw new Error(`v0.14.1: marker not found — ${label}`);
  }
  return text.replace(search, replacement);
}

function replaceRegexRequired(text, regex, replacement, label) {
  if (!regex.test(text)) {
    throw new Error(`v0.14.1: regex marker not found — ${label}`);
  }
  return text.replace(regex, replacement);
}

// Preserve an explicit, inspectable link between a historical war and its event.
{
  const file = 'src/deeptime/history.ts';
  let text = read(file);

  text = replaceRequired(
    text,
    "    id: eventId('deep_event_war', war.id),",
    "    id: `deep_event_war_${war.id}`,",
    'war event id'
  );

  write(file, text);
}

// Replace the brittle suffix lookup with an exact causal relation.
{
  const file = 'src/tests/deepHistory.test.ts';
  let text = read(file);

  text = replaceRequired(
    text,
    "      expect(events.some((event) => event.kind === 'war' && event.id.includes(war.id.slice(-7)))).toBe(true);",
    "      expect(events.some((event) => event.kind === 'war' && event.id === `deep_event_war_${war.id}`)).toBe(true);",
    'war event assertion'
  );

  write(file, text);
}

// Version metadata.
{
  const file = 'src/version.ts';
  let text = read(file);

  text = replaceRegexRequired(
    text,
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.14.1';",
    'APP_VERSION'
  );

  write(file, text);
}

for (const relativePath of ['package.json', 'package-lock.json']) {
  const fullPath = path.join(cwd, relativePath);
  if (!fs.existsSync(fullPath)) continue;

  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

  if (typeof json.version === 'string') {
    json.version = '0.14.1';
  }

  if (json.packages?.[''] && typeof json.packages[''] === 'object') {
    json.packages[''].version = '0.14.1';
  }

  fs.writeFileSync(fullPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

console.log('v0.14.1 Historical War Link Hotfix applied');
