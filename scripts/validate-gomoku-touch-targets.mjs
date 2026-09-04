import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const stylesheet = readFileSync(path.resolve(scriptDirectory, '..', 'src', 'styles.css'), 'utf8')

function lastMediaBlock(query) {
  const start = stylesheet.lastIndexOf(query)
  if (start === -1) return ''

  const openingBrace = stylesheet.indexOf('{', start)
  if (openingBrace === -1) return ''

  let depth = 0
  for (let index = openingBrace; index < stylesheet.length; index += 1) {
    if (stylesheet[index] === '{') depth += 1
    if (stylesheet[index] === '}') {
      depth -= 1
      if (depth === 0) return stylesheet.slice(openingBrace + 1, index)
    }
  }

  return ''
}

function ruleHasDeclaration(block, selector, declaration) {
  const start = block.indexOf(`${selector} {`)
  const end = start === -1 ? -1 : block.indexOf('}', start)
  return start !== -1 && end !== -1 && block.slice(start, end + 1).includes(declaration)
}

const phoneBlock = lastMediaBlock('@media (max-width: 430px)')
const landscapeBlock = lastMediaBlock('@media (orientation: landscape) and (max-height: 500px)')
const controlsSelector = '.gomoku-actions .child-action, .gomoku-tools .child-tool'
const failures = []

if (!ruleHasDeclaration(phoneBlock, controlsSelector, 'min-height: 3rem;')) {
  failures.push('手機直向的五子棋操作按鈕必須保有至少 48px 高度。')
}

if (!ruleHasDeclaration(landscapeBlock, '.gomoku-controls .difficulty-option', 'min-height: 3rem;')) {
  failures.push('手機橫向的五子棋難度按鈕必須保有至少 48px 高度。')
}

if (!ruleHasDeclaration(landscapeBlock, controlsSelector, 'min-height: 3rem;')) {
  failures.push('手機橫向的五子棋操作按鈕必須保有至少 48px 高度。')
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log('五子棋手機觸控目標檢查通過：難度與操作按鈕高度至少 48px。')
