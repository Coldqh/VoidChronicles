import type { CaptainJourney, JourneyAction } from '../journey/captainJourney';

interface CaptainJournalV36Props {
  journey: CaptainJourney;
  onAction(action: JourneyAction): void;
}

export function CaptainJournalV36({ journey, onAction }: CaptainJournalV36Props) {
  return <section className="v36-captain-journal">
    <header className="v36-journal-header">
      <div>
        <span className="eyebrow">ЖУРНАЛ КАПИТАНА</span>
        <h2>{journey.firstVoyageComplete ? 'Текущая жизнь экспедиции' : 'Первый рейс'}</h2>
      </div>
      <div className="v36-voyage-progress">
        <span>{journey.firstVoyageComplete ? 'МАРШРУТ ОСВОЕН' : 'ПРОГРЕСС ПЕРВОГО РЕЙСА'}</span>
        <b>{journey.firstVoyageProgress}%</b>
        <i><em style={{ width: `${journey.firstVoyageProgress}%` }}/></i>
      </div>
    </header>

    <div className="v36-journal-grid">
      <article className="v36-orders">
        <span className="eyebrow">ТЕКУЩИЙ ПРИКАЗ</span>
        <h3>{journey.focus.title}</h3>
        <p>{journey.focus.text}</p>
        <button className="v35-cta" onClick={() => onAction(journey.focus.action)}>{journey.focus.label}<i>→</i></button>
      </article>

      <article className="v36-voyage-chain">
        <span className="eyebrow">ЦЕПОЧКА РЕЙСА</span>
        <div>{journey.firstVoyageStages.map((stage, index) => <div className={`status-${stage.status}`} key={stage.id}>
          <i>{stage.status === 'completed' ? '✓' : index + 1}</i>
          <span><b>{stage.title}</b><small>{stage.summary}</small></span>
        </div>)}</div>
      </article>

      <article className="v36-career-watch">
        <span className="eyebrow">ИМЯ КАПИТАНА</span>
        <h3>{journey.career.title}</h3>
        <p>{journey.career.summary}</p>
        <div className="v36-career-numbers">
          <span><small>ОПЕРАЦИЙ</small><b>{journey.career.completedOperations}</b></span>
          <span><small>ИЗВЕСТНОСТЬ</small><b>{journey.career.renown}</b></span>
          <span><small>СЛЕДУЮЩИЙ РУБЕЖ</small><b>{journey.career.nextRequired}</b></span>
        </div>
        <i className="v36-career-track"><em style={{ width: `${journey.career.progress}%` }}/></i>
      </article>

      <article className="v36-campaign-watch">
        <span className="eyebrow">БОЛЬШАЯ ЛИНИЯ</span>
        {journey.campaignThread ? <>
          <h3>{journey.campaignThread.title}</h3>
          <p>{journey.campaignThread.summary}</p>
          <small>{journey.campaignThread.status}</small>
          <button onClick={() => onAction(journey.campaignThread!.action)}>Открыть линию</button>
        </> : <>
          <h3>Главный конфликт ещё не проявился</h3>
          <p>Он появится из реальной войны, дефицита, открытия или политического кризиса.</p>
          <small>МИР ПРОДОЛЖАЕТ СИМУЛЯЦИЮ</small>
        </>}
      </article>
    </div>

    <footer className="v36-consequence-strip">
      <span>ПОСЛЕДНИЕ ПОСЛЕДСТВИЯ</span>
      <div>{journey.recentConsequences.length ? journey.recentConsequences.map((entry) => <p key={entry.id}><small>{entry.title}</small><b>{entry.text}</b></p>) : <p><small>ЖУРНАЛ ПУСТ</small><b>Первое подтверждённое действие ещё не совершено.</b></p>}</div>
    </footer>
  </section>;
}
