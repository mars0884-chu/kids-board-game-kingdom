import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, DifficultySelector, FeedbackCard, ToolButton, type DifficultyLevel } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { chooseGoMove } from './ai'
import { FirebaseFriendPairing } from '../../online/FirebaseFriendPairing'
import { createFirebaseAuthoritativeTurnSession, type AuthoritativeTurnSession } from '../../online/firebase-authoritative-turn-game'
import { createGoOnlineRules } from '../../online/turn-rules'
import type { FirebaseRoomFactory } from '../../online/firebase-friend'
import type { OnlineGameId } from '../../online/game-id'
import {
  applyGoAction,
  agreeGoScore,
  calculateGoScore,
  createGoState,
  getGoGroup,
  getLegalGoMoves,
  passGoTurn,
  playGoMove,
  type GoBoardSize,
  type GoState,
} from './rules'

export type GoMode = 'adventure' | 'npc' | 'local' | 'online'

interface GoGameProps {
  mode: GoMode
  onBack: () => void
  initialBoardSize?: GoBoardSize
}

const configurations: Record<GoBoardSize, { start: number; end: number; radius: number; stars: readonly number[] }> = {
  9: { start: 49.5, end: 550.5, radius: 20.5, stars: [2, 4, 6] },
  13: { start: 49.5, end: 550.5, radius: 18.2, stars: [3, 6, 9] },
  19: { start: 27, end: 573, radius: 12.2, stars: [3, 9, 15] },
}

function sizeForDifficulty(level: DifficultyLevel): GoBoardSize {
  return level === 'beginner' ? 9 : level === 'adult' ? 19 : 13
}

function entryForTurn(state: GoState, mode: GoMode, paused: boolean) {
  if (paused) return getChildText('common.pause')
  if (state.phase === 'scoring') return getChildText('go.scoring')
  if (state.phase === 'finished') {
    if (state.result?.winner === null) return getChildText('go.draw')
    return getChildText(state.result?.winner === 'black' ? 'go.black_wins' : 'go.white_wins')
  }
  if ((mode === 'npc' || mode === 'adventure') && state.currentPlayer === 'white') return getChildText('tictactoe.npc_thinking')
  return getChildText(state.currentPlayer === 'black' ? 'go.turn_black' : 'go.turn_white')
}

function createCaptureLesson(): GoState {
  let state = createGoState(9)
  for (const point of [31, 40, 39, 0, 49, 1]) state = playGoMove(state, point)
  return state
}

function createSuicideLesson(): GoState {
  let state = createGoState(9)
  // 白方輪到嘗試中心點；黑棋各自有中心以外的氣，避免該手變成提子或連棋。
  for (const point of [31, 0, 39, 8, 41, 72, 49, 80, 22, 4, 38, 76, 42, 36, 58, 44, 30]) {
    state = playGoMove(state, point)
  }
  return state
}

function createKoCaptureLesson(): GoState {
  const state = createGoState(9)
  const board = [...state.board]
  for (const point of [1, 9, 19]) board[point] = 'black'
  for (const point of [10, 2, 20, 12]) board[point] = 'white'
  const position = board.map((stone) => stone === null ? '.' : stone === 'black' ? 'B' : 'W').join('')
  return playGoMove({ ...state, board, positionHistory: [position] }, 11)
}

function tutorialReply(state: GoState): number | null {
  const lastBlackPoint = [...state.moves].reverse().find((move) => move.player === 'black' && move.action.type === 'play')?.action
  if (lastBlackPoint?.type !== 'play') return null
  const row = Math.floor(lastBlackPoint.point / state.boardSize)
  const column = lastBlackPoint.point % state.boardSize
  return [...getLegalGoMoves(state)].sort((left, right) => {
    const distance = (point: number) => Math.abs(Math.floor(point / state.boardSize) - row) + Math.abs(point % state.boardSize - column)
    return distance(right) - distance(left)
  })[0] ?? null
}

function goPositionSeed(state: GoState): number {
  return state.moves.reduce((seed, move) => Math.imul(seed ^ (move.action.type === 'play' ? move.action.point + 1 : 0), 16777619), 20260928)
}

export function GoGame({ mode, onBack, initialBoardSize }: GoGameProps) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const startingSize = initialBoardSize ?? (mode === 'local' ? 9 : sizeForDifficulty('beginner'))
  const [boardSize, setBoardSize] = useState<GoBoardSize>(startingSize)
  const [state, setState] = useState<GoState>(() => createGoState(startingSize))
  const [isPaused, setIsPaused] = useState(false)
  const [isStarted, setIsStarted] = useState(mode !== 'local' && mode !== 'online')
  const [cursor, setCursor] = useState(0)
  const [noticeId, setNoticeId] = useState<string | null>(null)
  const [tutorialStep, setTutorialStep] = useState(0)
  const [tutorialAdvance, setTutorialAdvance] = useState(false)
  const [onlineSession, setOnlineSession] = useState<AuthoritativeTurnSession<GoState> | null>(null)
  const [onlineConnected, setOnlineConnected] = useState(false)
  const [onlinePending, setOnlinePending] = useState(false)
  const boardRef = useRef<SVGSVGElement>(null)
  const lastTouchTimeRef = useRef(0)
  const { isSupported, speak } = useSpeech()

  const roomFactory = useCallback<FirebaseRoomFactory<AuthoritativeTurnSession<GoState>>>(
    async (database, pairing, hostUid, guestUid, signal, expiresAt) => {
      const rules = createGoOnlineRules(boardSize)
      return createFirebaseAuthoritativeTurnSession(database, pairing, `go-${boardSize}`, hostUid, guestUid, signal, rules, expiresAt)
    },
    [boardSize],
  )

  useEffect(() => {
    if (onlineSession === null) return
    const unsubscribe = onlineSession.subscribe((next) => setState(next), setOnlineConnected)
    return () => { unsubscribe(); onlineSession.close() }
  }, [onlineSession])

  const submitAction = async (action: Parameters<typeof applyGoAction>[1]) => {
    try {
      const next = applyGoAction(state, action)
      if (mode === 'online') {
        if (onlineSession === null || !onlineConnected || onlinePending) throw new Error('連線中斷。')
        setOnlinePending(true)
        try { await onlineSession.submit(next) }
        finally { setOnlinePending(false) }
      } else setState(next)
      setNoticeId(null)
    } catch {
      setNoticeId(mode === 'online' ? 'online.friend_unavailable' : 'go.invalid_move')
    }
  }

  const feedbackEntry = useMemo(() => {
    if (noticeId !== null) return getChildText(noticeId)
    if (mode === 'adventure' && tutorialStep === 6 && state.phase === 'finished') return getChildText('go.tutorial_course_done')
    if (mode === 'adventure' && tutorialStep === 6 && state.phase === 'scoring') return getChildText('go.tutorial_scoring')
    if (state.phase === 'scoring') return getChildText('go.scoring')
    if (state.phase === 'finished') {
      if (state.result?.winner === null) return getChildText('go.draw')
      return getChildText(state.result?.winner === 'black' ? 'go.black_wins' : 'go.white_wins')
    }
    if (isPaused) return getChildText('common.pause')
    if (mode === 'adventure' && state.phase === 'playing') {
      if (tutorialStep === 0) return getChildText('go.tutorial_place')
      if (tutorialStep === 1) return getChildText('go.tutorial_connect')
      if (tutorialStep === 2) return getChildText('go.tutorial_liberties')
      if (tutorialStep === 3) return getChildText('go.tutorial_capture')
      if (tutorialStep === 4) return getChildText('go.tutorial_suicide')
      if (tutorialStep === 5) return getChildText('go.tutorial_ko')
      return getChildText('go.tutorial_pass')
    }
    return getChildText('go.choose_point')
  }, [isPaused, mode, noticeId, state.phase, state.result?.winner, tutorialStep])

  useEffect(() => {
    if (mode === 'adventure' && isSupported) speak(feedbackEntry)
  }, [feedbackEntry, isSupported, mode, speak])

  const turnEntry = mode === 'online' && !onlineConnected ? getChildText('online.friend_connecting') : entryForTurn(state, mode, isPaused)
  const currentScore = useMemo(() => calculateGoScore(state), [state])
  const config = configurations[state.boardSize]
  const step = (config.end - config.start) / (state.boardSize - 1)
  const tutorialTargets = useMemo(() => {
    if (mode !== 'adventure') return new Set<number>()
    if (tutorialStep === 3) return new Set([41])
    if (tutorialStep === 4) return new Set([40])
    if (tutorialStep === 5) return new Set([10])
    if (tutorialStep !== 1 && tutorialStep !== 2) return new Set<number>()
    const firstBlackPoint = state.moves.find((move) => move.player === 'black' && move.action.type === 'play')?.action
    return firstBlackPoint?.type === 'play' ? new Set(getGoGroup(state.board, 9, firstBlackPoint.point).liberties) : new Set<number>()
  }, [mode, state.board, state.moves, tutorialStep])
  const ownsTurn = mode === 'local' || (mode === 'online' ? onlineSession?.role === (state.currentPlayer === 'black' ? 'host' : 'guest') : state.currentPlayer === 'black')
  const canTryTutorialRule = mode === 'adventure' && (tutorialStep === 4 || tutorialStep === 5) && !tutorialAdvance
  const interactionLocked = isPaused || onlinePending || !isStarted || (mode === 'online' && !onlineConnected) || (state.phase !== 'playing' && state.phase !== 'scoring')
  const turnActionsLocked = interactionLocked || !ownsTurn || (mode === 'adventure' && tutorialAdvance)
  const boardLocked = interactionLocked || (mode === 'adventure' && (tutorialAdvance || tutorialStep === 6)) || (!ownsTurn && !canTryTutorialRule)

  useEffect(() => {
    if (mode === 'local' || mode === 'online' || isPaused || !isStarted || state.phase !== 'playing' || state.currentPlayer !== 'white' || (mode === 'adventure' && (tutorialAdvance || tutorialStep === 5))) return
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase !== 'playing' || current.currentPlayer !== 'white') return current
        if (mode === 'adventure' && tutorialStep === 6) return passGoTurn(current)
        if (mode === 'adventure' && tutorialStep <= 2) {
          const point = tutorialReply(current)
          if (point !== null) return playGoMove(current, point)
        }
        const move = chooseGoMove(current, difficulty, goPositionSeed(current))
        if (move === null) return passGoTurn(current)
        try { return playGoMove(current, move) } catch { return current }
      })
      setNoticeId(null)
    }, 360)
    return () => window.clearTimeout(timer)
  }, [difficulty, isPaused, isStarted, mode, state, tutorialAdvance, tutorialStep])

  useEffect(() => {
    if (mode === 'local' || mode === 'online' || isPaused || state.phase !== 'scoring' || state.currentPlayer !== 'white' || state.scoreAgreedBy.includes('white')) return
    const timer = window.setTimeout(() => {
      setState((current) => current.phase === 'scoring' && current.currentPlayer === 'white' && !current.scoreAgreedBy.includes('white') ? agreeGoScore(current) : current)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [isPaused, mode, state])

  useEffect(() => {
    if (mode !== 'local' && mode !== 'online' && state.boardSize !== sizeForDifficulty(difficulty)) {
      const nextSize = sizeForDifficulty(difficulty)
      setBoardSize(nextSize)
      setState(createGoState(nextSize))
      setCursor(Math.floor((nextSize * nextSize) / 2))
    }
  }, [difficulty, mode, state.boardSize])

  if (mode === 'online' && isStarted && onlineSession === null) {
    return <FirebaseFriendPairing<AuthoritativeTurnSession<GoState>>
      gameId={`go-${boardSize}` as OnlineGameId}
      roomFactory={roomFactory}
      onBack={() => setIsStarted(false)}
      onConnected={(session) => { setOnlineSession(session); setIsStarted(true) }}
    />
  }

  const choosePoint = (point: number) => {
    if (isPaused || !isStarted) return
    try {
      if (mode === 'adventure' && tutorialStep === 1) {
        const firstBlackPoint = state.moves.find((move) => move.player === 'black' && move.action.type === 'play')?.action
        const connectedLiberties = firstBlackPoint?.type === 'play' ? getGoGroup(state.board, 9, firstBlackPoint.point).liberties : []
        if (!connectedLiberties.includes(point)) { setNoticeId('go.tutorial_connect_hint'); return }
        void submitAction({ type: 'play', point })
        setTutorialStep(2)
        return
      }
      if (mode === 'adventure' && tutorialStep === 2) {
        const firstBlackPoint = state.moves.find((move) => move.player === 'black' && move.action.type === 'play')?.action
        const liberties = firstBlackPoint?.type === 'play' ? getGoGroup(state.board, 9, firstBlackPoint.point).liberties : []
        if (!liberties.includes(point)) { setNoticeId('go.tutorial_liberty_hint'); return }
        void submitAction({ type: 'play', point })
        setNoticeId('go.tutorial_liberty_complete')
        setTutorialAdvance(true)
        return
      }
      if (mode === 'adventure' && tutorialStep === 3) {
        if (point !== 41) { setNoticeId('go.tutorial_capture_hint'); return }
        void submitAction({ type: 'play', point })
        setNoticeId('go.tutorial_done')
        setTutorialAdvance(true)
        return
      }
      if (mode === 'adventure' && tutorialStep === 4) {
        if (point !== 40) { setNoticeId('go.tutorial_suicide_hint'); return }
        try {
          playGoMove(state, point)
          setNoticeId('go.tutorial_suicide_hint')
        } catch {
          setNoticeId('go.tutorial_suicide_forbidden')
          setTutorialAdvance(true)
        }
        return
      }
      if (mode === 'adventure' && tutorialStep === 5) {
        if (point !== 10) { setNoticeId('go.tutorial_ko_hint'); return }
        try {
          playGoMove(state, point)
          setNoticeId('go.tutorial_ko_hint')
        } catch {
          setNoticeId('go.tutorial_ko_forbidden')
          setTutorialAdvance(true)
        }
        return
      }
      if (mode === 'adventure' && tutorialStep === 6) return
      if (state.phase === 'scoring') void submitAction({ type: 'mark-dead', point })
      else if (state.phase === 'playing' && ownsTurn) {
        void submitAction({ type: 'play', point })
        if (mode === 'adventure' && tutorialStep === 0) setTutorialStep(1)
      }
    } catch {
      const entry = getChildText('go.invalid_move')
      setNoticeId(entry.id)
      speak(entry)
    }
  }

  const activateBoardPoint = (clientX: number, clientY: number, board: SVGSVGElement) => {
    if (boardLocked) return
    const bounds = board.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const x = (clientX - bounds.left) / bounds.width * 600
    const y = (clientY - bounds.top) / bounds.height * 600
    const column = Math.round((x - config.start) / step)
    const row = Math.round((y - config.start) / step)
    if (row < 0 || row >= state.boardSize || column < 0 || column >= state.boardSize) return
    if (Math.abs(x - (config.start + column * step)) > step * 0.49 || Math.abs(y - (config.start + row * step)) > step * 0.49) return
    const point = row * state.boardSize + column
    setCursor(point)
    choosePoint(point)
  }

  const handleBoardKey = (event: KeyboardEvent<SVGSVGElement>) => {
    let next = cursor
    if (event.key === 'ArrowUp') next = Math.max(0, cursor - state.boardSize)
    else if (event.key === 'ArrowDown') next = Math.min(state.board.length - 1, cursor + state.boardSize)
    else if (event.key === 'ArrowLeft') next = Math.floor(cursor / state.boardSize) * state.boardSize + Math.max(0, cursor % state.boardSize - 1)
    else if (event.key === 'ArrowRight') next = Math.floor(cursor / state.boardSize) * state.boardSize + Math.min(state.boardSize - 1, cursor % state.boardSize + 1)
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choosePoint(cursor)
      return
    } else return
    event.preventDefault()
    setCursor(next)
  }

  const changeBoardSize = (nextSize: GoBoardSize) => {
    setBoardSize(nextSize)
    setState(createGoState(nextSize))
    setCursor(Math.floor((nextSize * nextSize) / 2))
    setIsPaused(false)
    setIsStarted(true)
    setNoticeId(null)
  }

  const restart = () => {
    if (mode === 'online') {
      if (onlineSession?.role !== 'host') { setNoticeId('online.friend_unavailable'); return }
      void onlineSession.restart().catch(() => setNoticeId('online.friend_unavailable'))
      return
    }
    setState(createGoState(boardSize))
    if (mode === 'adventure') { setTutorialStep(0); setTutorialAdvance(false) }
    setCursor(Math.floor((boardSize * boardSize) / 2))
    setIsPaused(false)
    setNoticeId(null)
  }

  const winnerEntry = state.result?.winner === null ? getChildText('go.draw') : getChildText(state.result?.winner === 'black' ? 'go.black_wins' : 'go.white_wins')
  const modeEntry = getChildText(mode === 'local' ? 'home.two_player' : mode === 'adventure' ? 'home.adventure' : mode === 'online' ? 'home.online' : 'home.practice')

  return (
    <main className="go-game" data-go-mode={mode} data-board-size={boardSize}>
      <section className="go-game__frame" aria-label={getChildText('go.title').text_zh_tw}>
        <header className="go-game__header">
          <div className="go-game__title-row">
            <BopomofoText as="h1" className="go-game__title" entry={getChildText('go.title')} />
            <BopomofoText className="go-game__size-badge" entry={getChildText(`go.size_${boardSize}`)} />
          </div>
          <BopomofoText className="go-game__mode" entry={modeEntry} />
          <div className={`go-game__turn go-game__turn--${state.currentPlayer}`} role="status" aria-live="polite">
            <span className={`go-game__stone go-game__stone--${state.currentPlayer}`} aria-hidden="true" />
            <BopomofoText entry={turnEntry} />
          </div>
        </header>

        <div className="go-game__layout">
          <section className="go-game__board-panel" aria-label={getChildText('go.board').text_zh_tw}>
            <div className="go-game__board-card">
              <svg
                ref={boardRef}
                className="go-game__board"
                viewBox="0 0 600 600"
                role="grid"
                aria-label={getChildText('go.board').text_zh_tw}
                aria-rowcount={boardSize}
                aria-colcount={boardSize}
                aria-activedescendant={`go-point-${boardSize}-${cursor}`}
                tabIndex={boardLocked ? -1 : 0}
                onClick={(event) => {
                  if (Date.now() - lastTouchTimeRef.current < 800) return
                  activateBoardPoint(event.clientX, event.clientY, event.currentTarget)
                }}
                onKeyDown={handleBoardKey}
                onPointerUp={(event: PointerEvent<SVGSVGElement>) => {
                  if (event.pointerType !== 'touch') return
                  lastTouchTimeRef.current = Date.now()
                  activateBoardPoint(event.clientX, event.clientY, event.currentTarget)
                }}
                data-line-count={boardSize * 2}
              >
                <defs>
                  <radialGradient id="go-game-wood" cx="32%" cy="25%" r="90%"><stop offset="0" stopColor="#f9dfa0" /><stop offset="1" stopColor="#d9a95e" /></radialGradient>
                  <radialGradient id="go-game-black" cx="30%" cy="25%" r="75%"><stop offset="0" stopColor="#777b7b" /><stop offset="0.45" stopColor="#252a2c" /><stop offset="1" stopColor="#080b0c" /></radialGradient>
                  <radialGradient id="go-game-white" cx="30%" cy="25%" r="78%"><stop offset="0" stopColor="#fff" /><stop offset="0.7" stopColor="#f5f2e7" /><stop offset="1" stopColor="#c6c1b3" /></radialGradient>
                  <filter id="go-game-shadow" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.2" /><feOffset dy="2" /><feComponentTransfer><feFuncA type="linear" slope="0.22" /></feComponentTransfer><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
                <rect x="0" y="0" width="600" height="600" fill="#77542d" />
                <rect x="5" y="5" width="590" height="590" fill="#b78345" />
                <rect x="10" y="10" width="580" height="580" fill="url(#go-game-wood)" stroke="#f8e8bd" strokeWidth="2" />
                <g className="go-game__grid-lines" aria-hidden="true">
                  {Array.from({ length: boardSize }, (_, index) => {
                    const at = config.start + index * step
                    return <g key={index}><line x1={at} y1={config.start} x2={at} y2={config.end} /><line x1={config.start} y1={at} x2={config.end} y2={at} /></g>
                  })}
                </g>
                <g aria-hidden="true">
                  {config.stars.flatMap((row) => config.stars.map((column) => <circle key={`${row}-${column}`} cx={config.start + column * step} cy={config.start + row * step} r={Math.max(3, step * 0.105)} />))}
                </g>
                <g aria-hidden="true">
                  {state.board.map((stone, point) => {
                    const row = Math.floor(point / boardSize)
                    const column = point % boardSize
                    const x = config.start + column * step
                    const y = config.start + row * step
                    const isDead = state.deadStones.includes(point)
                    const isCursor = point === cursor && !boardLocked
                    const isTutorialTarget = tutorialTargets.has(point)
                    return <g key={point} id={`go-point-${boardSize}-${point}`} data-stone={stone ?? 'empty'} data-dead={isDead || undefined} data-cursor={isCursor || undefined}>
                      <circle className="go-game__hit" cx={x} cy={y} r={Math.min(step * 0.44, 22)} />
                      {isTutorialTarget && <circle className={`go-game__tutorial-target${tutorialStep === 4 || tutorialStep === 5 ? ' go-game__tutorial-target--forbidden' : ''}`} cx={x} cy={y} r={Math.min(step * 0.42, 20)} />}
                      {isCursor && <circle className="go-game__cursor" cx={x} cy={y} r={Math.min(config.radius * 0.7, step * 0.34)} />}
                      {stone && <circle className={`go-game__piece go-game__piece--${stone}`} cx={x} cy={y} r={config.radius} fill={stone === 'black' ? 'url(#go-game-black)' : 'url(#go-game-white)'} filter="url(#go-game-shadow)" opacity={isDead ? 0.38 : 1} />}
                      {isDead && <path className="go-game__dead-mark" d={`M ${x - step * 0.17} ${y - step * 0.17} L ${x + step * 0.17} ${y + step * 0.17} M ${x + step * 0.17} ${y - step * 0.17} L ${x - step * 0.17} ${y + step * 0.17}`} />}
                    </g>
                  })}
                </g>
              </svg>
            </div>
          </section>

          <aside className="go-game__controls">
            {mode === 'adventure' && (
              <div className="go-game__tutorial-progress">
                <BopomofoText entry={getChildText('go.tutorial_label')} />
                <div className="go-game__tutorial-track" role="progressbar" aria-label={getChildText('go.tutorial_label').text_zh_tw} aria-valuemin={1} aria-valuemax={7} aria-valuenow={tutorialStep + 1}>
                  <span style={{ width: `${((tutorialStep + 1) / 7) * 100}%` }} />
                </div>
                <strong aria-hidden="true">{tutorialStep + 1}/7</strong>
              </div>
            )}
            <FeedbackCard entry={feedbackEntry} tone={state.phase === 'finished' ? 'positive' : 'hint'} />
            {!isStarted ? (
              <div className="go-game__size-picker">
                <BopomofoText as="h2" entry={getChildText('go.select_size')} />
                <div className="go-game__size-options" role="group" aria-label={getChildText('go.select_size').text_zh_tw}>
                  {([9, 13, 19] as const).map((size) => (
                    <ChildActionButton key={size} entry={getChildText(`go.size_${size}`)} icon="target" tone={boardSize === size ? 'primary' : 'secondary'} aria-pressed={boardSize === size} disabled={initialBoardSize !== undefined} onClick={() => { setBoardSize(size); setState(createGoState(size)); setCursor(Math.floor((size * size) / 2)) }} />
                  ))}
                </div>
                <ChildActionButton entry={getChildText('go.start_game')} icon="target" tone="primary" disabled={onlinePending} onClick={() => setIsStarted(true)} />
                <div className="go-game__tools">
                  <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
                </div>
              </div>
            ) : null}
            {mode === 'adventure' && tutorialAdvance && tutorialStep === 2 && (
              <ChildActionButton entry={getChildText('go.tutorial_next')} icon="target" tone="primary" onClick={() => { setState(createCaptureLesson()); setBoardSize(9); setCursor(41); setTutorialStep(3); setTutorialAdvance(false); setNoticeId(null) }} />
            )}
            {mode === 'adventure' && tutorialAdvance && tutorialStep === 3 && (
              <ChildActionButton entry={getChildText('go.tutorial_next_forbidden')} icon="target" tone="primary" onClick={() => { setState(createSuicideLesson()); setBoardSize(9); setCursor(40); setTutorialStep(4); setTutorialAdvance(false); setNoticeId(null) }} />
            )}
            {mode === 'adventure' && tutorialAdvance && tutorialStep === 4 && (
              <ChildActionButton entry={getChildText('go.tutorial_next_ko')} icon="target" tone="primary" onClick={() => { setState(createKoCaptureLesson()); setBoardSize(9); setCursor(10); setTutorialStep(5); setTutorialAdvance(false); setNoticeId(null) }} />
            )}
            {mode === 'adventure' && tutorialAdvance && tutorialStep === 5 && (
              <ChildActionButton entry={getChildText('go.tutorial_next_pass')} icon="target" tone="primary" onClick={() => { setState(createGoState(9)); setBoardSize(9); setCursor(40); setTutorialStep(6); setTutorialAdvance(false); setNoticeId(null) }} />
            )}
            {mode === 'npc' && <DifficultySelector selected={difficulty} onChange={setDifficulty} disabled={state.moves.length > 0} />}
            {mode === 'local' && isStarted && state.moves.length === 0 && (
              <div className="go-game__size-options" role="group" aria-label={getChildText('go.select_size').text_zh_tw}>
                {([9, 13, 19] as const).map((size) => (
                  <ChildActionButton key={size} entry={getChildText(`go.size_${size}`)} icon="target" tone={boardSize === size ? 'primary' : 'secondary'} aria-pressed={boardSize === size} onClick={() => changeBoardSize(size)} />
                ))}
              </div>
            )}
            {state.phase === 'scoring' && (
              <div className="go-game__score">
                <div><BopomofoText entry={getChildText('go.black_score')} /><strong>{currentScore.black}</strong></div>
                <div><BopomofoText entry={getChildText('go.white_score')} /><strong>{currentScore.white}</strong></div>
              </div>
            )}
            {state.phase === 'finished' && state.result && (
              <div className="go-game__score" role="status">
                <BopomofoText entry={winnerEntry} />
                {state.endReason === 'score' && <span>{state.result.black}：{state.result.white}</span>}
              </div>
            )}
            {isStarted && state.phase === 'playing' && (
              <div className="go-game__actions">
                <ChildActionButton entry={getChildText('go.pass')} icon="target" tone="secondary" disabled={turnActionsLocked} onClick={() => void submitAction({ type: 'pass' })} />
                <ChildActionButton entry={getChildText('go.resign')} icon="back" tone="hint" disabled={turnActionsLocked} onClick={() => void submitAction({ type: 'resign' })} />
              </div>
            )}
            {state.phase === 'scoring' && (
              <div className="go-game__actions">
                <ChildActionButton entry={getChildText('go.agree_score')} icon="star" tone="primary" disabled={turnActionsLocked} onClick={() => void submitAction({ type: 'agree-score' })} />
                <ChildActionButton entry={getChildText('go.resume_game')} icon="retry" tone="secondary" disabled={turnActionsLocked} onClick={() => void submitAction({ type: 'resume' })} />
              </div>
            )}
            {state.phase === 'finished' && <ChildActionButton entry={getChildText('tictactoe.play_again')} icon="retry" tone="primary" disabled={mode === 'online' && onlineSession?.role !== 'host'} onClick={restart} />}
            {isStarted && (
              <div className="go-game__tools">
                <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
                {isSupported && <ToolButton entry={getChildText('common.listen')} icon="speaker" onClick={() => speak(feedbackEntry)} />}
                <ToolButton entry={getChildText(isPaused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={isPaused} onClick={() => setIsPaused((paused) => !paused)} />
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}
