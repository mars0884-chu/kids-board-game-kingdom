import process from 'node:process'
import { chromium } from 'playwright'

const edgeExecutable = process.env.EDGE_EXECUTABLE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.JUMP_CHESS_VERIFY_URL ?? 'http://127.0.0.1:5190/'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitForTurnCount(page, expected) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const count = Number(await page.locator('.jump-chess-game__turn-count strong').textContent())
    if (count >= expected) return count
    await page.waitForTimeout(150)
  }
  return Number(await page.locator('.jump-chess-game__turn-count strong').textContent())
}

async function completeFirstStep(page, tutorial = false) {
  const piece = tutorial
    ? page.locator('.jump-chess-hole--camp-one.jump-chess-hole--player-one').first()
    : page.locator('.jump-chess-hole--player-one').first()
  await piece.press('Enter')
  assert(await page.locator('.jump-chess-hole--selected').count() === 1, '選取第一位玩家棋子後沒有選中狀態。')
  const target = page.locator('.jump-chess-hole--target').first()
  assert(await target.count() === 1, '選取棋子後沒有顯示合法目的格。')
  await target.press('Enter')
}

async function tutorialSnapshot(page) {
  return {
    progress: (await page.locator('.jump-chess-tutorial-card__progress strong').textContent())?.trim(),
    instruction: await page.locator('.jump-chess-board-panel__status').textContent(),
    source: await page.locator('.jump-chess-hole--tutorial-source').getAttribute('data-cell'),
  }
}

async function completeTutorialMove(page) {
  const source = page.locator('.jump-chess-hole--tutorial-source')
  assert(await source.count() === 1, '教學目前關卡沒有唯一的指定棋子。')
  await source.press('Enter')
  const target = page.locator('.jump-chess-hole--target').first()
  assert(await target.count() === 1, '教學指定棋子選取後沒有唯一合法目的格。')
  await target.press('Enter')
}

const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const results = []

try {
  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
    try {
      const page = await context.newPage()
      await page.goto(`${baseUrl}?preview=jump-chess-adventure`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.jump-chess-tutorial-card')
      const initialProgress = await page.locator('.jump-chess-tutorial-card__progress strong').textContent()
      assert(initialProgress?.trim() === '1 / 6', `教學初始進度不正確：${initialProgress}`)
      const neutralHole = page.locator('.jump-chess-hole:not(:has(.jump-chess-piece))').first()
      await neutralHole.press('Enter')
      assert(await page.locator('.jump-chess-hole--selected').count() === 0, '教學誤觸不應選中錯誤棋孔。')
      await completeFirstStep(page, true)
      await page.waitForTimeout(120)
      assert(await page.locator('.jump-chess-actions .child-action--primary').count() === 1, '教學完成後沒有下一步操作。')
      await page.locator('.jump-chess-actions .child-action--primary').click()
      await page.waitForTimeout(120)
      const nextProgress = await page.locator('.jump-chess-tutorial-card__progress strong').textContent()
      assert(nextProgress?.trim() === '2 / 6', `教學前進後進度不正確：${nextProgress}`)
      results.push({ mode: 'adventure', pass: true, initialProgress, nextProgress })
    } finally {
      await context.close()
    }
  }

  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
    try {
      const page = await context.newPage()
      await page.goto(`${baseUrl}?preview=jump-chess-adventure`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.jump-chess-tutorial-card')
      const snapshots = []

      for (let lesson = 1; lesson <= 4; lesson += 1) {
        const before = await tutorialSnapshot(page)
        snapshots.push(before)
        await completeTutorialMove(page)
        await page.locator('.jump-chess-actions .child-action--primary').click()
        await page.waitForTimeout(100)
      }

      const fifthBefore = await tutorialSnapshot(page)
      snapshots.push(fifthBefore)
      await completeTutorialMove(page)
      assert(await page.locator('.jump-chess-hole__path-number').count() === 0, '第五關仍顯示會干擾棋盤的數字路徑標記。')
      assert(await page.locator('.jump-chess-hole--path').count() >= 2, '第五關完成第一跳後沒有保留非數字的路徑提示。')
      await page.locator('.jump-chess-hole--target').first().press('Enter')
      await page.locator('.jump-chess-finish-action').click()
      await page.locator('.jump-chess-actions .child-action--primary').click()
      await page.waitForTimeout(100)

      const sixthBefore = await tutorialSnapshot(page)
      snapshots.push(sixthBefore)
      await completeTutorialMove(page)
      assert(await page.locator('.jump-chess-actions .child-action--primary').count() === 1, '第六關完成後沒有完成狀態操作。')

      const sources = snapshots.slice(1, 4).map((snapshot) => snapshot.source)
      assert(new Set(sources).size === 3, `第二至第四關指定棋子位置未區分：${sources.join(', ')}`)
      const instructions = snapshots.map((snapshot) => snapshot.instruction)
      assert(new Set(instructions).size === 6, '六關教學提示文字仍然重複。')
      results.push({
        mode: 'adventure-lessons',
        pass: true,
        sources,
        instructionsDistinct: new Set(instructions).size,
        pathNumbers: await page.locator('.jump-chess-hole__path-number').count(),
      })
    } finally {
      await context.close()
    }
  }

  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
    try {
      const page = await context.newPage()
      await page.goto(`${baseUrl}?preview=jump-chess-local`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.jump-chess-board')
      await completeFirstStep(page)
      await page.waitForTimeout(120)
      const turnCount = await page.locator('.jump-chess-game__turn-count strong').textContent()
      assert(turnCount?.trim() === '1', `同機雙人完成第一步後回合數不正確：${turnCount}`)
      assert(await page.locator('.jump-chess-player--two.is-active').count() === 1, '同機雙人完成第一步後沒有換手。')
      assert(await page.locator('.jump-chess-tools .child-tool').count() === 3, '同機雙人按鍵數不是前版三鍵。')
      results.push({ mode: 'local', pass: true, turnCount })
    } finally {
      await context.close()
    }
  }

  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
    try {
      const page = await context.newPage()
      await page.goto(`${baseUrl}?preview=jump-chess`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.difficulty-selector')
      await completeFirstStep(page)
      const turnCount = await waitForTurnCount(page, 2)
      assert(turnCount >= 2, `NPC 沒有在玩家走棋後完成回應：${turnCount}`)
      assert(await page.locator('.jump-chess-piece').count() === 20, 'NPC 回應後棋子總數不是 20 枚。')
      assert(await page.locator('.jump-chess-tools .child-tool').count() === 3, 'NPC 模式按鍵數不是前版三鍵。')
      results.push({ mode: 'npc', pass: true, turnCount, difficultyOptions: await page.locator('.difficulty-option').count() })
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify({ browser: 'Microsoft Edge', baseUrl, results }, null, 2))
