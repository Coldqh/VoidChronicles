import type { Galaxy, GalaxySettings } from '../game/types';
import type { GenerationProgress } from './generateGalaxy';
import GenerationWorker from '../workers/generation.worker?worker';

export function generateGalaxyInWorker(
  settings: GalaxySettings,
  onProgress: (progress: GenerationProgress) => void
): Promise<Galaxy> {
  return new Promise((resolve, reject) => {
    const worker = new GenerationWorker();
    worker.onmessage = (event: MessageEvent<
      | { type: 'progress'; payload: GenerationProgress }
      | { type: 'complete'; payload: Galaxy }
      | { type: 'error'; payload: string }
    >) => {
      if (event.data.type === 'progress') onProgress(event.data.payload);
      if (event.data.type === 'complete') {
        worker.terminate();
        resolve(event.data.payload);
      }
      if (event.data.type === 'error') {
        worker.terminate();
        reject(new Error(event.data.payload));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Generation worker crashed'));
    };
    worker.postMessage({ type: 'generate', settings });
  });
}
