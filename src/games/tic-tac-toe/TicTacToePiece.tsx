import type { TicTacToePlayer } from './rules'

export function TicTacToePiece({ player }: { player: TicTacToePlayer }) {
  if (player === 'x') {
    return (
      <svg className="tictactoe-piece-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <rect className="tictactoe-piece-art__base tictactoe-piece-art__base--star" x="7" y="7" width="86" height="86" rx="24" />
        <path className="tictactoe-piece-art__shine" d="M23 16h42c-22 5-36 15-48 32V24a8 8 0 0 1 6-8Z" />
        <path className="tictactoe-piece-art__star" d="m50 20 9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3Z" />
      </svg>
    )
  }

  return (
    <svg className="tictactoe-piece-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle className="tictactoe-piece-art__base tictactoe-piece-art__base--moon" cx="50" cy="50" r="43" />
      <path className="tictactoe-piece-art__shine" d="M20 27c11-13 27-18 44-14-21 7-35 20-43 39-4-8-4-17-1-25Z" />
      <circle className="tictactoe-piece-art__moon" cx="45" cy="49" r="30" />
      <circle className="tictactoe-piece-art__moon-cutout" cx="59" cy="38" r="21" />
      <circle className="tictactoe-piece-art__moon-dot" cx="31" cy="61" r="3.5" />
    </svg>
  )
}

export function TicTacToeCandidate() {
  return (
    <svg className="tictactoe-candidate-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="39" />
      <path d="m50 24 6.8 17.2L74 48l-17.2 6.8L50 72l-6.8-17.2L26 48l17.2-6.8Z" />
    </svg>
  )
}
