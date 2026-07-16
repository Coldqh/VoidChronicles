import type { MainScreen } from '../game/store';

/** Keeps legacy saved routes compatible without letting obsolete screens render. */
export function normalizeMainScreenRoute(screen: MainScreen): MainScreen {
  return screen === 'contracts' ? 'operations' : screen;
}
