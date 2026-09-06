import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, DifficultySelector, FeedbackCard, ToolButton, type DifficultyLevel } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import {
  JUMP_CHESS_CAMP_OWNERS,
  JUMP_CHESS_CAMP_TRIANGLES,
  JUMP_CHESS_CENTER_HEX,
  JUMP_CHESS_LAYOUT_SPAN_HEIGHT,
  JUMP_CHESS_LAYOUT_SPAN_WIDTH,
  JUMP_CHESS_HOLES,
  JUMP_CHESS_STAR_OUTLINE,
  applyJumpChessMove,
  createJumpChessState,
  createJumpChessTutorialState,
  deserializeJumpChessState,
  finishJumpChessTurn,
  getJumpCampOwner,
  getJumpHole,
  getJumpPieceAt,
  getLegalJumpMoves,
  getJumpChessTutorialMoves,
  JUMP_CHESS_TUTORIAL_COUNT,
  resolveJumpForcedPasses,
  serializeJumpChessState,
  type JumpChessState,
  type JumpMove,
  type JumpPlayer,
} from './rules'
import { chooseJumpChessTurn } from './ai'
import { indexedDbJumpChessStorage, type JumpChessMode, type JumpChessStorage } from './storage'
import { WebRtcPairing } from '../../online/WebRtcPairing'
import { closeWebRtcPeerSession, type WebRtcPeerSession } from '../../online/webrtc'

const ONLINE_DISCONNECT_GRACE_MS = 5_000

interface JumpChessGameProps {
  mode?: JumpChessMode
  onBack: () => void
  storage?: JumpChessStorage
}

function playerTextId(player: JumpPlayer): string {
  return player === 'player1' ? 'jump_chess.legend_player_one' : 'jump_chess.legend_player_two'
}

function resultTextId(state: JumpChessState): string {
  if (state.winner !== null) return state.winner === 'player1' ? 'jump_chess.win_one' : 'jump_chess.win_two'
  if (state.drawReason === 'mutual-no-moves') return 'jump_chess.draw_no_moves'
  if (state.drawReason === 'threefold') return 'jump_chess.draw_threefold'
  return 'jump_chess.invalid'
}

function lastJumpCell(state: JumpChessState): number | null {
  if (state.activeJump === null) return null
  return state.activeJump.path[state.activeJump.path.length - 1] ?? null
}

function svgPoints(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function holePositionStyle(cell: number): CSSProperties {
  const hole = getJumpHole(cell)
  if (hole === null) return {}
  return {
    '--jump-hole-x': `${(hole.layoutX / JUMP_CHESS_LAYOUT_SPAN_WIDTH) * 100}%`,
    '--jump-hole-y': `${(hole.layoutY / JUMP_CHESS_LAYOUT_SPAN_HEIGHT) * 100}%`,
  } as CSSProperties
}

function nearestHoleAtPoint(clientX: number, clientY: number, bounds: DOMRect, fallbackCell: number): number {
  return JUMP_CHESS_HOLES.reduce((best, hole) => {
    const x = bounds.left + (hole.layoutX / JUMP_CHESS_LAYOUT_SPAN_WIDTH) * bounds.width
    const y = bounds.top + (hole.layoutY / JUMP_CHESS_LAYOUT_SPAN_HEIGHT) * bounds.height
    const distance = (clientX - x) ** 2 + (clientY - y) ** 2
    return distance < best.distance ? { cell: hole.cell, distance } : best
  }, { cell: fallbackCell, distance: Number.POSITIVE_INFINITY }).cell
}

function directionVector(key: string): readonly [number, number] | null {
  if (key === 'ArrowUp') return [0, -1]
  if (key === 'ArrowDown') return [0, 1]
  if (key === 'ArrowLeft') return [-1, 0]
  if (key === 'ArrowRight') return [1, 0]
  return null
}

export function JumpChessGame({ mode = 'npc', onBack, storage = indexedDbJumpChessStorage }: JumpChessGameProps) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [tutorialStep, setTutorialStep] = useState(0)
  const [tutorialComplete, setTutorialComplete] = useState(false)
  const [state, setState] = useState<JumpChessState>(() => mode === 'adventure' ? createJumpChessTutorialState(0) : createJumpChessState())
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [feedbackId, setFeedbackId] = useState('jump_chess.turn_one')
  const [isPaused, setIsPaused] = useState(false)
  const [isHydrated, setIsHydrated] = useState(mode === 'online')
  const [onlineSession, setOnlineSession] = useState<WebRtcPeerSession | null>(null)
  const [onlineDisconnected, setOnlineDisconnected] = useState(false)
  const holeRefs = useRef(new Map<number, HTMLButtonElement>())
  const spokenFeedback = useRef<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const { isPaused: isSpeechPaused, isSupported, speak, togglePause } = useSpeech()

  const tutorialMoves = useMemo(() => mode === 'adventure' ? getJumpChessTutorialMoves(tutorialStep) : [], [mode, tutorialStep])
  const expectedTutorialMove = mode === 'adventure' && !tutorialComplete
    ? tutorialMoves[state.activeJump === null ? 0 : state.activeJump.path.length - 1] ?? null
    : null
  const legalMoves = useMemo(() => {
    const moves = getLegalJumpMoves(state)
    if (mode === 'adventure' && !tutorialComplete && expectedTutorialMove === null) return []
    if (expectedTutorialMove === null) return moves
    return moves.filter((move) => move.from === expectedTutorialMove.from && move.to === expectedTutorialMove.to && move.kind === expectedTutorialMove.kind)
  }, [expectedTutorialMove, mode, state, tutorialComplete])
  const selectedMoves = selectedCell === null
    ? []
    : legalMoves.filter((move) => move.from === selectedCell)
  const selectedTargets = useMemo(() => new Set(selectedMoves.map((move) => move.to)), [selectedMoves])
  const isFinished = state.phase !== 'playing'
  const isNpcThinking = mode === 'npc' && state.phase === 'playing' && state.currentPlayer === 'player2'
  const localPlayer = onlineSession?.role === 'host' ? 'player1' : 'player2'
  const isOnlineWaiting = mode === 'online' && (onlineSession === null || onlineDisconnected || state.currentPlayer !== localPlayer)
  const locked = isPaused || isFinished || isNpcThinking || isOnlineWaiting || (mode === 'adventure' && tutorialComplete)
  const boardStyle = {
    '--jump-board-ratio': `${JUMP_CHESS_LAYOUT_SPAN_WIDTH} / ${JUMP_CHESS_LAYOUT_SPAN_HEIGHT}`,
  } as CSSProperties
  const boardOutlineTransform = `translate(${JUMP_CHESS_LAYOUT_SPAN_WIDTH / 2} ${JUMP_CHESS_LAYOUT_SPAN_HEIGHT / 2}) scale(1.12) translate(${-JUMP_CHESS_LAYOUT_SPAN_WIDTH / 2} ${-JUMP_CHESS_LAYOUT_SPAN_HEIGHT / 2})`
  const currentFeedback = getChildText(feedbackId)
  const tutorialInstruction = getChildText(tutorialComplete
    ? tutorialStep === JUMP_CHESS_TUTORIAL_COUNT - 1 ? 'jump_chess.tutorial_done' : 'jump_chess.tutorial_success'
    : `jump_chess.tutorial_${tutorialStep + 1}`)
  const activeJumpCell = lastJumpCell(state)

  useEffect(() => {
    let active = true
    if (mode === 'online') {
      setIsHydrated(true)
      return () => { active = false }
    }
    void storage.load(mode).then((session) => {
      if (!active || session === null) return
      setDifficulty(session.difficulty)
      setTutorialStep(Math.max(0, Math.min(JUMP_CHESS_TUTORIAL_COUNT - 1, session.tutorialStep)))
      setTutorialComplete(mode === 'adventure' && session.tutorialComplete)
      setState(session.state)
      setSelectedCell(session.state.activeJump?.path.at(-1) ?? null)
      setFeedbackId(session.state.phase === 'playing'
        ? mode === 'adventure' ? `jump_chess.tutorial_${Math.min(6, session.tutorialStep + 1)}` : mode === 'npc' && session.state.currentPlayer === 'player2' ? 'jump_chess.npc_thinking' : session.state.currentPlayer === 'player1' ? 'jump_chess.turn_one' : 'jump_chess.turn_two'
        : resultTextId(session.state))
    }).finally(() => {
      if (active) setIsHydrated(true)
    })
    return () => { active = false }
  }, [mode, storage])

  useEffect(() => {
    if (!isHydrated || mode === 'online') return
    void storage.save(mode, { difficulty, tutorialStep, tutorialComplete, state })
  }, [difficulty, isHydrated, mode, state, storage, tutorialComplete, tutorialStep])

  useEffect(() => {
    if (mode !== 'online' || onlineSession === null) return
    const { channel, connection, role, sessionId } = onlineSession
    let active = true
    let disconnectTimer: number | null = null
    const clearDisconnectTimer = () => {
      if (disconnectTimer === null) return
      window.clearTimeout(disconnectTimer)
      disconnectTimer = null
    }
    const sendState = () => {
      if (!active || channel.readyState !== 'open') return
      channel.send(JSON.stringify({ type: 'state', sessionId, serializedState: serializeJumpChessState(stateRef.current) }))
    }
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const message: unknown = JSON.parse(event.data)
        if (typeof message !== 'object' || message === null || Array.isArray(message)) return
        const candidate = message as Record<string, unknown>
        if (candidate.sessionId !== sessionId) return
        if (candidate.type === 'request-state' && role === 'host') {
          sendState()
          return
        }
        if (candidate.type !== 'state' || typeof candidate.serializedState !== 'string') return
        const next = deserializeJumpChessState(candidate.serializedState)
        stateRef.current = next
        setState(next)
        setSelectedCell(next.activeJump?.path.at(-1) ?? null)
        setFeedbackId(next.phase === 'playing'
          ? next.currentPlayer === localPlayer ? 'jump_chess.turn_one' : 'jump_chess.turn_two'
          : resultTextId(next))
        setOnlineDisconnected(false)
        spokenFeedback.current = null
      } catch {
        setFeedbackId('jump_chess.invalid')
      }
    }
    const handleConnectionState = () => {
      if (connection.connectionState === 'connected' && channel.readyState !== 'closed') {
        clearDisconnectTimer()
        setOnlineDisconnected(false)
        return
      }
      if (connection.connectionState === 'disconnected') {
        if (disconnectTimer !== null) return
        disconnectTimer = window.setTimeout(() => {
          disconnectTimer = null
          if (!active || connection.connectionState !== 'disconnected') return
          setOnlineDisconnected(true)
          setFeedbackId('online.disconnected')
          spokenFeedback.current = null
        }, ONLINE_DISCONNECT_GRACE_MS)
        return
      }
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed' || channel.readyState === 'closed') {
        clearDisconnectTimer()
        setOnlineDisconnected(true)
        setFeedbackId('online.disconnected')
        spokenFeedback.current = null
      }
    }
    channel.addEventListener('message', handleMessage)
    connection.addEventListener('connectionstatechange', handleConnectionState)
    channel.addEventListener('close', handleConnectionState)
    const syncTimer = window.setTimeout(() => {
      if (role === 'host') sendState()
      else if (channel.readyState === 'open') channel.send(JSON.stringify({ type: 'request-state', sessionId }))
    }, 120)
    return () => {
      active = false
      window.clearTimeout(syncTimer)
      clearDisconnectTimer()
      channel.removeEventListener('message', handleMessage)
      connection.removeEventListener('connectionstatechange', handleConnectionState)
      channel.removeEventListener('close', handleConnectionState)
    }
  }, [localPlayer, mode, onlineSession])

  useEffect(() => () => {
    if (onlineSession !== null) closeWebRtcPeerSession(onlineSession)
  }, [onlineSession])

  useEffect(() => {
    if (!isSupported || spokenFeedback.current === feedbackId) return
    if (mode === 'npc' && state.phase === 'playing' && state.currentPlayer === 'player2') return
    spokenFeedback.current = feedbackId
    speak(currentFeedback)
  }, [currentFeedback, feedbackId, isSupported, mode, speak, state.currentPlayer, state.phase])

  useEffect(() => {
    if (mode !== 'npc' || isPaused || state.phase !== 'playing' || state.currentPlayer !== 'player2') return
    const timer = window.setTimeout(() => {
      try {
        const plan = chooseJumpChessTurn(state, difficulty, state.seed + state.turns.length * 97)
        let next = state
        for (const move of plan) {
          if (next.phase !== 'playing') break
          next = applyJumpChessMove(next, move)
        }
        if (next.phase === 'playing' && next.activeJump !== null) next = finishJumpChessTurn(next)
        if (plan.length === 0) next = resolveJumpForcedPasses(next)
        setState(next)
        setSelectedCell(null)
        setFeedbackId(next.phase === 'playing' ? 'jump_chess.turn_one' : resultTextId(next))
        spokenFeedback.current = null
      } catch {
        setFeedbackId('jump_chess.invalid')
      }
    }, 420)
    return () => window.clearTimeout(timer)
  }, [difficulty, isPaused, mode, state])

  function resetGame() {
    if (mode === 'online' && localPlayer !== 'player1') return
    const next = mode === 'adventure' ? createJumpChessTutorialState(tutorialStep) : createJumpChessState()
    commitState(next)
    setSelectedCell(null)
    setTutorialComplete(false)
    setFeedbackId(mode === 'adventure' ? `jump_chess.tutorial_${tutorialStep + 1}` : 'jump_chess.turn_one')
    setIsPaused(false)
    spokenFeedback.current = null
  }

  function commitState(next: JumpChessState) {
    stateRef.current = next
    setState(next)
    if (mode === 'online' && onlineSession?.channel.readyState === 'open') {
      onlineSession.channel.send(JSON.stringify({
        type: 'state',
        sessionId: onlineSession.sessionId,
        serializedState: serializeJumpChessState(next),
      }))
    }
  }

  function toggleGamePause() {
    setIsPaused((value) => !value)
    // 跳棋只保留共用的「暫停」鍵；棋局與目前語音同步暫停，避免兒童需要辨認兩個暫停功能。
    if (isSpeechPaused) togglePause()
    else if (!isPaused) togglePause()
  }

  function setMoveFeedback(next: JumpChessState, move: JumpMove, wasJumping: boolean) {
    if (next.phase !== 'playing') {
      setFeedbackId(resultTextId(next))
      setSelectedCell(null)
      return
    }
    if (next.activeJump !== null) {
      setSelectedCell(lastJumpCell(next))
      setFeedbackId('jump_chess.jump_continue')
      return
    }
    setSelectedCell(null)
    setFeedbackId(mode === 'npc' && next.currentPlayer === 'player2'
      ? 'jump_chess.npc_thinking'
      : wasJumping || move.kind === 'jump'
        ? 'jump_chess.jump_done'
        : next.currentPlayer === 'player1' ? 'jump_chess.turn_one' : 'jump_chess.turn_two')
  }

  function selectCell(cell: number) {
    if (locked) return

    if (mode === 'adventure' && expectedTutorialMove !== null) {
      if (selectedCell === null && cell !== expectedTutorialMove.from) {
        setFeedbackId(`jump_chess.tutorial_${tutorialStep + 1}`)
        return
      }
      if (selectedCell !== null && cell !== expectedTutorialMove.to && cell !== selectedCell) {
        setFeedbackId('jump_chess.choose_target')
        return
      }
    }

    if (selectedCell !== null && selectedTargets.has(cell)) {
      const move = selectedMoves.find((candidate) => candidate.to === cell)
      if (move === undefined) return
      try {
        let next = applyJumpChessMove(state, move)
        if (mode === 'adventure') {
          if (tutorialStep === 4) {
            commitState(next)
            setSelectedCell(lastJumpCell(next))
            setFeedbackId(next.activeJump !== null && next.activeJump.path.length - 1 < tutorialMoves.length
              ? 'jump_chess.tutorial_5'
              : 'jump_chess.tutorial_5_end')
            spokenFeedback.current = null
            return
          }
          if (move.kind === 'jump' && next.activeJump !== null) next = finishJumpChessTurn(next)
          commitState(next)
          setSelectedCell(null)
          setTutorialComplete(true)
          setFeedbackId(tutorialStep === JUMP_CHESS_TUTORIAL_COUNT - 1 ? 'jump_chess.tutorial_done' : 'jump_chess.tutorial_success')
          spokenFeedback.current = null
          return
        }
        commitState(next)
        setMoveFeedback(next, move, state.activeJump !== null)
        spokenFeedback.current = null
      } catch {
        setFeedbackId('jump_chess.invalid')
      }
      return
    }

    if (state.activeJump !== null && cell !== activeJumpCell) {
      setFeedbackId('jump_chess.choose_target')
      return
    }

    const piece = getJumpPieceAt(state, cell)
    if (piece?.owner === state.currentPlayer) {
      setSelectedCell(cell)
      setFeedbackId('jump_chess.choose_target')
      return
    }

    setFeedbackId('jump_chess.invalid')
  }

  function endJump() {
    if (locked || state.activeJump === null) return
    if (mode === 'adventure' && tutorialStep === 4 && state.activeJump.path.length - 1 < tutorialMoves.length) {
      setFeedbackId('jump_chess.tutorial_5')
      return
    }
    try {
      const next = finishJumpChessTurn(state)
      commitState(next)
      setSelectedCell(null)
      if (mode === 'adventure') {
        setTutorialComplete(true)
        setFeedbackId('jump_chess.tutorial_success')
      } else {
        setFeedbackId(next.phase === 'playing'
          ? mode === 'npc' && next.currentPlayer === 'player2' ? 'jump_chess.npc_thinking' : next.currentPlayer === 'player1' ? 'jump_chess.turn_one' : 'jump_chess.turn_two'
          : resultTextId(next))
      }
      spokenFeedback.current = null
    } catch {
      setFeedbackId('jump_chess.invalid')
    }
  }

  function advanceTutorial() {
    if (mode !== 'adventure' || !tutorialComplete) return
    const nextStep = tutorialStep + 1 >= JUMP_CHESS_TUTORIAL_COUNT ? 0 : tutorialStep + 1
    setTutorialStep(nextStep)
    setTutorialComplete(false)
    setState(createJumpChessTutorialState(nextStep))
    setSelectedCell(null)
    setFeedbackId(`jump_chess.tutorial_${nextStep + 1}`)
    spokenFeedback.current = null
  }

  function changeDifficulty(level: DifficultyLevel) {
    setDifficulty(level)
    setFeedbackId(`difficulty.${level}`)
    spokenFeedback.current = null
    speak(getChildText(`difficulty.${level}`))
  }

  function focusHole(cell: number) {
    holeRefs.current.get(cell)?.focus()
  }

  function findDirectionalHole(cell: number, key: string): number | null {
    const vector = directionVector(key)
    const origin = getJumpHole(cell)
    if (vector === null || origin === null) return null

    let best: { cell: number; score: number } | null = null
    for (const candidateCell of getJumpHole(cell) === null ? [] : JUMP_CHESS_HOLES.map((hole) => hole.cell)) {
      if (candidateCell === cell) continue
      const candidate = getJumpHole(candidateCell)
      if (candidate === null) continue
      const dx = candidate.layoutX - origin.layoutX
      const dy = candidate.layoutY - origin.layoutY
      const dot = dx * vector[0] + dy * vector[1]
      if (dot <= 0) continue
      const perpendicular = Math.abs(dx * vector[1] - dy * vector[0])
      const score = dot * 100 - perpendicular * 8 - dx * dx - dy * dy
      if (best === null || score > best.score) best = { cell: candidateCell, score }
    }
    return best?.cell ?? null
  }

  function handleHoleKeyDown(event: KeyboardEvent<HTMLButtonElement>, cell: number) {
    const next = findDirectionalHole(cell, event.key)
    if (next === null) return
    event.preventDefault()
    focusHole(next)
  }

  function handleHoleClick(event: MouseEvent<HTMLButtonElement>, fallbackCell: number) {
    // 低高度畫面會讓 121 個棋孔的視覺間距小於觸控目標；以實際指標座標選最近棋孔，避免重疊按鈕把誤觸送到上層棋孔。
    if (event.detail === 0 || event.clientX === 0 && event.clientY === 0) {
      selectCell(fallbackCell)
      return
    }

    const board = event.currentTarget.parentElement
    if (board === null) {
      selectCell(fallbackCell)
      return
    }
    const bounds = board.getBoundingClientRect()
    selectCell(nearestHoleAtPoint(event.clientX, event.clientY, bounds, fallbackCell))
  }

  function handleBoardPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const cell = nearestHoleAtPoint(event.clientX, event.clientY, bounds, JUMP_CHESS_HOLES[0]?.cell ?? 0)
    event.preventDefault()
    selectCell(cell)
  }

  function holeLabel(cell: number): string {
    const piece = getJumpPieceAt(state, cell)
    if (piece !== null) return `${getChildText(playerTextId(piece.owner)).text_zh_tw}${getChildText('jump_chess.title').text_zh_tw}`
    if (getJumpCampOwner(cell) !== null) return getChildText('jump_chess.target_camp').text_zh_tw
    return getChildText('jump_chess.empty').text_zh_tw
  }

  const handleOnlineConnected = useCallback((session: WebRtcPeerSession) => {
    setOnlineSession(session)
    setOnlineDisconnected(false)
    setFeedbackId(session.role === 'host' ? 'jump_chess.turn_one' : 'jump_chess.turn_one')
    spokenFeedback.current = null
  }, [])

  if (mode === 'online' && onlineSession === null) {
    return <WebRtcPairing onBack={onBack} onConnected={handleOnlineConnected} />
  }

  return (
    <main className={`jump-chess-game jump-chess-game--${mode}`}>
      <section className="jump-chess-game__frame" aria-label={getChildText('jump_chess.title').text_zh_tw}>
        <header className="jump-chess-game__header">
          <div className="jump-chess-game__heading">
            <span className="jump-chess-game__heading-icon" aria-hidden="true">✦</span>
            <BopomofoText as="h1" className="jump-chess-game__title" entry={getChildText('jump_chess.title')} />
          </div>
          <div className="jump-chess-game__turn-count" aria-live="polite">
            <BopomofoText entry={getChildText('jump_chess.turn_count')} />
            <strong>{state.turnCount}</strong>
          </div>
        </header>

        <div className="jump-chess-game__layout">
          <section className="jump-chess-board-panel" aria-labelledby="jump-chess-board-heading">
            <div className="jump-chess-board-panel__status" id="jump-chess-board-heading">
              <FeedbackCard entry={mode === 'adventure' ? tutorialInstruction : currentFeedback} tone={isFinished || tutorialComplete ? 'positive' : 'hint'} />
            </div>
            <div className="jump-chess-board-shell">
            <div
              className="jump-chess-board"
              role="grid"
              aria-label={getChildText('jump_chess.title').text_zh_tw}
              style={boardStyle}
              onPointerDown={handleBoardPointerDown}
            >
                <svg
                  className="jump-chess-board__guide"
                  viewBox={`0 0 ${JUMP_CHESS_LAYOUT_SPAN_WIDTH} ${JUMP_CHESS_LAYOUT_SPAN_HEIGHT}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polygon
                    className="jump-chess-board__star"
                    points={svgPoints(JUMP_CHESS_STAR_OUTLINE)}
                    transform={boardOutlineTransform}
                  />
                  {JUMP_CHESS_CAMP_TRIANGLES.map((triangle, campIndex) => {
                    const owner = JUMP_CHESS_CAMP_OWNERS[campIndex]
                    const campClass = owner === 'player1' ? 'one' : owner === 'player2' ? 'two' : 'neutral'
                    return (
                      <polygon
                        key={`camp-fill-${campIndex}`}
                        className={`jump-chess-board__camp jump-chess-board__camp--${campClass}`}
                        points={svgPoints(triangle)}
                      />
                    )
                  })}
                  <polygon className="jump-chess-board__center" points={svgPoints(JUMP_CHESS_CENTER_HEX)} />
                  <polygon
                    className="jump-chess-board__star-outline"
                    points={svgPoints(JUMP_CHESS_STAR_OUTLINE)}
                    transform={boardOutlineTransform}
                  />
                </svg>
                {JUMP_CHESS_HOLES.map((hole) => {
                  const piece = getJumpPieceAt(state, hole.cell)
                  const isSelected = selectedCell === hole.cell
                  const isTarget = selectedTargets.has(hole.cell)
                  const pathIndex = state.activeJump?.path.lastIndexOf(hole.cell) ?? -1
                  const isTutorialSource = mode === 'adventure' && !tutorialComplete && expectedTutorialMove?.from === hole.cell
                  const holeClasses = [
                    'jump-chess-hole',
                    hole.campOwner === 'player1' ? 'jump-chess-hole--camp-one' : '',
                    hole.campOwner === 'player2' ? 'jump-chess-hole--camp-two' : '',
                    piece?.owner === 'player1' ? 'jump-chess-hole--player-one' : '',
                    piece?.owner === 'player2' ? 'jump-chess-hole--player-two' : '',
                    isSelected ? 'jump-chess-hole--selected' : '',
                    isTarget ? 'jump-chess-hole--target' : '',
                    isTutorialSource ? 'jump-chess-hole--tutorial-source' : '',
                    pathIndex >= 0 ? 'jump-chess-hole--path' : '',
                  ].filter(Boolean).join(' ')

                  return (
                    <button
                      key={hole.cell}
                      disabled={locked}
                      ref={(element) => {
                        if (element === null) holeRefs.current.delete(hole.cell)
                        else holeRefs.current.set(hole.cell, element)
                      }}
                      className={holeClasses}
                      style={holePositionStyle(hole.cell)}
                      type="button"
                      data-cell={hole.cell}
                      aria-label={holeLabel(hole.cell)}
                      aria-pressed={isSelected}
                      onClick={(event) => handleHoleClick(event, hole.cell)}
                      onKeyDown={(event) => handleHoleKeyDown(event, hole.cell)}
                    >
                      <span className="jump-chess-hole__well" aria-hidden="true" />
                      {piece !== null && (
                        <span
                          className={`jump-chess-piece jump-chess-piece--${piece.owner === 'player1' ? 'player-one' : 'player-two'}`}
                          aria-hidden="true"
                        >
                          <span className="jump-chess-piece__glyph">{piece.owner === 'player1' ? '●' : '◆'}</span>
                        </span>
                      )}
                      {isTarget && piece === null && <span className="jump-chess-hole__target-mark" aria-hidden="true">✦</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="jump-chess-board-panel__hint">
              <BopomofoText entry={getChildText('jump_chess.board_hint')} />
            </div>
          </section>

          <aside className="jump-chess-controls">
            <div className="jump-chess-player-legend" aria-live="polite">
              <div className={`jump-chess-player jump-chess-player--one ${state.currentPlayer === 'player1' && !isFinished ? 'is-active' : ''}`}>
                <span className="jump-chess-player__mark" aria-hidden="true">●</span>
                <BopomofoText entry={getChildText('jump_chess.legend_player_one')} />
              </div>
              <div className={`jump-chess-player jump-chess-player--two ${state.currentPlayer === 'player2' && !isFinished ? 'is-active' : ''}`}>
                <span className="jump-chess-player__mark" aria-hidden="true">◆</span>
                <BopomofoText entry={getChildText('jump_chess.legend_player_two')} />
              </div>
            </div>

            {mode === 'npc' ? <DifficultySelector selected={difficulty} onChange={changeDifficulty} disabled={isPaused || isFinished} /> : null}
            {mode === 'adventure' ? (
              <div className="jump-chess-tutorial-card">
                <div className="jump-chess-tutorial-card__progress">
                  <BopomofoText entry={getChildText('jump_chess.tutorial_badge')} />
                  <strong>{tutorialStep + 1} / {JUMP_CHESS_TUTORIAL_COUNT}</strong>
                </div>
                <BopomofoText className="jump-chess-tutorial-card__title" entry={getChildText(`jump_chess.tutorial_${tutorialStep + 1}`)} />
                <div className="jump-chess-tutorial-card__goal">
                  <BopomofoText entry={getChildText('jump_chess.tutorial_goal')} />
                  <strong>{state.activeJump === null ? 1 : state.activeJump.path.length} / {tutorialMoves.length + 1}</strong>
                </div>
                <BopomofoText className="jump-chess-tutorial-card__guide" entry={getChildText(`jump_chess.tutorial_guide_${tutorialStep + 1}`)} />
              </div>
            ) : null}

            <div className="jump-chess-controls__card">
              <BopomofoText entry={getChildText('jump_chess.target_camp')} />
              <BopomofoText className="jump-chess-controls__hint" entry={getChildText('jump_chess.camp_hint')} />
            </div>

            <div className="jump-chess-actions">
              {state.activeJump !== null && (mode !== 'adventure' || tutorialStep === 4) && (
                <ChildActionButton
                  className="jump-chess-finish-action"
                  entry={getChildText('jump_chess.finish_jump')}
                  icon="target"
                  tone="primary"
                  onClick={endJump}
                />
              )}
              {mode === 'adventure' && tutorialComplete ? <ChildActionButton entry={getChildText(tutorialStep === JUMP_CHESS_TUTORIAL_COUNT - 1 ? 'jump_chess.tutorial_restart' : 'jump_chess.next')} icon={tutorialStep === JUMP_CHESS_TUTORIAL_COUNT - 1 ? 'retry' : 'target'} tone="primary" onClick={advanceTutorial} /> : null}
              <ChildActionButton
                entry={getChildText('common.try_again')}
                icon="retry"
                tone="secondary"
                disabled={mode === 'online' && localPlayer !== 'player1'}
                onClick={resetGame}
              />
            </div>

            <div className="jump-chess-tools">
              <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
              <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(currentFeedback)} />
              <ToolButton
                entry={getChildText(isPaused ? 'common.resume' : 'common.pause')}
                icon="pause"
                aria-pressed={isPaused || isSpeechPaused}
                onClick={toggleGamePause}
              />
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
