import { useEffect, useState } from 'react';
import type { TutorialState } from '../game/types';

const steps = [
  { target: 'open-system', title: 'Открой карту системы', text: 'На мостике оставлено только главное. Перейди к локальной карте — там начинается разведка.' },
  { target: 'system-scan', title: 'Просканируй систему', text: 'Сейчас у тебя нет данных. Системный скан откроет орбиты и ближайшие маршруты.' },
  { target: 'tutorial-planet', title: 'Выбери отмеченную планету', text: 'К-1 «Эхо» создана как безопасная первая цель. Нажми на неё на орбитальной карте.' },
  { target: 'detail-scan', title: 'Проведи детальный скан', text: 'Он превратит неизвестный объект в конкретную точку высадки и покажет примерный риск.' },
  { target: 'open-expedition', title: 'Открой найденный сигнал', text: 'После скана появилась конкретная точка. Открой её карточку и начни подготовку.' },
  { target: 'launch-expedition', title: 'Подтверди снаряжение', text: 'Проверь вес, защиту и инструменты. Затем начни высадку.' },
  { target: 'collect-data', title: 'Добудь данные', text: 'На карте найди терминал или образец. Маркеры размещаются по-разному в каждой локации.' },
  { target: 'evacuate', title: 'Эвакуируйся', text: 'Верни данные на корабль. Локация запомнит убитых врагов, открытые участки и забранные объекты.' }
] as const;

interface TutorialOverlayProps {
  tutorial: TutorialState;
  onSkip(): void;
}

interface TargetRect { left: number; top: number; width: number; height: number; }

export function TutorialOverlay({ tutorial, onSkip }: TutorialOverlayProps) {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const index = Math.min(steps.length - 1, Math.max(0, tutorial.currentStep));
  const step = steps[index];

  useEffect(() => {
    if (!tutorial.enabled || !tutorial.active || tutorial.completed) return;
    let frame = 0;
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-tutorial="${step.target}"]`);
      if (!target) { setRect(null); return; }
      const box = target.getBoundingClientRect();
      setRect({ left: box.left, top: box.top, width: box.width, height: box.height });
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };
    frame = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target, tutorial.active, tutorial.completed, tutorial.enabled]);

  if (!tutorial.enabled || !tutorial.active || tutorial.completed) return null;
  const cardStyle = rect && rect.top > window.innerHeight * 0.58
    ? { left: Math.max(16, Math.min(window.innerWidth - 376, rect.left)), bottom: Math.max(18, window.innerHeight - rect.top + 18) }
    : { left: Math.max(16, Math.min(window.innerWidth - 376, rect?.left ?? 24)), top: Math.min(window.innerHeight - 220, (rect?.top ?? 110) + (rect?.height ?? 0) + 18) };

  return <div className="tutorial-guide" aria-live="polite">
    {rect && <div className="tutorial-spotlight" style={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }}/>} 
    <section className="tutorial-task-card" style={cardStyle}>
      <header><span>ПЕРВЫЙ МАРШРУТ · {index + 1}/{steps.length}</span><button onClick={onSkip}>Отключить</button></header>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div className="tutorial-task-progress">{steps.map((_, i) => <i key={i} className={i <= index ? 'active' : ''}/>)}</div>
      <small>{rect ? 'Выполни подсвеченное действие.' : 'Открой нужный экран через боковое меню.'}</small>
    </section>
  </div>;
}
