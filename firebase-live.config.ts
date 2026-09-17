import { defineConfig } from 'vitest/config'

// 明確指定此設定才會接觸正式服務；一般回歸只使用模擬器。
export default defineConfig({
  test: {
    include: ['tests-live/*.live.ts'],
    environment: 'jsdom',
    testTimeout: 60000,
    hookTimeout: 30000,
    maxWorkers: 1,
  },
})
