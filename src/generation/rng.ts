export interface RandomSource {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  fork(label: string): RandomSource;
  id(prefix: string): string;
}

function hashText(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13;
  h ^= h >>> 7;
  h += h << 3;
  h ^= h >>> 17;
  h += h << 5;
  return h >>> 0;
}

export function createRng(seed: string): RandomSource {
  let state = hashText(seed) || 0x6d2b79f5;
  let idCounter = 0;
  const next = (): number => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty collection');
      return items[Math.floor(next() * items.length)] as T;
    },
    chance(probability) {
      return next() < Math.max(0, Math.min(1, probability));
    },
    fork(label) {
      return createRng(`${seed}::${label}`);
    },
    id(prefix) {
      idCounter += 1;
      return `${prefix}_${hashText(`${seed}:${prefix}:${idCounter}`).toString(36)}`;
    }
  };
}

export function stableHash(seed: string): string {
  return hashText(seed).toString(36).padStart(7, '0');
}
