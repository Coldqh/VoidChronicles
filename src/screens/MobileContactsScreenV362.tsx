import { useMemo, useState, type ReactNode } from 'react';
import { availableDiplomaticActions, diplomaticProfile, diplomaticStanding, type DiplomaticActionId } from '../diplomacy/model';
import { executeDiplomaticAction } from '../diplomacy/runtime';
import type { Civilization, CivilizationContact } from '../game/types';
import { useGameStore } from '../game/store';
import { formatInteger, formatPopulation } from '../ui/format';
import { contactStageLabel } from '../world/civilizations';
import { MobileBackV362, MobileCoverageV362, MobileEmptyV362 } from '../components/MobileCoverageV362';

type ContactsTab = 'contacts' | 'requests';
type ContactDossierTab = 'overview' | 'diplomacy' | 'memory';

const stageRank: Record<CivilizationContact['stage'], number> = {
  unknown: 0, observed: 1, signals: 2, translated: 3, contacted: 4, trusted: 5, failed: 1
};

export function MobileContactsScreenV362({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<ContactsTab>('contacts');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossierTab, setDossierTab] = useState<ContactDossierTab>('overview');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<DiplomaticActionId | undefined>();

  const contacts = useMemo(() => store.civilizationContacts
    .filter((contact) => contact.stage !== 'unknown')
    .map((contact) => ({ contact, civilization: store.galaxy?.civilizations.find((entry) => entry.id === contact.civilizationId) }))
    .filter((entry): entry is { contact: CivilizationContact; civilization: Civilization } => Boolean(entry.civilization)), [store.civilizationContacts, store.galaxy]);

  const selected = contacts.find((entry) => entry.civilization.id === selectedId);
  const civilization = selected?.civilization;
  const contact = selected?.contact;
  const profile = civilization && contact && store.simulation ? diplomaticProfile(civilization, contact, store.simulation.events) : undefined;
  const settlements = civilization ? Object.values(store.simulation?.settlements ?? {}).filter((entry) => entry.civilizationId === civilization.id && !entry.abandoned) : [];
  const crisis = civilization ? store.worldThreads.find((thread) => thread.civilizationIds.includes(civilization.id) && ['active','escalating'].includes(thread.status)) : undefined;
  const requests = store.storyScenes.filter((scene) => scene.status === 'available' && scene.operationRequest?.issuerCivilizationId);
  const currentSystem = store.galaxy?.systems.find((system) => system.id === store.currentSystemId);
  const localChannel = Boolean(civilization && currentSystem && (currentSystem.civilizationIds.includes(civilization.id) || currentSystem.planets.some((planet) => planet.civilizationId === civilization.id)));
  const heritage = civilization ? store.ship?.cargo.some((item) => item.artifactId && store.galaxy?.artifacts.find((artifact) => artifact.id === item.artifactId)?.civilizationId === civilization.id) : false;
  const actions = profile ? availableDiplomaticActions(profile, {
    hasHeritage: Boolean(heritage),
    hasSettlement: settlements.length > 0,
    hasCrisis: Boolean(crisis),
    hasTradeAgreement: profile.agreements.includes('trade'),
    hasLandingAccess: profile.agreements.includes('landing')
  }) : [];

  const act = async (action: DiplomaticActionId) => {
    if (!civilization) return;
    setBusy(action);
    const result = await executeDiplomaticAction(civilization.id, action);
    setNotice(result.message);
    setBusy(undefined);
  };

  return <MobileCoverageV362<ContactsTab>
    chrome={chrome}
    eyebrow="ДИПЛОМАТИЧЕСКАЯ СЕТЬ"
    title="Контакты"
    badge={contacts.length}
    tabs={[{ id: 'contacts', label: 'Цивилизации', count: contacts.length }, { id: 'requests', label: 'Запросы', count: requests.length }]}
    activeTab={tab}
    onTabChange={(next) => { setTab(next); setSelectedId(null); }}
    className="v362-contacts-screen"
  >
    {notice && <button className="v361-notice" onClick={() => setNotice('')}>{notice}</button>}

    {tab === 'contacts' && !selected && <div className="v361-scroll-list">
      {contacts.map((entry) => {
        const relation = store.simulation ? diplomaticProfile(entry.civilization, entry.contact, store.simulation.events) : undefined;
        const requestCount = store.storyScenes.filter((scene) => scene.status === 'available' && scene.operationRequest?.issuerCivilizationId === entry.civilization.id).length;
        return <button className="v361-list-button" key={entry.civilization.id} onClick={() => { setSelectedId(entry.civilization.id); setDossierTab('overview'); }}>
          <span>{contactStageLabel(entry.contact.stage).toUpperCase()}</span><b>{entry.civilization.name}</b><p>{entry.civilization.speciesName} · {relation ? diplomaticStanding(relation) : 'данных мало'} · запросов {requestCount}</p><em>›</em>
        </button>;
      })}
      {!contacts.length && <MobileEmptyV362 title="Каналов нет" text="Сканируй населённые системы и расшифровывай сигналы."/>}
    </div>}

    {tab === 'contacts' && civilization && contact && profile && <article className="v361-dossier">
      <MobileBackV362 onClick={() => setSelectedId(null)}/>
      <span>{contactStageLabel(contact.stage).toUpperCase()} · {diplomaticStanding(profile).toUpperCase()}</span><h2>{civilization.name}</h2><p>{civilization.speciesName} · {civilization.ideology}</p>
      <nav className="v361-subtabs">{(['overview','diplomacy','memory'] as ContactDossierTab[]).map((entry) => <button key={entry} className={dossierTab === entry ? 'active' : ''} onClick={() => setDossierTab(entry)}>{entry === 'overview' ? 'Обзор' : entry === 'diplomacy' ? 'Переговоры' : 'Память'}</button>)}</nav>

      {dossierTab === 'overview' && <>
        <div className="v361-metric-row"><span>Население<b>{stageRank[contact.stage] >= 4 ? formatPopulation(settlements.reduce((sum, entry) => sum + entry.population, 0)) : 'неизвестно'}</b></span><span>Доверие<b>{formatInteger(profile.trust)}</b></span><span>Подозрение<b>{formatInteger(profile.suspicion)}</b></span></div>
        <div className="v361-detail-block"><h3>{crisis?.title ?? 'Срочных сообщений нет'}</h3><p>{crisis?.summary ?? 'Подтверждённого кризиса по этому каналу нет.'}</p>{crisis && <button onClick={() => store.setScreen('world')}>Открыть Обстановку</button>}</div>
        <div className="v361-chip-list">{civilization.traits.slice(0, 8).map((trait) => <span key={trait}>{trait}</span>)}</div>
        <dl><div><dt>Технологии</dt><dd>{civilization.techLevel}</dd></div><div><dt>Политика чужаков</dt><dd>{civilization.outsiderPolicy ?? 'неизвестно'}</dd></div><div><dt>Поселения</dt><dd>{settlements.length}</dd></div></dl>
      </>}

      {dossierTab === 'diplomacy' && <>
        {stageRank[contact.stage] < 4 ? <div className="v361-detail-block warning"><h3>Незавершённый канал</h3><p>Язык {contact.languageLevel}/5 · попыток связи {formatInteger(contact.attempts)}.</p><button className="primary-button" disabled={!localChannel} onClick={async () => setNotice((await store.attemptFirstContact(civilization.id)).message)}>{localChannel ? 'Продолжить контакт' : 'Нужно находиться в их системе'}</button></div> : <div className="v362-dossier-list">{actions.map((action) => <button className="v362-diplomatic-action" key={action.id} disabled={!action.available || Boolean(busy)} onClick={() => void act(action.id)}><b>{action.label}</b><span>{action.description}</span><small>{action.available ? action.cost ? `₡${action.cost}` : 'без оплаты' : action.blockedReason}</small></button>)}</div>}
        {profile.agreements.length > 0 && <div className="v361-chip-list">{profile.agreements.map((agreement) => <span key={agreement}>{agreement}</span>)}</div>}
      </>}

      {dossierTab === 'memory' && <div className="v362-dossier-list">{profile.messages.slice(0, 12).map((message) => <article className="v361-list-static" key={message.id}><span>{message.outcome}</span><b>{message.title}</b><p>{message.summary}</p></article>)}{!profile.messages.length && <MobileEmptyV362 title="Формальных решений нет" text="Память появится после переговоров, помощи и конфликтов."/>}</div>}
    </article>}

    {tab === 'requests' && <div className="v361-scroll-list">
      {requests.map((scene) => <button className="v361-list-button" key={scene.id} onClick={() => store.openStoryScene(scene.id)}><span>{scene.operationRequest?.category.toUpperCase()} · СРОЧНОСТЬ {scene.operationRequest?.urgency}</span><b>{scene.title}</b><p>{scene.operationRequest?.issuerName} · ₡{scene.operationRequest?.reward}</p><em>›</em></button>)}
      {!requests.length && <MobileEmptyV362 title="Запросов нет" text="Новые предложения появятся после контактов и кризисов."/>}
    </div>}
  </MobileCoverageV362>;
}
