export function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function formatInteger(value: number, fallback = 0): string {
  return Math.round(finiteNumber(value, fallback)).toLocaleString('ru-RU');
}

export function formatMetric(value: number, suffix = '/100'): string {
  return `${formatInteger(Math.max(0, Math.min(100, value)))}${suffix}`;
}

export function formatPopulation(value: number): string {
  const rounded = Math.max(0, Math.round(finiteNumber(value)));
  if (rounded >= 1_000_000_000) return `${(rounded / 1_000_000_000).toFixed(1).replace('.', ',')} млрд`;
  if (rounded >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1).replace('.', ',')} млн`;
  if (rounded >= 10_000) return `${Math.round(rounded / 1_000).toLocaleString('ru-RU')} тыс.`;
  return rounded.toLocaleString('ru-RU');
}

export function formatSignedInteger(value: number): string {
  const rounded = Math.round(finiteNumber(value));
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('ru-RU')}`;
}

export function formatPercent(value: number): string {
  return `${formatInteger(value)}%`;
}
