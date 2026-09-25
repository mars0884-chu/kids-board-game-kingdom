import { useEffect, useMemo, useState } from 'react'
import type { Database } from 'firebase/database'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, FeedbackCard, ToolButton } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { FirebaseFriendPairing } from '../../online/FirebaseFriendPairing'
import { createFirebaseNumberGemRaceSession, type NumberGemRaceSession } from '../../online/firebase-number-gem-race'
import { createNumberGemRaceState, type NumberGemRaceState } from '../../online/number-gem-race-rules'
import type { FirebasePairingSession } from '../../online/firebase-pairing'
import { createNumberGemPuzzle } from './generator'
import { chooseNumberGemCell, createNumberGemState, undoNumberGemCell } from './rules'

const createRaceRoom = (database: Database, pairing: FirebasePairingSession, hostUid: string, guestUid: string,
  signal: AbortSignal, expiresAt: number) => createFirebaseNumberGemRaceSession(database, pairing, hostUid, guestUid, signal, expiresAt)

export function NumberGemRaceOnline({ onBack }: { readonly onBack: () => void }) {
  const [session, setSession] = useState<NumberGemRaceSession | null>(null)
  if (session === null) return <FirebaseFriendPairing<NumberGemRaceSession> gameId="number-gem" roomFactory={createRaceRoom} onBack={onBack} onConnected={setSession} />
  return <NumberGemRaceBoard session={session} onBack={onBack} />
}

function NumberGemRaceBoard({ session, onBack }: { readonly session: NumberGemRaceSession; readonly onBack: () => void }) {
  const [race, setRace] = useState<NumberGemRaceState>(createNumberGemRaceState)
  const [connected, setConnected] = useState(false)
  const [local, setLocal] = useState(() => createNumberGemState(createNumberGemPuzzle(race.seed, 'beginner')))
  const [submitting, setSubmitting] = useState(false)
  const [clockTick, setClockTick] = useState(0)
  const [feedbackOverride, setFeedbackOverride] = useState<string | null>(null)
  const { speak, isSupported } = useSpeech()

  useEffect(() => {
    const stop = session.subscribe(setRace, setConnected)
    return () => { stop(); session.close() }
  }, [session])
  useEffect(() => {
    setLocal(createNumberGemState(createNumberGemPuzzle(race.seed, 'beginner')))
    setSubmitting(false)
    setFeedbackOverride(null)
  }, [race.seed])
  useEffect(() => {
    if (race.phase !== 'playing' || race.startsAt === null || race.deadlineAt === null) return
    const now = session.serverNow()
    const nextBoundary = now < race.startsAt ? race.startsAt : now < race.deadlineAt ? race.deadlineAt : null
    if (nextBoundary === null) return
    const timer = window.setTimeout(() => setClockTick((value) => value + 1), Math.max(1, nextBoundary - now + 50))
    return () => window.clearTimeout(timer)
  }, [race.phase, race.startsAt, race.deadlineAt, session, clockTick])

  const puzzle = useMemo(() => createNumberGemPuzzle(race.seed, 'beginner'), [race.seed])
  const startsAt = race.startsAt
  const playing = connected && race.phase === 'playing' && startsAt !== null && race.deadlineAt !== null &&
    session.serverNow() >= startsAt && session.serverNow() < race.deadlineAt
  const showPuzzle = playing || race.phase === 'result' || race.phase === 'complete'
  const boardLocked = !playing || submitting || local.phase === 'completed'
  const myReady = race.ready[session.role]
  const statusId = race.phase === 'complete'
    ? race.matchWinner === 'host' ? 'number_gem.race_one_wins' : 'number_gem.race_two_wins'
    : race.phase === 'result'
      ? race.roundWinner === 'host' ? 'number_gem.race_one_score' : 'number_gem.race_two_score'
      : race.phase === 'playing'
        ? playing ? 'number_gem.race_start' : 'number_gem.race_wait'
        : myReady ? 'number_gem.race_wait' : 'number_gem.race_ready'
  const feedback = getChildText(feedbackOverride ?? statusId)

  function choose(index: number) {
    if (boardLocked) return
    const result = chooseNumberGemCell(local, index)
    if (result.state === local) return
    setLocal(result.state)
    setFeedbackOverride(null)
    if (result.state.phase !== 'completed') return
    setSubmitting(true)
    void session.solve(result.state.path).catch(() => {
      setLocal(createNumberGemState(puzzle))
      setFeedbackOverride('number_gem.race_wait')
    }).finally(() => setSubmitting(false))
  }

  return <main className="number-gem-connection number-gem-connection--online number-gem-race">
    <section className="number-gem-connection__frame" aria-label={getChildText('number_gem.title').text_zh_tw}>
      <header className="number-gem-connection__header">
        <BopomofoText as="h1" className="number-gem-connection__title" entry={getChildText('number_gem.title')} />
        <div className="number-gem-connection__header-meta">
          <BopomofoText className="number-gem-connection__badge" entry={getChildText('number_gem.goal_line')} />
          <section className="number-gem-scoreboard number-gem-scoreboard--online" aria-label={getChildText('number_gem.scoreboard').text_zh_tw}>
            <BopomofoText entry={getChildText('number_gem.scoreboard')} />
            <div className="number-gem-scoreboard__players">
              <div className="number-gem-scoreboard__player"><BopomofoText entry={getChildText('number_gem.player_one')} /><strong>{race.scores.host} / 3</strong></div>
              <div className="number-gem-scoreboard__player"><BopomofoText entry={getChildText('number_gem.player_two')} /><strong>{race.scores.guest} / 3</strong></div>
            </div>
          </section>
        </div>
      </header>
      <div className="number-gem-connection__layout">
        <section className="number-gem-board-panel">
          <BopomofoText as="p" className="number-gem-turn" entry={feedback} role="status" />
          <div className="number-gem-board number-gem-board--3" role="grid" aria-label={getChildText('number_gem.title').text_zh_tw} style={{ '--number-gem-columns': 3 } as React.CSSProperties}>
            {puzzle.board.map((value, index) => <button key={`${puzzle.id}-${index}`} type="button" role="gridcell"
              className={`number-gem-cell${local.path.includes(index) ? ' number-gem-cell--selected' : ''}`}
              aria-label={showPuzzle ? `${getChildText('number_gem.gem_label').text_zh_tw}${value}` : undefined}
              aria-pressed={local.path.includes(index)} disabled={boardLocked} onClick={() => choose(index)}>
              <span className="number-gem-cell__value" aria-hidden="true">{showPuzzle ? value : '✦'}</span>
            </button>)}
          </div>
          <div className="number-gem-target-card" aria-live="polite">
            <div className="number-gem-target-card__item"><BopomofoText entry={getChildText('number_gem.target')} /><strong>{showPuzzle ? puzzle.target : '？'}</strong></div>
            <div className="number-gem-target-card__item"><BopomofoText entry={getChildText('number_gem.current_total')} /><strong>{local.currentTotal}</strong></div>
          </div>
        </section>
        <aside className="number-gem-controls">
          <FeedbackCard entry={feedback} tone={race.phase === 'result' || race.phase === 'complete' ? 'positive' : 'hint'} />
          <div className="number-gem-actions">
            {(race.phase === 'ready' || race.phase === 'result') && !myReady &&
              <ChildActionButton entry={getChildText(race.decidedRounds === 0 ? 'number_gem.race_ready' : 'number_gem.next_puzzle')} icon="target" tone="primary" disabled={!connected} onClick={() => {
                void session.ready().catch(() => setFeedbackOverride('online.random_error'))
              }} />}
            {race.phase === 'playing' && <ChildActionButton entry={getChildText('number_gem.undo')} icon="retry" tone="secondary" disabled={boardLocked || local.path.length === 0} onClick={() => setLocal(undoNumberGemCell(local))} />}
            {race.phase === 'complete' && session.role === 'host' && <ChildActionButton entry={getChildText('common.try_again')} icon="retry" tone="primary" disabled={!connected} onClick={() => {
              void session.restart().catch(() => setFeedbackOverride('online.random_error'))
            }} />}
          </div>
          <div className="number-gem-tools">
            <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
            <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(feedback)} />
          </div>
        </aside>
      </div>
    </section>
  </main>
}
