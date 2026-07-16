import { readFileSync, writeFileSync } from 'node:fs';

const testPath = 'src/tests/figuresHeritagePlanet.test.ts';
const versionPath = 'src/version.ts';

const oldBlock = `    const before = simulation.ecosystems.planet_lyra!.contamination;
    const impacts = planetaryImpacts(simulation, context);
    expect(impacts[0]?.planetId).toBe('planet_lyra');
    simulatePlanetaryConsequencesCycle(simulation, civilization, context, 365 * 24);
    expect(simulation.ecosystems.planet_lyra!.contamination === before).toBe(false);
    expect(simulation.events.some((event) => event.tags.includes('planetary-consequence-state'))).toBe(true);`;

const newBlock = `    const before = {
      contamination: simulation.ecosystems.planet_lyra!.contamination,
      biomass: simulation.ecosystems.planet_lyra!.biomass,
      biodiversity: simulation.ecosystems.planet_lyra!.biodiversity,
      resilience: simulation.ecosystems.planet_lyra!.resilience,
      climateStability: simulation.ecosystems.planet_lyra!.climateStability
    };
    const impacts = planetaryImpacts(simulation, context);
    expect(impacts[0]?.planetId).toBe('planet_lyra');
    simulatePlanetaryConsequencesCycle(simulation, civilization, context, 365 * 24);
    const after = simulation.ecosystems.planet_lyra!;
    expect([
      after.contamination,
      after.biomass,
      after.biodiversity,
      after.resilience,
      after.climateStability,
      after.carryingCapacity,
      ...Object.values(after.resources)
    ].every(Number.isInteger)).toBe(true);
    expect(
      after.contamination !== before.contamination ||
      after.biomass !== before.biomass ||
      after.biodiversity !== before.biodiversity ||
      after.resilience !== before.resilience ||
      after.climateStability !== before.climateStability
    ).toBe(true);
    expect(simulation.events.some((event) => event.tags.includes('planetary-consequence-state'))).toBe(true);`;

let testSource = readFileSync(testPath, 'utf8');
if (testSource.includes(newBlock)) {
  console.log('v0.31.1: planetary consequence test already updated.');
} else {
  if (!testSource.includes(oldBlock)) {
    throw new Error(
      'v0.31.1: expected planetary consequence assertion was not found. ' +
      'Install v0.31.0 before applying this hotfix.'
    );
  }
  testSource = testSource.replace(oldBlock, newBlock);
  writeFileSync(testPath, testSource, 'utf8');
  console.log('v0.31.1: planetary consequence test updated for integer ecology metrics.');
}

let versionSource = readFileSync(versionPath, 'utf8');
if (!versionSource.includes("export const APP_VERSION = '0.31.1';")) {
  versionSource = versionSource.replace(
    /export const APP_VERSION = '[^']+';/,
    "export const APP_VERSION = '0.31.1';"
  );
  versionSource = versionSource.replace(
    /export const APP_CODENAME = '[^']+';/,
    "export const APP_CODENAME = 'LIVING_CONTACTS_STABLE';"
  );
  writeFileSync(versionPath, versionSource, 'utf8');
  console.log('v0.31.1: version metadata updated.');
}
