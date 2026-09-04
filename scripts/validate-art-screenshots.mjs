import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectRoot = process.cwd()

const requiredScreenshots = [
  {
    file: 'art/previews/ART-005-r03-react-phone-portrait.jpg',
    width: 390,
    height: 844,
  },
]

const requiredGomokuScreenshots = []

const forbiddenProductionText = [
  'tictactoe-proposal--review-capture',
  'capture=review',
  'phone-portrait-review',
]

function readJpegSize(buffer, file) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error(`${file} 不是有效的 JPEG 正式實機截圖`)
  }

  const startOfFrameMarkers = new Set([
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ])

  let offset = 2

  while (offset + 8 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) {
      offset += 1
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1
    }

    const marker = buffer[offset]
    offset += 1

    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue
    }

    if (offset + 1 >= buffer.length) {
      break
    }

    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break
    }

    if (startOfFrameMarkers.has(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      }
    }

    offset += segmentLength
  }

  throw new Error(`${file} 找不到 JPEG 尺寸資料`)
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(entryPath)))
    } else if (/\.(?:css|html|js|jsx|mjs|ts|tsx)$/u.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

for (const screenshot of requiredScreenshots) {
  const absolutePath = path.join(projectRoot, screenshot.file)
  const buffer = await readFile(absolutePath)
  const actual = readJpegSize(buffer, screenshot.file)

  if (actual.width !== screenshot.width || actual.height !== screenshot.height) {
    throw new Error(
      `${screenshot.file} 必須是 ${screenshot.width}×${screenshot.height} 一比一正式實機截圖，實際為 ${actual.width}×${actual.height}`,
    )
  }
}

for (const screenshot of requiredGomokuScreenshots) {
  const absolutePath = path.join(projectRoot, screenshot.file)
  const actual = readJpegSize(await readFile(absolutePath), screenshot.file)
  if (actual.width !== screenshot.width || actual.height !== screenshot.height) {
    throw new Error(`${screenshot.file} 必須是 ${screenshot.width}×${screenshot.height} 的一比一正式程式截圖，實際為 ${actual.width}×${actual.height}`)
  }
}

const productionFiles = [
  ...(await listSourceFiles(path.join(projectRoot, 'src'))),
  ...(await listSourceFiles(path.join(projectRoot, 'public'))),
]

for (const file of productionFiles) {
  const source = await readFile(file, 'utf8')
  const forbidden = forbiddenProductionText.find((text) => source.includes(text))
  if (forbidden) {
    throw new Error(
      `${path.relative(projectRoot, file)} 含有禁止的截圖專用內容：${forbidden}`,
    )
  }
}

console.log('正式實機截圖檢查通過：1 張 390×844 一比一畫面，未發現截圖專用程式。')
