import { useEffect, useRef, useState } from 'react'
import { BopomofoText } from '../components/BopomofoText'
import { ChildActionButton, ToolButton } from '../components/common-ui'
import { getChildText } from '../content/child-text'
import { FirebaseRandomPairing } from './FirebaseRandomPairing'
import { createFriendInvitation, joinFriendInvitation, readFriendInvite, isFriendRoomCode } from './firebase-friend'
import type { OnlineSession } from './online-session'
import type { FirebaseGameSession } from './firebase-game'
import { useSpeech } from '../hooks/useSpeech'
import './webrtc-pairing.css'

export function FirebaseFriendPairing({ onBack, onConnected }: {
  readonly onBack: () => void
  readonly onConnected: (session: OnlineSession) => void
}) {
  const [inviteId, setInviteId] = useState(readFriendInvite)
  const [phase, setPhase] = useState<'ready' | 'join' | 'connecting' | 'waiting' | 'error' | 'random'>(() =>
    new URLSearchParams(window.location.search).has('webrtc') ? 'error' : 'ready')
  const [errorKey, setErrorKey] = useState('online.friend_unavailable')
  const [link, setLink] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [enteredCode, setEnteredCode] = useState('')
  const [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  const cancel = useRef<(() => Promise<void>) | null>(null)
  const handedOff = useRef(false)
  const main = useRef<HTMLElement>(null)
  const { speak, isSupported } = useSpeech()
  function replay() {
    const entry = getChildText(message || status)
    speak(phase === 'waiting' && roomCode ? { ...entry, speech_zh_tw: entry.speech_zh_tw + '，房號，' + roomCode.split('').join('，') } : entry)
  }
  const status = phase === 'error' ? errorKey : phase === 'waiting' ? 'online.friend_waiting' :
    phase === 'connecting' ? 'online.friend_connecting' : phase === 'join' ? 'online.friend_enter_code' : inviteId !== null ? 'online.friend_join' : 'online.friend_ready'
  useEffect(() => { if (phase !== 'random' && isSupported) speak(getChildText(status)) }, [status, phase, isSupported, speak])

  function stop() {
    controller.current?.abort()
    controller.current = null
    void cancel.current?.()
    cancel.current = null
  }
  useEffect(() => () => { if (!handedOff.current) stop() }, [])
  useEffect(() => { main.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [phase])

  async function start(code?: string) {
    if (controller.current) return
    const attempt = new AbortController()
    controller.current = attempt
    setPhase('connecting'); setMessage('')
    // 網路初始化也必須有上限；等待朋友則由邀請本身的十分鐘期限管理。
    const timer = window.setTimeout(() => {
      attempt.abort()
      if (controller.current === attempt) {
        stop(); setErrorKey('online.friend_unavailable'); setPhase('error')
      }
    }, 45000)
    try {
      let session: FirebaseGameSession
      if (code !== undefined || inviteId !== null) {
        session = await joinFriendInvitation(code ?? inviteId!, attempt.signal)
      } else {
        const invitation = await createFriendInvitation(attempt.signal)
        if (attempt.signal.aborted) { void invitation.cancel(); return }
        cancel.current = invitation.cancel
        window.clearTimeout(timer)
        setLink(invitation.link); setRoomCode(invitation.code); setPhase('waiting')
        session = await invitation.waitForGuest()
      }
      if (attempt.signal.aborted) { session.close(); return }
      handedOff.current = true
      history.replaceState(null, '', window.location.pathname + window.location.search)
      onConnected(session)
    } catch (error) {
      if (!attempt.signal.aborted) {
        const reason = error instanceof Error ? error.message : ''
        setErrorKey(reason.includes('過期') ? 'online.friend_expired' :
          reason.includes('請讓朋友') ? 'online.friend_self' : 'online.friend_unavailable')
        stop(); setPhase('error')
      }
    } finally { window.clearTimeout(timer) }
  }
  function reset() {
    stop(); setLink(''); setRoomCode(''); setEnteredCode(''); setMessage(''); setInviteId(null)
    history.replaceState(null, '', window.location.pathname + window.location.search)
    setPhase('ready')
  }
  async function share(copyOnly = false) {
    try {
      if (!copyOnly && navigator.share) {
        await navigator.share({ title: getChildText('online.title').speech_zh_tw, url: link })
        setMessage('online.share_done')
      } else {
        await navigator.clipboard.writeText(link)
        setMessage('online.copy_done')
      }
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === 'AbortError' ? 'online.share_cancelled' : 'online.copy_failed')
    }
  }
  if (phase === 'random') return <FirebaseRandomPairing onBack={() => setPhase('ready')} onConnected={onConnected} />
  return <main ref={main} className="webrtc-pairing firebase-friend">
    <section className="webrtc-pairing__card" aria-labelledby="friend-title">
      <header className="webrtc-pairing__header">
        <span className="webrtc-pairing__icon" aria-hidden="true">↔</span>
        <BopomofoText as="h1" id="friend-title" className="webrtc-pairing__title" entry={getChildText('online.title')} />
      </header>
      <div className="webrtc-pairing__status" role="status" aria-live="polite"><BopomofoText entry={getChildText(status)} /></div>
      <BopomofoText className="webrtc-pairing__description" entry={getChildText('online.random_privacy_notice')} />
      {phase === 'waiting' && roomCode && <div className="firebase-friend__room">
        <BopomofoText entry={getChildText('online.friend_code')} />
        <output aria-label={getChildText('online.friend_code').text_zh_tw}>{roomCode.match(/.{1,4}/g)?.join(' ')}</output>
      </div>}
      {phase === 'join' && <label className="firebase-friend__room">
        <BopomofoText entry={getChildText('online.friend_code')} />
        <input aria-label={getChildText('online.friend_code').text_zh_tw} value={enteredCode} inputMode="numeric" autoComplete="off" maxLength={20}
          onChange={(event) => setEnteredCode(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && isFriendRoomCode(enteredCode)) void start(enteredCode) }} />
      </label>}
      {message && <div role="status"><BopomofoText entry={getChildText(message)} /></div>}
      <div className="webrtc-pairing__tools">
        {phase === 'ready' && <>
          <ChildActionButton entry={getChildText(inviteId !== null ? 'online.friend_join' : 'online.friend_ready')} icon="link" tone="primary" onClick={() => void start()} />
          {inviteId === null && <ChildActionButton entry={getChildText('online.friend_enter_code')} icon="link" tone="secondary" onClick={() => setPhase('join')} />}
          {inviteId === null && <ChildActionButton entry={getChildText('online.random_match')} icon="target" tone="secondary" onClick={() => setPhase('random')} />}
        </>}
        {phase === 'join' && <ChildActionButton entry={getChildText('online.friend_join')} icon="link" tone="primary" disabled={!isFriendRoomCode(enteredCode)} onClick={() => void start(enteredCode)} />}
        {phase === 'waiting' && <>
          <ChildActionButton entry={getChildText('online.share_offer')} icon="share" tone="primary" onClick={() => void share()} />
          <ChildActionButton entry={getChildText('online.copy_link')} icon="link" tone="secondary" onClick={() => void share(true)} />
        </>}
        {(phase === 'error' || phase === 'waiting') && <ChildActionButton entry={getChildText('online.friend_retry')} icon="retry" tone="secondary" onClick={reset} />}
        <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={replay} />
        <ToolButton entry={getChildText('common.back')} icon="back" onClick={() => { if (phase === 'join') reset(); else { stop(); onBack() } }} />
      </div>
    </section>
  </main>
}
