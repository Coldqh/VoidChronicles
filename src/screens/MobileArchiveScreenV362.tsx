import { useEffect, useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import { MobileBackV362, MobileCoverageV362, MobileEmptyV362 } from '../components/MobileCoverageV362';

type ArchiveTab = 'discoveries' | 'evidence' | 'hypotheses' | 'chains';

export function MobileArchiveScreenV362({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<ArchiveTab>('discoveries');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => setSelectedId(null), [tab]);

  const selectedDiscovery = tab === 'discoveries' ? store.discoveries.find((entry) => entry.id === selectedId) : undefined;
  const selectedEvidence = tab === 'evidence' ? store.evidence.find((entry) => entry.id === selectedId) : undefined;
  const selectedHypothesis = tab === 'hypotheses' ? store.hypotheses.find((entry) => entry.id === selectedId) : undefined;
  const selectedChain = tab === 'chains' ? store.archaeologyChains.find((entry) => entry.id === selectedId) : undefined;
  const hasSelection = Boolean(selectedDiscovery || selectedEvidence || selectedHypothesis || selectedChain);

  const tabs = [
    { id: 'discoveries' as const, label: 'Открытия', count: store.discoveries.length },
    { id: 'evidence' as const, label: 'Улики', count: store.evidence.length },
    { id: 'hypotheses' as const, label: 'Гипотезы', count: store.hypotheses.length },
    { id: 'chains' as const, label: 'Цепочки', count: store.archaeologyChains.length }
  ];

  return <MobileCoverageV362<ArchiveTab> chrome={chrome} eyebrow="ИССЛЕДОВАТЕЛЬСКИЙ АРХИВ" title="Архив" badge={store.discoveries.length} tabs={tabs} activeTab={tab} onTabChange={setTab} className="v362-archive-screen">
    {notice && <button className="v361-notice" onClick={() => setNotice('')}>{notice}</button>}

    {!hasSelection && tab === 'discoveries' && <div className="v361-scroll-list">{store.discoveries.slice().reverse().map((entry) => <button className="v361-list-button" key={entry.id} onClick={() => setSelectedId(entry.id)}><span>{entry.kind.toUpperCase()} · ДОСТОВЕРНОСТЬ {entry.confidence}%</span><b>{entry.name}</b><p>{entry.description}</p><em>›</em></button>)}{!store.discoveries.length && <MobileEmptyV362 title="Открытий нет" text="Сканирование и экспедиции наполнят этот раздел."/>}</div>}

    {!hasSelection && tab === 'evidence' && <div className="v361-scroll-list">{store.evidence.slice().reverse().map((entry) => <button className="v361-list-button" key={entry.id} onClick={() => setSelectedId(entry.id)}><span>{entry.kind.toUpperCase()} · НАДЁЖНОСТЬ {entry.reliability}%</span><b>{entry.title}</b><p>{entry.description}</p><em>›</em></button>)}{!store.evidence.length && <MobileEmptyV362 title="Улик нет" text="Подтверждённые данные добываются во время высадок."/>}</div>}

    {!hasSelection && tab === 'hypotheses' && <div className="v361-scroll-list">{store.hypotheses.slice().reverse().map((entry) => <button className={`v361-list-button ${entry.status === 'confirmed' ? 'good' : entry.status === 'disproved' ? 'danger' : ''}`} key={entry.id} onClick={() => setSelectedId(entry.id)}><span>{entry.status.toUpperCase()} · УВЕРЕННОСТЬ {entry.confidence}%</span><b>{entry.title}</b><p>{entry.summary}</p><em>›</em></button>)}{!store.hypotheses.length && <MobileEmptyV362 title="Гипотез нет" text="Свяжи несколько улик вокруг одной локации."/>}</div>}

    {!hasSelection && tab === 'chains' && <div className="v361-scroll-list">{store.archaeologyChains.slice().reverse().map((entry) => <button className={`v361-list-button ${entry.status === 'completed' ? 'good' : entry.status === 'failed' ? 'danger' : ''}`} key={entry.id} onClick={() => setSelectedId(entry.id)}><span>{entry.status.toUpperCase()}</span><b>{entry.title}</b><p>{entry.summary}</p><em>{entry.stages.filter((stage) => stage.status === 'completed').length}/{entry.stages.length}</em></button>)}{!store.archaeologyChains.length && <MobileEmptyV362 title="Цепочек нет" text="Крупные расследования появятся после связанных открытий."/>}</div>}

    {selectedDiscovery && <article className="v361-dossier"><MobileBackV362 onClick={() => setSelectedId(null)}/><span>{selectedDiscovery.kind.toUpperCase()} · ГОД {selectedDiscovery.year}</span><h2>{selectedDiscovery.name}</h2><p>{selectedDiscovery.description}</p><dl><div><dt>Достоверность</dt><dd>{selectedDiscovery.confidence}%</dd></div><div><dt>Система</dt><dd>{store.galaxy?.systems.find((entry) => entry.id === selectedDiscovery.systemId)?.name ?? 'неизвестно'}</dd></div><div><dt>Связи</dt><dd>{selectedDiscovery.tags.length}</dd></div></dl><div className="v361-chip-list">{selectedDiscovery.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{selectedDiscovery.artifactId && <div className="v361-detail-block"><h3>Артефакт</h3><p>Физический объект доступен в Лаборатории, если находится на борту.</p><button onClick={() => store.setScreen('laboratory')}>Открыть Лабораторию</button></div>}</article>}

    {selectedEvidence && <article className="v361-dossier"><MobileBackV362 onClick={() => setSelectedId(null)}/><span>{selectedEvidence.kind.toUpperCase()} · НАДЁЖНОСТЬ {selectedEvidence.reliability}%</span><h2>{selectedEvidence.title}</h2><p>{selectedEvidence.description}</p><dl><div><dt>Год</dt><dd>{selectedEvidence.discoveredYear}</dd></div><div><dt>Локация</dt><dd>{store.pointsOfInterest.find((entry) => entry.id === selectedEvidence.pointOfInterestId)?.name ?? 'неизвестно'}</dd></div><div><dt>Метки</dt><dd>{selectedEvidence.tags.length}</dd></div></dl><div className="v361-chip-list">{selectedEvidence.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></article>}

    {selectedHypothesis && <article className="v361-dossier"><MobileBackV362 onClick={() => setSelectedId(null)}/><span>{selectedHypothesis.status.toUpperCase()} · УВЕРЕННОСТЬ {selectedHypothesis.confidence}%</span><h2>{selectedHypothesis.title}</h2><p>{selectedHypothesis.summary}</p><dl><div><dt>Улик</dt><dd>{selectedHypothesis.evidenceIds.length}</dd></div><div><dt>Обновлено</dt><dd>{selectedHypothesis.updatedYear}</dd></div><div><dt>Решение</dt><dd>{selectedHypothesis.disposition ?? 'не принято'}</dd></div></dl><div className="v362-dossier-list">{selectedHypothesis.evidenceIds.map((id) => { const evidence = store.evidence.find((entry) => entry.id === id); return evidence ? <div className="v361-list-static" key={id}><span>{evidence.kind.toUpperCase()} · {evidence.reliability}%</span><b>{evidence.title}</b><p>{evidence.description}</p></div> : null; })}</div>{!selectedHypothesis.disposition && <footer><button onClick={async () => { await store.resolveHypothesis(selectedHypothesis.id, 'published'); setNotice('Гипотеза опубликована.'); }}>Опубликовать</button><button onClick={async () => { await store.resolveHypothesis(selectedHypothesis.id, 'sold'); setNotice('Гипотеза продана.'); }}>Продать</button><button onClick={async () => { await store.resolveHypothesis(selectedHypothesis.id, 'suppressed'); setNotice('Гипотеза скрыта.'); }}>Скрыть</button></footer>}</article>}

    {selectedChain && <article className="v361-dossier"><MobileBackV362 onClick={() => setSelectedId(null)}/><span>{selectedChain.status.toUpperCase()} · ГОД {selectedChain.createdYear}</span><h2>{selectedChain.title}</h2><p>{selectedChain.summary}</p><div className="v361-stage-list">{selectedChain.stages.map((stage, index) => <article className={`status-${stage.status}`} key={stage.id}><i>{stage.status === 'completed' ? '✓' : index + 1}</i><div><b>{stage.title}</b><p>{stage.summary}</p></div></article>)}</div><div className="v361-detail-block"><h3>Прогресс</h3><p>{formatInteger(selectedChain.stages.filter((stage) => stage.status === 'completed').length)} из {formatInteger(selectedChain.stages.length)} этапов завершено.</p></div></article>}
  </MobileCoverageV362>;
}
