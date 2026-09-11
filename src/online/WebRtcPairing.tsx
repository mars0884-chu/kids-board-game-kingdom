import { useEffect, useMemo, useRef, useState } from 'react'
import { FirebaseRandomPairing } from './FirebaseRandomPairing'
import { BopomofoText } from '../components/BopomofoText'
import { ChildActionButton, ToolButton } from '../components/common-ui'
import { getChildText } from '../content/child-text'
import {
  acceptWebRtcOffer,
  applyWebRtcAnswer,
  canUseWebRtc,
  closeWebRtcPeerSession,
  createWebRtcOffer,
  createWebRtcSessionId,
  createWebRtcSignalLink,
  hasWebRtcSignalParameter,
  publishWebRtcAnswerToHost,
  readWebRtcSignal,
  subscribeWebRtcAnswer,
  WEBRTC_ESTABLISHMENT_TIMEOUT_MS,
  waitForWebRtcChannel,
  waitForWebRtcPeerReady,
  type WebRtcPeerSession,
  type WebRtcSignal,
} from './webrtc'
import './webrtc-pairing.css'

interface WebRtcPairingProps {
  readonly onBack: () => void
  readonly onConnected: (session: WebRtcPeerSession) => void
}

type PairingStatus =
  | 'unsupported'
  | 'ready-to-invite'
  | 'invalid-link'
  | 'preparing-offer'
  | 'waiting-for-answer'
  | 'preparing-reply'
  | 'reply-ready'
  | 'reply-sent'
  | 'waiting-for-peer'
  | 'connected'
  | 'error'

function statusEntry(status: PairingStatus): string {
  switch (status) {
    case 'unsupported': return 'online.unsupported'
    case 'ready-to-invite': return 'online.ready_to_invite'
    case 'invalid-link': return 'online.invalid_link'
    case 'preparing-offer': return 'online.preparing_offer'
    case 'waiting-for-answer': return 'online.waiting_for_answer'
    case 'preparing-reply': return 'online.preparing_reply'
    case 'reply-ready': return 'online.reply_ready'
    case 'reply-sent': return 'online.reply_sent'
    case 'waiting-for-peer': return 'online.waiting_for_peer'
    case 'connected': return 'online.connected'
    case 'error': return 'online.error'
  }
}

async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('這台裝置不允許複製連結。')
  await navigator.clipboard.writeText(value)
}

async function shareOrCopyLink(link: string, title: string, fallbackMessage: string): Promise<'shared' | 'copied'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: fallbackMessage, url: link })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
    }
  }
  await copyText(link)
  return 'copied'
}

export function WebRtcPairing({ onBack, onConnected }: WebRtcPairingProps) {
  const signal = useMemo(() => readWebRtcSignal(), [])
  const hasSignalParameter = useMemo(() => hasWebRtcSignalParameter(), [])
  const [status, setStatus] = useState<PairingStatus>(() => {
    if (!canUseWebRtc()) return 'unsupported'
    if (hasSignalParameter && signal === null) return 'invalid-link'
    if (signal?.kind === 'answer') return 'reply-ready'
    if (signal?.kind === 'offer') return 'preparing-reply'
    return 'ready-to-invite'
  })
  const [hostStarted, setHostStarted] = useState(false)
  const [link, setLink] = useState('')
  const [randomMode, setRandomMode] = useState(false)
  const [message, setMessage] = useState('')
  const sessionIdRef = useRef(signal?.sessionId ?? createWebRtcSessionId())
  const connectionRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const handedOffRef = useRef(false)
  const answerAppliedRef = useRef(false)
  const replyPublishedRef = useRef(false)

  useEffect(() => {
    if (!canUseWebRtc() || signal?.kind === 'answer' || (hasSignalParameter && signal === null) || randomMode || (!hostStarted && signal?.kind !== 'offer')) return
    let active = true

    const prepare = async () => {
      try {
        if (signal?.kind === 'offer') {
          setStatus('preparing-reply')
          const result = await acceptWebRtcOffer(signal)
          if (!active) {
            result.connection.close()
            return
          }
          connectionRef.current = result.connection
          const reply: WebRtcSignal = {
            protocol: 'kids-board-game-webrtc',
            version: 1,
            sessionId: signal.sessionId,
            kind: 'answer',
            createdAt: Date.now(),
            description: result.description,
          }
          setLink(createWebRtcSignalLink(reply))
          setStatus('reply-ready')
          const channel = await result.channel
          if (!active) {
            result.connection.close()
            return
          }
          channelRef.current = channel
          await waitForWebRtcChannel(channel, undefined, result.connection)
          if (!active) return
          setStatus('waiting-for-peer')
          await waitForWebRtcPeerReady(channel, signal.sessionId, 'guest', undefined, result.connection)
          if (!active) return
          setStatus('connected')
          handedOffRef.current = true
          onConnected({ sessionId: signal.sessionId, role: 'guest', connection: result.connection, channel })
          return
        }

        setStatus('preparing-offer')
        const result = await createWebRtcOffer()
        if (!active) {
          result.connection.close()
          result.channel.close()
          return
        }
        connectionRef.current = result.connection
        channelRef.current = result.channel
        const offer: WebRtcSignal = {
          protocol: 'kids-board-game-webrtc',
          version: 1,
          sessionId: sessionIdRef.current,
          kind: 'offer',
          createdAt: Date.now(),
          description: result.description,
        }
        setLink(createWebRtcSignalLink(offer))
        setStatus('waiting-for-answer')
      } catch {
        if (active) {
          channelRef.current?.close()
          connectionRef.current?.close()
          setStatus('error')
        }
      }
    }

    void prepare()
    return () => {
      active = false
      if (!handedOffRef.current) {
        connectionRef.current?.close()
        channelRef.current?.close()
      }
    }
  }, [hasSignalParameter, hostStarted, onConnected, randomMode, signal])

  useEffect(() => {
    if (!canUseWebRtc() || signal !== null || randomMode || !hostStarted) return
    const sessionId = sessionIdRef.current
    let active = true
    const unsubscribe = subscribeWebRtcAnswer(sessionId, (answer) => {
      if (answerAppliedRef.current) return
      answerAppliedRef.current = true
      const connection = connectionRef.current
      if (connection === null) {
        answerAppliedRef.current = false
        return
      }
      void applyWebRtcAnswer(connection, answer)
        .then(async () => {
          const channel = channelRef.current
          if (channel === null) throw new Error('找不到甲的資料通道。')
          // 甲已經套用乙的回覆；此後只等待直連建立，不再保留交回連結的五分鐘寬限。
          await waitForWebRtcChannel(channel, WEBRTC_ESTABLISHMENT_TIMEOUT_MS, connection)
          if (!active) return
          setStatus('waiting-for-peer')
          await waitForWebRtcPeerReady(channel, sessionId, 'host', undefined, connection)
          if (!active) return
          channelRef.current = channel
          setStatus('connected')
          handedOffRef.current = true
          onConnected({ sessionId, role: 'host', connection, channel })
        })
        .catch(() => {
          if (!active) return
          channelRef.current?.close()
          connectionRef.current?.close()
          setStatus('error')
        })
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [hostStarted, onConnected, randomMode, signal])

  useEffect(() => {
    if (signal?.kind !== 'answer' || replyPublishedRef.current) return
    replyPublishedRef.current = true
    publishWebRtcAnswerToHost(signal)
    setStatus('reply-sent')
  }, [signal])

  function handleCreateInvitation() {
    setMessage('')
    setStatus('preparing-offer')
    setHostStarted(true)
  }

  function handleRandomPairing() {
    connectionRef.current?.close()
    channelRef.current?.close()
    setLink('')
    setMessage('')
    setRandomMode(true)
  }

  async function handleShare() {
    if (link === '') return
    try {
      const result = await shareOrCopyLink(
        link,
        getChildText('online.title').speech_zh_tw,
        getChildText(signal?.kind === 'offer' ? 'online.share_offer' : 'online.share_reply').speech_zh_tw,
      )
      setMessage(result === 'shared' ? getChildText('online.share_done').text_zh_tw : getChildText('online.copy_done').text_zh_tw)
      if (signal?.kind === 'offer') setStatus('waiting-for-answer')
    } catch {
      setMessage(getChildText('online.share_cancelled').text_zh_tw)
    }
  }

  async function handleCopy() {
    if (link === '') return
    try {
      await copyText(link)
      setMessage(getChildText('online.copy_done').text_zh_tw)
      if (signal?.kind === 'offer') setStatus('waiting-for-answer')
    } catch {
      setMessage(getChildText('online.copy_failed').text_zh_tw)
    }
  }

  const isFreshPairing = signal === null && !hasSignalParameter && !hostStarted
  const isOffer = hostStarted && !hasSignalParameter && signal?.kind !== 'answer'
  if (randomMode) {
    return <FirebaseRandomPairing onBack={() => setRandomMode(false)} onConnected={onConnected} />
  }

  const title = isFreshPairing ? 'online.choose_connection' : signal?.kind === 'answer' ? 'online.reply_title' : signal?.kind === 'offer' ? 'online.reply_title' : 'online.invite_title'
  const description = isFreshPairing ? 'online.choose_connection_detail' : signal?.kind === 'answer' ? 'online.reply_description' : signal?.kind === 'offer' ? 'online.reply_description' : 'online.invite_description'
  const actionText = signal?.kind === 'offer' ? 'online.share_reply' : 'online.share_offer'

  return (
    <main className="webrtc-pairing">
      <section className="webrtc-pairing__card" aria-labelledby="webrtc-pairing-title">
        <header className="webrtc-pairing__header">
          <span className="webrtc-pairing__icon" aria-hidden="true">↔</span>
          <BopomofoText as="h1" className="webrtc-pairing__title" entry={getChildText('online.title')} />
        </header>

        <div className="webrtc-pairing__status" role="status" aria-live="polite">
          <BopomofoText entry={getChildText(statusEntry(status))} />
        </div>
        <BopomofoText id="webrtc-pairing-title" className="webrtc-pairing__subtitle" entry={getChildText(title)} />
        <BopomofoText className="webrtc-pairing__description" entry={getChildText(description)} />

        {status === 'error' || status === 'invalid-link' ? (
          <>
            <BopomofoText
              className="webrtc-pairing__error"
              entry={getChildText(status === 'invalid-link' ? 'online.invalid_link_detail' : 'online.error_detail')}
            />
            {status === 'error' ? (
              <ChildActionButton entry={getChildText('online.restart_connection')} icon="retry" tone="secondary" onClick={onBack} />
            ) : null}
          </>
        ) : null}
        {link !== '' && (status === 'waiting-for-answer' || status === 'reply-ready') ? (
          <div className="webrtc-pairing__link-box">
            <label htmlFor="webrtc-pairing-link">
              <BopomofoText entry={getChildText('online.link_label')} />
            </label>
            <input id="webrtc-pairing-link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
            <div className="webrtc-pairing__actions">
              <ChildActionButton entry={getChildText(actionText)} icon="share" tone="primary" onClick={() => void handleShare()} />
              <ChildActionButton entry={getChildText('online.copy_link')} icon="link" tone="secondary" onClick={() => void handleCopy()} />
            </div>
          </div>
        ) : null}

        {signal?.kind === 'answer' ? (
          <BopomofoText className="webrtc-pairing__sent" entry={getChildText('online.reply_sent_detail')} />
        ) : null}

        {message !== '' ? <p className="webrtc-pairing__message" role="status">{message}</p> : null}

        {!isFreshPairing ? (
          <div className="webrtc-pairing__notes">
            <BopomofoText entry={getChildText(isOffer ? 'online.keep_open' : 'online.no_server')} />
          </div>
        ) : null}

        <div className="webrtc-pairing__tools">
          {isFreshPairing ? (
            <>
              <ChildActionButton entry={getChildText('online.create_invitation')} icon="link" tone="primary" onClick={handleCreateInvitation} />
              <ChildActionButton entry={getChildText('online.random_match')} icon="target" tone="secondary" onClick={handleRandomPairing} />
            </>
          ) : null}
          <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
        </div>
      </section>
    </main>
  )
}

export { closeWebRtcPeerSession }
