import { useMemo, useState, type ReactNode } from 'react';
import { availableDiplomaticActions, diplomaticProfile, diplomaticStanding, type DiplomaticActionId } from '../diplomacy/model';
import { executeDiplomaticAction } from '../diplomacy/runtime';
import type { Civilization, CivilizationContact } from '../game/types';
import { useGameStore } from '../game/store';
import { contactStageLabel } from '../world/civilizations';
import { formatInteger, formatPopulation } from '../ui/format';

const stageRank: Record<CivilizationContact['stage'], number> = {
  unknown: 0, observed: 1, signals: 2, translated: 3, contacted: 4, trusted: 5, failed: 1
};

export function ContactsScreen({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<DiplomaticActionId | undefined>(undefined);
  const contacts = useMemo(() => store.civilizationContacts
    .filter((contact) => contact.stage !== 'unknown')
    .map((contact) => ({
      contact,
      civilization: store.galaxy?.civilizations.find((entry) => entry.id === contact.civilizationId)
    }))
    .filter((entry): entry is { contact: CivilizationContact; civilization: Civilization } => Boolean(entry.civilization)), [store.civilizationContacts, store.galaxy]);
  const selected = contacts.find((entry) => entry.civilization.id === selectedId) ?? contacts[0];
  const civilization = selected?.civilization;
  const contact = selected?.contact;
  const profile = civilization && contact && store.simulation
    ? diplomaticProfile(civilization, contact, store.simulation.events)
    : undefined;
  const settlements = civilization ? Object.values(store.simulation?.settlements ?? {}).filter((entry) => entry.civilizationId === civilization.id && !entry.abandoned) : [];
  const crisis = civilization ? store.worldThreads.find((thread) => thread.civilizationIds.includes(civilization.id) && ['active', 'escalating'].includes(thread.status)) : undefined;
  const requests = civilization ? store.storyScenes.filter((scene) => scene.status === 'available' && scene.operationRequest?.issuerCivilizationId === civilization.id) : [];
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

  return <div className="game-shell">{chrome}<main className="v32-contacts">
    <aside className="v32-contact-list">
      <header><span className="eyebrow">ДИПЛОМАТИЧЕСКАЯ СЕТЬ</span><h1>Контакты</h1><p>Не энциклопедия. Здесь живые стороны, запросы и память о решениях.</p></header>
      {contacts.length ? contacts.map((entry) => {
        const p = store.simulation ? diplomaticProfile(entry.civilization, entry.contact, store.simulation.events) : undefined;
        return <button key={entry.civilization.id} className={civilization?.id === entry.civilization.id ? 'active' : ''} onClick={() => { setSelectedId(entry.civilization.id); setNotice(''); }}>
          <span>{contactStageLabel(entry.contact.stage)}</span><b>{entry.civilization.name}</b><small>{p ? diplomaticStanding(p) : 'данных мало'} · запросов {store.storyScenes.filter((scene) => scene.status === 'available' && scene.operationRequest?.issuerCivilizationId === entry.civilization.id).length}</small>
        </button>;
      }) : <div className="v32-empty"><b>Каналов нет</b><p>Сканируй населённые системы и расшифровывай сигналы.</p></div>}
    </aside>
    <section className="v32-contact-dossier">{civilization && contact && profile ? <>
      <header><div><span className="eyebrow">{contactStageLabel(contact.stage).toUpperCase()}</span><h2>{civilization.name}</h2><p>{civilization.speciesName} · {diplomaticStanding(profile)}</p></div><strong>{formatInteger(profile.trust)}</strong></header>
      {notice && <div className="v32-notice">{notice}</div>}
      <section className="v32-contact-summary">
        <article><span>НАСЕЛЕНИЕ</span><b>{formatPopulation(settlements.reduce((sum, entry) => sum + entry.population, 0))}</b></article>
        <article><span>ДОВЕРИЕ</span><b>{formatInteger(profile.trust)}</b></article>
        <article><span>УВАЖЕНИЕ</span><b>{formatInteger(profile.respect)}</b></article>
        <article><span>ПОДОЗРЕНИЕ</span><b>{formatInteger(profile.suspicion)}</b></article>
      </section>
      <article className="v32-contact-crisis"><span className="eyebrow">СЕЙЧАС</span><h3>{crisis?.title ?? 'Срочных сообщений нет'}</h3><p>{crisis?.summary ?? 'Канал не сообщает о подтверждённом кризисе.'}</p>{requests.length > 0 && <button onClick={() => store.setScreen('operations')}>Открыть запросы · {requests.length}</button>}</article>
      {stageRank[contact.stage] < 4 ? <article className="v32-contact-actions"><h3>Канал не завершён</h3><p>Язык {contact.languageLevel}/5 · попыток {contact.attempts}.</p><button className="primary-button" disabled={!localChannel} onClick={async () => { const result = await store.attemptFirstContact(civilization.id); setNotice(result.message); }}>{localChannel ? 'Продолжить контакт' : 'Нужно находиться в их системе'}</button></article> :
      <section className="v32-diplomatic-actions"><h3>Предложения</h3>{actions.map((action) => <button key={action.id} disabled={!action.available || Boolean(busy)} onClick={() => void act(action.id)}><b>{action.label}</b><span>{action.description}</span><small>{action.available ? action.cost ? `₡${action.cost}` : 'без оплаты' : action.blockedReason}</small></button>)}</section>}
      <article className="v32-contact-memory"><h3>Память отношений</h3>{profile.messages.length ? profile.messages.slice(0, 8).map((message) => <div key={message.id}><span>{message.outcome}</span><b>{message.title}</b><p>{message.summary}</p></div>) : <p>Формальных решений ещё не было.</p>}</article>
    </> : <div className="v32-empty"><b>Контакт не выбран</b></div>}</section>
  </main></div>;
}
