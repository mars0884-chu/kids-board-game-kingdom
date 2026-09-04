import { useState } from 'react'
import homeLandscape from './assets/art-003-r03-home-landscape.webp'
import homePortrait from './assets/art-003-r03-home-portrait.webp'
import { BopomofoText } from './components/BopomofoText'
import { HomeIcon } from './components/HomeIcon'
import { CommonUiPreview } from './components/common-ui'
import { getChildText } from './content/child-text'
import { useSpeech } from './hooks/useSpeech'
import { TicTacToeProposal } from './games/tic-tac-toe/TicTacToeProposal'
import type { TicTacToeMode } from './games/tic-tac-toe/storage'
import { GomokuProposal, type GomokuMode } from './games/gomoku/GomokuProposal'
import { ReversiAdventure } from './games/reversi/ReversiAdventure'
import { ReversiArtProposal } from './games/reversi/ReversiArtProposal'
import type { ReversiMode } from './games/reversi/storage'
import { DarkChessVerification } from './games/dark-chess/DarkChessVerification'
import { DarkChessGame } from './games/dark-chess/DarkChessGame'
import type { DarkChessMode } from './games/dark-chess/storage'
import { NumberGemConnection } from './games/number-gem-connection/NumberGemConnection'
import type { NumberGemMode } from './games/number-gem-connection/storage'
import { AnimalChessGame } from './games/animal-chess/AnimalChessGame'
import type { AnimalChessMode } from './games/animal-chess/storage'
import { JumpChessGame } from './games/jump-chess/JumpChessGame'
import type { JumpChessMode } from './games/jump-chess/storage'
import { InstallButton } from './pwa/InstallButton'
import { UpdatePrompt } from './pwa/UpdatePrompt'

const homeModes = [
  { id: 'adventure', textId: 'home.adventure', icon: 'castle', tone: 'blue' },
  { id: 'practice', textId: 'home.practice', icon: 'puzzle', tone: 'mint' },
  { id: 'two-player', textId: 'home.two_player', icon: 'friends', tone: 'coral' },
  { id: 'online', textId: 'home.online', icon: 'friends', tone: 'blue' },
] as const

type HomeModeId = typeof homeModes[number]['id']
type GameId = 'tic-tac-toe' | 'gomoku' | 'reversi' | 'dark-chess' | 'number-gem' | 'animal-chess' | 'jump-chess'

const gameOptions: readonly { id: GameId; textId: 'tictactoe.title' | 'gomoku.title' | 'reversi.title' | 'dark_chess.title' | 'number_gem.title' | 'animal_chess.title' | 'jump_chess.title'; icon: 'puzzle' | 'board'; tone: 'mint' | 'coral' | 'blue' }[] = [
  { id: 'tic-tac-toe', textId: 'tictactoe.title', icon: 'puzzle', tone: 'mint' },
  { id: 'number-gem', textId: 'number_gem.title', icon: 'puzzle', tone: 'blue' },
  { id: 'animal-chess', textId: 'animal_chess.title', icon: 'board', tone: 'mint' },
  { id: 'gomoku', textId: 'gomoku.title', icon: 'board', tone: 'coral' },
  { id: 'reversi', textId: 'reversi.title', icon: 'board', tone: 'blue' },
  { id: 'dark-chess', textId: 'dark_chess.title', icon: 'board', tone: 'mint' },
  { id: 'jump-chess', textId: 'jump_chess.title', icon: 'board', tone: 'coral' },
]

export default function App() {
  const preview = new URLSearchParams(window.location.search).get('preview')
  const hasWebRtcSignal = new URLSearchParams(window.location.search).has('webrtc')
  const [showCommonUi, setShowCommonUi] = useState(
    () => preview === 'common-ui',
  )
  const [showDarkChessVerification, setShowDarkChessVerification] = useState(
    () => preview === 'dark-chess-verification',
  )
  const [darkChessMode, setDarkChessMode] = useState<DarkChessMode | null>(() => preview === 'dark-chess-adventure'
    ? 'adventure'
    : preview === 'dark-chess-art-proposal'
      ? 'adventure'
    : preview === 'dark-chess-local'
      ? 'local'
      : preview === 'dark-chess' || preview === 'dark-chess-child'
        ? 'npc'
        : null)
  const [reversiMode, setReversiMode] = useState<ReversiMode | null>(
    () => preview === 'reversi-art-proposal' ? 'local' : null,
  )
  const [numberGemMode, setNumberGemMode] = useState<NumberGemMode | null>(() => preview === 'number-gem-tutorial'
    ? 'adventure'
    : preview === 'number-gem-local'
      ? 'local'
      : preview === 'number-gem'
        ? 'npc'
        : null)
  const [animalChessMode, setAnimalChessMode] = useState<AnimalChessMode | null>(() => preview === 'animal-chess-tutorial'
    ? 'adventure'
    : preview === 'animal-chess-local'
      ? 'local'
      : preview === 'animal-chess'
        ? 'npc'
        : null)
  const [jumpChessMode, setJumpChessMode] = useState<JumpChessMode | null>(() => preview === 'jump-chess-online' || hasWebRtcSignal
    ? 'online'
    : preview === 'jump-chess-adventure'
    ? 'adventure'
    : preview === 'jump-chess-local' || preview === 'jump-chess-art-proposal'
      ? 'local'
      : preview === 'jump-chess' || preview === 'jump-chess-npc'
        ? 'npc'
      : null)
  const [selectedHomeMode, setSelectedHomeMode] = useState<HomeModeId | null>(null)
  const [ticTacToeMode, setTicTacToeMode] = useState<TicTacToeMode | null>(() => preview === 'tic-tac-toe' ? 'npc' : null)
  const [gomokuMode, setGomokuMode] = useState<GomokuMode | null>(() => preview === 'gomoku'
    ? 'npc'
    : preview === 'gomoku-art-proposal'
      ? 'npc'
    : preview === 'gomoku-tutorial'
      ? 'adventure'
      : preview === 'gomoku-local'
        ? 'local'
        : null)
  const [showComingSoon, setShowComingSoon] = useState(false)
  const { isSupported, speak } = useSpeech()
  const welcome = getChildText('home.welcome')

  const chooseMode = (modeId: HomeModeId, textId: string) => {
    setSelectedHomeMode(modeId)
    setShowComingSoon(false)
    if (isSupported) speak(getChildText(textId))
  }

  const chooseGame = (gameId: GameId) => {
    if (selectedHomeMode === null) return
    if (gameId === 'jump-chess') {
      setJumpChessMode(selectedHomeMode === 'adventure' ? 'adventure' : selectedHomeMode === 'practice' ? 'npc' : selectedHomeMode === 'online' ? 'online' : 'local')
    } else if (gameId === 'number-gem') {
      setNumberGemMode(selectedHomeMode === 'adventure'
        ? 'adventure'
        : selectedHomeMode === 'practice'
          ? 'npc'
          : 'local')
    } else if (gameId === 'animal-chess') {
      setAnimalChessMode(selectedHomeMode === 'adventure'
        ? 'adventure'
        : selectedHomeMode === 'practice'
          ? 'npc'
          : 'local')
    } else if (gameId === 'reversi') {
      setReversiMode(selectedHomeMode === 'adventure'
        ? 'adventure'
        : selectedHomeMode === 'practice'
          ? 'npc'
          : 'local')
    } else if (gameId === 'gomoku') {
      setGomokuMode(selectedHomeMode === 'adventure'
        ? 'adventure'
        : selectedHomeMode === 'practice'
          ? 'npc'
          : 'local')
    } else if (gameId === 'tic-tac-toe') {
      setTicTacToeMode(selectedHomeMode === 'adventure'
        ? 'tutorial'
        : selectedHomeMode === 'practice'
          ? 'npc'
          : 'local')
    } else {
      setDarkChessMode(selectedHomeMode === 'adventure'
        ? 'adventure'
        : selectedHomeMode === 'practice'
          ? 'npc'
          : 'local')
    }
    if (isSupported) {
      const textId = gameId === 'number-gem'
        ? 'number_gem.title'
        : gameId === 'gomoku'
        ? 'gomoku.title'
        : gameId === 'reversi'
          ? 'reversi.title'
        : gameId === 'dark-chess'
            ? 'dark_chess.title'
            : gameId === 'animal-chess'
              ? 'animal_chess.title'
              : gameId === 'jump-chess'
                ? 'jump_chess.title'
                : 'tictactoe.title'
      speak(getChildText(textId))
    }
  }

  if (showCommonUi) {
    return <CommonUiPreview onBack={() => setShowCommonUi(false)} />
  }

  if (showDarkChessVerification) {
    return <DarkChessVerification onBack={() => setShowDarkChessVerification(false)} />
  }

  if (numberGemMode !== null) {
    return <NumberGemConnection key={numberGemMode} mode={numberGemMode} onBack={() => setNumberGemMode(null)} />
  }

  if (animalChessMode !== null) {
    return <AnimalChessGame key={animalChessMode} mode={animalChessMode} onBack={() => setAnimalChessMode(null)} />
  }

  if (jumpChessMode !== null) {
    return <JumpChessGame key={jumpChessMode} mode={jumpChessMode} onBack={() => setJumpChessMode(null)} />
  }

  if (darkChessMode !== null) {
    return (
      <>
        <DarkChessGame mode={darkChessMode} artProposal={preview === 'dark-chess-art-proposal'} onBack={() => setDarkChessMode(null)} />
        <UpdatePrompt />
      </>
    )
  }

  if (reversiMode !== null) {
    if (reversiMode === 'adventure') {
      return <ReversiAdventure key="reversi-adventure" onBack={() => setReversiMode(null)} />
    }
    return <ReversiArtProposal mode={reversiMode} onBack={() => setReversiMode(null)} />
  }

  if (ticTacToeMode !== null) {
    return (
      <TicTacToeProposal
        key={ticTacToeMode}
        mode={ticTacToeMode}
          onBack={() => setTicTacToeMode(null)}
      />
    )
  }

  if (gomokuMode !== null) {
    return (
      <GomokuProposal
        key={`${gomokuMode}-${preview ?? 'standard'}`}
        mode={gomokuMode}
        onBack={() => setGomokuMode(null)}
        artPreview={preview === 'gomoku-art-proposal'}
      />
    )
  }

  if (selectedHomeMode !== null) {
    const selectedModeTextId = homeModes.find((mode) => mode.id === selectedHomeMode)?.textId ?? 'home.practice'

    return (
      <div className="app-shell">
        <picture className="home-scene" aria-hidden="true">
          <source media="(orientation: landscape) and (min-width: 560px)" srcSet={homeLandscape} />
          <img src={homePortrait} alt="" />
        </picture>
        <div className="home-scene__veil" aria-hidden="true" />
        <header className="app-header">
          <div className="title-plaque">
            <BopomofoText as="h1" className="app-title" entry={getChildText('ui.main_actions')} />
          </div>
        </header>
        <main className="home-content game-picker-content">
          <section className="game-picker-panel" aria-label={getChildText('ui.main_actions').text_zh_tw}>
            <div className="game-picker-context" role="status" aria-live="polite">
              <BopomofoText entry={getChildText(selectedModeTextId)} />
              <BopomofoText entry={getChildText('ui.choose_game')} />
            </div>
            <div className="game-picker-actions">
              {(selectedHomeMode === 'online' ? gameOptions.filter((game) => game.id === 'jump-chess') : gameOptions).map((game) => (
                <button
                  key={game.id}
                  className={`mode-button mode-button--${game.tone}`}
                  type="button"
                  onClick={() => chooseGame(game.id)}
                >
                  <span className="mode-button__icon" aria-hidden="true">
                    <HomeIcon name={game.icon} />
                  </span>
                  <BopomofoText entry={getChildText(game.textId)} />
                </button>
              ))}
            </div>
            <button className="game-picker-back" type="button" onClick={() => setSelectedHomeMode(null)}>
              <BopomofoText entry={getChildText('common.back')} />
            </button>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <picture className="home-scene" aria-hidden="true">
        <source media="(orientation: landscape) and (min-width: 560px)" srcSet={homeLandscape} />
        <img src={homePortrait} alt="" />
      </picture>
      <div className="home-scene__veil" aria-hidden="true" />

      <header className="app-header">
        <div className="title-plaque">
          <span className="title-plaque__crown" aria-hidden="true">♛</span>
          <BopomofoText as="h1" className="app-title" entry={getChildText('app.title')} />
        </div>
      </header>

      <main className="home-content">
        <nav className="home-mode-panel" aria-label="遊戲模式">
          {homeModes.map((mode) => (
            <button
              key={mode.id}
              className={`mode-button mode-button--${mode.tone}`}
              type="button"
              onClick={() => chooseMode(mode.id, mode.textId)}
            >
              <span className="mode-button__icon" aria-hidden="true">
                <HomeIcon name={mode.icon} />
              </span>
              <BopomofoText entry={getChildText(mode.textId)} />
            </button>
          ))}
        </nav>

        {showComingSoon ? (
          <BopomofoText
            as="p"
            className="coming-soon"
            entry={getChildText('home.coming_soon')}
            role="status"
          />
        ) : null}
      </main>

      <aside className="home-utilities" aria-label="首頁工具">
        {isSupported ? (
          <button
            className="utility-button utility-button--speech"
            type="button"
            onClick={() => speak(welcome)}
          >
            <HomeIcon name="speaker" />
            <BopomofoText entry={getChildText('common.listen')} />
          </button>
        ) : null}
        <InstallButton />
        <button className="adult-utility" type="button" aria-label="家長專區" onClick={() => setShowComingSoon(true)}>
          <HomeIcon name="adult" />
          <span>家長專區</span>
        </button>
      </aside>

      <footer className="app-footer" aria-label="應用程式版本">
        v{__APP_VERSION__}
      </footer>
      <UpdatePrompt />
    </div>
  )
}
