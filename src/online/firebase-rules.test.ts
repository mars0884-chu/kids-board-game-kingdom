import { describe, expect, it } from 'vitest'
import firebaseRules from '../../firebase.database.rules.json'

describe('Firebase 匿名配對規則', () => {
  it('允許已匿名登入玩家查詢配對佇列', () => {
    const queue = firebaseRules.rules.pairing.queue
    expect(queue['.read']).toBe('auth != null')
    expect(queue['.indexOn']).toContain('createdAt')
  })

  it('不允許玩家讀取檢舉資料', () => {
    expect(firebaseRules.rules.pairing.reports['$reportId']['.read']).toBe(false)
  })
})
