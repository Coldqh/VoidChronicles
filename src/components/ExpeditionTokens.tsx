import type { SurfaceObject } from '../generation/surface';

export type ExpeditionEnemyVisual = 'creature' | 'drone' | 'humanoid' | 'swarm' | 'anomaly';

export function enemyVisualForName(name: string): ExpeditionEnemyVisual {
  const normalized = name.toLowerCase();
  if (/дрон|автомат|страж|машин|чистильщик/.test(normalized)) return 'drone';
  if (/рой|колони|спор|паразит/.test(normalized)) return 'swarm';
  if (/аномал|эхо|искаж|сгусток/.test(normalized)) return 'anomaly';
  if (/наём|рейдер|охранник|агент|ополчен|контрабанд|выживш/.test(normalized)) return 'humanoid';
  return 'creature';
}

export function ExpeditionPlayerToken() {
  return <span className="expedition-token expedition-token-player" aria-hidden="true">
    <svg viewBox="0 0 48 48" focusable="false">
      <path className="token-shadow" d="M9 36 24 43 39 36 35 15 24 7 13 15Z"/>
      <path className="token-shell" d="M13 34 24 40 35 34 32 17 24 11 16 17Z"/>
      <path className="token-visor" d="M17 20 24 15 31 20 29 26 19 26Z"/>
      <path className="token-core" d="m24 29 5 3-5 4-5-4Z"/>
      <path className="token-detail" d="M15 29h5M28 29h5M24 11v5"/>
    </svg>
  </span>;
}

export function ExpeditionEnemyToken({ variant }: { variant: ExpeditionEnemyVisual }) {
  return <span className={`expedition-token expedition-token-enemy enemy-${variant}`} aria-hidden="true">
    <svg viewBox="0 0 48 48" focusable="false">
      {variant === 'drone' && <>
        <path className="enemy-shadow" d="M7 31 15 15h18l8 16-17 10Z"/>
        <path className="enemy-body" d="M12 29 18 16h12l6 13-12 8Z"/>
        <circle className="enemy-eye" cx="24" cy="24" r="4"/>
        <path className="enemy-detail" d="M8 20h9M31 20h9M14 34l-5 5M34 34l5 5"/>
      </>}
      {variant === 'humanoid' && <>
        <path className="enemy-shadow" d="m11 39 4-17 4-11h10l4 11 4 17Z"/>
        <path className="enemy-body" d="m15 37 3-15 3-8h6l3 8 3 15-9 4Z"/>
        <path className="enemy-eye" d="M19 18h10l-2 5h-6Z"/>
        <path className="enemy-detail" d="m18 25-7 7M30 25l7 7M20 34h8"/>
      </>}
      {variant === 'swarm' && <>
        <path className="enemy-shadow" d="M7 25c4-13 12-18 23-14 10 3 14 13 8 22-7 10-25 10-31-8Z"/>
        <circle className="enemy-body" cx="17" cy="22" r="6"/>
        <circle className="enemy-body" cx="27" cy="18" r="7"/>
        <circle className="enemy-body" cx="31" cy="29" r="6"/>
        <circle className="enemy-body" cx="19" cy="31" r="7"/>
        <circle className="enemy-eye" cx="24" cy="24" r="3"/>
        <path className="enemy-detail" d="m10 15 5 4M37 14l-5 5M8 35l7-3M39 36l-7-4"/>
      </>}
      {variant === 'anomaly' && <>
        <path className="enemy-shadow" d="M24 5 38 14l4 15-11 13-16-3L6 25 12 10Z"/>
        <path className="enemy-body" d="m24 9 10 8 3 11-8 9-11-2-7-10 5-11Z"/>
        <path className="enemy-eye" d="m24 15 6 9-6 9-6-9Z"/>
        <path className="enemy-detail" d="M24 7v7M39 13l-7 7M42 31l-9-3M13 39l6-8M6 20l9 2"/>
      </>}
      {variant === 'creature' && <>
        <path className="enemy-shadow" d="M6 34 12 19l9-9 13 5 8 13-7 12-17 2Z"/>
        <path className="enemy-body" d="m11 32 5-12 7-6 9 4 5 10-5 8-13 2Z"/>
        <path className="enemy-eye" d="m20 20 5-2 4 4-5 4Z"/>
        <path className="enemy-detail" d="m15 20-8-5M34 21l8-5M15 34l-8 6M33 34l8 6"/>
      </>}
    </svg>
  </span>;
}

export function ExpeditionObjectToken({ kind, objective }: { kind: SurfaceObject['kind']; objective: boolean }) {
  return <span className={`expedition-token expedition-token-object object-${kind} ${objective ? 'is-objective' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 48 48" focusable="false">
      {kind === 'terminal' && <>
        <rect className="object-shell" x="9" y="10" width="30" height="26" rx="4"/>
        <rect className="object-core" x="14" y="15" width="20" height="12" rx="2"/>
        <path className="object-detail" d="M17 32h14M24 27v5"/>
      </>}
      {kind === 'sample' && <>
        <path className="object-shell" d="M18 7h12v7l6 20-5 7H17l-5-7 6-20Z"/>
        <path className="object-core" d="M16 29c5-5 11-5 16 0l2 6-4 4H18l-4-4Z"/>
        <path className="object-detail" d="M18 14h12M21 9h6"/>
      </>}
      {kind === 'artifact' && <>
        <path className="object-shell" d="m24 5 8 11 11 8-11 8-8 11-8-11-11-8 11-8Z"/>
        <path className="object-core" d="m24 13 5 7 7 4-7 5-5 7-5-7-7-5 7-4Z"/>
        <circle className="object-detail" cx="24" cy="24" r="3"/>
      </>}
      {kind === 'door' && <>
        <path className="object-shell" d="M10 6h28v36H10Z"/>
        <path className="object-core" d="M15 11h18v26H15Z"/>
        <circle className="object-detail" cx="29" cy="24" r="2"/>
      </>}
      {kind === 'evidence' && <>
        <path className="object-shell" d="M12 7h19l6 6v28H12Z"/>
        <path className="object-core" d="M31 7v8h7M17 21h15M17 27h15M17 33h10"/>
      </>}
    </svg>
  </span>;
}
