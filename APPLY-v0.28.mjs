import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = process.argv[2] ? resolve(process.argv[2]) : scriptRoot;
const kernelPath = resolve(projectRoot, 'src/simulation/kernel.ts');
let source = await readFile(kernelPath, 'utf8');
let changes = 0;

function replaceOnce(pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (!source.includes(pattern)) {
      if (source.includes(replacement)) return;
      throw new Error(`v0.28: не найден фрагмент kernel.ts: ${label}`);
    }
    source = source.replace(pattern, replacement);
    changes += 1;
    return;
  }
  if (!pattern.test(source)) {
    if (typeof replacement === 'string' && source.includes(replacement)) return;
    throw new Error(`v0.28: не найден фрагмент kernel.ts: ${label}`);
  }
  source = source.replace(pattern, replacement);
  changes += 1;
}

if (!source.includes("from './stability';")) {
  replaceOnce(
    "import { simulateTradeRouteCycle } from './trade';",
    "import { simulateTradeRouteCycle } from './trade';\nimport {\n  maintainSimulationStability,\n  SIMULATION_EVENT_BUFFER_LIMIT,\n  SIMULATION_SCHEDULE_LIMIT\n} from './stability';",
    'импорт stability'
  );
}

replaceOnce(
  "      if (state.events.length > 1_000) state.events.length = 1_000;",
  "      if (state.events.length > SIMULATION_EVENT_BUFFER_LIMIT) {\n        maintainSimulationStability(state);\n      }",
  'лимит событий внутри advanceSimulation'
);

replaceOnce(
  "  state.clock.absoluteHour = targetHour;\n  state.events = state.events.slice(0, 1_000);\n  state.scheduledEvents = queue.slice(0, 25_000);",
  "  state.clock.absoluteHour = targetHour;\n  state.scheduledEvents = queue.slice(0, SIMULATION_SCHEDULE_LIMIT);\n  maintainSimulationStability(state);",
  'финальная очистка advanceSimulation'
);

const recordOld = `  return {
    event: created,
    simulation: {
      ...input,
      nextSequence: input.nextSequence + 1,
      events: [created, ...input.events].slice(0, 1_000)
    }
  };`;
const recordNew = `  const simulation: SimulationState = {
    ...input,
    nextSequence: input.nextSequence + 1,
    events: [created, ...input.events]
  };
  maintainSimulationStability(simulation);
  return { event: created, simulation };`;
replaceOnce(recordOld, recordNew, 'recordWorldEvent');

await writeFile(kernelPath, source, 'utf8');
console.log(changes ? `v0.28: kernel.ts обновлён, изменений: ${changes}.` : 'v0.28: kernel.ts уже обновлён.');
