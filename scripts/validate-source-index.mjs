import { readFile } from 'node:fs/promises';

const sourcePath = new URL('../index.html', import.meta.url);
const html = await readFile(sourcePath, 'utf8');

const problems = [];

if (!html.includes('src="/src/main.tsx"')) {
  problems.push('нет исходной точки входа /src/main.tsx');
}

if (/\/VoidChronicles\/assets\/index-[^"']+\.(?:js|css)/.test(html)) {
  problems.push('обнаружены хешированные production assets из dist');
}

if (/rel=["']manifest["']/.test(html)) {
  problems.push('manifest был встроен production-сборкой; корневой index.html повреждён');
}

if (problems.length > 0) {
  console.error('\nSOURCE INDEX VALIDATION FAILED');
  console.error('Корневой index.html заменён собранным dist/index.html.');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error('\nВерни исходный index.html с <script type="module" src="/src/main.tsx"></script>.\n');
  process.exit(1);
}

console.log('Source index.html is valid.');
