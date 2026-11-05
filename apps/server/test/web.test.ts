// SPDX-License-Identifier: AGPL-3.0-only
// `/web`, the web client's build (checkpoint 4.2a): routes fall back to index.html, hashed assets
// are cached for good, nothing outside the build folder is served, and the policy goes with every
// answer.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { Api } from '../src/api/app.ts'
import { createHttpServer } from '../src/http.ts'
import { CSP, createWeb } from '../src/web/index.ts'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

const INDEX = '<!doctype html><title>highsea</title><div id="root"></div>'
const SCRIPT = `console.log(${JSON.stringify('x'.repeat(4000))})`
const FONT = 'f'.repeat(4000)
const ENTRY = '/web/_expo/static/js/web/entry-0f6ead83.js'

async function serve({ built = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'highsea-web-'))
  const dir = join(base, 'dist')
  // the Expo web export's layout: scripts under _expo/static, fonts and images under assets
  const scripts = join(dir, '_expo', 'static', 'js', 'web')
  const fonts = join(dir, 'assets', '__packages', 'brand', 'fonts')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(fonts, { recursive: true })
  if (built) {
    writeFileSync(join(dir, 'index.html'), INDEX)
    writeFileSync(join(scripts, 'entry-0f6ead83.js'), SCRIPT)
    writeFileSync(join(fonts, 'Geist-Regular.0fa503b9.ttf'), FONT)
    writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    writeFileSync(join(dir, 'metadata.json'), '{"bundler":"metro"}')
  }
  // a file beside the build that must never be served
  writeFileSync(join(base, 'secret.txt'), 'not for you')
  // the API answers everything else; only the routing matters here
  const api = { fetch: () => new Response('api') } as unknown as Api
  const server = createHttpServer({ api, web: createWeb({ dir }) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(() => rmSync(base, { recursive: true, force: true }))
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  )
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }
}

/** A request with the path exactly as written: fetch would tidy `..` away first. */
function raw(url: string, path: string, method = 'GET') {
  const { hostname, port } = new URL(url)
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ hostname, port, path, method }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => {
        body += c
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('/web', () => {
  test('/web goes to /web/, keeping the query', async () => {
    const { url } = await serve()
    const res = await fetch(`${url}/web?x=1`, { redirect: 'manual' })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/web/?x=1')
  })

  test('the app and its routes are index.html, checked each time, under the policy', async () => {
    const { url } = await serve()
    for (const path of ['/web/', '/web/movies/603', '/web/settings/home?x=1']) {
      const res = await fetch(`${url}${path}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(res.headers.get('cache-control')).toBe('no-cache')
      expect(res.headers.get('content-security-policy')).toBe(CSP)
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(await res.text()).toBe(INDEX)
    }
  })

  // a film's trailer frames YouTube's privacy-enhanced embed and nothing else (ADR 0003's
  // 2026-11-03 section); everything else stays the page's own
  test('the policy lets frames come from youtube-nocookie.com alone', async () => {
    const { url } = await serve()
    const res = await fetch(`${url}/web/movies/603`)
    const directives = (res.headers.get('content-security-policy') ?? '').split('; ')
    expect(directives.filter((d) => d.startsWith('frame-src'))).toEqual([
      'frame-src https://www.youtube-nocookie.com',
    ])
    expect(directives).toContain("default-src 'self'")
  })

  test('hashed assets are cached for good, and gzipped for browsers that ask', async () => {
    const { url } = await serve()
    const res = await fetch(`${url}${ENTRY}`, {
      headers: { 'accept-encoding': 'gzip' },
      decompress: false,
    } as RequestInit)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()).toBe(SCRIPT)

    const plain = await raw(url, ENTRY)
    expect(plain.body).toBe(SCRIPT)
  })

  test("the export's fonts are cached for good as fonts", async () => {
    const { url } = await serve()
    const res = await fetch(`${url}/web/assets/__packages/brand/fonts/Geist-Regular.0fa503b9.ttf`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('content-type')).toBe('font/ttf')
    expect(await res.text()).toBe(FONT)
  })

  test("the export's manifest isn't served", async () => {
    const { url } = await serve()
    expect((await fetch(`${url}/web/metadata.json`)).status).toBe(404)
  })

  test('an unchanged file answers 304 to its ETag', async () => {
    const { url } = await serve()
    const first = await fetch(`${url}/web/favicon.svg`)
    const etag = first.headers.get('etag') ?? ''
    expect(etag).toMatch(/^".+"$/)
    const again = await fetch(`${url}/web/favicon.svg`, { headers: { 'if-none-match': etag } })
    expect(again.status).toBe(304)
  })

  test('a missing file is a 404, not the app', async () => {
    const { url } = await serve()
    expect((await fetch(`${url}/web/_expo/static/js/web/gone-123.js`)).status).toBe(404)
  })

  test('nothing outside the build folder is served', async () => {
    const { url } = await serve()
    for (const path of ['/web/../secret.txt', '/web/%2e%2e/secret.txt', '/web/..%2fsecret.txt']) {
      const res = await raw(url, path)
      expect(res.body).not.toContain('not for you')
    }
  })

  test('only GET and HEAD', async () => {
    const { url } = await serve()
    expect((await fetch(`${url}/web/`, { method: 'POST' })).status).toBe(405)
    const head = await fetch(`${url}/web/`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  test('without a build, a route says how to make one', async () => {
    const { url } = await serve({ built: false })
    const res = await fetch(`${url}/web/`)
    expect(res.status).toBe(503)
    expect(await res.text()).toContain('bun run --cwd apps/client export:web')
  })

  test('other paths still go where they did', async () => {
    const { url } = await serve()
    expect(await (await fetch(`${url}/api/v1/system/public`)).text()).toBe('api')
    // `/website` isn't the web app
    expect((await fetch(`${url}/website`)).status).toBe(404)
  })
})
