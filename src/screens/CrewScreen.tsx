import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { roleLabel } from '../crew/generateCrew';
import { crewReadiness } from '../ship/life';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import type { ShipCompartmentId } from '../game/types';

export function CrewScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(store.crew[0]?.id ?? null);
  const issues = store.ship?.life?.issues.filter((entry) => entry.status === 'open') ?? [];
  const selected = store.crew.find((member) => member.id === selectedId) ?? store.crew[0];
  const averageReadiness = store.crew.length ? Math.round(store.crew.reduce((sum, member) => sum + crewReadiness(member), 0) / store.crew.length) : 100;
  const selectedRelationships = useMemo(() => selected?.relationships?.map((entry) => ({ ...entry, other: store.crew.find((member) => member.id === entry.crewId) })).filter((entry) => entry.other) ?? [], [selected, store.crew]);

  return <div className="game-shell">{chrome}<main className="v35-crew">
    <div className="v35-crew-ambient" aria-hidden="true"><i/><i/></div>
    <header className="v35-screen-hero compact">
      <div><span className="eyebrow">ЛЮДИ КОРАБЛЯ</span><h1>Экипаж — не набор характеристик</h1><p>Каждый человек приходит со страхами, долгами, убеждениями и пределом верности.</p></div>
      <div className="v35-hero-score"><span>ОБЩАЯ ГОТОВНОСТЬ</span><b>{averageReadiness}%</b><small>{issues.length ? `${issues.length} конфликтов требуют решения` : 'открытых конфликтов нет'}</small></div>
    </header>

    {issues.length > 0 && <section className="v35-crew-crisis">
      <header><span className="eyebrow">ТРЕБУЕТ РЕШЕНИЯ</span><b>{issues.length}</b></header>
      {issues.slice(0, 2).map((issue) => <article key={issue.id}><div><span>СЕРЬЁЗНОСТЬ {formatInteger(issue.severity)}</span><h2>{issue.title}</h2><p>{issue.summary}</p></div><div><button onClick={() => void store.resolveCrewIssue(issue.id, 'mediate')}>Разобрать</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'side-first')}>Поддержать первого</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'side-second')}>Поддержать второго</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'ignore')}>Игнорировать</button></div></article>)}
    </section>}

    <section className="v35-crew-layout">
      <aside className="v35-crew-roster">
        <header><div><span className="eyebrow">НА БОРТУ</span><h2>{store.crew.length}/4</h2></div><button disabled={Boolean(store.busyAction)} onClick={() => void store.restCrew()}>Смена отдыха</button></header>
        <div>{store.crew.map((member) => {
          const readiness = crewReadiness(member);
          return <button key={member.id} className={`${selected?.id === member.id ? 'active' : ''} readiness-${readiness < 40 ? 'low' : readiness < 70 ? 'mid' : 'high'}`} onClick={() => setSelectedId(member.id)}>
            <i data-letter={member.name.slice(0, 1)}><span style={{ '--readiness': `${readiness * 3.6}deg` } as React.CSSProperties}/></i>
            <span><b>{member.name}</b><small>{roleLabel(member.primaryRole)} · {member.species}</small></span>
            <em>{readiness}%</em>
          </button>;
        })}</div>
        {!store.crew.length && <p>Капитан работает один.</p>}
        <button className="v35-find-crew" disabled={Boolean(store.busyAction)} onClick={() => void store.refreshCrewCandidates()}>Найти кандидатов · ₡40</button>
      </aside>

      {selected ? <section className="v35-crew-dossier">
        <header className="v35-crew-identity">
          <div className="v35-portrait" data-letter={selected.name.slice(0, 1)}><i/><span/></div>
          <div><span className="eyebrow">{roleLabel(selected.primaryRole).toUpperCase()} · {selected.status.toUpperCase()}</span><h1>{selected.name}</h1><p>{selected.species} · {selected.culture}</p><div className="tags">{selected.traits.map((trait) => <span key={trait}>{trait}</span>)}</div></div>
          <strong>{crewReadiness(selected)}<small>готовность</small></strong>
        </header>

        <section className="v35-crew-vitals">
          <article><span>Здоровье</span><b>{formatInteger(selected.health)}</b><i style={{ width: `${Math.min(100, selected.health / Math.max(1, selected.maxHealth) * 100)}%` }}/></article>
          <article><span>Мораль</span><b>{formatInteger(selected.morale)}</b><i style={{ width: `${selected.morale}%` }}/></article>
          <article><span>Верность</span><b>{formatInteger(selected.loyalty)}</b><i style={{ width: `${selected.loyalty}%` }}/></article>
          <article className={(selected.fatigue ?? 0) > 65 ? 'warning' : ''}><span>Усталость</span><b>{formatInteger(selected.fatigue ?? 0)}</b><i style={{ width: `${selected.fatigue ?? 0}%` }}/></article>
          <article className={(selected.stress ?? 0) > 65 ? 'warning' : ''}><span>Стресс</span><b>{formatInteger(selected.stress ?? 0)}</b><i style={{ width: `${selected.stress ?? 0}%` }}/></article>
        </section>

        <section className="v35-crew-story-grid">
          <article className="v35-personal-story"><span className="eyebrow">ЛИЧНАЯ ЛИНИЯ</span><h2>{selected.personalArc?.title ?? 'История пока закрыта'}</h2><p>{selected.personalArc?.summary ?? `${selected.name} ещё не доверяет капитану достаточно.`}</p>{selected.personalArc && <div>{selected.personalArc.status === 'dormant' && <button className="v35-cta" onClick={() => void store.handleCrewStory(selected.id, 'listen')}>Поговорить <i>→</i></button>}{selected.personalArc.status === 'active' && <><button className="v35-cta" onClick={() => void store.handleCrewStory(selected.id, 'help')}>Помочь · ₡120 <i>→</i></button><button onClick={() => void store.handleCrewStory(selected.id, 'refuse')}>Отказать</button></>}</div>}</article>
          <article className="v35-crew-belief"><span className="eyebrow">УБЕЖДЕНИЕ</span><blockquote>{selected.belief}</blockquote><small>Люди реагируют на решения капитана через собственные ценности.</small></article>
        </section>

        <section className="v35-crew-relations">
          <header><div><span className="eyebrow">ОТНОШЕНИЯ НА БОРТУ</span><h2>Кому доверяет</h2></div><label>Пост<select value={selected.shipCompartmentId ?? 'quarters'} onChange={(event: ChangeEvent<HTMLSelectElement>) => void store.assignCrewCompartment(selected.id, event.target.value as ShipCompartmentId)}>{store.ship?.life?.compartments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></header>
          <div>{selectedRelationships.length ? selectedRelationships.map((entry) => <article key={entry.crewId}><i>{entry.other!.name.slice(0, 1)}</i><span><b>{entry.other!.name}</b><small>{entry.reason}</small></span><div><em>близость {formatInteger(entry.affinity)}</em><em className={entry.tension > 55 ? 'critical' : ''}>напряжение {formatInteger(entry.tension)}</em></div></article>) : <p>Общая история ещё не сложилась.</p>}</div>
        </section>

        <footer className="v35-crew-actions"><button className="danger-button" onClick={() => void store.dismissCrew(selected.id)}>Расторгнуть контракт</button></footer>
      </section> : <section className="v35-empty-state"><i>♟</i><h2>Экипаж не набран</h2><p>Найди кандидатов на станции.</p></section>}

      <aside className="v35-candidates">
        <header><span className="eyebrow">КАНДИДАТЫ</span><h2>{store.crewCandidates.length}</h2></header>
        <div>{store.crewCandidates.map((candidate) => <article key={candidate.id}><div className="v35-candidate-face">{candidate.name.slice(0, 1)}</div><span>{roleLabel(candidate.primaryRole)} · уровень {candidate.level}</span><h3>{candidate.name}</h3><p>{candidate.species} · {candidate.culture}</p><div className="tags">{candidate.traits.slice(0, 3).map((trait) => <span key={trait}>{trait}</span>)}</div><button className="primary-button" disabled={store.crew.length >= 4 || (store.captain?.credits ?? 0) < candidate.signingCost} onClick={() => void store.hireCrew(candidate.id)}>Нанять · ₡{candidate.signingCost}</button></article>)}</div>
        {!store.crewCandidates.length && <p>Обнови поиск, когда прибудешь на населённую станцию.</p>}
      </aside>
    </section>
  </main></div>;
}
