// SPDX-License-Identifier: AGPL-3.0-only
// The routes the chrome's frames hold apps/client on (src/chrome/client.ts), and the middleware
// that serves the client's export at /web (client-export.ts), traversal guard included.
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { exportMock } from '../../../apps/client/scripts/export-mock.ts'
import { clientMiddlewareFor, exportState, inputsStamp } from '../client-export.ts'
import { chromePathOf, clientPathOf, clientSrc, heldByClient } from '../src/chrome/client.ts'

describe('the routes apps/client holds', () => {
  test('a chrome route’s client path drops the platform', () => {
    expect(clientPathOf('/mobile/connect')).toBe('/connect')
    expect(clientPathOf('/web/settings/about?app=desktop')).toBe('/settings/about?app=desktop')
    expect(clientPathOf('/tv')).toBe('/')
    expect(clientPathOf('/mobile/')).toBe('/')
    expect(clientPathOf('/admin/movies')).toBeNull()
    expect(clientPathOf('/')).toBeNull()
  })

  test('a section link keeps its query, so Settings opens at the section', () => {
    expect(clientPathOf('/mobile/settings?section=servers')).toBe('/settings?section=servers')
    expect(clientPathOf('/web/settings/?section=devices')).toBe('/settings?section=devices')
    expect(clientPathOf('/tv/settings?')).toBe('/settings')
    expect(heldByClient('/mobile/settings?section=servers')).toBe(true)
    expect(heldByClient('/web/settingsx?section=devices')).toBe(false)
    expect(clientSrc('web', '/settings?section=devices')).toBe(
      '/web/settings?section=devices&ff=pointer',
    )
    expect(clientSrc('mobile', '/?section=devices')).toBe('/web/?section=devices&ff=touch')
  })

  test('holds the client’s routes on the three client platforms, and only them', () => {
    expect(heldByClient('/web/connect')).toBe(true)
    expect(heldByClient('/mobile/connect?lan=asking')).toBe(true)
    expect(heldByClient('/tv/sign-in')).toBe(true)
    expect(heldByClient('/web/settings/devices')).toBe(true)
    expect(heldByClient('/web/connections')).toBe(false)
    expect(heldByClient('/admin/settings')).toBe(false)
  })

  test('holds B1’s films, and Home and the phone’s Library only as they are', () => {
    for (const path of [
      '/mobile',
      '/tv/',
      '/web/movies',
      '/web/movies/4',
      '/mobile/people/buster-keaton',
      '/tv/collections/caminandes',
      '/mobile/search',
      '/tv/alerts',
      '/mobile/library',
      '/mobile/library/collections',
    ])
      expect(heldByClient(path)).toBe(true)
    for (const path of [
      '/mobile/library/shows',
      '/mobile/library/music',
      '/web/shows/1',
      '/tv/music',
      '/web/play/4',
      '/mobile/you',
      '/web/moviesx',
    ])
      expect(heldByClient(path)).toBe(false)
  })

  test('the phone’s Collections view is the client’s Library at that view', () => {
    expect(clientPathOf('/mobile/library/collections')).toBe('/library?view=collections')
    expect(clientPathOf('/mobile/library/collections?x=1')).toBe('/library?view=collections&x=1')
    expect(heldByClient(chromePathOf('mobile', '/library?view=collections'))).toBe(true)
  })

  test('a client route reported back is the chrome’s route on that platform', () => {
    expect(chromePathOf('mobile', '/connect')).toBe('/mobile/connect')
    expect(chromePathOf('tv', '/')).toBe('/tv')
    for (const path of ['/web/connect', '/mobile/sign-in', '/tv'] as const) {
      const platform = path.split('/')[1] as 'web' | 'mobile' | 'tv'
      expect(chromePathOf(platform, clientPathOf(path) as string)).toBe(path)
    }
  })

  test('the frame opens the client under /web with its input', () => {
    expect(clientSrc('mobile', '/connect')).toBe('/web/connect?ff=touch')
    expect(clientSrc('tv', '/')).toBe('/web/?ff=tv')
    expect(clientSrc('web', '/settings')).toBe('/web/settings?ff=pointer')
  })
})

describe('the export at /web', () => {
  const root = mkdtempSync(join(tmpdir(), 'highsea-client-export-'))
  const dir = join(root, 'dist-mock')
  mkdirSync(join(dir, '_expo/static/js'), { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html>index')
  writeFileSync(join(dir, '_expo/static/js/entry.js'), 'entry()')
  // beside the export, where a traversal would reach
  writeFileSync(join(root, 'secret.txt'), 'secret')
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  /** One request through the middleware: its status, type and body, or `next` if it passed. */
  function get(url: string, from = dir) {
    const handle = clientMiddlewareFor(from)
    return new Promise<{ status: number; type?: string; body: string } | 'next'>((resolve) => {
      const out = new PassThrough()
      const chunks: Buffer[] = []
      const headers: Record<string, string> = {}
      const res = Object.assign(out, {
        statusCode: 200,
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v
        },
      })
      out.on('data', (c: Buffer) => chunks.push(c))
      out.on('finish', () =>
        resolve({
          status: res.statusCode,
          type: headers['content-type'],
          body: Buffer.concat(chunks).toString(),
        }),
      )
      handle({ url } as IncomingMessage, res as unknown as ServerResponse, () => resolve('next'))
    })
  }

  test('leaves other addresses to Vite', async () => {
    expect(await get('/index.html?screen')).toBe('next')
    expect(await get('/webfont.css')).toBe('next')
  })

  test('serves a file, and index.html for the router’s addresses', async () => {
    expect(await get('/web/_expo/static/js/entry.js')).toEqual({
      status: 200,
      type: 'text/javascript; charset=utf-8',
      body: 'entry()',
    })
    for (const url of ['/web', '/web/', '/web/connect?ff=touch', '/web/settings/about'])
      expect(await get(url)).toMatchObject({ status: 200, body: '<!doctype html>index' })
  })

  test('a missing script or asset is a 404, not the page', async () => {
    expect(await get('/web/_expo/static/js/gone.js')).toMatchObject({ status: 404, body: '' })
    expect(await get('/web/assets/logo.png')).toMatchObject({ status: 404 })
  })

  test('never serves a file outside the export, however `..` is spelled', async () => {
    for (const url of [
      '/web/../secret.txt',
      '/web/%2e%2e/secret.txt',
      '/web/..%2fsecret.txt',
      '/web/%2e%2e%2fsecret.txt',
      '/web/_expo/%2e%2e/%2e%2e/%2e%2e/secret.txt',
      '/web/..%5csecret.txt',
    ]) {
      const answer = await get(url)
      expect(answer).not.toBe('next')
      expect(answer === 'next' ? '' : answer.body).not.toContain('secret')
    }
  })

  test('a bad escape is a 404', async () => {
    expect(await get('/web/%E0%A4%A')).toMatchObject({ status: 404 })
    expect(await get('/web/%zz')).toMatchObject({ status: 404 })
  })

  test('without an export, says how to make one', async () => {
    const answer = await get('/web/connect', join(root, 'none'))
    expect(answer).toMatchObject({ status: 503 })
    expect(answer === 'next' ? '' : answer.body).toContain('export:web:mock')
  })
})

describe('the export’s stamp', () => {
  // a repository of its own: the client, a workspace package it depends on and one it doesn't
  const root = mkdtempSync(join(tmpdir(), 'highsea-client-stamp-'))
  const file = (path: string, text: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  file(
    'apps/client/package.json',
    JSON.stringify({ dependencies: { '@highsea-tv/used': 'workspace:*' } }),
  )
  file('apps/client/src/app.tsx', 'app')
  file('packages/used/package.json', JSON.stringify({ name: '@highsea-tv/used' }))
  file('packages/used/src/index.ts', 'used')
  file('packages/other/package.json', JSON.stringify({ name: '@highsea-tv/other' }))
  file('packages/other/src/index.ts', 'other')
  file('bun.lock', '{}')
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  test('is the same while nothing changes', () => {
    expect(inputsStamp(root)).toBe(inputsStamp(root))
  })

  test('changes when an input is touched, added or deleted', () => {
    let before = inputsStamp(root)
    const later = new Date(Date.now() + 60_000)
    utimesSync(join(root, 'apps/client/src/app.tsx'), later, later)
    expect(inputsStamp(root)).not.toBe(before)

    before = inputsStamp(root)
    file('packages/used/src/new.ts', 'new')
    expect(inputsStamp(root)).not.toBe(before)

    before = inputsStamp(root)
    rmSync(join(root, 'packages/used/src/new.ts'))
    expect(inputsStamp(root)).not.toBe(before)

    before = inputsStamp(root)
    rmSync(join(root, 'bun.lock'))
    expect(inputsStamp(root)).not.toBe(before)
    file('bun.lock', '{}')
  })

  test('ignores a package the client doesn’t depend on', () => {
    const before = inputsStamp(root)
    file('packages/other/src/more.ts', 'more')
    expect(inputsStamp(root)).toBe(before)
  })
})

describe('an export made by hand', () => {
  // a repository with a client, exported by a stand-in for Expo that writes an index.html into
  // the --output-dir it's given, as `bun run export:web:mock` would
  const root = mkdtempSync(join(tmpdir(), 'highsea-client-hand-'))
  mkdirSync(join(root, 'apps/client/src'), { recursive: true })
  mkdirSync(join(root, 'packages'))
  writeFileSync(join(root, 'apps/client/package.json'), '{}')
  writeFileSync(join(root, 'apps/client/src/app.tsx'), 'app')
  const expo = [
    process.execPath,
    '-e',
    "const d = process.argv.at(-1); require('fs').mkdirSync(d, { recursive: true }); require('fs').writeFileSync(d + '/index.html', 'index')",
    '--',
  ]
  const exported = join(root, 'apps/client/dist-mock')
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  test('is current to the prototypes’ server, until an input changes', () => {
    expect(exportState(exported, root)).toBe('missing')
    expect(exportMock({ root, expo })).toBe(true)
    expect(exportState(exported, root)).toBe('current')
    writeFileSync(join(root, 'apps/client/src/new.tsx'), 'new')
    expect(exportState(exported, root)).toBe('stale')
  })

  test('swaps in over the last one and leaves none of its own folders', () => {
    expect(exportMock({ root, expo })).toBe(true)
    expect(exportState(exported, root)).toBe('current')
    expect(
      readdirSync(join(root, 'apps/client')).filter((f) => f.startsWith('.dist-mock')),
    ).toEqual([])
  })

  test('a failed export leaves the last one as it was', () => {
    writeFileSync(join(root, 'apps/client/src/newer.tsx'), 'newer')
    expect(exportMock({ root, expo: [process.execPath, '-e', 'process.exit(1)', '--'] })).toBe(
      false,
    )
    expect(exportState(exported, root)).toBe('stale')
    expect(
      readdirSync(join(root, 'apps/client')).filter((f) => f.startsWith('.dist-mock')),
    ).toEqual([])
  })
})
