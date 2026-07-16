import { useEffect, useMemo, useState } from 'react';
import { useGameStore, type MainScreen } from '../game/store';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { APP_VERSION } from '../version';
import { formatInteger } from '../ui/format';

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
  const crisisCount = store.worldThreads.filter((thread) => thread.status === 'escalating' || thread.urgency >= 70).length;
  const shipIssueCount = store.ship?.life?.issues.filter((issue) => issue.status === 'open').length ?? 0;
  const fuel = store.ship?.fuel ?? 0;
  const hull = store.ship?.hull ?? 0;

  const mainItems = useMemo<NavigationItem[]>(() => [
    { id: 'command', label: 'Мостик', icon: '◆', description: 'Главное решение сейчас' },
    { id: 'galaxy', label: 'Карта', icon: '✦', description: 'Маршруты и сектора', badge: store.navigation.activePlan?.status === 'active' ? 1 : 0 },
    { id: 'operations', label: 'Операции', icon: '⚔', description: 'Запросы и активные задачи', badge: requestCount + activeOperationCount },
    { id: 'world', label: 'Мир', icon: '◎', description: 'Цивилизации и кризисы', badge: crisisCount },
    { id: 'ship', label: 'Корабль', icon: '▲', description: 'Отсеки, люди и запасы', badge: shipIssueCount }
  ], [activeOperationCount, crisisCount, requestCount, shipIssueCount, store.navigation.activePlan?.status]);

  const secondaryItems = useMemo<NavigationItem[]>(() => [
    { id: 'system', label: 'Текущая система', icon: '◉', description: 'Планеты, сигналы и высадки' },
    { id: 'civilizations', label: 'Контакты', icon: '⌬', description: 'Дипломатия и профили видов' },
    { id: 'crew', label: 'Экипаж', icon: '♟', description: 'Люди, отношения и истории' },
    { id: 'laboratory', label: 'Лаборатория', icon: '◈', description: 'Артефакты и технологии' },
    { id: 'contracts', label: 'Контракты', icon: '▤', description: 'Работа и обязательства' },
    { id: 'factions', label: 'Фракции', icon: '⚑', description: 'Политические силы' },
    { id: 'archive', label: 'Архив', icon: '▣', description: 'Открытия и расследования' },
    { id: 'chronicle', label: 'Хроника', icon: '◫', description: 'Известная история галактики' },
    { id: 'settings', label: 'Настройки', icon: '⚙', description: 'Сейв, PWA и кампания' }
  ], []);

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

  const hud = <header className="v35-hud">
    <button className="v35-hud-menu" aria-label="Открыть все разделы" onClick={() => setOpen((value) => !value)}>
      <span/><span/><span/>
    </button>
    <button className="v35-hud-brand" onClick={() => navigate('command')}>
      <img src={BRAND_MARK} alt=""/>
      <span><b>VOID CHRONICLES</b><small>v{APP_VERSION}</small></span>
    </button>
    <div className="v35-hud-location">
      <span>{current?.name ?? 'НЕИЗВЕСТНАЯ СИСТЕМА'}</span>
      <small>{store.currentHubId ? store.hubs.find((hub) => hub.id === store.currentHubId)?.name : current?.region ?? 'КОРАБЛЬ В КОСМОСЕ'}</small>
    </div>
    {urgent && <button className="v35-hud-signal" onClick={() => 'choices' in urgent ? store.openStoryScene(urgent.id) : navigate('world')}>
      <i/><span>{urgent.title}</span>
    </button>}
    <div className="v35-hud-vitals">
      <span className={hull < 35 ? 'critical' : ''}><small>КОРПУС</small><b>{formatInteger(hull)}%</b></span>
      <span className={fuel < 25 ? 'critical' : ''}><small>ТОПЛИВО</small><b>{formatInteger(fuel)}%</b></span>
      <span><small>КРЕДИТЫ</small><b>₡{formatInteger(store.captain.credits)}</b></span>
    </div>
  </header>;

  const allMenu = open && <div className="v35-command-menu">
    <button className="v35-command-menu-scrim" aria-label="Закрыть меню" onClick={() => setOpen(false)}/>
    <section className="v35-command-menu-panel" role="dialog" aria-label="Все разделы корабля">
      <header>
        <div><span className="eyebrow">КОРАБЕЛЬНАЯ СИСТЕМА</span><h2>Куда перейти</h2></div>
        <button aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="v35-menu-primary">
        {mainItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
          <i>{item.icon}</i><span><b>{item.label}</b><small>{item.description}</small></span>{Boolean(item.badge) && <em>{item.badge}</em>}
        </button>)}
      </div>
      <div className="v35-menu-secondary">
        {secondaryItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
          <i>{item.icon}</i><span><b>{item.label}</b><small>{item.description}</small></span>
        </button>)}
      </div>
    </section>
  </div>;

  if (compact) return <>
    {hud}
    <nav className="v35-mobile-dock" aria-label="Главная навигация">
      {mainItems.slice(0, 3).map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
        <i>{item.icon}</i><span>{item.label}</span>{Boolean(item.badge) && <em>{item.badge}</em>}
      </button>)}
      <button className={open ? 'active' : ''} onClick={() => setOpen((value) => !value)}><i>•••</i><span>Ещё</span>{shipIssueCount > 0 && <em>{shipIssueCount}</em>}</button>
    </nav>
    {allMenu}
  </>;

  return <>
    {hud}
    <aside className="v35-rail" aria-label="Главные разделы">
      <button className="v35-rail-brand" onClick={() => navigate('command')}><img src={BRAND_MARK} alt="Void Chronicles"/></button>
      <nav>
        {mainItems.map((item) => <button key={item.id} className={store.screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)} title={item.description}>
          <i>{item.icon}</i><span>{item.label}</span>{Boolean(item.badge) && <em>{item.badge}</em>}
        </button>)}
      </nav>
      <button className="v35-rail-more" onClick={() => setOpen(true)}><i>⌘</i><span>Все</span></button>
    </aside>
    {allMenu}
  </>;
}
