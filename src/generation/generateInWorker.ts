import type { Galaxy, GalaxySettings } from '../game/types';
import { generateGalaxy, normalizeGalaxySettings, type GenerationProgress } from './generateGalaxy';
import GenerationWorker from '../workers/generation.worker?worker';

function verifyGalaxy(galaxy: Galaxy, expected: number): Galaxy {
  if (!galaxy || galaxy.systems.length !== expected) {
    throw new Error(`Генератор вернул ${galaxy?.systems.length ?? 0} систем вместо ${expected}`);
  }
  return galaxy;
}

function runWorker(
  settings: GalaxySettings,
  onProgress: (progress: GenerationProgress) => void
): Promise<Galaxy> {
  return new Promise((resolve, reject) => {
    const worker = new GenerationWorker();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback();
    };
    const timeout = window.setTimeout(() => finish(() => reject(new Error('Generation worker timed out'))), 120_000);
    worker.onmessage = (event: MessageEvent<
      | { type: 'progress'; payload: GenerationProgress }
      | { type: 'complete'; payload: Galaxy }
      | { type: 'error'; payload: string }
    >) => {
      const data = event.data;
      if (data.type === 'progress') {
        onProgress(data.payload);
        return;
      }
      if (data.type === 'complete') {
        const galaxy = data.payload;
        finish(() => {
          window.clearTimeout(timeout);
          try { resolve(verifyGalaxy(galaxy, settings.systemCount)); }
          catch (error) { reject(error); }
        });
        return;
      }
      const message = data.payload;
      finish(() => {
        window.clearTimeout(timeout);
        reject(new Error(message));
      });
    };
    worker.onerror = (event) => finish(() => {
      window.clearTimeout(timeout);
      reject(new Error(event.message || 'Generation worker crashed'));
    });
    worker.postMessage({ type: 'generate', settings });
  });
}

export async function generateGalaxyInWorker(
  rawSettings: GalaxySettings,
  onProgress: (progress: GenerationProgress) => void
): Promise<Galaxy> {
  const settings = normalizeGalaxySettings(rawSettings);
  try {
    return await runWorker(settings, onProgress);
  } catch (workerError) {
    onProgress({ stage: 'recovery', progress: .02, message: 'Перезапуск генератора без фонового потока' });
    try {
      return verifyGalaxy(await generateGalaxy(settings, onProgress), settings.systemCount);
    } catch (fallbackError) {
      const first = workerError instanceof Error ? workerError.message : 'ошибка worker';
      const second = fallbackError instanceof Error ? fallbackError.message : 'ошибка fallback';
      throw new Error(`Генерация не завершена: ${first}; ${second}`);
    }
  }
}
