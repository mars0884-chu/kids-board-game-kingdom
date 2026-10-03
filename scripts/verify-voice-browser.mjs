import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const rows = JSON.parse(readFileSync(new URL('../src/content/child-text.json', import.meta.url), 'utf8'))
const welcome = rows.find((entry) => entry.id === 'home.welcome')
const expectedPath = `/${welcome.audio_asset}`

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:4173/kids-board-game-kingdom/')
  const result = await page.evaluate(async () => {
    const url = '/kids-board-game-kingdom/voice/dfb977538b18bc861278.m4a'
    const response = await fetch(url)
    const bytes = await response.arrayBuffer()
    const context = new AudioContext()
    const sound = await context.decodeAudioData(bytes)
    await context.close()
    return { status: response.status, type: response.headers.get('content-type'), seconds: sound.duration, channels: sound.numberOfChannels }
  })
  if (result.status !== 200 || !result.type?.includes('audio/') || result.seconds < 0.3 || result.channels !== 1) {
    throw new Error(`瀏覽器語音驗證失敗：${JSON.stringify(result)}`)
  }
  console.log(`Edge 正式建置語音驗證通過：${JSON.stringify(result)}`)
  const request = page.waitForRequest((item) => item.url().endsWith(expectedPath))
  await page.locator('.utility-button--speech').click()
  await request
  console.log(`首頁「聽一聽」已請求正式台灣口音音檔：${expectedPath}`)
} finally {
  await browser.close()
}
