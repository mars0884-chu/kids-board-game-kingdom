import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const apiKey = process.env.VITE_FIREBASE_API_KEY
const databaseUrl = process.env.VITE_FIREBASE_DATABASE_URL
const workerUrl = process.env.VITE_TURN_GAME_WORKER_URL
if (!apiKey || !databaseUrl || !workerUrl || process.env.FIREBASE_LIVE_SMOKE !== '1') {
  throw new Error('須明確設定正式 Firebase、可信服務與 FIREBASE_LIVE_SMOKE=1。')
}
const base = 'http://127.0.0.1:5194/'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5194', '--strictPort'], {
  env: { ...process.env, VITE_BASE_PATH: '/' }, stdio: 'ignore', windowsHide: true,
})
let browser
let contexts = []
let matchId = null
const matchIds = new Set()
const tokens = []
const workerEvents = []

async function tokenFrom(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('firebaseLocalStorageDb')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const records = await new Promise((resolve, reject) => {
        const request = database.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      return records.map((record) => record.value?.stsTokenManager?.accessToken).find(Boolean) ?? null
    } finally { database.close() }
  })
}

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('測試網站啟動失敗。')
    try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* 等待本機網站 */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert(ready, '本機網站未啟動。')
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? {
    executablePath: process.env.EDGE_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  } : {}) })
  contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })))
  const pages = await Promise.all(contexts.map(async (context) => {
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    await page.route(`${workerUrl}/**`, async (route) => {
      const headers = { ...route.request().headers(), origin: 'https://mars0884-chu.github.io' }
      const response = await route.fetch({ headers })
      workerEvents.push({ method: route.request().method(), status: response.status(), body: (await response.text()).slice(0, 180) })
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': new URL(base).origin } })
    })
    await page.route('https://kids-board-dark-chess.kids-board-game-kingdom.workers.dev/**', async (route) => {
      const response = await route.fetch({ headers: { ...route.request().headers(), origin: 'https://mars0884-chu.github.io' } })
      workerEvents.push({ game: 'dark-chess', method: route.request().method(), status: response.status(), body: (await response.text()).slice(0, 180) })
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': new URL(base).origin } })
    })
    return page
  }))
  const [host, guest] = pages
  const errors = []
  for (const page of pages) page.on('pageerror', (error) => errors.push(error.message))
  for (const page of pages) {
    await page.goto(base)
    await page.locator('.home-mode-panel .mode-button').nth(3).click()
    await page.locator('.game-picker-actions .mode-button').nth(0).click()
  }
  await host.getByRole('button', { name: '邀請朋友', exact: true }).click()
  const code = (await host.getByRole('status', { name: '房號', exact: true }).textContent()).replace(/\D/g, '')
  assert(/^\d{8}$/.test(code), '熟人房號格式錯誤。')
  matchId = code
  matchIds.add(code)
  await guest.getByRole('button', { name: '輸入房號', exact: true }).click()
  await guest.getByRole('textbox', { name: '房號', exact: true }).fill(code)
  await guest.getByRole('button', { name: '加入遊戲', exact: true }).click()
  try { await Promise.all(pages.map((page) => page.locator('.tictactoe-board').waitFor())) }
  catch (error) {
    console.error('雙端畫面狀態：', await Promise.all(pages.map((page) => page.locator('.webrtc-pairing').innerText().catch(() => '配對畫面不存在'))))
    console.error('頁面錯誤：', errors)
    console.error('可信服務狀態：', workerEvents)
    for (const [index, page] of pages.entries()) {
      const idToken = await tokenFrom(page).catch(() => null)
      if (!idToken) { console.error('匿名登入：', index, '無權杖'); continue }
      for (const path of [`privateInvites/${matchId}`, `pairing/matches/${matchId}`]) {
        const url = new URL(`${databaseUrl.replace(/\/$/, '')}/${path}.json`)
        url.searchParams.set('auth', idToken)
        const response = await fetch(url)
        const value = await response.json().catch(() => null)
        console.error('配對資料狀態：', index, path, response.status, value && typeof value === 'object' && 'error' in value ? value.error : value === null ? '不存在' : '存在')
      }
    }
    throw error
  }
  await Promise.all(pages.map((page) => page.locator('.tictactoe-cell').first().waitFor({ state: 'visible' })))
  await host.locator('.tictactoe-cell').first().click()
  await guest.locator('.tictactoe-cell--x').first().waitFor()
  await guest.locator('.tictactoe-cell').nth(1).click()
  await host.locator('.tictactoe-cell--o').first().waitFor()
  assert.equal(await host.locator('.tictactoe-cell--x').count(), 1)
  assert.equal(await guest.locator('.tictactoe-cell--o').count(), 1)
  await contexts[1].setOffline(true)
  await host.waitForFunction(() => [...document.querySelectorAll('.tictactoe-cell')].every((cell) => cell.disabled), null, { timeout: 20000 })
  await contexts[1].setOffline(false)
  await host.waitForFunction(() => [...document.querySelectorAll('.tictactoe-cell')].some((cell) => !cell.disabled), null, { timeout: 20000 })
  assert.equal(await guest.locator('.tictactoe-cell--x').count(), 1)
  assert.equal(await guest.locator('.tictactoe-cell--o').count(), 1)
  await host.getByRole('button', { name: '再玩一次', exact: true }).click()
  await guest.locator('.tictactoe-cell--x').first().waitFor({ state: 'detached' })
  assert.equal(await guest.locator('.tictactoe-cell--o').count(), 0)
  for (const [optionIndex, boardSelector, label] of [
    [1, '.number-gem-board', '數字寶石'],
    [2, '.animal-chess-board', '動物棋'],
    [3, '.gomoku-board', '五子棋'],
    [4, '.reversi-board', '黑白棋'],
    [5, '.dark-chess-game__board', '暗棋'],
  ]) {
    for (const page of pages) {
      await page.goto(base)
      await page.locator('.home-mode-panel .mode-button').nth(3).click()
      await page.locator('.game-picker-actions .mode-button').nth(optionIndex).click()
    }
    await host.getByRole('button', { name: '邀請朋友', exact: true }).click()
    const nextCode = (await host.getByRole('status', { name: '房號', exact: true }).textContent()).replace(/\D/g, '')
    assert(/^\d{8}$/.test(nextCode), `${label} 房號格式錯誤。`)
    matchId = nextCode
    matchIds.add(nextCode)
    await guest.getByRole('button', { name: '輸入房號', exact: true }).click()
    await guest.getByRole('textbox', { name: '房號', exact: true }).fill(nextCode)
    await guest.getByRole('button', { name: '加入遊戲', exact: true }).click()
    await Promise.all(pages.map((page) => page.locator(boardSelector).waitFor()))
    if (optionIndex === 1) {
      await host.locator('.number-gem-cell:not([disabled])').first().click()
      await guest.locator('.number-gem-cell--selected').first().waitFor()
    } else if (optionIndex === 2) {
      const before = await guest.locator('.animal-chess-cell').evaluateAll((cells) => cells.map((cell) => cell.dataset.pieceId ?? '').join('|'))
      await host.locator('.animal-chess-cell[data-piece-id]:not([disabled])').last().click()
      await host.locator('.animal-chess-cell--target').first().click()
      await guest.waitForFunction((signature) => [...document.querySelectorAll('.animal-chess-cell')].map((cell) => cell.dataset.pieceId ?? '').join('|') !== signature, before)
    } else if (optionIndex === 3) {
      await host.locator('.gomoku-cell:not([disabled])').first().click()
      await guest.locator('.gomoku-cell--black').first().waitFor()
    } else if (optionIndex === 4) {
      await host.locator('.reversi-cell--legal:not([disabled])').first().click()
      await guest.waitForFunction(() => document.querySelectorAll('.reversi-cell--black').length >= 4)
    } else {
      try { await host.locator('.dark-chess-game__cell--flip:not([disabled])').first().click() }
      catch (error) {
        console.error('暗棋棋盤狀態：', await Promise.all(pages.map((page) => page.evaluate(() => ({
          hidden: document.querySelectorAll('.dark-chess-game__cell--hidden').length,
          flips: document.querySelectorAll('.dark-chess-game__cell--flip').length,
          enabled: document.querySelectorAll('.dark-chess-game__cell:not([disabled])').length,
          status: document.querySelector('.dark-chess-game__turn')?.getAttribute('aria-label'),
        })))))
        console.error('暗棋服務請求：', workerEvents.filter((item) => item.game === 'dark-chess'))
        const idToken = await tokenFrom(host)
        const address = new URL(`${databaseUrl.replace(/\/$/, '')}/pairing/matches/${matchId}/presence.json`)
        address.searchParams.set('auth', idToken)
        const presence = await fetch(address).then((response) => response.json())
        console.error('在線狀態：', presence && typeof presence === 'object' ? Object.values(presence) : presence)
        throw error
      }
      await guest.locator('.dark-chess-game__cell--hidden').first().waitFor()
      await guest.waitForFunction(() => document.querySelectorAll('.dark-chess-game__cell--hidden').length === 31)
    }
    console.log(`${label} 雙瀏覽器熟人房號配對及首步同步：通過`)
  }
  assert.deepEqual(errors, [])
  console.log('井字棋雙瀏覽器熟人房號、雙向落子、斷線恢復與重新開局：通過')
} finally {
  for (const page of await Promise.all(contexts.map(async (context) => context.pages()[0]))) {
    try { const token = await tokenFrom(page); if (token) tokens.push(token) } catch { /* 未登入時沒有測試帳號 */ }
  }
  if (tokens[0]) {
    for (const id of matchIds) {
      const url = new URL(`${databaseUrl.replace(/\/$/, '')}/pairing/matches/${id}.json`)
      url.searchParams.set('auth', tokens[0])
      const removed = await fetch(url, { method: 'DELETE' }).catch(() => null)
      if (!removed?.ok) {
        const remaining = await fetch(url).catch(() => null)
        if (!remaining?.ok || await remaining.json() !== null) console.error('臨時房間清理未確認，房號：', id)
      }
    }
  }
  await Promise.all(tokens.map(async (idToken) => {
    const removed = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }),
    }).catch(() => null)
    if (!removed?.ok) console.error('臨時匿名帳號清理未確認。')
  }))
  await Promise.all(contexts.map((context) => context.close()))
  await browser?.close()
  server.kill()
}
