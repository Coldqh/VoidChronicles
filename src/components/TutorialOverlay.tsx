import type { TutorialState } from '../game/types';

const steps = [
  {
    eyebrow: '01 · КОРАБЛЬ КАК ДОМ',
    title: 'Это твой мостик',
    text: 'Здесь собраны не таблицы, а решения: срочные сцены, активные цели, состояние корабля и то, что изменилось в мире.',
    note: 'Начинай каждый новый заход отсюда.'
  },
  {
    eyebrow: '02 · ТРИ МАСШТАБА',
    title: 'Галактика, система, локация',
    text: 'Карта галактики нужна для дальних прыжков. Карта системы — для планет, хабов и сигналов. Экспедиция — для конкретной высадки.',
    note: 'Не ищи планеты на галактической карте.'
  },
  {
    eyebrow: '03 · НЕПОЛНЫЕ ДАННЫЕ',
    title: 'Сканер не говорит всей правды',
    text: 'Сначала ты видишь вероятность, угрозу и шум. Детальный скан и полевая работа превращают слухи в доказательства.',
    note: 'Ошибочная версия тоже может стать частью истории.'
  },
  {
    eyebrow: '04 · СЦЕНЫ И ВЫБОРЫ',
    title: 'Мир обращается к тебе сам',
    text: 'Вызовы, сделки, просьбы и угрозы появляются как сцены. Выборы могут создать цель сейчас и последствие спустя годы.',
    note: 'Не каждый сигнал нужно принимать.'
  },
  {
    eyebrow: '05 · ЭКИПАЖ',
    title: 'Люди помнят решения',
    text: 'Напарники дают профессии, но ещё имеют мораль, убеждения и память. Спасение, предательство и невыплата денег меняют их.',
    note: 'Редкий специалист ценнее случайного бойца.'
  },
  {
    eyebrow: '06 · IRONMAN',
    title: 'Последствия не откатываются',
    text: 'Игра сохраняется после значимых действий. Убитые враги, забранные данные, открытые двери и решения остаются в мире.',
    note: 'Ошибки создают историю партии.'
  },
  {
    eyebrow: '07 · ПЕРВАЯ ЦЕЛЬ',
    title: 'Выбери, во что вмешаться',
    text: 'На мостике уже ждёт первая сцена. Прими её, продай информацию или отвернись. После этого галактика начнёт отвечать.',
    note: 'Свобода начинается с конкретного решения.'
  }
];

interface TutorialOverlayProps {
  tutorial: TutorialState;
  onNext(): void;
  onSkip(): void;
}

export function TutorialOverlay({ tutorial, onNext, onSkip }: TutorialOverlayProps) {
  if (!tutorial.enabled || !tutorial.active || tutorial.completed) return null;
  const index = Math.min(steps.length - 1, Math.max(0, tutorial.currentStep));
  const step = steps[index];
  const isLast = index === steps.length - 1;
  return <div className="tutorial-layer" role="dialog" aria-modal="true" aria-label="Обучение Void Chronicles">
    <div className="tutorial-orbit orbit-a"/><div className="tutorial-orbit orbit-b"/>
    <section className="tutorial-card">
      <header>
        <span className="tutorial-kicker">{step.eyebrow}</span>
        <button className="tutorial-skip" onClick={onSkip}>Пропустить обучение</button>
      </header>
      <div className="tutorial-visual">
        <div className="tutorial-core"><span>{String(index + 1).padStart(2, '0')}</span></div>
        <i/><i/><i/>
      </div>
      <div className="tutorial-copy">
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        <small>{step.note}</small>
      </div>
      <footer>
        <div className="tutorial-progress" aria-label={`Шаг ${index + 1} из ${steps.length}`}>
          {steps.map((_, stepIndex) => <i key={stepIndex} className={stepIndex <= index ? 'active' : ''}/>) }
        </div>
        <button className="primary-button tutorial-next" onClick={onNext}>{isLast ? 'Начать экспедицию' : 'Дальше'}</button>
      </footer>
    </section>
  </div>;
}
