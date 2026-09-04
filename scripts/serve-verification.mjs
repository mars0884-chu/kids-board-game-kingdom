import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const distDirectory = path.resolve(scriptDirectory, '..', 'dist')
const packageDirectory = path.resolve(scriptDirectory, '..')
const packageMetadata = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'))
const verificationIdentity = JSON.stringify({
  application: packageMetadata.name,
  version: packageMetadata.version,
})
const requestedPort = Number(process.argv[2] ?? 4174)
const port = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65535
  ? requestedPort
  : 4174

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
])

if (!existsSync(path.join(distDirectory, 'index.html'))) {
  throw new Error('Missing dist/index.html. Build the project or extract the entire verification ZIP first.')
}

function resolveRequestPath(pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const absolutePath = path.resolve(distDirectory, requested)

  if (!absolutePath.startsWith(`${distDirectory}${path.sep}`)) {
    return null
  }

  if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
    return absolutePath
  }

  return path.join(distDirectory, 'index.html')
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)

  if (pathname === '/__verification_identity__.json') {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    })
    response.end(verificationIdentity)
    return
  }

  const filePath = resolveRequestPath(pathname)
  if (filePath === null) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Forbidden request path.')
    return
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': mimeTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Verification server: http://127.0.0.1:${port}/`)
  console.log('Keep this window open while testing. Press Ctrl+C to stop.')
})

process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
