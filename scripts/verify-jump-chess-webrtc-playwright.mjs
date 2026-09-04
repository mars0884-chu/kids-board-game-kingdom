import process from 'node:process'
import { chromium } from 'playwright'

const edgeExecutable = process.env.EDGE_EXECUTABLE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const baseUrl = process.env.JUMP_CHESS_WEBRTC_URL ?? 'http://127.0.0.1:5187/'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitFor(page, predicate, message, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return
    await page.waitForTimeout(100)
  }
  throw new Error(message)
}

async function clickHole(page, hole) {
  const box = await hole.boundingBox()
  assert(box !== null, '棋孔沒有可用的實際畫面位置。')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function boardSignature(page) {
  return page.locator('.jump-chess-hole').evaluateAll((holes) => holes.map((hole) => ({
    cell: hole.getAttribute('data-cell'),
    piece: hole.classList.contains('jump-chess-hole--player-one')
      ? 'player1'
      : hole.classList.contains('jump-chess-hole--player-two') ? 'player2' : null,
  })))
}

async function main() {
  const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-webrtc-hide-local-ips-with-mdns', '--disable-features=WebRtcHideLocalIpsWithMdns'] })
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async ({ url }) => {
        window.__sharedWebRtcLink = url
      },
    })
  })
  const host = await context.newPage()
  const guest = await context.newPage()
  const reply = await context.newPage()
  for (const page of [host, guest, reply]) page.setDefaultTimeout(8_000)
  for (const [name, page] of [['host', host], ['guest', guest], ['reply', reply]]) {
    page.on('pageerror', (error) => console.log(`${name}:pageerror:${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(`${name}:console-error:${message.text()}`)
    })
  }

  try {
    console.log('webrtc:host-open')
    await host.goto(`${baseUrl}?preview=jump-chess-online`, { waitUntil: 'domcontentloaded' })
    await host.waitForSelector('#webrtc-pairing-link')
    const inviteLink = await host.locator('#webrtc-pairing-link').inputValue()
    assert(inviteLink.includes('webrtc='), '甲的邀請連結沒有 WebRTC 資料。')
    assert(!inviteLink.includes('preview='), '邀請連結不應依賴預覽參數。')

    console.log('webrtc:guest-open-invite')
    await guest.goto(inviteLink, { waitUntil: 'domcontentloaded' })
    const replyButton = guest.getByRole('button', { name: '一鍵回覆給甲' })
    await replyButton.waitFor()
    await guest.locator('#webrtc-pairing-link').waitFor()
    const replyLink = await guest.locator('#webrtc-pairing-link').inputValue()
    assert(replyLink.includes('webrtc='), '乙的回覆連結沒有 WebRTC 資料。')
    assert(replyLink !== inviteLink, '乙的回覆連結不應與甲的邀請連結相同。')

    console.log('webrtc:guest-share-reply')
    await replyButton.click()
    const sharedReplyLink = await guest.evaluate(() => window.__sharedWebRtcLink)
    assert(sharedReplyLink === replyLink, '乙的一鍵回覆沒有交出回覆連結。')

    console.log('webrtc:host-open-reply')
    await reply.goto(sharedReplyLink, { waitUntil: 'domcontentloaded' })
    await reply.waitForSelector('[role="status"]')
    try {
      await waitFor(host, async () => (await host.locator('.jump-chess-board').count()) === 1, '甲開啟回覆連結後沒有自動進入棋盤。', 260)
    } catch (error) {
      const debug = await Promise.all([host, guest, reply].map(async (page) => page.evaluate(() => ({
        url: window.location.href,
        status: document.querySelector('.webrtc-pairing__status')?.getAttribute('aria-label') ?? document.querySelector('.webrtc-pairing__status')?.textContent ?? null,
        board: Boolean(document.querySelector('.jump-chess-board')),
      }))))
      console.log(JSON.stringify({ debug }, null, 2))
      throw error
    }
    await waitFor(guest, async () => (await guest.locator('.jump-chess-board').count()) === 1, '乙完成回覆後沒有自動進入棋盤。')

    assert(await host.locator('.jump-chess-piece').count() === 20, '甲連線後初始棋子不是 20 枚。')
    assert(await guest.locator('.jump-chess-piece').count() === 20, '乙連線後初始棋子不是 20 枚。')
    const before = await boardSignature(host)

    const firstPlayerPiece = host.locator('.jump-chess-hole--player-one').first()
    await clickHole(host, firstPlayerPiece)
    await waitFor(host, async () => (await host.locator('.jump-chess-hole--target').count()) > 0, '甲選取棋子後沒有合法目的格。')
    await clickHole(host, host.locator('.jump-chess-hole--target').first())
    await waitFor(host, async () => (await host.locator('.jump-chess-hole--selected').count()) === 0, '甲完成移動後仍保留選取狀態。')
    const after = await boardSignature(host)
    assert(JSON.stringify(before) !== JSON.stringify(after), '甲完成移動後局面沒有變化。')
    await waitFor(guest, async () => JSON.stringify(await boardSignature(guest)) === JSON.stringify(after), '甲的棋步沒有同步到乙。')

    console.log(JSON.stringify({
      browser: 'Microsoft Edge',
      baseUrl,
      pass: true,
      flow: ['甲建立邀請', '乙開啟邀請', '乙一鍵回覆', '甲開啟回覆', '雙方自動連線', '甲落子同步至乙'],
    }, null, 2))
  } finally {
    await context.close()
    await browser.close()
  }
}

await main()
