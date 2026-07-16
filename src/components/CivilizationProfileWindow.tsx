import { useEffect, useMemo, useState } from 'react';
import type { Civilization, ContactStage } from '../game/types';
import { useGameStore } from '../game/store';
import { formatInteger, formatMetric, formatPopulation } from '../ui/format';
import { contactStageLabel } from '../world/civilizations';

type ProfileTab = 'overview' | 'species' | 'culture' | 'politics' | 'history';

const stageRank: Record<ContactStage, number> = {
  unknown: 0,
  observed: 1,
  signals: 2,
  translated: 3,
  contacted: 4,
  trusted: 5,
  failed: 1
};

const eraLabel: Record<string, string> = {
  'pre-sapient': 'доразумная',
  tribal: 'племенная',
  neolithic: 'неолитическая',
  urban: 'городская',
  bronze: 'бронзовый век',
  iron: 'железный век',
  medieval: 'средневековая',
  gunpowder: 'пороховая',
  industrial: 'индустриальная',
  modern: 'современная',
  atomic: 'атомная',
  'early-space': 'ранняя космическая',
  interplanetary: 'межпланетная',
  interstellar: 'межзвёздная',
  advanced: 'развитая'
};

const technologyLabels: Record<string, string> = {
  subsistence: 'Обеспечение',
  agriculture: 'Сельское хозяйство',
  materials: 'Материалы',
  writing: 'Письменность',
  governance: 'Управление',
  medicine: 'Медицина',
  navigation: 'Навигация',
  military: 'Военное дело',
  industry: 'Промышленность',
  energy: 'Энергетика',
  computing: 'Вычисления',
  biology: 'Биология',
  spaceflight: 'Космонавтика',
  ftl: 'Сверхсветовые технологии'
};

function UnknownBlock({ title, reason }: { title: string; reason: string }) {
  return <article className="civilization-unknown">
    <span>НЕТ ПОДТВЕРЖДЁННЫХ ДАННЫХ</span>
    <h3>{title}</h3>
    <p>{reason}</p>
  </article>;
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return <div className="civilization-profile-metric"><span>{label}</span><b>{value}</b></div>;
}

function civilizationStatus(civilization: Civilization): string {
  if (civilization.status === 'dead') return 'исчезнувшая';
  if (civilization.status === 'hidden') return 'скрытая';
  return 'живая';
}

export function CivilizationProfileWindow({
  civilizationId,
  onClose,
  onOpenContacts
}: {
  civilizationId: string | null;
  onClose(): void;
  onOpenContacts?(): void;
}) {
  const store = useGameStore();
  const [tab, setTab] = useState<ProfileTab>('overview');

  useEffect(() => {
    if (!civilizationId) return;
    setTab('overview');
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [civilizationId, onClose]);

  const civilization = store.galaxy?.civilizations.find((entry) => entry.id === civilizationId);
  const contact = store.civilizationContacts.find((entry) => entry.civilizationId === civilizationId);
  const rank = stageRank[contact?.stage ?? 'unknown'];

  const settlements = useMemo(
    () => Object.values(store.simulation?.settlements ?? {})
      .filter((entry) => entry.civilizationId === civilizationId && !entry.abandoned)
      .sort((a, b) => b.population - a.population),
    [store.simulation?.settlements, civilizationId]
  );
  const factions = useMemo(
    () => store.factions.filter((entry) => entry.civilizationId === civilizationId),
    [store.factions, civilizationId]
  );
  const history = useMemo(
    () => store.galaxy?.history
      .filter((entry) => entry.civilizationIds.includes(civilizationId ?? ''))
      .sort((a, b) => b.year - a.year) ?? [],
    [store.galaxy, civilizationId]
  );
  const figures = useMemo(
    () => store.galaxy?.figures
      .filter((entry) => entry.civilizationId === civilizationId)
      .sort((a, b) => b.importance - a.importance) ?? [],
    [store.galaxy, civilizationId]
  );
  const artifacts = useMemo(
    () => store.galaxy?.artifacts
      .filter((entry) => entry.civilizationId === civilizationId && (entry.discovered || store.ship?.cargo.some((item) => item.artifactId === entry.id)))
      .sort((a, b) => b.value - a.value) ?? [],
    [store.galaxy, store.ship?.cargo, civilizationId]
  );

  if (!civilizationId || !civilization) return null;

  const simulationCivilization = store.simulation?.civilizations[civilization.id];
  const population = settlements.length
    ? settlements.reduce((sum, entry) => sum + entry.population, 0)
    : simulationCivilization?.population ?? civilization.development?.population ?? 0;
  const homeSystem = store.galaxy?.systems.find((entry) => entry.id === civilization.homeSystemId);
  const controlledSystems = store.galaxy?.systems.filter((entry) => civilization.controlledSystems.includes(entry.id)) ?? [];
  const deepSpecies = store.galaxy?.deepTime?.species.find((entry) => entry.civilizationId === civilization.id);
  const deepCultures = store.galaxy?.deepTime?.cultures
    .filter((entry) => entry.civilizationId === civilization.id)
    .sort((a, b) => b.originYear - a.originYear) ?? [];
  const deepPolities = store.galaxy?.deepTime?.polities
    .filter((entry) => entry.civilizationId === civilization.id)
    .sort((a, b) => b.formedYear - a.formedYear) ?? [];
  const wars = store.galaxy?.deepTime?.wars
    ?.filter((entry) => entry.civilizationIds.includes(civilization.id))
    .sort((a, b) => b.startYear - a.startYear) ?? [];
  const livingStates = civilization.states?.filter((entry) => entry.status === 'active') ?? [];
  const liveRequests = store.storyScenes.filter(
    (scene) => scene.status === 'available' && scene.operationRequest?.issuerCivilizationId === civilization.id
  );
  const knownHistory = rank >= 5 || history.some((entry) =>
    entry.systemIds.some((systemId) => store.galaxy?.systems.find((system) => system.id === systemId)?.visited)
  );

  const tabs: Array<{ id: ProfileTab; label: string; minimumRank: number }> = [
    { id: 'overview', label: 'Сводка', minimumRank: 1 },
    { id: 'species', label: 'Вид', minimumRank: 1 },
    { id: 'culture', label: 'Культура', minimumRank: 3 },
    { id: 'politics', label: 'Политика', minimumRank: 4 },
    { id: 'history', label: 'История', minimumRank: 5 }
  ];

  return <div className="civilization-profile-layer" role="dialog" aria-modal="true" aria-label={`Профиль цивилизации: ${civilization.name}`}>
    <button className="civilization-profile-scrim" aria-label="Закрыть профиль" onClick={onClose}/>
    <section className="civilization-profile-window">
      <header className="civilization-profile-header">
        <div>
          <span className="eyebrow">{contactStageLabel(contact?.stage ?? 'unknown').toUpperCase()} · {civilizationStatus(civilization).toUpperCase()}</span>
          <h1>{civilization.name}</h1>
          <p>{rank >= 1 ? civilization.speciesName : 'Биологическая принадлежность не установлена'} · {rank >= 3 ? civilization.ideology : 'идеология не расшифрована'}</p>
        </div>
        <div className="civilization-profile-header-actions">
          {onOpenContacts && <button onClick={onOpenContacts}>Открыть дипломатию</button>}
          <button className="civilization-profile-close" aria-label="Закрыть" onClick={onClose}>×</button>
        </div>
      </header>

      <nav className="civilization-profile-tabs">
        {tabs.map((entry) => <button
          key={entry.id}
          className={tab === entry.id ? 'active' : ''}
          disabled={rank < entry.minimumRank && !(entry.id === 'history' && knownHistory)}
          onClick={() => setTab(entry.id)}
        >{entry.label}</button>)}
      </nav>

      <div className="civilization-profile-body">
        {tab === 'overview' && <section className="civilization-profile-overview">
          <div className="civilization-profile-metrics">
            <ProfileMetric label="Стадия связи" value={contactStageLabel(contact?.stage ?? 'unknown')}/>
            <ProfileMetric label="Эпоха" value={rank >= 2 ? eraLabel[civilization.era ?? civilization.development?.era ?? 'unknown'] ?? 'не определена' : 'не определена'}/>
            <ProfileMetric label="Население" value={rank >= 4 ? formatPopulation(population) : 'оценка отсутствует'}/>
            <ProfileMetric label="Территория" value={rank >= 4 ? `${formatInteger(controlledSystems.length)} систем` : 'границы неизвестны'}/>
            <ProfileMetric label="Доверие" value={contact ? formatMetric(contact.trust) : 'нет канала'}/>
            <ProfileMetric label="Запросы" value={rank >= 4 ? formatInteger(liveRequests.length) : 'неизвестно'}/>
          </div>

          <section className="civilization-profile-grid">
            <article>
              <span className="eyebrow">ПОДТВЕРЖДЁННАЯ СВОДКА</span>
              <h2>{civilization.speciesName}</h2>
              <p>{rank >= 3 ? civilization.traits.join(' · ') || 'Отличительные черты не выделены.' : 'Получены только общие биологические и радиосигнальные данные.'}</p>
              {rank >= 4 && <><b>Родная система</b><p>{homeSystem?.name ?? 'координаты утрачены'}</p></>}
            </article>
            <article>
              <span className="eyebrow">ТЕКУЩЕЕ СОСТОЯНИЕ</span>
              <h2>{liveRequests[0]?.title ?? 'Открытого запроса нет'}</h2>
              <p>{liveRequests[0]?.summary ?? (rank >= 4 ? 'Официальный канал не сообщает о срочном кризисе.' : 'Нужен официальный контакт.')}</p>
            </article>
          </section>

          {rank >= 4 ? <section className="civilization-profile-territory">
            <h2>Известные территории</h2>
            <div>{controlledSystems.slice(0, 12).map((system) => <span key={system.id}>{system.name}</span>)}</div>
            {controlledSystems.length === 0 && <p>Подтверждённых территорий нет.</p>}
          </section> : <UnknownBlock title="Территория и население" reason="Официальный контакт открывает границы, поселения и демографические оценки."/>}
        </section>}

        {tab === 'species' && <section className="civilization-profile-section">
          <header><span className="eyebrow">БИОЛОГИЧЕСКОЕ ДОСЬЕ</span><h2>{civilization.speciesName}</h2></header>
          {rank >= 1 ? <div className="civilization-profile-species">
            <ProfileMetric label="Строение тела" value={civilization.speciesProfile?.bodyPlan ?? 'не установлено'}/>
            <ProfileMetric label="Метаболизм" value={rank >= 2 ? civilization.speciesProfile?.metabolism ?? 'не установлено' : 'нужны образцы'}/>
            <ProfileMetric label="Размножение" value={rank >= 3 ? civilization.speciesProfile?.reproduction ?? 'не установлено' : 'неизвестно'}/>
            <ProfileMetric label="Продолжительность жизни" value={rank >= 3 && civilization.speciesProfile ? `${formatInteger(civilization.speciesProfile.lifespan)} лет` : 'неизвестно'}/>
            <ProfileMetric label="Среда происхождения" value={deepSpecies?.homeEnvironment ?? civilization.speciesProfile?.homeAdaptation ?? 'не установлена'}/>
            <ProfileMetric label="Особенность" value={rank >= 3 ? civilization.speciesProfile?.unusualTrait ?? 'не выявлена' : 'данных мало'}/>
          </div> : <UnknownBlock title="Биологическое досье" reason="Нужно наблюдение или прямой скан населённой системы."/>}
          {rank >= 4 && deepSpecies && <article className="civilization-profile-text-card">
            <h3>Эволюционная оценка</h3>
            <p>Адаптивность {formatMetric(deepSpecies.adaptability)} · кооперация {formatMetric(deepSpecies.cooperation)} · агрессия {formatMetric(deepSpecies.aggression)} · когнитивный индекс {formatMetric(deepSpecies.cognition)}.</p>
          </article>}
        </section>}

        {tab === 'culture' && (rank >= 3 ? <section className="civilization-profile-section">
          <header><span className="eyebrow">ЯЗЫКИ · ВЕРA · ОБЫЧАИ</span><h2>Культурный профиль</h2></header>
          <div className="civilization-profile-columns">
            <article>
              <h3>Языки</h3>
              {(civilization.languages ?? []).map((language) => <div className="civilization-profile-row" key={language.id}><b>{language.name}</b><span>{language.script} · сложность {formatMetric(language.complexity)}</span></div>)}
              {!civilization.languages?.length && <p>Языковые семьи ещё не разделены.</p>}
            </article>
            <article>
              <h3>Культуры</h3>
              {(civilization.cultures ?? []).map((culture) => <div className="civilization-profile-row" key={culture.id}><b>{culture.name}</b><span>{culture.values.slice(0, 3).join(' · ')}</span><small>Табу: {culture.taboos.slice(0, 2).join(' · ') || 'не установлены'}</small></div>)}
              {!civilization.cultures?.length && deepCultures.slice(0, 6).map((culture) => <div className="civilization-profile-row" key={culture.id}><b>{culture.name}</b><span>{culture.status} · {culture.values.slice(0, 3).join(' · ')}</span></div>)}
            </article>
            <article>
              <h3>Религии</h3>
              {(civilization.religions ?? []).map((religion) => <div className="civilization-profile-row" key={religion.id}><b>{religion.name}</b><span>{religion.doctrine}</span><small>Святыни: {religion.sacredObjects.slice(0, 3).join(' · ') || 'не установлены'}</small></div>)}
              {!civilization.religions?.length && <p>Подтверждённых религиозных институтов нет.</p>}
            </article>
          </div>
        </section> : <UnknownBlock title="Культура и язык" reason="Сначала нужно расшифровать язык и устойчивые культурные маркеры."/> )}

        {tab === 'politics' && (rank >= 4 ? <section className="civilization-profile-section">
          <header><span className="eyebrow">ГОСУДАРСТВА · ЭКОНОМИКА · ВЛАСТЬ</span><h2>Политический профиль</h2></header>
          <div className="civilization-profile-metrics">
            <ProfileMetric label="Стабильность" value={simulationCivilization ? formatMetric(simulationCivilization.stability) : 'нет данных'}/>
            <ProfileMetric label="Экономика" value={simulationCivilization ? formatMetric(simulationCivilization.economy) : 'нет данных'}/>
            <ProfileMetric label="Исследования" value={simulationCivilization ? formatMetric(simulationCivilization.research) : 'нет данных'}/>
            <ProfileMetric label="Военная мощь" value={rank >= 5 && simulationCivilization ? formatMetric(simulationCivilization.military) : 'закрыто'}/>
            <ProfileMetric label="Сплочённость" value={simulationCivilization ? formatMetric(simulationCivilization.cohesion) : 'нет данных'}/>
            <ProfileMetric label="Давление экспансии" value={simulationCivilization ? formatMetric(simulationCivilization.expansionPressure) : 'нет данных'}/>
          </div>
          <div className="civilization-profile-columns">
            <article>
              <h3>Современные государства</h3>
              {(civilization.states ?? []).map((state) => <div className="civilization-profile-row" key={state.id}><b>{state.name}</b><span>{state.government} · {state.status}</span><small>{state.outsiderPolicy}</small></div>)}
              {!civilization.states?.length && livingStates.length === 0 && <p>Единая политическая структура не подтверждена.</p>}
            </article>
            <article>
              <h3>Связанные силы</h3>
              {factions.map((faction) => <div className="civilization-profile-row" key={faction.id}><b>{faction.name}</b><span>{faction.kind} · {faction.disposition}</span><small>Репутация капитана: {formatInteger(faction.reputation)}</small></div>)}
              {!factions.length && <p>Отдельные фракции не известны.</p>}
            </article>
            <article>
              <h3>Крупные поселения</h3>
              {settlements.slice(0, 8).map((settlement) => <div className="civilization-profile-row" key={settlement.id}><b>{settlement.name}</b><span>{settlement.kind} · {formatPopulation(settlement.population)}</span><small>Безопасность {formatMetric(settlement.security)} · беспорядки {formatMetric(settlement.unrest)}</small></div>)}
              {!settlements.length && <p>Подтверждённых живых поселений нет.</p>}
            </article>
          </div>
          {rank >= 5 && civilization.technology && <article className="civilization-profile-technology">
            <h3>Технологический профиль</h3>
            <div>{(Object.entries(civilization.technology) as Array<[string, number]>).map(([field, value]) => <span key={field}><small>{technologyLabels[field] ?? field}</small><b>{formatMetric(value)}</b></span>)}</div>
          </article>}
        </section> : <UnknownBlock title="Политика и экономика" reason="Нужен официальный контакт. Наблюдение не раскрывает устройство власти и реальные ресурсы."/> )}

        {tab === 'history' && (knownHistory ? <section className="civilization-profile-section">
          <header><span className="eyebrow">ПРОШЛОЕ · ЛИЧНОСТИ · НАСЛЕДИЕ</span><h2>Историческое досье</h2></header>
          <div className="civilization-profile-history">
            <article>
              <h3>Последние известные события</h3>
              {history.slice(0, 10).map((event) => <div className="civilization-history-entry" key={event.id}><span>{event.year.toLocaleString('ru-RU')}</span><b>{event.title}</b><p>{event.summary}</p></div>)}
              {!history.length && <p>Публичная хроника не восстановлена.</p>}
            </article>
            <article>
              <h3>Исторические государства</h3>
              {deepPolities.slice(0, 8).map((polity) => <div className="civilization-profile-row" key={polity.id}><b>{polity.name}</b><span>{polity.form} · {polity.status}</span><small>{polity.formedYear.toLocaleString('ru-RU')} — {polity.endedYear?.toLocaleString('ru-RU') ?? 'настоящее'}</small></div>)}
            </article>
            <article>
              <h3>Войны</h3>
              {wars.slice(0, 8).map((war) => <div className="civilization-profile-row" key={war.id}><b>{war.name}</b><span>{war.cause}</span><small>{war.outcome} · потери {formatPopulation(war.casualties)}</small></div>)}
              {!wars.length && <p>Подтверждённых войн в восстановленном архиве нет.</p>}
            </article>
            <article>
              <h3>Личности</h3>
              {rank >= 5 ? figures.slice(0, 8).map((figure) => <div className="civilization-profile-row" key={figure.id}><b>{figure.name}</b><span>{figure.role}</span><small>{figure.achievements.slice(-1)[0] ?? 'Влияние подтверждено архивом.'}</small></div>) : <p>Имена закрыты до доверенного контакта.</p>}
            </article>
            <article>
              <h3>Известные артефакты</h3>
              {artifacts.slice(0, 8).map((artifact) => <div className="civilization-profile-row" key={artifact.id}><b>{artifact.name}</b><span>{artifact.kind} · {artifact.publicDescription}</span></div>)}
              {!artifacts.length && <p>Связанных находок пока нет.</p>}
            </article>
          </div>
        </section> : <UnknownBlock title="История цивилизации" reason="Нужен доверенный контакт, найденный архив или посещённые исторические системы."/> )}
      </div>
    </section>
  </div>;
}
