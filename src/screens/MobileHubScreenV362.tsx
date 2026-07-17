import { useMemo, useState, type ReactNode } from 'react';
import type { LocalNpc } from '../game/types';
import { useGameStore } from '../game/store';
import { formatInteger } from '../ui/format';
import { generateMarket } from '../world/livingGalaxy';
import { MobileCoverageV362, MobileEmptyV362 } from '../components/MobileCoverageV362';

type HubTab = 'market' | 'people' | 'work' | 'authority' | 'cargo';

const npcRoleLabel = (npc: LocalNpc) => ({ administrator: 'управляющий', merchant: 'торговец', scientist: 'учёный', doctor: 'врач', fixer: 'посредник', priest: 'религиозный деятель', guard: 'охранник', resident: 'местный житель' }[npc.role]);

export function MobileHubScreenV362({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const hub = store.hubs.find((entry) => entry.id === store.currentHubId);
  const [tab, setTab] = useState<HubTab>('market');
  const [notice, setNotice] = useState('');

  const market = useMemo(() => hub ? generateMarket(hub, store.gameYear, store.simulation?.systems[hub.systemId]) : [], [hub, store.gameYear, store.simulation?.systems]);
  if (!hub) return <MobileCoverageV362<'market'> chrome={chrome} eyebrow="СТЫКОВОЧНЫЙ КАНАЛ" title="Нет стыковки" tabs={[{ id: 'market', label: 'Состояние' }]} activeTab="market" onTabChange={() => undefined}><MobileEmptyV362 title="Корабль в открытом космосе" text="Вернись в текущую систему и выбери гражданский узел."/></MobileCoverageV362>;

  const faction = store.factions.find((entry) => entry.id === hub.factionId);
  const civilization = store.galaxy?.civilizations.find((entry) => entry.id === hub.civilizationId);
  const contracts = store.contracts.filter((entry) => entry.issuerHubId === hub.id && entry.status === 'available');
  const npcs = store.localNpcs.filter((entry) => entry.hubId === hub.id && entry.alive && entry.present);
  const cargo = store.ship?.cargo ?? [];

  const tabs = [
    { id: 'market' as const, label: 'Рынок', count: market.length },
    { id: 'people' as const, label: 'Люди', count: npcs.length },
    { id: 'work' as const, label: 'Работа', count: contracts.length },
    { id: 'authority' as const, label: 'Власть' },
    { id: 'cargo' as const, label: 'Груз', count: cargo.length }
  ];

  return <MobileCoverageV362<HubTab>
    chrome={chrome}
    eyebrow={`${hub.kind.toUpperCase()} · НАСЕЛЕНИЕ ${hub.population.toLocaleString('ru-RU')}`}
    title={hub.name}
    action={<button className="v362-header-action" onClick={() => void store.leaveHub()}>Отстыковка</button>}
    tabs={tabs}
    activeTab={tab}
    onTabChange={setTab}
    className="v362-hub-screen"
  >
    {notice && <button className="v361-notice" onClick={() => setNotice('')}>{notice}</button>}

    {tab === 'market' && <div className="v361-scroll-list">{market.map((good) => <article className={`v362-market-row ${good.illegal ? 'danger' : ''}`} key={good.id}><div><span>{good.category.toUpperCase()}{good.illegal ? ' · ЗАПРЕЩЕНО' : ''}</span><b>{good.name}</b><small>остаток {good.stock}</small></div><strong>₡{formatInteger(good.price)}</strong><button onClick={async () => setNotice((await store.buyMarketGood(hub.id, good)).message)}>Купить</button></article>)}{!market.length && <MobileEmptyV362 title="Рынок закрыт" text="В этом узле нет доступных товаров."/>}</div>}

    {tab === 'people' && <div className="v361-scroll-list">{npcs.map((npc) => <article className="v362-person-card" key={npc.id}><span>{npcRoleLabel(npc).toUpperCase()} · ДОВЕРИЕ {npc.trust}</span><b>{npc.name}</b><p>{npc.species} · {npc.culture}</p><small>Хочет: {npc.agenda}</small><div className="v362-action-grid three"><button onClick={() => void store.interactWithNpc(npc.id, 'deal')}>Сделка</button><button onClick={() => void store.interactWithNpc(npc.id, 'help')}>Помочь</button><button className="danger-button" onClick={() => void store.interactWithNpc(npc.id, 'threat')}>Угроза</button></div></article>)}{!npcs.length && <MobileEmptyV362 title="Доступных людей нет" text="Персонал и жители могут отсутствовать или избегать капитана."/>}</div>}

    {tab === 'work' && <div className="v361-scroll-list"><button className="primary-button v362-wide-button" onClick={async () => { await store.refreshContracts(); setNotice('Доска контрактов обновлена.'); }}>Обновить доску</button>{contracts.map((contract) => <article className={`v362-contract-row ${contract.illegal ? 'danger' : ''}`} key={contract.id}><span>{contract.type.toUpperCase()} · СРОК {contract.deadlineYear}</span><b>{contract.title}</b><p>{contract.description}</p><small>Награда ₡{formatInteger(contract.reward)} · аванс ₡{formatInteger(contract.advance)}</small><button className="primary-button" onClick={async () => setNotice((await store.acceptContract(contract.id)).message)}>Принять</button></article>)}{!contracts.length && <MobileEmptyV362 title="Работы нет" text="Обнови рынок или прилети в другой гражданский узел."/>}</div>}

    {tab === 'authority' && <div className="v361-scroll-list"><div className="v361-list-static"><span>КОНТРОЛИРУЮЩАЯ СИЛА</span><b>{faction?.name ?? 'неизвестная власть'}</b><p>{faction ? `${faction.kind} · ${faction.disposition} · репутация ${faction.reputation}` : 'данных нет'}</p></div>{civilization && <button className="v361-list-button" onClick={() => store.setScreen('civilizations')}><span>ЦИВИЛИЗАЦИЯ</span><b>{civilization.name}</b><p>{civilization.speciesName} · {civilization.ideology}</p><em>›</em></button>}<div className="v362-section-title"><span>МЕСТНЫЕ ЗАКОНЫ</span></div><div className="v361-chip-list">{faction?.laws.map((law) => <span key={law}>{law}</span>)}</div><div className="v362-section-title"><span>РАЙОНЫ</span><b>{hub.districts?.length ?? 0}</b></div>{hub.districts?.map((district) => <div className="v361-list-static" key={district.id}><span>{district.function.toUpperCase()} · {district.safety.toUpperCase()}</span><b>{district.name}</b><p>{district.description}</p></div>)}<div className="v362-action-grid two"><button onClick={() => store.setScreen('factions')}>Открыть Фракции</button><button onClick={() => store.setScreen('world')}>Обстановка</button></div></div>}

    {tab === 'cargo' && <div className="v361-scroll-list">{cargo.map((item) => {
      const artifact = item.artifactId ? store.galaxy?.artifacts.find((entry) => entry.id === item.artifactId) : undefined;
      const sameCivilization = artifact?.civilizationId === hub.civilizationId;
      return <article className={`v362-cargo-sale ${item.illegal ? 'danger' : ''}`} key={item.id}><span>{item.kind.toUpperCase()} · {item.illegal ? 'КОНТРАБАНДА' : `КОЛИЧЕСТВО ${item.quantity}`}</span><b>{item.name}</b><p>Оценка ₡{formatInteger(item.value)}</p>{item.artifactId ? <div className="v362-action-grid two"><button onClick={() => void store.sellArtifactToHub(item.id, hub.id, 'market')}>Рынок</button>{['university','religious','government'].includes(faction?.kind ?? '') && <button onClick={() => void store.sellArtifactToHub(item.id, hub.id, 'museum')}>Музей</button>}{sameCivilization && <button className="primary-button" onClick={() => void store.sellArtifactToHub(item.id, hub.id, 'heirs')}>Наследники</button>}{hub.services.includes('blackMarket') && <button className="danger-button" onClick={() => void store.sellArtifactToHub(item.id, hub.id, 'blackMarket')}>Чёрный рынок</button>}</div> : !item.contractId ? <button onClick={() => void store.sellCommodity(item.id, hub.id)}>Продать</button> : <small>Контрактный груз нельзя продать.</small>}</article>;
    })}{!cargo.length && <MobileEmptyV362 title="Трюм пуст" text="Покупки и найденные предметы появятся здесь."/>}</div>}
  </MobileCoverageV362>;
}
