import { afterAll, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, get, ref } from 'firebase/database'
import { joinFirebasePairing, type FirebasePairingSession } from '../src/online/firebase-pairing'

const apps: FirebaseApp[] = []
const controllers: AbortController[] = []
const sessions: FirebasePairingSession[] = []
afterAll(async () => {
  controllers.forEach((controller) => controller.abort())
  await Promise.all(sessions.map((session) => session.cancel()))
  await Promise.all(apps.map(deleteApp))
})

describe('多人同時隨機配對', () => {
  it('四位匿名玩家只能組成兩組，每組恰好一甲一乙', async () => {
    const services = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
      const app = initializeApp({ projectId: 'demo-kids-board', apiKey: 'demo-key', databaseURL: 'https://demo-kids-board-default-rtdb.firebaseio.com' }, `pairing-${index}`)
      apps.push(app)
      const auth = getAuth(app)
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
      const user = (await signInAnonymously(auth)).user
      const database = getDatabase(app)
      connectDatabaseEmulator(database, '127.0.0.1', 9000)
      return { app, user, database }
    }))
    const results = await Promise.all(services.map((service) => {
      const controller = new AbortController()
      controllers.push(controller)
      return joinFirebasePairing(undefined, controller.signal, service).then((session) => { sessions.push(session); return session })
    }))
    const groups = new Map<string, string[]>()
    for (const session of results) groups.set(session.matchId, [...(groups.get(session.matchId) ?? []), session.role])
    expect(groups.size).toBe(2)
    for (const roles of groups.values()) expect(roles.sort()).toEqual(['guest', 'host'])
    for (let index = 0; index < results.length; index++) {
      const match = (await get(ref(services[index]!.database, `pairing/matches/${results[index]!.matchId}`))).val()
      expect([match.hostUid, match.guestUid]).toContain(services[index]!.user.uid)
    }
  }, 25000)
})
