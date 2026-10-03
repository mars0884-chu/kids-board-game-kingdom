import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [false, vi.fn()],
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

// 測試環境沒有真正的音訊裝置；提供可完成的播放承諾以驗證介面流程。
vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
