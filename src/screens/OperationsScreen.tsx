import { useState, type ReactNode } from 'react';
import type { OperationApproach } from '../game/types';
import { careerLabels, currentOperationStage, operationLabels } from '../operations/runtime';
import { useGameStore } from '../game/store';

type Tab = 'requests' | 'active' | 'threats' | 'career';

export function OperationsScreen({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<Tab>('requests');
  const [notice, setNotice] = useState('');
  const requests = store.storyScenes.filter((scene) => scene.status === 'available' && scene.operationRequest);
  const active = store.objectives.filter((objective) => objective.status === 'active' && objective.operation);
  const finished = store.objectives.filter((objective) => objective.operation && objective.status !== 'active').slice(0, 8);
  const currentSystem = store.galaxy?.systems.find((entry) => entry.id === store.currentSystemId);
  const career = store.captain?.career;
  const pursuits = store.pursuits.filter((entry) => entry.status === 'active');
  const wars = store.warFronts.filter((entry) => entry.status === 'active' || entry.status === 'cold');

  const advance = async (id: string, approach: OperationApproach) => {
    const result = await store.advanceOperation(id, approach);
    setNotice(result.message);
  };

  return <div className="game-shell">{chrome}<main className="v32-operations">
    <header className="v32-operations-hero"><div><span className="eyebrow">ЗАПРОСЫ · ЗАДАЧИ · ПОСЛЕДСТВИЯ</span><h1>Операции</h1><p>Мир ставит задачу. Ты выбираешь способ и получаешь не только успех или провал.</p></div><div><b>{requests.length + active.length}</b><span>требуют решения</span></div></header>
    <nav className="v32-operation-tabs">
      <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>Запросы {requests.length || ''}</button>
      <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Активные {active.length || ''}</button>
      <button className={tab === 'threats' ? 'active' : ''} onClick={() => setTab('threats')}>Угрозы</button>
      <button className={tab === 'career' ? 'active' : ''} onClick={() => setTab('career')}>Карьера</button>
    </nav>
    {notice && <div className="v32-operation-notice">{notice}</div>}

    {tab === 'requests' && <section className="v32-request-grid">{requests.length ? requests.map((scene) => {
      const request = scene.operationRequest!;
      const system = store.galaxy?.systems.find((entry) => entry.id === request.targetSystemId);
      return <article key={scene.id}><span>{operationLabels[request.category]} · срочность {request.urgency}</span><h2>{request.title}</h2><p>{request.summary}</p><dl><div><dt>Заказчик</dt><dd>{request.issuerName}</dd></div><div><dt>Цель</dt><dd>{system?.name ?? 'координаты не подтверждены'}</dd></div><div><dt>Награда</dt><dd>₡{request.reward}</dd></div><div><dt>Срок</dt><dd>{request.deadlineYear}</dd></div></dl><div className="v32-request-actions"><button className="primary-button" onClick={() => void store.resolveStoryScene(scene.id, 'accept-operation')}>Принять</button><button onClick={() => void store.resolveStoryScene(scene.id, 'decline-operation')}>Отказать</button></div></article>;
    }) : <div className="v32-empty"><b>Новых запросов нет</b><p>Они появляются из реальных войн, дефицитов, открытий и экологических кризисов после официального контакта.</p></div>}</section>}

    {tab === 'active' && <section className="v32-active-operations">{active.length ? active.map((objective) => {
      const operation = objective.operation!;
      const stage = currentOperationStage(objective);
      const target = store.galaxy?.systems.find((entry) => entry.id === operation.targetSystemId);
      const atTarget = store.currentSystemId === operation.targetSystemId;
      return <article key={objective.id} className="v32-operation-card">
        <header><div><span>{operationLabels[operation.category]} · {operation.issuerName}</span><h2>{objective.title}</h2></div><strong>{objective.progress}%</strong></header>
        <p>{objective.description}</p>
        <div className="v32-stage-track">{operation.stages.map((entry, index) => <div key={entry.id} className={`stage-${entry.status}`}><i>{index + 1}</i><span><b>{entry.title}</b><small>{entry.progress}/{entry.requiredProgress}</small></span></div>)}</div>
        {stage && <section className="v32-current-stage"><span>ТЕКУЩИЙ ЭТАП</span><h3>{stage.title}</h3><p>{stage.description}</p>
          {!atTarget && stage.kind !== 'report' ? <button onClick={() => { store.selectSystem(operation.targetSystemId); store.setScreen('galaxy'); }}>Проложить маршрут к {target?.name ?? 'цели'}</button>
          : stage.kind === 'scan' && !currentSystem?.scanned ? <button onClick={() => store.setScreen('system')}>Открыть сканирование системы</button>
          : <div className="v32-approaches"><button onClick={() => void advance(objective.id, 'careful')}><b>Осторожно</b><span>Дольше и дороже, выше шанс</span></button><button onClick={() => void advance(objective.id, 'direct')}><b>Напрямую</b><span>Быстро, риск для капитана</span></button><button onClick={() => void advance(objective.id, 'negotiate')}><b>Договориться</b><span>Сила контакта и дипломата</span></button></div>}
        </section>}
      </article>;
    }) : <div className="v32-empty"><b>Активных операций нет</b><p>Прими входящий запрос или продолжай исследование мира.</p></div>}
    {finished.length > 0 && <details className="v32-finished"><summary>Завершённые и проваленные · {finished.length}</summary>{finished.map((objective) => <div key={objective.id}><b>{objective.title}</b><span>{objective.operation?.outcome ?? objective.status}</span></div>)}</details>}</section>}

    {tab === 'threats' && <section className="v32-threat-grid"><article><h2>Розыск</h2>{pursuits.length ? pursuits.map((entry) => <div key={entry.id}><b>{entry.sourceName}</b><span>уровень {entry.intensity}</span><p>{entry.reason}</p></div>) : <p>Активных ориентировок нет.</p>}</article><article><h2>Фронты</h2>{wars.length ? wars.map((front) => <div key={front.id}><b>{front.status}</b><span>интенсивность {front.intensity}</span><p>Систем в зоне конфликта: {front.systemIds.length}</p></div>) : <p>Подтверждённых войн нет.</p>}</article></section>}

    {tab === 'career' && <section className="v32-career"><header><span className="eyebrow">ИМЯ КАПИТАНА В ГАЛАКТИКЕ</span><h2>{career?.primary ? careerLabels[career.primary] : 'Путь ещё не определён'}</h2><p>Специализация рождается из поступков, а не выбирается в меню.</p></header><div className="v32-career-grid">{Object.entries(careerLabels).map(([id, label]) => <article key={id}><span>{label}</span><b>{career?.renown[id as keyof typeof careerLabels] ?? 0}</b></article>)}</div><div className="v32-career-titles"><h3>Титулы</h3>{career?.titles.length ? career.titles.map((title) => <span key={title}>{title}</span>) : <p>Галактика пока не дала капитану устойчивого имени.</p>}<small>Завершено операций: {career?.completedOperations ?? 0}</small></div></section>}
  </main></div>;
}
