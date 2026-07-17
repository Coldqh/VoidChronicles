import { useMemo, useState, type ReactNode } from 'react';
import { roleLabel } from '../crew/generateCrew';
import { crewReadiness } from '../ship/life';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import type { ShipCompartmentId } from '../game/types';
import { MobileBackV362, MobileCoverageV362, MobileEmptyV362 } from '../components/MobileCoverageV362';

type CrewTab = 'crew' | 'issues' | 'hiring';
type CrewDossierTab = 'status' | 'relations' | 'story';

export function MobileCrewScreenV362({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<CrewTab>('crew');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossierTab, setDossierTab] = useState<CrewDossierTab>('status');
  const [notice, setNotice] = useState('');
  const issues = store.ship?.life?.issues.filter((entry) => entry.status === 'open') ?? [];
  const selected = store.crew.find((entry) => entry.id === selectedId);
  const averageReadiness = store.crew.length ? Math.round(store.crew.reduce((sum, member) => sum + crewReadiness(member), 0) / store.crew.length) : 100;
  const relations = useMemo(() => selected?.relationships?.map((entry) => ({ ...entry, other: store.crew.find((member) => member.id === entry.crewId) })).filter((entry) => entry.other) ?? [], [selected, store.crew]);

  const tabs = [
    { id: 'crew' as const, label: 'Команда', count: store.crew.length },
    { id: 'issues' as const, label: 'Проблемы', count: issues.length },
    { id: 'hiring' as const, label: 'Найм', count: store.crewCandidates.length }
  ];

  const setMainTab = (next: CrewTab) => {
    setTab(next);
    setSelectedId(null);
  };

  return <MobileCoverageV362<CrewTab>
    chrome={chrome}
    eyebrow="ЛЮДИ КОРАБЛЯ"
    title="Экипаж"
    badge={`${averageReadiness}%`}
    tabs={tabs}
    activeTab={tab}
    onTabChange={setMainTab}
    className="v362-crew-screen"
  >
    {notice && <button className="v361-notice" onClick={() => setNotice('')}>{notice}</button>}

    {tab === 'crew' && !selected && <div className="v361-scroll-list">
      <div className="v362-action-grid two"><button onClick={() => void store.restCrew()}>Смена отдыха</button><button onClick={() => void store.settlePayroll()}>Закрыть выплаты</button></div>
      {store.crew.map((member) => {
        const readiness = crewReadiness(member);
        return <button className={`v361-list-button ${readiness < 40 ? 'danger' : readiness >= 75 ? 'good' : ''}`} key={member.id} onClick={() => { setSelectedId(member.id); setDossierTab('status'); }}>
          <span>{roleLabel(member.primaryRole).toUpperCase()} · {member.status.toUpperCase()}</span><b>{member.name}</b><p>{member.species} · {member.culture}</p><em>{readiness}%</em>
        </button>;
      })}
      {!store.crew.length && <MobileEmptyV362 title="Капитан работает один" text="Найди кандидатов на населённой станции."/>}
    </div>}

    {tab === 'crew' && selected && <article className="v361-dossier">
      <MobileBackV362 onClick={() => setSelectedId(null)}/>
      <span>{roleLabel(selected.primaryRole).toUpperCase()} · {selected.status.toUpperCase()}</span><h2>{selected.name}</h2><p>{selected.species} · {selected.culture}</p>
      <nav className="v361-subtabs">
        {(['status','relations','story'] as CrewDossierTab[]).map((entry) => <button key={entry} className={dossierTab === entry ? 'active' : ''} onClick={() => setDossierTab(entry)}>{entry === 'status' ? 'Состояние' : entry === 'relations' ? 'Отношения' : 'История'}</button>)}
      </nav>

      {dossierTab === 'status' && <>
        <div className="v362-vitals-grid five">
          <article><span>Здоровье</span><b>{formatInteger(selected.health)}</b></article>
          <article><span>Мораль</span><b>{formatInteger(selected.morale)}</b></article>
          <article><span>Верность</span><b>{formatInteger(selected.loyalty)}</b></article>
          <article className={(selected.fatigue ?? 0) > 65 ? 'critical' : ''}><span>Усталость</span><b>{formatInteger(selected.fatigue ?? 0)}</b></article>
          <article className={(selected.stress ?? 0) > 65 ? 'critical' : ''}><span>Стресс</span><b>{formatInteger(selected.stress ?? 0)}</b></article>
        </div>
        <label className="v362-field"><span>ПОСТ НА КОРАБЛЕ</span><select value={selected.shipCompartmentId ?? 'quarters'} onChange={(event) => void store.assignCrewCompartment(selected.id, event.target.value as ShipCompartmentId)}>{store.ship?.life?.compartments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <div className="v361-chip-list">{selected.traits.map((trait) => <span key={trait}>{trait}</span>)}</div>
        <div className="v361-detail-block"><h3>Убеждение</h3><p>{selected.belief}</p></div>
      </>}

      {dossierTab === 'relations' && <div className="v362-dossier-list">
        {relations.map((entry) => <article className="v362-relation-row" key={entry.crewId}><div><b>{entry.other!.name}</b><small>{entry.reason}</small></div><span>близость {formatInteger(entry.affinity)} · напряжение {formatInteger(entry.tension)}</span></article>)}
        {!relations.length && <MobileEmptyV362 title="Связи ещё не сложились" text="Отношения меняются после перелётов, конфликтов и решений."/>}
      </div>}

      {dossierTab === 'story' && <>
        <div className="v361-detail-block"><h3>{selected.personalArc?.title ?? 'История закрыта'}</h3><p>{selected.personalArc?.summary ?? `${selected.name} пока не доверяет капитану достаточно.`}</p></div>
        {selected.personalArc?.status === 'dormant' && <button className="primary-button v362-wide-button" onClick={() => void store.handleCrewStory(selected.id, 'listen')}>Поговорить</button>}
        {selected.personalArc?.status === 'active' && <div className="v362-action-grid two"><button className="primary-button" onClick={() => void store.handleCrewStory(selected.id, 'help')}>Помочь · ₡120</button><button onClick={() => void store.handleCrewStory(selected.id, 'refuse')}>Отказать</button></div>}
        <div className="v362-section-title"><span>ПАМЯТЬ</span><b>{selected.memories.length}</b></div>
        {selected.memories.slice().reverse().slice(0, 8).map((memory) => <div className="v361-list-static" key={memory.id}><span>ГОД {memory.year} · {memory.kind}</span><b>{memory.text}</b><p>Влияние {memory.impact}</p></div>)}
      </>}

      <footer><button className="danger-button" onClick={() => { if (window.confirm(`Расторгнуть контракт с ${selected.name}?`)) void store.dismissCrew(selected.id); }}>Расторгнуть контракт</button></footer>
    </article>}

    {tab === 'issues' && <div className="v361-scroll-list">
      {issues.map((issue) => <article className="v362-issue-card" key={issue.id}><span>СЕРЬЁЗНОСТЬ {formatInteger(issue.severity)} · {issue.kind.toUpperCase()}</span><b>{issue.title}</b><p>{issue.summary}</p><div className="v362-action-grid two"><button onClick={() => void store.resolveCrewIssue(issue.id, 'mediate')}>Разобрать</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'ignore')}>Игнорировать</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'side-first')}>Первый</button><button onClick={() => void store.resolveCrewIssue(issue.id, 'side-second')}>Второй</button></div></article>)}
      {!issues.length && <MobileEmptyV362 title="Открытых проблем нет" text="Конфликты, просьбы и нехватка ресурсов появятся во время кампании."/>}
    </div>}

    {tab === 'hiring' && <div className="v361-scroll-list">
      <button className="primary-button v362-wide-button" disabled={Boolean(store.busyAction)} onClick={async () => { await store.refreshCrewCandidates(); setNotice('Список кандидатов обновлён.'); }}>Найти кандидатов · ₡40</button>
      {store.crewCandidates.map((candidate) => <article className="v362-candidate-card" key={candidate.id}><span>{roleLabel(candidate.primaryRole).toUpperCase()} · УРОВЕНЬ {candidate.level}</span><b>{candidate.name}</b><p>{candidate.species} · {candidate.culture}</p><div className="v361-chip-list">{candidate.traits.slice(0, 3).map((trait) => <span key={trait}>{trait}</span>)}</div><button className="primary-button" disabled={store.crew.length >= 4 || (store.captain?.credits ?? 0) < candidate.signingCost} onClick={() => void store.hireCrew(candidate.id)}>Нанять · ₡{candidate.signingCost}</button></article>)}
      {!store.crewCandidates.length && <MobileEmptyV362 title="Кандидатов нет" text="Обнови поиск после стыковки с населённым узлом."/>}
    </div>}
  </MobileCoverageV362>;
}
