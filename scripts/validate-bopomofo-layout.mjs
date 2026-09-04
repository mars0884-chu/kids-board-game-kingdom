import { readFile } from 'node:fs/promises'

const componentPath = new URL('../src/components/BopomofoText.tsx', import.meta.url)
const stylePath = new URL('../src/styles.css', import.meta.url)
const [component, styles] = await Promise.all([
  readFile(componentPath, 'utf8'),
  readFile(stylePath, 'utf8'),
])

const errors = []
const requiredComponentPatterns = [
  ['逐字 segments 必須逐項渲染', /entry\.segments\.map\(/u],
  ['每個中文字與注音必須共用同一個 ruby 配對', /<ruby[^>]+className="bopomofo-pair"/u],
  ['逐字配對必須保留自動測試識別', /data-bopomofo-pair/u],
  ['輕聲符號必須具有獨立定位類別', /bopomofo-pair__tone--neutral/u],
]
const requiredStylePatterns = [
  ['整句容器必須允許以完整逐字配對換行', /\.bopomofo-text\s*\{[^}]*flex-wrap:\s*wrap\s*;/su],
  ['逐字配對必須使用雙欄排版', /\.bopomofo-pair\s*\{[^}]*display:\s*inline-grid\s*;[^}]*grid-template-columns:\s*max-content max-content\s*;/su],
  ['注音符號必須直排', /\.bopomofo-pair__symbols\s*\{[^}]*writing-mode:\s*vertical-rl\s*;/su],
  ['注音符號必須保持正向字形', /\.bopomofo-pair__symbols\s*\{[^}]*text-orientation:\s*upright\s*;/su],
  ['輕聲符號必須定位於直排注音上方', /\.bopomofo-pair__tone--neutral\s*\{[^}]*grid-row:\s*1\s*;[^}]*grid-column:\s*1\s*;/su],
  ['短操作名稱必須保持完整單行', /\.child-control__label,[^{]*\{[^}]*flex-wrap:\s*nowrap\s*;[^}]*white-space:\s*nowrap\s*;/su],
  ['窄版必須重排操作格而非縮小必要文字', /@media \(max-width:\s*580px\)[^{]*\{[\s\S]*?\.common-ui-actions,[^{]*\{[^}]*grid-template-columns:\s*1fr\s*;/u],
]

for (const [message, pattern] of requiredComponentPatterns) {
  if (!pattern.test(component)) errors.push(message)
}

for (const [message, pattern] of requiredStylePatterns) {
  if (!pattern.test(styles)) errors.push(message)
}

if (/bopomofo-text__reading/u.test(component) || /bopomofo-text__reading/u.test(styles)) {
  errors.push('禁止恢復整行或整段注音容器。')
}

if (/\.bopomofo-text\s*\{[^}]*flex-direction:\s*column\s*;/su.test(styles)) {
  errors.push('禁止把中文字與注音改成上下兩行。')
}

if (errors.length > 0) {
  console.error(`逐字右側直排注音鎖定檢查失敗：\n${errors.join('\n')}`)
  process.exit(1)
}

console.log('逐字右側直排注音鎖定檢查通過。')
