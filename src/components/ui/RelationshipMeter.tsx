import { formatInteger } from '../../ui/format';

export function RelationshipMeter({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const normalized = Math.max(0, Math.min(100, Math.round(inverse ? value : (value + 100) / 2)));
  return <div className="v31-relationship"><div><span>{label}</span><b>{formatInteger(value)}</b></div><i><em style={{ width: `${normalized}%` }}/></i></div>;
}
