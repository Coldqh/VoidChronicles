import { useEffect, useMemo, useState } from 'react';
import { useGameStore, type MainScreen } from '../game/store';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { APP_VERSION } from '../version';
import { formatInteger } from '../ui/format';
import '../styles/interfaceV352.css';

const BRAND_MARK = `${import.meta.env.BASE_URL}brand/void-chronicles-mark.webp`;

type NavigationItem = {
  id: MainScreen;
  label: string;
  icon: string;
  description: string;
  badge?: number;
};

export function ExperienceChrome() {
  const store = useGameStore();
  const compact = useCompactLayout();
  const [open, setOpen] = useState(false);
  const current = store.galaxy?.systems.find((system) => system.id === store.currentSystemId);

  const requestCount = store.storyScenes.filter((scene) => scene.status === 'available' && scene.operationRequest).length;
  const activeOperationCount = store.objectives.filter((objective) => objective.status === 'active' && objective.operation).length;
  const contractCount = store.contracts.filter((contract) => contract.status === 'available' || contract.status === 'active').length;
  const crisisCount = store.worldThreads.filter((thread) => thread.status === 'escalating' || thread.urgency >= 70).length;
  const shipIssueCount = store.ship?.life?.issues.filter((issue) => issue.status === 'open').length ?? 0;
  const fuel = store.ship?.fuel ?? 0;
  const hull = store.ship?.hull ?? 0;

  const mainItems = useMemo<NavigationItem[]>(() => [
    { id: 'command', label: 'Мостик', icon: '◆', description: 'Главное решение сейчас' },
    { id: 'system', label: 'Система', icon: '◉', description: 'Планеты, сигналы и высадки' },
    { id: 'galaxy', label: 'Карта', icon: '✦', description: 'Маршруты и сектора', badge: store.navigation.activePlan?.status === 'active' ? 1 : 0 },
    { id: 'operations', label: 'Операции', icon: '⚔', description: 'Запросы, контракты и задачи', badge: requestCount + activeOperationCount + contractCount }
  ], [activeOperationCount, contractCount, requestCount, store.navigation.activePlan?.status]);

  const secondaryItems = useMemo<NavigationItem[]>(() => [
    { id: 'world', label: 'Обстановка', icon: '◎', description: 'Кризисы, войны и новости', badge: crisisCount },
    { id: 'civilizations', label: 'Контакты', icon: '⌬', description: 'Дипломатия и профили видов' },
    { id: 'factions', label: 'Фракции', icon: '⚑', description: 'Политические силы' },
    { id: 'crew', label: 'Экипаж', icon: '♟', description: 'Люди, отношения и истории' },
    { id: 'ship', label: 'Корабль', icon: '▲', description: 'Отсеки, модули и запасы', badge: shipIssueCount },
    { id: 'laboratory', label: 'Лаборатория', icon: '◈', description: 'Артефакты и технологии' },
    { id: 'archive', label: 'Архив', icon: '▣', description: 'Открытия и расследования' },
    { id: 'chronicle', label: 'Хроника', icon: '◫', description: 'Известная история галактики' },
    { id: 'settings', label: 'Настройки', icon: '⚙', description: 'Сейв, PWA и кампания' }
  ], [crisisCount, shipIssueCount]);

  const urgent = store.storyScenes.find((scene) => scene.status === 'available')
    ?? store.worldThreads.find((thread) => thread.status === 'escalating');

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('v35-nav-open', open);
    return () => document.documentElement.classList.remove('v35-nav-open');
  }, [open]);

  if (!store.captain || !store.ship) return null;

  const navigate = (screen: MainScreen) => {
    store.setScreen(screen);
    setOpen(false);
  };

  const renderMenuItem = (item: NavigationItem) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
    <i>{item.icon}</i><span><b>{item.label}</b><small>{item.description}</small></span>{Boolean(item.badge) && <em>{item.badge}</em>}
  </button>;

  const worldMenu = secondaryItems.filter((item) => ['world', 'civilizations', 'factions', 'chronicle'].includes(item.id));
  const shipMenu = secondaryItems.filter((item) => ['crew', 'ship', 'laboratory', 'archive'].includes(item.id));
  const serviceMenu = secondaryItems.filter((item) => item.id === 'settings');

  const allMenu = open && <div className="v35-command-menu v361-command-menu">
    <button className="v35-command-menu-scrim" aria-label="Закрыть меню" onClick={() => setOpen(false)}/>
    <section className="v35-command-menu-panel v363-menu-panel" role="dialog" aria-label="Разделы">
      <header>
        <div><span className="eyebrow">VOID CHRONICLES · v{APP_VERSION}</span><h2>Разделы</h2></div>
        <button aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="v363-menu-scroll">
        <section className="v363-menu-group"><h3>Основное</h3><div className="v363-menu-grid">{mainItems.map(renderMenuItem)}</div></section>
        <section className="v363-menu-group"><h3>Мир</h3><div className="v363-menu-grid">{worldMenu.map(renderMenuItem)}</div></section>
        <section className="v363-menu-group"><h3>Корабль</h3><div className="v363-menu-grid">{shipMenu.map(renderMenuItem)}</div></section>
        <section className="v363-menu-group"><h3>Служебное</h3><div className="v363-menu-grid">{serviceMenu.map(renderMenuItem)}</div></section>
      </div>
      <footer className="v363-menu-footer">
        <span>Текущая система<b>{current?.name ?? 'Неизвестно'}</b></span>
        <strong>{formatInteger(hull)}% · {formatInteger(fuel)}%</strong>
      </footer>
    </section>
  </div>;

  if (compact) return <>
    <header className="app-hud v361-mobile-hud v363-mobile-hud">
      <button className="v361-mobile-location v363-mobile-location" onClick={() => navigate('system')}>
        <b>{current?.name ?? 'НЕИЗВЕСТНАЯ СИСТЕМА'}</b>
        <span>{urgent ? urgent.title : current?.region ?? 'КОРАБЛЬ В КОСМОСЕ'}</span>
      </button>
      <div className="v361-mobile-vitals"><span className={hull < 35 ? 'critical' : ''}>{formatInteger(hull)}%</span><span className={fuel < 25 ? 'critical' : ''}>{formatInteger(fuel)}%</span></div>
    </header>
    <nav className="mobile-dock v35-mobile-dock v361-mobile-dock" aria-label="Главная навигация">
      {mainItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
        <i>{item.icon}</i><span>{item.label}</span>{Boolean(item.badge) && <em>{item.badge}</em>}
      </button>)}
      <button className={open || secondaryItems.some((item) => item.id === store.screen) ? 'active' : ''} onClick={() => setOpen((value) => !value)}><i>•••</i><span>Ещё</span>{shipIssueCount > 0 && <em>{shipIssueCount}</em>}</button>
    </nav>
    {allMenu}
  </>;

  const hud = <header className="v35-hud">
    <button className="v35-hud-menu" aria-label="Открыть все разделы" onClick={() => setOpen((value) => !value)}><span/><span/><span/></button>
    <button className="v35-hud-brand" onClick={() => navigate('command')}><img src={BRAND_MARK} alt=""/><span><b>VOID CHRONICLES</b><small>v{APP_VERSION}</small></span></button>
    <div className="v35-hud-location"><span>{current?.name ?? 'НЕИЗВЕСТНАЯ СИСТЕМА'}</span><small>{store.currentHubId ? store.hubs.find((hub) => hub.id === store.currentHubId)?.name : current?.region ?? 'КОРАБЛЬ В КОСМОСЕ'}</small></div>
    {urgent && <button className="v35-hud-signal" onClick={() => 'choices' in urgent ? store.openStoryScene(urgent.id) : navigate('world')}><i/><span>{urgent.title}</span></button>}
    <div className="v35-hud-vitals"><span className={hull < 35 ? 'critical' : ''}><small>КОРПУС</small><b>{formatInteger(hull)}%</b></span><span className={fuel < 25 ? 'critical' : ''}><small>ТОПЛИВО</small><b>{formatInteger(fuel)}%</b></span><span><small>КРЕДИТЫ</small><b>₡{formatInteger(store.captain.credits)}</b></span></div>
  </header>;

  return <>
    {hud}
    <aside className="v35-rail" aria-label="Главные разделы">
      <button className="v35-rail-brand" onClick={() => navigate('command')}><img src={BRAND_MARK} alt="Void Chronicles"/></button>
      <nav>{mainItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)} title={item.description}><i>{item.icon}</i><span>{item.label}</span>{Boolean(item.badge) && <em>{item.badge}</em>}</button>)}</nav>
      <button className="v35-rail-more" onClick={() => setOpen(true)}><i>⌘</i><span>Все</span></button>
    </aside>
    {allMenu}
  </>;
}
