import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rows = JSON.parse(readFileSync(resolve(root, 'src/content/child-text.json'), 'utf8'))
const expected = [...new Set(rows.filter((row) => row.audience === 'child').map((row) => row.speech_zh_tw))]
const files = new Set(readdirSync(resolve(root, 'public/voice')))

if (expected.length !== 461 || files.size !== expected.length) {
  throw new Error(`兒童語音數量不符：文案 ${expected.length}、音檔 ${files.size}`)
}
for (const row of rows.filter((entry) => entry.audience === 'child')) {
  const filename = `${createHash('sha256').update(row.speech_zh_tw).digest('hex').slice(0, 20)}.m4a`
  if (row.audio_asset !== `voice/${filename}` || !files.has(filename)) throw new Error(`缺少對應語音：${row.id}`)
  const bytes = readFileSync(resolve(root, 'public/voice', filename))
  if (bytes.length < 1000 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error(`音檔格式異常：${filename}`)
}
const adventureVoice = readFileSync(resolve(root, 'public/voice/a6c0e34b63f16dc70071.m4a'))
const adventureHash = createHash('sha256').update(adventureVoice).digest('hex').toUpperCase()
if (adventureHash !== '2DE0851953822F356B0997A71C1DBE17FF8F81514022EA62B2F0BBC356528608') {
  throw new Error('冒險闖關語音不是核准聲線的開頭淡入版本')
}
console.log(`台灣口音語音素材檢查通過：${expected.length} 句。`)
