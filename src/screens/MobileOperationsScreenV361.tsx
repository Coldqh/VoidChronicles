import { useMemo, useState, type ReactNode } from 'react';
import type { OperationApproach } from '../game/types';
import { useGameStore } from '../game/store';
import { currentOperationStage, operationLabels } from '../operations/runtime';
import { formatInteger } from '../ui/format';

type OperationsTab = 'requests' | 'active' | 'contracts' | 'completed';

export function MobileOperationsScreenV361({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<OperationsTab>('requests');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const requests = useMemo(() => store.storyScenes
    .filter((scene) => scene.status === 'available' && scene.operationRequest)
    .sort((a, b) => (b.operationRequest?.urgency ?? 0) - (a.operationRequest?.urgency ?? 0)), [store.storyScenes]);
  const active = store.objectives.filter((objective) => objective.status === 'active' && objective.operation);
  const completed = store.objectives.filter((objective) => objective.operation && objective.status !== 'active').slice(0, 40);
  const contracts = store.contracts.filter((contract) => contract.status === 'available' || contract.status === 'active');

  const selectedRequest = tab === 'requests' ? requests.find((entry) => entry.id === selectedId) : undefined;
  const selectedObjective = tab === 'active' ? active.find((entry) => entry.id === selectedId) : undefined;
  const selectedContract = tab === 'contracts' ? contracts.find((entry) => entry.id === selectedId) : undefined;
  const selectedCompleted = tab === 'completed' ? completed.find((entry) => entry.id === selectedId) : undefined;
  const hasSelection = Boolean(selectedRequest || selectedObjective || selectedContract || selectedCompleted);

  const changeTab = (next: OperationsTab) => {
    setTab(next);
    setSelectedId(null);
    setNotice('');
  };

  const advance = async (id: string, approach: OperationApproach) => {
    const result = await store.advanceOperation(id, approach);
    setNotice(result.message);
  };

  const list = tab === 'requests'
    ? requests.map((scene) => {
      const request = scene.operationRequest!;
      const target = store.galaxy?.systems.find((system) => system.id === request.targetSystemId);
      return <button className="v361-list-button" key={scene.id} onClick={() => setSelectedId(scene.id)}><span>{operationLabels[request.category]} · СРОЧНОСТЬ {formatInteger(request.urgency)}</span><b>{scene.title}</b><p>{target?.name ?? 'Координаты скрыты'} · ₡{formatInteger(request.reward)}</p><em>›</em></button>;
    })
    : tab === 'active'
      ? active.map((objective) => <button className="v361-list-button" key={objective.id} onClick={() => setSelectedId(objective.id)}><span>{objective.operation && operationLabels[objective.operation.category]} · {formatInteger(objective.progress)}%</span><b>{objective.title}</b><p>{currentOperationStage(objective)?.title ?? 'Операция ожидает решения'}</p><em>›</em></button>)
      : tab === 'contracts'
        ? contracts.map((contract) => <button className="v361-list-button" key={contract.id} onClick={() => setSelectedId(contract.id)}><span>{contract.type} · {contract.status === 'active' ? 'В РАБОТЕ' : 'ДОСТУПЕН'}</span><b>{contract.title}</b><p>₡{formatInteger(contract.reward)} · срок {formatInteger(contract.deadlineYear)}</p><em>›</em></button>)
        : completed.map((objective) => <button className="v361-list-button" key={objective.id} onClick={() => setSelectedId(objective.id)}><span>{objective.operation && operationLabels[objective.operation.category]} · {objective.status}</span><b>{objective.title}</b><p>{objective.description}</p><em>›</em></button>);

  return <div className="game-shell v361-shell">{chrome}<main className="mobile-data-screen v361-screen">
    <header className="v361-screen-header"><div><span>ЦЕНТР РАБОТЫ</span><h1>Операции</h1></div><b>{requests.length + active.length + contracts.length}</b></header>
    <nav className="v361-tabs four">
      <button className={tab === 'requests' ? 'active' : ''} onClick={() => changeTab('requests')}>Входящие <b>{requests.length}</b></button>
      <button className={tab === 'active' ? 'active' : ''} onClick={() => changeTab('active')}>Активные <b>{active.length}</b></button>
      <button className={tab === 'contracts' ? 'active' : ''} onClick={() => changeTab('contracts')}>Контракты <b>{contracts.length}</b></button>
      <button className={tab === 'completed' ? 'active' : ''} onClick={() => changeTab('completed')}>Архив</button>
    </nav>

    {notice && <button className="v361-notice" onClick={() => setNotice('')}>{notice}</button>}

    <section className={`v361-tab-body ${hasSelection ? 'detail-open' : ''}`}>
      {!hasSelection && <div className="v361-scroll-list">{list.length ? list : <div className="v361-empty"><b>Здесь пока пусто</b><p>Новые задачи появятся из состояния мира, контактов и контрактов.</p></div>}</div>}

      {selectedRequest && <article className="v361-dossier">
        <button className="v361-back" onClick={() => setSelectedId(null)}>← Входящие</button>
        <span>{operationLabels[selectedRequest.operationRequest!.category]} · СРОЧНОСТЬ {formatInteger(selectedRequest.operationRequest!.urgency)}</span>
        <h2>{selectedRequest.title}</h2><p>{selectedRequest.summary}</p>
        <dl><div><dt>Заказчик</dt><dd>{selectedRequest.operationRequest!.issuerName}</dd></div><div><dt>Награда</dt><dd>₡{formatInteger(selectedRequest.operationRequest!.reward)}</dd></div><div><dt>Срок</dt><dd>{formatInteger(selectedRequest.operationRequest!.deadlineYear)}</dd></div></dl>
        <footer><button onClick={() => void store.resolveStoryScene(selectedRequest.id, 'decline-operation')}>Отказать</button><button className="primary-button" onClick={() => void store.resolveStoryScene(selectedRequest.id, 'accept-operation')}>Принять</button></footer>
      </article>}

      {selectedObjective && (() => {
        const operation = selectedObjective.operation!;
        const stage = currentOperationStage(selectedObjective);
        const target = store.galaxy?.systems.find((system) => system.id === operation.targetSystemId);
        const atTarget = store.currentSystemId === operation.targetSystemId;
        return <article className="v361-dossier">
          <button className="v361-back" onClick={() => setSelectedId(null)}>← Активные</button>
          <span>{operationLabels[operation.category]} · {formatInteger(selectedObjective.progress)}%</span>
          <h2>{selectedObjective.title}</h2><p>{selectedObjective.description}</p>
          <nav className="v361-subtabs"><b>Текущий этап</b><span>{stage?.title ?? 'Ожидание'}</span></nav>
          {stage && <section className="v361-detail-block"><h3>{stage.title}</h3><p>{stage.description}</p></section>}
          <div className="v361-stage-dots">{operation.stages.map((entry, index) => <i className={`status-${entry.status}`} key={entry.id}>{entry.status === 'completed' ? '✓' : index + 1}</i>)}</div>
          <footer>{!atTarget && stage?.kind !== 'report'
            ? <button className="primary-button" onClick={() => { store.selectSystem(operation.targetSystemId); store.setScreen('galaxy'); }}>Путь к {target?.name ?? 'цели'}</button>
            : stage?.kind === 'scan' && !store.galaxy?.systems.find((system) => system.id === store.currentSystemId)?.scanned
              ? <button className="primary-button" onClick={() => store.setScreen('system')}>Открыть сканирование</button>
              : <div className="v361-action-grid"><button onClick={() => void advance(selectedObjective.id, 'careful')}>Осторожно</button><button onClick={() => void advance(selectedObjective.id, 'direct')}>Напрямую</button><button onClick={() => void advance(selectedObjective.id, 'negotiate')}>Переговоры</button></div>}</footer>
        </article>;
      })()}

      {selectedContract && <article className="v361-dossier">
        <button className="v361-back" onClick={() => setSelectedId(null)}>← Контракты</button>
        <span>{selectedContract.type} · {selectedContract.status}</span><h2>{selectedContract.title}</h2><p>{selectedContract.description}</p>
        <dl><div><dt>Награда</dt><dd>₡{formatInteger(selectedContract.reward)}</dd></div><div><dt>Аванс</dt><dd>₡{formatInteger(selectedContract.advance)}</dd></div><div><dt>Срок</dt><dd>{formatInteger(selectedContract.deadlineYear)}</dd></div></dl>
        {selectedContract.illegal && <section className="v361-detail-block warning"><b>Нелегальная работа</b><p>Возможны досмотр, конфискация и репутационные потери.</p></section>}
        {selectedContract.status === 'available' && <footer><button className="primary-button" onClick={async () => setNotice((await store.acceptContract(selectedContract.id)).message)}>Принять контракт</button></footer>}
      </article>}

      {selectedCompleted && <article className="v361-dossier"><button className="v361-back" onClick={() => setSelectedId(null)}>← Архив</button><span>{selectedCompleted.status}</span><h2>{selectedCompleted.title}</h2><p>{selectedCompleted.description}</p></article>}
    </section>
  </main></div>;
}
