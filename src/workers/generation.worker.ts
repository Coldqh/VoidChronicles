/// <reference lib="webworker" />
import { generateGalaxy, type GenerationProgress } from '../generation/generateGalaxy';
import type { GalaxySettings } from '../game/types';

type Request = { type: 'generate'; settings: GalaxySettings };
type Response =
  | { type: 'progress'; payload: GenerationProgress }
  | { type: 'complete'; payload: Awaited<ReturnType<typeof generateGalaxy>> }
  | { type: 'error'; payload: string };

self.onmessage = async (event: MessageEvent<Request>) => {
  if (event.data.type !== 'generate') return;
  try {
    const galaxy = await generateGalaxy(event.data.settings, (progress) => {
      self.postMessage({ type: 'progress', payload: progress } satisfies Response);
    });
    self.postMessage({ type: 'complete', payload: galaxy } satisfies Response);
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: error instanceof Error ? error.message : 'Unknown generation error'
    } satisfies Response);
  }
};

export {};
