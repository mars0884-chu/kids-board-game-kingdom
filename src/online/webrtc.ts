export type WebRtcSignalKind = 'offer' | 'answer'

export interface WebRtcSignalDescription {
  readonly type: WebRtcSignalKind
  readonly sdp: string
}

export interface WebRtcSignal {
  readonly protocol: 'kids-board-game-webrtc'
  readonly version: 1
  readonly sessionId: string
  readonly kind: WebRtcSignalKind
  readonly createdAt: number
  readonly description: WebRtcSignalDescription
}

export interface WebRtcPairingControls {
  readonly report: () => Promise<void>
  readonly block: () => Promise<void>
}

export interface WebRtcPeerSession {
  readonly sessionId: string
  readonly role: 'host' | 'guest'
  readonly connection: RTCPeerConnection
  readonly channel: RTCDataChannel
  readonly pairingCleanup?: () => void
  readonly pairingControls?: WebRtcPairingControls
}

export const WEBRTC_SIGNAL_QUERY = 'webrtc'
export const WEBRTC_SIGNAL_MAX_AGE_MS = 15 * 60 * 1000
export const WEBRTC_CHANNEL_NAME = 'kids-board-game-webrtc'
export const WEBRTC_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
export const WEBRTC_ICE_GATHERING_TIMEOUT_MS = 15_000
export const WEBRTC_CONNECTION_TIMEOUT_MS = 5 * 60 * 1000
export const WEBRTC_PEER_READY_TIMEOUT_MS = WEBRTC_CONNECTION_TIMEOUT_MS
export const WEBRTC_PEER_READY_RETRY_MS = 250
const SIGNAL_PREFIX = 'kids-board-game-webrtc-answer:'

function isSignalKind(value: unknown): value is WebRtcSignalKind {
  return value === 'offer' || value === 'answer'
}

function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{12,80}$/.test(value)
}

function isSignal(value: unknown): value is WebRtcSignal {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const description = candidate.description
  if (typeof description !== 'object' || description === null || Array.isArray(description)) return false
  const candidateDescription = description as Record<string, unknown>
  return candidate.protocol === 'kids-board-game-webrtc'
    && candidate.version === 1
    && isSessionId(candidate.sessionId)
    && isSignalKind(candidate.kind)
    && typeof candidate.createdAt === 'number'
    && Number.isFinite(candidate.createdAt)
    && isSignalKind(candidateDescription.type)
    && candidateDescription.type === candidate.kind
    && typeof candidateDescription.sdp === 'string'
    && candidateDescription.sdp.length > 0
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function createWebRtcSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const randomPart = Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${randomPart}`
}

export function encodeWebRtcSignal(signal: WebRtcSignal): string {
  if (!isSignal(signal)) throw new Error('WebRTC 連線資料格式不正確。')
  return encodeBase64Url(JSON.stringify(signal))
}

export function decodeWebRtcSignal(value: string, now = Date.now()): WebRtcSignal | null {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value))
    if (!isSignal(parsed)) return null
    if (Math.abs(now - parsed.createdAt) > WEBRTC_SIGNAL_MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function createWebRtcSignalLink(signal: WebRtcSignal, location: Location = window.location): string {
  const url = new URL(location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set(WEBRTC_SIGNAL_QUERY, encodeWebRtcSignal(signal))
  return url.toString()
}

export function readWebRtcSignal(location: Location = window.location): WebRtcSignal | null {
  const value = new URL(location.href).searchParams.get(WEBRTC_SIGNAL_QUERY)
  return value === null ? null : decodeWebRtcSignal(value)
}

export function canUseWebRtc(): boolean {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function'
}

function getPeerConnection(): RTCPeerConnection {
  if (!canUseWebRtc()) throw new Error('這台裝置的瀏覽器不支援裝置直連。')
  // 只使用公開 STUN 協助取得跨 NAT 的連線候選；不使用 TURN、中繼棋步或保存棋局。
  return new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS })
}

function waitForIceGathering(connection: RTCPeerConnection, timeoutMs = WEBRTC_ICE_GATHERING_TIMEOUT_MS): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      connection.removeEventListener('icegatheringstatechange', handleStateChange)
      resolve()
    }
    const handleStateChange = () => {
      if (connection.iceGatheringState === 'complete') finish()
    }
    const timeout = window.setTimeout(finish, timeoutMs)
    connection.addEventListener('icegatheringstatechange', handleStateChange)
  })
}

function descriptionFromConnection(connection: RTCPeerConnection, kind: WebRtcSignalKind): WebRtcSignalDescription {
  const description = connection.localDescription
  if (description === null || description.type !== kind || typeof description.sdp !== 'string' || description.sdp.length === 0) {
    throw new Error('WebRTC 連線資料尚未準備完成。')
  }
  return { type: kind, sdp: description.sdp }
}

export async function createWebRtcOffer(): Promise<{
  readonly connection: RTCPeerConnection
  readonly channel: RTCDataChannel
  readonly description: WebRtcSignalDescription
}> {
  const connection = getPeerConnection()
  try {
    const channel = connection.createDataChannel(WEBRTC_CHANNEL_NAME, { ordered: true })
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    await waitForIceGathering(connection)
    return { connection, channel, description: descriptionFromConnection(connection, 'offer') }
  } catch (error) {
    connection.close()
    throw error
  }
}

export async function acceptWebRtcOffer(signal: WebRtcSignal): Promise<{
  readonly connection: RTCPeerConnection
  readonly channel: Promise<RTCDataChannel>
  readonly description: WebRtcSignalDescription
}> {
  if (signal.kind !== 'offer') throw new Error('這不是邀請連線資料。')
  const connection = getPeerConnection()
  const channel = new Promise<RTCDataChannel>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('等待甲的連線逾時。')), WEBRTC_CONNECTION_TIMEOUT_MS)
    connection.addEventListener('datachannel', (event) => {
      window.clearTimeout(timeout)
      resolve(event.channel)
    }, { once: true })
  })
  try {
    await connection.setRemoteDescription(signal.description)
    const answer = await connection.createAnswer()
    await connection.setLocalDescription(answer)
    await waitForIceGathering(connection)
    return { connection, channel, description: descriptionFromConnection(connection, 'answer') }
  } catch (error) {
    connection.close()
    throw error
  }
}

export async function applyWebRtcAnswer(connection: RTCPeerConnection, signal: WebRtcSignal): Promise<void> {
  if (signal.kind !== 'answer') throw new Error('這不是回覆連線資料。')
  await connection.setRemoteDescription(signal.description)
}

export function waitForWebRtcChannel(channel: RTCDataChannel, timeoutMs = WEBRTC_CONNECTION_TIMEOUT_MS): Promise<void> {
  if (channel.readyState === 'open') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('兩台裝置尚未連線成功。'))
    }, timeoutMs)
    const handleOpen = () => {
      cleanup()
      resolve()
    }
    const handleClose = () => {
      cleanup()
      reject(new Error('連線在完成前中斷。'))
    }
    const cleanup = () => {
      window.clearTimeout(timeout)
      channel.removeEventListener('open', handleOpen)
      channel.removeEventListener('close', handleClose)
    }
    channel.addEventListener('open', handleOpen, { once: true })
    channel.addEventListener('close', handleClose, { once: true })
  })
}

interface WebRtcPeerReadyMessage {
  readonly protocol: 'kids-board-game-webrtc-ready'
  readonly sessionId: string
  readonly role: 'host' | 'guest'
}

export function waitForWebRtcPeerReady(
  channel: RTCDataChannel,
  sessionId: string,
  role: WebRtcPeerSession['role'],
  timeoutMs = WEBRTC_PEER_READY_TIMEOUT_MS,
): Promise<void> {
  const remoteRole = role === 'host' ? 'guest' : 'host'
  if (channel.readyState === 'closed' || channel.readyState === 'closing') {
    return Promise.reject(new Error('資料通道已關閉。'))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let timeout = 0
    let retryTimer = 0
    const cleanup = () => {
      window.clearTimeout(timeout)
      window.clearInterval(retryTimer)
      channel.removeEventListener('message', handleMessage)
      channel.removeEventListener('close', handleClose)
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') return
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return
      const message = parsed as Partial<WebRtcPeerReadyMessage>
      if (
        message.protocol !== 'kids-board-game-webrtc-ready'
        || message.sessionId !== sessionId
        || message.role !== remoteRole
      ) return
      finish()
    }
    const handleClose = () => finish(new Error('另一台裝置尚未完成連線。'))
    timeout = window.setTimeout(() => {
      finish(new Error('等待另一台裝置完成連線逾時。'))
    }, timeoutMs)
    channel.addEventListener('message', handleMessage)
    channel.addEventListener('close', handleClose)
    const readyMessage: WebRtcPeerReadyMessage = {
      protocol: 'kids-board-game-webrtc-ready',
      sessionId,
      role,
    }
    const sendReady = () => {
      if (settled) return
      if (channel.readyState !== 'open') {
        finish(new Error('資料通道尚未開啟。'))
        return
      }
      try {
        channel.send(JSON.stringify(readyMessage))
      } catch (error) {
        finish(error instanceof Error ? error : new Error('無法送出連線確認。'))
      }
    }
    // Safari 等瀏覽器的分頁事件時序可能讓第一個訊息早於對方監聽器建立；
    // 在等待期間重送同一個冪等確認，收到對方確認後由 cleanup 停止計時器。
    retryTimer = window.setInterval(sendReady, WEBRTC_PEER_READY_RETRY_MS)
    sendReady()
  })
}

interface AnswerRelayMessage {
  readonly protocol: 'kids-board-game-webrtc-answer'
  readonly sessionId: string
  readonly signal: WebRtcSignal
}

function answerStorageKey(sessionId: string): string {
  return `${SIGNAL_PREFIX}${sessionId}`
}

function relayMessageFor(signal: WebRtcSignal): AnswerRelayMessage {
  return { protocol: 'kids-board-game-webrtc-answer', sessionId: signal.sessionId, signal }
}

export function publishWebRtcAnswerToHost(signal: WebRtcSignal): void {
  if (signal.kind !== 'answer') throw new Error('只有回覆連線資料可以送回甲。')
  const message = relayMessageFor(signal)
  // 若回覆頁是由甲的原本頁面以新分頁開啟，優先直接送回原頁面。
  // 僅接受同源訊息；沒有 opener 時仍保留 BroadcastChannel／localStorage 路徑。
  try {
    if (window.opener !== null && window.opener !== window) {
      window.opener.postMessage(message, window.location.origin)
    }
  } catch {
    // 某些瀏覽器會封鎖跨分頁 opener；其他同源傳遞方式仍可使用。
  }
  if (typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel(`${WEBRTC_CHANNEL_NAME}:${signal.sessionId}`)
    channel.postMessage(message)
    // 某些瀏覽器在 postMessage 後立即 close 會取消尚未送出的分頁訊息。
    window.setTimeout(() => channel.close(), 1_000)
  }
  try {
    const key = answerStorageKey(signal.sessionId)
    const serialized = JSON.stringify(message)
    window.localStorage.setItem(key, serialized)
    window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(key) === serialized) window.localStorage.removeItem(key)
      } catch {
        // 忽略清理時的隱私模式限制。
      }
    }, WEBRTC_SIGNAL_MAX_AGE_MS)
  } catch {
    // 有些瀏覽器的隱私模式會封鎖 localStorage；BroadcastChannel 仍可能可用。
  }
}

export function subscribeWebRtcAnswer(
  sessionId: string,
  onAnswer: (signal: WebRtcSignal) => void,
): () => void {
  const channel = typeof BroadcastChannel === 'function'
    ? new BroadcastChannel(`${WEBRTC_CHANNEL_NAME}:${sessionId}`)
    : null
  const handleMessage = (event: MessageEvent<AnswerRelayMessage>) => {
    const message = event.data
    if (message?.protocol !== 'kids-board-game-webrtc-answer' || message.sessionId !== sessionId || !isSignal(message.signal) || message.signal.kind !== 'answer') return
    onAnswer(message.signal)
  }
  channel?.addEventListener('message', handleMessage)
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== answerStorageKey(sessionId) || event.newValue === null) return
    try {
      handleMessage({ data: JSON.parse(event.newValue) } as MessageEvent<AnswerRelayMessage>)
    } catch {
      // 忽略損壞的分頁間資料。
    }
  }
  const handleWindowMessage = (event: MessageEvent<AnswerRelayMessage>) => {
    if (event.origin !== window.location.origin) return
    handleMessage(event)
  }
  window.addEventListener('message', handleWindowMessage)
  window.addEventListener('storage', handleStorage)
  try {
    const stored = window.localStorage.getItem(answerStorageKey(sessionId))
    if (stored !== null) handleMessage({ data: JSON.parse(stored) } as MessageEvent<AnswerRelayMessage>)
  } catch {
    // 忽略損壞的暫存連線資料或被封鎖的 localStorage。
  }
  return () => {
    channel?.removeEventListener('message', handleMessage)
    channel?.close()
    window.removeEventListener('message', handleWindowMessage)
    window.removeEventListener('storage', handleStorage)
  }
}

export function closeWebRtcPeerSession(session: Pick<WebRtcPeerSession, 'connection' | 'channel' | 'pairingCleanup'>): void {
  session.channel.close()
  session.connection.close()
  session.pairingCleanup?.()
}
