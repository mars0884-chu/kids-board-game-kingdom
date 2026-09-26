import { describe, expect, it } from 'vitest'
import { isXiangqiAdventureSession, type XiangqiAdventureSession } from './storage'

const validSession: XiangqiAdventureSession = {
  levelIndex: 2,
  taskIndex: 1,
  hintLevel: 2,
  completedLevelIds: ['board-and-turns', 'chariot-and-cannon'],
  moveComplete: false,
  courseComplete: false,
}

describe('象棋冒險離線進度格式', () => {
  it('接受有效且不包含個人資料的課程進度', () => {
    expect(isXiangqiAdventureSession(validSession)).toBe(true)
  })

  it('拒絕超出段落／任務索引與未知完成項目的舊資料', () => {
    expect(isXiangqiAdventureSession({ ...validSession, levelIndex: 6 })).toBe(false)
    expect(isXiangqiAdventureSession({ ...validSession, taskIndex: 2 })).toBe(false)
    expect(isXiangqiAdventureSession({ ...validSession, completedLevelIds: ['unknown'] })).toBe(false)
    expect(isXiangqiAdventureSession(null)).toBe(false)
  })
})
