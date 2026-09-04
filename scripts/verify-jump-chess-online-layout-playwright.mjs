import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const edgeExecutable = process.env.EDGE_EXECUTABLE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.JUMP_CHESS_WEBRTC_URL ?? 'http://127.0.0.1:5187/'
const outputDirectory = path.join(os.tmpdir(), 'kids-board-game-jump-chess-online-layout')
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

async function inspectViewport(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.goto(`${baseUrl}?preview=jump-chess-online`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#webrtc-pairing-link')

  const metrics = await page.evaluate(() => {
    const root = document.querySelector('.webrtc-pairing')
    const card = document.querySelector('.webrtc-pairing__card')
    const buttons = Array.from(document.querySelectorAll('.webrtc-pairing__actions .child-action, .webrtc-pairing__tools .child-tool'))
    const rect = (element) => {
      if (!(element instanceof HTMLElement)) return null
      const box = element.getBoundingClientRect()
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      root: rect(root),
      card: rect(card),
      buttons: buttons.map((button) => {
        const label = button.querySelector('.child-control__label')
        const annotations = Array.from(button.querySelectorAll('.bopomofo-pair__annotation'))
        const buttonStyle = getComputedStyle(button)
        const labelStyle = label ? getComputedStyle(label) : null
        return {
          name: button.getAttribute('aria-label') ?? button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          rect: rect(button),
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
          labelClientWidth: label instanceof HTMLElement ? label.clientWidth : null,
          labelScrollWidth: label instanceof HTMLElement ? label.scrollWidth : null,
          fontSize: buttonStyle.fontSize,
          labelFontSize: labelStyle?.fontSize ?? null,
          annotationFontSizes: annotations.map((annotation) => getComputedStyle(annotation).fontSize),
        }
      }),
      hasPauseVoiceButton: buttons.some((button) => button.textContent?.includes('暫停語音') ?? false),
    }
  })

  assert(metrics.viewport.width === viewport.width && metrics.viewport.height === viewport.height, `${viewport.name} 視窗量測尺寸不符。`)
  assert(metrics.document.scrollWidth <= viewport.width, `${viewport.name} 發生水平溢出：${metrics.document.scrollWidth}px。`)
  assert(metrics.document.scrollHeight <= viewport.height, `${viewport.name} 發生垂直溢出：${metrics.document.scrollHeight}px。`)
  assert(metrics.root?.left >= -1 && metrics.root?.right <= viewport.width + 1, `${viewport.name} 連線頁超出左右安全邊界。`)
  assert(metrics.card?.left >= -1 && metrics.card?.right <= viewport.width + 1, `${viewport.name} 連線卡片超出左右安全邊界。`)
  assert(metrics.buttons.length === 3, `${viewport.name} 按鍵數量異常，預期分享、複製、返回共 3 個。`)
  assert(!metrics.hasPauseVoiceButton, `${viewport.name} 不應顯示「暫停語音」按鍵。`)

  for (const button of metrics.buttons) {
    assert(button.scrollWidth <= button.clientWidth + 1, `${viewport.name}「${button.name}」按鍵內容水平溢出。`)
    if (button.labelClientWidth !== null && button.labelScrollWidth !== null) {
      assert(button.labelScrollWidth <= button.labelClientWidth + 1, `${viewport.name}「${button.name}」文字內容水平溢出。`)
    }
    const labelFontSize = Number.parseFloat(button.labelFontSize ?? button.fontSize)
    assert(button.annotationFontSizes.every((fontSize) => Number.parseFloat(fontSize) < labelFontSize), `${viewport.name}「${button.name}」注音不符合小於漢字的比例。`)
    assert(button.rect !== null && button.rect.left >= -1 && button.rect.right <= viewport.width + 1, `${viewport.name}「${button.name}」超出左右邊界。`)
  }

  const screenshotPath = path.join(outputDirectory, `jump-chess-online-${viewport.name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  return { viewport: viewport.name, metrics, screenshotPath }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: edgeExecutable,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.setDefaultTimeout(8_000)

  try {
    const results = []
    for (const viewport of viewports) {
      results.push(await inspectViewport(page, viewport))
    }
    console.log(JSON.stringify({ browser: 'Microsoft Edge', baseUrl, pass: true, results }, null, 2))
  } finally {
    await context.close()
    await browser.close()
  }
}

await main()
