import { useEffect, useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import type { ShipCompartmentId } from '../game/types';
import { MobileBackV362, MobileCoverageV362, MobileEmptyV362 } from '../components/MobileCoverageV362';

type ShipTab = 'status' | 'compartments' | 'cargo' | 'modules';

type DetailKind = 'compartment' | 'cargo' | 'module';

export function MobileShipScreenV362({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const ship = store.ship;
  const [tab, setTab] = useState<ShipTab>('status');
  const [detail, setDetail] = useState<{ kind: DetailKind; id: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => setDetail(null), [tab]);
  if (!ship || !store.captain) return null;

  const life = ship.life;
  const issues = life?.issues.filter((entry) => entry.status === 'open') ?? [];
  const selectedCompartment = detail?.kind === 'compartment' ? life?.compartments.find((entry) => entry.id === detail.id) : undefined;
  const selectedCargo = detail?.kind === 'cargo' ? ship.cargo.find((entry) => entry.id === detail.id) : undefined;
  const selectedModule = detail?.kind === 'module' ? ship.modules.find((entry) => entry.id === detail.id) : undefined;

  const act = async (action: () => Promise<unknown>, message: string) => {
    await action();
    setNotice(message);
  };

  const tabs = [
    { id: 'status' as const, label: 'Состояние', count: issues.length },
    { id: 'compartments' as const, label: 'Отсеки', count: life?.compartments.length ?? 0 },
    { id: 'cargo' as const, label: 'Груз', count: ship.cargo.length },
    { id: 'modules' as const, label: 'Модули', count: ship.modules.length }
  ];

  return <MobileCoverageV362<ShipTab>
    chrome={chrome}
    eyebrow={`${ship.registration} · ${ship.transponder}`}
    title={ship.name}
    badge={`${formatInteger(ship.hull)}%`}
    tabs={tabs}
    activeTab={tab}
    onTabChange={setTab}
    className="v362-ship-screen"
  >
    {notice && <button className="v361-notice" onClick={() => setNotice('')}>{notice}</button>}

    {tab === 'status' && <div className="v361-scroll-list v362-status-view">
      <div className="v362-vitals-grid">
        <article className={ship.hull < 35 ? 'critical' : ''}><span>Корпус</span><b>{formatInteger(ship.hull)}%</b><i><em style={{ width: `${ship.hull}%` }}/></i></article>
        <article className={ship.fuel < 25 ? 'critical' : ''}><span>Топливо</span><b>{formatInteger(ship.fuel)}%</b><i><em style={{ width: `${ship.fuel}%` }}/></i></article>
        <article className={(life?.supplies.food ?? 100) < 25 ? 'critical' : ''}><span>Еда</span><b>{formatInteger(life?.supplies.food ?? 100)}%</b><i><em style={{ width: `${life?.supplies.food ?? 100}%` }}/></i></article>
        <article className={(life?.supplies.oxygen ?? 100) < 25 ? 'critical' : ''}><span>Кислород</span><b>{formatInteger(life?.supplies.oxygen ?? 100)}%</b><i><em style={{ width: `${life?.supplies.oxygen ?? 100}%` }}/></i></article>
      </div>
      <div className="v362-action-grid four">
        <button onClick={() => void act(store.repairShip, 'Корпус отправлен в ремонт.')}>Ремонт</button>
        <button onClick={() => void act(store.refuelShip, 'Заправка завершена.')}>Заправка</button>
        <button onClick={() => void act(store.resupplyShip, 'Запасы пополнены.')}>Запасы</button>
        <button onClick={() => void act(store.restCrew, 'Экипаж получил отдых.')}>Отдых</button>
      </div>
      <div className="v362-section-title"><span>КОРАБЕЛЬНЫЕ СИСТЕМЫ</span><b>{ship.systems.filter((entry) => entry.disabled).length} отключено</b></div>
      {ship.systems.map((system) => <article className="v362-system-row" key={system.id}>
        <div><b>{system.label}</b><small>{system.effect}</small></div><strong>{formatInteger(system.integrity)}%</strong>
        <i><em style={{ width: `${system.integrity}%` }}/></i>
      </article>)}
      <div className="v362-section-title"><span>ОТКРЫТЫЕ ПРОБЛЕМЫ</span><b>{issues.length}</b></div>
      {issues.length ? issues.map((issue) => <button className="v361-list-button danger" key={issue.id} onClick={() => store.setScreen('crew')}>
        <span>СЕРЬЁЗНОСТЬ {formatInteger(issue.severity)}</span><b>{issue.title}</b><p>{issue.summary}</p><em>›</em>
      </button>) : <div className="v361-list-static good"><span>СТАТУС</span><b>Критических проблем нет</b><p>Корабль и люди работают штатно.</p></div>}
    </div>}

    {tab === 'compartments' && !selectedCompartment && <div className="v361-scroll-list">
      {(life?.compartments ?? []).map((compartment) => <button className={`v361-list-button ${compartment.condition < 45 ? 'danger' : ''}`} key={compartment.id} onClick={() => setDetail({ kind: 'compartment', id: compartment.id })}>
        <span>{compartment.id.toUpperCase()} · УРОВЕНЬ {compartment.level}</span><b>{compartment.name}</b><p>{compartment.function}</p><em>{formatInteger(compartment.condition)}%</em>
      </button>)}
      {!life?.compartments.length && <MobileEmptyV362 title="Отсеки не инициализированы" text="Сохранение будет нормализовано при следующем запуске."/>}
    </div>}

    {tab === 'compartments' && selectedCompartment && <article className="v361-dossier">
      <MobileBackV362 onClick={() => setDetail(null)}/>
      <span>{selectedCompartment.id.toUpperCase()} · УРОВЕНЬ {selectedCompartment.level}</span>
      <h2>{selectedCompartment.name}</h2><p>{selectedCompartment.function}</p>
      <dl><div><dt>Состояние</dt><dd>{formatInteger(selectedCompartment.condition)}%</dd></div><div><dt>Вместимость</dt><dd>{selectedCompartment.capacity}</dd></div><div><dt>На посту</dt><dd>{store.crew.filter((member) => member.shipCompartmentId === selectedCompartment.id).length}</dd></div></dl>
      <div className="v361-chip-list">{selectedCompartment.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="v362-section-title"><span>ЭКИПАЖ ОТСЕКА</span></div>
      {store.crew.filter((member) => member.shipCompartmentId === selectedCompartment.id).map((member) => <button className="v361-list-button" key={member.id} onClick={() => store.setScreen('crew')}><span>{member.primaryRole}</span><b>{member.name}</b><p>{member.status}</p><em>›</em></button>)}
      <footer><button className="primary-button" disabled={selectedCompartment.condition >= 100 || (life?.supplies.parts ?? 0) <= 0} onClick={() => void act(() => store.repairCompartment(selectedCompartment.id as ShipCompartmentId), 'Отсек отремонтирован.')}>Ремонтировать</button></footer>
    </article>}

    {tab === 'cargo' && !selectedCargo && <div className="v361-scroll-list">
      {ship.cargo.map((item) => <button className={`v361-list-button ${item.illegal ? 'danger' : ''}`} key={item.id} onClick={() => setDetail({ kind: 'cargo', id: item.id })}>
        <span>{item.kind.toUpperCase()} · {item.illegal ? 'КОНТРАБАНДА' : `КОЛИЧЕСТВО ${item.quantity}`}</span><b>{item.name}</b><p>Оценка ₡{formatInteger(item.value)}{item.contractId ? ' · контрактный груз' : ''}</p><em>›</em>
      </button>)}
      {!ship.cargo.length && <MobileEmptyV362 title="Трюм пуст" text="Груз появится после торговли, контрактов и экспедиций."/>}
    </div>}

    {tab === 'cargo' && selectedCargo && <article className="v361-dossier">
      <MobileBackV362 onClick={() => setDetail(null)}/><span>{selectedCargo.kind.toUpperCase()}</span><h2>{selectedCargo.name}</h2>
      <dl><div><dt>Количество</dt><dd>{selectedCargo.quantity}</dd></div><div><dt>Оценка</dt><dd>₡{formatInteger(selectedCargo.value)}</dd></div><div><dt>Статус</dt><dd>{selectedCargo.illegal ? 'нелегальный' : selectedCargo.contractId ? 'контрактный' : 'свободный'}</dd></div></dl>
      {selectedCargo.artifactId && <div className="v361-detail-block"><h3>Артефакт</h3><p>Подробный анализ и исследование доступны в Лаборатории.</p><button onClick={() => store.setScreen('laboratory')}>Открыть Лабораторию</button></div>}
      {selectedCargo.contractId && <div className="v361-detail-block warning"><h3>Обязательство</h3><p>Груз связан с активным или завершённым контрактом.</p><button onClick={() => store.setScreen('operations')}>Открыть Операции</button></div>}
      <footer>{store.currentHubId ? <button className="primary-button" onClick={() => store.setScreen('hub')}>Открыть торговлю</button> : <button disabled>Для продажи нужна стыковка</button>}</footer>
    </article>}

    {tab === 'modules' && !selectedModule && <div className="v361-scroll-list">
      {ship.modules.map((module) => <button className="v361-list-button" key={module.id} onClick={() => setDetail({ kind: 'module', id: module.id })}>
        <span>{module.slot.toUpperCase()} · R{module.rarity}</span><b>{module.name}</b><p>{module.effect}</p><em>›</em>
      </button>)}
      {!ship.modules.length && <MobileEmptyV362 title="Модули не установлены" text="Чертежи и технологии устанавливаются через Лабораторию."/>}
    </div>}

    {tab === 'modules' && selectedModule && <article className="v361-dossier">
      <MobileBackV362 onClick={() => setDetail(null)}/><span>{selectedModule.slot.toUpperCase()} · R{selectedModule.rarity}</span><h2>{selectedModule.name}</h2><p>{selectedModule.effect}</p>
      <div className="v361-detail-block"><h3>Источник улучшений</h3><p>Новые корабельные модули создаются из восстановленных технологий.</p><button onClick={() => store.setScreen('laboratory')}>Открыть технологии</button></div>
    </article>}
  </MobileCoverageV362>;
}
