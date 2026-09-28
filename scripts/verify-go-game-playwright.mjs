import process from 'node:process'
import { chromium } from 'playwright'

const edgeExecutable = process.env.EDGE_EXECUTABLE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.GO_GAME_URL ?? 'http://127.0.0.1:5187/'
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

async function openGo(page, viewport, modeIndex = 0) {
  await page.goto(`${baseUrl}?go-formal-check=${viewport.name}-${modeIndex}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.home-mode-panel .mode-button').nth(modeIndex).click()
  const gameButtons = page.locator('.game-picker-actions .mode-button')
  assert(await gameButtons.count() === 9, '正式棋種清單應包含九款遊戲。')
  await gameButtons.nth(8).click()
  await page.locator('main.go-game').waitFor()
}

async function clickBoardPoint(page, point, size) {
  const config = size === 19 ? { start: 27, end: 573 } : { start: 49.5, end: 550.5 }
  const position = await page.locator('.go-game__board').evaluate((board, coords) => {
    const box = board.getBoundingClientRect()
    return { x: box.left + coords.x / 600 * box.width, y: box.top + coords.y / 600 * box.height }
  }, { x: config.start + point.column * (config.end - config.start) / (size - 1), y: config.start + point.row * (config.end - config.start) / (size - 1) })
  await page.mouse.click(position.x, position.y)
}

async function clickTutorialTarget(page) {
  const target = await page.locator('.go-game__tutorial-target').first().evaluate((circle) => {
    const board = circle.ownerSVGElement
    const box = board.getBoundingClientRect()
    return { x: box.left + Number(circle.getAttribute('cx')) / 600 * box.width, y: box.top + Number(circle.getAttribute('cy')) / 600 * box.height }
  })
  await page.mouse.click(target.x, target.y)
}

const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
let context

try {
  const results = []
  for (const viewport of viewports) {
    context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.setDefaultTimeout(8_000)
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await openGo(page, viewport)
    const boardMetrics = await page.locator('.go-game__board').evaluate((board) => {
      const box = board.getBoundingClientRect()
      return { left: box.left, right: box.right, width: box.width, height: box.height, rows: Number(board.getAttribute('aria-rowcount')), columns: Number(board.getAttribute('aria-colcount')), lines: board.querySelectorAll('.go-game__grid-lines line').length, pageWidth: document.documentElement.scrollWidth }
    })
    assert(boardMetrics.rows === 9 && boardMetrics.columns === 9 && boardMetrics.lines === 18, `${viewport.name} 正式冒險沒有顯示完整 9 路棋盤。`)
    assert(Math.abs(boardMetrics.width - boardMetrics.height) < 1, `${viewport.name} 圍棋棋盤比例不是正方形。`)
    assert(boardMetrics.left >= -1 && boardMetrics.right <= viewport.width + 1 && boardMetrics.pageWidth <= viewport.width + 1, `${viewport.name} 正式棋盤或頁面發生水平溢位。`)

    // 實際完成冒險課程的落子、連棋與提子，不使用預覽路由或測試專用畫面。
    await clickBoardPoint(page, { row: 4, column: 4 }, 9)
    await page.waitForFunction(() => document.querySelectorAll('.go-game__board [data-stone="black"]').length === 1)
    await page.locator('.go-game__turn--white').waitFor()
    await page.locator('.go-game__turn--black').waitFor()
    await page.locator('.go-game__tutorial-target').first().waitFor()
    await clickTutorialTarget(page)
    await page.locator('.go-game__turn--white').waitFor()
    await page.locator('.go-game__turn--black').waitFor()
    await page.getByRole('button', { name: /開始提子練習/ }).waitFor()
    await page.getByRole('button', { name: /開始提子練習/ }).click()
    await clickTutorialTarget(page)
    await page.waitForFunction(() => document.querySelector('#go-point-9-40')?.getAttribute('data-stone') === 'empty')

    // 同一正式遊戲入口檢查 19 路成人版，不裁切也不更改棋盤比例。
    if (viewport.name === '390x844') {
      await openGo(page, viewport, 1)
      await page.getByRole('button', { name: '成人版' }).click()
      const adultBoard = await page.locator('.go-game__board').evaluate((board) => {
        const box = board.getBoundingClientRect()
        return { rows: Number(board.getAttribute('aria-rowcount')), lines: board.querySelectorAll('.go-game__grid-lines line').length, width: box.width, height: box.height }
      })
      assert(adultBoard.rows === 19 && adultBoard.lines === 38 && Math.abs(adultBoard.width - adultBoard.height) < 1, '正式自由練習的成人版 19 路棋盤未正確呈現。')
    }

    assert(pageErrors.length === 0, `${viewport.name} 發生瀏覽器錯誤：${pageErrors.join('；')}`)
    results.push({ viewport: viewport.name, boardPixels: Math.round(boardMetrics.width), lessonCapture: true, adult19: viewport.name === '390x844' })
    await context.close()
    context = undefined
  }
  console.log(JSON.stringify({ pass: true, browser: 'Microsoft Edge', baseUrl, results }, null, 2))
} finally {
  await context?.close()
  await browser.close()
}
