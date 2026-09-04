import { describe, expect, it } from 'vitest'
import { selectTaiwanSpeechVoice } from './useSpeech'

function createVoice(name: string, lang: string): SpeechSynthesisVoice {
  return { default: false, lang, localService: true, name, voiceURI: name } as SpeechSynthesisVoice
}

describe('台灣中文語音選擇', () => {
  it('只選擇有台灣來源標記的 zh-TW，不會先選到 zh-CN', () => {
    const china = createVoice('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN')
    const taiwan = createVoice('Microsoft Hanhan - Chinese (Traditional, Taiwan)', 'zh-TW')

    expect(selectTaiwanSpeechVoice([china, taiwan])).toBe(taiwan)
  })

  it('拒絕只有 zh-TW 標籤、但名稱沒有台灣來源證據的語音', () => {
    const mislabeled = createVoice('Generic Mandarin Voice', 'zh-TW')

    expect(selectTaiwanSpeechVoice([mislabeled])).toBeUndefined()
  })

  it('接受台灣語音的區域變體與名稱標記', () => {
    const regional = createVoice('Taiwan voice', 'zh-TW-x-voice')
    const named = createVoice('Chinese (Traditional, Taiwan)', 'zh-Hant')

    expect(selectTaiwanSpeechVoice([regional])).toBe(regional)
    expect(selectTaiwanSpeechVoice([named])).toBe(named)
  })

  it('沒有台灣語音時不偷偷指定中國國語音', () => {
    const china = createVoice('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN')

    expect(selectTaiwanSpeechVoice([china])).toBeUndefined()
  })
})
