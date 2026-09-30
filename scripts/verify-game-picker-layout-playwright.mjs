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
    await page.waitForSelector('.home-mode-panel .mode-button')

    const home = await page.evaluate(() => {
      const panel = document.querySelector('.home-mode-panel')
      const buttons = [...panel.querySelectorAll(':scope > .mode-button')]
      const rects = buttons.map((button) => {
        const bounds = button.getBoundingClientRect()
        const label = button.querySelector('.bopomofo-text')
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
          labelOverflow: label ? label.scrollWidth > label.clientWidth + 1 : false,
          labelWidth: label?.clientWidth ?? 0,
          labelScrollWidth: label?.scrollWidth ?? 0,
        }
      })
      const utilityRects = [...document.querySelectorAll('.home-utilities button')]
        .filter((button) => getComputedStyle(button).display !== 'none')
        .map((button) => button.getBoundingClientRect())
      const overlapsUtilities = rects.some((card) => utilityRects.some((utility) =>
        card.left < utility.right && card.right > utility.left
        && card.top < utility.bottom && card.bottom > utility.top))
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollWidth: document.documentElement.scrollWidth,
        gridRows: getComputedStyle(panel).gridTemplateRows.split(' ').length,
        distinctRows: new Set(rects.map((rect) => Math.round(rect.top))).size,
        buttonCount: buttons.length,
        rects,
        overlapsUtilities,
      }
    })

    assert(home.viewport.width === viewport.width && home.viewport.height === viewport.height, `${viewport.name} 首頁視窗量測尺寸不符。`)
    assert(home.scrollWidth <= viewport.width + 1, `${viewport.name} 首頁發生水平溢出。`)
    assert(home.buttonCount === 4 && home.gridRows === 2 && home.distinctRows === 2, `${viewport.name} 首頁模式入口未排列為兩排：${JSON.stringify(home)}。`)
    assert(home.rects.every((rect) => rect.width >= 48 && rect.height >= 48), `${viewport.name} 首頁模式觸控區小於 48px。`)
    assert(home.rects.every((rect) => rect.left >= -1 && rect.right <= viewport.width + 1 && rect.top >= -1 && rect.bottom <= viewport.height + 1), `${viewport.name} 首頁模式卡片超出可視範圍。`)
    assert(!home.rects.some((card, index) => home.rects.slice(index + 1).some((other) =>
      card.left < other.right && card.right > other.left && card.top < other.bottom && card.bottom > other.top)), `${viewport.name} 首頁模式卡片互相重疊。`)
    assert(!home.overlapsUtilities, `${viewport.name} 首頁模式卡片與底部工具重疊。`)
    assert(home.rects.every((rect) => !rect.labelOverflow), `${viewport.name} 首頁模式文案發生水平裁切：${JSON.stringify(home.rects)}。`)

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
      gridRows: getComputedStyle(document.querySelector('.game-picker-actions')).gridTemplateRows.split(' ').length,
      gridRowsRaw: getComputedStyle(document.querySelector('.game-picker-actions')).gridTemplateRows,
      gridColumnsRaw: getComputedStyle(document.querySelector('.game-picker-actions')).gridTemplateColumns,
      gridWidth: document.querySelector('.game-picker-actions').clientWidth,
      gridScrollWidth: document.querySelector('.game-picker-actions').scrollWidth,
      buttonTops: [...new Set([...document.querySelectorAll('.game-picker-actions .mode-button')].map((button) => Math.round(button.getBoundingClientRect().top)))],
      buttonRects: [...document.querySelectorAll('.game-picker-actions .mode-button')].map((button) => { const box = button.getBoundingClientRect(); return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width) } }),
    }))

    assert(before.viewport.width === viewport.width && before.viewport.height === viewport.height, `${viewport.name} 視窗量測尺寸不符。`)
    assert(before.document.scrollWidth <= viewport.width + 1, `${viewport.name} 發生水平溢出。`)
    assert(before.buttonCount === 9, `${viewport.name} 棋種按鍵數量不是 9。`)
    const expectedRows = viewport.width > 1050 ? 3 : 5
    assert(before.gridRows === expectedRows, `${viewport.name} 棋種按鈕排數錯誤：${JSON.stringify({ rows: before.gridRowsRaw, columns: before.gridColumnsRaw, buttons: before.buttonRects, width: before.gridWidth })}。`)
    assert(before.gridScrollWidth <= before.gridWidth + 1, `${viewport.name} 棋種選擇不應水平捲動。`)
    assert(before.bodyOverflowY === 'auto' || before.bodyOverflowY === 'scroll', `${viewport.name} 沒有開啟垂直捲動。`)

    const goButton = page.locator('.game-picker-actions .mode-button').nth(8)
    await goButton.scrollIntoViewIfNeeded()
    const goButtonVisible = await goButton.evaluate((button) => {
      const bounds = button.getBoundingClientRect()
      const scroller = button.closest('.game-picker-actions').getBoundingClientRect()
      return bounds.left >= scroller.left - 1 && bounds.right <= scroller.right + 1
    })
    assert(goButtonVisible, `${viewport.name} 圍棋入口未完整顯示。`)

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const backButton = await page.locator('.game-picker-back').evaluate((element) => {
      const box = element.getBoundingClientRect()
      return { bottom: box.bottom, left: box.left, right: box.right, scrollY: window.scrollY }
    })
    assert(backButton.bottom <= viewport.height + 1, `${viewport.name} 捲到底後返回鍵仍超出畫面。`)
    assert(backButton.left >= -1 && backButton.right <= viewport.width + 1, `${viewport.name} 返回鍵水平超出畫面。`)

    await page.locator('.game-picker-back').click()
    await page.locator('.home-mode-panel .mode-button').nth(3).click()
    await page.waitForSelector('.game-picker-content')
    const online = await page.evaluate(() => ({
      buttonCount: document.querySelectorAll('.game-picker-actions .mode-button').length,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    assert(online.buttonCount >= 1 && online.buttonCount <= 9, `${viewport.name} 線上棋種按鍵數量不在可用範圍。`)
    assert(online.scrollWidth <= viewport.width + 1, `${viewport.name} 線上選單水平溢出。`)

    results.push({
      viewport: viewport.name,
      scrollHeight: before.document.scrollHeight,
      gridRows: before.gridRows,
      gridScrollWidth: before.gridScrollWidth,
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
