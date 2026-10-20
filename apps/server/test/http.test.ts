// SPDX-License-Identifier: AGPL-3.0-only
// The real HTTP server (without Next), driven through the SDK as a client would.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerEvent } from '@highsea/api-contract'
import { boot, getRuntime, hasRuntime, loadConfig } from '@highsea/runtime'
import { createClient } from '@highsea/sdk'
import { createApi } from '../src/api/app.ts'
import { createHttpServer } from '../src/http.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
  if (hasRuntime()) await getRuntime().shutdown()
})

async function serve() {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-http-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const runtime = await boot({
    config: loadConfig({
      HIGHSEA_CONFIG_DIR: join(dir, 'config'),
      HIGHSEA_DATA_DIR: join(dir, 'data'),
    }),
    version: '0.1.0',
    quiet: true,
    memory: true,
    manualTicks: true,
  })
  const server = createHttpServer({ api: createApi(runtime) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  )
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { runtime, url, client: createClient({ baseUrl: url }) }
}

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await Bun.sleep(10)
  }
}

describe('HTTP server', () => {
  test('the SDK reads the public info', async () => {
    const { client, runtime } = await serve()
    expect((await client.system.publicInfo()).id).toBe(runtime.identity().id)
  })

  test('playback paths are reserved; other paths go to Next', async () => {
    const { url } = await serve()
    expect((await fetch(`${url}/stream/1`)).status).toBe(501)
    // without Next mounted, the admin's paths 404
    expect((await fetch(`${url}/movies`)).status).toBe(404)
  })

  test('events reach SSE subscribers, filtered by topic', async () => {
    const { client, runtime } = await serve()
    const got: ServerEvent[] = []
    const off = client.events.subscribe((e) => got.push(e))
    await until(() => client.events.connected())
    runtime.events.emit({ topic: 'jobs.updated', ids: ['job_1'] })
    runtime.events.emit({ topic: 'movies.updated' })
    await until(() => got.length === 2)
    expect(got.map((e) => [e.topic, e.ids])).toEqual([
      ['jobs.updated', ['job_1']],
      ['movies.updated', undefined],
    ])
    off()

    const res = await fetch(`${client.baseUrl}/api/v1/events?topics=movies.updated`)
    const reader = res.body?.getReader() as ReadableStreamDefaultReader<Uint8Array>
    runtime.events.emit({ topic: 'jobs.updated' })
    runtime.events.emit({ topic: 'movies.updated', ids: ['mov_1'] })
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(text).toContain('"topic":"movies.updated"')
    expect(text).not.toContain('jobs.updated')
    await reader.cancel()
  })

  test('Last-Event-ID replays what was missed, or resets when it’s too old', async () => {
    const { url, runtime } = await serve()
    const first = runtime.events.emit({ topic: 'a' })
    runtime.events.emit({ topic: 'b' })
    runtime.events.emit({ topic: 'c' })
    const read = async (lastId: string) => {
      const res = await fetch(`${url}/api/v1/events`, { headers: { 'last-event-id': lastId } })
      const reader = res.body?.getReader() as ReadableStreamDefaultReader<Uint8Array>
      let text = ''
      while (!text.includes('"topic":"c"') && !text.includes('"topic":"reset"'))
        text += new TextDecoder().decode((await reader.read()).value)
      await reader.cancel()
      return text
    }
    const replay = await read(String(first.id))
    expect(replay).toContain('"topic":"b"')
    expect(replay).not.toContain('"topic":"a"')
    for (let i = 0; i < 600; i++) runtime.events.emit({ topic: 'noise' })
    expect(await read(String(first.id))).toContain('"topic":"reset"')
  })
})
