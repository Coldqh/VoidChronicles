import type { Artifact, CrewMember, ResearchProject, TechnologyBlueprint, TechnologyDomain } from '../game/types';
import { createRng } from '../generation/rng';

const domains: { match: string[]; domain: TechnologyDomain; slot: TechnologyBlueprint['moduleSlot'] }[] = [
  { match: ['weapon', 'оруж', 'blade', 'gun'], domain: 'weapons', slot: 'weapon' },
  { match: ['organ', 'bio', 'drug', 'наркот', 'gene'], domain: 'biology', slot: 'utility' },
  { match: ['engine', 'drive', 'двиг', 'gravity'], domain: 'propulsion', slot: 'engine' },
  { match: ['medical', 'heal', 'мед'], domain: 'medicine', slot: 'utility' },
  { match: ['computer', 'digital', 'archive', 'data'], domain: 'computing', slot: 'scanner' },
  { match: ['reactor', 'energy', 'power'], domain: 'energy', slot: 'utility' },
  { match: ['alloy', 'material', 'armor'], domain: 'materials', slot: 'cargo' }
];

export function domainForArtifact(artifact: Artifact): TechnologyDomain {
  const haystack = `${artifact.kind} ${artifact.name} ${artifact.publicDescription} ${artifact.truth}`.toLowerCase();
  return domains.find((entry) => entry.match.some((token) => haystack.includes(token)))?.domain ?? (artifact.danger >= 7 ? 'anomaly' : 'materials');
}

export function createResearchProject(artifact: Artifact, year: number): ResearchProject {
  const domain = domainForArtifact(artifact);
  return {
    id: `research_${artifact.id}`,
    artifactId: artifact.id,
    title: `Исследование: ${artifact.name}`,
    domain,
    status: 'active',
    progress: 0,
    requiredProgress: 80 + artifact.danger * 8,
    risk: Math.max(1, artifact.danger),
    assignedCrewIds: [],
    startedYear: year,
    updatedYear: year,
    log: ['Объект помещён в изолированный лабораторный контур.']
  };
}

export function researchPower(crew: CrewMember[]): number {
  return 18 + crew.reduce((sum, member) => {
    const role = member.primaryRole === 'scientist' ? 18 : member.primaryRole === 'archaeologist' ? 12 : member.primaryRole === 'engineer' ? 10 : member.primaryRole === 'doctor' || member.primaryRole === 'biologist' ? 7 : 2;
    return sum + role + member.level * 2;
  }, 0);
}

export function blueprintFromProject(project: ResearchProject, artifact: Artifact, year: number): TechnologyBlueprint {
  const rng = createRng(`${artifact.id}:blueprint:${project.domain}`);
  const domainName: Record<TechnologyDomain, string> = {
    energy: 'Энергетический контур', propulsion: 'Привод искривления', medicine: 'Медицинский узел', materials: 'Композитная оболочка',
    computing: 'Когнитивный анализатор', weapons: 'Оружейный преобразователь', biology: 'Биосинтетический модуль', anomaly: 'Аномальный резонатор'
  };
  const slot = domains.find((entry) => entry.domain === project.domain)?.slot ?? 'utility';
  const benefits: Record<TechnologyDomain, string[]> = {
    energy: ['снижает расходы энергии систем', 'стабилизирует повреждённые модули'],
    propulsion: ['увеличивает дальность прыжка', 'снижает расход топлива'],
    medicine: ['снижает тяжесть травм', 'ускоряет восстановление экипажа'],
    materials: ['повышает прочность корпуса', 'увеличивает защиту экспедиции'],
    computing: ['повышает достоверность сканирования', 'ускоряет анализ данных'],
    weapons: ['усиливает корабельную атаку', 'повышает пробитие брони'],
    biology: ['открывает работу с живыми образцами', 'снижает риск заражения'],
    anomaly: ['обнаруживает скрытые сигналы', 'позволяет взаимодействовать с аномалиями']
  };
  const drawbacks = ['нестабилен при повреждении корпуса', 'требует редкого обслуживания', 'повышает интерес чужих фракций', 'может вызвать непредсказуемый сбой'];
  return {
    id: `blueprint_${artifact.id}`,
    sourceArtifactId: artifact.id,
    name: `${domainName[project.domain]} «${artifact.name.split(' ').slice(0, 2).join(' ')}»`,
    domain: project.domain,
    status: artifact.danger >= 8 ? 'restricted' : 'available',
    rarity: Math.max(2, Math.min(10, 2 + Math.floor(artifact.danger / 2))),
    description: `Практическая реконструкция принципа, обнаруженного в объекте «${artifact.name}».`,
    benefit: rng.pick(benefits[project.domain]),
    drawback: rng.pick(drawbacks),
    installCost: 900 + artifact.danger * 220,
    moduleSlot: slot,
    factionInterest: [],
    discoveredYear: year
  };
}
