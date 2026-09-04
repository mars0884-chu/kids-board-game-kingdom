import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const stylesheet = readFileSync(path.resolve(scriptDirectory, '..', 'src', 'gomoku-overrides.css'), 'utf8')

const requiredRules = [
  {
    selector: '.gomoku-cell:nth-child(15n + 1)::before',
    declarations: ['left: 50%;', 'width: 50%;'],
  },
  {
    selector: '.gomoku-cell:nth-child(15n)::before',
    declarations: ['width: 50%;'],
  },
  {
    selector: '.gomoku-cell:nth-child(-n + 15)::after',
    declarations: ['top: 50%;', 'height: 50%;'],
  },
  {
    selector: '.gomoku-cell:nth-child(n + 211)::after',
    declarations: ['height: 50%;'],
  },
]

const failures = []

for (const rule of requiredRules) {
  const start = stylesheet.indexOf(`${rule.selector} {`)
  const end = start === -1 ? -1 : stylesheet.indexOf('}', start)
  const block = start === -1 || end === -1 ? '' : stylesheet.slice(start, end + 1)

  if (!block) {
    failures.push(`缺少封閉棋盤規則：${rule.selector}`)
    continue
  }

  for (const declaration of rule.declarations) {
    if (!block.includes(declaration)) {
      failures.push(`封閉棋盤規則缺少 ${declaration}：${rule.selector}`)
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure)
  }
  process.exit(1)
}

console.log('五子棋 15×15 封閉交點格線檢查通過。')
