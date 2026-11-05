// SPDX-License-Identifier: AGPL-3.0-only
// apps/client's mock web export, served by the prototypes' own Vite server at /web, where the
// chrome's frames hold it (one-client-platform.md › The prototypes are the clients). It's
// `bun run --cwd apps/client export:web:mock`: the client with the mock transport inside it, a
// single-page app under /web (its experiments.baseUrl), so it's served as the server serves the
// web client: a file when there is one, a 404 for a missing one under _expo/ or assets/, and
// index.html for any other address, the router's.
//
// One server for both, rather than Expo's dev server beside Vite's: the chrome and the client
// share an origin, which the frame channel checks (@highsea-tv/mock/frame), and the sweeps'
// `vite build` and `vite preview` (scripts/sweeps/README.md) serve it with nothing else to start.
// Vite's hooks for it: configureServer and configurePreviewServer add middleware ahead of Vite's
// own (https://vite.dev/guide/api-plugin#configureserver).
//
// The export is made again when its stamp (apps/client/scripts/stamp.ts, written by the export
// however it's run) differs from its inputs' now. That's checked as the server starts and as the prototypes
// build, never while they run: an edit to the client needs the server restarted to show. It's
// made in a folder of its own and renamed into place, so a run that fails leaves the last export
// served (or the 503 below) and two runs at once never write into one folder
// (apps/client/scripts/export-mock.ts).
// HIGHSEA_CLIENT_EXPORT=0 serves whatever is there. Beside it, at /web/mock-media/, the clip the
// mock plays every film as (./mock-media.ts).
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { inputsStamp, ROOT, STAMP_FILE } from '../../apps/client/scripts/stamp.ts'
import { ensureMockMedia, mockMediaMiddleware } from './mock-media.ts'

export { inputsStamp }

const CLIENT = join(ROOT, 'apps/client')
const EXPORT = join(CLIENT, 'dist-mock')
const INDEX = join(EXPORT, 'index.html')
/** The client's addresses, as its experiments.baseUrl has them. */
export const CLIENT_BASE = '/web'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * Whether the export in `dir` was made from the inputs as they are now: 'current', 'stale', or
 * 'missing'. The stamp is the one export-mock.ts writes, from the same module.
 */
export function exportState(dir = EXPORT, root = ROOT): 'current' | 'stale' | 'missing' {
  if (!existsSync(join(dir, 'index.html'))) return 'missing'
  let made = ''
  try {
    made = readFileSync(join(dir, STAMP_FILE), 'utf8')
  } catch {}
  return made === inputsStamp(root) ? 'current' : 'stale'
}

/**
 * Makes the export when it's missing or stale. A failure is logged, never thrown: the last export
 * (or the 503) is still served. Returns whether an export is there to serve.
 */
export function ensureClientExport(log: (message: string) => void = console.log): boolean {
  if (process.env.HIGHSEA_CLIENT_EXPORT === '0') return existsSync(INDEX)
  const state = exportState()
  if (state === 'current') return true
  log(
    `apps/client's mock web export is ${state === 'missing' ? 'missing' : 'out of date'}: making it (about 30 s). Edits to the client need the server restarted.`,
  )
  // apps/client's export:web:mock, which builds aside, renames into place and stamps it itself
  const run = spawnSync('bun', ['run', 'export:web:mock'], { cwd: CLIENT, stdio: 'inherit' })
  if (run.status !== 0) {
    log(
      `apps/client's mock web export failed: ${existsSync(INDEX) ? 'serving the last one' : 'nothing to serve at /web'}. Fix it and restart.`,
    )
    return existsSync(INDEX)
  }
  return true
}

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

function send(res: ServerResponse, file: string) {
  res.statusCode = 200
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
  // the export changes under the same names between builds of index.html
  res.setHeader('Cache-Control', 'no-cache')
  createReadStream(file).pipe(res)
}

/** Answers every address under /web from the export in `dir` (apps/client's dist-mock). */
export function clientMiddlewareFor(dir: string): Connect.NextHandleFunction {
  const index = join(dir, 'index.html')
  return (req, res, next) => {
    const pathname = (req.url ?? '/').split('?')[0] ?? '/'
    if (!under(pathname, CLIENT_BASE)) return next()
    if (!existsSync(index)) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      return res.end('Run `bun run --cwd apps/client export:web:mock`, then reload.')
    }
    let rest: string | null
    try {
      rest = decodeURIComponent(pathname.slice(CLIENT_BASE.length))
    } catch {
      // a bad escape names no file
      rest = null
    }
    // only a file inside the export: `..` in any spelling resolves outside it and is refused
    const file = rest === null ? null : normalize(join(dir, rest))
    if (file?.startsWith(dir + sep) && statSync(file, { throwIfNoEntry: false })?.isFile())
      return send(res, file)
    const asset = ['_expo', 'assets'].some((d) => under(pathname, `${CLIENT_BASE}/${d}`))
    if (asset || rest === null || file === null || !(file + sep).startsWith(dir + sep)) {
      res.statusCode = 404
      return res.end()
    }
    send(res, index)
  }
}

/** Answers every address under /web from apps/client's export. */
export const clientMiddleware = clientMiddlewareFor(EXPORT)

/** The plugin: the export kept fresh, and served at /web by the dev and preview servers. */
export function clientExport(): Plugin {
  return {
    name: 'highsea:client-export',
    buildStart() {
      ensureClientExport((m) => this.info(m))
      ensureMockMedia((m) => this.info(m))
    },
    configureServer(server) {
      ensureMockMedia()
      server.middlewares.use(mockMediaMiddleware)
      server.middlewares.use(clientMiddleware)
    },
    configurePreviewServer(server) {
      ensureClientExport()
      ensureMockMedia()
      server.middlewares.use(mockMediaMiddleware)
      server.middlewares.use(clientMiddleware)
    },
  }
}
