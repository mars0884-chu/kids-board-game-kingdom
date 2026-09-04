import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const edgeExecutable = process.env.EDGE_EXECUTABLE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const pageUrl = process.env.JUMP_CHESS_PREVIEW_URL ?? 'http://127.0.0.1:5173/?preview=jump-chess-local'
const outputDirectory = path.resolve(
  process.env.JUMP_CHESS_CAPTURE_OUTPUT_DIR ?? path.join('art', 'previews', 'jump-chess-v0.7.0-engine'),
)
const targets = [[390, 844], [844, 390], [768, 1024], [1024, 768]]

function readPngSize(bytes) {
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error('Edge 沒有輸出 PNG 原始截圖。')
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

const layoutExpression = `(() => {
  const rect = (element) => {
    if (!element) return null
    const box = element.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
  }
  const game = document.querySelector('.jump-chess-game')
  const board = rect(document.querySelector('.jump-chess-board'))
  const controls = rect(document.querySelector('.jump-chess-controls'))
  const boardButtons = [...document.querySelectorAll('.jump-chess-hole')]
  const buttons = [...document.querySelectorAll('.jump-chess-game button')]
  const pairs = [...document.querySelectorAll('.jump-chess-game .bopomofo-pair')].map((pair) => {
    const hanzi = rect(pair.querySelector('.bopomofo-pair__hanzi'))
    const annotationElement = pair.querySelector('.bopomofo-pair__annotation')
    const annotation = rect(annotationElement)
    const tone = rect(pair.querySelector('.bopomofo-pair__tone'))
    return {
      hanzi,
      annotation,
      tone,
      visible: Boolean(annotationElement && getComputedStyle(annotationElement).display !== 'none' && annotation && annotation.width > 0.01),
      toRight: Boolean(hanzi && annotation && annotation.left >= hanzi.right - 1),
      toneInside: Boolean(!tone || (tone.top >= -1 && tone.bottom <= innerHeight + 1)),
    }
  }).filter(({ visible }) => visible)
  const gameElements = game ? [game, ...game.querySelectorAll('*')] : []
  const outsideViewport = gameElements.map(rect).filter(Boolean).filter(({ left, right, top, bottom }) => left < -1 || right > innerWidth + 1 || top < -1 || bottom > innerHeight + 1)
  const buttonDetails = buttons.map((button) => {
    const buttonBox = rect(button)
    return {
      button: buttonBox,
      overflow: button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1,
      selector: button.className,
      label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
      client: [button.clientWidth, button.clientHeight],
      scroll: [button.scrollWidth, button.scrollHeight],
    }
  })
  const marks = [...document.querySelectorAll('.jump-chess-player__mark')].map((mark) => getComputedStyle(mark).color)
  const pieces = [...document.querySelectorAll('.jump-chess-piece')].map((piece) => ({ color: getComputedStyle(piece).backgroundColor, shape: getComputedStyle(piece).borderRadius }))
  const playerElements = [...document.querySelectorAll('.jump-chess-player')]
  const playerDetails = playerElements.map((player) => {
    const playerBox = rect(player)
    const text = rect(player.querySelector('.bopomofo-text'))
    const marker = rect(player.querySelector('.jump-chess-player__mark'))
    const overflow = player.scrollWidth > player.clientWidth + 1 || player.scrollHeight > player.clientHeight + 1
    return {
      player: playerBox,
      text,
      marker,
      overflow,
      client: [player.clientWidth, player.clientHeight],
      scroll: [player.scrollWidth, player.scrollHeight],
    }
  })
  const toolElements = [...document.querySelectorAll('.jump-chess-tools .child-tool')]
  return {
    viewport: [innerWidth, innerHeight],
    document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    board,
    controls,
    boardCells: boardButtons.length,
    boardButtonMinimum: boardButtons.length === 0 ? null : Math.min(...boardButtons.map((button) => Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height))),
    buttonsInsideViewport: buttonDetails.every(({ button }) => button && button.left >= -1 && button.right <= innerWidth + 1 && button.top >= -1 && button.bottom <= innerHeight + 1),
    buttonsContentInside: buttonDetails.every(({ overflow }) => !overflow),
    overflowingButtons: buttonDetails.filter(({ overflow }) => overflow),
    visibleBopomofoPairs: pairs.length,
    bopomofoToRight: pairs.every(({ toRight }) => toRight),
    tonesInsideViewport: pairs.every(({ toneInside }) => toneInside),
    outsideViewportCount: outsideViewport.length,
    marks,
    pieces,
    players: {
      count: playerDetails.length,
      contentInside: playerDetails.every(({ overflow }) => !overflow),
      details: playerDetails,
    },
    visualSizes: {
      piece: rect(document.querySelector('.jump-chess-piece')),
      holeWell: rect(document.querySelector('.jump-chess-hole__well')),
    },
    tools: {
      count: toolElements.length,
      labels: toolElements.map((tool) => tool.textContent?.trim() ?? ''),
    },
    pageHorizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    pageVerticalOverflow: document.documentElement.scrollHeight > innerHeight,
  }
})()`

await mkdir(outputDirectory, { recursive: true })
const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const evidence = []

try {
  for (const [width, height] of targets) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    try {
      const page = await context.newPage()
      await page.goto(pageUrl, { waitUntil: 'networkidle' })
      await page.waitForTimeout(900)
      const layout = await page.evaluate(layoutExpression)
      const bytes = await page.screenshot({ type: 'png', fullPage: false })
      const image = readPngSize(bytes)
      if (image.width !== width || image.height !== height || layout.viewport[0] !== width || layout.viewport[1] !== height) {
        throw new Error(`${width}×${height} 不是一比一原始截圖：${JSON.stringify({ image, viewport: layout.viewport })}`)
      }
      const filename = `jump-chess-${width}x${height}.png`
      await writeFile(path.join(outputDirectory, filename), bytes)
      evidence.push({ filename, image, layout })
      console.log(`已擷取並驗證 ${filename}：${image.width}×${image.height}`)
    } finally {
      await context.close()
    }
  }
  await writeFile(path.join(outputDirectory, 'jump-chess-layout-report.json'), `${JSON.stringify({ browser: 'Microsoft Edge', pageUrl, targets, evidence }, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ browser: 'Microsoft Edge', pageUrl, targets, evidence }, null, 2))
} finally {
  await browser.close()
}
