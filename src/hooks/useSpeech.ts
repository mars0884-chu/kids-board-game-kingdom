import { useCallback, useEffect, useState } from 'react'
import type { ChildTextEntry } from '../content/child-text'
import { recordedSpeechSource } from '../audio/recordedSpeech'
let activeAudio: HTMLAudioElement | null = null

export function selectTaiwanSpeechVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const normaliseLanguage = (language: string) => language.trim().toLowerCase().replaceAll('_', '-')
  const taiwanLanguage = (voice: SpeechSynthesisVoice) => {
    const language = normaliseLanguage(voice.lang)
    return language === 'zh-tw' || language.startsWith('zh-tw-')
  }
  const traditionalLanguage = (voice: SpeechSynthesisVoice) => /^zh-hant(?:-|$)/i.test(normaliseLanguage(voice.lang))
  // 語音引擎可能錯誤回報 zh-TW；只看語系標籤不足以證明實際口音。
  // Windows／Edge 常見的台灣語音家族，以及明確的 Taiwan 名稱標記，才可通過來源鎖定。
  const taiwanName = (voice: SpeechSynthesisVoice) =>
    /(taiwan|台灣|臺灣|hanhan|yating|zhiwei|hsiao[- ]?chen|hsiao[- ]?yu|yun[- ]?jhe)/iu.test(voice.name)

  return voices.find((voice) => taiwanLanguage(voice) && taiwanName(voice))
    ?? voices.find((voice) => traditionalLanguage(voice) && taiwanName(voice))
}

export function useSpeech() {
  const [isSupported, setIsSupported] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if ('Audio' in window) setIsSupported(true)
    if (!('speechSynthesis' in window)) return

    const synthesis = window.speechSynthesis
    const updateVoices = () => {
      const availableVoices = synthesis.getVoices()
      setVoices(availableVoices)
      // 沒有通過「台灣語系＋台灣來源標記」時保持停用；不得讓瀏覽器自行退回其他中文語音。
      setIsSupported(('Audio' in window)
        || selectTaiwanSpeechVoice(availableVoices) !== undefined)
    }
    updateVoices()
    synthesis.addEventListener('voiceschanged', updateVoices)

    return () => {
      synthesis.removeEventListener('voiceschanged', updateVoices)
      synthesis.cancel()
    }
  }, [])

  const speak = useCallback((entry: ChildTextEntry) => {
    activeAudio?.pause()
    activeAudio = null
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    const recording = entry.audio_asset
    if (recording.startsWith('voice/') && 'Audio' in window) {
      const audio = new Audio(recordedSpeechSource(entry)!)
      activeAudio = audio
      audio.onended = () => { if (activeAudio === audio) activeAudio = null; setIsPaused(false) }
      audio.onerror = () => { if (activeAudio === audio) activeAudio = null; setIsPaused(false) }
      setIsPaused(false)
      void audio.play().catch(() => { if (activeAudio === audio) activeAudio = null })
      return
    }
    if (!('speechSynthesis' in window)) return
    const availableVoices = window.speechSynthesis.getVoices()
    const taiwanVoice = selectTaiwanSpeechVoice(availableVoices.length > 0 ? availableVoices : voices)
    if (!taiwanVoice) {
      setIsSupported('Audio' in window)
      setIsPaused(false)
      return
    }

    const utterance = new SpeechSynthesisUtterance(entry.speech_zh_tw)
    utterance.lang = 'zh-TW'
    utterance.voice = taiwanVoice
    utterance.rate = 0.82
    utterance.pitch = 1.08
    utterance.onend = () => setIsPaused(false)
    utterance.onerror = () => setIsPaused(false)
    setIsPaused(false)
    window.speechSynthesis.speak(utterance)
  }, [voices])

  const togglePause = useCallback(() => {
    if (activeAudio) {
      if (activeAudio.paused) void activeAudio.play().then(() => setIsPaused(false)).catch(() => {})
      else { activeAudio.pause(); setIsPaused(true) }
      return
    }
    if (!('speechSynthesis' in window) || !window.speechSynthesis.speaking) {
      return
    }

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
      setIsPaused(false)
    } else {
      window.speechSynthesis.pause()
      setIsPaused(true)
    }
  }, [])

  return { isPaused, isSupported, speak, togglePause }
}
