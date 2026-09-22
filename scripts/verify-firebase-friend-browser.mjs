import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('僅允許在 Firebase 模擬器內執行。')
const env = { ...process.env, VITE_FIREBASE_EMULATOR: '1', VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-kids-board.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://demo-kids-board-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-kids-board', VITE_FIREBASE_STORAGE_BUCKET: 'demo',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123', VITE_FIREBASE_APP_ID: 'demo', VITE_BASE_PATH: '/' }
const base = 'http://127.0.0.1:5193/'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5193', '--strictPort'], { env, stdio: 'inherit', windowsHide: true })
let browser
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('測試伺服器啟動失敗')
    try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
    await new Promise(r => setTimeout(r, 200))
  }
  assert(ready, '伺服器未啟動')
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? {
    executablePath: process.env.EDGE_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}) })
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })))
  for (const context of contexts) await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({url}) => { window.__friendLink = url } })
  })
  const [host, guest, third] = await Promise.all(contexts.map(c => c.newPage()))
  const errors = []
  async function clickHole(page, hole) {
    const box = await hole.boundingBox()
    assert(box, '棋孔須有實際位置')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  for (const page of [host, guest, third]) page.on('pageerror', e => errors.push(e.message))
  await host.goto(base + '?preview=jump-chess-online')
  await host.getByRole('button', { name: '邀請朋友', exact: true }).click()
  await host.getByRole('button', { name: '分享邀請連結', exact: true }).click()
  const link = await host.evaluate(() => window.__friendLink)
  assert(link.includes('#friend=') && !link.includes('preview=') && !link.includes('webrtc='))
  const code = await host.getByRole('status', { name: '房號', exact: true }).textContent()
  assert(/^\d{4} \d{4} \d{4}$/.test(code))
  await guest.goto(base + '?preview=jump-chess-online')
  await guest.getByRole('button', { name: '輸入房號', exact: true }).click()
  await guest.getByRole('textbox', { name: '房號', exact: true }).fill(code)
  await guest.getByRole('button', { name: '加入遊戲', exact: true }).click()
  await Promise.all([host, guest].map(p => p.locator('.jump-chess-board').waitFor()))
  const signature = p => p.locator('.jump-chess-hole').evaluateAll(holes => holes.map(h => [h.dataset.cell, h.classList.contains('jump-chess-hole--player-one'), h.classList.contains('jump-chess-hole--player-two')]))
  const waitEqual = async (p, expected) => {
    await p.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('.jump-chess-hole')].map(h => [h.dataset.cell, h.classList.contains('jump-chess-hole--player-one'), h.classList.contains('jump-chess-hole--player-two')])) === expected, JSON.stringify(expected))
  }
  for (const [player, peer, side] of [[host, guest, 'one'], [guest, host, 'two']]) {
    const before = await signature(player)
    const pieces = player.locator('.jump-chess-hole--player-' + side)
    await clickHole(player, side === 'one' ? pieces.first() : pieces.last())
    await player.locator('.jump-chess-hole--target').first().waitFor()
    await clickHole(player, player.locator('.jump-chess-hole--target').first())
    await player.waitForFunction(() => !document.querySelector('.jump-chess-hole--selected'))
    const after = await signature(player)
    assert.notDeepEqual(after, before)
    await waitEqual(peer, after)
  }
  await third.goto(link)
  await third.getByRole('button', { name: '加入遊戲', exact: true }).click()
  await third.getByRole('button', { name: '重新邀請', exact: true }).waitFor()
  assert.equal(await third.locator('.jump-chess-board').count(), 0)
  const saved = await signature(guest)
  await contexts[0].setOffline(true)
  await host.waitForFunction(() => [...document.querySelectorAll('.jump-chess-hole')].every(b => b.disabled))
  await contexts[0].setOffline(false)
  await host.waitForFunction(() => [...document.querySelectorAll('.jump-chess-hole')].some(b => !b.disabled))
  await waitEqual(guest, saved)
  await host.getByRole('button', { name: '返回', exact: true }).click()
  await guest.getByRole('button', { name: '返回', exact: true }).click()

  // 六種實際 viewport，保留原有 overflow、按鍵、注音門檻。
  const sizes = [[390,844],[844,390],[768,1024],[1024,768],[430,932],[932,430]]
  for (const [width,height] of sizes) {
    await host.setViewportSize({width,height})
    await host.goto(base + '?preview=jump-chess-online')
    await host.getByRole('button', { name: '輸入房號', exact: true }).click()
    const input = host.getByRole('textbox', { name: '房號', exact: true })
    await input.fill('1234 5678 9012')
    const inputBox = await input.boundingBox()
    assert(inputBox && inputBox.height >= 48 && inputBox.x >= 0 && inputBox.x + inputBox.width <= width)
    await host.getByRole('button', { name: '返回', exact: true }).click()
    await host.getByRole('button', { name: '邀請朋友', exact: true }).click()
    await host.getByRole('button', { name: '分享邀請連結', exact: true }).waitFor()
    const metrics = await host.evaluate(() => ({
      width: innerWidth, height: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      buttons: [...document.querySelectorAll('.webrtc-pairing button')].map(b => {
        const r = b.getBoundingClientRect(), label = b.querySelector('.child-control__label')
        return { name: label.getAttribute('aria-label'), client:b.clientWidth, scroll:b.scrollWidth, labelClient:label.clientWidth, labelScroll:label.scrollWidth, left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height,
          overflow:b.scrollWidth > b.clientWidth + 1 || label.scrollWidth > label.clientWidth + 1,
          annotations: [...b.querySelectorAll('.bopomofo-pair__annotation')].every(a => parseFloat(getComputedStyle(a).fontSize) < parseFloat(getComputedStyle(label).fontSize)) }
      })
    }))
    await host.screenshot({ path: path.join(os.tmpdir(), 'kids-friend-' + width + 'x' + height + '.png') })
    assert(metrics.sw <= width && metrics.sh <= height, JSON.stringify(metrics))
    assert.equal(metrics.buttons.length, 5)
    for (const b of metrics.buttons) assert(b.left >= 0 && b.right <= width && b.top >= 0 && b.bottom <= height && b.height >= 48 && !b.overflow && b.annotations, JSON.stringify({width,height,b}))
    await host.screenshot({ path: path.join(os.tmpdir(), 'kids-friend-' + width + 'x' + height + '.png') })
    await host.getByRole('button', { name: '返回', exact: true }).click()
    console.log('熟人等待版面通過：' + width + 'x' + height)
  }
  assert.deepEqual(errors, [])
  console.log('遊戲內房號、選用分享、獨立匿名身分、雙向棋步、第三人拒絕、六尺寸版面：通過')
} finally {
  await browser?.close()
  server.kill()
}
