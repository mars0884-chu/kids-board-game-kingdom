/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
