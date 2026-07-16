import type { DiplomaticActionDefinition, DiplomaticActionId } from '../../diplomacy/model';

export function ActionPanel({ actions, busy, onAction }: { actions: DiplomaticActionDefinition[]; busy?: DiplomaticActionId; onAction(action: DiplomaticActionId): void }) {
  return <section className="v31-action-grid">{actions.map((action) => <button key={action.id} disabled={!action.available || Boolean(busy)} onClick={() => onAction(action.id)} className={action.available ? 'available' : 'locked'}><span>{action.cost > 0 ? `₡${action.cost}` : 'ДИПЛОМАТИЯ'}</span><b>{action.label}</b><small>{action.available ? action.description : action.blockedReason}</small></button>)}</section>;
}
