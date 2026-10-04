/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

interface ManifestEntry {
  integrity?: string
  revision: string | null
  url: string
}

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (ManifestEntry | string)[]
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// 語音按需下載並留在裝置快取，不增加首頁首次安裝的下載量。
registerRoute(({ url }) => url.origin === self.location.origin && /\/voice\/[0-9a-f]{20}\.m4a$/.test(url.pathname),
  new CacheFirst({ cacheName: 'chessy-voice-v2' }))

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('chessy-voice-v1'))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
