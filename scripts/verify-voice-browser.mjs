import { chromium } from '@playwright/test'
import { readFileSync, statSync } from 'node:fs'

const rows = JSON.parse(readFileSync(new URL('../src/content/child-text.json', import.meta.url), 'utf8'))
const adventure = rows.find((entry) => entry.id === 'home.adventure')
const adventureBytes = statSync(new URL(`../public/${adventure.audio_asset}`, import.meta.url)).size

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await page.addInitScript(({ expectedBytes }) => {
    const nativeCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      if (blob.size === expectedBytes) window.__adventureVoiceReady = true
      return nativeCreateObjectURL(blob)
    }
    const NativeAudio = window.Audio
    window.Audio = function (source) {
      const audio = new NativeAudio(source)
      window.__voicePlayback = { source, createdAt: performance.now() }
      audio.addEventListener('playing', () => { window.__voicePlayback.playingAt = performance.now() })
      return audio
    }
  }, { expectedBytes: adventureBytes })
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
  await page.waitForFunction(() => window.__adventureVoiceReady === true)
  const updateNotice = page.locator('.pwa-notice')
  if (await updateNotice.isVisible()) await updateNotice.locator('.quiet-button').click()
  await page.locator('.utility-button--speech').click()
  await page.waitForFunction(() => window.__voicePlayback?.playingAt)
  await page.locator('.mode-button').first().click()
  await page.waitForFunction(() => window.__voicePlayback?.source?.startsWith('blob:') && window.__voicePlayback?.playingAt)
  const playback = await page.evaluate(() => window.__voicePlayback)
  const delay = Math.round(playback.playingAt - playback.createdAt)
  if (!playback.source.startsWith('blob:') || delay > 1000) throw new Error(`首頁冒險語音未即時播放：${JSON.stringify(playback)}`)
  console.log(`首頁冒險語音已從預載資料播放；建立音訊到開始有聲 ${delay} 毫秒。`)
} finally {
  await browser.close()
}
