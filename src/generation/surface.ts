import { createRng } from './rng';

export type SurfaceTileKind = 'floor' | 'rock' | 'hazard' | 'ruin' | 'exit' | 'artifact';
export interface SurfaceTile { x: number; y: number; kind: SurfaceTileKind; revealed: boolean; }
export interface SurfaceEnemy { id: string; x: number; y: number; health: number; name: string; }
export interface SurfaceMap {
  width: number;
  height: number;
  tiles: SurfaceTile[];
  player: { x: number; y: number };
  enemies: SurfaceEnemy[];
  artifactPosition: { x: number; y: number };
}

export function generateSurface(seed: string, width = 18, height = 12): SurfaceMap {
  const rng = createRng(`${seed}:surface`);
  const tiles: SurfaceTile[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let kind: SurfaceTileKind = 'floor';
      const roll = rng.next();
      if (roll < 0.12) kind = 'rock';
      else if (roll < 0.2) kind = 'hazard';
      else if (roll < 0.25) kind = 'ruin';
      tiles.push({ x, y, kind, revealed: Math.hypot(x - 1, y - Math.floor(height / 2)) < 4 });
    }
  }
  const exit = tiles.find((tile) => tile.x === 1 && tile.y === Math.floor(height / 2));
  if (exit) exit.kind = 'exit';
  const artifactPosition = { x: width - 3, y: rng.int(2, height - 3) };
  const artifact = tiles.find((tile) => tile.x === artifactPosition.x && tile.y === artifactPosition.y);
  if (artifact) artifact.kind = 'artifact';
  const enemies = Array.from({ length: rng.int(2, 4) }, (_, index) => ({
    id: `enemy_${index}`,
    x: rng.int(Math.floor(width / 2), width - 2),
    y: rng.int(1, height - 2),
    health: rng.int(35, 65),
    name: rng.pick(['ruin scavenger', 'glass predator', 'security remnant', 'feral pilgrim'])
  }));
  return {
    width,
    height,
    tiles,
    player: { x: 1, y: Math.floor(height / 2) },
    enemies,
    artifactPosition
  };
}
