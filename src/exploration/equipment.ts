import type { EquipmentId } from '../game/types';

export interface EquipmentDefinition {
  id: EquipmentId;
  name: string;
  description: string;
  weight: number;
}

export const EQUIPMENT: readonly EquipmentDefinition[] = [
  { id: 'pistol', name: 'Пистолет', description: 'Лёгкое оружие. Средний урон.', weight: 1 },
  { id: 'rifle', name: 'Винтовка', description: 'Дальний бой и высокий урон.', weight: 2 },
  { id: 'armor', name: 'Полевая броня', description: 'Снижает урон среды и атак.', weight: 2 },
  { id: 'medkit', name: 'Аптечка', description: 'Одно лечение во время экспедиции.', weight: 1 },
  { id: 'scanner', name: 'Полевой сканер', description: 'Повышает качество улик и видимость.', weight: 1 },
  { id: 'cutter', name: 'Плазменный резак', description: 'Открывает запечатанные двери и корпуса.', weight: 2 },
  { id: 'translator', name: 'Ксенопереводчик', description: 'Читает архивы и терминалы.', weight: 1 },
  { id: 'sampleContainer', name: 'Контейнер образцов', description: 'Позволяет извлекать биологические находки.', weight: 1 },
  { id: 'explosives', name: 'Направленный заряд', description: 'Открывает проход, но портит часть данных.', weight: 2 },
  { id: 'oxygen', name: 'Дополнительный кислород', description: 'Увеличивает безопасное время.', weight: 1 }
];

export function equipmentWeight(selected: EquipmentId[]): number {
  return selected.reduce((sum, id) => sum + (EQUIPMENT.find((entry) => entry.id === id)?.weight ?? 0), 0);
}
