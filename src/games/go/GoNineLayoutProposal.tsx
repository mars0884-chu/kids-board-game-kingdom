import { BopomofoText } from '../../components/BopomofoText'
import { ToolButton } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'

interface GoNineLayoutProposalProps {
  onBack: () => void
  boardSize?: 9 | 13 | 19
}
const boardConfigurations = {
  9: {
    start: 49.5,
    end: 550.5,
    stars: [2, 4, 6],
    stoneRadius: 20.5,
    starRadius: 7,
    frame: [{ x: 16, y: 16, width: 568, height: 568 }, { x: 21, y: 21, width: 558, height: 558 }, { x: 26, y: 26, width: 548, height: 548 }],
    rows: [3, 4],
    sampleStart: 1,
    sampleCount: 7,
  },
  13: {
    start: 49.5,
    end: 550.5,
    stars: [3, 6, 9],
    stoneRadius: 18.2,
    starRadius: 6.5,
    frame: [{ x: 16, y: 16, width: 568, height: 568 }, { x: 21, y: 21, width: 558, height: 558 }, { x: 26, y: 26, width: 548, height: 548 }],
    rows: [5, 6],
    sampleStart: 3,
    sampleCount: 7,
  },
  19: {
    start: 27,
    end: 573,
    stars: [3, 9, 15],
    stoneRadius: 12.2,
    starRadius: 4.2,
    frame: [{ x: 0, y: 0, width: 600, height: 600 }, { x: 5, y: 5, width: 590, height: 590 }, { x: 10, y: 10, width: 580, height: 580 }],
    rows: [8, 9],
    sampleStart: 0,
    sampleCount: 19,
  },
} as const

export function GoNineLayoutProposal({ onBack, boardSize = 13 }: GoNineLayoutProposalProps) {
  const config = boardConfigurations[boardSize]
  const step = (config.end - config.start) / (boardSize - 1)
  const exampleStones = [
    ...Array.from({ length: config.sampleCount }, (_, index) => ({ x: index + config.sampleStart, y: config.rows[0], side: 'white' as const })),
    ...Array.from({ length: config.sampleCount }, (_, index) => ({ x: index + config.sampleStart, y: config.rows[1], side: 'black' as const })),
  ]
  const proposal = boardSize === 19 ? 'ART-012-r07' : boardSize === 13 ? 'ART-012-r05' : 'ART-012-r02'

  return (
    <main className="go-nine-proposal" aria-labelledby="go-nine-title" data-proposal={proposal}>
      <div className="go-nine-proposal__frame">
        <header className="go-nine-proposal__header">
          <div className="go-nine-proposal__heading">
            <BopomofoText as="h1" className="go-nine-proposal__title" entry={getChildText('go.title')} id="go-nine-title" />
            <BopomofoText as="span" className="go-nine-proposal__badge" entry={getChildText(`go.size_${boardSize}`)} />
          </div>
          <div className="go-nine-proposal__turn" role="status" aria-label={getChildText('go.turn_black').text_zh_tw}>
            <span className="go-nine-proposal__turn-stone" aria-hidden="true" />
            <BopomofoText className="go-nine-proposal__turn-label" entry={getChildText('go.turn_black')} />
          </div>
        </header>

        <section className="go-nine-proposal__board-card" aria-label={getChildText('go.sample_board').text_zh_tw}>
          <div className="go-nine-proposal__board-wrap">
            <svg className="go-nine-proposal__board" viewBox="0 0 600 600" role="img" aria-label={`${boardSize}路圍棋棋盤示範`} data-board-size={boardSize} data-line-count={boardSize * 2} data-grid-start={config.start} data-grid-end={config.end} data-stone-radius={config.stoneRadius}>
              <defs>
                <radialGradient id="go-board-wood" cx="32%" cy="25%" r="90%"><stop offset="0" stopColor="#f9dfa0" /><stop offset="1" stopColor="#d9a95e" /></radialGradient>
                <radialGradient id="go-black-stone" cx="30%" cy="25%" r="75%"><stop offset="0" stopColor="#777b7b" /><stop offset="0.45" stopColor="#252a2c" /><stop offset="1" stopColor="#080b0c" /></radialGradient>
                <radialGradient id="go-white-stone" cx="30%" cy="25%" r="78%"><stop offset="0" stopColor="#fff" /><stop offset="0.7" stopColor="#f5f2e7" /><stop offset="1" stopColor="#c6c1b3" /></radialGradient>
                <filter id="go-stone-shadow" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.2" /><feOffset dy="2" /><feComponentTransfer><feFuncA type="linear" slope="0.22" /></feComponentTransfer><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>
              {config.frame.map((layer, index) => <rect key={index} data-frame-layer={['outer', 'trim', 'surface'][index]} {...layer} fill={index === 0 ? '#77542d' : index === 1 ? '#b78345' : 'url(#go-board-wood)'} {...(index === 2 ? { stroke: '#f8e8bd', strokeWidth: 2 } : {})} />)}
              <g className="go-nine-proposal__grid" aria-hidden="true">
                {Array.from({ length: boardSize }, (_, index) => {
                  const coordinate = config.start + index * step
                  return <g key={index}><line x1={coordinate} y1={config.start} x2={coordinate} y2={config.end} /><line x1={config.start} y1={coordinate} x2={config.end} y2={coordinate} /></g>
                })}
              </g>
              <g className="go-nine-proposal__stars" aria-hidden="true">
                {config.stars.flatMap((row) => config.stars.map((column) => <circle key={`${row}-${column}`} cx={config.start + column * step} cy={config.start + row * step} r={config.starRadius} />))}
              </g>
              <g aria-hidden="true">
                {exampleStones.map((stone, index) => <circle key={`${stone.side}-${index}`} className={`go-nine-proposal__stone go-nine-proposal__stone--${stone.side}`} cx={config.start + stone.x * step} cy={config.start + stone.y * step} r={config.stoneRadius} fill={stone.side === 'black' ? 'url(#go-black-stone)' : 'url(#go-white-stone)'} filter="url(#go-stone-shadow)" data-stone={stone.side} data-x={stone.x} data-y={stone.y} />)}
              </g>
            </svg>
          </div>
        </section>

        <aside className="go-nine-proposal__side" aria-label="圍棋畫面資訊">
          <div className="go-nine-proposal__players">
            <div className="go-nine-proposal__player go-nine-proposal__player--black"><span className="go-nine-proposal__player-stone" aria-hidden="true" /><BopomofoText entry={getChildText('go.black')} /></div>
            <div className="go-nine-proposal__player go-nine-proposal__player--white"><span className="go-nine-proposal__player-stone" aria-hidden="true" /><BopomofoText entry={getChildText('go.white')} /></div>
          </div>
          <div className="go-nine-proposal__caption" role="note"><span className="go-nine-proposal__caption-dot" aria-hidden="true" /><BopomofoText entry={getChildText('go.sample_board')} /></div>
          <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
        </aside>
      </div>
    </main>
  )
}
