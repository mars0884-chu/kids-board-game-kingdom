import entries from './child-text.json'

export interface ChildTextSegment {
  text: string
  bopomofo: string | null
}

export interface ChildTextEntry {
  id: string
  text_zh_tw: string
  segments: ChildTextSegment[]
  speech_zh_tw: string
  audio_asset: string
  audience: 'child'
}

const childTextEntries = entries as ChildTextEntry[]

export const childText = Object.fromEntries(
  childTextEntries.map((entry) => [entry.id, entry]),
) as Record<string, ChildTextEntry>

export const getChildText = (id: string): ChildTextEntry => {
  const entry = childText[id]

  if (!entry) {
    throw new Error(`找不到兒童文案：${id}`)
  }

  return entry
}
