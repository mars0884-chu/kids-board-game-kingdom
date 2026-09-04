/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const packageVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

const normalizeBasePath = (value: string): string => {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = normalizeBasePath(env.VITE_BASE_PATH || '/')

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? packageVersion),
    },
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['icons/app-icon.svg', 'icons/app-icon-180.png', 'icons/app-icon-512.png'],
        manifest: {
          id: base,
          name: '綜合兒童棋藝大冒險',
          short_name: '棋藝大冒險',
          description: '專為兒童設計的棋藝與數學學習冒險遊戲',
          lang: 'zh-Hant-TW',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'any',
          background_color: '#fff8e8',
          theme_color: '#5b4bdb',
          categories: ['education', 'games', 'kids'],
          icons: [
            {
              src: 'icons/app-icon-180.png',
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/app-icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: 'icons/app-icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,json,woff2}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      testTimeout: 10_000,
      coverage: {
        reporter: ['text', 'html'],
      },
    },
  }
})
