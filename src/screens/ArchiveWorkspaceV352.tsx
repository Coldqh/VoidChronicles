import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../game/store';

const formatYear = (year: number) => year < 0 ? `${Math.abs(year).toLocaleString('ru-RU')} лет до старта` : `Год ${year}`;

type ArchiveTab = 'discoveries' | 'evidence' | 'hypotheses' | 'chains' | 'locations' | 'history';

type ArchiveEntry = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  footer?: string;
  status?: string;
};

const tabLabels: Record<ArchiveTab, string> = {
  discoveries: 'Открытия',
  evidence: 'Улики',
  hypotheses: 'Гипотезы',
  chains: 'Цепочки',
  locations: 'Локации',
  history: 'История'
};

export function ArchiveWorkspaceV352() {
  const store = useGameStore();
  const [tab, setTab] = useState<ArchiveTab>('discoveries');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const entries = useMemo<ArchiveEntry[]>(() => {
    if (!store.galaxy) return [];
    const normalized = query.trim().toLowerCase();
    const match = (value: string) => !normalized || value.toLowerCase().includes(normalized);

    if (tab === 'discoveries') return store.discoveries
      .filter((entry) => match(`${entry.name} ${entry.description}`))
      .map((entry) => ({ id: entry.id, eyebrow: `${entry.kind} · достоверность ${entry.confidence}%`, title: entry.name, body: entry.description, status: entry.kind }));

    if (tab === 'evidence') return store.evidence
      .filter((entry) => match(`${entry.title} ${entry.description}`))
      .map((entry) => ({
        id: entry.id,
        eyebrow: `${entry.kind} · надёжность ${entry.reliability}%`,
        title: entry.title,
        body: entry.description,
        footer: store.pointsOfInterest.find((point) => point.id === entry.pointOfInterestId)?.name,
        status: entry.kind
      }));

    if (tab === 'hypotheses') return store.hypotheses
      .filter((entry) => match(`${entry.title} ${entry.summary}`))
      .map((entry) => ({ id: entry.id, eyebrow: `${entry.status} · уверенность ${entry.confidence}%`, title: entry.title, body: entry.summary, footer: entry.disposition ? `решение: ${entry.disposition}` : 'решение не принято', status: entry.status }));

    if (tab === 'chains') return store.archaeologyChains
      .filter((entry) => match(`${entry.title} ${entry.summary}`))
      .map((entry) => ({ id: entry.id, eyebrow: `${entry.status} · этапов ${entry.stages.length}`, title: entry.title, body: entry.summary, footer: entry.stages.map((stage) => `${stage.title}: ${stage.status}`).join(' · '), status: entry.status }));

    if (tab === 'locations') return store.locationStates
      .map((state) => {
        const point = store.pointsOfInterest.find((entry) => entry.id === state.pointOfInterestId);
        return {
          id: state.pointOfInterestId,
          eyebrow: `визитов ${state.visitCount} · ${state.lastOutcome}`,
          title: point?.name ?? state.pointOfInterestId,
          body: `Врагов осталось: ${state.enemyStates.filter((enemy) => enemy.health > 0).length}. Объектов использовано: ${state.resolvedObjectIds.length}. Данных забрано: ${state.collectedEvidenceKeys.length}.`,
          footer: point?.publicSummary,
          status: state.lastOutcome
        };
      })
      .filter((entry) => match(`${entry.title} ${entry.body}`));

    return store.galaxy.history
      .filter((entry) => entry.systemIds.some((id) => store.galaxy?.systems.find((system) => system.id === id)?.visited) || entry.civilizationIds.some((id) => store.civilizationContacts.find((contact) => contact.civilizationId === id && contact.stage !== 'unknown')))
      .slice(-200)
      .reverse()
      .filter((entry) => match(`${entry.title} ${entry.summary}`))
      .map((entry) => ({ id: entry.id, eyebrow: formatYear(entry.year), title: entry.title, body: entry.summary, status: 'history' }));
  }, [query, store.archaeologyChains, store.civilizationContacts, store.discoveries, store.evidence, store.galaxy, store.hypotheses, store.locationStates, store.pointsOfInterest, tab]);

  useEffect(() => {
    if (!entries.length) setSelectedId(null);
    else if (!selectedId || !entries.some((entry) => entry.id === selectedId)) setSelectedId(entries[0].id);
  }, [entries, selectedId]);

  if (!store.galaxy) return null;
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const selectedHypothesis = tab === 'hypotheses' ? store.hypotheses.find((entry) => entry.id === selected?.id) : undefined;
  const selectedChain = tab === 'chains' ? store.archaeologyChains.find((entry) => entry.id === selected?.id) : undefined;
  const selectedLocation = tab === 'locations' ? store.locationStates.find((entry) => entry.pointOfInterestId === selected?.id) : undefined;

  const resolveHypothesis = async (disposition: 'published' | 'sold' | 'suppressed') => {
    if (!selectedHypothesis) return;
    await store.resolveHypothesis(selectedHypothesis.id, disposition);
    setNotice('Решение по гипотезе сохранено.');
  };

  return <main className="v352-workspace v352-archive-workspace">
    <header className="v352-workspace-hero">
      <div><span className="eyebrow">ИССЛЕДОВАТЕЛЬСКИЙ АРХИВ</span><h1>Память экспедиции</h1><p>Каждая запись связана с реальным открытием, местом, уликой или решением капитана.</p></div>
      <label className="v352-search"><span>ПОИСК ПО АРХИВУ</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, объект, событие"/></label>
    </header>

    {notice && <button className="v352-toast" onClick={() => setNotice('')}>{notice}</button>}

    <nav className="v352-archive-tabs">{(Object.keys(tabLabels) as ArchiveTab[]).map((id) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setSelectedId(null); }}>{tabLabels[id]}<b>{id === 'discoveries' ? store.discoveries.length : id === 'evidence' ? store.evidence.length : id === 'hypotheses' ? store.hypotheses.length : id === 'chains' ? store.archaeologyChains.length : id === 'locations' ? store.locationStates.length : store.galaxy?.history.length ?? 0}</b></button>)}</nav>

    <section className="v352-archive-grid">
      <aside className="v352-archive-list">
        <header><span>{tabLabels[tab]}</span><b>{entries.length}</b></header>
        <div>{entries.map((entry) => <button key={entry.id} className={selected?.id === entry.id ? 'active' : ''} onClick={() => setSelectedId(entry.id)}><i/><span><small>{entry.eyebrow}</small><b>{entry.title}</b><p>{entry.body}</p></span></button>)}</div>
        {!entries.length && <p className="v352-empty">Записей по этому фильтру нет.</p>}
      </aside>

      <article className="v352-archive-dossier">
        {selected ? <>
          <header><span className="eyebrow">{selected.eyebrow}</span><h2>{selected.title}</h2><p>{selected.body}</p></header>
          {selected.footer && <section className="v352-dossier-block"><span>СВЯЗАННАЯ ЗАПИСЬ</span><p>{selected.footer}</p></section>}

          {selectedHypothesis && <section className="v352-dossier-block"><span>РЕШЕНИЕ ПО ГИПОТЕЗЕ</span><dl><div><dt>Статус</dt><dd>{selectedHypothesis.status}</dd></div><div><dt>Уверенность</dt><dd>{selectedHypothesis.confidence}%</dd></div><div><dt>Решение</dt><dd>{selectedHypothesis.disposition ?? 'не принято'}</dd></div></dl>{!selectedHypothesis.disposition && <div className="v352-actions"><button onClick={() => void resolveHypothesis('published')}>Опубликовать</button><button onClick={() => void resolveHypothesis('sold')}>Продать</button><button className="danger-button" onClick={() => void resolveHypothesis('suppressed')}>Скрыть</button></div>}</section>}

          {selectedChain && <section className="v352-chain"><span>ЭТАПЫ РАССЛЕДОВАНИЯ</span>{selectedChain.stages.map((stage, index) => <div key={stage.id} className={`status-${stage.status}`}><i>{index + 1}</i><span><b>{stage.title}</b><small>{stage.status}</small></span></div>)}</section>}

          {selectedLocation && <section className="v352-dossier-block"><span>СОСТОЯНИЕ ЛОКАЦИИ</span><dl><div><dt>Посещений</dt><dd>{selectedLocation.visitCount}</dd></div><div><dt>Живых противников</dt><dd>{selectedLocation.enemyStates.filter((enemy) => enemy.health > 0).length}</dd></div><div><dt>Собрано данных</dt><dd>{selectedLocation.collectedEvidenceKeys.length}</dd></div></dl></section>}

          <footer className="v352-log-strip"><span>ПОСЛЕДНИЕ ЗАПИСИ КОРАБЛЯ</span>{store.logs.slice(0, 5).map((entry) => <p key={entry.id}><b>{entry.title}</b></p>)}</footer>
        </> : <div className="v352-empty"><b>Архив пуст</b><p>Новые записи появятся после сканов, экспедиций и решений.</p></div>}
      </article>
    </section>
  </main>;
}
