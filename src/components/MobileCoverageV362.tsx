import type { ReactNode } from 'react';

export interface MobileCoverageTab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface MobileCoverageV362Props<T extends string> {
  chrome?: ReactNode;
  eyebrow: string;
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  tabs: MobileCoverageTab<T>[];
  activeTab: T;
  onTabChange(tab: T): void;
  children: ReactNode;
  className?: string;
}

export function MobileCoverageV362<T extends string>({
  chrome,
  eyebrow,
  title,
  badge,
  action,
  tabs,
  activeTab,
  onTabChange,
  children,
  className = ''
}: MobileCoverageV362Props<T>) {
  const tabClass = tabs.length >= 5 ? 'five' : tabs.length === 4 ? 'four' : tabs.length === 3 ? 'three' : 'two';
  return <div className="game-shell v361-shell v362-shell">
    {chrome}
    <main className={`v361-screen v362-screen ${className}`}>
      <header className="v361-screen-header v362-screen-header">
        <div><span>{eyebrow}</span><h1>{title}</h1></div>
        {action ?? (badge !== undefined ? <b>{badge}</b> : null)}
      </header>
      <nav className={`v361-tabs v362-tabs ${tabClass}`} aria-label={`${title}: разделы`}>
        {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => onTabChange(tab.id)}>
          {tab.label}{tab.count !== undefined && <b>{tab.count}</b>}
        </button>)}
      </nav>
      <section className="v361-tab-body v362-body">{children}</section>
    </main>
  </div>;
}

export function MobileEmptyV362({ title, text }: { title: string; text: string }) {
  return <div className="v361-empty"><b>{title}</b><p>{text}</p></div>;
}

export function MobileBackV362({ onClick, label = 'Назад к списку' }: { onClick(): void; label?: string }) {
  return <button className="v361-back" onClick={onClick}>← {label}</button>;
}
