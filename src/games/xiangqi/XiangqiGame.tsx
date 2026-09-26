import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, DifficultySelector, FeedbackCard, ToolButton, type DifficultyLevel } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { applyMove, createInitialXiangqiState, getLegalMovesFrom, type XiangqiKind, type XiangqiPlayer, type XiangqiState } from './rules'
import { chooseXiangqiMove } from './ai'
import { FirebaseFriendPairing } from '../../online/FirebaseFriendPairing'
import { createFirebaseAuthoritativeTurnSession, type AuthoritativeTurnSession } from '../../online/firebase-authoritative-turn-game'
import { xiangqiOnlineRules } from '../../online/turn-rules'
import type { FirebaseRoomFactory } from '../../online/firebase-friend'
import {
  XIANGQI_TUTORIAL_LEVELS,
  completeXiangqiTutorialMove,
  createXiangqiTutorialState,
  getXiangqiTutorialSolutions,
  isCorrectXiangqiTutorialMove,
} from './adventure'
import { indexedDbXiangqiAdventureStorage, type XiangqiAdventureStorage } from './storage'
import './XiangqiGame.css'

export type XiangqiMode = 'adventure' | 'npc' | 'local' | 'online'
interface XiangqiGameProps { mode: XiangqiMode; onBack: () => void; adventureStorage?: XiangqiAdventureStorage }

const createOnlineXiangqi: FirebaseRoomFactory<AuthoritativeTurnSession<XiangqiState>> =
  (database, pairing, hostUid, guestUid, signal, expiresAt) =>
    createFirebaseAuthoritativeTurnSession(database, pairing, 'xiangqi', hostUid, guestUid, signal, xiangqiOnlineRules, expiresAt)

const names: Record<XiangqiPlayer, Record<XiangqiKind, string>> = {
  red: { king: '帥', advisor: '仕', elephant: '相', horse: '馬', chariot: '車', cannon: '炮', soldier: '兵' },
  black: { king: '將', advisor: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '炮', soldier: '卒' },
}

export function XiangqiGame({ mode, onBack, adventureStorage = indexedDbXiangqiAdventureStorage }: XiangqiGameProps) {
  const [state, setState] = useState<XiangqiState>(() => mode === 'adventure' ? createXiangqiTutorialState(0, 0) : createInitialXiangqiState())
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [selected, setSelected] = useState<number | null>(null)
  const [tutorialLevelIndex, setTutorialLevelIndex] = useState(0)
  const [tutorialTaskIndex, setTutorialTaskIndex] = useState(0)
  const [tutorialHintLevel, setTutorialHintLevel] = useState(0)
  const [tutorialMoveComplete, setTutorialMoveComplete] = useState(false)
  const [tutorialCourseComplete, setTutorialCourseComplete] = useState(false)
  const [tutorialNoticeId, setTutorialNoticeId] = useState<string | null>(null)
  const [completedTutorialLevels, setCompletedTutorialLevels] = useState<readonly string[]>([])
  const [tutorialHydrated, setTutorialHydrated] = useState(mode !== 'adventure')
  const [isPaused, setIsPaused] = useState(false)
  const [onlineSession, setOnlineSession] = useState<AuthoritativeTurnSession<XiangqiState> | null>(null)
  const [onlineConnected, setOnlineConnected] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [zoomBaseWidth, setZoomBaseWidth] = useState<number | null>(null)
  const zoomViewportRef = useRef<HTMLElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const pinchRef = useRef<{ distance: number; zoom: number; focusX: number; focusY: number; left: number; top: number } | null>(null)
  const pendingScrollRef = useRef<{ x: number; y: number; left: number; top: number; scale: number } | null>(null)
  const { isSupported: isTaiwanVoiceAvailable, speak } = useSpeech()
  const destinations = useMemo(() => selected === null ? [] : getLegalMovesFrom(state, selected), [state, selected])
  const selectedPiece = selected === null ? null : state.board[selected]
  const tutorialLevel = XIANGQI_TUTORIAL_LEVELS[tutorialLevelIndex]!
  const tutorialTask = tutorialLevel.tasks[tutorialTaskIndex]!
  const tutorialSolutions = getXiangqiTutorialSolutions(tutorialTask)
  const isNpcTurn = mode === 'npc' && state.currentPlayer === 'black'
  const isOnlineTurn = mode !== 'online' || (onlineConnected && onlineSession !== null && (state.currentPlayer === 'red' ? 'host' : 'guest') === onlineSession.role)
  const tutorialBoardLocked = mode === 'adventure' && (!tutorialHydrated || isPaused || tutorialMoveComplete || tutorialCourseComplete)
  const tutorialFeedbackId = tutorialCourseComplete ? 'xiangqi.lesson_complete'
    : isPaused ? 'common.pause'
      : tutorialNoticeId ?? (tutorialMoveComplete ? 'xiangqi.lesson_success' : tutorialLevel.instructionTextId)
  const tutorialFeedbackEntry = getChildText(tutorialFeedbackId)
  const statusId = state.phase === 'won' ? state.winner === 'red' ? 'xiangqi.red_wins' : 'xiangqi.black_wins'
    : state.phase === 'draw' ? 'xiangqi.draw'
      : state.phase === 'check' ? 'xiangqi.check'
        : state.currentPlayer === 'red' ? 'xiangqi.red_turn' : 'xiangqi.black_turn'

  useLayoutEffect(() => {
    const viewport = zoomViewportRef.current
    if (!viewport) return
    const updateWidth = () => {
      const style = window.getComputedStyle(viewport)
      const width = viewport.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
      if (width > 0) setZoomBaseWidth(width)
    }
    updateWidth()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }
    const observer = new ResizeObserver(updateWidth)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (window.scrollY > 0) window.scrollTo(0, 0)
  }, [])

  useLayoutEffect(() => {
    const viewport = zoomViewportRef.current
    const pending = pendingScrollRef.current
    if (!viewport || !pending) return
    viewport.scrollLeft = (pending.left + pending.x) * pending.scale - pending.x
    viewport.scrollTop = (pending.top + pending.y) * pending.scale - pending.y
    pendingScrollRef.current = null
  }, [zoom])

  useEffect(() => {
    if (onlineSession === null) return
    const unsubscribe = onlineSession.subscribe((next) => { setState(next); setSelected(null) }, setOnlineConnected)
    return () => { unsubscribe(); onlineSession.close() }
  }, [onlineSession])

  useEffect(() => {
    if (mode !== 'adventure') {
      setTutorialHydrated(true)
      return
    }
    let active = true
    void adventureStorage.load().then((session) => {
      if (!active || session === null) return
      const task = XIANGQI_TUTORIAL_LEVELS[session.levelIndex]!.tasks[session.taskIndex]!
      let restoredState = createXiangqiTutorialState(session.levelIndex, session.taskIndex)
      if (session.moveComplete || session.courseComplete) {
        const solution = getXiangqiTutorialSolutions(task)[0]!
        restoredState = completeXiangqiTutorialMove(restoredState, solution.from, solution.to)
      }
      setTutorialLevelIndex(session.levelIndex)
      setTutorialTaskIndex(session.taskIndex)
      setTutorialHintLevel(session.hintLevel)
      setCompletedTutorialLevels(session.completedLevelIds)
      setTutorialMoveComplete(session.moveComplete)
      setTutorialCourseComplete(session.courseComplete)
      setState(restoredState)
    }).catch(() => undefined).finally(() => { if (active) setTutorialHydrated(true) })
    return () => { active = false }
  }, [adventureStorage, mode])

  useEffect(() => {
    if (mode !== 'adventure' || !tutorialHydrated) return
    void adventureStorage.save({
      levelIndex: tutorialLevelIndex,
      taskIndex: tutorialTaskIndex,
      hintLevel: tutorialHintLevel,
      completedLevelIds: completedTutorialLevels,
      moveComplete: tutorialMoveComplete,
      courseComplete: tutorialCourseComplete,
    })
  }, [adventureStorage, completedTutorialLevels, mode, tutorialCourseComplete, tutorialHydrated, tutorialHintLevel, tutorialLevelIndex, tutorialMoveComplete, tutorialTaskIndex])

  useEffect(() => {
    if (!isNpcTurn || state.phase === 'won' || state.phase === 'draw') return
    const timer = window.setTimeout(() => {
      const move = chooseXiangqiMove(state, difficulty)
      if (move) setState((current) => current.currentPlayer === 'black' ? applyMove(current, move.from, move.to) : current)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [difficulty, isNpcTurn, mode, state])

  useEffect(() => {
    if (mode === 'adventure' && tutorialHydrated) speak(getChildText(tutorialFeedbackId))
  }, [mode, speak, tutorialHydrated])

  useLayoutEffect(() => {
    const viewport = zoomViewportRef.current
    if (!viewport) return
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    const midpoint = (touches: TouchList) => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 })
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2) return
      event.preventDefault()
      const point = midpoint(event.touches)
      const rect = viewport.getBoundingClientRect()
      pinchRef.current = {
        distance: distance(event.touches), zoom, focusX: point.x - rect.left, focusY: point.y - rect.top,
        left: viewport.scrollLeft, top: viewport.scrollTop,
      }
    }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinchRef.current) return
      event.preventDefault()
      const next = Math.min(2.2, Math.max(1, pinchRef.current.zoom * distance(event.touches) / Math.max(1, pinchRef.current.distance)))
      if (Math.abs(next - zoom) < 0.01) return
      pendingScrollRef.current = {
        x: pinchRef.current.focusX, y: pinchRef.current.focusY,
        left: pinchRef.current.left, top: pinchRef.current.top, scale: next / pinchRef.current.zoom,
      }
      setZoom(next)
    }
    const end = (event: TouchEvent) => { if (event.touches.length < 2) pinchRef.current = null }
    viewport.addEventListener('touchstart', start, { passive: false })
    viewport.addEventListener('touchmove', move, { passive: false })
    viewport.addEventListener('touchend', end)
    viewport.addEventListener('touchcancel', end)
    return () => {
      viewport.removeEventListener('touchstart', start)
      viewport.removeEventListener('touchmove', move)
      viewport.removeEventListener('touchend', end)
      viewport.removeEventListener('touchcancel', end)
    }
  }, [zoom])

  function loadTutorialTask(levelIndex: number, taskIndex: number) {
    setTutorialLevelIndex(levelIndex)
    setTutorialTaskIndex(taskIndex)
    setState(createXiangqiTutorialState(levelIndex, taskIndex))
    setSelected(null)
    setTutorialHintLevel(0)
    setTutorialMoveComplete(false)
    setTutorialCourseComplete(false)
    setTutorialNoticeId(null)
    setIsPaused(false)
    speak(getChildText(XIANGQI_TUTORIAL_LEVELS[levelIndex]!.instructionTextId))
  }

  function restartTutorialCourse() {
    setCompletedTutorialLevels([])
    loadTutorialTask(0, 0)
  }

  function continueTutorial() {
    if (!tutorialMoveComplete) return
    const isLastTask = tutorialTaskIndex === tutorialLevel.tasks.length - 1
    if (!isLastTask) {
      loadTutorialTask(tutorialLevelIndex, tutorialTaskIndex + 1)
      return
    }

    setCompletedTutorialLevels((current) => current.includes(tutorialLevel.id) ? current : [...current, tutorialLevel.id])
    if (tutorialLevelIndex === XIANGQI_TUTORIAL_LEVELS.length - 1) {
      setTutorialCourseComplete(true)
      setTutorialNoticeId(null)
      speak(getChildText('xiangqi.lesson_complete'))
      return
    }
    loadTutorialTask(tutorialLevelIndex + 1, 0)
  }

  function showTutorialHint() {
    if (tutorialBoardLocked) return
    const nextHint = Math.min(3, tutorialHintLevel + 1)
    setTutorialHintLevel(nextHint)
    const hintId = nextHint === 1 ? tutorialLevel.instructionTextId
      : nextHint === 2 ? tutorialLevel.hintAreaTextId : 'xiangqi.lesson_hint_target'
    setTutorialNoticeId(hintId)
    speak(getChildText(hintId))
  }

  function selectCell(clickedIndex: number, event?: ReactMouseEvent<HTMLButtonElement>) {
    let index = clickedIndex
    const boardRect = boardRef.current?.getBoundingClientRect()
    if (event && event.detail > 0 && (event.clientX !== 0 || event.clientY !== 0) && boardRect && boardRect.width > 0 && boardRect.height > 0) {
      const column = Math.max(0, Math.min(8, Math.round((event.clientX - boardRect.left) / boardRect.width * 8)))
      const row = Math.max(0, Math.min(9, Math.round((event.clientY - boardRect.top) / boardRect.height * 9)))
      index = row * 9 + column
    }
    if (state.phase === 'won' || state.phase === 'draw' || isNpcTurn || !isOnlineTurn || tutorialBoardLocked) return
    const piece = state.board[index]
    if (destinations.some((move) => move.to === index) && selected !== null) {
      if (mode === 'adventure') {
        if (!isCorrectXiangqiTutorialMove(state, tutorialTask, selected, index)) {
          setTutorialNoticeId('xiangqi.lesson_try_again')
          setSelected(null)
          speak(getChildText('xiangqi.lesson_try_again'))
          return
        }
        setState(completeXiangqiTutorialMove(state, selected, index))
        setTutorialMoveComplete(true)
        setTutorialNoticeId(null)
        setTutorialHintLevel(0)
        setSelected(null)
        speak(getChildText('xiangqi.lesson_success'))
        return
      }
      const next = applyMove(state, selected, index)
      if (mode === 'online') void onlineSession!.submit(next).catch(() => undefined)
      else setState(next)
      setSelected(null)
      const nextStatus = next.phase === 'won' ? next.winner === 'red' ? 'xiangqi.red_wins' : 'xiangqi.black_wins'
        : next.phase === 'draw' ? 'xiangqi.draw' : next.phase === 'check' ? 'xiangqi.check' :
          next.currentPlayer === 'red' ? 'xiangqi.red_turn' : 'xiangqi.black_turn'
      speak(getChildText(nextStatus))
      return
    }
    if (mode === 'adventure' && selected !== null && piece === null) {
      setTutorialNoticeId('xiangqi.lesson_try_again')
      speak(getChildText('xiangqi.lesson_try_again'))
      return
    }
    setSelected(piece?.owner === state.currentPlayer ? index : null)
    if (piece?.owner === state.currentPlayer) speak(getChildText(`xiangqi.piece_${names[piece.owner][piece.kind]}`))
  }

  function restartCurrentMode() {
    if (mode === 'online') void onlineSession?.restart().catch(() => undefined)
    else if (mode === 'adventure') loadTutorialTask(tutorialLevelIndex, tutorialTaskIndex)
    else { setState(createInitialXiangqiState()); setSelected(null) }
  }

  if (mode === 'online' && onlineSession === null) {
    return <FirebaseFriendPairing<AuthoritativeTurnSession<XiangqiState>> gameId="xiangqi" roomFactory={createOnlineXiangqi} onBack={onBack} onConnected={setOnlineSession} />
  }

  return <main ref={zoomViewportRef} className="xiangqi-game">
    <div className="xiangqi-game__zoom-content" style={{ zoom, width: zoomBaseWidth === null ? undefined : `${zoomBaseWidth}px` }}>
    <section className={`xiangqi-game__frame${mode === 'adventure' ? ' xiangqi-game__frame--adventure' : ''}`} aria-label={getChildText('xiangqi.title').text_zh_tw}>
      <header className="xiangqi-game__header">
        <BopomofoText as="h1" entry={getChildText('xiangqi.title')} />
        <div className={`xiangqi-game__turn-card xiangqi-game__turn-card--${state.currentPlayer}`}>
          <svg className="xiangqi-game__turn-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path d="M6 19 24 7l18 12v21H6V19Z" fill="currentColor" opacity=".14" />
            <path d="M8 19 24 8l16 11M10 20v19h28V20M16 35V23l8-5 8 5v12M12 28h6m12 0h6M21 39V27h6v12" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <BopomofoText className="xiangqi-game__status" as="p" entry={getChildText(statusId)} />
        </div>
        {selectedPiece && <BopomofoText className="xiangqi-game__selection" as="p" entry={getChildText(`xiangqi.piece_${names[selectedPiece.owner][selectedPiece.kind]}`)} />}
      </header>
      <div className="xiangqi-game__board-wrap">
        <div ref={boardRef} className="xiangqi-game__board" role="grid" aria-label={getChildText('xiangqi.title').text_zh_tw}>
          <svg className="xiangqi-game__lines" viewBox="0 0 400 450" preserveAspectRatio="none" aria-hidden="true">
            {Array.from({ length: 10 }, (_, row) => <line key={`r${row}`} x1="0" y1={row * 50} x2="400" y2={row * 50} />)}
            {Array.from({ length: 9 }, (_, col) => <g key={`c${col}`}><line x1={col * 50} y1="0" x2={col * 50} y2="200" /><line x1={col * 50} y1="250" x2={col * 50} y2="450" /></g>)}
            <line x1="150" y1="0" x2="250" y2="100" /><line x1="250" y1="0" x2="150" y2="100" />
            <line x1="150" y1="350" x2="250" y2="450" /><line x1="250" y1="350" x2="150" y2="450" />
          </svg>
          <BopomofoText className="xiangqi-game__river" entry={getChildText('xiangqi.river')} />
          {state.board.map((piece, index) => {
            const row = Math.floor(index / 9)
            const col = index % 9
            const isDestination = destinations.some((move) => move.to === index)
            const isHintSource = mode === 'adventure' && tutorialHintLevel >= 2 && tutorialSolutions.some((solution) => solution.from === index)
            const isHintTarget = mode === 'adventure' && tutorialHintLevel >= 3 && tutorialSolutions.some((solution) => solution.to === index)
            return <button key={index} type="button" role="gridcell"
              className={`xiangqi-game__cell${piece ? ` xiangqi-game__cell--${piece.owner}` : ''}${selected === index ? ' xiangqi-game__cell--selected' : ''}${isDestination ? ' xiangqi-game__cell--destination' : ''}${isHintSource ? ' xiangqi-game__cell--hint-source' : ''}${isHintTarget ? ' xiangqi-game__cell--hint-target' : ''}`}
              style={{ left: `${col * 12.5}%`, top: `${row * (100 / 9)}%` }}
              aria-label={piece ? `${piece.owner === 'red' ? '紅' : '黑'}${names[piece.owner][piece.kind]}，${row + 1}列${col + 1}行` : `${row + 1}列${col + 1}行${isDestination ? '，可走' : ''}`}
              aria-selected={selected === index}
              disabled={tutorialBoardLocked}
              onClick={(event) => selectCell(index, event)}>
              {piece && <BopomofoText entry={getChildText(`xiangqi.piece_${names[piece.owner][piece.kind]}`)} />}
              {!piece && isDestination && <span aria-hidden="true" className="xiangqi-game__target">✦</span>}
            </button>
          })}
        </div>
      </div>
      {mode === 'adventure' ? <aside className="xiangqi-game__adventure" aria-label={getChildText('home.adventure').text_zh_tw}>
        <div className="xiangqi-game__lesson-steps" role="group" aria-label={getChildText('home.adventure').text_zh_tw}>
          {XIANGQI_TUTORIAL_LEVELS.map((level, index) => {
            const completed = completedTutorialLevels.includes(level.id)
            return <button key={level.id} type="button"
              className={`xiangqi-game__lesson-step${index === tutorialLevelIndex ? ' xiangqi-game__lesson-step--current' : ''}${completed ? ' xiangqi-game__lesson-step--complete' : ''}`}
              aria-pressed={index === tutorialLevelIndex}
              aria-label={getChildText(level.titleTextId).speech_zh_tw}
              disabled={isPaused || !tutorialHydrated}
              onClick={() => {
                if (tutorialMoveComplete && tutorialTaskIndex === tutorialLevel.tasks.length - 1) {
                  setCompletedTutorialLevels((current) => current.includes(tutorialLevel.id) ? current : [...current, tutorialLevel.id])
                }
                loadTutorialTask(index, 0)
              }}>
              <span className="xiangqi-game__lesson-mark" aria-hidden="true">{completed ? '✓' : index === tutorialLevelIndex ? '★' : '○'}</span>
              <BopomofoText entry={getChildText(level.titleTextId)} />
            </button>
          })}
        </div>
        <FeedbackCard entry={tutorialFeedbackEntry} tone={tutorialMoveComplete || tutorialCourseComplete ? 'positive' : 'hint'} />
        <div className="xiangqi-game__adventure-actions">
          <ChildActionButton entry={getChildText('common.hint')} icon="hint" tone="hint" disabled={tutorialBoardLocked} onClick={showTutorialHint} />
          <ChildActionButton
            entry={getChildText(tutorialCourseComplete ? 'tictactoe.play_again' : tutorialMoveComplete ? 'reversi.adventure_next' : 'common.try_again')}
            icon={tutorialCourseComplete || tutorialMoveComplete ? 'star' : 'retry'}
            tone={tutorialMoveComplete || tutorialCourseComplete ? 'primary' : 'secondary'}
            onClick={tutorialCourseComplete ? restartTutorialCourse : tutorialMoveComplete ? continueTutorial : restartCurrentMode}
          />
        </div>
        <div className="xiangqi-game__tools">
          <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
          <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isTaiwanVoiceAvailable} onClick={() => speak(tutorialFeedbackEntry)} />
          <ToolButton entry={getChildText(isPaused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={isPaused}
            onClick={() => {
              const resume = isPaused
              setIsPaused(!isPaused)
              setTutorialNoticeId(null)
              speak(getChildText(resume ? tutorialMoveComplete ? 'xiangqi.lesson_success' : tutorialLevel.instructionTextId : 'common.pause'))
            }} />
        </div>
      </aside> : <nav className="xiangqi-game__actions">
        <ChildActionButton entry={getChildText('common.back')} icon="back" tone="secondary" onClick={onBack} />
        <ChildActionButton entry={getChildText('common.try_again')} icon="retry" tone="primary" onClick={restartCurrentMode} />
      </nav>}
      {mode === 'npc' && <DifficultySelector selected={difficulty} onChange={setDifficulty} disabled={isNpcTurn || state.phase === 'won' || state.phase === 'draw'} />}
      </section>
    </div>
  </main>
}
