import { expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, get, ref, runTransaction, set } from 'firebase/database'

it('有效邀請只公開棋種，加入後才允許讀取整筆配對房間', async () => {
  const id = 'integration-friend-permissions'
  const apps = [0, 1].map((index) => initializeApp({ projectId: 'demo-kids-board', apiKey: 'demo-key', databaseURL: 'https://demo-kids-board-default-rtdb.firebaseio.com' }, id + '-' + index))
  const databases = apps.map((app) => { const database = getDatabase(app); connectDatabaseEmulator(database, '127.0.0.1', 9000); return database })
  const matchRef = ref(databases[0]!, `pairing/matches/${id}`)
  const inviteRef = ref(databases[0]!, `privateInvites/${id}`)
  try {
    const users = await Promise.all(apps.map(async (app) => {
      const auth = getAuth(app)
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
      return (await signInAnonymously(auth)).user
    }))
    const now = Date.now()
    await set(matchRef, {
      gameId: 'tic-tac-toe', hostUid: users[0]!.uid, guestUid: '',
      hostTicketId: id + '-host', guestTicketId: id + '-guest', createdAt: now, expiresAt: now + 600000,
    })
    await set(inviteRef, { hostUid: users[0]!.uid, expiresAt: now + 300000 })
    expect((await get(ref(databases[1]!, `pairing/matches/${id}/gameId`))).val()).toBe('tic-tac-toe')
    await expect(get(ref(databases[1]!, `pairing/matches/${id}`))).rejects.toThrow()
    const joined = await runTransaction(ref(databases[1]!, `pairing/matches/${id}/guestUid`),
      (uid) => uid === '' ? users[1]!.uid : undefined, { applyLocally: false })
    expect(joined.committed).toBe(true)
    expect((await get(ref(databases[1]!, `pairing/matches/${id}`))).val().guestUid).toBe(users[1]!.uid)
  } finally {
    await set(inviteRef, null).catch(() => undefined)
    await set(matchRef, null).catch(() => undefined)
    await Promise.all(apps.map((app) => deleteApp(app)))
  }
})
