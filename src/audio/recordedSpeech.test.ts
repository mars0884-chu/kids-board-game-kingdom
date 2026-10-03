import { afterEach, describe, expect, it, vi } from 'vitest'
import { getChildText } from '../content/child-text'
import { recordedSpeechSource, warmRecordedSpeech } from './recordedSpeech'

afterEach(() => vi.restoreAllMocks())

describe('錄製語音預載', () => {
  it('可先取回畫面所需音檔，點擊時使用已準備好的本機音訊', async () => {
    const entry = { ...getChildText('home.adventure'), audio_asset: 'voice/11111111111111111111.m4a' }
    const fetchAudio = vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'audio/mp4' }),
      blob: async () => new Blob(['音訊'], { type: 'audio/mp4' }),
    } as Response)
    const makeUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ready-voice')

    warmRecordedSpeech(entry)
    warmRecordedSpeech(entry)
    await vi.waitFor(() => expect(recordedSpeechSource(entry)).toBe('blob:ready-voice'))
    expect(fetchAudio).toHaveBeenCalledTimes(1)
    expect(makeUrl).toHaveBeenCalledTimes(1)
  })
})
