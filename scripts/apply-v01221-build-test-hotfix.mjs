import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(cwd, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(cwd, relativePath), content, 'utf8');
}

const ecologyTestPath = 'src/tests/ecology.test.ts';
let ecologyTest = read(ecologyTestPath);

const oldExpectation = 'expect(upgraded.version).toBe(2);';
const newExpectation = 'expect(upgraded.version).toBe(3);';

if (ecologyTest.includes(oldExpectation)) {
  ecologyTest = ecologyTest.replace(oldExpectation, newExpectation);
  write(ecologyTestPath, ecologyTest);
  console.log('v0.12.2.1: ecology migration test updated to SimulationState v3');
} else if (ecologyTest.includes(newExpectation)) {
  console.log('v0.12.2.1: ecology migration test already updated');
} else {
  throw new Error('v0.12.2.1: ecology version expectation marker not found');
}

function updatePackageVersion(relativePath) {
  const fullPath = path.join(cwd, relativePath);
  if (!fs.existsSync(fullPath)) return;

  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

  if (relativePath === 'package.json') {
    json.version = '0.12.2';
  } else {
    if (typeof json.version === 'string') json.version = '0.12.2';
    if (json.packages?.[''] && typeof json.packages[''] === 'object') {
      json.packages[''].version = '0.12.2';
    }
  }

  fs.writeFileSync(fullPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  console.log(`v0.12.2.1: ${relativePath} version synchronized to 0.12.2`);
}

updatePackageVersion('package.json');
updatePackageVersion('package-lock.json');

console.log('v0.12.2.1 Build Test Hotfix applied');
