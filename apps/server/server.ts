// SPDX-License-Identifier: AGPL-3.0-only
// The server's one entry (ADR 0003): boot the runtime, then serve `/api` with Hono and everything
// else with Next, on one port, and on a second HTTPS port when built-in TLS is on (ADR 0026).
// SIGTERM shuts down in order: stop listening, then the runtime. A restore restarts the same way,
// exiting with RESTART_EXIT_CODE for Docker's restart policy (ADR 0047).
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Fetch } from '@highsea-tv/core'
import { loadCertificate } from '@highsea-tv/network'
import { bareHost, boot, loadConfig, RESTART_EXIT_CODE } from '@highsea-tv/runtime'
import next from 'next'
import pkg from './package.json' with { type: 'json' }
import { createApi } from './src/api/app.ts'
import { createHttpServer, createTlsServer } from './src/http.ts'
import { createStream } from './src/stream/index.ts'
import { createWeb } from './src/web/index.ts'

const config = loadConfig()
const runtime = await boot({
  config,
  version: pkg.version,
  discovery: true,
  fetch: await outsideFetch(),
  // HIGHSEA_TORRENT_OFFLINE=1: the engine opens no socket, for the browser sweeps (no network)
  torrent: process.env.HIGHSEA_TORRENT_OFFLINE === '1' ? { offline: true } : undefined,
  // HIGHSEA_HARDWARE_NONE=1: no graphics chip is looked for, so the sweeps and the guides'
  // screenshots read the same on every machine
  hardware: process.env.HIGHSEA_HARDWARE_NONE === '1' ? bareHost() : undefined,
  subtitles: await fakeSubtitles(),
  lists: await fakeLists(),
  restart: () => void stop('restart', RESTART_EXIT_CODE),
  // Without Docker's TZ, the process takes General's time zone, which setup takes from the browser.
  // Node reads a TZ set while it runs (https://nodejs.org/api/cli.html#tz); a TZ given wins.
  followTimeZone: process.env.TZ
    ? undefined
    : (zone) => {
        process.env.TZ = zone
      },
})
// a crash report, when General › Diagnostics' switch is on; Node's default handling still runs
// after a monitor (Node's docs, 'uncaughtExceptionMonitor')
process.on('uncaughtExceptionMonitor', (error, origin) =>
  runtime.operations.crashes.record(error, origin),
)
const log = runtime.logger.child('http')
if (process.env.HIGHSEA_TMDB_REPLAY === '1')
  log.warn('TMDB answers come from recordings', { env: 'HIGHSEA_TMDB_REPLAY' })
if (process.env.HIGHSEA_TORRENT_OFFLINE === '1')
  log.warn('The torrent engine is offline: nothing downloads', { env: 'HIGHSEA_TORRENT_OFFLINE' })
if (process.env.HIGHSEA_HARDWARE_NONE === '1')
  log.warn('No graphics chip is looked for', { env: 'HIGHSEA_HARDWARE_NONE' })
if (process.env.HIGHSEA_SUBTITLES_FAKE === '1')
  log.warn('Subtitle providers are fakes', { env: 'HIGHSEA_SUBTITLES_FAKE' })
if (process.env.HIGHSEA_FIXTURES_URL)
  log.warn('Every outside request goes to the fixtures service', { env: 'HIGHSEA_FIXTURES_URL' })

const app = next({ dev: config.dev, dir: dirname(fileURLToPath(import.meta.url)) })
await app.prepare()
const handle = app.getRequestHandler()

const tryPage = process.env.HIGHSEA_PLAYBACK_TRY === '1'
if (tryPage)
  log.warn('The playback test page is on at /stream/try', { env: 'HIGHSEA_PLAYBACK_TRY' })
const handlers = {
  api: createApi(runtime),
  next: handle,
  stream: createStream(runtime, { tryPage }),
  // the web client's build (apps/web); `bun run web` serves it with Vite in development instead
  web: createWeb({
    dir:
      process.env.HIGHSEA_WEB_DIR ??
      join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist'),
  }),
}
const server = createHttpServer(handlers)
server.listen(config.port, config.host, () =>
  log.info('listening', { url: `http://${config.host}:${config.port}`, dev: config.dev }),
)

// Plain HTTP stays on for the LAN and the apps; HTTPS joins it. A change takes a restart, which
// the network settings say.
const network = runtime.network.settings()
let tlsServer: ReturnType<typeof createTlsServer> | null = null
if (network.tls === 'built-in') {
  const cert = loadCertificate(config.configDir)
  if (cert.ok) {
    tlsServer = createTlsServer(handlers, cert.certificate)
    tlsServer.listen(network.httpsPort, config.host, () =>
      log.info('listening', { url: `https://${config.host}:${network.httpsPort}` }),
    )
  } else log.warn('built-in TLS is off', { problem: cert.problem })
}

let stopping = false
async function stop(signal: string, code = 0) {
  if (stopping) return
  stopping = true
  log.info('stopping', { signal })
  for (const s of [server, tlsServer]) {
    s?.close()
    s?.closeIdleConnections()
  }
  await runtime.shutdown()
  await app.close()
  process.exit(code)
}
process.on('SIGTERM', () => void stop('SIGTERM'))
process.on('SIGINT', () => void stop('SIGINT'))

/**
 * `HIGHSEA_TMDB_REPLAY=1` answers TMDB from the recordings in packages/metadata (ADR 0029), for
 * development and the browser sweeps without a key or the network. Any key is accepted except one
 * starting `invalid`; a request with no recording answers 503 `tmdb-unreachable`. Other hosts
 * (single sign-on's provider) still go out.
 */
async function outsideFetch(): Promise<Fetch | undefined> {
  const fixtures = process.env.HIGHSEA_FIXTURES_URL
  if (fixtures) return forwardTo(new URL(fixtures).origin)
  if (process.env.HIGHSEA_TMDB_REPLAY !== '1') return undefined
  const { createReplayFetch } = await import('@highsea-tv/metadata/replay')
  const replay = createReplayFetch()
  const tmdb = new Set(['api.themoviedb.org', 'image.tmdb.org'])
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    return tmdb.has(url.hostname) ? replay(input, init) : fetch(input, init)
  }
}

/**
 * `HIGHSEA_FIXTURES_URL` is for the end-to-end run against the image (scripts/e2e): every request
 * the server makes goes to the fixtures service at that address, which answers TMDB and the
 * subtitle providers in their place. A request for another host carries its address in
 * `x-highsea-forwarded-url`; one for the fixtures service itself (its catalog, its indexer) goes
 * as it is. The torrent engine's peers and trackers don't use fetch, and reach the fixtures on
 * the run's closed network.
 */
function forwardTo(origin: string): Fetch {
  return (input, init) => {
    const original = new Request(input, init)
    const url = new URL(original.url)
    if (url.origin === origin) return fetch(original)
    const forwarded = new Request(`${origin}${url.pathname}${url.search}`, original)
    forwarded.headers.set('x-highsea-forwarded-url', url.href)
    return fetch(forwarded)
  }
}

/**
 * `HIGHSEA_SUBTITLES_FAKE=1` answers OpenSubtitles.com, Subdl and SubSource from the fakes in
 * packages/subtitles, with their own key, for development and the browser sweeps without accounts
 * or the network. Their accounts are in the fake's fixtures.
 */
async function fakeSubtitles() {
  if (process.env.HIGHSEA_SUBTITLES_FAKE !== '1') return undefined
  const { createFakeSubtitles, FAKE_OPENSUBTITLES_KEY } = await import('@highsea-tv/subtitles/fake')
  return { fetch: createFakeSubtitles().fetch, openSubtitlesKey: FAKE_OPENSUBTITLES_KEY }
}

/**
 * `HIGHSEA_LISTS_FAKE=1` answers Trakt and generic lists from the fakes in packages/lists, with a
 * made-up Trakt application, so Settings › Import lists works without highsea's Client ID or the
 * network. TMDB lists still go through TMDB (or its recordings with `HIGHSEA_TMDB_REPLAY=1`).
 */
async function fakeLists() {
  if (process.env.HIGHSEA_LISTS_FAKE !== '1') return undefined
  const { createFakeLists, FAKE_TRAKT_CLIENT_ID, FAKE_TRAKT_CLIENT_SECRET } = await import(
    '@highsea-tv/lists/fake'
  )
  const fake = createFakeLists()
  // the device flow's code is entered at once, so Connect completes on its first poll
  fake.trakt.device = 'approved'
  return {
    fetch: fake.fetch,
    traktClientId: FAKE_TRAKT_CLIENT_ID,
    traktClientSecret: FAKE_TRAKT_CLIENT_SECRET,
  }
}
