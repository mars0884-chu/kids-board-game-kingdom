import { useMemo, useState, type MouseEvent } from 'react'
import type { DifficultyLevel } from '../../components/common-ui'
import { chooseDarkChessAction } from './ai'
import {
  DARK_CHESS_AUTO_DRAW_STEPS,
  DARK_CHESS_BOARD_CELLS,
  DARK_CHESS_BOARD_HEIGHT,
  DARK_CHESS_BOARD_WIDTH,
  DARK_CHESS_NPC_DRAW_ACCEPT_STEPS,
  applyDarkChessAction,
  createDarkChessState,
  getLegalDarkChessActions,
  getNpcDrawResponse,
  getPieceAt,
  type DarkChessAction,
  type DarkChessCell,
  type DarkChessColor,
  type DarkChessPieceKind,
  type DarkChessPlayer,
  type DarkChessState,
} from './rules'
import { indexedDbDarkChessStorage } from './storage'

interface DarkChessVerificationProps {
  onBack: () => void
}

type FixtureKind = 'quiet-39' | 'quiet-40' | 'quiet-49' | 'flip-reset' | 'capture-reset'

const pieceNames: Readonly<Record<DarkChessPieceKind, readonly [string, string]>> = {
  general: ['帥', '將'],
  advisor: ['仕', '士'],
  elephant: ['相', '象'],
  chariot: ['俥', '車'],
  horse: ['傌', '馬'],
  cannon: ['炮', '包'],
  soldier: ['兵', '卒'],
}

function colorName(color: DarkChessColor | null): string {
  return color === 'red' ? '紅方' : color === 'black' ? '黑方' : '尚未定陣營'
}

function playerName(player: DarkChessPlayer): string {
  return player === 'player1' ? '玩家一' : '玩家二／NPC'
}

function pieceName(kind: DarkChessPieceKind, color: DarkChessColor): string {
  return pieceNames[kind][color === 'red' ? 0 : 1]
}

function pieceLabel(state: DarkChessState, cell: number): string {
  const piece = getPieceAt(state, cell)
  if (piece === null) return '空格'
  return piece.revealed ? `${colorName(piece.color)}${pieceName(piece.kind, piece.color)}` : '暗棋，尚未翻開'
}

function placedFixture(quietStreak: number, placed: readonly { id: string; cell: number; revealed: boolean }[]): DarkChessState {
  const base = createDarkChessState(0x4b1d2e3f)
  const board: DarkChessCell[] = Array.from({ length: DARK_CHESS_BOARD_CELLS }, () => null)
  for (const piece of placed) board[piece.cell] = piece.id

  return {
    ...base,
    board,
    pieces: base.pieces.map((piece) => {
      const setup = placed.find((candidate) => candidate.id === piece.id)
      return setup === undefined ? piece : { ...piece, revealed: setup.revealed }
    }),
    currentPlayer: 'player1',
    playerColors: { player1: 'red', player2: 'black' },
    quietStreak,
    turns: [],
    drawOffer: null,
  }
}

function createFixture(kind: FixtureKind): DarkChessState {
  if (kind === 'flip-reset') {
    const state = createDarkChessState(0x4b1d2e3f)
    return { ...state, quietStreak: 12 }
  }

  if (kind === 'capture-reset') {
    return placedFixture(12, [
      { id: 'red-chariot-1', cell: 0, revealed: true },
      { id: 'black-horse-1', cell: 1, revealed: true },
      { id: 'black-soldier-1', cell: 31, revealed: true },
    ])
  }

  const quietStreak = kind === 'quiet-39'
    ? DARK_CHESS_NPC_DRAW_ACCEPT_STEPS - 1
    : kind === 'quiet-40'
      ? DARK_CHESS_NPC_DRAW_ACCEPT_STEPS
      : DARK_CHESS_AUTO_DRAW_STEPS - 1

  return placedFixture(quietStreak, [
    { id: 'red-chariot-1', cell: 0, revealed: true },
    { id: 'black-soldier-1', cell: 31, revealed: true },
  ])
}

function actionLabel(action: DarkChessAction): string {
  if (action.kind === 'flip') return '翻棋'
  if (action.kind === 'move') return '走子'
  if (action.kind === 'capture') return '吃子'
  if (action.kind === 'draw-offer') return '提議和局'
  return action.response === 'accept' ? '接受和局' : '繼續對局'
}

function lastTurnLabel(action: DarkChessState['turns'][number]): string {
  if (action.kind === 'flip') return `${playerName(action.player)}：翻開第 ${action.cell + 1} 格`
  if (action.kind === 'move') return `${playerName(action.player)}：走子 ${action.from + 1} → ${action.to + 1}`
  if (action.kind === 'capture') return `${playerName(action.player)}：吃子 ${action.from + 1} → ${action.to + 1}`
  if (action.kind === 'draw-offer') return `${playerName(action.player)}：提議和局`
  return `${playerName(action.player)}：${action.response === 'accept' ? '接受和局' : '繼續對局'}`
}

function isOwnRevealedPiece(state: DarkChessState, cell: number): boolean {
  const piece = getPieceAt(state, cell)
  const color = state.playerColors[state.currentPlayer]
  return piece !== null && piece.revealed && color !== null && piece.color === color
}

export function DarkChessVerification({ onBack }: DarkChessVerificationProps) {
  const [state, setState] = useState<DarkChessState>(() => createDarkChessState())
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [mode, setMode] = useState<'local' | 'npc'>('local')
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [message, setMessage] = useState('請先翻開任一枚暗棋；第一枚翻出的顏色會決定玩家一的陣營。')

  const legalActions = useMemo(() => getLegalDarkChessActions(state), [state])
  const legalFlips = legalActions.filter((action) => action.kind === 'flip')
  const legalMoves = legalActions.filter((action) => action.kind === 'move')
  const legalCaptures = legalActions.filter((action) => action.kind === 'capture')
  const pendingDrawResponse = state.drawOffer !== null
  const npcResponse = pendingDrawResponse ? getNpcDrawResponse(state) : null
  const currentColor = state.playerColors[state.currentPlayer]

  const setAction = (action: DarkChessAction) => {
    try {
      const next = applyDarkChessAction(state, action)
      setState(next)
      setSelectedCell(null)
      setMessage(`已執行：${actionLabel(action)}。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '這個操作目前不能執行。')
    }
  }

  const chooseCell = (cell: number) => {
    if (state.phase !== 'playing' || pendingDrawResponse) return

    const flip = legalActions.find((action) => action.kind === 'flip' && action.cell === cell)
    if (flip !== undefined) {
      setAction(flip)
      return
    }

    if (selectedCell !== null) {
      const action = legalActions.find((candidate) => (
        (candidate.kind === 'move' || candidate.kind === 'capture') &&
        candidate.from === selectedCell && candidate.to === cell
      ))
      if (action !== undefined) {
        setAction(action)
        return
      }
    }

    if (isOwnRevealedPiece(state, cell)) {
      setSelectedCell(cell)
      setMessage(`已選取第 ${cell + 1} 格的${pieceLabel(state, cell)}；請選擇合法目標格。`)
    } else {
      setSelectedCell(null)
    }
  }

  const reset = () => {
    setState(createDarkChessState())
    setSelectedCell(null)
    setMessage('已重新建立 4×8、32 枚暗棋的固定種子驗證局面。')
  }

  const loadFixture = (kind: FixtureKind) => {
    setState(createFixture(kind))
    setSelectedCell(null)
    const labels: Readonly<Record<FixtureKind, string>> = {
      'quiet-39': '已載入雙方合計 39 步局面；NPC 應回覆繼續對局。',
      'quiet-40': '已載入雙方合計 40 步局面；NPC 應接受提議和局。',
      'quiet-49': '已載入雙方合計 49 步局面；再走一個合法走子應自動和局。',
      'flip-reset': '已載入翻棋重設測試；翻開第 1 格後計數應歸零。',
      'capture-reset': '已載入吃子重設測試；吃掉第 2 格後計數應歸零。',
    }
    setMessage(labels[kind])
  }

  const respondToDraw = (response: 'accept' | 'reject') => {
    setAction({ kind: 'draw-response', response })
  }

  const runNpcAction = () => {
    const action = chooseDarkChessAction(state, difficulty, state.seed + state.turns.length + 1)
    if (action === null) {
      setMessage('NPC 目前沒有可依公開棋面執行的行動。')
      return
    }
    setAction(action)
  }

  const saveSession = async () => {
    await indexedDbDarkChessStorage.save('npc', {
      difficulty,
      hintLevel: 0,
      seed: state.seed,
      state,
      tutorialStep: 0,
    })
    setMessage('已嘗試保存暗棋局面；存檔只保存完整可重播資料，不會提供給 NPC 偷看。')
  }

  const loadSession = async () => {
    const session = await indexedDbDarkChessStorage.load('npc')
    if (session === null) {
      setMessage('目前沒有可載入的暗棋存檔。')
      return
    }
    setState(session.state)
    setDifficulty(session.difficulty)
    setSelectedCell(null)
    setMessage('已載入暗棋存檔，並以公開棋面供 NPC 決策。')
  }

  const handleBoardContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  const resultLabel = state.phase === 'draw'
    ? state.drawReason === 'automatic-50-steps' ? '自動和局（50 步）' : '合意和局'
    : state.phase === 'won'
      ? `${colorName(state.playerColors[state.winner === 'player1' ? 'player1' : 'player2'])}獲勝`
      : null

  return (
    <main className="dark-chess-verification" aria-label="暗棋規則驗證預覽">
      <section className="dark-chess-verification__frame">
        <section className="dark-chess-verification__board-panel">
          <header className="dark-chess-verification__mobile-header">
            <div>
              <p className="dark-chess-verification__eyebrow">V080-ENGINE／開發驗證</p>
              <h1>暗棋規則驗證預覽</h1>
            </div>
            <button className="dark-chess-verification__compact-button" type="button" onClick={onBack}>返回首頁</button>
          </header>
          <div
            className="dark-chess-board"
            role="grid"
            aria-label="暗棋 4×8 棋盤"
            aria-rowcount={DARK_CHESS_BOARD_HEIGHT}
            aria-colcount={DARK_CHESS_BOARD_WIDTH}
            onContextMenu={handleBoardContextMenu}
          >
            {Array.from({ length: DARK_CHESS_BOARD_CELLS }, (_, cell) => {
              const piece = getPieceAt(state, cell)
              const isHidden = piece !== null && !piece.revealed
              const isSelected = selectedCell === cell
              const isLegalFlip = legalFlips.some((action) => action.kind === 'flip' && action.cell === cell)
              const isLegalTarget = selectedCell !== null && legalActions.some((action) => (
                (action.kind === 'move' || action.kind === 'capture') && action.from === selectedCell && action.to === cell
              ))
              const isSelectable = isOwnRevealedPiece(state, cell)
              const isEnabled = isLegalFlip || isLegalTarget || isSelectable
              const className = [
                'dark-chess-cell',
                isHidden ? 'dark-chess-cell--hidden' : '',
                piece?.revealed ? `dark-chess-cell--${piece.color}` : '',
                isSelected ? 'dark-chess-cell--selected' : '',
                isLegalTarget ? 'dark-chess-cell--target' : '',
                isLegalFlip ? 'dark-chess-cell--flip' : '',
              ].filter(Boolean).join(' ')

              return (
                <button
                  key={cell}
                  className={className}
                  type="button"
                  role="gridcell"
                  aria-rowindex={Math.floor(cell / DARK_CHESS_BOARD_WIDTH) + 1}
                  aria-colindex={(cell % DARK_CHESS_BOARD_WIDTH) + 1}
                  aria-label={`第 ${cell + 1} 格，${pieceLabel(state, cell)}`}
                  disabled={state.phase !== 'playing' || pendingDrawResponse || !isEnabled}
                  onClick={() => chooseCell(cell)}
                >
                  {piece === null ? null : isHidden ? <span className="dark-chess-cell__back">暗</span> : <span className="dark-chess-cell__piece">{pieceName(piece.kind, piece.color)}</span>}
                  {isLegalFlip ? <span className="dark-chess-cell__marker" aria-hidden="true">✦</span> : null}
                </button>
              )
            })}
          </div>
          <p className="dark-chess-verification__board-note">暗棋背面保持未知；亮起星號的格子可翻棋。</p>
        </section>

        <aside className="dark-chess-verification__controls">
          <header className="dark-chess-verification__header">
            <div>
              <p className="dark-chess-verification__eyebrow">V080-ENGINE／開發驗證</p>
              <h1>暗棋規則驗證預覽</h1>
              <p className="dark-chess-verification__warning">這是可操作的規則驗證畫面，不是正式兒童美術。</p>
            </div>
            <button className="dark-chess-verification__compact-button" type="button" onClick={onBack}>返回首頁</button>
          </header>

          <section className="dark-chess-verification__status" aria-live="polite">
            <div className="dark-chess-verification__status-row"><span>目前回合</span><strong>{playerName(state.currentPlayer)}</strong></div>
            <div className="dark-chess-verification__status-row"><span>目前陣營</span><strong>{colorName(currentColor)}</strong></div>
            <div className="dark-chess-verification__status-row"><span>連續未翻／未吃</span><strong>{state.quietStreak}／{DARK_CHESS_AUTO_DRAW_STEPS}</strong></div>
            <div className="dark-chess-verification__status-row"><span>棋盤暗棋</span><strong>{state.board.filter((id) => id !== null && !state.pieces.find((piece) => piece.id === id)?.revealed).length} 枚</strong></div>
          </section>

          <p className="dark-chess-verification__message" role="status">{resultLabel ?? message}</p>

          {pendingDrawResponse ? (
            <section className="dark-chess-verification__draw-response" aria-label="和局提議回應">
              <strong>{mode === 'npc' ? `NPC 預計回覆：${npcResponse === 'accept' ? '接受和局' : '繼續對局'}` : '請由另一位玩家回應和局提議'}</strong>
              <div className="dark-chess-verification__button-row">
                <button type="button" onClick={() => respondToDraw('accept')}>接受和局</button>
                <button type="button" onClick={() => respondToDraw('reject')}>繼續對局</button>
              </div>
              {mode === 'npc' ? <button className="dark-chess-verification__npc-button" type="button" onClick={() => respondToDraw(npcResponse ?? 'reject')}>套用 NPC 回覆</button> : null}
            </section>
          ) : null}

          <section className="dark-chess-verification__rules" aria-label="規則即時檢查">
            <h2>已接入規則</h2>
            <ul>
              <li>4×8 棋盤／32 枚棋子</li>
              <li>翻棋、上下左右走子、階級吃子與炮架吃子</li>
              <li>共用計數器：翻棋／吃子歸零，走子加一</li>
              <li>雙方合計 50 步自動和局</li>
              <li>NPC 自雙方合計 40 步接受提和</li>
              <li>雙人同樂接受提和不受 40 步限制</li>
            </ul>
          </section>

          <section className="dark-chess-verification__actions" aria-label="驗證操作">
            <div className="dark-chess-verification__button-row">
              <button type="button" onClick={() => setMode('local')} aria-pressed={mode === 'local'}>雙人同樂</button>
              <button type="button" onClick={() => setMode('npc')} aria-pressed={mode === 'npc'}>NPC 提和回應</button>
            </div>
            <label className="dark-chess-verification__difficulty">
              <span>NPC 難度（四階）</span>
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultyLevel)}>
                <option value="beginner">入門</option>
                <option value="growth">成長</option>
                <option value="challenge">挑戰（一層／八候選）</option>
                <option value="adult">成人版（兩層／六候選）</option>
              </select>
            </label>
            <div className="dark-chess-verification__button-row">
              <button type="button" onClick={() => setAction({ kind: 'draw-offer' })} disabled={state.phase !== 'playing' || pendingDrawResponse}>提議和局</button>
              <button type="button" onClick={runNpcAction} disabled={mode !== 'npc' || state.phase !== 'playing' || pendingDrawResponse}>NPC 依公開資訊走一步</button>
            </div>
            <div className="dark-chess-verification__button-row">
              <button type="button" onClick={saveSession}>保存局面</button>
              <button type="button" onClick={loadSession}>載入局面</button>
            </div>
            <div className="dark-chess-verification__button-row">
              <button type="button" onClick={reset}>重新開始</button>
            </div>
          </section>

          <details className="dark-chess-verification__fixtures">
            <summary>載入快速規則測試局面</summary>
            <p>這些是開發驗證局面，方便直接查證 40／50 步，不會進入正式兒童流程。</p>
            <div className="dark-chess-verification__fixture-grid">
              <button type="button" onClick={() => loadFixture('quiet-39')}>39 步 NPC 繼續</button>
              <button type="button" onClick={() => loadFixture('quiet-40')}>40 步 NPC 接受</button>
              <button type="button" onClick={() => loadFixture('quiet-49')}>49 步再走即和</button>
              <button type="button" onClick={() => loadFixture('flip-reset')}>翻棋歸零</button>
              <button type="button" onClick={() => loadFixture('capture-reset')}>吃子歸零</button>
            </div>
          </details>

          <section className="dark-chess-verification__legal" aria-label="目前合法行動">
            <h2>目前合法行動</h2>
            <div className="dark-chess-verification__legal-grid">
              <span>翻棋 <strong>{legalFlips.length}</strong></span>
              <span>走子 <strong>{legalMoves.length}</strong></span>
              <span>吃子 <strong>{legalCaptures.length}</strong></span>
            </div>
          </section>

          <section className="dark-chess-verification__history" aria-label="最近操作">
            <h2>最近操作</h2>
            <ol>
              {state.turns.slice(-6).map((turn, index) => <li key={`${turn.kind}-${index}`}>{lastTurnLabel(turn)}</li>)}
              {state.turns.length === 0 ? <li>尚未操作</li> : null}
            </ol>
          </section>
        </aside>
      </section>
    </main>
  )
}
