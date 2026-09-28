import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'

const browserExecutable = process.env.CAPTURE_BROWSER_EXECUTABLE
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const previewBaseUrl = process.env.ART_PREVIEW_URL ?? 'http://127.0.0.1:5187/'
const outputDirectory = await mkdtemp(path.join(tmpdir(), 'go-layout-v0.14.4-'))
const boardSizes = [9, 13, 19]
const viewports = [[390, 844], [844, 390], [768, 1024], [945, 768]]
const expectations = {
  9: { proposal: 'ART-012-r02', start: 49.5, end: 550.5, stoneRadius: 20.5, clearance: 1.4, sampleCount: 7, rows: [3, 4], rowStart: 1, frameX: [16, 21, 26], frameWidth: [568, 558, 548], minimumGap: 18 },
  13: { proposal: 'ART-012-r05', start: 49.5, end: 550.5, stoneRadius: 18.2, clearance: 3.7, sampleCount: 7, rows: [5, 6], rowStart: 3, frameX: [16, 21, 26], frameWidth: [568, 558, 548], minimumGap: 4.1 },
  19: { proposal: 'ART-012-r07', start: 27, end: 573, stoneRadius: 12.2, clearance: 3.2, sampleCount: 19, rows: [8, 9], rowStart: 0, frameX: [0, 5, 10], frameWidth: [600, 590, 580], minimumGap: 4.7 },
}
const minimumBoardSizes = {
  9: new Map([['390x844', 360], ['844x390', 280], ['768x1024', 515], ['945x768', 474]]),
  13: new Map([['390x844', 360], ['844x390', 280], ['768x1024', 515], ['945x768', 474]]),
  19: new Map([['390x844', 360], ['844x390', 325], ['768x1024', 540], ['945x768', 540]]),
}

const browser = await chromium.launch({
  headless: true,
  executablePath: browserExecutable,
  args: ['--disable-gpu', '--no-sandbox'],
})

try {
  const evidence = []
  for (const boardSize of boardSizes) {
    for (const [width, height] of viewports) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      const preview = boardSize === 9 ? 'go-nine-layout' : boardSize === 13 ? 'go-thirteen-layout' : 'go-nineteen-layout'
      const previewUrl = new URL(previewBaseUrl)
      previewUrl.searchParams.set('preview', preview)
      await page.goto(previewUrl.href, { waitUntil: 'networkidle' })
      const layout = await page.evaluate(() => {
      const board = document.querySelector('.go-nine-proposal__board')?.getBoundingClientRect()
      const control = document.querySelector('.go-nine-proposal .child-tool')?.getBoundingClientRect()
      return {
        viewport: [innerWidth, innerHeight],
        document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        proposal: document.querySelector('[data-proposal]')?.getAttribute('data-proposal'),
        board: board ? [board.x, board.y, board.width, board.height] : null,
        boardSize: Number(document.querySelector('.go-nine-proposal__board')?.getAttribute('data-board-size')),
        gridStart: Number(document.querySelector('.go-nine-proposal__board')?.getAttribute('data-grid-start')),
        gridEnd: Number(document.querySelector('.go-nine-proposal__board')?.getAttribute('data-grid-end')),
        stoneRadius: Number(document.querySelector('.go-nine-proposal__board')?.getAttribute('data-stone-radius')),
        lines: document.querySelectorAll('.go-nine-proposal__grid line').length,
        frameLayers: [...document.querySelectorAll('.go-nine-proposal__board rect[data-frame-layer]')].map((rect) => ({
          layer: rect.getAttribute('data-frame-layer'),
          rx: rect.getAttribute('rx'),
          ry: rect.getAttribute('ry'),
          x: Number(rect.getAttribute('x')),
          width: Number(rect.getAttribute('width')),
        })),
        edgeStoneClearance: (() => {
          const surface = document.querySelector('.go-nine-proposal__board rect[data-frame-layer="surface"]')
          const insideEdge = Number(surface?.getAttribute('x')) + Number(surface?.getAttribute('stroke-width')) / 2
          const board = document.querySelector('.go-nine-proposal__board')
          const radius = Number(board?.getAttribute('data-stone-radius'))
          const stoneStroke = parseFloat(getComputedStyle(document.querySelector('.go-nine-proposal__stone')).strokeWidth) / 2
          return Number(board?.getAttribute('data-grid-start')) - insideEdge - radius - stoneStroke
        })(),
        stars: document.querySelectorAll('.go-nine-proposal__stars circle').length,
        stones: document.querySelectorAll('.go-nine-proposal__stone').length,
        stoneColors: [...document.querySelectorAll('.go-nine-proposal__stone')].reduce((counts, stone) => {
          const side = stone.getAttribute('data-stone')
          counts[side] = (counts[side] ?? 0) + 1
          return counts
        }, {}),
        stoneSpacing: (() => {
          const stones = [...document.querySelectorAll('.go-nine-proposal__stone')].map((stone) => ({
            x: Number(stone.getAttribute('cx')),
            y: Number(stone.getAttribute('cy')),
            r: Number(stone.getAttribute('r')),
            gridX: Number(stone.getAttribute('data-x')),
            gridY: Number(stone.getAttribute('data-y')),
            side: stone.getAttribute('data-stone'),
          }))
          let minimumGap = Number.POSITIVE_INFINITY
          let overlaps = 0
          for (let left = 0; left < stones.length; left += 1) {
            for (let right = left + 1; right < stones.length; right += 1) {
              const leftStroke = parseFloat(getComputedStyle(document.querySelector(`.go-nine-proposal__stone[data-x="${stones[left].gridX}"][data-y="${stones[left].gridY}"]`)).strokeWidth) / 2
              const rightStroke = parseFloat(getComputedStyle(document.querySelector(`.go-nine-proposal__stone[data-x="${stones[right].gridX}"][data-y="${stones[right].gridY}"]`)).strokeWidth) / 2
              const gap = Math.hypot(stones[left].x - stones[right].x, stones[left].y - stones[right].y) - stones[left].r - leftStroke - stones[right].r - rightStroke
              minimumGap = Math.min(minimumGap, gap)
              if (gap < 0) overlaps += 1
            }
          }
          const boardSize = Number(document.querySelector('.go-nine-proposal__board')?.getAttribute('data-board-size'))
          const { rows: rowLines, rowStart, sampleCount: rowLength } = {
            9: { rows: [3, 4], rowStart: 1, sampleCount: 7 },
            13: { rows: [5, 6], rowStart: 3, sampleCount: 7 },
            19: { rows: [8, 9], rowStart: 0, sampleCount: 19 },
          }[boardSize]
          const rows = rowLines.map((y) => stones.filter((stone) => stone.gridY === y).sort((a, b) => a.gridX - b.gridX))
          const continuousRows = rows.every((row) => row.length === rowLength && row.every((stone, index) => stone.gridX === index + rowStart && stone.side === row[0].side)) && rows[0][0]?.side !== rows[1][0]?.side
          return { minimumGap, overlaps, continuousRows }
        })(),
        buttons: document.querySelectorAll('.go-nine-proposal button').length,
        control: control ? [control.x, control.y, control.width, control.height] : null,
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        overflowY: document.documentElement.scrollHeight > innerHeight + 1,
      }
    })
      const minimumBoardSize = minimumBoardSizes[boardSize].get(`${width}x${height}`) ?? 0
      const expected = expectations[boardSize]
      const valid = pageErrors.length === 0 && layout.viewport[0] === width && layout.viewport[1] === height &&
        layout.proposal === expected.proposal && layout.boardSize === boardSize && layout.board !== null && Math.abs(layout.board[2] - layout.board[3]) < 0.1 &&
        layout.board[2] >= minimumBoardSize &&
        layout.gridStart === expected.start && layout.gridEnd === expected.end && layout.stoneRadius === expected.stoneRadius && Math.abs(layout.edgeStoneClearance - expected.clearance) < 0.01 &&
        layout.lines === boardSize * 2 && layout.stars === 9 && layout.stones === expected.sampleCount * 2 && layout.stoneColors.black === expected.sampleCount && layout.stoneColors.white === expected.sampleCount && layout.stoneSpacing.overlaps === 0 && layout.stoneSpacing.minimumGap >= expected.minimumGap && layout.stoneSpacing.continuousRows && layout.frameLayers.length === 3 && layout.frameLayers.every(({ rx, ry }) => rx === null && ry === null) && layout.frameLayers.every(({ x, width }, index) => x === expected.frameX[index] && width === expected.frameWidth[index]) && layout.buttons === 1 &&
        layout.control !== null && layout.control[2] >= 48 && layout.control[3] >= 48 && !layout.overflowX && !layout.overflowY
      if (!valid) throw new Error(`${boardSize} 路 ${width}×${height} 版面驗證失敗：${JSON.stringify({ layout, pageErrors })}`)

      const filename = `go-${boardSize}-expanded-${width}x${height}.png`
      const bytes = await page.screenshot({ path: path.join(outputDirectory, filename), fullPage: false })
      const pngWidth = bytes.readUInt32BE(16)
      const pngHeight = bytes.readUInt32BE(20)
      if (pngWidth !== width || pngHeight !== height) throw new Error(`${filename} PNG 尺寸錯誤：${pngWidth}×${pngHeight}`)
      evidence.push({
        filename,
        boardSize,
        viewport: [pngWidth, pngHeight],
        board: layout.board,
        frameLayers: layout.frameLayers,
        edgeStoneClearance: layout.edgeStoneClearance,
        stoneSpacing: layout.stoneSpacing,
        control: layout.control,
        sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
      })
      await page.close()
    }
  }
  console.log(JSON.stringify({ previewBaseUrl, evidence }, null, 2))
} finally {
  await browser.close()
  await rm(outputDirectory, { recursive: true, force: true })
}
