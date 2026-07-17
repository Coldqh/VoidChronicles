import { useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { exportSnapshot } from '../persistence/db';
import { forceApplicationUpdate } from '../runtime/update';
import { APP_CODENAME, APP_VERSION, BUILD_TIME, SAVE_SCHEMA_VERSION } from '../version';
import { MobileCoverageV362 } from '../components/MobileCoverageV362';

type SettingsTab = 'game' | 'saves' | 'pwa' | 'campaign';

export function MobileSettingsScreenV362({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<SettingsTab>('game');
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState('');
  const snapshot = store.getSnapshot();

  const update = async () => {
    setUpdating(true);
    try { await forceApplicationUpdate(); }
    catch (error) { setUpdating(false); setNotice(error instanceof Error ? error.message : 'Ошибка обновления'); }
  };

  return <MobileCoverageV362<SettingsTab>
    chrome={chrome}
    eyebrow={`VOID CHRONICLES · v${APP_VERSION}`}
    title="Настройки"
    badge={`v${SAVE_SCHEMA_VERSION}`}
    tabs={[
      { id: 'game', label: 'Игра' },
      { id: 'saves', label: 'Сейвы', count: store.backupCount },
      { id: 'pwa', label: 'Приложение' },
      { id: 'campaign', label: 'Кампания' }
    ]}
    activeTab={tab}
    onTabChange={setTab}
    className="v362-settings-screen"
  >
    {notice && <button className="v361-notice" onClick={() => setNotice('')}>{notice}</button>}

    {tab === 'game' && <div className="v361-scroll-list"><div className="v362-version-card"><span>ТЕКУЩАЯ ВЕРСИЯ</span><b>v{APP_VERSION}</b><p>{APP_CODENAME}</p></div><div className="v361-list-static"><span>СХЕМА СОХРАНЕНИЯ</span><b>v{SAVE_SCHEMA_VERSION}</b><p>Старые сейвы мигрируют автоматически.</p></div><div className="v361-list-static"><span>СБОРКА</span><b>{BUILD_TIME === 'development' ? 'development' : new Date(BUILD_TIME).toLocaleString('ru-RU')}</b><p>Технический идентификатор установленной версии.</p></div><div className="v361-detail-block"><h3>Обучение</h3><p>{store.tutorial.completed ? 'Первый рейс завершён.' : 'Вводный маршрут активен.'}</p><button onClick={() => void store.restartTutorial()}>Запустить заново</button></div></div>}

    {tab === 'saves' && <div className="v361-scroll-list"><div className="v361-list-static"><span>IRONMAN</span><b>{store.saveAvailable ? 'Сохранение доступно' : 'Активного сейва нет'}</b><p>Статус записи: {store.saveStatus} · резервных копий {store.backupCount}</p></div>{store.saveMeta && <div className="v361-list-static"><span>ПОСЛЕДНЯЯ ЗАПИСЬ</span><b>{new Date(store.saveMeta.savedAt).toLocaleString('ru-RU')}</b><p>Версия {store.saveMeta.appVersion} · последовательность {store.saveMeta.sequence}</p></div>}<div className="v362-action-grid two"><button className="primary-button" onClick={async () => { const ok = await store.createBackup(); setNotice(ok ? 'Резервная копия создана.' : 'Не удалось создать backup.'); }}>Создать backup</button><button disabled={!snapshot} onClick={() => snapshot && exportSnapshot(snapshot)}>Экспортировать</button></div>{store.recoveryNotice && <div className="v361-detail-block warning"><h3>Восстановление</h3><p>{store.recoveryNotice}</p><button onClick={store.dismissRecoveryNotice}>Закрыть</button></div>}{store.saveError && <div className="v361-detail-block warning"><h3>Ошибка сейва</h3><p>{store.saveError}</p><button onClick={store.dismissSaveError}>Скрыть</button></div>}</div>}

    {tab === 'pwa' && <div className="v361-scroll-list"><div className="v361-detail-block"><h3>Обновление приложения</h3><p>Перезагружает PWA и применяет свежую сборку. IndexedDB и ironman не удаляются.</p><button className="primary-button v362-wide-button" disabled={updating} onClick={() => void update()}>{updating ? 'Обновление…' : 'Принудительно обновить'}</button></div><div className="v361-list-static"><span>ОФЛАЙН-РЕЖИМ</span><b>Данные кампании хранятся локально</b><p>После полной загрузки основные ресурсы доступны без сети.</p></div><div className="v361-list-static"><span>БЕЗОПАСНАЯ ОБЛАСТЬ</span><b>iPhone safe-area включена</b><p>HUD и нижняя панель учитывают Dynamic Island и системный индикатор.</p></div></div>}

    {tab === 'campaign' && <div className="v361-scroll-list"><div className="v361-detail-block warning"><h3>Опасная зона</h3><p>Обе операции удаляют текущий сейв и резервные копии.</p></div><button className="danger-button v362-wide-button" onClick={() => { if (window.confirm('Удалить текущую кампанию без возможности восстановления?')) void store.clearGame(); }}>Сбросить кампанию</button><button className="danger-button v362-wide-button" onClick={() => { if (!store.galaxy || !window.confirm('Удалить кампанию и подготовить новую с теми же настройками?')) return; try { localStorage.setItem('void-chronicles:new-campaign-preset', JSON.stringify(store.galaxy.settings)); } catch {} void store.clearGame(); }}>Начать заново с теми же параметрами</button></div>}
  </MobileCoverageV362>;
}
