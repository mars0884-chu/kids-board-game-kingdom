import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, get, ref, remove, set } from 'firebase/database'
import { createFriendInvitation, joinFriendInvitation } from '../src/online/firebase-friend'
import type { FirebaseServices } from '../src/online/firebase-pairing'
import { createJumpChessState, getLegalJumpMoves, applyJumpChessMove } from '../src/games/jump-chess/rules'

const apps = [0, 1, 2].map((index) => initializeApp({ projectId: 'demo-kids-board', apiKey: 'demo-key', databaseURL: 'https://demo-kids-board-default-rtdb.firebaseio.com' }, 'friend-' + index))
const services: FirebaseServices[] = []
beforeAll(async () => {
  for (const app of apps) {
    const database = getDatabase(app)
    connectDatabaseEmulator(database, '127.0.0.1', 9000)
    const auth = getAuth(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    services.push({ app, database, user: (await signInAnonymously(auth)).user })
  }
})
afterAll(async () => { await Promise.all(apps.map(deleteApp)) })

describe('熟人私人邀請：名額、權限與棋局', () => {
  it('連續撞號必須停止，不能覆寫或刪除既有邀請', async () => {
    const controller = new AbortController()
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint8Array).fill(0)
      return array
    })
    let invitation: Awaited<ReturnType<typeof createFriendInvitation>> | undefined
    try {
      invitation = await createFriendInvitation(controller.signal, services[0])
      await expect(createFriendInvitation(controller.signal, services[1])).rejects.toThrow('暫時')
      expect((await get(ref(services[0]!.database, 'privateInvites/' + invitation.id))).val().hostUid).toBe(services[0]!.user.uid)
    } finally { random.mockRestore(); controller.abort(); await invitation?.cancel() }
  })
  it('分享一次即可讓乙加入並同步，不建立 WebRTC 或公開配對票', async () => {
    const controller = new AbortController()
    const invitation = await createFriendInvitation(controller.signal, services[0])
    try {
      expect(invitation.link).toContain('#friend=' + invitation.id)
      expect(invitation.code).toMatch(/^\d{8}$/)
      const [host, guest] = await Promise.all([invitation.waitForGuest(), joinFriendInvitation(invitation.code.match(/.{4}/g)!.join(' '), controller.signal, services[1])])
      expect(host.role).toBe('host'); expect(guest.role).toBe('guest')
      expect(host.pairingControls).toBeUndefined()
      const state = createJumpChessState()
      const next = applyJumpChessMove(state, getLegalJumpMoves(state).find((move) => move.kind === 'step')!)
      await host.submit(next)
      await vi.waitFor(async () => expect((await get(ref(services[1]!.database, 'pairing/matches/' + invitation.id + '/board'))).val().revision).toBe(1), { timeout: 5000 })
      await expect(joinFriendInvitation(invitation.id, controller.signal, services[2])).rejects.toThrow()
      host.close(); guest.close()
    } finally { controller.abort(); await invitation.cancel() }
  })
  it('兩位朋友同時加入時只有一位取得名額', async () => {
    const controller = new AbortController()
    const invitation = await createFriendInvitation(controller.signal, services[0])
    try {
      const [host, attempts] = await Promise.all([
        invitation.waitForGuest(),
        Promise.allSettled([1, 2].map((index) => joinFriendInvitation(invitation.id, controller.signal, services[index]))),
      ])
      expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
      expect(attempts.filter((item) => item.status === 'rejected')).toHaveLength(1)
      host.close()
      attempts.forEach((item) => { if (item.status === 'fulfilled') item.value.close() })
    } finally { controller.abort(); await invitation.cancel() }
  })
  it('不可列出所有邀請，建立者不能加入自己，第三人不能改寫邀請', async () => {
    const controller = new AbortController()
    const invitation = await createFriendInvitation(controller.signal, services[0])
    try {
      await expect(get(ref(services[1]!.database, 'privateInvites'))).rejects.toThrow()
      await expect(joinFriendInvitation(invitation.id, controller.signal, services[0])).rejects.toThrow('朋友')
      await expect(set(ref(services[1]!.database, 'privateInvites/' + invitation.id), { hostUid: services[1]!.user.uid, expiresAt: Date.now() + 100000 })).rejects.toThrow()
    } finally { controller.abort(); await invitation.cancel() }
  })
  it('已取消邀請不能加入，也不能直接搶占棋局', async () => {
    const controller = new AbortController()
    const invitation = await createFriendInvitation(controller.signal, services[0])
    try {
      await remove(ref(services[0]!.database, 'privateInvites/' + invitation.id))
      await expect(joinFriendInvitation(invitation.id, controller.signal, services[1])).rejects.toThrow('過期')
      await expect(set(ref(services[1]!.database, 'pairing/matches/' + invitation.id + '/guestUid'), services[1]!.user.uid)).rejects.toThrow()
    } finally { controller.abort(); await invitation.cancel() }
  })
  it('取消等待會解除監聽並刪除本次邀請與棋局', async () => {
    const controller = new AbortController()
    const invitation = await createFriendInvitation(controller.signal, services[0])
    const waiting = invitation.waitForGuest()
    controller.abort()
    await expect(waiting).rejects.toThrow('取消')
    await invitation.cancel()
    expect((await get(ref(services[0]!.database, 'privateInvites/' + invitation.id))).exists()).toBe(false)
    expect((await get(ref(services[0]!.database, 'pairing/matches/' + invitation.id))).exists()).toBe(false)
  })
  it('期限到達後，服務及規則都拒絕加入', async () => {
    const controller = new AbortController()
    const invitation = await createFriendInvitation(controller.signal, services[0])
    try {
      const location = ref(services[0]!.database, 'privateInvites/' + invitation.id)
      await remove(location)
      await set(location, { hostUid: services[0]!.user.uid, expiresAt: Date.now() + 1000 })
      await new Promise((resolve) => setTimeout(resolve, 1100))
      await expect(joinFriendInvitation(invitation.id, controller.signal, services[1])).rejects.toThrow('過期')
      await expect(set(ref(services[1]!.database, 'pairing/matches/' + invitation.id + '/guestUid'), services[1]!.user.uid)).rejects.toThrow()
    } finally { controller.abort(); await invitation.cancel() }
  })
})
