// SPDX-License-Identifier: AGPL-3.0-only
// The server's one entry (ADR 0003): boot the runtime, then serve `/api` with Hono and everything
// else with Next, on one port. SIGTERM shuts down in order: stop listening, then the runtime.
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot, loadConfig } from '@highsea/runtime'
import next from 'next'
import pkg from './package.json' with { type: 'json' }
import { createApi } from './src/api/app.ts'
import { createHttpServer } from './src/http.ts'

const config = loadConfig()
const runtime = await boot({ config, version: pkg.version })
const log = runtime.logger.child('http')

const app = next({ dev: config.dev, dir: dirname(fileURLToPath(import.meta.url)) })
await app.prepare()
const handle = app.getRequestHandler()

const server = createHttpServer({ api: createApi(runtime), next: (req, res) => handle(req, res) })
server.listen(config.port, config.host, () =>
  log.info('listening', { url: `http://${config.host}:${config.port}`, dev: config.dev }),
)

let stopping = false
async function stop(signal: string) {
  if (stopping) return
  stopping = true
  log.info('stopping', { signal })
  server.close()
  server.closeIdleConnections()
  await runtime.shutdown()
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => void stop('SIGTERM'))
process.on('SIGINT', () => void stop('SIGINT'))
