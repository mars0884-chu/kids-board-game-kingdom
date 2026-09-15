import type { WebRtcPeerSession } from './webrtc'
import type { FirebaseGameSession } from './firebase-game'

export type OnlineSession = WebRtcPeerSession | FirebaseGameSession

export function isFirebaseGameSession(session: OnlineSession): session is FirebaseGameSession {
  return 'transport' in session && session.transport === 'firebase'
}
