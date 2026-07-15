import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/narrative/encounters.ts');
let text = fs.readFileSync(file, 'utf8');

const oldBlock = [
  "  const rng = createRng(`${seed}:scan-scene:${systemId}:${planetName ?? 'system'}:${year}`);",
  "  if (!rng.chance(planetName ? .68 : .52)) return null;",
  "  const title = planetName ? `Ответ на сканирование ${planetName}` : `Неожиданный ответ из системы ${systemName}`;",
  "  return {",
  "    id: `scene_scan_${systemId}_${planetName ?? 'system'}_${year}`.replace(/\\s+/g, '_'),"
].join('\n');

const newBlock = [
  "  // Ответ на сканирование — редкое событие, а не обычная реакция интерфейса.",
  "  // Год убран из ID: одна и та же цель не создаёт одинаковую сцену повторно.",
  "  const rng = createRng(`${seed}:rare-scan-scene:${systemId}:${planetName ?? 'system'}`);",
  "  if (!rng.chance(planetName ? 0.06 : 0.025)) return null;",
  "  const title = planetName ? `Ответ на сканирование ${planetName}` : `Неожиданный ответ из системы ${systemName}`;",
  "  return {",
  "    id: `scene_scan_${systemId}_${planetName ?? 'system'}`.replace(/\\s+/g, '_'),"
].join('\n');

if (text.includes(newBlock)) {
  console.log('v0.11.3 narrative rarity already applied');
} else if (!text.includes(oldBlock)) {
  throw new Error('v0.11.3: generateScanScene marker not found');
} else {
  text = text.replace(oldBlock, newBlock);
  fs.writeFileSync(file, text, 'utf8');
  console.log('v0.11.3 narrative rarity applied');
}
