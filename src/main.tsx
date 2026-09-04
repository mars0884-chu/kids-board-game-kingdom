import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './games/reversi/reversi-art-proposal-r02.css'
import './gomoku-overrides.css'
import './games/dark-chess/dark-chess-verification.css'
import './games/dark-chess/dark-chess-game.css'
import './games/animal-chess/animal-chess.css'
import './games/jump-chess/jump-chess.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('找不到應用程式根節點。')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
