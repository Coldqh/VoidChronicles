import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGameStore } from '../game/store';
import { MobileBackV362, MobileCoverageV362, MobileEmptyV362 } from '../components/MobileCoverageV362';

type LabTab = 'projects' | 'artifacts' | 'technology';

const domainLabel: Record<string, string> = {
  energy: 'Энергетика', propulsion: 'Двигатели', medicine: 'Медицина', materials: 'Материалы',
  computing: 'Вычисления', weapons: 'Оружие', biology: 'Биотехнологии', anomaly: 'Аномальные системы'
};

export function MobileLaboratoryScreenV362({ chrome }: { chrome?: ReactNode }) {
  const store = useGameStore();
  const [tab, setTab] = useState<LabTab>('projects');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const artifacts = useMemo(() => (store.ship?.cargo ?? []).filter((item) => item.artifactId).map((item) => ({
    item,
    artifact: store.galaxy?.artifacts.find((artifact) => artifact.id === item.artifactId),
    knowledge: store.artifactKnowledge.find((entry) => entry.artifactId === item.artifactId),
    project: store.researchProjects.find((entry) => entry.artifactId === item.artifactId)
  })), [store.ship?.cargo, store.galaxy?.artifacts, store.artifactKnowledge, store.researchProjects]);

  useEffect(() => setSelectedKey(null), [tab]);

  const selectedProject = tab === 'projects' ? store.researchProjects.find((entry) => entry.id === selectedKey) : undefined;
  const selectedArtifact = tab === 'artifacts' ? artifacts.find((entry) => entry.item.id === selectedKey) : undefined;
  const selectedBlueprint = tab === 'technology' && selectedKey?.startsWith('blueprint:') ? store.technologyBlueprints.find((entry) => entry.id === selectedKey.slice(10)) : undefined;
  const selectedEquipment = tab === 'technology' && selectedKey?.startsWith('equipment:') ? store.equipmentInventory.find((entry) => entry.id === selectedKey.slice(10)) : undefined;
  const hasSelection = Boolean(selectedProject || selectedArtifact || selectedBlueprint || selectedEquipment);
  const specialists = store.crew.filter((member) => ['scientist','archaeologist','engineer','doctor','biologist'].includes(member.primaryRole));

  const tabs = [
    { id: 'projects' as const, label: 'Проекты', count: store.researchProjects.length },
    { id: 'artifacts' as const, label: 'Артефакты', count: artifacts.length },
    { id: 'technology' as const, label: 'Технологии', count: store.technologyBlueprints.length + store.equipmentInventory.length }
  ];

  return <MobileCoverageV362<LabTab> chrome={chrome} eyebrow={`ЛАБОРАТОРИЯ · СПЕЦИАЛИСТОВ ${specialists.length}`} title="Исследования" badge={store.researchProjects.filter((entry) => entry.status === 'active').length} tabs={tabs} activeTab={tab} onTabChange={setTab} className="v362-lab-screen">
    {notice && <button className="v361-notice" onClick={() => setNotice('')}>{notice}</button>}

    {!hasSelection && tab === 'projects' && <div className="v361-scroll-list">{store.researchProjects.map((project) => <button className={`v361-list-button ${project.status === 'failed' ? 'danger' : project.status === 'completed' ? 'good' : ''}`} key={project.id} onClick={() => setSelectedKey(project.id)}><span>{domainLabel[project.domain]} · РИСК {project.risk}/10</span><b>{project.title}</b><p>{project.progress}/{project.requiredProgress} · {project.status}</p><em>›</em></button>)}{!store.researchProjects.length && <MobileEmptyV362 title="Проектов нет" text="Найди артефакт и начни его исследование."/>}</div>}

    {!hasSelection && tab === 'artifacts' && <div className="v361-scroll-list">{artifacts.map(({ item, artifact, knowledge, project }) => <button className="v361-list-button" key={item.id} onClick={() => setSelectedKey(item.id)}><span>{(artifact?.kind ?? item.kind).toUpperCase()} · ЗНАНИЯ {knowledge?.level ?? 0}/6</span><b>{item.name}</b><p>{project ? `проект: ${project.status}` : 'ожидает исследования'}</p><em>›</em></button>)}{!artifacts.length && <MobileEmptyV362 title="Артефактов нет" text="Верни физическую находку из экспедиции."/>}</div>}

    {!hasSelection && tab === 'technology' && <div className="v361-scroll-list">
      <div className="v362-section-title"><span>ЧЕРТЕЖИ</span><b>{store.technologyBlueprints.length}</b></div>
      {store.technologyBlueprints.map((blueprint) => <button className={`v361-list-button ${blueprint.status === 'installed' ? 'good' : ''}`} key={blueprint.id} onClick={() => setSelectedKey(`blueprint:${blueprint.id}`)}><span>{domainLabel[blueprint.domain]} · R{blueprint.rarity}</span><b>{blueprint.name}</b><p>{blueprint.status} · установка ₡{blueprint.installCost}</p><em>›</em></button>)}
      <div className="v362-section-title"><span>СНАРЯЖЕНИЕ</span><b>{store.equipmentInventory.length}</b></div>
      {store.equipmentInventory.map((item) => <button className="v361-list-button" key={item.id} onClick={() => setSelectedKey(`equipment:${item.id}`)}><span>{item.category.toUpperCase()} · R{item.rarity}</span><b>{item.name}</b><p>состояние {item.condition}% · {item.assignedToId ? 'назначено' : 'в хранилище'}</p><em>›</em></button>)}
      {!store.technologyBlueprints.length && !store.equipmentInventory.length && <MobileEmptyV362 title="Технологий нет" text="Завершённые исследования создадут чертежи и снаряжение."/>}
    </div>}

    {selectedProject && (() => { const artifact = store.galaxy?.artifacts.find((entry) => entry.id === selectedProject.artifactId); const percent = Math.min(100, Math.round(selectedProject.progress / Math.max(1, selectedProject.requiredProgress) * 100)); return <article className="v361-dossier"><MobileBackV362 onClick={() => setSelectedKey(null)}/><span>{domainLabel[selectedProject.domain]} · РИСК {selectedProject.risk}/10</span><h2>{selectedProject.title}</h2><p>{artifact?.publicDescription ?? 'Объект остаётся частично неизвестным.'}</p><div className="v362-progress-card"><i><em style={{ width: `${percent}%` }}/></i><b>{percent}%</b></div><dl><div><dt>Статус</dt><dd>{selectedProject.status}</dd></div><div><dt>Прогресс</dt><dd>{selectedProject.progress}/{selectedProject.requiredProgress}</dd></div><div><dt>Домен</dt><dd>{domainLabel[selectedProject.domain]}</dd></div></dl>{selectedProject.complication && <div className="v361-detail-block warning"><h3>Осложнение</h3><p>{selectedProject.complication}</p></div>}<div className="v362-section-title"><span>ЖУРНАЛ</span></div>{selectedProject.log.slice(0, 8).map((entry, index) => <div className="v361-list-static" key={`${selectedProject.id}_${index}`}><b>{entry}</b></div>)}{selectedProject.status === 'active' && <footer><button className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => setNotice((await store.advanceResearch(selectedProject.id)).message)}>Исследовательский цикл</button></footer>}</article>; })()}

    {selectedArtifact && <article className="v361-dossier"><MobileBackV362 onClick={() => setSelectedKey(null)}/><span>{(selectedArtifact.artifact?.kind ?? selectedArtifact.item.kind).toUpperCase()} · ОПАСНОСТЬ {selectedArtifact.artifact?.danger ?? '?'}</span><h2>{selectedArtifact.item.name}</h2><p>{selectedArtifact.knowledge?.revealedTruth ?? selectedArtifact.artifact?.publicDescription ?? 'Назначение неизвестно.'}</p><dl><div><dt>Знания</dt><dd>{selectedArtifact.knowledge?.level ?? 0}/6</dd></div><div><dt>Оценка</dt><dd>₡{selectedArtifact.item.value}</dd></div><div><dt>Проект</dt><dd>{selectedArtifact.project?.status ?? 'не открыт'}</dd></div></dl>{!selectedArtifact.project && selectedArtifact.artifact && <footer><button className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => setNotice((await store.startResearch(selectedArtifact.artifact!.id)).message)}>Начать исследование</button></footer>}</article>}

    {selectedBlueprint && <article className="v361-dossier"><MobileBackV362 onClick={() => setSelectedKey(null)}/><span>{domainLabel[selectedBlueprint.domain]} · R{selectedBlueprint.rarity}</span><h2>{selectedBlueprint.name}</h2><p>{selectedBlueprint.description}</p><div className="v361-detail-block"><h3>Преимущество</h3><p>{selectedBlueprint.benefit}</p></div><div className="v361-detail-block warning"><h3>Цена технологии</h3><p>{selectedBlueprint.drawback}</p></div><dl><div><dt>Статус</dt><dd>{selectedBlueprint.status}</dd></div><div><dt>Установка</dt><dd>₡{selectedBlueprint.installCost}</dd></div><div><dt>Слот</dt><dd>{selectedBlueprint.moduleSlot}</dd></div></dl>{selectedBlueprint.status !== 'installed' && <footer><button className="primary-button" disabled={Boolean(store.busyAction)} onClick={async () => setNotice((await store.installBlueprint(selectedBlueprint.id)).message)}>Установить на корабль</button></footer>}</article>}

    {selectedEquipment && <article className="v361-dossier"><MobileBackV362 onClick={() => setSelectedKey(null)}/><span>{selectedEquipment.category.toUpperCase()} · R{selectedEquipment.rarity} · {selectedEquipment.condition}%</span><h2>{selectedEquipment.name}</h2><p>{selectedEquipment.description}</p><div className="v361-detail-block"><h3>Эффект</h3><p>{selectedEquipment.effect}</p></div><label className="v362-field"><span>ВЛАДЕЛЕЦ</span><select value={selectedEquipment.assignedToId ?? ''} onChange={(event) => void store.assignEquipment(selectedEquipment.id, event.target.value || undefined)}><option value="">В хранилище</option><option value="captain_player">Капитан</option>{store.crew.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></article>}
  </MobileCoverageV362>;
}
