import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';

const domainLabel: Record<string, string> = {
  energy: 'Энергетика', propulsion: 'Двигатели', medicine: 'Медицина', materials: 'Материалы',
  computing: 'Вычисления', weapons: 'Оружие', biology: 'Биотехнологии', anomaly: 'Аномальные системы'
};

type LabTab = 'projects' | 'artifacts' | 'blueprints' | 'equipment';

export function LaboratoryScreen({ chrome }: { chrome: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<LabTab>('projects');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const artifacts = useMemo(() => (store.ship?.cargo ?? []).filter((item) => item.artifactId).map((item) => ({
    item,
    artifact: store.galaxy?.artifacts.find((artifact) => artifact.id === item.artifactId),
    knowledge: store.artifactKnowledge.find((entry) => entry.artifactId === item.artifactId),
    project: store.researchProjects.find((entry) => entry.artifactId === item.artifactId)
  })), [store.ship?.cargo, store.galaxy?.artifacts, store.artifactKnowledge, store.researchProjects]);

  const ids = tab === 'projects'
    ? store.researchProjects.map((entry) => entry.id)
    : tab === 'artifacts'
      ? artifacts.map((entry) => entry.item.id)
      : tab === 'blueprints'
        ? store.technologyBlueprints.map((entry) => entry.id)
        : store.equipmentInventory.map((entry) => entry.id);

  useEffect(() => {
    if (!ids.length) setSelectedId(null);
    else if (!selectedId || !ids.includes(selectedId)) setSelectedId(ids[0]);
  }, [ids, selectedId]);

  const selectedProject = tab === 'projects' ? store.researchProjects.find((entry) => entry.id === selectedId) : undefined;
  const selectedArtifact = tab === 'artifacts' ? artifacts.find((entry) => entry.item.id === selectedId) : undefined;
  const selectedBlueprint = tab === 'blueprints' ? store.technologyBlueprints.find((entry) => entry.id === selectedId) : undefined;
  const selectedEquipment = tab === 'equipment' ? store.equipmentInventory.find((entry) => entry.id === selectedId) : undefined;
  const specialists = store.crew.filter((member) => ['scientist','archaeologist','engineer','doctor','biologist'].includes(member.primaryRole));

  return <div className="game-shell">{chrome}<main className="scroll-screen laboratory-screen v352-laboratory">
    <header className="screen-hero laboratory-hero v352-lab-hero"><div><span className="eyebrow">КОРАБЕЛЬНАЯ ЛАБОРАТОРИЯ</span><h1>Исследование без лишних экранов</h1><p>Слева выбирается объект или проект. Справа находятся его данные, риск, прогресс и доступное действие.</p></div><div className="hero-metric"><span>СПЕЦИАЛИСТЫ</span><b>{specialists.length}</b><small>{specialists.length ? specialists.map((entry) => entry.name).join(', ') : 'Капитан работает один'}</small></div></header>
    {message && <button className="notice-inline notice-button" onClick={() => setMessage('')}>{message}</button>}

    <nav className="v352-lab-tabs">
      <button className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}>Проекты <b>{store.researchProjects.length}</b></button>
      <button className={tab === 'artifacts' ? 'active' : ''} onClick={() => setTab('artifacts')}>Артефакты <b>{artifacts.length}</b></button>
      <button className={tab === 'blueprints' ? 'active' : ''} onClick={() => setTab('blueprints')}>Чертежи <b>{store.technologyBlueprints.length}</b></button>
      <button className={tab === 'equipment' ? 'active' : ''} onClick={() => setTab('equipment')}>Снаряжение <b>{store.equipmentInventory.length}</b></button>
    </nav>

    <section className="v352-lab-grid">
      <aside className="v352-lab-list">
        <header><span className="eyebrow">{tab === 'projects' ? 'ИССЛЕДОВАТЕЛЬСКИЕ ПРОЕКТЫ' : tab === 'artifacts' ? 'ФИЗИЧЕСКИЕ ОБЪЕКТЫ' : tab === 'blueprints' ? 'ВОССТАНОВЛЕННЫЕ ТЕХНОЛОГИИ' : 'ЛИЧНОЕ СНАРЯЖЕНИЕ'}</span><b>{ids.length}</b></header>
        <div>
          {tab === 'projects' && store.researchProjects.map((project) => <button key={project.id} className={selectedProject?.id === project.id ? 'active' : ''} onClick={() => setSelectedId(project.id)}><i className={`status-${project.status}`}/><span><small>{domainLabel[project.domain]} · риск {project.risk}/10</small><b>{project.title}</b><p>{project.progress}/{project.requiredProgress}</p></span></button>)}
          {tab === 'artifacts' && artifacts.map(({ item, artifact, knowledge, project }) => <button key={item.id} className={selectedArtifact?.item.id === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><i className={project ? `status-${project.status}` : ''}/><span><small>{artifact?.kind ?? item.kind} · знания {knowledge?.level ?? 0}/6</small><b>{item.name}</b><p>{project ? project.status : 'ожидает исследования'}</p></span></button>)}
          {tab === 'blueprints' && store.technologyBlueprints.map((blueprint) => <button key={blueprint.id} className={selectedBlueprint?.id === blueprint.id ? 'active' : ''} onClick={() => setSelectedId(blueprint.id)}><i className={`status-${blueprint.status}`}/><span><small>{domainLabel[blueprint.domain]} · R{blueprint.rarity}</small><b>{blueprint.name}</b><p>{blueprint.status}</p></span></button>)}
          {tab === 'equipment' && store.equipmentInventory.map((item) => <button key={item.id} className={selectedEquipment?.id === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><i className={`category-${item.category}`}/><span><small>{item.category} · R{item.rarity}</small><b>{item.name}</b><p>состояние {item.condition}%</p></span></button>)}
        </div>
        {!ids.length && <p className="v352-empty">В этом разделе пока ничего нет.</p>}
      </aside>

      <article className="v352-lab-dossier">
        {selectedProject && (() => {
          const artifact = store.galaxy?.artifacts.find((entry) => entry.id === selectedProject.artifactId);
          const percent = Math.min(100, Math.round(selectedProject.progress / Math.max(1, selectedProject.requiredProgress) * 100));
          return <><header><span className="eyebrow">{domainLabel[selectedProject.domain]} · РИСК {selectedProject.risk}/10</span><h2>{selectedProject.title}</h2><p>{artifact?.publicDescription ?? 'Объект остаётся частично неизвестным.'}</p></header><div className="v352-research-progress"><i style={{ width: `${percent}%` }}/><b>{percent}%</b></div><dl><div><dt>Статус</dt><dd>{selectedProject.status}</dd></div><div><dt>Прогресс</dt><dd>{selectedProject.progress}/{selectedProject.requiredProgress}</dd></div><div><dt>Домен</dt><dd>{domainLabel[selectedProject.domain]}</dd></div></dl>{selectedProject.complication && <p className="warning-text">{selectedProject.complication}</p>}<section className="v352-lab-log"><span>ЖУРНАЛ ПРОЕКТА</span>{selectedProject.log.slice(0, 6).map((entry, index) => <p key={`${selectedProject.id}_${index}`}>{entry}</p>)}</section>{selectedProject.status === 'active' && <button className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => setMessage((await store.advanceResearch(selectedProject.id)).message)}>Провести исследовательский цикл</button>}</>;
        })()}

        {selectedArtifact && <><header><span className="eyebrow">{selectedArtifact.artifact?.kind ?? selectedArtifact.item.kind} · ОПАСНОСТЬ {selectedArtifact.artifact?.danger ?? '?'}</span><h2>{selectedArtifact.item.name}</h2><p>{selectedArtifact.knowledge?.revealedTruth ?? selectedArtifact.artifact?.publicDescription ?? 'Назначение неизвестно.'}</p></header><dl><div><dt>Знания</dt><dd>{selectedArtifact.knowledge?.level ?? 0}/6</dd></div><div><dt>Оценка</dt><dd>₡{selectedArtifact.item.value}</dd></div><div><dt>Проект</dt><dd>{selectedArtifact.project?.status ?? 'не открыт'}</dd></div></dl>{!selectedArtifact.project && selectedArtifact.artifact && <button className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => setMessage((await store.startResearch(selectedArtifact.artifact!.id)).message)}>Начать исследование</button>}</>}

        {selectedBlueprint && <><header><span className="eyebrow">{domainLabel[selectedBlueprint.domain]} · R{selectedBlueprint.rarity}</span><h2>{selectedBlueprint.name}</h2><p>{selectedBlueprint.description}</p></header><section className="v352-effect good"><span>ПРЕИМУЩЕСТВО</span><p>{selectedBlueprint.benefit}</p></section><section className="v352-effect bad"><span>ЦЕНА ТЕХНОЛОГИИ</span><p>{selectedBlueprint.drawback}</p></section><dl><div><dt>Статус</dt><dd>{selectedBlueprint.status}</dd></div><div><dt>Установка</dt><dd>₡{selectedBlueprint.installCost}</dd></div></dl>{selectedBlueprint.status !== 'installed' ? <button className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => setMessage((await store.installBlueprint(selectedBlueprint.id)).message)}>Установить на корабль</button> : <span className="installed-label">УСТАНОВЛЕНО</span>}</>}

        {selectedEquipment && <><header><span className="eyebrow">{selectedEquipment.category} · R{selectedEquipment.rarity} · {selectedEquipment.condition}%</span><h2>{selectedEquipment.name}</h2><p>{selectedEquipment.description}</p></header><section className="v352-effect good"><span>ЭФФЕКТ</span><p>{selectedEquipment.effect}</p></section><label className="v352-assignment"><span>ВЛАДЕЛЕЦ</span><select value={selectedEquipment.assignedToId ?? ''} onChange={(event) => void store.assignEquipment(selectedEquipment.id, event.target.value || undefined)}><option value="">В хранилище</option><option value="captain_player">Капитан</option>{store.crew.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label></>}

        {!selectedProject && !selectedArtifact && !selectedBlueprint && !selectedEquipment && <div className="v352-empty"><b>Нет выбранного объекта</b><p>Выбери запись слева.</p></div>}
      </article>
    </section>
  </main></div>;
}
