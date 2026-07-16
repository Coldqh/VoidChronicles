import type { ReactNode } from 'react';

export function KnowledgeField({ label, known, children, unknown = 'не установлено' }: { label: string; known: boolean; children: ReactNode; unknown?: string }) {
  return <div className={`v31-knowledge-field ${known ? 'known' : 'unknown'}`}><span>{label}</span><b>{known ? children : unknown}</b></div>;
}
