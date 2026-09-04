import process from 'node:process'
import { chromium } from 'playwright'

const edgeExecutable = process.env.EDGE_EXECUTABLE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.JUMP_CHESS_GAMEPLAY_URL ?? 'http://127.0.0.1:5192/'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitFor(page, predicate, message, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return
    await page.waitForTimeout(100)
  }
  throw new Error(message)
}

async function currentPlayer(page) {
  const active = page.locator('.jump-chess-player.is-active')
  if (await active.count() === 0) return null
  const className = await active.getAttribute('class')
  if (className?.includes('player--one')) return 'player1'
  if (className?.includes('player--two')) return 'player2'
  return null
}

async function boardSignature(page) {
  return page.locator('.jump-chess-hole').evaluateAll((holes) => holes.map((hole) => ({
    cell: hole.getAttribute('data-cell'),
    piece: hole.classList.contains('jump-chess-hole--player-one')
      ? 'player1'
      : hole.classList.contains('jump-chess-hole--player-two') ? 'player2' : null,
  })))
}

async function clickHole(page, hole) {
  const box = await hole.boundingBox()
  assert(box !== null, '棋孔沒有可用的實際畫面位置。')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function selectPieceWithTarget(page) {
  const player = await currentPlayer(page)
  assert(player !== null, '目前沒有可辨識的執棋方。')
  const playerClass = player === 'player1' ? 'one' : 'two'
  const pieces = page.locator(`.jump-chess-hole--player-${playerClass}`)
  const pieceCount = await pieces.count()
  for (let index = 0; index < pieceCount; index += 1) {
    await clickHole(page, pieces.nth(index))
    const targets = page.locator('.jump-chess-hole--target')
    if (await targets.count() > 0) {
      return { player, source: await pieces.nth(index).getAttribute('data-cell') }
    }
  }
  throw new Error(`${player} 沒有找到可移動棋子。`)
}

async function playOneTurn(page, { continueJumps = true } = {}) {
  const before = await boardSignature(page)
  const selection = await selectPieceWithTarget(page)
  assert(await page.locator('.jump-chess-hole--selected').count() === 1, '選取棋子後沒有唯一選中狀態。')

  const neutral = page.locator('.jump-chess-hole:not(.jump-chess-hole--target):not(:has(.jump-chess-piece))').first()
  if (await neutral.count() === 1) {
    await clickHole(page, neutral)
    assert(await page.locator('.jump-chess-hole--selected').count() === 1, '誤點非目的孔後選中棋子被清除。')
  }

  let jumpCount = 0
  let pathLength = 0
  while (true) {
    const target = page.locator('.jump-chess-hole--target').first()
    assert(await target.count() === 1, '選取棋子後沒有唯一合法目的格。')
    await clickHole(page, target)
    await page.waitForTimeout(80)
    const pathHoles = page.locator('.jump-chess-hole--path')
    pathLength = Math.max(pathLength, await pathHoles.count())
    const finish = page.locator('.jump-chess-finish-action')
    if (await finish.count() === 0) break
    jumpCount += 1
    const nextTarget = page.locator('.jump-chess-hole--target')
    if (!continueJumps || await nextTarget.count() === 0 || jumpCount >= 3) {
      await finish.click()
      await page.waitForTimeout(120)
      break
    }
  }

  const after = await boardSignature(page)
  assert(JSON.stringify(before) !== JSON.stringify(after), '完成回合後棋盤局面沒有變化。')
  return {
    player: selection.player,
    source: selection.source,
    jumpCount,
    pathLength,
    turnCount: (await page.locator('.jump-chess-game__turn-count strong').textContent())?.trim(),
  }
}

async function waitForPlayerOneOrFinished(page) {
  await waitFor(page, async () => {
    return (await currentPlayer(page)) === 'player1' || await currentPlayer(page) === null
  }, 'NPC 回應後沒有回到第一位玩家或結束狀態。')
}

async function runLocalDeep(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    console.log('local:start')
    await page.goto(`${baseUrl}?preview=jump-chess-local&verification=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.jump-chess-board')
    assert(await page.locator('.jump-chess-piece').count() === 20, '雙人初始棋子不是 20 枚。')

    const tools = page.locator('.jump-chess-tools button')
    assert(await tools.count() === 3, '雙人工具列不是返回／聽一聽／暫停三鍵。')
    await tools.nth(2).click()
    assert(await tools.nth(2).getAttribute('aria-pressed') === 'true', '暫停鍵沒有進入按下狀態。')
    await clickHole(page, page.locator('.jump-chess-hole--player-one').first())
    assert(await page.locator('.jump-chess-hole--selected').count() === 0, '暫停時仍可選取棋子。')
    await tools.nth(2).click()
    assert(await tools.nth(2).getAttribute('aria-pressed') === 'false', '暫停鍵沒有恢復操作。')

    const moves = []
    for (let turn = 0; turn < 30; turn += 1) {
      if (await currentPlayer(page) === null) break
      console.log(`local:turn ${turn + 1}`)
      moves.push(await playOneTurn(page))
      await page.waitForTimeout(80)
    }
    assert(moves.length >= 10, `雙人實際走棋回合不足：${moves.length}`)
    assert(moves.some((move) => move.jumpCount > 0), '雙人 30 回合內沒有實際進入跳躍流程。')
    return { mode: 'local-deep', moves: moves.length, jumps: moves.filter((move) => move.jumpCount > 0).length, maxPathHoles: Math.max(...moves.map((move) => move.pathLength)) }
  } finally {
    await context.close()
  }
}

async function runNpcDeep(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    console.log('npc:start')
    await page.goto(`${baseUrl}?preview=jump-chess&verification=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.difficulty-selector')
    const moves = []
    for (let turn = 0; turn < 12; turn += 1) {
      if (await currentPlayer(page) === null) break
      console.log(`npc:turn ${turn + 1}`)
      assert(await currentPlayer(page) === 'player1', 'NPC 模式在玩家回合開始時不是第一位玩家。')
      const move = await playOneTurn(page)
      moves.push(move)
      await waitForPlayerOneOrFinished(page)
      assert(await page.locator('.jump-chess-piece').count() === 20, 'NPC 回應後棋子總數不是 20 枚。')
    }
    assert(moves.length >= 6, `NPC 實際走棋回合不足：${moves.length}`)
    return { mode: 'npc-deep', moves: moves.length, jumps: moves.filter((move) => move.jumpCount > 0).length, maxPathHoles: Math.max(...moves.map((move) => move.pathLength)) }
  } finally {
    await context.close()
  }
}

async function runViewportSmoke(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    console.log(`viewport:${viewport.width}x${viewport.height}:start`)
    await page.goto(`${baseUrl}?preview=jump-chess-local&verification=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.jump-chess-board')
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }))
    assert(layout.width === viewport.width && layout.height === viewport.height, `viewport 未命中 ${viewport.width}×${viewport.height}`)
    assert(layout.scrollWidth <= layout.width && layout.scrollHeight <= layout.height, `畫面在 ${viewport.width}×${viewport.height} 產生頁面溢位：${layout.scrollWidth}×${layout.scrollHeight}`)
    assert(await page.locator('.jump-chess-hole').count() === 121, '四尺寸棋孔數不是 121 個。')
    assert(await page.locator('.jump-chess-piece').count() === 20, '四尺寸初始棋子不是 20 枚。')
    const move = await playOneTurn(page, { continueJumps: true })
    return { viewport: `${viewport.width}x${viewport.height}`, move: move.turnCount }
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const results = []
try {
  results.push(await runLocalDeep(browser))
  results.push(await runNpcDeep(browser))
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    results.push(await runViewportSmoke(browser, viewport))
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify({ browser: 'Microsoft Edge', baseUrl, pass: true, results }, null, 2))
