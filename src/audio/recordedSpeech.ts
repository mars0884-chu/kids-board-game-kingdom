import type { ChildTextEntry } from '../content/child-text'

const prepared = new Map<string, string>()
const loading = new Set<string>()

function assetUrl(entry: ChildTextEntry): string | null {
  if (!entry.audio_asset.startsWith('voice/')) return null
  const basePath = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL
  return `${basePath}${entry.audio_asset}`
}

// 畫面出現時先取回短錄音，避免兒童點下按鍵後才開始跨網路下載。
export function warmRecordedSpeech(entry: ChildTextEntry): void {
  const url = assetUrl(entry)
  if (!url || !('fetch' in window) || !('createObjectURL' in URL) || prepared.has(url) || loading.has(url)) return
  loading.add(url)
  void window.fetch(url)
    .then((response) => {
      if (!response.ok || !response.headers.get('content-type')?.includes('audio/')) throw new Error('語音檔無法載入')
      return response.blob()
    })
    .then((blob) => prepared.set(url, URL.createObjectURL(blob)))
    .catch(() => {})
    .finally(() => loading.delete(url))
}

export function recordedSpeechSource(entry: ChildTextEntry): string | null {
  const url = assetUrl(entry)
  return url ? prepared.get(url) ?? url : null
}
