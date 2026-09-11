import { createHash } from 'node:crypto'
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const workspaceDirectory = resolve(scriptDirectory, '..')
const releasesDirectory = join(workspaceDirectory, 'releases')
const supportedVersions = new Set(['v0.3.13', 'v0.3.14', 'v0.3.15', 'v0.3.16', 'v0.3.17', 'v0.3.18', 'v0.3.19', 'v0.3.20', 'v0.3.21', 'v0.3.22', 'v0.3.23', 'v0.3.24', 'v0.3.25', 'v0.3.26', 'v0.3.27', 'v0.3.28', 'v0.3.29', 'v0.4.0', 'v0.4.1', 'v0.4.2', 'v0.4.3', 'v0.4.4', 'v0.4.5', 'v0.4.6', 'v0.4.7', 'v0.4.8', 'v0.4.9', 'v0.4.10', 'v0.4.11', 'v0.4.12', 'v0.4.13', 'v0.4.14', 'v0.4.15', 'v0.4.16', 'v0.4.17', 'v0.4.18', 'v0.4.19', 'v0.4.20', 'v0.4.21', 'v0.4.22', 'v0.4.23', 'v0.5.2', 'v0.5.3', 'v0.5.4', 'v0.5.5', 'v0.6.1', 'v0.6.2', 'v0.6.3', 'v0.6.4', 'v0.6.5', 'v0.6.6', 'v0.6.7', 'v0.7.0', 'v0.7.1', 'v0.7.2', 'v0.7.3', 'v0.9.0', 'v0.9.1', 'v0.9.2', 'v0.9.3', 'v0.9.4', 'v0.9.5', 'v0.9.6', 'v0.9.7'])
supportedVersions.add('v0.9.8')
supportedVersions.add('v0.10.2')
supportedVersions.add('v0.10.3')
supportedVersions.add('v0.10.4')
supportedVersions.add('v0.10.5')
supportedVersions.add('v0.10.6')
let activeNpmCacheDirectory = null
const configuredNpmCacheDirectory = process.env.ARCHIVE_NPM_CACHE ?? null
const skipArchiveRebuild = process.env.ARCHIVE_SKIP_REBUILD === '1'

function fail(message) {
  throw new Error(message)
}

function run(command, args, cwd) {
  const env = activeNpmCacheDirectory === null
    ? process.env
    : { ...process.env, npm_config_cache: activeNpmCacheDirectory }
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit', shell: false, env })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with exit code ${result.status}.`)
}

function runNpm(args, cwd) {
  if (process.platform === 'win32') {
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], cwd)
    return
  }
  run('npm', args, cwd)
}

function normalisedRelative(root, target) {
  return relative(root, target).split(sep).join('/')
}

function shouldCopy(source) {
  const path = normalisedRelative(workspaceDirectory, source)
  if (path === '') return true
  if (path === 'node_modules' || path.startsWith('node_modules/')) return false
  if (path === 'dist' || path.startsWith('dist/')) return false
  if (path === 'releases' || path.startsWith('releases/')) return false
  if (path === '.git' || path.startsWith('.git/')) return false
  if (path === '.codex' || path.startsWith('.codex/')) return false
  if (path === '.agents' || path.startsWith('.agents/')) return false
  if (path === '.edge-evidence-temp' || path.startsWith('.edge-evidence-temp/')) return false
  if (path === '.firefox-art-probe-profile' || path.startsWith('.firefox-art-probe-profile/')) return false
  if (path === '.archive-npm-cache' || path.startsWith('.archive-npm-cache/')) return false
  if (path === 'dev-server.log') return false
  if (path === 'art/proposals' || path === 'art/proposals/screenshots' || path === 'art/proposals/screenshots/ART-008-r21') return true
  if (path.startsWith('art/proposals/screenshots/ART-008-r21/')) return true
  if (path.startsWith('art/proposals/')) return false
  if (path.startsWith('art/previews/ART-006-')) return false
  if (path === 'RELEASE_NOTES.md' || path === 'MANIFEST.sha256') return false
  return true
}

async function replaceRequired(filePath, from, to) {
  const original = await readFile(filePath, 'utf8')
  if (!original.includes(from)) fail(`Expected release-stage text was not found: ${filePath}`)
  await writeFile(filePath, original.replace(from, to), 'utf8')
}

async function removeRequired(filePath, text) {
  await replaceRequired(filePath, text, '')
}

async function setPackageVersion(stageDirectory, version) {
  const packagePath = join(stageDirectory, 'package.json')
  const packageLockPath = join(stageDirectory, 'package-lock.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const packageLock = JSON.parse(await readFile(packageLockPath, 'utf8'))
  packageJson.version = version.slice(1)
  packageLock.version = version.slice(1)
  packageLock.packages[''].version = version.slice(1)
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  await writeFile(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, 'utf8')
}

async function prepareV043(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'B2EDE6505729B005FE037DE75300319A9750004A981C9043C8E38A295790BD43'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV044(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'C4A3D9E9EB12B8DD7FE2EB0C8632FD3DCC399598E4557E8A7C79A7987F28C1E6'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV045(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = '6A61F0AE8744009CAD2B86D98C8C46209D338B00F0C6AE059C86C4D1D36FC744'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV046(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = '55125004D2BBBBC1903C82D5B3BE92F5078916E9EC0BA2E2CA46CC527806B708'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV047(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = '37EE83BB03865A3692B05CE8434A2D13568381538EFC6FD0142F89861ECB817D'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV048(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'ARCHIVE_HASH_V048_PENDING'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV049(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = '3FF6847CE3C54DFE379274A3A3708E5813B82A4423019F36A22E0AC9B3BE90AC'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV0410(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'ARCHIVE_HASH_V0410_PENDING'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV0411(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'ARCHIVE_HASH_V0411_PENDING'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV0412(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'ARCHIVE_HASH_V0412_PENDING'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV0413(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'ARCHIVE_HASH_V0413_PENDING'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV0414(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'ARCHIVE_HASH_V0414_PENDING'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV0415(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'ARCHIVE_HASH_V0415_PENDING'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV0416(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHash = 'ARCHIVE_HASH_V0416_PENDING'
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(currentArchiveHash)) {
      await writeFile(filePath, source.replaceAll(currentArchiveHash, archiveHashNote), 'utf8')
    }
  }
}

async function prepareV0417(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
    'RELEASE_NOTES.md',
  ]
  const currentArchiveHashes = [
    'ARCHIVE_HASH_V0417_PENDING',
    'B55F42DD281E4B9F80C8BF2BE783DB0C39F76D6FFFE12C32BC7050957E57922F',
  ]
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    let prepared = source
    for (const currentArchiveHash of currentArchiveHashes) {
      prepared = prepared.replaceAll(currentArchiveHash, archiveHashNote)
    }
    if (prepared !== source) {
      await writeFile(filePath, prepared, 'utf8')
    }
  }
}

async function prepareV0418(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHashes = [
    'ARCHIVE_HASH_V0418_PENDING',
    'ARCHIVE_HASH_V0417_PENDING',
    'B55F42DD281E4B9F80C8BF2BE783DB0C39F76D6FFFE12C32BC7050957E57922F',
  ]
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    let prepared = source
    for (const currentArchiveHash of currentArchiveHashes) {
      prepared = prepared.replaceAll(currentArchiveHash, archiveHashNote)
    }
    if (prepared !== source) await writeFile(filePath, prepared, 'utf8')
  }
}

async function prepareV0419(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHashes = [
    'ARCHIVE_HASH_V0419_PENDING',
    'ARCHIVE_HASH_V0418_PENDING',
    '1921F5D0A96532F46E974F76E27EAF555D22968798C7D75F3474F1B7874A92D2',
    '066A0E1A9AE3408F616662DCBB4CE8F697F7709DBC63E40988B6E48B35C874A1',
  ]
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    let prepared = source
    for (const currentArchiveHash of currentArchiveHashes) {
      prepared = prepared.replaceAll(currentArchiveHash, archiveHashNote)
    }
    if (prepared !== source) await writeFile(filePath, prepared, 'utf8')
  }
}

async function prepareV0420(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHashes = [
    'ARCHIVE_HASH_V0420_PENDING',
    'ARCHIVE_HASH_V0419_PENDING',
    '1921F5D0A96532F46E974F76E27EAF555D22968798C7D75F3474F1B7874A92D2',
    '066A0E1A9AE3408F616662DCBB4CE8F697F7709DBC63E40988B6E48B35C874A1',
  ]
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    let prepared = source
    for (const currentArchiveHash of currentArchiveHashes) {
      prepared = prepared.replaceAll(currentArchiveHash, archiveHashNote)
    }
    if (prepared !== source) await writeFile(filePath, prepared, 'utf8')
  }
}

async function prepareV0421(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHashes = [
    'ARCHIVE_HASH_V0421_PENDING',
    '725D70C69838B144805D4C98DCCD25B1467906422BCF4A2B11C2FFC377C7FB5A',
    '1921F5D0A96532F46E974F76E27EAF555D22968798C7D75F3474F1B7874A92D2',
    '066A0E1A9AE3408F616662DCBB4CE8F697F7709DBC63E40988B6E48B35C874A1',
  ]
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    let prepared = source
    for (const currentArchiveHash of currentArchiveHashes) {
      prepared = prepared.replaceAll(currentArchiveHash, archiveHashNote)
    }
    if (prepared !== source) await writeFile(filePath, prepared, 'utf8')
  }
}

async function prepareV0422(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHashes = [
    'ARCHIVE_HASH_V0422_PENDING',
    '9F1461195FC4CF442B14CC1B42D37D7F33B093F4D788DFC15738C84BFEEBBC2E',
    '725D70C69838B144805D4C98DCCD25B1467906422BCF4A2B11C2FFC377C7FB5A',
    '1921F5D0A96532F46E974F76E27EAF555D22968798C7D75F3474F1B7874A92D2',
  ]
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    let prepared = source
    for (const currentArchiveHash of currentArchiveHashes) {
      prepared = prepared.replaceAll(currentArchiveHash, archiveHashNote)
    }
    if (prepared !== source) await writeFile(filePath, prepared, 'utf8')
  }
}

async function prepareV0423(stageDirectory) {
  const stagedAuthorityFiles = [
    'PROJECT_STATUS.md',
    'HANDOFF.md',
    'README.md',
    'ART_APPROVALS.md',
  ]
  const currentArchiveHashes = [
    'ARCHIVE_HASH_V0423_PENDING',
    'FD5877E86A97DC2CE7D7C164D569B77517127ADE4B7720EC6500A1D9564035DB',
    '9F1461195FC4CF442B14CC1B42D37D7F33B093F4D788DFC15738C84BFEEBBC2E',
    '725D70C69838B144805D4C98DCCD25B1467906422BCF4A2B11C2FFC377C7FB5A',
  ]
  const archiveHashNote = '請以封存旁同名 .sha256 檔案為準'
  for (const relativePath of stagedAuthorityFiles) {
    const filePath = join(stageDirectory, relativePath)
    const source = await readFile(filePath, 'utf8')
    let prepared = source
    for (const currentArchiveHash of currentArchiveHashes) {
      prepared = prepared.replaceAll(currentArchiveHash, archiveHashNote)
    }
    if (prepared !== source) await writeFile(filePath, prepared, 'utf8')
  }
}

async function prepareV0313(stageDirectory) {
  await setPackageVersion(stageDirectory, 'v0.3.13')

  await rm(join(stageDirectory, 'src', 'games', 'gomoku', 'board-navigation.ts'))
  await rm(join(stageDirectory, 'src', 'games', 'gomoku', 'board-navigation.test.ts'))
  await rm(join(stageDirectory, 'scripts', 'build-validation-archives.mjs'))

  const proposalPath = join(stageDirectory, 'src', 'games', 'gomoku', 'GomokuProposal.tsx')
  await removeRequired(proposalPath, "import { useGomokuBoardKeyboardNavigation } from './board-navigation'\n")
  await removeRequired(proposalPath, "  const { getCellNavigationProps } = useGomokuBoardKeyboardNavigation({ board: state.board, isLocked: boardLocked })\n")
  await replaceRequired(proposalPath, ' aria-rowcount={15} aria-colcount={15}', '')
  await removeRequired(proposalPath, '                  const move = index as GomokuMove\n')
  await replaceRequired(proposalPath, 'key={move}', 'key={index}')
  await removeRequired(proposalPath, "                      aria-rowindex={Math.floor(move / 15) + 1}\n                      aria-colindex={(move % 15) + 1}\n")
  await replaceRequired(proposalPath, 'onClick={() => chooseCell(move)}\n                      {...getCellNavigationProps(move)}', 'onClick={() => chooseCell(index)}')

  const adventurePath = join(stageDirectory, 'src', 'games', 'gomoku', 'GomokuAdventure.tsx')
  await removeRequired(adventurePath, "import { useGomokuBoardKeyboardNavigation } from './board-navigation'\n")
  await removeRequired(adventurePath, "  const { getCellNavigationProps } = useGomokuBoardKeyboardNavigation({ board: state.board, isLocked: boardLocked })\n")
  await replaceRequired(adventurePath, ' aria-rowcount={15} aria-colcount={15}', '')
  await removeRequired(adventurePath, '                  const move = index as GomokuMove\n')
  await replaceRequired(adventurePath, 'key={move}', 'key={index}')
  await removeRequired(adventurePath, "                      aria-rowindex={Math.floor(move / 15) + 1}\n                      aria-colindex={(move % 15) + 1}\n")
  await replaceRequired(adventurePath, 'onClick={() => chooseCell(move)}\n                      {...getCellNavigationProps(move)}', 'onClick={() => chooseCell(index)}')

  await replaceRequired(
    join(stageDirectory, 'src', 'components', 'common-ui', 'FeedbackCard.tsx'),
    '<article className={`feedback-card feedback-card--${tone}`} aria-live="polite" aria-atomic="true">',
    '<article className={`feedback-card feedback-card--${tone}`}>',
  )

  await removeRequired(join(stageDirectory, 'src', 'games', 'gomoku', 'GomokuProposal.test.tsx'), `

  it('棋盤保留單一鍵盤焦點，並可用方向鍵移到下一個空交點', () => {
    render(<GomokuProposal mode="local" onBack={vi.fn()} storage={emptyStorage} />)
    const cells = within(screen.getByRole('grid')).getAllByRole('gridcell')

    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1)
    expect(cells[112]).toHaveAttribute('aria-rowindex', '8')
    expect(cells[112]).toHaveAttribute('aria-colindex', '8')

    cells[112]!.focus()
    fireEvent.keyDown(cells[112]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cells[113])
  })`)
  await removeRequired(join(stageDirectory, 'src', 'components', 'common-ui', 'CommonUi.test.tsx'), `

  it('回饋卡會以不打斷操作的方式通知新提示', () => {
    const { container } = render(<CommonUiPreview onBack={vi.fn()} />)
    const feedbackCard = container.querySelector('.feedback-card')

    expect(feedbackCard).toHaveAttribute('aria-live', 'polite')
    expect(feedbackCard).toHaveAttribute('aria-atomic', 'true')
  })`)
  await removeRequired(join(stageDirectory, 'src', 'styles.css'), `

/* 鍵盤焦點保持在棋盤格內，不以全畫面效果干擾兒童操作。 */
.gomoku-cell:focus-visible {
  z-index: 2;
  outline: 0.15rem solid #fff;
  outline-offset: -0.15rem;
  box-shadow: 0 0 0 0.18rem var(--blue-dark), inset 0 0.1rem 0 rgb(255 255 255 / 60%);
}
`)

  const readmePath = join(stageDirectory, 'README.md')
  await replaceRequired(readmePath, 'v0.3.14 已完成五子棋鍵盤交點導覽與提示回饋可讀性修訂', 'v0.3.13 已完成手機觸控尺寸修訂')

  const handoffPath = join(stageDirectory, 'HANDOFF.md')
  await replaceRequired(handoffPath, 'v0.3.14`（`BLOCKED`；v0.3.12 已確認封存，五子棋功能、觸控尺寸、鍵盤交點導覽與提示可讀性修訂完成', 'v0.3.13`（`BLOCKED`；v0.3.12 已確認封存，五子棋功能與觸控尺寸修訂完成')
  await removeRequired(handoffPath, 'v0.3.14 將十五乘十五棋盤改為單一 Tab 進入點，讓方向鍵在格內移動並略過已落子交點，提示卡則以不打斷操作的方式通知變化；這項純技術修訂不改變棋類規則、四階難度、兒童文案或既有美術。')
  await replaceRequired(handoffPath, 'v0.3.14 的鍵盤導覽與提示可讀性修訂已通過型別檢查與 14 個測試檔、65 項測試，尚未建立新的正式 ZIP。', 'v0.3.13 的手機觸控尺寸修訂已通過型別檢查與 13 個測試檔、60 項測試，尚未建立新的正式 ZIP。')
  await removeRequired(handoffPath, 'v0.3.14 另以實際瀏覽器確認 225 個交點、中央第 8 列第 8 欄的唯一 Tab 進入點、方向鍵移至下一空交點，以及落子後略過已占用交點。')

  const statusPath = join(stageDirectory, 'PROJECT_STATUS.md')
  await replaceRequired(statusPath, 'v0.3.14', 'v0.3.13')
  let status = await readFile(statusPath, 'utf8')
  status = status.replace(', v0.3.14 已完成鍵盤交點導覽與提示回饋可讀性修訂', '')
  status = status.replace('；v0.3.14 以單一 Tab 焦點、方向鍵跳過已落子交點與格內焦點環補齊鍵盤操作，提示卡以不打斷操作的方式通知變化', '')
  status = status.replace('；v0.3.14 新增單一鍵盤焦點、方向鍵交點導覽與不打斷操作的提示通知', '')
  status = status.replace('；v0.3.14 型別、內容、版型、規則、觸控、測試與建置 Machine Gate 已通過，ART-006-r02 的正式截圖來源與後續 Producer Gate 尚待完成', '；v0.3.13 型別、內容、版型、規則、觸控、測試與建置 Machine Gate 已通過，ART-006-r02 的正式截圖來源與後續 Producer Gate 尚待完成')
  status = status.replace(/^\| V030-A11Y .*\n/gm, '')
  status = status.replace(/^\| V0313-ARCHIVE .*\n/gm, '')
  status = status.replace(/^\| V0314-ARCHIVE .*\n/gm, '')
  status = status.replace(/^\| 2026-08-13 \| v0\.3\.13 五子棋鍵盤導覽與提示可讀性 .*\n/gm, '')
  status = status.replace('，v0.3.13 新增鍵盤方向鍵交點導覽與提示可讀性', '')
  status = status.replaceAll('v0.3.14', 'v0.3.13')
  await writeFile(statusPath, status, 'utf8')
}

function releaseNotes(version) {
  if (version === 'v0.10.6') {
    return `# v0.10.6 Firebase 匿名配對 match 等待讀取修正版

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.10.6.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 本次修正

- Firebase Realtime Database 的 pairing/matches/$matchId 在資料尚未建立時允許已匿名登入玩家等待讀取；match 建立後仍只允許 hostUid 或 guestUid 讀取。
- 修正乙端已看見配對成功、但甲端尚未建立 match 時，因讀取規則拒絕而持續等待的跨端競速。
- 保留匿名票券、短期 match、逾時清理、檢舉不可讀，以及不收集姓名、位置、聊天或兒童個資。
- 熟人私人邀請仍使用獨立的 STUN-only WebRTC；Firebase 不轉送熟人棋步，也不新增 TURN、Cloudflare、付費服務或棋局伺服器。

## Machine Gate

- Firebase 規則回歸測試：匿名登入、佇列讀寫、match 建立前讀取條件已完成驗證。
- npm.cmd run check：37 個測試檔／199 個測試全部通過。
- 既有內容、注音、型別、建置、WebRTC 專項、六尺寸連線頁與棋種選擇版面均須通過。
- 既有 v0.10.5 及更早正式封存不修改。

## 外部設定

- Firebase 規則更新仍須在控制台發布；GitHub Pages 的七個 VITE_FIREBASE_* Variables 尚未完成前，公開 Pages 不宣稱陌生人配對已上線。
`
  }
  if (version === 'v0.10.5') {
    return `# v0.10.5 Firebase 匿名配對佇列規則修訂版

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.10.5.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 本次修正

- Firebase Realtime Database 的 pairing/queue 新增已匿名登入玩家可讀取佇列的規則，讓客戶端能依建立時間查找陌生人配對候選。
- 保留每張匿名票券的寫入者限制、逾時清理、檢舉資料不可讀，以及不收集姓名、位置、聊天或兒童個資。
- 熟人私人邀請仍使用獨立的 STUN-only WebRTC；Firebase 不轉送熟人棋步，也不新增 TURN、Cloudflare、付費服務或棋局伺服器。

## Machine Gate

- Firebase 規則回歸測試：2/2 通過。
- 既有內容、注音、型別與全部測試、建置、WebRTC 專項、六尺寸連線頁、棋種選擇版面均須通過。
- 既有 v0.10.4 及更早正式封存不修改。

## 外部設定

- 套用規則後仍須在 Firebase 主控台啟用 Anonymous、建立 Realtime Database，並在 GitHub Actions Variables 填入七個 VITE_FIREBASE_* 值；公開 Pages 未帶入設定時會明確顯示隨機配對尚未設定。
`
  }
  if (version === 'v0.10.4') {
    return `# v0.10.4 WebRTC 直連失敗回報與角色文案修訂版

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.10.4.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 本次修正

- 甲端套用乙的回覆後，資料通道建立等待改用 45 秒專用逾時；未能直連時會明確顯示失敗並可重新建立邀請，不再讓甲端長時間停在等待狀態。
- 修正甲端等待文案誤寫為「請等甲回覆連結」的角色錯誤，改為「請等乙回覆連結」。
- 連線流程仍維持甲分享、乙一鍵回覆、甲開啟回覆；不新增後端、TURN、Cloudflare、付費服務、帳號、聊天、姓名、位置或兒童個資。
- 六尺寸連線頁驗證等待上限調整為 30 秒，涵蓋產品 15 秒 ICE 收集上限，避免本機環境誤報。

## Machine Gate

- npm.cmd run check：36 個測試檔／197 項測試全部通過。
- WebRTC 專項 src/online/webrtc.test.tsx：15/15 通過。
- npm.cmd run build：內容、注音、型別、Vite 與 PWA 建置通過。
- npm.cmd run verify:jump-chess-webrtc：甲建立邀請、乙開啟、乙一鍵回覆、甲開啟回覆、雙方自動連線與棋步同步通過。
- npm.cmd run verify:jump-chess-online-layout：390×844、844×390、768×1024、1024×768、430×932、932×430 全部通過。
- npm.cmd run verify:game-picker-layout：六種指定尺寸全部通過。
- 既有 v0.10.2／v0.10.3 及更早正式封存不修改。

## 外部限制

- 熟人連線仍是 STUN-only WebRTC；兩支電信商網路若位於 CGNAT／嚴格 NAT，沒有 TURN 就不能保證建立直連。本版改善等待逾時與可恢復操作，但不宣稱所有行動網路都能成功。
- Firebase 仍是獨立的匿名隨機配對信令試驗，不參與熟人私人連線，也不轉送棋步。
`
  }
  if (version === 'v0.10.3') {
    return `# v0.10.3 響應式連線頁驗證流程修訂版

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.10.3.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 本次修正

- 版面驗證腳本改用現行「建立邀請連結」流程，不再等待已移除的自動建立邀請狀態。
- 版面驗證從逐字注音 DOM 的漢字節點讀取按鍵名稱，正確驗證分享、複製與返回按鍵。
- 六種正式尺寸與 iPhone 直向／橫向回歸均確認頁面、按鍵與注音不溢位。
- 不改熟人 WebRTC 連線行為，不新增 TURN、Cloudflare、付費服務、帳號、聊天、姓名、位置或兒童個資；Firebase 隨機配對仍是獨立外部設定工作。

## Machine Gate

- npm.cmd run check：36 個測試檔／197 項測試全部通過。
- WebRTC 專項 src/online/webrtc.test.tsx：15/15 通過。
- npm.cmd run build：內容、注音、型別、Vite 與 PWA 建置通過。
- npm.cmd run verify:jump-chess-webrtc：甲建立邀請、乙開啟、乙一鍵回覆、甲開啟回覆、雙方自動連線與棋步同步通過。
- npm.cmd run verify:jump-chess-online-layout：390×844、844×390、768×1024、1024×768、430×932、932×430 全部通過。
- 既有 v0.10.2 及更早正式封存不修改。

## 外部限制

- STUN-only WebRTC 不保證兩支電信商網路在 CGNAT／嚴格 NAT 下直連；本版只改善失敗後操作與驗證可靠性，不宣稱所有行動網路都能成功。
- Firebase Realtime Database 規則、匿名配對公開設定與 GitHub Pages Variables 仍需外部主控台完成後，才能進行陌生人配對實機驗證。
`
  }  if (version === 'v0.10.2') {
    return `# v0.10.2 WebRTC 失敗後重新開始連線修訂版

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.10.2.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 本次修正

- WebRTC 明確失敗頁除了失敗說明外，新增「重新開始連線」按鍵；按下後返回既有連線入口，玩家可重新建立邀請，不必停在失敗頁。
- 保留熟人私人邀請流程，不把 Firebase 隨機配對混入熟人 WebRTC。
- 不新增 TURN、Cloudflare、付費服務、帳號、聊天、姓名、位置或兒童個資；公開 STUN 與零費用邊界不變。
- Firebase 匿名隨機配對仍是獨立工作，等待 Firebase 專案規則與 GitHub Pages Variables 的外部設定，不宣稱本版已完成陌生人配對。

## Machine Gate

- npm.cmd run check：36 個測試檔／197 項測試全部通過。
- WebRTC 專項 src/online/webrtc.test.tsx：15/15 通過。
- npm.cmd run build：內容、注音、型別、Vite 與 PWA 建置通過。
- npm.cmd run verify:jump-chess-webrtc：甲建立邀請、乙開啟、乙一鍵回覆、甲開啟回覆、雙方自動連線與棋步同步通過。
- 既有 v0.10.1 及更早正式封存不修改。

## 外部限制

- STUN-only WebRTC 不保證兩支電信商網路在 CGNAT／嚴格 NAT 下直連；失敗時本版提供明確重新開始入口，但不宣稱所有行動網路都能成功。
- Firebase Realtime Database 規則、匿名配對公開設定與 GitHub Pages Variables 仍需外部主控台完成後，才能進行陌生人配對實機驗證。
`
  }  if (version === 'v0.9.8') {
    return `# v0.9.8 跳棋 WebRTC 斷線操作鎖定修訂版（等待製作人實體裝置 Gate）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.9.8.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 本次修訂

- 斷線、對手回合或暫停時，跳棋 121 個棋孔按鈕改用原生 disabled 鎖定；保留原有事件層鎖定，避免鍵盤與輔助技術仍把棋孔視為可操作目標。
- 斷線提示仍為「連線中斷，棋局先留在這裡」，保留最後局面，不直接判負；短暫 disconnected 維持 5 秒觀察，failed、closed 或資料通道關閉立即提示。
- 新增線上斷線 UI 回歸測試，確認 20 枚棋子、回合數與局面保留，並確認斷線後棋孔原生鎖定。
- 不新增伺服器、TURN、帳號、房間、棋局儲存、QR Code、短網址服務或其他棋類連線；目前仍只有跳棋使用 WebRTC。

## Machine Gate

1. 執行 npm.cmd run check、npm.cmd run build、npm.cmd run verify:jump-chess-webrtc 與 npm.cmd run verify:jump-chess-online-layout。
2. 自動測試確認雙方就緒重送、Edge 三分頁配對／棋步同步，以及斷線後棋盤局面與操作鎖定。
3. 確認四種正式畫面與 iPhone 直向／橫向響應式版面沒有頁面或按鍵溢出，注音配對與語音欄位驗證仍為阻擋條件。
4. 實體測試仍須以 GitHub Pages HTTPS、兩支 iPhone、不同網路、主畫面 PWA 與斷線後重新配對確認實際行為。

## 尚待製作人確認的邊界

- 兩支 iPhone 一般 Safari 連線、雙方各 5 步落子與對端顯示已確認；不同網路、主畫面 PWA 實機安裝與斷線後重新配對尚未宣稱完成。
- 公開 STUN 可能看到暫時性公開 IP；本版未使用 TURN，因此不保證所有行動網路／防火牆都能直連。
- 沒有後端時，斷線後仍需重新建立並交換一組邀請／回覆連結；本版不承諾自動重連。
`
  }
  if (version === 'v0.9.7') {
    return `# v0.9.7 跳棋 WebRTC Safari 雙方就緒重送修訂版（等待製作人實體裝置 Gate）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.9.7.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 修正 Safari 兩端可能因單次就緒訊息競態而一起停在等待狀態；同一 sessionId／角色的冪等確認在等待期間每 250 毫秒重送，收到對方確認後停止。
- 保留雙方就緒後才進入跳棋的安全條件；任何一端尚未完成就緒、逾時或關閉時，兩端都不進入棋盤。
- 保留甲分享邀請、乙只按一次「一鍵回覆給甲」、甲開啟回覆連結的最少操作。
- 不新增伺服器、TURN、帳號、房間、棋局儲存、QR Code、短網址服務或其他棋類連線；目前仍只有跳棋使用 WebRTC。

## Machine Gate

1. 執行 npm.cmd run check、npm.cmd run build、npm.cmd run verify:jump-chess-webrtc 與 npm.cmd run verify:jump-chess-online-layout。
2. 自動測試確認單端就緒不會完成配對，且延後建立對方監聽器時會重送確認；Edge 三分頁確認雙方就緒後進入棋盤並同步合法棋步。
3. 實體測試仍須以 GitHub Pages HTTPS、兩支 iPhone、不同網路確認連線建立時間、落子往返、斷線提示與重新配對。

## 尚待製作人確認的邊界

- Machine Gate 與同源 Edge 三分頁流程通過，仍不能取代兩支 iPhone、不同網路、Safari／PWA 的實測。
- 公開 STUN 可能看到暫時性公開 IP；本版未使用 TURN，因此不保證所有行動網路／防火牆都能直連。
- 沒有後端時，斷線後仍需重新建立並交換一組邀請／回覆連結。
`
  }
  if (version === 'v0.9.6') {
    return `# v0.9.6 跳棋 WebRTC 雙方就緒確認修訂版（等待製作人實體裝置 Gate）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.9.6.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 修正甲端只看到自己的資料通道開啟就先進入棋盤、乙端仍停在連線失敗的非對稱狀態。
- 兩端資料通道開啟後，以同一 sessionId 互相交換一次就緒確認；只有雙方都收到對方確認，才呼叫跳棋進入流程。
- 任一端在雙方就緒前失敗、逾時或離開時，另一端維持連線準備畫面，不會先進入棋盤，也不會把未完成配對誤顯示成遊戲中的斷線。
- 保留甲分享邀請、乙只按一次「一鍵回覆給甲」、甲開啟回覆連結的最少操作；系統分享優先，複製連結備援。
- 不新增伺服器、TURN、帳號、房間、棋局儲存、QR Code、短網址服務或其他棋類連線；目前仍只有跳棋使用 WebRTC。

## Machine Gate

1. 執行 npm.cmd run check、npm.cmd run build、npm.cmd run verify:jump-chess-webrtc 與 npm.cmd run verify:jump-chess-online-layout。
2. 自動測試確認只收到單端就緒訊息時不完成配對；Edge 三分頁確認雙方就緒後進入棋盤並同步甲的合法棋步。
3. 實體測試仍須以 GitHub Pages HTTPS、兩支 iPhone、不同網路確認連線建立時間、落子往返與失敗時兩端畫面狀態。

## 尚待製作人確認的邊界

- Machine Gate 與同源 Edge 三分頁流程通過，仍不能取代兩支 iPhone、不同網路、Safari／PWA 的實測。
- 公開 STUN 可能看到暫時性公開 IP；本版未使用 TURN，因此不保證所有行動網路／防火牆都能直連。
- 沒有後端時，遠端交換邀請與回覆資料仍需兩次連結傳遞；單一 QR Code 或短網址不能在沒有中介的情況下自動回傳乙的 answer。
`
  }

  if (version === 'v0.9.5') {
    return `# v0.9.5 跳棋 WebRTC 手動交換逾時與短暫斷線修訂版（等待製作人實體裝置 Gate）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.9.5.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 承接 v0.9.4 的公開 STUN、正面完整下巴棋棋貓圖示與跳棋雙裝置直連。
- 乙開啟邀請後的資料通道等待時間延長為 5 分鐘，避免乙尚未完成 LINE／其他通訊方式傳回覆連結就先被 20 秒逾時判定失敗；URL 本身仍在 15 分鐘後失效。
- 甲端的 WebRTC \`disconnected\` 狀態先觀察 5 秒，短暫恢復時不顯示斷線；\`failed\`、\`closed\` 或資料通道關閉仍會保留最後局面並提示重新配對。
- 不新增伺服器、TURN、帳號、房間、棋局儲存或兒童資料；連線仍只整合跳棋。

## Machine Gate

1. 執行 npm.cmd run check、npm.cmd run build、npm.cmd run verify:jump-chess-webrtc 與 npm.cmd run verify:jump-chess-online-layout。
2. 手動交換時保持甲原遊戲分頁開啟；乙開啟邀請、只按一次「一鍵回覆給甲」，甲開啟回覆連結。
3. 確認雙方進入跳棋後，甲移動合法棋步，乙收到相同局面；再以兩支實體 iPhone、不同網路測試實際延遲與穩定性。

## 尚待製作人確認的邊界

- Machine Gate 與同源 Edge 三分頁流程通過，仍不能取代兩支 iPhone、不同網路、Safari／PWA 的實測。
- 公開 STUN 可能看到暫時性公開 IP；本版未使用 TURN，因此不保證所有行動網路／防火牆都能直連。
`
  }

  if (version === 'v0.9.4') {
    return `# v0.9.4 跳棋 WebRTC 公開 STUN 與 3D 棋棋貓圖示修訂版（等待製作人實體裝置 Gate）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.9.4.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 依製作人確認的最簡化流程整合跳棋雙裝置連線：甲分享邀請連結；乙開啟後自動產生回覆連結並只按一次「一鍵回覆給甲」；甲開啟回覆連結後自動完成連線。
- 使用 \`stun:stun.l.google.com:19302\` 協助探索跨 NAT 的 ICE 候選；不使用 TURN、伺服器、資料庫、房間服務、帳號或棋局儲存。STUN 只取得連線候選，可能看到暫時性公開 IP，不經手棋步。
- offer／answer 以短期 URL 查詢資料交換；甲的原遊戲分頁保持開啟，回覆頁以同源 \`window.opener.postMessage\`、BroadcastChannel／localStorage 將 answer 送回甲的可互通原分頁。連線資料逾 15 分鐘失效。
- 主畫面圖示使用乾淨正面、完整下巴的 3D 棋棋貓頭像，並輸出 180×180／512×512 PNG；保留紫白角色、皇冠與高辨識度徽章。
- 連線後以瀏覽器 WebRTC data channel 傳送可序列化跳棋局面；甲固定為第一位玩家、乙固定為第二位玩家，只在自己的回合操作，乙不能重設甲的棋局。
- 連線中斷時保留裝置上的最後局面並提示重新配對；本版不含伺服器保存、自動重連、伺服器權威棋步驗證或其他棋類連線。

## 操作與 Machine Gate

1. 完整解壓 ZIP，不要直接在壓縮檔內執行。
2. 執行 npm.cmd run check、npm.cmd run build、npm.cmd run verify:jump-chess-webrtc 與 npm.cmd run verify:jump-chess-online-layout。
3. 手動驗證時啟動 npm.cmd run dev -- --host 127.0.0.1 --port 5187，甲開啟 ?preview=jump-chess-online 並保持分頁開啟。
4. 乙開啟甲分享的邀請連結；只按一次「一鍵回覆給甲」並把回覆連結交給甲。
5. 甲開啟回覆連結；原分頁應自動完成連線。雙方進入跳棋後，甲移動合法棋步，乙應收到相同局面與回合切換。

## 尚待製作人確認的邊界

- Machine Gate 已通過同來源 Edge 三分頁自動配對與落子同步；這不能取代 GitHub Pages HTTPS、兩支實體裝置、不同網路的實測。
- 公開 STUN 可改善部分跨 NAT 連線，但不保證所有行動網路／防火牆；本版未使用 TURN。
- LINE 內嵌瀏覽器、Safari 與主畫面 PWA 可能使用不同儲存分區；回覆連結應在甲原本的瀏覽器／PWA 分區開啟。
- 外部通訊軟體與 STUN 服務可能依自身政策處理連線資料；本專案不讀取、不建立、不上傳兒童姓名、帳號、信箱、位置、聊天或行為追蹤資料。
`
  }

  if (version === 'v0.9.0' || version === 'v0.9.1' || version === 'v0.9.2' || version === 'v0.9.3') {
    return `# ${version} 跳棋 WebRTC 邀請／回覆直連驗證版（等待製作人實體裝置 Gate）

完整驗證 ZIP：releases/kids-board-game-kingdom-${version}.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 依製作人確認的最簡化流程整合跳棋雙裝置連線：甲分享邀請連結；乙開啟後自動產生回覆連結並只按一次「一鍵回覆給甲」；甲開啟回覆連結後自動完成連線。
- 不建立本專案伺服器、資料庫、Cloudflare、WSS、帳號、房間服務、QR Code 或第三方額度；GitHub Pages 只負責提供靜態前端。
- offer／answer 以短期 URL 查詢資料交換；甲的原遊戲分頁保持開啟，回覆頁以同來源 BroadcastChannel／localStorage 將 answer 送回甲的原分頁。連線資料逾 15 分鐘失效。
- 連線後以瀏覽器 WebRTC data channel 傳送可序列化跳棋局面；甲固定為第一位玩家、乙固定為第二位玩家，只在自己的回合操作，乙不能重設甲的棋局。
- 連線中斷時保留裝置上的最後局面並提示重新配對；本版不含伺服器保存、自動重連、伺服器權威棋步驗證或其他棋類連線。
- 連線頁按鍵保留共用兒童按鍵的配色、圖示與漢字／右側直排注音結構；四個指定尺寸與 430×932／932×430 手機回歸尺寸均驗證頁面與按鍵內文不溢出，844×390 採緊湊橫向雙欄。

## 操作與 Machine Gate

1. 完整解壓 ZIP，不要直接在壓縮檔內執行。
2. 執行 npm.cmd run check、npm.cmd run build、npm.cmd run verify:jump-chess-webrtc 與 npm.cmd run verify:jump-chess-online-layout。
3. 手動驗證時啟動 npm.cmd run dev -- --host 127.0.0.1 --port 5187，甲開啟 ?preview=jump-chess-online 並保持分頁開啟。
4. 乙開啟甲分享的邀請連結；只按一次「一鍵回覆給甲」並把回覆連結交給甲。
5. 甲開啟回覆連結；原分頁應自動完成連線。雙方進入跳棋後，甲移動合法棋步，乙應收到相同局面與回合切換。

## 尚待製作人確認的邊界

- 目前 Machine Gate 已通過同來源 Edge 三分頁自動配對與落子同步；這不能取代 GitHub Pages HTTPS、兩支實體裝置、不同網路的實測。
- 沒有 STUN／TURN 時，部分 NAT、防火牆或行動網路可能無法建立直連；本版不宣稱所有遠端網路都能連線，也不宣稱斷線後可無感自動恢復。
- 外部通訊軟體可能自行處理分享連結；本專案不讀取、不建立、不上傳兒童姓名、帳號、信箱、位置、聊天或行為追蹤資料。
`
  }

  if (version === 'v0.7.3') {
    return `# v0.7.3 跳棋四尺寸邊界回歸修訂（已完成 Machine Gate）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.7.3.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 承接不可覆寫的 v0.7.2，不改 JUMP-CHESS-SPEC-d05、ART-010-r01、121 孔棋盤、規則、六關差異化教學或既有按鍵方向。
- 修正 390×844 窄版因小數排版誤差多出約 2px 垂直捲動範圍的問題，四種指定尺寸均無頁面水平／垂直溢位。
- 強化實際走棋驗證腳本，四尺寸均實際點擊棋子中心與合法目的格，並阻擋 121 孔、雙方各 10 枚或頁面溢位回歸。
- 保留 v0.7.2 的棋盤指標座標最近棋孔命中處理、鍵盤／無障礙操作、雙人 25 回合含跳躍、NPC 12 回合與六關差異化教學。

## 操作與 Machine Gate

1. 完整解壓 ZIP，不要直接在壓縮檔內執行。
2. 執行 START_VERIFICATION.cmd jump-chess-adventure 開啟六關互動教學；執行 jump-chess 開啟四階 NPC；執行 jump-chess-local 開啟同機雙人。
3. 在 390×844、844×390、768×1024、1024×768 實際點擊棋子中心與合法目的格，確認頁面無捲動且棋盤狀態改變。
4. 執行 npm.cmd run check、npm.cmd run build；確認封包內版本識別為 v0.7.3、dist、MANIFEST.sha256 與啟動器均存在。
5. 依 scripts/verify-jump-chess-v130-playwright.mjs 與 scripts/verify-jump-chess-gameplay-playwright.mjs 確認六關、三模式、連跳、暫停／恢復與四尺寸流程。

## 目前邊界

- V130-ENGINE v0.7.3 已完成 Machine Gate；下一階段 P09-ONLINE 仍須製作人另行確認 HTTPS／WSS 後端、部署／費用、伺服器驗證與兒童資料邊界。
- 乾淨解壓 npm ci 若受 Windows npm cache EPERM／Exit handler never called 阻擋，應如實記錄，不宣稱安裝步驟通過。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產、雙裝置遠端連線、帳號、公開配對、兒童資料上傳與付費功能不在本版範圍。
`
  }

  if (version === 'v0.7.2') {
    return `# v0.7.2 跳棋窄版實際點擊命中修訂（待製作人實際操作確認）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.7.2.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 承接不可覆寫的 v0.7.1，保留 JUMP-CHESS-SPEC-d05、標準 121 孔六角星、雙方各 10 枚、六方向、一般相鄰移動、連續跳躍、不分敵我、不吃子、目標營陣鎖定、勝負與和局規則。
- 修正窄版 48px 透明棋孔觸控目標重疊時由上層按鈕攔截指標事件的問題；改由棋盤依實際指標座標選取最近棋孔，保留每個棋孔按鈕的鍵盤與無障礙操作。
- 以 Edge 實際點擊 25 回合雙人同樂、12 回合 NPC、四個指定 viewport 各一回合；驗證選棋、合法目的格、誤點維持選中、連跳、結束跳躍、暫停／恢復、NPC 回應與 20 枚棋子總數。
- 保留 v0.7.1 六關差異化教學、第二至第四關金色外圈起始焦點、第五關無數字路徑與 ART-010-r01 已核准畫面方向。

## 操作與 Machine Gate

1. 完整解壓 ZIP，不要直接在壓縮檔內執行。
2. 執行 START_VERIFICATION.cmd jump-chess-adventure 開啟六關互動教學；執行 jump-chess 開啟四階 NPC；執行 jump-chess-local 開啟同機雙人。
3. 在四個指定尺寸 390×844、844×390、768×1024、1024×768 實際點擊棋子中心與合法目的格，確認不會被相鄰透明棋孔攔截。
4. 執行 npm.cmd ci、npm.cmd run check、npm.cmd run build；確認封包內版本識別為 v0.7.2、dist、MANIFEST.sha256 與啟動器均存在。
5. 依 scripts/verify-jump-chess-v130-playwright.mjs 與 scripts/verify-jump-chess-gameplay-playwright.mjs 確認教學、三模式與實際走棋流程。

## 已知限制與尚待製作人確認

- 本封包仍待製作人實際操作完整教學、NPC、同機雙人與存檔流程後，才可標記為已驗收完成；不重新確認已核准的 ART-010-r01 畫面方向。
- 乾淨解壓 npm ci 若受 Windows npm cache EPERM／Exit handler never called 阻擋，應如實記錄，不宣稱安裝步驟通過。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產、雙裝置遠端連線、帳號、公開配對、兒童資料上傳與付費功能不在本版範圍。
`
  }

  if (version === 'v0.7.1') {
    return `# v0.7.1 跳棋教學可理解性修訂（待製作人實際操作確認）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.7.1.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 承接不可覆寫的 v0.7.0，保留 JUMP-CHESS-SPEC-d05、標準 121 孔六角星、雙方各 10 枚、六方向、一般相鄰移動、連續跳躍、不分敵我、不吃子、目標營陣鎖定、勝負與和局規則。
- 修正六關互動教學：第二至第四關改用不同的指定起始棋孔，棋盤以高對比金色外圈標示目前應先點的棋子，避免兒童在每關尋找相同位置。
- 六關各自顯示不同的關卡標題與操作提示，明確區分相鄰移動、跳過棋子、跳過己方棋子、跳躍不吃子、連跳兩次與進入對面目標營陣。
- 移除第五關棋盤上的數字路徑標記，保留不含數字的跳躍路徑外框，避免覆蓋棋子顏色與干擾棋盤判讀。
- 保留 ART-010-r01 已核准的正式畫面方向、前幾版工具列架構、逐字右側台灣注音、語音欄位、三個工具鍵與四尺寸響應式排列。
- 四張 v0.7.1 r12 1:1 Edge 實機證據位於 art/previews/jump-chess-v0.7.1-engine-r12/，尺寸為 390×844、844×390、768×1024、1024×768；四尺寸均量得 121 孔、3 個工具鍵、雙方玩家辨識、注音在國字右側、無頁面溢位，透明棋孔命中區至少 48px。

## 操作與 Machine Gate

1. 完整解壓 ZIP，不要直接在壓縮檔內執行。
2. 執行 START_VERIFICATION.cmd jump-chess-adventure 開啟六關互動教學；執行 jump-chess 開啟四階 NPC；執行 jump-chess-local 開啟同機雙人；不帶參數時預設開啟 NPC。
3. 在冒險闖關中依序確認第二至第四關的金色外圈位置不同、關卡標題與提示不同；第五關完成第一跳後不得出現數字，仍應看見路徑外框。
4. 以 390×844、844×390、768×1024、1024×768 檢查四方向版面；確認 121 孔、雙方各 10 枚、三個工具鍵、注音與玩家選擇區無溢位。
5. 執行 npm.cmd ci、npm.cmd run check、npm.cmd run build；確認封包內版本識別為 v0.7.1、dist、MANIFEST.sha256 與啟動器均存在。
6. 依 scripts/verify-jump-chess-v130-playwright.mjs 確認六關逐關操作、教學誤觸防護、同機雙人換手、NPC 回應與四階難度選擇。

## 已知限制與尚待製作人確認

- 本封包是完整可試玩 V130-ENGINE 教學修訂版；仍待製作人實際操作完整教學、NPC、同機雙人與存檔流程後，才可將 v0.7.1 標記為已驗收完成。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續獨立工作；本版保留語音欄位與瀏覽器語音重播，不宣稱已含真人錄音。
- 雙裝置遠端連線、HTTPS／WSS 後端、帳號、公開配對、兒童資料上傳與付費功能不在本版範圍。
`
  }

  if (version === 'v0.7.0') {
    return `# v0.7.0 跳棋完整可試玩縱切（待製作人實際操作確認）

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.7.0.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄內容雜湊。

## 可驗證範圍

- 依 JUMP-CHESS-SPEC-d05 完成標準 121 孔、六方向、雙方各 10 枚、下方第一位玩家先手、一般相鄰移動、連續跳躍、不分敵我、不吃子、可回位／重複經過、目標營陣鎖定、全數入營獲勝、強制跳過、雙方連續無法行動和局與三次相同局面和局。
- 完成六步互動教學：相鄰移動、跳過棋子、跳過己方棋子、跳過對方棋子、空棋孔與連續兩次跳躍，並以最後一枚棋子進入對面營陣示範獲勝。
- 完成四階兒童友善自適應難度 NPC（入門／成長／挑戰／成人版），固定種子可重現且 NPC 只使用規則核心合法走法；完成同機雙人與 IndexedDB 局面／教學進度保存。
- 使用已由製作人確認合格的 ART-010-r01 畫面方向：121 孔六角星、橘紅圓形／藍色菱形棋子、前幾版白底／紫框／紫色陰影工具列、四尺寸排列、逐字右側台灣注音與語音欄位。
- 四張 V130-ENGINE r11 1:1 Edge 實機證據位於 art/previews/jump-chess-v0.7.0-engine-r11/，尺寸為 390×844、844×390、768×1024、1024×768；四尺寸均量得 121 孔、3 個工具鍵、雙方玩家辨識、注音在國字右側、無頁面溢位，透明棋孔命中區至少 48px。

## 操作與 Machine Gate

1. 完整解壓 ZIP，不要直接在壓縮檔內執行。
2. 執行 START_VERIFICATION.cmd jump-chess-adventure 開啟六步互動教學；執行 jump-chess 開啟四階 NPC；執行 jump-chess-local 開啟同機雙人；不帶參數時預設開啟 NPC。
3. 以 390×844、844×390、768×1024 檢查四方向版面；以 1024×768 優先檢查棋盤、孔位、棋子比例、玩家選擇區與按鍵架構。
4. 執行 npm.cmd ci、npm.cmd run check、npm.cmd run build；確認封包內版本識別為 v0.7.0、dist、MANIFEST.sha256 與啟動器均存在。
5. 依 scripts/verify-jump-chess-v130-playwright.mjs 的三模式流程確認教學誤觸防護、教學前進、同機雙人換手、NPC 回應與四階難度選擇。

## 已知限制與尚待製作人確認

- 本封包是完整可試玩 V130-ENGINE 驗證版；仍待製作人實際操作完整教學、NPC、同機雙人與存檔流程後，才可將 v0.7.0 標記為已驗收完成。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續獨立工作；本版保留語音欄位與瀏覽器語音重播，不宣稱已含真人錄音。
- 雙裝置遠端連線、HTTPS／WSS 後端、帳號、公開配對、兒童資料上傳與付費功能不在本版範圍。
`
  }

  if (version === 'v0.6.7') {
    return `# v0.6.7 動物棋玩家方向修訂封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.6.7.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄封包內容雜湊。

## 可驗證範圍

- 承接不可修改的 v0.6.6，保留完整 7×9 棋盤、雙方各 8 枚動物棋子、ART-009-r03 透明 PNG 頭像、四階 NPC、自由練習、同機雙人、正式規則與 IndexedDB 存檔。
- 修正標準初始局面方向：下方 8 枚為第一位玩家並先手，上方 8 枚為第二位玩家並後手；同步調整上下獸穴與陷阱的玩家歸屬。
- 第六關教學改為下方第一位玩家的貓先吃掉陷阱中的象，再由上方第二位玩家的小狗進入對方獸穴；第一至第五關的規則示範與真實兩下操作保持不變。
- 六關十二個操作目標、第二下完成真實棋步、三種模式、四種確認尺寸、按鍵填滿規則與已核准 ART-009-r03 均保留。
- 本版不新增後端、雙裝置連線、帳號、公開配對、兒童資料上傳、付費、廣告或正式美術修訂。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd animal-chess\` 或 \`animal-chess-local\`，確認標準初始盤下方為第一位玩家、上方為第二位玩家；執行 \`animal-chess-tutorial\` 逐關檢查教學。
3. 以 390×844、844×390、768×1024、1024×768 檢查三種模式的標題、棋盤、說明卡、按鍵、無水平／垂直頁面溢位與按鍵安全距離。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.6.7。

## 尚待製作人確認

- 請確認標準初始盤的下方第一位玩家先手、上方第二位玩家後手方向符合預期；四種畫面已沿用上一版已確認合格的版面基準。
`
  }

  if (version === 'v0.6.6') {
    return `# v0.6.6 動物棋三尺寸版面回歸修訂封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.6.6.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄封包內容雜湊。

## 可驗證範圍

- 承接不可修改的 v0.6.5，保留完整 7×9 棋盤、雙方各 8 枚動物棋子、ART-009-r03 透明 PNG 頭像、四階 NPC、自由練習、同機雙人、正式規則與 IndexedDB 存檔。
- 修正自由練習 768×1024 底部工具列貼齊視窗、844×390「再試一次」與難度列的視覺碰撞，以及 1024×768 右側控制欄貼齊／溢出風險。
- 低高度橫向增加相鄰控制列安全間距；桌面橫向縮窄控制欄並保留右側安全邊界；平板直向為最後一列按鍵陰影保留底部安全區。按鍵仍維持至少 48px，兒童操作列不預留空白按鍵格。
- 六關十二個操作目標、第二下完成真實棋步、不需第三下點擊、三種模式與已核准 ART-009-r03 均不改動。
- 本版不新增後端、雙裝置連線、帳號、公開配對、兒童資料上傳、付費、廣告或正式美術修訂。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd animal-chess-tutorial\`、\`animal-chess\` 或 \`animal-chess-local\`，分別開啟教學、自由練習與同機雙人。
3. 以 390×844、844×390、768×1024、1024×768 檢查三種模式的標題、棋盤、說明卡、按鍵、無水平／垂直頁面溢出與按鍵陰影安全距離。
4. 教學操作仍是先點動物，再點亮起的目的格；第二次點擊後立即完成棋步，不需要第三次點擊。
5. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.6.6。

## 尚待製作人確認

- 請重新以 768×1024、844×390、1024×768 優先檢查本次回歸修訂後的自由練習畫面；其他模式的四尺寸也已重新產出作為對照。
`
  }

  if (version === 'v0.6.5') {
    return `# v0.6.5 動物棋教學內容、兩下操作與四尺寸版面回歸封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.6.5.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄封包內容雜湊。

## 可驗證範圍

- 承接不可修改的 v0.6.4，保留完整 7×9 棋盤、雙方各 8 枚動物棋子、ART-009-r03 透明 PNG 頭像、四階 NPC、自由練習、同機雙人、正式規則與 IndexedDB 存檔。
- 六關十二個操作目標維持不變；每關明確分成第一下點正確棋子、第二下點亮起的目的格，第二下完成真實棋步後直接顯示下一關，不再要求移動後第三次點棋子。
- 六段教學文字補充一格直走、大小吃法、鼠吃象、老鼠下水、獅虎跳河與河中鼠阻擋、陷阱與獸穴；教學卡顯示關卡與目標 1／2，並固定提示先點動物再點亮格子。
- 自由練習與教學／同機雙人四種指定尺寸均保留棋盤比例、按鍵填滿與無頁面溢位；特別重新處理 390×844 與 768×1024 的直向高度配置。
- 本版不新增後端、雙裝置連線、帳號、公開配對、兒童資料上傳、付費、廣告或正式美術修訂；ART-009-r03 不修改。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd animal-chess-tutorial\`，開啟六關十二個互動教學目標；執行 \`animal-chess\` 可進入自由練習，執行 \`animal-chess-local\` 可進入同機雙人。
3. 每關先點指定棋子，再點亮起的目的格；確認第二下後棋子立即移動／吃子，畫面顯示「下一關」，不需要第三下點棋子。
4. 第六關先完成貓吃陷阱中的象，再依真實回合讓小狗走進對方獸穴。
5. 以 390×844、844×390、768×1024、1024×768 檢查三種模式的標題、棋盤、說明卡、按鍵、無水平／垂直頁面溢出與可操作範圍。
6. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.6.5。

## 尚待製作人確認

- 請以一般小學生初學者角度試玩六關十二個目標，確認六段規則文字與「先點動物，再點亮格子」是否足以理解基本玩法。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續獨立工作；本版保留語音欄位與「聽一聽」按鈕，不把瀏覽器語音宣稱為固定錄音。
`
  }

  if (version === 'v0.6.4') {
    return `# v0.6.4 動物棋教學完成提示與多模式四尺寸驗證封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.6.4.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄封包內容雜湊。

## 可驗證範圍

- 承接不可修改的 v0.6.3，保留完整 7×9 棋盤、雙方各 8 枚動物棋子、ART-009-r03 透明 PNG 頭像、四階 NPC、自由練習、同機雙人、正式規則與 IndexedDB 存檔。
- 六關十二個互動教學目標維持不變；完成前五關後的提示改為「做到了，請點下一關」，明確引導進入第六關，並以測試確認第六關局面與小狗入獸穴目標已載入。
- 移動操作仍是「先點棋子，再點亮起的目標格」兩次點擊完成，不要求重複點同一格；吃子只移動攻擊方並移除被吃棋子，不交換兩方棋子。
- 產出自由練習與同機雙人的四種指定尺寸正式驗證畫面：390×844、844×390、768×1024、1024×768；均維持棋盤比例、按鍵填滿與無頁面溢位。
- 本版不新增後端、雙裝置連線、帳號、公開配對、兒童資料上傳、付費、廣告或正式美術修訂；ART-009-r03 不修改。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd animal-chess-tutorial\`，開啟六關十二個互動教學目標；執行 \`animal-chess\` 可進入自由練習，執行 \`animal-chess-local\` 可進入同機雙人。
3. 教學完成第五關後，閱讀「做到了，請點下一關」並點擊「下一關」，確認畫面進入 6 / 6；第六關先完成貓吃陷阱中的象，再讓小狗走進對方獸穴。
4. 自由練習與同機雙人各以四種指定尺寸檢查完整 7×9 棋盤、16 枚頭像、按鍵文字、操作列填滿、無水平／垂直頁面溢出與可操作範圍。
5. 每個移動都先點選動物，再點選亮起的目標格；第二次點擊後立即確認棋子位置更新，不再點第三次。
6. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.6.4。

## Machine Gate 結果

- 工作區與乾淨解壓目錄的 check 均通過：31 個測試檔、156 項測試；build 通過。
- ZIP 內 MANIFEST.sha256 的全部內容雜湊均相符；封包含 dist、教學／自由練習／同機雙人四尺寸畫面，且不含巢狀 releases、暫存截圖或 node_modules。
- Edge 瀏覽器逐步完成六關教學；自由練習與同機雙人均完成一次兩階段移動操作；三種模式四種指定尺寸的 innerWidth／innerHeight 與文件 scrollWidth／scrollHeight 均符合目標。

## 尚待製作人確認

- 請以一般小學生初學者角度試玩六關十二個目標，特別確認第五關完成提示是否能讓兒童找到「下一關」，以及第二次點擊目的格後是否立即完成移動。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續獨立工作；本版保留語音欄位與「聽一聽」按鈕，不把瀏覽器語音宣稱為固定錄音。
`
  }

  if (version === 'v0.6.3') {
    return `# v0.6.3 動物棋教學棋步接續與四尺寸版面修訂驗證封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.6.3.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄封包內容雜湊。

## 可驗證範圍

- 承接不可修改的 v0.6.2，保留完整 7×9 棋盤、雙方各 8 枚動物棋子、ART-009-r03 透明 PNG 頭像、四階 NPC、自由練習、同機雙人、正式規則與 IndexedDB 存檔。
- 修正教學第二目標的假局面接續：第一至第四關沿用上一動的真實棋子種類、擁有者與位置；第五關獅子維持跳河後的對岸位置；第六關保留陷阱吃子後的貓，依真實回合由小狗進入對方獸穴。
- 移動操作明確分成「先點棋子，再點亮起的目標格」，不要求重複點同一格；吃子只移動攻擊方並移除被吃棋子，不交換兩方棋子。
- 舊版教學觀察存檔會遷移至新版固定局面；四種指定畫面維持 v0.6.2 的按鍵列填滿與無溢位修正：390×844、844×390、768×1024、1024×768。
- 本版不新增後端、雙裝置連線、帳號、公開配對、兒童資料上傳、付費、廣告或正式美術修訂；ART-009-r03 不修改。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd animal-chess-tutorial\`，開啟六關十二個互動教學目標；執行 \`animal-chess\` 可進入自由練習，執行 \`animal-chess-local\` 可進入同機雙人。
3. 每個移動都先點選動物，再點選亮起的目標格；吃子後確認攻擊方留在目標格、被吃方消失。
4. 依序完成六關，確認第二個目標不會交換動物種類／玩家所屬，並確認第五關跳河與第六關獸穴使用真實回合。
5. 以四種指定尺寸檢查棋盤比例、頭像辨識、按鍵文字、操作列填滿、無水平／垂直頁面溢出與可操作範圍。
6. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.6.3。

## Machine Gate 結果

- 工作區與乾淨解壓目錄的 check 均通過：31 個測試檔、156 項測試；build 通過。
- ZIP 內 MANIFEST.sha256 的全部內容雜湊均相符；封包含 dist、四張 v0.6.3 教學畫面，且不含巢狀 releases、暫存截圖或 node_modules。
- Edge 瀏覽器逐步完成六關教學；四種指定尺寸的 innerWidth／innerHeight 與文件 scrollWidth／scrollHeight 均符合目標，無頁面溢出、重疊或裁切。

## 尚待製作人確認

- 請以一般小學生初學者角度試玩六關十二個目標，特別確認點選流程、吃子後棋子是否留在目標格，以及第六關小狗進入獸穴是否容易理解。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續獨立工作；本版保留語音欄位與「聽一聽」按鈕，不把瀏覽器語音宣稱為固定錄音。
`
  }

  if (version === 'v0.6.2') {
    return `# v0.6.2 動物棋六關十二目標教學與四尺寸版面修訂驗證封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.6.2.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄封包內容雜湊。

## 可驗證範圍

- 承接不可修改的 v0.6.1，保留完整 7×9 棋盤、雙方各 8 枚動物棋子、ART-009-r03 透明 PNG 頭像、四階 NPC、自由練習、同機雙人、正式規則與 IndexedDB 存檔。
- 六關教學各增加一個可操作觀察目標，共十二個互動檢查點：直走／合法走法、獅吃狗／狗不能反吃、鼠吃象／象不能吃鼠、鼠入河／貓不能入河、獅跳河／河中鼠阻擋、陷阱失去戰力／走入獸穴獲勝。
- 教學節奏依據公開動物棋教學影片與規則資料重新整理為「看示範、跟著做、觀察限制或例外、完成後進下一關」；核心規則仍以製作人提供的動物棋規格為準。
- 四種指定畫面修正為按鍵依可用寬度填滿，並移除教學版面在低高度與寬版的按鍵溢出：390×844、844×390、768×1024、1024×768。正式教學畫面位於 \`art/previews/animal-chess-v0.6.2-tutorial/\`。
- 本版不新增後端、雙裝置連線、帳號、公開配對、兒童資料上傳、付費、廣告或正式美術修訂；ART-009-r03 不修改。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd animal-chess-tutorial\`，開啟六關十二個互動教學目標；執行 \`animal-chess\` 可進入自由練習，執行 \`animal-chess-local\` 可進入同機雙人。
3. 依序完成六關，確認第二個目標會要求觀察該關的限制或例外；錯誤選取不會偷偷套用走法。
4. 以四種指定尺寸檢查棋盤比例、頭像辨識、按鍵文字、操作列填滿、無水平／垂直頁面溢出與可操作範圍。
5. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.6.2。

## Machine Gate 結果

- 工作區與乾淨解壓目錄的 check 均通過：31 個測試檔、156 項測試；build 通過。
- ZIP 內 MANIFEST.sha256 的全部內容雜湊均相符；封包含 dist、四張 v0.6.2 教學畫面，且不含巢狀 releases、暫存截圖或 node_modules。
- 四種指定尺寸以 Edge Playwright 直接擷取並精確量測；innerWidth／innerHeight 與文件 scrollWidth／scrollHeight 均符合目標，無頁面溢出、重疊或裁切。

## 尚待製作人確認

- 請以一般小學生初學者角度試玩六關十二個目標，確認每關的「先跟做、再觀察限制／例外」是否容易理解。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續獨立工作；本版保留語音欄位與「聽一聽」按鈕，不把瀏覽器語音宣稱為固定錄音。
`
  }

  if (version === 'v0.6.1') {
    return `# v0.6.1 動物棋六關互動教學修訂驗證封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.6.1.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄封包內容雜湊。

## 可驗證範圍

- 承接不可修改的 v0.6.0，保留完整 7×9 棋盤、雙方各 8 枚動物棋子、ART-009-r03 透明 PNG 頭像、四階 NPC、自由練習、同機雙人、正式規則與 IndexedDB 存檔。
- 冒險闖關改為六關固定互動教學：一格直走、大小吃法、鼠吃象、老鼠遊河、獅虎跳河（含河中鼠阻擋觀察）、陷阱與獸穴。
- 教學局面只放入當關需要的棋子，仍保留 63 格棋盤與完整規則；每關提供固定可重播目標，不會讓初學兒童先面對完整 16 枚棋子的複雜局面。
- 教學完成後才顯示「下一關」；最後一關完成後提供「重新學一次」，不會自動把兒童丟入另一種模式。
- 四種指定畫面均保留同一套 7×9 正方形棋盤與填滿式操作列：390×844、844×390、768×1024、1024×768。v0.6.1 教學畫面證據位於 \`art/previews/animal-chess-v0.6.1-tutorial/\`。
- 本版不新增後端、雙裝置連線、帳號、公開配對、兒童資料上傳、付費、廣告或正式美術修訂；ART-009-r03 不修改。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd animal-chess-tutorial\`，開啟六關教學；執行 \`animal-chess\` 可進入自由練習，執行 \`animal-chess-local\` 可進入同機雙人。
3. 依序完成六關，確認錯誤選取不會偷偷套用走法；第五關先觀察河中鼠阻擋，再進入第六關的陷阱與獸穴兩個短任務。
4. 以四種指定尺寸檢查棋盤比例、頭像辨識、按鍵文字、操作列填滿、無水平／垂直頁面溢出與可操作範圍。
5. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.6.1。

## Machine Gate 結果

- 工作區與乾淨解壓目錄的 check 均通過：31 個測試檔、156 項測試；build 通過。
- ZIP 內 \`MANIFEST.sha256\` 共 226 筆內容雜湊，全部相符；封包含 \`dist\`、四張 v0.6.1 教學畫面，且不含巢狀 \`releases\`。
- 四種指定尺寸均實際量測 63 格、7×9 正方棋盤、按鍵內容無捲動溢出、按鍵與頁面均在視窗內。
- 乾淨解壓的 \`npm.cmd ci --ignore-scripts\` 受 Windows npm 快取的 EPERM／Exit handler never called 阻擋；未把該安裝步驟宣稱為通過。

## 尚待製作人確認

- 請以一般小學生初學者角度試玩六關，確認每關只教一個重點、文字／語音提示容易跟做，以及第六關兩個短任務的順序容易理解。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續獨立工作；本版保留語音欄位與「聽一聽」按鈕，不把瀏覽器語音宣稱為固定錄音。
`
  }

  if (version === 'v0.5.5') {
    return `# v0.5.5 數字寶石連線 390×844 雙人記分板防重疊修訂驗證封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.5.5.zip
SHA-256：以同名 .sha256 檔案為準；封包內 MANIFEST.sha256 記錄封包內容雜湊。

## 可驗證範圍

- 承接 v0.5.4 的數字寶石連線記分板、3×3／4×4、四關教學、四階自由練習、同機雙人與 IndexedDB 記分存檔。
- 修正 390×844 右上角雙人記分板的水平重疊：兩位玩家仍左右並列，各自的完整逐字右側台灣注音標籤與分數分為上下兩列。
- 精確驗證四尺寸為 390×844、844×390、768×1024、1024×768；本版橫向基準採 844×390，其他三個已合格尺寸維持上一版版型。
- 技術寶石仍是可辨識的程式化佔位，不宣稱正式兒童美術已核准；本版不修改 ART_APPROVALS.md 或 ART-008-r21 封存。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd number-gem-local\`，以 Edge 檢視雙人記分板與 390×844 右上角記分板。
3. 以 390×844、844×390、768×1024、1024×768 檢查記分板、按鍵文字、每列填滿、外框與底部內容均在視窗內。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.5.5。

## 尚待製作人確認

- 需要製作人實機確認 390×844 記分板的可讀性，以及四尺寸整體操作密度與一般小學生的可理解性。
- 正式美術、正式語音與 iPhone 上線後實機驗證不在本版新增範圍。
`
  }

  if (version === 'v0.5.4') {
    return `# v0.5.4 數字寶石連線 390×844 分數列可讀性修訂驗證封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.5.4.zip
SHA-256：ARCHIVE_HASH_V054_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.5.3 的數字寶石連線記分板、3×3／4×4、四關教學、四階自由練習、同機雙人與 IndexedDB 記分存檔。
- 依製作人檢視修正 390×844 棋盤下方分數列：目標與目前合計改為兩個等寬欄位，保留逐字右側台灣注音與數字徽章的清楚間隔。
- 精確驗證四尺寸為 390×844、844×380、768×1024、1024×768；844×380 是本版橫向低高度基準，不採 844×390。其他三個已合格尺寸維持上一版版型。
- 技術寶石仍是可辨識的程式化佔位，不宣稱正式兒童美術已核准；本版不修改 ART_APPROVALS.md 或 ART-008-r21 封存。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd number-gem-local\`，以 Edge 檢視雙人記分板與 390×844 分數列。
3. 以 390×844、844×380、768×1024、1024×768 檢查分數列、按鍵文字、每列填滿、外框與底部內容均在視窗內。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.5.4。

## 尚待製作人確認

- 需要製作人實機確認 390×844 分數列的可讀性，以及四尺寸整體操作密度與一般小學生的可理解性。
- 正式美術、正式語音與 iPhone 上線後實機驗證不在本版新增範圍。
`
  }
  if (version === 'v0.5.3') {
    return `# v0.5.3 數字寶石連線按鍵溢出與列寬修訂驗證封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.5.3.zip
SHA-256：ARCHIVE_HASH_V053_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.5.2 的數字寶石連線記分板、3×3／4×4、四關教學、四階自由練習、同機雙人與 IndexedDB 記分存檔。
- 修正 390×844、844×380、768×1024、1024×768 的按鍵內文溢出；操作列每一列自動填滿，不保留空白按鍵格。
- 難度目前選取星章縮小 5px；低高度橫向仍保留完整外框與底部路徑，3×3 盤面每格維持可觸控尺寸。
- 技術寶石仍是可辨識的程式化佔位，不宣稱正式兒童美術已核准；本版不修改 ART_APPROVALS.md 或 ART-008-r21 封存。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd number-gem-local\`，以 Edge 檢視雙人記分板。
3. 以 390×844、844×380、768×1024、1024×768 檢查按鍵文字完整、每列填滿、外框與底部內容均在視窗內。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.5.3。

## 尚待製作人確認

- 需要製作人實機確認四種尺寸的操作密度、星章大小與一般小學生的可理解性。
- 正式美術、正式語音與 iPhone 上線後實機驗證不在本版新增範圍。
`
  }

  if (version === 'v0.5.2') {
    return `# v0.5.2 數字寶石連線記分板與筆電版面驗證封存

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.5.2.zip
SHA-256：ARCHIVE_HASH_V052_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.5.1 數字寶石連線第一個可試玩技術縱切；保留 3×3 入門、4×4 上限、四關互動教學、自由練習四階、同機雙人、固定種子、多解驗證、逐字右側台灣注音與離線存檔。
- 新增「智慧星星」記分板：自由練習與冒險顯示累積星星；同機雙人顯示兩位玩家各自的星星與三題進度，完成六題後保留完整結果畫面。
- 記分板與局面一併使用 IndexedDB 保存；舊版沒有記分資料時安全初始化為零，不讀取或上傳兒童個人資料。
- 修訂手機、平板與筆電低高度橫向版面；390×844、844×390、768×1024、1024×768、1280×720、1366×768、1536×864、1920×1080 均完成 Edge 一比一無水平／垂直頁面溢出量測。
- 技術寶石仍是可辨識的程式化佔位，不宣稱正式兒童美術已核准；本版不修改 ART_APPROVALS.md 或 ART-008-r21 封存。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 執行 \`START_VERIFICATION.cmd number-gem-tutorial\`、\`number-gem\` 或 \`number-gem-local\`，以 Edge 開啟對應入口。
3. 自由練習完成一題確認智慧星星增加；同機雙人輪流完成六題，確認兩位玩家各顯示 3／3 題與各自星星，且最後仍可重新開始。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`；確認封包內 \`dist\`、\`MANIFEST.sha256\`、靜態啟動器與版本識別均為 v0.5.2。

## 尚待製作人確認

- 需要製作人以實際筆電與兒童／家長角度試玩，確認記分板文字、雙人換手與 3×3／4×4 難度是否容易理解。
- 正式美術、正式語音與 iPhone 上線後實機驗證不在本版新增範圍。
`
  }

  if (version === 'v0.3.15') {
    return `# v0.3.15 五子棋正式美術完成驗證封存

## 驗證範圍

- 正式核准 ART-006-r04：封閉 15×15 交點棋盤、落在交點的黑白棋子、紫白棋棋貓王國場景與四方向響應式操作版型。
- 保留五子棋完整內容：互動教學、四關冒險、四階 NPC、自由練習、同機雙人、IndexedDB 存檔、禁手提示與鍵盤交點導覽。
- 手機直向的「返回／聽一聽」平均分配同列；平板橫向／電腦共用版型的「聽一聽」完整留在按鈕內。

## 操作方式

1. 執行 \`npm.cmd ci\`、\`npm.cmd run check\` 與 \`npm.cmd run build\`。
2. 執行 \`開始驗證.cmd\`，在 Edge 依序驗證冒險闖關、自由練習四階 NPC 與雙人同樂。
3. 驗證黑方禁手會被解釋並拒絕落子、可另選合法位置；黑方恰好五子勝、白方五子以上勝。

## 已知限制

- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.16') {
    return `# v0.3.16 黑白棋回合焦點驗證封存

## 驗證範圍

- 承接 v0.3.15 的完整五子棋縱切與核准 ART-006-r04 正式美術；v0.3.15 封存 ZIP 與 SHA-256 不修改。
- 包含 \`REVERSI-SPEC-r01\` 規則核心、四階兒童友善 NPC、IndexedDB session 契約、可操作黑白棋提案與專項測試。
- 黑白棋回合資訊會依目前玩家切換：輪到的一方卡片實際放大並提高辨識度，另一方縮小；落子後焦點切換，狀態文字同步顯示「黑棋下／白棋下」。
- 黑白棋提案遵守逐字右側台灣注音、語音鍵值、8×8 標準開局與包夾翻子規則；目前提案不另外載入棋棋貓素材，已核准 ART-007-r04 素材仍保留作追溯與後續使用。

## 操作方式

1. 執行 \`npm.cmd ci\`、\`npm.cmd run check\` 與 \`npm.cmd run build\`。
2. 執行 \`開始驗證.cmd\`，驗證既有五子棋完整流程。
3. 在同一個本機驗證網址手動開啟 \`?preview=reversi-art-proposal\`，確認初始黑棋卡片較大、白棋卡片較小；落子後確認白棋卡片變大、黑棋卡片變小，且回合文字與注音同步切換。

## 已知限制

- V070-REVERSI 目前仍是規格、規則核心與可操作兒童提案階段，不宣稱完整黑白棋遊戲縱切已完成。
- 黑白棋正式產品美術尚未列入正式 PWA；ART-007-r04 核准棋棋貓素材保留，但目前畫面不載入角色以減少建置大小。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.17') {
    return `# v0.3.17 黑白棋啟動流程修訂封存

## 驗證範圍

- 承接 v0.3.16 的黑白棋回合焦點驗證；v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- START_VERIFICATION.cmd 與 開始驗證.cmd 預設直接開啟 ?preview=reversi-art-proposal&verification=1，不再只進入井字棋／五子棋。
- 啟動器保留參數入口：執行 START_VERIFICATION.cmd gomoku 或 開始驗證.cmd gomoku 可開啟五子棋，tic-tac-toe 可開啟井字棋。
- 首頁「選擇棋類」新增黑白棋入口，並保留既有井字棋與五子棋流程；黑白棋仍是可操作提案，不宣稱完整縱切或正式產品美術。

## 操作方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 雙擊 START_VERIFICATION.cmd 或 開始驗證.cmd，確認直接進入黑白棋回合焦點提案。
3. 若要驗證其他遊戲，執行 START_VERIFICATION.cmd gomoku 或 START_VERIFICATION.cmd tic-tac-toe。

## 已知限制

- 黑白棋正式產品美術尚未列入正式 PWA；ART-007-r04 核准棋棋貓素材保留，但目前畫面不載入角色以減少建置大小。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.18') {
    return `# v0.3.18 黑白棋三種遊戲模式分流封存

## 驗證範圍

- 承接 v0.3.17 的黑白棋啟動流程與首頁選棋入口；v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 冒險闖關現在顯示互動教學提示，黑方由兒童操作、白方由固定入門 NPC 回應；冒險不顯示可改變 NPC 的難度選擇。
- 自由練習現在是黑方兒童對白方 NPC，提供入門、成長、挑戰、成人版四階難度；難度只改變 NPC 選擇，不改變正式規則。
- 雙人同樂維持黑白雙方同一裝置手動輪流，隱藏 NPC 難度選擇。
- 三種模式共用標準 8×8 黑白棋規則核心、自動略過、包夾翻子、逐字右側台灣注音與語音回饋。

## 操作方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 執行 開始驗證.cmd 或 START_VERIFICATION.cmd，從首頁依序選擇冒險闖關／黑白棋、自由練習／黑白棋、雙人同樂／黑白棋。
3. 冒險闖關先確認教學提示與黑方合法格，再落子；約 0.42 秒後白方 NPC 自動回應。
4. 自由練習確認四階難度按鈕存在；黑方落子後白方 NPC 自動回應，思考期間棋盤暫時鎖定。
5. 雙人同樂確認沒有難度選擇；黑方落子後直接輪到白方手動操作。

## 已知限制

- 黑白棋正式產品美術尚未列入正式 PWA；ART-007-r04 核准棋棋貓素材保留，但目前畫面不載入角色。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.19') {
    return `# v0.3.19 黑白棋回合切換穩定性修訂封存

## 驗證範圍

- 承接 v0.3.18 的黑白棋三種模式分流；v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 黑／白棋回合卡仍保留放大、縮小、陰影與淡化辨識；兩張卡片改用固定共用高度，切換只改變視覺樣式，不再推動棋盤或下方操作區。
- 冒險闖關、自由練習與雙人同樂均以 Chrome 1:1 viewport 量測四個尺寸；下子前後棋盤、控制區、回合卡與操作按鈕座標一致。

## 操作方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 執行 開始驗證.cmd 或 START_VERIFICATION.cmd，從首頁依序進入三種模式的黑白棋。
3. 在冒險闖關與雙人同樂下子，確認黑／白回合卡切換時棋盤與按鈕不跳動。
4. 在自由練習下子，確認白棋 NPC 思考與回應後棋盤、回合卡、難度與操作按鈕位置不跳動。

## 已知限制

- 黑白棋正式產品美術尚未列入正式 PWA；ART-007-r04 核准棋棋貓素材保留，但目前畫面不載入角色。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.20') {
    return `# v0.3.20 黑白棋兒童畫面與互動內容驗證封存

## 驗證範圍

- 承接 v0.3.19 的三種模式與固定回合卡版型；v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 冒險闖關驗證互動教學與固定入門 NPC；自由練習驗證入門、成長、挑戰、成人版四階 NPC；雙人同樂驗證黑白雙方手動操作且不顯示 NPC 難度。
- 驗證標準 8×8 黑白棋的合法落子、八方向翻子、強制略過、雙方無步終局、勝負與和局；補齊強制略過與終局正向兒童文案、逐字右側台灣注音與語音鍵值。
- Edge 為主要瀏覽器、Chrome 作交叉驗證；四個響應式尺寸與三種模式均確認棋盤維持正方形、無頁面溢位、操作目標至少 48 CSS px、回合切換版面穩定，並完成提示、返回、再玩一次、聽一聽與回合互動。

## 操作方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 執行 開始驗證.cmd 或 START_VERIFICATION.cmd，從首頁依序進入三種模式的黑白棋。
3. 冒險闖關確認教學提示與白棋固定入門 NPC；自由練習確認四階難度及白棋 NPC；雙人同樂確認沒有難度選擇且白方可手動操作。
4. 在雙人同樂連續落子，確認無合法步時顯示「這一回合沒有可以翻轉的格子，換對方試試看」，盤面終局時顯示黑棋獲勝、白棋獲勝或這一局和局，並可按「再玩一次」重新開始。

## 已知限制

- 黑白棋正式產品美術尚未列入正式 PWA；ART-007-r04 核准棋棋貓素材保留，但目前畫面不載入角色。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.21') {
    return `# v0.3.21 黑白棋兒童畫面與互動內容驗證文件同步封存

## 驗證範圍

- 承接 v0.3.20 的黑白棋兒童畫面與互動內容驗證；v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 保留冒險闖關互動教學與固定入門 NPC、自由練習四階 NPC、雙人同樂雙方手動、標準 8×8 規則、強制略過與終局正向文案、逐字右側台灣注音及 Edge／Chrome 四尺寸三模式驗證結果。
- 本修訂版同步封存已回填 v0.3.20 SHA-256 的權威文件，確保封包內版本、狀態、交接、README、Release Notes 與封存目錄一致。

## 操作方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 執行 開始驗證.cmd 或 START_VERIFICATION.cmd，從首頁依序進入三種模式的黑白棋。
3. 依 v0.3.20 驗證範圍確認模式分流、NPC 難度、雙人手動、合法落子、翻子、強制略過、終局、回饋與版面穩定性。

## 已知限制

- 黑白棋正式產品美術尚未列入正式 PWA；ART-007-r04 核准棋棋貓素材保留，但目前畫面不載入角色。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.22') {
    return `# v0.3.22 黑白棋完整教學與四階難度策略驗證封存

## 驗證範圍

- 承接 v0.3.21；v0.3.21、v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 冒險闖關改為六個可切換、可重玩的完整互動教學關卡：開局、單線翻子、多方向翻子、角落、強制略過與獨立短局；每關都有固定可重播局面、四級提示、完成、下一關與重玩流程，白棋由固定入門 NPC 接手。
- 自由練習維持四階 NPC 並補強策略區隔：入門與成長採不同候選取向；挑戰為一層搜尋、每個搜尋節點最多八個候選；成人版為兩層搜尋、每個搜尋節點最多六個候選，並加入角落、穩定邊線、行動力、前緣與終局子力評估。
- 測試固定合法局面、強制略過、教學目標與四階行為差異；保留標準 8×8 規則、雙人手動模式、提示／返回／再玩一次／語音／逐字右側台灣注音與版面穩定性。

## 驗證方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 執行 開始驗證.cmd 或 START_VERIFICATION.cmd，進入「冒險闖關／黑白棋」，依序點選六個教學關卡，確認提示、合法格、錯誤落子回饋、固定入門 NPC、完成與重玩流程。
3. 進入「自由練習／黑白棋」，切換入門、成長、挑戰、成人版；確認成人版文字與行為對應兩層／六候選，挑戰版對應一層／八候選，且不同固定局面會產生策略差異。
4. 進入「雙人同樂／黑白棋」，確認黑白雙方皆可手動操作且不顯示 NPC 難度。
5. Edge 四方向 smoke 已完成；Chrome 因目前沒有可連線的使用者設定檔而受環境阻擋，未冒險啟動或修復瀏覽器。

## 已知限制

- 黑白棋正式產品美術尚未列入正式 PWA；ART-007-r04 核准棋棋貓素材保留，但目前畫面不載入角色。
- Chrome 交叉驗證待可用的 Chrome 使用者設定檔；不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.23') {
    return `# v0.3.23 黑白棋版面可讀性與第二關可操作性修訂封存

## 驗證範圍

- 承接 v0.3.22；v0.3.22、v0.3.21、v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 修正黑白棋提案與冒險闖關的頁面溢出：內容可以安全垂直捲動，底部返回、語音與暫停操作不再被 viewport 隱藏。
- 修正逐字右側注音的字元間距，避免注音侵入相鄰國字；提高黑白棋冒險關卡名稱的中文可讀性，窄版改以容器重排，不以極小字級壓縮完整操作名稱。
- 第二關「包住一條線」改為固定唯一合法落點，且只翻一顆棋子；補上第二關唯一落點與第三關錯誤落子回歸測試。
- 保留完整六關互動教學、四階 NPC 策略區隔、標準 8×8 規則、雙人手動、提示／返回／再玩一次／語音／逐字右側台灣注音。

## 驗證方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 進入「冒險闖關／黑白棋」，開啟第二關，確認棋盤只顯示一個可下位置；確認落子後只翻一顆棋子並由固定入門 NPC 回應。
3. 以 390×844、844×390、768×1024、945×768 四個 viewport 檢查冒險闖關、自由練習與雙人同樂；確認無水平溢出、棋盤維持正方形、注音不與國字重疊，捲到底後最下面操作鍵完整可見。
4. Edge／Chrome 交叉驗證仍依環境狀態記錄；Chrome 目前沒有可連線的使用者設定檔，未冒險啟動或修復瀏覽器。

## 已知限制

- 黑白棋正式產品美術尚未列入正式 PWA；ART-007-r04 核准棋棋貓素材保留，但目前畫面不另外載入角色。
- Chrome 交叉驗證待可用的 Chrome 使用者設定檔；不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.24') {
    return `# v0.3.24 黑白棋暫停工具列填滿修訂封存

## 驗證範圍

- 承接 v0.3.23；v0.3.23、v0.3.22、v0.3.21、v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 修正冒險闖關工具列最後一個「暫停／繼續」按鈕跨滿整個工具列，消除兩欄排列留下的空白半格；不改變暫停、繼續、返回、語音或棋局規則行為。
- 保留 v0.3.23 已完成的六關互動教學、第二關唯一合法落點、四階 NPC、標準黑白棋規則、逐字右側台灣注音與垂直捲動版面。
- 製作人已明確授權：四方向 Edge 顯示不受垂直捲動影響時，V070-REVERSI（含目前已核准的 ART-007-r04 與共用兒童介面美術範圍）視為完成；畫面維持不載入棋棋貓素材的既有決定。

## 驗證方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 以 Edge 量測 390×844、844×390、768×1024、945×768；確認棋盤維持正方形、無水平溢出、頁面可捲到底、暫停鍵寬度填滿工具列且底部完整可見。
3. 確認「暫停」可切換為「繼續」並可恢復操作；確認原有第二關唯一落點、四階 NPC 與雙人手動行為未受影響。

## 已知限制

- Chrome 交叉驗證仍受目前無可連線使用者設定檔的環境限制；本版不把此環境限制誤報為產品畫面缺陷。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  if (version === 'v0.3.25') {
    return `# v0.3.25 黑白棋語音鍵保留與工具列修訂封存

## 驗證範圍

- 承接 v0.3.24；v0.3.24、v0.3.23、v0.3.22、v0.3.21、v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 黑白棋冒險闖關、自由練習與雙人同樂永遠保留「聽一聽」語音鍵；瀏覽器不支援語音時只停用按鍵，不隱藏或移除兒童可見的操作入口。
- 自由練習與雙人同樂維持返回／聽一聽兩格完整排列；冒險闖關的暫停／繼續鍵維持跨滿工具列最後一列；不改變返回行為、棋局規則、NPC 難度或雙人手動操作。
- 保留 v0.3.24 已完成的冒險闖關暫停／繼續鍵跨列、四方向捲動穩定性、六關互動教學、第二關唯一合法落點與目前核准美術範圍。

## 驗證方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 檢查黑白棋三種模式的工具列；確認自由練習與雙人同樂都顯示返回／聽一聽，冒險闖關顯示返回／聽一聽／暫停，且語音不支援時聽一聽只停用、不消失。
3. Edge 重新連線後再量測 390×844、844×390、768×1024、945×768；本次封存先保留 Edge 連線尚未恢復的限制，不宣稱本輪 Edge 交叉複核已完成。

## 已知限制

- Edge 自動化連線目前暫時不可用；需恢復後補做四方向實機複核。
- Chrome 交叉驗證仍受目前無可連線使用者設定檔的環境限制。
`
  }

  if (version === 'v0.3.27') {
    return `# v0.3.27 台灣繁體中文與台灣語音修訂封存

## 驗證範圍

- 承接 v0.3.26；既有 v0.3.26、v0.3.25、v0.3.24、v0.3.23、v0.3.22、v0.3.21、v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 雙人同樂依目前執棋方切換黑白棋翻子提示：黑棋為「包住白棋，翻成黑棋」，白棋為「包住黑棋，翻成白棋」；畫面文字與語音均使用同一筆台灣繁體中文文案。
- 所有兒童語音播放固定指定 zh-TW／台灣區域變體；語音層不回退至 zh-CN 或系統預設中文語音。
- 冒險教學完成文案「你完成了一個教學關卡」保留台灣注音「卡／ㄎㄚˇ」；自由練習與教學播放均經台灣語音選擇層處理。

## 驗證方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 在雙人同樂輪流下黑棋與白棋，確認提示文字及「聽一聽」使用相同的當前執棋方文案；在自由練習與冒險教學完成流程確認沒有非台灣中文語音回退。
3. 針對語音選擇執行固定測試：zh-TW 優先於 zh-CN、台灣名稱／區域變體可辨識、沒有台灣語音時不播放；Edge 本輪自動連線仍未恢復，不宣稱本輪重新量測四方向版面。

## 已知限制

- 本專案目前沒有真人錄音檔；播放由瀏覽器 SpeechSynthesis 提供，且播放請求固定指定台灣語音。實際聲音引擎的可用性仍由瀏覽器 API 回報，不以非台灣語音冒充台灣語音。
- Edge 自動化連線目前暫時不可用；Chrome 交叉驗證仍受目前無可連線使用者設定檔的環境限制。
`
  }

  if (version === 'v0.3.28') {
    return `# v0.3.28 台灣語音來源驗證修訂封存

## 驗證範圍

- 承接 v0.3.27；v0.3.27、v0.3.26、v0.3.25、v0.3.24、v0.3.23、v0.3.22、v0.3.21、v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 查證黑白棋冒險教學「卡」的結構化文案為「卡／ㄎㄚˇ」，自由練習「包夾」的「夾」為「夾／ㄐㄧㄚˊ」；兩筆 speech_zh_tw 文字均為台灣繁體中文，問題不在文字或注音資料。
- 修正語音來源選擇：只有語系為 zh-TW／zh-Hant 且語音名稱具有 Taiwan／台灣／臺灣標記或已知台灣語音家族名稱時才播放；只有 zh-TW 標籤但沒有來源證據的語音一律拒絕，不再可能落到中國或系統預設中文語音。
- 保留三款遊戲所有兒童模式的「聽一聽」按鍵、三鍵工具列、六關互動教學、四階 NPC、標準黑白棋規則、逐字右側台灣注音與垂直捲動版面。

## 驗證方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 執行語音來源單元測試：台灣標記語音可選、只有 zh-TW 標籤的誤標語音拒絕、zh-CN 語音拒絕；確認「卡／夾」的 speech_zh_tw 與逐字注音仍一致。
3. 以本機瀏覽器頁面確認兒童介面與「聽一聽」按鍵仍存在；本機驗證瀏覽器回報沒有可用 SpeechSynthesis voice，因此不把空語音清單誤報成台灣發音通過。Edge 自動連線與 Chrome 交叉驗證仍受環境限制。

## 已知限制

- 本專案目前沒有真人錄音檔；播放仍由瀏覽器 SpeechSynthesis 提供。本版只能以來源識別條件阻擋未確認語音，不能把沒有台灣來源證據的瀏覽器語音變成台灣發音。若要完全不受瀏覽器引擎影響，仍需另行核准並提供台灣錄音或可驗證授權的台灣 TTS 資產。
- Edge 自動化連線目前暫時不可用；Chrome 交叉驗證仍受目前無可連線使用者設定檔的環境限制。
`
  }

  if (version === 'v0.4.1') {
    return `# v0.4.1 暗棋版面修訂與正式美術提案驗證

## 驗證範圍

- 將首頁選單與暗棋兒童畫面主標題統一為「暗棋」；六關互動教學、規則與三種模式均維持。
- 修正 390×844、844×390、768×1024、945×768 的暗棋版面：4×8 棋盤保持正方格，頁面沒有水平溢位，控制項可隨頁面安全垂直捲動；返回／聽一聽同列，暫停／繼續獨占下一列。
- 建立 ART-008-r01 暗棋棋盤與棋子正式美術提案：暗棋背面改為不含文字的寶石封印棋背；已翻開的紅／黑棋改為可辨識的立體圓棋子，棋種仍以逐字右側台灣注音呈現。提案尚待製作人確認，不宣稱為已核准正式美術。
- 保留 4×8／32 枚、首翻定陣營、翻／走／吃、炮架、階級、雙方合計 50 步自動和局、NPC 40 步接受提和、雙人接受提和、四階 NPC 與語音按鍵／欄位；未把瀏覽器語音宣稱為固定台灣錄音。

## 驗證方式

1. 解壓後執行 \`npm.cmd ci\`、\`npm.cmd run check\` 與 \`npm.cmd run build\`。
2. 使用 \`START_VERIFICATION.cmd dark-chess-adventure\`、\`dark-chess-child\`、\`dark-chess-local\`，以及 \`?preview=dark-chess-art-proposal\` 查驗標題、互動教學、四階 NPC、雙人模式、棋子與響應式版面。
3. 依 \`ART_APPROVALS.md\` 所記錄的 Edge 與 Chrome 四方向一比一原始截圖，檢查棋盤比例、水平溢位、捲動與文字／注音可讀性；945×768 的 CSS 整數寬度若回報 946，須同時確認 visualViewport 945.6、文件寬度為向上取整且元素沒有實際水平越界。
4. 確認四方向提案網址在重新載入後由 \`sw.js\` 控制，並確認圖片 PNG 尺寸與 SHA-256 對應 ART-008-r01。

## 尚未納入與限制

- ART-008-r01 是待確認的正式美術提案。封包只作可操作驗證檔，不把它宣稱為已核准正式產品素材；製作人確認前不得將其升格為正式美術或修改既有已核准素材。
- 封包保留 ART-008-r01 的 Edge／Chrome 四方向原始 PNG 證據與其 SHA-256，供製作人直接檢視；這些是提案驗收證據，不是已核准正式素材。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍延後；本版只保留結構化文案、語音欄位與「聽一聽」按鍵。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.2') {
    return `# v0.4.2 暗棋介面修訂與 ART-008-r02 正式美術提案驗證

## 驗證範圍

- 延續暗棋既有規則、互動教學、冒險／自由練習／雙人同樂模式與語音欄位；兒童介面名稱統一為「暗棋」。
- 修正教學完成狀態重複出現兩個「再玩一次」的問題，單一用途的操作列不再留下空洞按鍵格。
- 修正全域禁止捲動造成的暗棋垂直溢出；4×8 棋盤維持正方形格子，頁面可安全垂直捲動且不產生水平溢出。
- 更新 ART-008-r02 提案：背面採深靛青／青綠寶石封印幾何，正反面與格底提高色彩對比，棋子維持實際圓形棋面，國字與右側直排台灣注音比例調整以提升可讀性。提案尚待製作人確認，不宣稱為已核准正式美術。
- 保留 4×8／32 枚、首翻定陣營、翻／走／吃、炮架、階級、雙方合計 50 步自動和局、NPC 40 步接受提和、雙人接受提和、四階 NPC 與語音按鍵／欄位；未把瀏覽器語音宣稱為固定台灣錄音。

## 驗證方式

1. 解壓後執行 \`npm.cmd ci\`、\`npm.cmd run check\` 與 \`npm.cmd run build\`。
2. 使用 \`?preview=dark-chess-art-proposal&verification=1\` 與三個暗棋模式入口查驗標題、互動教學、四階 NPC、雙人模式、32 枚棋子與操作列。
3. 以 Edge 與 Chrome 在 390×844、844×390、768×1024、945×768 逐一擷取 1:1 PNG，檢查 4×8 正方棋盤、完整棋子、按鍵邊界、文字／注音配對、水平溢出與垂直捲動。
4. 確認重新載入後由 \`sw.js\` 控制，並確認 ART-008-r02 原始 PNG 尺寸與 SHA-256。

## 尚未納入與限制

- ART-008-r02 是待確認的正式美術提案。封包只作可操作驗證檔，不把它宣稱為已核准正式產品素材；製作人確認前不得將其升格為正式美術或修改既有已核准素材。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍延後；本版只保留結構化文案、語音欄位與「聽一聽」按鍵。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.3') {
    return `# v0.4.3 暗棋吃子規則與逐字注音修訂、ART-008-r03 提案驗證

## 驗證範圍

- 延續暗棋 4×8／32 枚、首翻定陣營、翻棋／走子／吃子、炮架吃子、50 步自動和局、NPC 40 步提和、雙人接受提和、六關互動教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 修正普通吃子規則：兵／卒可以互吃；士／仕、象／相、車、馬與炮／包可以吃兵／卒；兵／卒可以吃將／帥；將／帥不能反吃兵／卒；兵／卒不能吃其他高階棋子。
- 更新兒童第四關吃子說明，保留逐字右側台灣注音與語音欄位契約，新增對應的新規則語音鍵值供後續錄音。
- ART-008-r03 以同一提案編號修訂：提高國字／注音比例、調整注音欄位寬度與棋子內部排版，確保兵／卒等多符號注音不溢出；實機提案示範加入紅兵與黑卒，背面仍為無文字深靛青／青綠寶石封印棋子。

## 驗證方式

1. 解壓後執行 \`npm.cmd ci\`、\`npm.cmd run check\` 與 \`npm.cmd run build\`。
2. 使用 \`?preview=dark-chess-art-proposal&verification=1\` 與三個暗棋模式入口查驗「暗棋」標題、互動教學、四階 NPC、雙人模式、32 枚棋子與操作列；黑白棋網址不得顯示暗棋。
3. 以 Edge 與 Chrome 在 390×844、844×390、768×1024、945×768 逐一擷取 1:1 PNG，檢查 4×8 正方棋盤、完整棋子、逐字注音配對邊界、按鍵內容邊界、水平溢出與垂直捲動。
4. 確認重新載入後由 \`sw.js\` 控制，並確認 ART-008-r03 原始 PNG 尺寸與 SHA-256。

## 尚未納入與限制

- ART-008-r03 是待確認的正式美術提案。封包只作可操作驗證檔，不把它宣稱為已核准正式產品素材；製作人確認前不得將其升格為正式美術或修改既有已核准素材。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍延後；本版只保留結構化文案、語音欄位與「聽一聽」按鍵。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }
  if (version === 'v0.4.4') {
    return `# v0.4.4 驗證啟動器與完整靜態建置輸出修訂

完整驗證 ZIP：\`releases/kids-board-game-kingdom-v0.4.4.zip\`

## 可驗證範圍

- 修正完整 ZIP 與 \`START_VERIFICATION.cmd\` 的契約：封包保留已建置的 \`dist/\` 靜態 PWA，解壓後可直接雙擊啟動器，不需先手動建置。
- 保留暗棋規則、六關互動教學、自由練習四階 NPC、雙人同樂、ART-008-r03 提案與既有逐字右側台灣注音；新增 \`dark-chess-art-proposal\` 啟動器參數入口。
- 本版只是驗證封裝／啟動流程技術修訂；ART-008-r03 仍待製作人確認，不宣稱正式暗棋美術已完成。

## 操作

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd dark-chess-art-proposal\`，或使用 \`開始驗證.cmd dark-chess-art-proposal\`。
3. 保持驗證伺服器視窗開啟，在瀏覽器操作顯示的本機網址。

## Machine Gate

- 內容／逐字右側台灣注音、TypeScript、全專案測試與 build 通過。
- ZIP 內含 \`dist/index.html\`、Service Worker 與靜態資產；乾淨解壓後啟動器、版本識別端點、check 與 build 均重新驗證。
`
  }

  if (version === 'v0.4.5') {
    return `# v0.4.5 暗棋版面、文字比例與 ART-008-r04 提案驗證

## 可驗證範圍

- 保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；不刪除既有互動教學、不改變已完成規則與模式。
- 修正 390×844、844×390、768×1024、945×768 四種指定尺寸的棋盤／棋子／按鍵版面：4×8 正方形棋盤完整可見、頁面不需捲動、無水平溢出、按鍵內容與文字邊界完整。
- ART-008-r04 延續同一提案編號修訂：國字明顯放大、右側直排台灣注音符號縮小，棋子內文字同步修正；棋子背面與正反面差異、實際棋子圖形與兒童王國風格提案保留，仍待製作人確認。

## 正確驗證入口

- 暗棋正式提案入口：\`?preview=dark-chess-art-proposal&verification=1\`。
- \`?preview=reversi-art-proposal\` 是黑白棋入口，不可拿來判定暗棋目前路由；若舊分頁以該網址顯示暗棋，應視為舊伺服器／舊分頁來源，先重新開啟本版入口。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd dark-chess-art-proposal\`，或使用 \`開始驗證.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；檢查 4×8／32 枚、棋盤比例、國字／注音逐字配對、無水平溢出、頁面高度與按鍵完整性。
4. 執行 \`npm.cmd ci\`、\`npm.cmd run check\`、\`npm.cmd run build\`，並確認 Service Worker 控制頁面。

## 尚未納入與限制

- ART-008-r04 只是正式美術提案，狀態為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.6') {
    return `# v0.4.6 暗棋文字比例微調與 ART-008-r04 提案驗證

## 可驗證範圍

- 承接 v0.4.5；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；不刪除既有互動教學、不改變已完成規則與模式。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚棋子、頁面不需捲動、無水平溢出，控制區與按鍵內容完整可見。
- ART-008-r04 同一提案修訂：國字明顯放大、右側直排台灣注音符號縮小但不縮成不可辨識的細小點；棋子內文字同步套用，逐字配對不可拆開。

## 正確驗證入口

- 暗棋正式提案入口：\`?preview=dark-chess-art-proposal&verification=1\`。
- \`?preview=reversi-art-proposal\` 是黑白棋入口，不可拿來判定暗棋目前路由；舊分頁顯示相反內容時應重新啟動本版入口。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd dark-chess-art-proposal\`，或使用 \`開始驗證.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；檢查 4×8／32 枚、棋盤比例、國字／注音逐字配對、無水平溢出、頁面高度與按鍵完整性。
4. 執行 \`npm.cmd ci\`、\`npm.cmd run check\`、\`npm.cmd run build\`，並確認 Service Worker 控制頁面。

## 尚未納入與限制

- ART-008-r04 仍是正式美術提案，狀態為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；保留共用語音鍵與欄位，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.7') {
    return `# v0.4.7 暗棋文字層級修訂與 ART-008-r05 提案驗證

## 可驗證範圍

- 承接 v0.4.6；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；不刪除既有互動教學、不改變已完成規則與模式。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚棋子、頁面不需捲動、無水平溢出，控制區與按鍵內容完整可見。
- ART-008-r05 同一提案修訂：每個中文字與其右側直排台灣注音採相同字級；棋子內文字同步套用，逐字配對不可拆開。

## 正確驗證入口

- 暗棋正式提案入口：\`?preview=dark-chess-art-proposal&verification=1\`。
- \`?preview=reversi-art-proposal\` 是黑白棋入口，不可拿來判定暗棋目前路由；舊分頁顯示相反內容時應重新啟動本版入口。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd dark-chess-art-proposal\`，或使用 \`開始驗證.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；檢查 4×8／32 枚棋子、棋盤比例、國字／注音逐字配對、無水平溢出、頁面高度與按鍵完整性。
4. 執行 \`npm.cmd ci\`、\`npm.cmd run check\`、\`npm.cmd run build\`，並確認 Service Worker 控制頁面。

## 尚未納入與限制

- ART-008-r05 仍是正式美術提案，狀態為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；保留共用語音鍵與欄位，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.8') {
    return `# v0.4.8 暗棋按鍵溢位與注音排版修訂、ART-008-r06 提案驗證

## 可驗證範圍

- 承接 v0.4.7；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；不刪除既有互動教學、不改變已完成的規則與模式。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚棋子、頁面不需捲動、無水平溢出，按鈕內文完整留在內容盒內。
- ART-008-r06 同一提案修訂：國字大小維持 v0.4.7，右側直排台灣注音略縮為 0.88em，修正直排符號過度壓縮與按鈕內文溢位；逐字配對、棋子文字與正式提案邊界不變。

## 正確驗證入口

- 暗棋正式提案入口：\`?preview=dark-chess-art-proposal&verification=1\`。
- \`?preview=reversi-art-proposal\` 是黑白棋入口，不可拿來判定暗棋目前路由；舊分頁顯示相反內容時應重新啟動本版入口。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd dark-chess-art-proposal\`，或使用 \`開始驗證.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；檢查 4×8／32 枚棋子、棋盤比例、國字／注音逐字配對、無水平溢出、頁面高度與按鍵完整性。
4. 執行 \`npm.cmd ci\`、\`npm.cmd run check\`、\`npm.cmd run build\`，並確認 Service Worker 控制頁面。

## 尚未納入與限制

- ART-008-r06 仍是正式美術提案，狀態為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；保留共用語音鍵與欄位，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.9') {
    return `# v0.4.9 暗棋版面與逐字注音修訂、ART-008-r07 提案驗證

## 可驗證範圍

- 承接 v0.4.8；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、遊戲規則與既有模式均保留。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚實體棋子、按鍵完整可用、無水平溢出；手機直向不需頁面捲動即可看到操作區。
- ART-008-r07 為同一 ART-008 提案的修訂：國字明顯大於右側直排台灣注音，注音以每字獨立直排欄呈現，聲調固定於該字注音欄右上；暗棋標題旁內嵌自由練習圖示，難度選項採緊湊橫向配置，工具列保留完整文字與 48 CSS px 以上觸控目標。

## 正確驗證入口與啟動器說明

- 暗棋正式提案入口：\`?preview=dark-chess-art-proposal&verification=1\`。
- \`?preview=reversi-art-proposal\` 是黑白棋入口，不是暗棋；若舊分頁顯示不同遊戲，請關閉舊分頁後以正確入口重新開啟。
- \`START_VERIFICATION.cmd\` 每次會選用新的本機埠號，並以 \`start "" URL\` 開啟瀏覽器新分頁；因此會看到新的 \`127.0.0.1:<port>\` 分頁，這是啟動器的既定行為，不代表 PWA 產生第二個遊戲路由。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd dark-chess-art-proposal\`，或使用 \`開始驗證.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證 390×844、844×390、768×1024、945×768；確認 4×8／32 枚、棋盤比例、國字／注音逐字配對、注音聲調位置、按鍵內容邊界與頁面溢位。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`，並確認四尺寸截圖由 Service Worker 控制。

## 證據與尚未納入

- Edge 與 Chrome 各四張 1:1 PNG，共八張；截圖驗證通過 32 枚棋子、4×8 棋盤、按鍵內容盒、無水平溢出與 SW 控制，國字／注音計算比例約 2.05–2.36。
- ART-008-r07 仍是正式美術提案，狀態為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.20') {
    return `# v0.4.20 暗棋注音聲調置中與相鄰字安全間距修訂、ART-008-r18 提案驗證

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.4.20.zip
SHA-256：ARCHIVE_HASH_V0420_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.4.19；暗棋規則、4×8／32 枚棋子、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、兵／卒互吃與高階吃兵／卒、兵／卒剋將／帥、50 步自動和局、40 步 NPC 接受提和、雙人合意和局、互動教學、自由練習四階 NPC、雙人同樂與語音欄位均保留。
- 依製作人最新回饋，圖示／按鍵注音與國字間距再收窄；聲調改為欄內水平定位，並依符號數量下移至國字中線，避免「再玩／提議／暫停」等相鄰國字重疊。棋子仍只顯示置中的國字，逐字注音資料未刪除。
- 390×844、844×390、768×1024、945×768 在 Edge 與 Chrome 各完成 1:1 原始截圖；確認 4×8／32 枚棋子、棋盤正方比例、注音聲調置中、三符號高度與相鄰字安全間距、按鍵內容無溢位、無水平／垂直頁面溢出，Service Worker 已控制。
- 暗棋名稱、首頁與暗棋標題、規則、教學、自由練習四難度、雙人同樂與語音按鈕均保留；ART-008-r18 仍為等待製作人確認的正式美術提案。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 START_VERIFICATION.cmd dark-chess-art-proposal，或使用 開始驗證.cmd dark-chess-art-proposal。
3. 以 Edge 為主、Chrome 交叉驗證四種指定 viewport；確認圖示／按鍵逐字右側直排台灣注音、聲調上下置中、相鄰國字不重疊與版面無溢出。
4. 執行 npm.cmd run check、npm.cmd run build；確認 ART-008-r18 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r18 是 ART-008 同一正式兒童美術提案的修訂，狀態仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.23') {
    return `# v0.4.23 暗棋注音欄式防重疊修訂、ART-008-r21 提案驗證

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.4.23.zip
SHA-256：ARCHIVE_HASH_V0423_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.4.22；暗棋名稱、4×8／32 枚棋子、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、兵／卒互吃與高階吃兵／卒、兵／卒剋將／帥、50 步自動和局、40 步 NPC 接受提和、雙人合意和局、互動教學、自由練習四階 NPC、雙人同樂與語音欄位均保留。
- 依製作人最新回饋，實際對照井字棋的共用注音欄位：每個配對使用國字欄、注音符號欄、聲調欄三個獨立位置，移除暗棋原本讓符號與聲調重疊的絕對定位；標題、提示、圖示與按鍵使用相同欄式間距，棋子仍只顯示置中國字。
- 新增阻擋式量測，逐一確認聲調與注音符號的水平安全距離，以及聲調與下一個國字不重疊；保留每個中文字右側直排台灣注音與不可拆配對。
- 390×844、844×390、768×1024、945×768 在 Edge 與 Chrome 各完成 1:1 原始截圖；確認 4×8／32 枚棋子、棋盤正方比例、按鍵內容無溢位、無水平／垂直頁面溢出與 Service Worker 控制。
- ART-008-r21 是 ART-008 同一正式兒童美術提案的修訂，狀態仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 START_VERIFICATION.cmd dark-chess-art-proposal，或使用 開始驗證.cmd dark-chess-art-proposal。
3. 以 Edge 為主、Chrome 交叉驗證四種指定 viewport；確認暗棋畫面中的「暗／走／棋／提」等字，其注音符號與聲調分欄、不互疊，且每個中文字仍與右側注音保持不可拆配對。
4. 執行 npm.cmd run check、npm.cmd run build；確認 ART-008-r21 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 已知限制

- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.22') {
    return `# v0.4.22 暗棋字間距與聲調安全距離修訂、ART-008-r20 提案驗證

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.4.22.zip
SHA-256：ARCHIVE_HASH_V0422_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.4.21；暗棋規則、4×8／32 枚棋子、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、兵／卒互吃與高階吃兵／卒、兵／卒剋將／帥、50 步自動和局、40 步 NPC 接受提和、雙人合意和局、互動教學、自由練習四階 NPC、雙人同樂與語音欄位均保留。
- 依製作人最新回饋，先以實際 DOM 量測確認「提議和局」、「走」等聲調到下一個國字的安全距離，再將暗棋一般逐字 pair 間距由 0.08em 微增至 0.12em、控制按鍵由 0.10em 微增至 0.16em，讓聲調有適當外移空間；不改國字／注音字級、直排方向、聲調垂直定位或棋子只顯示置中國字規則。
- 390×844、844×390、768×1024、945×768 在 Edge 與 Chrome 各完成 1:1 原始截圖；確認 4×8／32 枚棋子、棋盤正方比例、字間距增加後聲調與注音不互疊、按鍵內容無溢位、無水平／垂直頁面溢出，Service Worker 已控制。
- 暗棋名稱、首頁與暗棋標題、規則、教學、自由練習四難度、雙人同樂與語音按鈕均保留；ART-008-r20 仍為等待製作人確認的正式美術提案。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 START_VERIFICATION.cmd dark-chess-art-proposal，或使用 開始驗證.cmd dark-chess-art-proposal。
3. 以 Edge 為主、Chrome 交叉驗證四種指定 viewport；確認圖示／按鍵逐字右側直排台灣注音、聲調與注音不互疊、相鄰國字保留安全距離與版面無溢出。
4. 執行 npm.cmd run check、npm.cmd run build；確認 ART-008-r20 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r20 是 ART-008 同一正式兒童美術提案的修訂，狀態仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.21') {
    return `# v0.4.21 暗棋聲調下移與注音間距修訂、ART-008-r19 提案驗證

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.4.21.zip
SHA-256：ARCHIVE_HASH_V0421_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.4.20；暗棋規則、4×8／32 枚棋子、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、兵／卒互吃與高階吃兵／卒、兵／卒剋將／帥、50 步自動和局、40 步 NPC 接受提和、雙人合意和局、互動教學、自由練習四階 NPC、雙人同樂與語音欄位均保留。
- 依製作人最新回饋，僅將圖示／按鍵與一般說明中的聲調再向下微調，修正「提議和局」等文字聲調與注音靠太近的視覺問題；國字、注音逐字配對、棋子只顯示置中國字與既有版面／規則均保留。標題列維持原中線以避免徽章碰框。
- 390×844、844×390、768×1024、945×768 在 Edge 與 Chrome 各完成 1:1 原始截圖；確認 4×8／32 枚棋子、棋盤正方比例、注音聲調下移後仍在國字中線附近、三符號高度與相鄰字安全間距、按鍵內容無溢位、無水平／垂直頁面溢出，Service Worker 已控制。
- 暗棋名稱、首頁與暗棋標題、規則、教學、自由練習四難度、雙人同樂與語音按鈕均保留；ART-008-r19 仍為等待製作人確認的正式美術提案。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 START_VERIFICATION.cmd dark-chess-art-proposal，或使用 開始驗證.cmd dark-chess-art-proposal。
3. 以 Edge 為主、Chrome 交叉驗證四種指定 viewport；確認圖示／按鍵逐字右側直排台灣注音、聲調與注音不互疊、相鄰國字不重疊與版面無溢出。
4. 執行 npm.cmd run check、npm.cmd run build；確認 ART-008-r19 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r19 是 ART-008 同一正式兒童美術提案的修訂，狀態仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.19') {
    return `# v0.4.19 暗棋三符號注音與聲調外移修訂、ART-008-r17 提案驗證

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.4.19.zip
SHA-256：ARCHIVE_HASH_V0419_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.4.18；暗棋規則、4×8／32 枚棋子、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、兵／卒互吃與高階吃兵／卒、兵／卒剋將／帥、50 步自動和局、40 步 NPC 接受提和、雙人合意和局、互動教學、自由練習四階 NPC、雙人同樂與語音欄位均保留。
- 依製作人最新回饋，右側圖示／按鍵三符號注音縮至與國字接近，修正「回／或」直排字形過大或破圖；保留每個中文字與自己的台灣注音不可拆配對。聲調沿上一版方向再向外移至 4px，並保持注音欄中段與控制容器內。
- 棋子仍只顯示置中的國字，棋子注音資料未刪除；暗棋名稱、首頁與暗棋標題、規則、教學與既有模式不變。
- 390×844、844×390、768×1024、945×768 在 Edge 與 Chrome 各完成 1:1 原始截圖；確認 4×8／32 枚棋子、棋盤正方比例、三符號注音與聲調在容器內、按鍵內容無溢位、無水平／垂直頁面溢出，Service Worker 已控制。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 START_VERIFICATION.cmd dark-chess-art-proposal，或使用 開始驗證.cmd dark-chess-art-proposal。
3. 以 Edge 為主、Chrome 交叉驗證四種指定 viewport；確認圖示／按鍵逐字右側直排注音、三符號「回／或」字形、聲調外移與版面無溢出。
4. 執行 npm.cmd run check、npm.cmd run build；確認 ART-008-r17 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r17 是 ART-008 同一正式兒童美術提案的修訂，狀態仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.18') {
    return `# v0.4.18 暗棋棋子注音隱藏與右側注音密度修訂、ART-008-r16 提案驗證

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.4.18.zip
SHA-256：ARCHIVE_HASH_V0418_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.4.17；暗棋規則、4×8／32 枚棋子、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、兵／卒互吃與高階吃兵／卒、兵／卒剋將／帥、50 步自動和局、40 步 NPC 接受提和、雙人合意和局、互動教學、自由練習四階 NPC、雙人同樂與語音欄位均保留。
- 本修訂僅調整兒童視覺呈現：棋子隱藏注音並將國字置中；右側圖示／按鍵維持每字右側直排台灣注音，三符號欄位收緊且仍高於國字，聲調置於注音欄中段並保留安全間距。
- 390×844、844×390、768×1024、945×768 在 Edge 與 Chrome 各完成 1:1 原始截圖；確認 4×8／32 枚棋子、棋盤正方比例、棋子注音隱藏且國字置中、控制區字形與聲調在容器內、無水平／垂直頁面溢出，Service Worker 已控制。
- 兒童介面遊戲名稱仍為「暗棋」；入口使用 ?preview=dark-chess-art-proposal&verification=1，?preview=reversi-art-proposal 仍只代表黑白棋。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 START_VERIFICATION.cmd dark-chess-art-proposal，或使用 開始驗證.cmd dark-chess-art-proposal。
3. 以 Edge 為主、Chrome 交叉驗證四種指定 viewport；確認棋子只顯示置中國字，右側圖示／按鍵注音逐字配對、三符號密度與聲調位置、按鍵可用及頁面無溢出。
4. 執行 npm.cmd run check、npm.cmd run build；確認 ART-008-r16 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r16 是 ART-008 同一正式兒童美術提案的修訂，狀態仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.17') {
    return `# v0.4.17 暗棋注音方向回溯與字形邊界修訂、ART-008-r15 提案驗證

完整驗證 ZIP：releases/kids-board-game-kingdom-v0.4.17.zip
SHA-256：ARCHIVE_HASH_V0417_PENDING（封存後以同名 .sha256 為準）

## 可驗證範圍

- 承接 v0.4.16；依製作人連續回看 v0.4.15／v0.4.16 截圖，撤回 v0.4.16 的反向位移，恢復較易辨識的 v0.4.15 方向。棋子二符號注音上移 6px、三符號上移 10px 並收緊；棋子聲調固定向右 4px，單符號上移 10px、二／三符號下移 4px，並以零欄距與右側錨點保留在棋子內。
- 控制區二符號注音上移 5px；三符號上移 6px 並收緊，聲調下移 2px；保留控制區國字／注音安全間距。移除會裁切字形的 overflow: clip。
- 保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、兵／卒互吃與高階吃兵／卒、兵／卒剋將／帥、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、規則與既有模式均保留。入口使用 ?preview=dark-chess-art-proposal&verification=1；?preview=reversi-art-proposal 仍只代表黑白棋。
- 390×844、844×390、768×1024、945×768 在 Edge 與 Chrome 各完成 1:1 實機截圖；除頁面溢位外，新增逐一量測棋子／控制區漢字、注音、聲調子元素均在容器內，並確認 Service Worker 已控制。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 START_VERIFICATION.cmd dark-chess-art-proposal，或使用 開始驗證.cmd dark-chess-art-proposal。
3. 以 Edge 為主、Chrome 交叉驗證四種指定 viewport；確認 4×8／32 枚、棋盤正方形、逐字右側直排注音、聲調位置、按鍵可用及字形沒有超出棋子／按鍵／圖示。
4. 執行 npm.cmd run check、npm.cmd run build；確認 ART-008-r15 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r15 是 ART-008 同一正式兒童美術提案的修訂，狀態仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.16') {
    return `# v0.4.16 暗棋注音位移方向反轉修訂、ART-008-r14 提案驗證

## 可驗證範圍

- 承接 v0.4.15；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、遊戲規則與既有模式均保留。啟動器與直接入口均使用 \`?preview=dark-chess-art-proposal&verification=1\`；\`?preview=reversi-art-proposal\` 仍只代表黑白棋。
- 依製作人回看確認，將上一輪位移方向反轉：棋子一符號聲調向左 4px／下移 10px；二符號向左 4px／上移 4px；三符號整欄下移 10px、符號向外分開 4px、聲調向左 4px／上移 4px。控制區二符號整欄下移 5px；三符號整欄下移 6px、符號向外分開 3px、聲調上移 2px；保留國字與注音的安全間距。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚實體棋子；Edge／Chrome 均量測無水平／垂直溢出、控制按鍵及內文完整在視窗內。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd\`（預設暗棋），或使用 \`START_VERIFICATION.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；確認棋子與控制區分層位移、三符號密度、聲調位置、國字／注音間距、4×8／32 枚、棋子文字與按鍵內容邊界。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`，並確認 ART-008-r14 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r14 是 ART-008 同一正式兒童美術提案的修訂，仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.15') {
    return `# v0.4.15 暗棋注音分層位移與控制區安全間距修訂、ART-008-r13 提案驗證

## 可驗證範圍

- 承接 v0.4.14；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、遊戲規則與既有模式均保留。啟動器與直接入口均使用 \`?preview=dark-chess-art-proposal&verification=1\`；\`?preview=reversi-art-proposal\` 仍只代表黑白棋。
- 棋子一符號聲調向右 4px／上移 10px；二符號聲調向右 4px／下移 4px；三符號注音整欄上移 10px、符號收緊 4px、聲調向右 4px／下移 4px。控制區二符號注音整欄上移 5px；三符號整欄上移 6px、符號收緊 3px、聲調下移 2px；控制區國字與注音增加安全間距，避免聲調貼字。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚實體棋子；Edge／Chrome 均量測無水平／垂直溢出、控制按鍵及內文完整在視窗內。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd\`（預設暗棋），或使用 \`START_VERIFICATION.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；確認棋子與控制區分層位移、三符號密度、聲調位置、國字／注音間距、4×8／32 枚、棋子文字與按鍵內容邊界。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`，並確認 ART-008-r13 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r13 是 ART-008 同一正式兒童美術提案的修訂，仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.14') {
    return `# v0.4.14 暗棋控制區三符號注音收緊 2px 修訂、ART-008-r12 提案驗證

## 可驗證範圍

- 承接 v0.4.13；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、遊戲規則與既有模式均保留。啟動器與直接入口均使用 \`?preview=dark-chess-art-proposal&verification=1\`；\`?preview=reversi-art-proposal\` 仍只代表黑白棋。
- 棋子內所有聲調向外 3px、向下 6px；棋子三符號注音收緊 4px、整欄上移 4px。控制區一符號不位移；二符號只將聲調下移 4px；三符號在控制列基準字距上再收緊 2px、整欄上移 3px、聲調下移 2px。每個中文字與右側直排台灣注音仍為不可拆配對。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚實體棋子；Edge／Chrome 均量測無水平／垂直溢出、控制按鍵及內文完整在視窗內，四尺寸版面鎖定為本修訂 Machine Gate 基準。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd\`（預設暗棋），或使用 \`START_VERIFICATION.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；確認棋子與控制區分層位移、三符號密度、聲調位置、4×8／32 枚、棋子文字與按鍵內容邊界。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`，並確認 ART-008-r12 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r12 是 ART-008 同一正式兒童美術提案的修訂，仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.13') {
    return `# v0.4.13 暗棋注音聲調分層與三符號密度修訂、ART-008-r11 提案驗證

## 可驗證範圍

- 承接 v0.4.12；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、遊戲規則與既有模式均保留。啟動器與直接入口均使用 \`?preview=dark-chess-art-proposal&verification=1\`；\`?preview=reversi-art-proposal\` 仍只代表黑白棋。
- 棋子內所有聲調向外 3px、向下 6px；棋子三符號注音收緊 4px、整欄上移 4px。控制區一符號不位移；二符號只將聲調下移 4px；三符號收緊 2px、整欄上移 3px、聲調下移 2px。每個中文字與右側直排台灣注音仍為不可拆配對。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚實體棋子；Edge／Chrome 均量測無水平／垂直溢出、控制按鍵及內文完整在視窗內，四尺寸版面鎖定為本修訂 Machine Gate 基準。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd\`（預設暗棋），或使用 \`START_VERIFICATION.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；確認棋子與控制區分層位移、三符號密度、聲調位置、4×8／32 枚、棋子文字與按鍵內容邊界。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`，並確認 ART-008-r11 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r11 是 ART-008 同一正式兒童美術提案的修訂，仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.12') {
    return `# v0.4.12 暗棋注音分層、棋子色彩辨識與四尺寸版面鎖定、ART-008-r10 提案驗證

## 可驗證範圍

- 承接 v0.4.11；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、遊戲規則與既有模式均保留。啟動器與直接入口均使用 \`?preview=dark-chess-art-proposal&verification=1\`；\`?preview=reversi-art-proposal\` 仍只代表黑白棋。
- 共用逐字注音元件新增一／二／三符號類別；暗棋一符號不位移、二符號整欄上移 6px、三符號上下集中 3px 後整欄上移 3px；所有聲調向外 2px，仍維持每個中文字與右側直排台灣注音不可拆配對。
- 棋子圈內使用明亮朱紅與深黑高對比配色；底格與蓋棋維持不同狀態，不改暗棋規則或既有教學／模式。
- 390×844、844×390、768×1024、945×768 四種指定尺寸均維持 4×8 正方形棋盤與 32 枚實體棋子；Edge／Chrome 均正式量測 \`overflowElements=[]\`、文件寬高不超過 viewport、控制按鍵及內文完整在視窗內，四尺寸版面鎖定為本修訂 Machine Gate 基準。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd\`（預設暗棋），或使用 \`START_VERIFICATION.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證四種指定尺寸；確認注音分層位移、三符號密度、聲調外移 2px、棋子四狀態色彩、4×8／32 枚、棋子文字與按鍵內容邊界。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`，並確認 ART-008-r10 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r10 是 ART-008 同一正式兒童美術提案的修訂，仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版只保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.11') {
    return `# v0.4.11 暗棋四尺寸版面與注音密度修訂、ART-008-r09 提案驗證

## 可驗證範圍

- 承接 v0.4.10；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、遊戲規則與既有模式均保留。啟動器與直接入口均使用 \`?preview=dark-chess-art-proposal&verification=1\`；\`?preview=reversi-art-proposal\` 仍只代表黑白棋。
- 三符號注音的垂直間距改為更密集；棋子內注音整體上移 4px 並維持逐字不可拆配對，聲調仍在注音欄中段。
- 390×844、844×390、768×1024、945×768 四種指定尺寸均維持 4×8 正方形棋盤與 32 枚實體棋子；手機直向與平板直向均可在視窗內看到棋盤與全部操作按鍵，無水平溢出、無頁面捲動。
- 手機直向控制按鍵縮至 42px 高，較大直向視窗縮至 44px 高；「提示／提議和局／再玩一次／暫停」文字與按鍵內容均留在按鈕內，未使用截圖專用 CSS、\`zoom\` 或不可讀縮字。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd\`（預設暗棋），或使用 \`START_VERIFICATION.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證 390×844、844×390、768×1024、945×768；確認 4×8／32 枚、棋盤比例、逐字右側台灣注音、棋子注音上移、按鍵內容邊界、無水平溢出與無垂直捲動。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`，並確認 ART-008-r09 Edge／Chrome 各四張 1:1 PNG 與 Service Worker 控制頁面。

## 證據與尚未納入

- ART-008-r09 是 ART-008 同一正式兒童美術提案的修訂，仍為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版保留共用語音鍵與欄位，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.10') {
    return `# v0.4.10 暗棋啟動器與注音定位修訂、ART-008-r08 提案驗證

## 可驗證範圍

- 承接 v0.4.9；保留暗棋 4×8／32 枚、翻棋定陣營、翻／走／吃、炮架吃法、階級規則、雙方合計連續 50 步無翻棋或吃子自動和局、NPC 40 步以上接受提議和局、雙人由另一位玩家接受和局，以及冒險教學、自由練習四階 NPC、雙人同樂與語音按鈕。
- 兒童介面遊戲名稱統一為「暗棋」；互動教學、遊戲規則與既有模式均保留。移除自由練習旁沒有用途的黑色 X 圖示。
- 啟動器預設開啟 \`?preview=dark-chess-art-proposal&verification=1\`；黑白棋提案仍可明確使用 \`START_VERIFICATION.cmd reversi-art-proposal\` 或手動網址。每次啟動使用新的暫時本機埠並以 \`start "" URL\` 開啟新分頁，因此舊的 \`127.0.0.1:<port>\` 分頁是先前啟動留下的分頁，不代表多一條產品路由，也不需要重開機。
- 390×844、844×390、768×1024、945×768 四種指定尺寸維持 4×8 正方形棋盤、32 枚實體棋子、按鍵完整可用、無水平溢出且頁面高度不需捲動。
- ART-008-r08 為同一 ART-008 提案的修訂：國字再放大，注音字級維持本輪前設定；每個注音欄與國字垂直置中並整體略上移，聲調固定在注音欄中段，不互疊、不讓兵／卒注音溢出棋子。

## 正確驗證入口與啟動器說明

- 暗棋正式提案入口：\`?preview=dark-chess-art-proposal&verification=1\`。
- \`?preview=reversi-art-proposal\` 是黑白棋入口，不是暗棋；若舊分頁仍顯示該網址，請關閉舊分頁或以 \`START_VERIFICATION.cmd reversi-art-proposal\` 明確驗證黑白棋。
- \`START_VERIFICATION.cmd\` 與 \`開始驗證.cmd\` 預設為暗棋；啟動器會選新的暫時連接埠並開啟一個新分頁，無須重開機。

## 操作與 Machine Gate

1. 完整解壓 ZIP。
2. 雙擊 \`START_VERIFICATION.cmd\`（預設暗棋），或使用 \`START_VERIFICATION.cmd dark-chess-art-proposal\`。
3. 以 Edge 為主、Chrome 交叉驗證 390×844、844×390、768×1024、945×768；確認 4×8／32 枚、棋盤比例、國字／注音逐字配對、聲調位置、按鍵內容邊界、無水平溢出與 Service Worker 控制。
4. 執行 \`npm.cmd run check\`、\`npm.cmd run build\`，並確認 ART-008-r08 八張 1:1 PNG。

## 證據與尚未納入

- ART-008-r08 仍是正式美術提案，狀態為「待製作人確認」；本封存不宣稱暗棋正式產品美術已核准，也不重開既有已核准美術。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍是後續工作；本版保留共用語音鍵、語音欄位與「聽一聽」按鈕，不把瀏覽器 TTS 宣稱為已驗證台灣發音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.4.0') {
    return `# v0.4.0 暗棋兒童流程與規則引擎技術驗證封存

## 驗證範圍

- 承接已確認且不可修改的 v0.3.29；v0.3.29、v0.3.15、v0.2.1 及其他已保留歷史封存 ZIP 均不修改。
- 完成台灣暗棋 4×8／32 格、32 枚棋子、固定種子暗置、首翻定陣營、翻棋／走子／吃子、階級、炮架吃子、雙方無步終局、雙方合計 50 步自動和局、40 步 NPC 接受提和與雙人合意和局規則。
- 冒險闖關提供六個可重玩的互動教學關卡：翻棋、陣營、走子、吃子、炮架與 50 步和局；自由練習提供入門、成長、挑戰、成人版四階 NPC；挑戰為一層搜尋／每節點最多八個候選，成人版為兩層搜尋／每節點最多六個候選；雙人同樂由雙方手動且不顯示 NPC 難度。
- 所有暗棋兒童流程沿用結構化台灣繁體中文、逐字右側台灣注音、語音鍵、返回／聽一聽／暫停三鍵工具列與可捲動響應式版面；文案優先共用既有短句，只有新增語意才新增語音鍵值。
- 補充三個可直接操作的驗證入口：\`?preview=dark-chess-adventure\`、\`?preview=dark-chess-child\`、\`?preview=dark-chess-local\`；規則工程入口仍為 \`?preview=dark-chess-verification\`。

## 驗證方式

1. 解壓後執行 \`npm.cmd ci\`、\`npm.cmd run check\` 與 \`npm.cmd run build\`。
2. 雙擊 \`START_VERIFICATION.cmd dark-chess-adventure\`，逐關操作六個教學關卡；再以 \`dark-chess-child\` 查驗四階難度，最後以 \`dark-chess-local\` 查驗雙人手動與提議和局。
3. 以 Edge 為主要瀏覽器，依序以手機直向、手機橫向、平板直向、平板橫向檢查棋盤比例、垂直捲動、底部工具列、注音與國字間距；以 Chrome 交叉查驗同三個入口。必要時用 \`?preview=dark-chess-verification\` 查驗規則快速局面與存檔。

## 尚未納入與限制

- 本封存是 V080 的完整技術驗證檔，不是正式暗棋美術核准檔；暗棋棋盤、棋子、棋棋貓、場景與其他正式美術仍未經製作人確認，未宣稱正式產品美術完成。
- 固定台灣真人錄音／可驗證授權的台灣 TTS 資產仍依製作人決策延後；本版保留語音欄位與「聽一聽」按鍵，不把瀏覽器預設語音宣稱為固定台灣錄音。
- 不包含雙裝置連線、帳號、雲端服務、外部後端或兒童個人資料功能。
`
  }

  if (version === 'v0.3.29') {
    return `# v0.3.29 黑白棋完成範圍與語音延期決策封存

## 驗證範圍

- 承接 v0.3.28；v0.3.28、v0.3.27、v0.3.26、v0.3.25、v0.3.24、v0.3.23、v0.3.22、v0.3.21、v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 製作人確認：黑白棋 V070-REVERSI 在扣除固定台灣語音資產製作後，互動教學、固定入門 NPC、自由練習四階 NPC、雙人同樂、標準規則、提示、返回／再玩一次、逐字右側台灣注音、四方向版面與目前核准美術範圍均完成。
- 語音按鍵與語音欄位保留；固定台灣錄音／可驗證台灣 TTS 資產、142 筆完整短句收錄與後續台灣發音統計列為後續獨立工作，不阻擋 V070-REVERSI 完成。
- 目前 142 筆兒童文案中有 138 句不同語音；相同短句應共用音檔，未來新增不同短句時再新增並驗證對應資產。

## 驗證方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 依序檢查黑白棋冒險闖關六關、固定入門 NPC、自由練習四階 NPC、雙人同樂雙方手動、標準規則、提示、返回、再玩一次、回合切換、版面捲動與目前核准美術範圍。
3. 確認「聽一聽」按鍵與兒童文案／注音資料仍存在；本版不把瀏覽器 SpeechSynthesis 或未收錄音檔宣稱為固定台灣語音資產。

## 已知限制與後續

- 固定台灣語音資產尚未製作；瀏覽器語音只保留既有安全限制，不作為本版語音品質驗收依據。
- 語音資產工作待所有目前遊戲內容穩定後，重新統計共用文案、選擇免費或已核准來源、收錄完整短句並建立音檔雜湊驗證。
- Edge 自動化連線目前暫時不可用；Chrome 交叉驗證仍受目前無可連線使用者設定檔的環境限制。
`
  }

  if (version === 'v0.3.26') {
    return `# v0.3.26 三款遊戲語音鍵完整保留修訂封存

## 驗證範圍

- 承接 v0.3.25；v0.3.25、v0.3.24、v0.3.23、v0.3.22、v0.3.21、v0.3.20、v0.3.19、v0.3.18、v0.3.17、v0.3.16、v0.3.15、v0.3.12 與 v0.2.1 封存 ZIP 均不修改。
- 三款遊戲的兒童畫面均固定保留「聽一聽」語音鍵：井字棋原有行為維持，五子棋與黑白棋的冒險闖關、自由練習及雙人同樂不再因瀏覽器語音能力判斷而隱藏；不支援語音時只停用按鍵。
- 三款遊戲所有兒童模式共用同一套三鍵工具列：返回／聽一聽同列各半寬，暫停／繼續下一列全寬；保留黑白棋六關互動教學、第二關唯一合法落點、四階 NPC 與標準規則。

## 驗證方式

1. 執行 npm.cmd ci、npm.cmd run check 與 npm.cmd run build。
2. 依序檢查井字棋、五子棋與黑白棋的冒險闖關、自由練習及雙人同樂；確認每個兒童畫面都使用返回／聽一聽同列、暫停／繼續下一列全寬，並確認語音不支援時按鍵只停用、不消失。
3. 沿用 v0.3.24 Edge 四方向版面證據；本輪 Edge 自動化連線尚未恢復，不宣稱本輪重新量測；Chrome 交叉驗證仍受使用者設定檔環境限制。

## 已知限制

- Edge 自動化連線目前暫時不可用；需恢復後補做本版四方向實機複核。
- Chrome 交叉驗證仍受目前無可連線使用者設定檔的環境限制。
`
  }

  if (version === 'v0.3.13') {
    return `# v0.3.13 五子棋手機觸控驗證封存

## 本版內容

- 五子棋手機直向與橫向的四階難度、提示、再玩一次、返回、聽一聽與暫停按鈕，皆維持至少 48 CSS px 高度。
- 保留 15×15 封閉交點棋盤、四關冒險、四階 NPC、自由練習、同機雙人、禁手說明與 IndexedDB 恢復。
- 本封包由已驗證的後續來源隔離重建為 v0.3.13 快照；未包含 v0.3.14 的鍵盤交點導覽與提示可讀性修訂。

## 驗證方式

1. 解壓後執行 \`npm.cmd ci\`、\`npm.cmd run check\`、\`npm.cmd run build\`。
2. 雙擊 \`開始驗證.cmd\`，再開啟 \`?preview=gomoku&verification=1\`、\`?preview=gomoku-tutorial&verification=1\` 與 \`?preview=gomoku-local&verification=1\`。
3. 驗證手機直向／橫向操作按鈕高度、15×15 棋盤比例、禁手改選、四階 NPC 與同機雙人。

## 已知限制

- ART-006-r02 五子棋正式美術尚未取得有效四方向一比一程式截圖，未經製作人核准；本封包不宣稱技術棋盤、棋子與場景為正式美術。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
  }

  return `# v0.3.14 五子棋可用性驗證封存

## 本版內容

- 承接 v0.3.13 的 48 CSS px 手機觸控目標修訂。
- 15×15 棋盤改為單一 Tab 進入點；方向鍵可在交點間移動並跳過已落子位置。
- 提示卡以 \`aria-live=polite\` 通知變化，不會打斷兒童既有操作。
- 保留 15×15 封閉交點棋盤、四關冒險、四階 NPC、自由練習、同機雙人、禁手說明與 IndexedDB 恢復。

## 驗證方式

1. 解壓後執行 \`npm.cmd ci\`、\`npm.cmd run check\`、\`npm.cmd run build\`。
2. 雙擊 \`開始驗證.cmd\`，再開啟 \`?preview=gomoku-local&verification=1\`。
3. 以 Tab 進入棋盤中央交點，按方向鍵確認焦點移到下一個空交點；在中央落子後，從左側按右鍵確認會略過已落子的交點。

## 已知限制

- ART-006-r02 五子棋正式美術尚未取得有效四方向一比一程式截圖，未經製作人核准；本封包不宣稱技術棋盤、棋子與場景為正式美術。
- 不包含雙裝置連線、帳號、雲端同步、外部服務或真人錄音素材。
`
}

async function listFiles(rootDirectory, directory = rootDirectory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(rootDirectory, fullPath))
    else if (entry.isFile()) files.push(fullPath)
  }
  return files
}

async function createManifest(stageDirectory) {
  const files = await listFiles(stageDirectory)
  const entries = []
  for (const filePath of files) {
    const archivePath = normalisedRelative(stageDirectory, filePath)
    if (archivePath === 'MANIFEST.sha256') continue
    const hash = createHash('sha256').update(await readFile(filePath)).digest('hex').toUpperCase()
    entries.push(`${hash}  ${archivePath}`)
  }
  entries.sort((left, right) => left.localeCompare(right, 'en'))
  await writeFile(join(stageDirectory, 'MANIFEST.sha256'), `${entries.join('\n')}\n`, 'utf8')
}

async function assertStageIsClean(stageDirectory) {
  const files = await listFiles(stageDirectory)
  const names = files.map((filePath) => normalisedRelative(stageDirectory, filePath))
  const invalid = names.filter((name) => (
    name.startsWith('releases/') ||
    name.startsWith('node_modules/') ||
    name.startsWith('.edge-evidence-temp/') ||
    name.startsWith('.firefox-art-probe-profile/') ||
    (name.startsWith('art/proposals/') && !name.startsWith('art/proposals/screenshots/ART-008-r21/')) ||
    name.startsWith('art/previews/ART-006-') ||
    /(^|\/)(?:.*\.(?:tmp|bak|old|log)|coverage)(?:\/|$)/i.test(name) ||
    /(?:^|\/)(?:final2|new|copy)(?:\/|$)/i.test(name)
  ))
  if (invalid.length > 0) fail(`Release stage contains forbidden files:\n${invalid.join('\n')}`)
}

function createZip(stageDirectory, zipPath) {
  const escapedStage = stageDirectory.replaceAll("'", "''")
  const escapedZip = zipPath.replaceAll("'", "''")
  const command = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `[System.IO.Compression.ZipFile]::CreateFromDirectory('${escapedStage}', '${escapedZip}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`,
  ].join('; ')
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], workspaceDirectory)
}

async function makeArchive(version) {
  if (!supportedVersions.has(version)) fail(`Unsupported version: ${version}`)
  const outputZip = join(releasesDirectory, `kids-board-game-kingdom-${version}.zip`)
  const outputSha = join(releasesDirectory, `kids-board-game-kingdom-${version}.sha256`)
  try {
    await stat(outputZip)
    fail(`Refusing to overwrite existing archive: ${outputZip}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  try {
    await stat(outputSha)
    fail(`Refusing to overwrite existing checksum: ${outputSha}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), `kids-board-game-${version.replaceAll('.', '-')}-`))
  activeNpmCacheDirectory = configuredNpmCacheDirectory ?? join(temporaryRoot, 'npm-cache')
  try {
    const stageDirectory = join(temporaryRoot, 'stage')
    await cp(workspaceDirectory, stageDirectory, { recursive: true, filter: shouldCopy })
    if (skipArchiveRebuild) {
      await cp(join(workspaceDirectory, 'dist'), join(stageDirectory, 'dist'), { recursive: true })
      console.warn('ARCHIVE_SKIP_REBUILD=1：沿用目前工作區已通過 check/build 的 dist；未跳過來源檔案清單、Manifest 或封包檢查。')
    }
    if (version === 'v0.3.13') await prepareV0313(stageDirectory)
    if (version === 'v0.4.3') await prepareV043(stageDirectory)
    if (version === 'v0.4.4') await prepareV044(stageDirectory)
    if (version === 'v0.4.5') await prepareV045(stageDirectory)
    if (version === 'v0.4.6') await prepareV046(stageDirectory)
    if (version === 'v0.4.7') await prepareV047(stageDirectory)
    if (version === 'v0.4.8') await prepareV048(stageDirectory)
    if (version === 'v0.4.9') await prepareV049(stageDirectory)
    if (version === 'v0.4.10') await prepareV0410(stageDirectory)
    if (version === 'v0.4.11') await prepareV0411(stageDirectory)
    if (version === 'v0.4.12') await prepareV0412(stageDirectory)
    if (version === 'v0.4.13') await prepareV0413(stageDirectory)
    if (version === 'v0.4.14') await prepareV0414(stageDirectory)
    if (version === 'v0.4.15') await prepareV0415(stageDirectory)
    if (version === 'v0.4.16') await prepareV0416(stageDirectory)
    if (version === 'v0.4.17') await prepareV0417(stageDirectory)
    if (version === 'v0.4.18') await prepareV0418(stageDirectory)
    if (version === 'v0.4.19') await prepareV0419(stageDirectory)
    if (version === 'v0.4.20') await prepareV0420(stageDirectory)
    if (version === 'v0.4.21') await prepareV0421(stageDirectory)
    if (version === 'v0.4.22') await prepareV0422(stageDirectory)
    if (version === 'v0.4.23') await prepareV0423(stageDirectory)
    await writeFile(join(stageDirectory, 'RELEASE_NOTES.md'), releaseNotes(version), 'utf8')
    await assertStageIsClean(stageDirectory)
    if (!skipArchiveRebuild) {
      runNpm(['ci', '--ignore-scripts'], stageDirectory)
      runNpm(['run', 'check'], stageDirectory)
      runNpm(['run', 'build'], stageDirectory)
      await rm(join(stageDirectory, 'node_modules'), { recursive: true, force: true })
    }
    await createManifest(stageDirectory)
    await assertStageIsClean(stageDirectory)

    const temporaryZip = join(temporaryRoot, basename(outputZip))
    createZip(stageDirectory, temporaryZip)
    await mkdir(releasesDirectory, { recursive: true })
    await copyFile(temporaryZip, outputZip)
    const archiveHash = createHash('sha256').update(await readFile(outputZip)).digest('hex').toUpperCase()
    await writeFile(outputSha, `${archiveHash}  ${basename(outputZip)}\n`, 'utf8')
    console.log(`Created ${outputZip}`)
    console.log(`SHA-256 ${archiveHash}`)
  } finally {
    activeNpmCacheDirectory = null
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

const versions = process.argv.slice(2)
  if (versions.length === 0) fail('Usage: node scripts/build-validation-archives.mjs v0.3.13 [v0.3.14] [v0.3.15] [v0.3.16] [v0.3.17] [v0.3.18] [v0.3.19] [v0.3.20] [v0.3.21] [v0.3.22] [v0.3.23] [v0.3.24] [v0.3.25] [v0.3.26] [v0.3.27] [v0.3.28] [v0.3.29] [v0.4.0] [v0.4.1] [v0.4.2] [v0.4.3] [v0.4.4] [v0.4.5] [v0.4.6] [v0.4.7] [v0.4.8] [v0.4.9] [v0.4.10] [v0.4.11] [v0.4.12] [v0.4.13] [v0.4.14] [v0.4.15] [v0.4.16] [v0.4.17] [v0.4.18] [v0.4.19] [v0.4.20] [v0.4.21] [v0.4.22] [v0.4.23] [v0.5.2] [v0.5.3] [v0.5.4] [v0.5.5] [v0.6.1] [v0.6.2] [v0.6.3] [v0.6.4] [v0.6.5] [v0.6.6] [v0.6.7] [v0.7.0] [v0.7.1] [v0.7.2] [v0.7.3] [v0.9.0] [v0.9.1]')
for (const version of versions) await makeArchive(version)
