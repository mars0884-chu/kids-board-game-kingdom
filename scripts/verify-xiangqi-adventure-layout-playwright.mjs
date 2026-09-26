import process from 'node:process'
import { chromium } from 'playwright'

const edgeExecutable = process.env.EDGE_EXECUTABLE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.XIANGQI_ADVENTURE_URL ?? 'http://127.0.0.1:5187/'
const viewports = [
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '430x932', width: 430, height: 932 },
  { name: '932x430', width: 932, height: 430 },
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const browser = await chromium.launch({
  executablePath: edgeExecutable,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
let context

try {
  const results = []
  for (const viewport of viewports) {
    context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.setDefaultTimeout(8_000)
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(`${baseUrl}?xiangqi-adventure-check=${viewport.name}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.home-mode-panel .mode-button').nth(0).click()
    await page.locator('.game-picker-actions .mode-button').nth(7).click()
    await page.locator('.xiangqi-game__adventure').waitFor()
    await page.locator('.xiangqi-game__cell--red').first().waitFor()
    await page.waitForFunction(() => !document.querySelector('.xiangqi-game__cell--red')?.disabled)

    const measurements = await page.evaluate(() => {
      const board = document.querySelector('.xiangqi-game__board')
      const piece = document.querySelector('.xiangqi-game__cell--red')
      const lessonControls = [...document.querySelectorAll('.xiangqi-game__lesson-step')]
      if (!board || !piece || lessonControls.length !== 6) return null
      const boardBox = board.getBoundingClientRect()
      const pieceBox = piece.getBoundingClientRect()
      const face = getComputedStyle(piece, '::before')
      const controlBoxes = lessonControls.map((control) => control.getBoundingClientRect())
      const rect = (selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect()
        return box ? { top: box.top, bottom: box.bottom, height: box.height } : null
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        board: { left: boardBox.left, right: boardBox.right, width: boardBox.width, height: boardBox.height },
        boardWrapWidth: document.querySelector('.xiangqi-game__board-wrap')?.getBoundingClientRect().width,
        boardWrapCssWidth: getComputedStyle(document.querySelector('.xiangqi-game__board-wrap')).width,
        pieceFace: { width: parseFloat(face.width), height: parseFloat(face.height) },
        lessonButtons: controlBoxes.map((box) => ({ left: box.left, right: box.right, height: box.height })),
        sections: {
          frame: rect('.xiangqi-game__frame'), header: rect('.xiangqi-game__header'), boardWrap: rect('.xiangqi-game__board-wrap'),
          adventure: rect('.xiangqi-game__adventure'), lessonSteps: rect('.xiangqi-game__lesson-steps'), feedback: rect('.feedback-card'),
          actions: rect('.xiangqi-game__adventure-actions'), tools: rect('.xiangqi-game__tools'),
        },
      }
    })

    assert(measurements, `${viewport.name} 沒有完整呈現棋盤與六段課程。`)
    assert(measurements.viewport.width === viewport.width && measurements.viewport.height === viewport.height, `${viewport.name} viewport 量測錯誤。`)
    assert(measurements.document.width <= viewport.width + 1, `${viewport.name} 發生水平溢位。`)
    assert(measurements.document.height <= viewport.height + 1, `${viewport.name} 教學版面垂直超出視窗。`)
    assert(measurements.board.left >= -1 && measurements.board.right <= viewport.width + 1, `${viewport.name} 棋盤超出畫面。`)
    assert(measurements.pieceFace.width <= measurements.board.width / 8 * 0.88 + 1, `${viewport.name} 棋子圓面仍過度貼近相鄰交點。`)
    assert(measurements.lessonButtons.every((button) => button.left >= -1 && button.right <= viewport.width + 1), `${viewport.name} 教學卡片超出畫面。`)
    assert(measurements.lessonButtons.every((button) => button.height >= 48), `${viewport.name} 教學卡片觸控高度低於 48px。`)

    const board = page.getByRole('grid')
    await board.getByRole('gridcell', { name: '紅兵，7列1行' }).click()
    await board.getByRole('gridcell', { name: '6列1行，可走' }).click()
    await page.locator('.xiangqi-game__adventure .feedback-card--positive').waitFor()
    await page.locator('.xiangqi-game__adventure-actions button').nth(1).click()
    await page.waitForFunction(() => document.querySelectorAll('.xiangqi-game__lesson-step')[1]?.getAttribute('aria-pressed') === 'true')
    assert(pageErrors.length === 0, `${viewport.name} 發生 JavaScript 錯誤：${pageErrors.join('；')}`)
    results.push({ viewport: viewport.name, boardWidth: Math.round(measurements.board.width), pieceFace: Math.round(measurements.pieceFace.width), pageWidth: measurements.document.width, pageHeight: measurements.document.height, sections: measurements.sections })
    await context.close()
    context = undefined
  }

  console.log(JSON.stringify({ pass: true, browser: 'Microsoft Edge', baseUrl, results }, null, 2))
} finally {
  await context?.close()
  await browser.close()
}
