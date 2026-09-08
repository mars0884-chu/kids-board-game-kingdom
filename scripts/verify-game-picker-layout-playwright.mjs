import process from 'node:process'
import { chromium } from 'playwright'

const edgeExecutable = process.env.EDGE_EXECUTABLE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.GAME_PICKER_URL ?? 'http://127.0.0.1:5187/'
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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
page.setDefaultTimeout(8_000)

try {
  const results = []
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto(`${baseUrl}?layout-check=${viewport.name}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.home-mode-panel .mode-button').nth(1).click()
    await page.waitForSelector('.game-picker-content')

    const before = await page.evaluate(() => ({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      buttonCount: document.querySelectorAll('.game-picker-actions .mode-button').length,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
    }))

    assert(before.viewport.width === viewport.width && before.viewport.height === viewport.height, `${viewport.name} 視窗量測尺寸不符。`)
    assert(before.document.scrollWidth <= viewport.width + 1, `${viewport.name} 發生水平溢出。`)
    assert(before.buttonCount === 7, `${viewport.name} 棋種按鍵數量不是 7。`)
    assert(before.bodyOverflowY === 'auto' || before.bodyOverflowY === 'scroll', `${viewport.name} 沒有開啟垂直捲動。`)

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const backButton = await page.locator('.game-picker-back').evaluate((element) => {
      const box = element.getBoundingClientRect()
      return { bottom: box.bottom, left: box.left, right: box.right, scrollY: window.scrollY }
    })
    assert(backButton.bottom <= viewport.height + 1, `${viewport.name} 捲到底後返回鍵仍超出畫面。`)
    assert(backButton.left >= -1 && backButton.right <= viewport.width + 1, `${viewport.name} 返回鍵水平超出畫面。`)

    results.push({
      viewport: viewport.name,
      scrollHeight: before.document.scrollHeight,
      scrollYAfter: backButton.scrollY,
      backBottomAfter: Math.round(backButton.bottom * 10) / 10,
    })
  }

  console.log(JSON.stringify({
    pass: true,
    browser: 'Microsoft Edge',
    baseUrl,
    results,
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
