import type { ChangeEvent, ReactNode } from 'react';
import { roleLabel } from '../crew/generateCrew';
import { crewReadiness } from '../ship/life';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';

export function CrewScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const issues = store.ship?.life?.issues.filter((entry) => entry.status === 'open') ?? [];
  return <div className="game-shell">{chrome}<main className="crew-life-screen">
    <header className="crew-life-header">
      <div><span className="eyebrow">ЛЮДИ КОРАБЛЯ</span><h1>Экипаж</h1><p>Усталость, стресс и отношения переходят между операциями.</p></div>
      <div><button disabled={Boolean(store.busyAction)} onClick={() => void store.refreshCrewCandidates()}>Найти кандидатов · ₡40</button><button disabled={!store.crew.length || Boolean(store.busyAction)} onClick={() => void store.restCrew()}>Смена отдыха</button></div>
    </header>
    {issues.length > 0 && <section className="crew-issues"><h2>Требуют решения</h2>{issues.map((issue) => <article key={issue.id}><span>СЕРЬЁЗНОСТЬ {formatInteger(issue.severity)}</span><h3>{issue.title}</h3><p>{issue.summary}</p><div><button onClick={() => void store.resolveCrewIssue(issue.id, 'mediate')}>Разобрать конфликт</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'side-first')}>Поддержать первого</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'side-second')}>Поддержать второго</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'ignore')}>Не вмешиваться</button></div></article>)}</section>}
    <section className="crew-life-columns">
      <div><h2>На борту · {store.crew.length}/4</h2><div className="crew-life-grid">{store.crew.length ? store.crew.map((member) => {
        const compartment = store.ship?.life?.compartments.find((entry) => entry.id === member.shipCompartmentId);
        return <article key={member.id} className={`crew-life-card status-${member.status}`}>
          <header><div className="crew-avatar">{member.name.slice(0,1)}</div><div><span>{roleLabel(member.primaryRole)}</span><h3>{member.name}</h3><p>{member.species} · {member.culture}</p></div><strong>{crewReadiness(member)}%</strong></header>
          <div className="crew-life-metrics"><span>Здоровье <b>{formatInteger(member.health)}</b></span><span>Мораль <b>{formatInteger(member.morale)}</b></span><span>Верность <b>{formatInteger(member.loyalty)}</b></span><span>Усталость <b>{formatInteger(member.fatigue ?? 0)}</b></span><span>Стресс <b>{formatInteger(member.stress ?? 0)}</b></span><span>Пост <b>{compartment?.name ?? 'не назначен'}</b></span></div>
          {member.personalArc && <section className="crew-personal-arc"><span>{member.personalArc.status}</span><b>{member.personalArc.title}</b><p>{member.personalArc.summary}</p><div>{member.personalArc.status === 'dormant' && <button onClick={() => void store.handleCrewStory(member.id, 'listen')}>Поговорить</button>}{member.personalArc.status === 'active' && <><button onClick={() => void store.handleCrewStory(member.id, 'help')}>Помочь · ₡120</button><button onClick={() => void store.handleCrewStory(member.id, 'refuse')}>Отказать</button></>}</div></section>}
          {(member.relationships?.length ?? 0) > 0 && <details><summary>Отношения на борту</summary>{member.relationships?.map((entry) => { const other=store.crew.find((candidate)=>candidate.id===entry.crewId); return <p key={entry.crewId}><b>{other?.name ?? entry.crewId}</b><span> близость {entry.affinity} · напряжение {entry.tension}</span></p>; })}</details>}
          <label className="crew-post-select">Пост<select value={member.shipCompartmentId ?? 'quarters'} onChange={(event: ChangeEvent<HTMLSelectElement>) => void store.assignCrewCompartment(member.id, event.target.value as import('../game/types').ShipCompartmentId)}>{store.ship?.life?.compartments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <div className="tags">{member.traits.map((trait)=><span key={trait}>{trait}</span>)}</div>
          <button className="danger-button" onClick={()=>void store.dismissCrew(member.id)}>Расторгнуть контракт</button>
        </article>;
      }) : <p className="empty-state">Ты пока один.</p>}</div></div>
      <div><h2>Кандидаты</h2><div className="crew-life-grid compact">{store.crewCandidates.map((candidate)=><article key={candidate.id} className="crew-life-card candidate"><h3>{candidate.name}</h3><p>{candidate.species} · {candidate.culture}</p><b>{roleLabel(candidate.primaryRole)} · уровень {candidate.level}</b><div className="tags">{candidate.traits.map((trait)=><span key={trait}>{trait}</span>)}</div><button className="primary-button" disabled={store.crew.length>=4 || (store.captain?.credits??0)<candidate.signingCost} onClick={()=>void store.hireCrew(candidate.id)}>Нанять · ₡{candidate.signingCost}</button></article>)}</div></div>
    </section>
  </main></div>;
}
