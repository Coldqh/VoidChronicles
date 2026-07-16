import type { ReactNode } from 'react';

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="v31-metric"><span>{label}</span><b>{value}</b>{hint && <small>{hint}</small>}</div>;
}
