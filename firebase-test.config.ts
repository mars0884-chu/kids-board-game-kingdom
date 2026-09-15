import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests-integration/*.integration.ts'],
    environment: 'jsdom',
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 1,
  },
})
