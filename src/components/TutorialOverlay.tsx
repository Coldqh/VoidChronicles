import { useEffect, useState } from 'react';
import type { TutorialState } from '../game/types';

const steps = [
  { target: 'open-system', title: 'Прими первый приказ', text: 'Открой локальную систему. Корабль вышел в новый сектор без подтверждённой картины вокруг.' },
  { target: 'system-scan', title: 'Сними слепую зону', text: 'Системный скан покажет орбиты, поселения и слабый сигнал, который диспетчеры не считают важным.' },
  { target: 'tutorial-planet', title: 'Выбери К-1 «Эхо»', text: 'На орбите отмечен безопасный каменный объект. Повторяющийся импульс идёт с его поверхности.' },
  { target: 'detail-scan', title: 'Уточни источник', text: 'Проведи детальный анализ. До высадки нужно понять среду, риск и точку происхождения сигнала.' },
  { target: 'open-expedition', title: 'Открой найденный сигнал', text: 'Скан выделил конкретную локацию. Проверь задачу и реши, что брать с собой.' },
  { target: 'launch-expedition', title: 'Подготовь первый выход', text: 'Проверь вес, защиту и инструменты. Цель рейса — вернуться с подтверждёнными данными.' },
  { target: 'collect-data', title: 'Добудь доказательство', text: 'Найди терминал, запись или образец. Локация запомнит каждый открытый участок и использованный объект.' },
  { target: 'evacuate', title: 'Вернись на корабль', text: 'Эвакуируйся с данными. После возвращения первая запись войдёт в Архив и начнёт историю капитана.' }
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
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardWidth = Math.min(286, viewportWidth - 16);
  const cardHeight = 154;
  const left = Math.max(8, Math.min(viewportWidth - cardWidth - 8, rect?.left ?? 8));
  const below = (rect?.top ?? 54) + (rect?.height ?? 0) + 10;
  const above = (rect?.top ?? viewportHeight) - cardHeight - 10;
  const top = below + cardHeight <= viewportHeight - 8 ? below : Math.max(8, above);
  const cardStyle = { left, top, width: cardWidth };

  return <div className="tutorial-guide" aria-live="polite">
    {rect && <div className="tutorial-spotlight" style={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }}/>}
    <section className="tutorial-task-card" style={cardStyle}>
      <header><span>ПЕРВЫЙ РЕЙС · {index + 1}/{steps.length}</span><button onClick={onSkip}>Отключить</button></header>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div className="tutorial-task-progress">{steps.map((_, i) => <i key={i} className={i <= index ? 'active' : ''}/>)}</div>
      <small>{rect ? 'Выполни подсвеченное действие.' : 'Открой нужный экран через боковое меню.'}</small>
    </section>
  </div>;
}
