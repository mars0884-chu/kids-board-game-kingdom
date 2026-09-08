import { useEffect, useRef, useState } from 'react'
import { BopomofoText } from '../components/BopomofoText'
import { ChildActionButton, ToolButton } from '../components/common-ui'
import { getChildText } from '../content/child-text'
import {
  isFirebasePairingConfigured,
  joinFirebasePairing,
  type FirebasePairingSession,
} from './firebase-pairing'
import {
  acceptWebRtcOffer,
  applyWebRtcAnswer,
  canUseWebRtc,
  createWebRtcOffer,
  createWebRtcSessionId,
  waitForWebRtcChannel,
  waitForWebRtcPeerReady,
  type WebRtcPeerSession,
  type WebRtcSignal,
} from './webrtc'
import './webrtc-pairing.css'

interface FirebaseRandomPairingProps {
  readonly onBack: () => void
  readonly onConnected: (session: WebRtcPeerSession) => void
}

type RandomPairingStatus = 'consent' | 'preparing' | 'waiting' | 'matched' | 'unsupported' | 'unavailable' | 'timeout' | 'error'

function statusEntry(status: RandomPairingStatus): string {
  switch (status) {
    case 'consent': return 'online.random_parent_notice'
    case 'preparing': return 'online.random_preparing'
    case 'waiting': return 'online.random_waiting'
    case 'matched': return 'online.random_matched'
    case 'unsupported': return 'online.unsupported'
    case 'unavailable': return 'online.random_unavailable'
    case 'timeout': return 'online.random_timeout'
    case 'error': return 'online.random_error'
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('等待時間到了')
}

export function FirebaseRandomPairing({ onBack, onConnected }: FirebaseRandomPairingProps) {
  const [consentGranted, setConsentGranted] = useState(false)
  const [status, setStatus] = useState<RandomPairingStatus>('consent')
  const [detail, setDetail] = useState('')
  const pairingRef = useRef<FirebasePairingSession | null>(null)
  const connectionRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const handedOffRef = useRef(false)

  useEffect(() => {
    if (!consentGranted || status === 'unsupported' || status === 'unavailable') return
    if (!canUseWebRtc()) {
      setStatus('unsupported')
      return
    }
    if (!isFirebasePairingConfigured()) {
      setStatus('unavailable')
      return
    }

    let active = true
    const start = async () => {
      try {
        const pairing = await joinFirebasePairing((nextStatus) => {
          if (!active) return
          setStatus(nextStatus === 'waiting' ? 'waiting' : nextStatus === 'matched' ? 'matched' : 'preparing')
        })
        if (!active) {
          await pairing.cancel()
          return
        }
        pairingRef.current = pairing
        if (pairing.role === 'host') {
          const result = await createWebRtcOffer()
          if (!active) {
            result.channel.close()
            result.connection.close()
            await pairing.cancel()
            return
          }
          connectionRef.current = result.connection
          channelRef.current = result.channel
          const offer: WebRtcSignal = {
            protocol: 'kids-board-game-webrtc',
            version: 1,
            sessionId: createWebRtcSessionId(),
            kind: 'offer',
            createdAt: Date.now(),
            description: result.description,
          }
          await pairing.publishOffer(offer)
          setStatus('matched')
          const answer = await pairing.waitForAnswer()
          await applyWebRtcAnswer(result.connection, answer)
          await waitForWebRtcChannel(result.channel)
          await waitForWebRtcPeerReady(result.channel, offer.sessionId, 'host')
          if (!active) return
          handedOffRef.current = true
          onConnected({
            sessionId: offer.sessionId,
            role: 'host',
            connection: result.connection,
            channel: result.channel,
            pairingCleanup: () => void pairing.cancel(),
            pairingControls: { report: pairing.report, block: pairing.block },
          })
          return
        }

        const offer = await pairing.waitForOffer()
        const result = await acceptWebRtcOffer(offer)
        if (!active) {
          result.connection.close()
          await pairing.cancel()
          return
        }
        connectionRef.current = result.connection
        const answer: WebRtcSignal = {
          protocol: 'kids-board-game-webrtc',
          version: 1,
          sessionId: offer.sessionId,
          kind: 'answer',
          createdAt: Date.now(),
          description: result.description,
        }
        await pairing.publishAnswer(answer)
        const channel = await result.channel
        channelRef.current = channel
        await waitForWebRtcChannel(channel)
        await waitForWebRtcPeerReady(channel, offer.sessionId, 'guest')
        if (!active) return
        handedOffRef.current = true
        onConnected({
          sessionId: offer.sessionId,
          role: 'guest',
          connection: result.connection,
          channel,
          pairingCleanup: () => void pairing.cancel(),
          pairingControls: { report: pairing.report, block: pairing.block },
        })
      } catch (error) {
        if (!active) return
        setStatus(isTimeoutError(error) ? 'timeout' : 'error')
        setDetail('online.random_error_detail')
        channelRef.current?.close()
        connectionRef.current?.close()
        await pairingRef.current?.cancel().catch(() => undefined)
      }
    }

    void start()
    return () => {
      active = false
      if (!handedOffRef.current) {
        channelRef.current?.close()
        connectionRef.current?.close()
        void pairingRef.current?.cancel()
      }
    }
  }, [consentGranted, onConnected])

  const handleConsent = () => {
    setStatus('preparing')
    setDetail('')
    setConsentGranted(true)
  }

  const statusText = getChildText(statusEntry(status))
  const isTerminal = status === 'unsupported' || status === 'unavailable' || status === 'timeout' || status === 'error'

  return (
    <main className="webrtc-pairing">
      <section className="webrtc-pairing__card" aria-labelledby="firebase-pairing-title">
        <header className="webrtc-pairing__header">
          <span className="webrtc-pairing__icon" aria-hidden="true">✦</span>
          <BopomofoText as="h1" className="webrtc-pairing__title" entry={getChildText('online.title')} />
        </header>

        <div className="webrtc-pairing__status" role="status" aria-live="polite">
          <BopomofoText entry={statusText} />
        </div>

        {status === 'consent' ? (
          <>
            <BopomofoText id="firebase-pairing-title" className="webrtc-pairing__subtitle" entry={getChildText('online.random_description')} />
            <BopomofoText className="webrtc-pairing__description" entry={getChildText('online.random_privacy_notice')} />
            <ChildActionButton entry={getChildText('online.random_consent')} icon="target" tone="primary" onClick={handleConsent} />
          </>
        ) : null}

        {detail !== '' ? <BopomofoText className="webrtc-pairing__error" entry={getChildText(detail)} /> : null}

        {status === 'waiting' ? (
          <BopomofoText className="webrtc-pairing__notes" entry={getChildText('online.random_waiting_detail')} />
        ) : null}

        {status === 'matched' ? (
          <BopomofoText className="webrtc-pairing__notes" entry={getChildText('online.random_matched_detail')} />
        ) : null}

        {isTerminal ? (
          <ChildActionButton entry={getChildText('online.random_retry')} icon="retry" tone="secondary" onClick={() => {
            setStatus('consent')
            setDetail('')
            setConsentGranted(false)
          }} />
        ) : null}

        <div className="webrtc-pairing__tools">
          <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
        </div>

      </section>
    </main>
  )
}
