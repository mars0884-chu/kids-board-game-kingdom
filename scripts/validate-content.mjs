import { readFile } from 'node:fs/promises'

const contentPath = new URL('../src/content/child-text.json', import.meta.url)
const raw = await readFile(contentPath, 'utf8')
const content = JSON.parse(raw)

const requiredStringFields = [
  'id',
  'text_zh_tw',
  'speech_zh_tw',
  'audio_asset',
  'audience',
]
const simplifiedCharacters = /[这们为与发里门听说从万学儿游规开设数语败胜还进选请猫]/u
const hanCharacter = /\p{Script=Han}/u
const bopomofoSyllable = /^[ㄅ-ㄩ]+[ˊˇˋ˙]?$/u
const ids = new Set()
const errors = []

if (!Array.isArray(content)) {
  errors.push('兒童文案根節點必須是陣列。')
} else {
  for (const [index, entry] of content.entries()) {
    for (const field of requiredStringFields) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        errors.push(`第 ${index + 1} 筆文案缺少字串欄位：${field}`)
      }
    }

    if (entry.audience !== 'child') {
      errors.push(`第 ${index + 1} 筆文案 audience 必須是 child。`)
    }

    if (ids.has(entry.id)) {
      errors.push(`文案 id 重複：${entry.id}`)
    }
    ids.add(entry.id)

    if (simplifiedCharacters.test(entry.text_zh_tw) || simplifiedCharacters.test(entry.speech_zh_tw)) {
      errors.push(`文案疑似包含簡體中文：${entry.id}`)
    }

    if (!Array.isArray(entry.segments) || entry.segments.length === 0) {
      errors.push(`文案缺少逐字注音 segments：${entry.id}`)
      continue
    }

    const joinedText = entry.segments.map((segment) => segment?.text ?? '').join('')
    if (joinedText !== entry.text_zh_tw) {
      errors.push(`逐字片段無法還原 text_zh_tw：${entry.id}`)
    }

    for (const [segmentIndex, segment] of entry.segments.entries()) {
      const location = `${entry.id} 的第 ${segmentIndex + 1} 個片段`

      if (typeof segment?.text !== 'string' || Array.from(segment.text).length !== 1) {
        errors.push(`${location} 必須剛好包含一個字元。`)
        continue
      }

      if (segment.text !== segment.text.normalize('NFC')) {
        errors.push(`${location} 未使用 Unicode NFC 正規化。`)
      }

      if (hanCharacter.test(segment.text)) {
        if (typeof segment.bopomofo !== 'string' || !bopomofoSyllable.test(segment.bopomofo)) {
          errors.push(`${location} 缺少有效的逐字台灣注音。`)
        } else if (segment.bopomofo !== segment.bopomofo.normalize('NFC')) {
          errors.push(`${location} 的注音未使用 Unicode NFC 正規化。`)
        }
      } else if (segment.bopomofo !== null) {
        errors.push(`${location} 不是漢字，bopomofo 必須是 null。`)
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`兒童逐字右側注音檢查通過：${content.length} 筆。`)
