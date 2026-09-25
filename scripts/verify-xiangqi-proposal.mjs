import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const output = path.resolve('art/proposals/screenshots/ART-011-r06')
mkdirSync(output, { recursive: true })
const base = 'http://127.0.0.1:5195/?preview=xiangqi-art-proposal'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5195', '--strictPort'], {
  env: { ...process.env, VITE_BASE_PATH: '/' }, stdio: 'inherit', windowsHide: true,
})
let browser
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error('開發伺服器未啟動。')
    try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert(ready, '象棋提案頁面無法載入。')
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? {
    executablePath: process.env.EDGE_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  } : {}) })
  for (const [name, width, height] of [['phone-portrait', 390, 844], ['phone-landscape', 844, 390], ['tablet-portrait', 768, 1024], ['tablet-landscape', 1024, 768]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('heading', { name: '象棋' }).waitFor()
    assert.equal(await page.getByRole('gridcell').count(), 90)
    const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      board: (() => { const box = document.querySelector('.xiangqi-game__board').getBoundingClientRect(); return { width: box.width, height: box.height } })(),
      frame: (() => { const box = document.querySelector('.xiangqi-game__board-wrap').getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right } })(),
    }))
    assert.equal(metrics.width, width)
    assert.equal(metrics.height, height)
    assert(metrics.scrollWidth <= width, `${name} 發生橫向溢位：${JSON.stringify(metrics)}`)
    assert(metrics.frame.top >= 0 && metrics.frame.bottom <= height && metrics.frame.left >= 0 && metrics.frame.right <= width, `${name} 棋盤未完整出現在目標視窗：${JSON.stringify(metrics)}`)
    assert(Math.abs(metrics.board.height / metrics.board.width - 9 / 8) < 0.02, `${name} 棋盤格線被拉伸。`)
    assert.deepEqual(errors, [])
    const file = path.join(output, `${name}-${width}x${height}.png`)
    await page.screenshot({ path: file, fullPage: false })
    if (name === 'phone-landscape') {
      const pieceFace = await page.locator('.xiangqi-game__cell--red').first().evaluate((element) => ({
        glyphSize: Number.parseFloat(getComputedStyle(element.querySelector('.bopomofo-text')).fontSize),
        annotationDisplay: getComputedStyle(element.querySelector('.bopomofo-pair__annotation')).display,
        centerOffset: (() => { const coin = element.getBoundingClientRect(); const glyph = element.querySelector('.bopomofo-pair__hanzi').getBoundingClientRect(); return (glyph.top + glyph.bottom - coin.top - coin.bottom) / 2 })(),
      }))
      assert(pieceFace.glyphSize === 20 && pieceFace.annotationDisplay === 'none', `棋面未依製作人要求縮小單字：${JSON.stringify(pieceFace)}`)
      assert(pieceFace.centerOffset < -1 && pieceFace.centerOffset >= -3, `棋面國字未依製作人要求由 r05 下修 1px：${JSON.stringify(pieceFace)}`)
      await page.getByRole('gridcell').nth(54).click()
      await page.locator('.xiangqi-game__selection .bopomofo-pair__annotation').waitFor()
      assert.notEqual(await page.locator('.xiangqi-game__selection .bopomofo-pair__annotation').evaluate((element) => getComputedStyle(element).display), 'none')
      assert.equal(await page.getByRole('button', { name: '放大棋盤' }).count(), 0)
      await page.locator('.xiangqi-game__board-wrap').evaluate((wrap) => {
        const rect = wrap.getBoundingClientRect()
        const points = (left, right) => [new Touch({ identifier: 1, target: wrap, clientX: rect.left + left, clientY: rect.top + 140 }), new Touch({ identifier: 2, target: wrap, clientX: rect.left + right, clientY: rect.top + 140 })]
        wrap.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: points(100, 180) }))
        wrap.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: points(55, 225) }))
      })
      await page.waitForFunction(() => document.querySelector('.xiangqi-game__board').getBoundingClientRect().width > 410)
      const zoom = await page.evaluate(() => {
        const wrap = document.querySelector('.xiangqi-game__board-wrap')
        const board = document.querySelector('.xiangqi-game__board')
        const piece = document.querySelector('.xiangqi-game__cell--red')
        return { scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth,
          scrollHeight: wrap.scrollHeight, clientHeight: wrap.clientHeight,
          boardWidth: board.getBoundingClientRect().width,
          pieceWidth: piece.getBoundingClientRect().width }
      })
      assert(zoom.boardWidth > metrics.board.width * 1.5, `放大後棋盤沒有變大：${JSON.stringify(zoom)}`)
      assert(zoom.scrollWidth > zoom.clientWidth && zoom.scrollHeight > zoom.clientHeight, `放大後無法雙向查看棋盤：${JSON.stringify(zoom)}`)
      assert(zoom.pieceWidth >= 48, `放大後棋子仍不易點選：${JSON.stringify(zoom)}`)
      await page.screenshot({ path: path.join(output, 'phone-landscape-zoom-844x390.png'), fullPage: false })
      await page.locator('.xiangqi-game__board-wrap').evaluate((wrap) => {
        const rect = wrap.getBoundingClientRect()
        const points = (left, right) => [new Touch({ identifier: 3, target: wrap, clientX: rect.left + left, clientY: rect.top + 140 }), new Touch({ identifier: 4, target: wrap, clientX: rect.left + right, clientY: rect.top + 140 })]
        wrap.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }))
        wrap.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: points(55, 225) }))
        wrap.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: points(100, 180) }))
      })
      await page.waitForFunction(() => document.querySelector('.xiangqi-game__board').getBoundingClientRect().width < 300)
    }
    if (name === 'phone-portrait') {
      await page.getByRole('gridcell').nth(54).click()
      await page.getByRole('gridcell').nth(45).click()
      await page.locator('.xiangqi-game__status[aria-label="黑方走"]').waitFor()
    }
    console.log(`${name}: ${width}×${height}，格線 ${Math.round(metrics.board.width)}×${Math.round(metrics.board.height)}，截圖 ${file}`)
    await page.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
