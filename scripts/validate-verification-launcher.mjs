import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const rootDirectory = path.resolve(scriptDirectory, '..')
const launcher = readFileSync(path.join(rootDirectory, 'START_VERIFICATION.cmd'), 'utf8')
const wrapper = readFileSync(path.join(rootDirectory, '開始驗證.cmd'), 'utf8')
const server = readFileSync(path.join(scriptDirectory, 'serve-verification.mjs'), 'utf8')
const updatePrompt = readFileSync(path.join(rootDirectory, 'src', 'pwa', 'UpdatePrompt.tsx'), 'utf8')

const requiredFragments = [
  [launcher, 'Get-Content -LiteralPath \'package.json\' -Raw | ConvertFrom-Json', '啟動器沒有從封包讀取版本。'],
  [launcher, 'if not exist "dist\\index.html"', '啟動器沒有檢查完整封包的靜態 PWA 輸出。'],
  [launcher, 'set /a "VERIFY_PORT=49152 + (%RANDOM% * 16384 / 32768)"', '啟動器沒有使用臨時隨機連接埠。'],
  [launcher, 'set "VERIFY_PREVIEW=dark-chess-art-proposal"', '啟動器預設沒有開啟暗棋美術提案。'],
  [launcher, 'if /I "%~1"=="gomoku"', '啟動器沒有保留五子棋指定入口。'],
  [launcher, 'if /I "%~1"=="reversi-art-proposal"', '啟動器沒有保留黑白棋提案指定入口。'],
  [launcher, 'if /I "%~1"=="dark-chess"', '啟動器沒有保留暗棋規則驗證入口。'],
  [launcher, 'if /I "%~1"=="dark-chess-art-proposal"', '啟動器沒有保留暗棋美術提案驗證入口。'],
  [launcher, 'if /I "%~1"=="dark-chess-child"', '啟動器沒有保留暗棋兒童流程入口。'],
  [launcher, 'if /I "%~1"=="dark-chess-adventure"', '啟動器沒有保留暗棋冒險闖關入口。'],
  [launcher, 'if /I "%~1"=="dark-chess-local"', '啟動器沒有保留暗棋雙人同樂入口。'],
  [launcher, '?preview=%VERIFY_PREVIEW%^&verification=1', '啟動器沒有標示本機驗證模式。'],
  [wrapper, 'START_VERIFICATION.cmd" %*', '開始驗證啟動器沒有轉送遊戲參數。'],
  [server, "'Cache-Control': 'no-store'", '本機驗證伺服器仍允許快取資源。'],
  [updatePrompt, "get('verification') === '1'", '本機驗證模式仍會註冊 PWA 更新流程。'],
]

const failures = requiredFragments
  .filter(([source, fragment]) => !source.includes(fragment))
  .map(([, , message]) => message)

if (/set "VERIFY_VERSION=0\./.test(launcher)) {
  failures.push('啟動器仍硬編碼版本號，會再次誤判自己的驗證伺服器。')
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure)
  }
  process.exit(1)
}

console.log('本機驗證啟動器與防快取檢查通過。')
