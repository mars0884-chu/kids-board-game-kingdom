import { useEffect, useRef, useState } from 'react'
import { BopomofoText } from '../components/BopomofoText'
import { ChildActionButton, ToolButton } from '../components/common-ui'
import { getChildText } from '../content/child-text'
import {
  isFirebasePairingConfigured,
  joinFirebasePairing,
  type FirebasePairingSession,
} from './firebase-pairing'
import type { OnlineSession } from './online-session'
import type { OnlineGameId } from './game-id'
import './webrtc-pairing.css'

interface FirebaseRandomPairingProps<Session> {
  readonly onBack: () => void
  readonly gameId?: OnlineGameId
  readonly createGame?: (pairing: FirebasePairingSession, signal: AbortSignal) => Promise<Session>
  readonly onConnected: (session: Session) => void
}

type RandomPairingStatus = 'consent' | 'preparing' | 'waiting' | 'matched' | 'unsupported' | 'unavailable' | 'timeout' | 'connection-failed' | 'error'

function statusEntry(status: RandomPairingStatus): string {
  switch (status) {
    case 'consent': return 'online.random_parent_notice'
    case 'preparing': return 'online.random_preparing'
    case 'waiting': return 'online.random_waiting'
    case 'matched': return 'online.random_matched'
    case 'unsupported': return 'online.unsupported'
    case 'unavailable': return 'online.random_unavailable'
    case 'timeout': return 'online.random_timeout'
    case 'connection-failed': return 'online.random_connection_failed'
    case 'error': return 'online.random_error'
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('等待時間到了')
}


function closeSession(value: unknown) {
  if (value !== null && typeof value === 'object' && 'close' in value && typeof value.close === 'function') value.close()
}

export function FirebaseRandomPairing<Session = OnlineSession>({ onBack, onConnected, gameId = 'jump-chess', createGame }: FirebaseRandomPairingProps<Session>) {
  const [consentGranted, setConsentGranted] = useState(false)
  const [status, setStatus] = useState<RandomPairingStatus>('consent')
  const [detail, setDetail] = useState('')
  const pairingRef = useRef<FirebasePairingSession | null>(null)
  const gameRef = useRef<Session | null>(null)
  const handedOffRef = useRef(false)

  useEffect(() => {
    if (!consentGranted || status === 'unsupported' || status === 'unavailable') return

    if (!isFirebasePairingConfigured()) {
      setStatus('unavailable')
      return
    }

    let active = true
    const controller = new AbortController()
    const start = async () => {
      try {
        const pairing = await joinFirebasePairing((nextStatus) => {
          if (!active) return
          setStatus(nextStatus === 'waiting' ? 'waiting' : nextStatus === 'matched' ? 'matched' : 'preparing')
        }, controller.signal, undefined, gameId)
        if (!active) {
          await pairing.cancel()
          return
        }
        pairingRef.current = pairing
        const game = createGame ? await createGame(pairing, controller.signal) : await pairing.createGame(controller.signal) as unknown as Session
        gameRef.current = game
        if (!active) { closeSession(game); return }
        handedOffRef.current = true
        onConnected(game)
      } catch (error) {
        if (!active) return
        const connectionFailed = error instanceof Error && error.message.includes('完成連線逾時')
        setStatus(isTimeoutError(error) ? 'timeout' : connectionFailed ? 'connection-failed' : 'error')
        setDetail(connectionFailed ? 'online.random_connection_failed_detail' : 'online.random_error_detail')
        closeSession(gameRef.current)
        await pairingRef.current?.cancel().catch(() => undefined)
      }
    }

    void start()
    return () => {
      active = false
      if (!handedOffRef.current) {
        controller.abort()
        closeSession(gameRef.current)
        void pairingRef.current?.cancel()
      }
    }
  }, [consentGranted, createGame, gameId, onConnected])

  const handleConsent = () => {
    setStatus('preparing')
    setDetail('')
    setConsentGranted(true)
  }

  const statusText = getChildText(statusEntry(status))
  const isTerminal = status === 'unsupported' || status === 'unavailable' || status === 'timeout' || status === 'connection-failed' || status === 'error'

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
