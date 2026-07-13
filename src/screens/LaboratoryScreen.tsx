import { useMemo, useState } from 'react';
import { useGameStore } from '../game/store';

const domainLabel: Record<string, string> = {
  energy: 'Энергетика', propulsion: 'Двигатели', medicine: 'Медицина', materials: 'Материалы',
  computing: 'Вычисления', weapons: 'Оружие', biology: 'Биотехнологии', anomaly: 'Аномальные системы'
};

export function LaboratoryScreen({ chrome }: { chrome: React.ReactNode }) {
  const store = useGameStore();
  const [message, setMessage] = useState('');
  const artifacts = useMemo(() => (store.ship?.cargo ?? []).filter((item) => item.artifactId).map((item) => ({
    item,
    artifact: store.galaxy?.artifacts.find((artifact) => artifact.id === item.artifactId),
    knowledge: store.artifactKnowledge.find((entry) => entry.artifactId === item.artifactId),
    project: store.researchProjects.find((entry) => entry.artifactId === item.artifactId)
  })), [store.ship?.cargo, store.galaxy?.artifacts, store.artifactKnowledge, store.researchProjects]);
  const specialists = store.crew.filter((member) => ['scientist','archaeologist','engineer','doctor','biologist'].includes(member.primaryRole));

  return <div className="game-shell">{chrome}<main className="scroll-screen laboratory-screen">
    <header className="screen-hero laboratory-hero"><div><span className="eyebrow">КОРАБЕЛЬНАЯ ЛАБОРАТОРИЯ</span><h1>Неизвестное становится силой</h1><p>Артефакты не превращаются в бонус одной кнопкой. Их нужно изолировать, изучить, пережить сбои и решить, стоит ли вообще использовать результат.</p></div><div className="hero-metric"><span>СПЕЦИАЛИСТЫ</span><b>{specialists.length}</b><small>{specialists.length ? specialists.map((entry) => entry.name).join(', ') : 'Капитан работает один'}</small></div></header>
    {message && <button className="notice-inline notice-button" onClick={() => setMessage('')}>{message}</button>}
    <section className="laboratory-layout">
      <div className="lab-column">
        <div className="section-heading"><div><span className="eyebrow">АКТИВНАЯ РАБОТА</span><h2>Исследовательские проекты</h2></div><span>{store.researchProjects.filter((entry) => entry.status === 'active').length} активных</span></div>
        {store.researchProjects.length === 0 ? <article className="empty-panel"><b>Лаборатория свободна</b><p>Доставь артефакт на корабль и открой исследовательский проект. Чем опаснее объект, тем выше шанс аварии и ценнее результат.</p></article> : store.researchProjects.map((project) => {
          const artifact = store.galaxy?.artifacts.find((entry) => entry.id === project.artifactId);
          const percent = Math.min(100, Math.round(project.progress / project.requiredProgress * 100));
          return <article className={`research-card status-${project.status}`} key={project.id}>
            <header><div><span className="eyebrow">{domainLabel[project.domain]} · РИСК {project.risk}/10</span><h3>{project.title}</h3></div><span className="research-status">{project.status}</span></header>
            <p>{artifact?.publicDescription}</p><div className="research-track"><i style={{ width: `${percent}%` }}/></div><div className="stat-row"><span>Прогресс</span><b>{project.progress}/{project.requiredProgress} · {percent}%</b></div>
            {project.complication && <p className="warning-text">{project.complication}</p>}
            <div className="research-log">{project.log.slice(0, 3).map((entry, index) => <small key={`${project.id}_${index}`}>{entry}</small>)}</div>
            {project.status === 'active' && <button className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => setMessage((await store.advanceResearch(project.id)).message)}>Провести цикл</button>}
          </article>;
        })}
      </div>
      <div className="lab-column">
        <div className="section-heading"><div><span className="eyebrow">ОБЪЕКТЫ НА БОРТУ</span><h2>Очередь анализа</h2></div><span>{artifacts.length} объектов</span></div>
        {artifacts.length === 0 ? <article className="empty-panel"><b>Нет артефактов</b><p>Архив хранит сведения, но лаборатория работает только с физическими объектами в трюме.</p></article> : artifacts.map(({ item, artifact, knowledge, project }) => <article className="artifact-lab-card" key={item.id}>
          <div className="artifact-glyph">{artifact?.danger ?? '?'}</div><div><span className="eyebrow">{artifact?.kind ?? item.kind} · ЗНАНИЯ {knowledge?.level ?? 0}/6</span><h3>{item.name}</h3><p>{knowledge?.revealedTruth ?? artifact?.publicDescription ?? 'Назначение неизвестно.'}</p><div className="tags"><span>ценность ₡{item.value}</span><span>опасность {artifact?.danger ?? '?'}</span>{project && <span>{project.status}</span>}</div></div>
          {!project && artifact && <button disabled={Boolean(store.busyAction)} onClick={async () => setMessage((await store.startResearch(artifact.id)).message)}>Начать исследование</button>}
        </article>)}
      </div>
    </section>
    <section className="technology-section"><div className="section-heading"><div><span className="eyebrow">ВОССТАНОВЛЕННЫЕ ПРИНЦИПЫ</span><h2>Технологические чертежи</h2></div><span>{store.technologyBlueprints.length}</span></div><div className="blueprint-grid">
      {store.technologyBlueprints.length === 0 ? <article className="empty-panel"><b>Чертежей пока нет</b><p>Полностью завершённое исследование может дать модуль, медицинскую систему или опасную технологию.</p></article> : store.technologyBlueprints.map((blueprint) => <article className={`blueprint-card status-${blueprint.status}`} key={blueprint.id}><span className="eyebrow">{domainLabel[blueprint.domain]} · R{blueprint.rarity}</span><h3>{blueprint.name}</h3><p>{blueprint.description}</p><div className="effect-block good"><b>Преимущество</b><span>{blueprint.benefit}</span></div><div className="effect-block bad"><b>Цена технологии</b><span>{blueprint.drawback}</span></div><div className="stat-row"><span>Установка</span><b>₡{blueprint.installCost}</b></div>{blueprint.status !== 'installed' ? <button className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => setMessage((await store.installBlueprint(blueprint.id)).message)}>Установить на корабль</button> : <span className="installed-label">УСТАНОВЛЕНО</span>}</article>)}
    </div></section>
    <section className="equipment-section"><div className="section-heading"><div><span className="eyebrow">ЛИЧНОЕ СНАРЯЖЕНИЕ</span><h2>Кому принадлежит каждая вещь</h2></div></div><div className="equipment-grid">{store.equipmentInventory.map((item) => <article className="equipment-card" key={item.id}><div className={`equipment-icon category-${item.category}`}>{item.category.slice(0, 1).toUpperCase()}</div><div><span className="eyebrow">{item.category} · R{item.rarity} · {item.condition}%</span><h3>{item.name}</h3><p>{item.description}</p><b>{item.effect}</b><select value={item.assignedToId ?? ''} onChange={(event) => void store.assignEquipment(item.id, event.target.value || undefined)}><option value="">В хранилище</option><option value="captain_player">Капитан</option>{store.crew.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></div></article>)}</div></section>
  </main></div>;
}
