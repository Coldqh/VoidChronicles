import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { OperationApproach } from '../game/types';
import { careerLabels, currentOperationStage, operationLabels } from '../operations/runtime';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import { crewReadiness } from '../ship/life';

type Tab = 'requests' | 'active' | 'contracts' | 'intel';
type ContractFilter = 'all' | 'available' | 'active';

const outcomeLabel: Record<string, string> = {
  failed: 'провал', partial: 'частичный успех', successful: 'успех', exceptional: 'исключительный успех',
  completed: 'завершено', abandoned: 'отменено'
};

const contractStatusLabel: Record<string, string> = {
  available: 'доступен', active: 'активен', completed: 'выполнен', expired: 'просрочен', failed: 'провален'
};

export function OperationsScreen({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<Tab>('requests');
  const [contractFilter, setContractFilter] = useState<ContractFilter>('all');
  const [notice, setNotice] = useState('');
  const requests = store.storyScenes.filter((scene) => scene.status === 'available' && scene.operationRequest);
  const active = store.objectives.filter((objective) => objective.status === 'active' && objective.operation);
  const finished = store.objectives.filter((objective) => objective.operation && objective.status !== 'active').slice(0, 10);
  const contracts = store.contracts.filter((contract) => contractFilter === 'all' || contract.status === contractFilter);
  const activeContracts = store.contracts.filter((contract) => contract.status === 'active');
  const availableContracts = store.contracts.filter((contract) => contract.status === 'available');
  const pursuits = store.pursuits.filter((entry) => entry.status === 'active');
  const wars = store.warFronts.filter((entry) => entry.status === 'active' || entry.status === 'cold');
  const currentSystem = store.galaxy?.systems.find((entry) => entry.id === store.currentSystemId);
  const readiness = store.crew.length ? Math.round(store.crew.reduce((sum, member) => sum + crewReadiness(member), 0) / store.crew.length) : 100;
  const career = store.captain?.career;
  const urgentRequest = useMemo(() => [...requests].sort((a, b) => (b.operationRequest?.urgency ?? 0) - (a.operationRequest?.urgency ?? 0))[0], [requests]);

  const advance = async (id: string, approach: OperationApproach) => {
    const result = await store.advanceOperation(id, approach);
    setNotice(result.message);
  };

  return <div className="game-shell">{chrome}<main className="v35-operations v352-operations">
    <div className="v35-operations-ambient" aria-hidden="true"><i/><i/><i/></div>
    <header className="v35-screen-hero">
      <div><span className="eyebrow">ЦЕНТР УПРАВЛЕНИЯ ОПЕРАЦИЯМИ</span><h1>Вся работа корабля в одном месте</h1><p>Входящие сигналы, долгие операции, оплачиваемые контракты и военная обстановка больше не разбросаны по разным экранам.</p></div>
      <div className="v35-hero-score"><span>ТРЕБУЮТ РЕШЕНИЯ</span><b>{requests.length + active.length + activeContracts.length}</b><small>готовность экипажа {readiness}%</small></div>
    </header>

    <nav className="v35-segmented v352-operation-tabs">
      <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}><span>Входящие</span><b>{requests.length}</b></button>
      <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}><span>В работе</span><b>{active.length}</b></button>
      <button className={tab === 'contracts' ? 'active' : ''} onClick={() => setTab('contracts')}><span>Контракты</span><b>{availableContracts.length + activeContracts.length}</b></button>
      <button className={tab === 'intel' ? 'active' : ''} onClick={() => setTab('intel')}><span>Обстановка</span><b>{pursuits.length + wars.length}</b></button>
    </nav>

    {notice && <button className="v35-toast" onClick={() => setNotice('')}>{notice}</button>}

    {tab === 'requests' && <section className="v35-mission-board">
      {urgentRequest && <article className={`v35-featured-mission category-${urgentRequest.operationRequest?.category}`}>
        <div className="v35-mission-art"><i/><span>{operationLabels[urgentRequest.operationRequest!.category]}</span></div>
        <div className="v35-mission-copy">
          <span className="eyebrow">ПРИОРИТЕТНЫЙ ЗАПРОС · СРОЧНОСТЬ {formatInteger(urgentRequest.operationRequest!.urgency)}</span>
          <h2>{urgentRequest.title}</h2><p>{urgentRequest.summary}</p>
          <div className="v35-mission-meta"><span>Заказчик <b>{urgentRequest.operationRequest!.issuerName}</b></span><span>Награда <b>₡{formatInteger(urgentRequest.operationRequest!.reward)}</b></span><span>Срок <b>{formatInteger(urgentRequest.operationRequest!.deadlineYear)}</b></span></div>
          <div className="v35-mission-actions"><button className="v35-cta" onClick={() => void store.resolveStoryScene(urgentRequest.id, 'accept-operation')}>Принять операцию <i>→</i></button><button onClick={() => void store.resolveStoryScene(urgentRequest.id, 'decline-operation')}>Отказать</button></div>
        </div>
      </article>}
      <div className="v35-mission-grid">{requests.filter((scene) => scene.id !== urgentRequest?.id).map((scene) => {
        const request = scene.operationRequest!;
        const system = store.galaxy?.systems.find((entry) => entry.id === request.targetSystemId);
        return <article key={scene.id} className={`v35-mission-card category-${request.category}`}>
          <header><span>{operationLabels[request.category]}</span><em>{formatInteger(request.urgency)}</em></header>
          <div className="v35-mission-glyph"><i/></div>
          <h2>{request.title}</h2><p>{request.summary}</p>
          <dl><div><dt>Заказчик</dt><dd>{request.issuerName}</dd></div><div><dt>Цель</dt><dd>{system?.name ?? 'координаты скрыты'}</dd></div><div><dt>Награда</dt><dd>₡{formatInteger(request.reward)}</dd></div><div><dt>Срок</dt><dd>{formatInteger(request.deadlineYear)}</dd></div></dl>
          <div className="v35-mission-actions"><button className="primary-button" onClick={() => void store.resolveStoryScene(scene.id, 'accept-operation')}>Принять</button><button onClick={() => void store.resolveStoryScene(scene.id, 'decline-operation')}>Отказать</button></div>
        </article>;
      })}</div>
      {!requests.length && <div className="v35-empty-state"><i>◇</i><h2>Эфир спокоен</h2><p>Новые запросы появятся после контактов, войн, дефицитов и открытий.</p><button onClick={() => store.setScreen('world')}>Открыть живой мир</button></div>}
    </section>}

    {tab === 'active' && <section className="v35-active-board">
      {active.map((objective) => {
        const operation = objective.operation!;
        const stage = currentOperationStage(objective);
        const target = store.galaxy?.systems.find((entry) => entry.id === operation.targetSystemId);
        const atTarget = store.currentSystemId === operation.targetSystemId;
        return <article key={objective.id} className={`v35-active-mission category-${operation.category}`}>
          <header><div><span className="eyebrow">{operationLabels[operation.category]} · {operation.issuerName}</span><h2>{objective.title}</h2><p>{objective.description}</p></div><div className="v35-progress-orb" style={{ '--progress': `${objective.progress * 3.6}deg` } as CSSProperties}><b>{formatInteger(objective.progress)}%</b></div></header>
          <div className="v35-stage-line">{operation.stages.map((entry, index) => <div key={entry.id} className={`stage-${entry.status}`}><i>{index + 1}</i><span><b>{entry.title}</b><small>{formatInteger(entry.progress)}/{formatInteger(entry.requiredProgress)}</small></span></div>)}</div>
          {stage && <section className="v35-stage-focus"><div><span>ТЕКУЩИЙ ЭТАП</span><h3>{stage.title}</h3><p>{stage.description}</p></div>
            {!atTarget && stage.kind !== 'report' ? <button className="v35-cta" onClick={() => { store.selectSystem(operation.targetSystemId); store.setScreen('galaxy'); }}>Проложить путь к {target?.name ?? 'цели'} <i>→</i></button>
              : stage.kind === 'scan' && !currentSystem?.scanned ? <button className="v35-cta" onClick={() => store.setScreen('system')}>Открыть сканирование <i>→</i></button>
                : <div className="v35-approach-grid"><button onClick={() => void advance(objective.id, 'careful')}><i>◇</i><b>Осторожно</b><span>Медленнее. Выше шанс сохранить людей и данные.</span></button><button onClick={() => void advance(objective.id, 'direct')}><i>⚡</i><b>Напрямую</b><span>Быстрее. Риск травм и осложнений.</span></button><button onClick={() => void advance(objective.id, 'negotiate')}><i>⌬</i><b>Договориться</b><span>Решает доверие, дипломат и репутация.</span></button></div>}
          </section>}
        </article>;
      })}
      {!active.length && <div className="v35-empty-state"><i>⚔</i><h2>Нет активных операций</h2><p>Прими входящий запрос или найди новую точку вмешательства.</p></div>}
      {finished.length > 0 && <details className="v35-completed"><summary>Завершённые операции · {finished.length}</summary>{finished.map((objective) => <div key={objective.id}><span>{objective.operation && operationLabels[objective.operation.category]}</span><b>{objective.title}</b><em>{outcomeLabel[objective.operation?.outcome ?? objective.status] ?? objective.status}</em></div>)}</details>}
    </section>}

    {tab === 'contracts' && <section className="v352-contract-board">
      <header className="v352-contract-header"><div><span className="eyebrow">ОПЛАЧИВАЕМАЯ РАБОТА</span><h2>Контракты</h2><p>Работа с фиксированной наградой, сроком и обязательствами перед конкретной фракцией.</p></div><div className="v352-contract-tools"><div className="v352-filter">{(['all','available','active'] as ContractFilter[]).map((filter) => <button key={filter} className={contractFilter === filter ? 'active' : ''} onClick={() => setContractFilter(filter)}>{filter === 'all' ? 'Все' : filter === 'available' ? 'Доступные' : 'Активные'}</button>)}</div><button onClick={async () => { await store.refreshContracts(); setNotice('Рынок контрактов обновлён.'); }}>Обновить рынок</button></div></header>
      <div className="v352-contract-grid">{contracts.map((contract) => {
        const issuer = store.factions.find((entry) => entry.id === contract.issuerFactionId);
        const hub = store.hubs.find((entry) => entry.id === contract.issuerHubId);
        const progress = Math.min(100, Math.round(contract.progress / Math.max(1, contract.requiredProgress) * 100));
        return <article key={contract.id} className={`v352-contract-card status-${contract.status}`}>
          <header><span>{contract.type} · {contractStatusLabel[contract.status] ?? contract.status}</span>{contract.illegal && <em>НЕЛЕГАЛЬНО</em>}</header>
          <h3>{contract.title}</h3><p>{contract.description}</p>
          <dl><div><dt>Заказчик</dt><dd>{issuer?.name ?? 'неизвестная сторона'}</dd></div><div><dt>Точка выдачи</dt><dd>{hub?.name ?? 'удалённый канал'}</dd></div><div><dt>Награда</dt><dd>₡{formatInteger(contract.reward)}</dd></div><div><dt>Срок</dt><dd>{formatInteger(contract.deadlineYear)}</dd></div></dl>
          {contract.status === 'active' && <><div className="v352-contract-progress"><i style={{ width: `${progress}%` }}/></div><small>{formatInteger(contract.progress)}/{formatInteger(contract.requiredProgress)} · {progress}%</small></>}
          {contract.illegal && <p className="warning-text">Незаконная работа повышает риск досмотра, конфискации и репутационных потерь.</p>}
          {contract.status === 'available' && <button className="primary-button" onClick={async () => setNotice((await store.acceptContract(contract.id)).message)}>Принять · аванс ₡{formatInteger(contract.advance)}</button>}
        </article>;
      })}</div>
      {!contracts.length && <div className="v35-empty-state"><i>▤</i><h2>Контрактов по фильтру нет</h2><p>Обнови рынок или посети другой гражданский узел.</p></div>}
    </section>}

    {tab === 'intel' && <section className="v35-intel-layout">
      <article className="v35-threat-panel"><header><span className="eyebrow">АКТИВНЫЙ РОЗЫСК</span><h2>{pursuits.length}</h2></header>{pursuits.length ? pursuits.map((entry) => <div key={entry.id}><em>{formatInteger(entry.intensity)}</em><span><b>{entry.sourceName}</b><p>{entry.reason}</p></span></div>) : <p>Никто не ведёт подтверждённую охоту на корабль.</p>}</article>
      <article className="v35-threat-panel wars"><header><span className="eyebrow">ИЗВЕСТНЫЕ ФРОНТЫ</span><h2>{wars.length}</h2></header>{wars.length ? wars.map((front) => <div key={front.id}><em>{formatInteger(front.intensity)}</em><span><b>{front.status === 'cold' ? 'Холодный конфликт' : 'Активная война'}</b><p>{front.systemIds.length} систем в зоне конфликта</p></span></div>) : <p>Подтверждённых фронтов нет.</p>}</article>
      <article className="v35-career-panel"><span className="eyebrow">РЕПУТАЦИЯ КАПИТАНА</span><h2>{career?.primary ? careerLabels[career.primary] : 'Имя ещё не сложилось'}</h2><p>Галактика запоминает не выбранный класс, а реальные поступки.</p><div>{Object.entries(careerLabels).map(([id, label]) => <span key={id}><small>{label}</small><b>{formatInteger(career?.renown[id as keyof typeof careerLabels] ?? 0)}</b></span>)}</div>{career?.titles.length ? <footer>{career.titles.map((title) => <em key={title}>{title}</em>)}</footer> : null}</article>
    </section>}
  </main></div>;
}
