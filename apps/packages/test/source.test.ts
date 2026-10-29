// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createSource, type Manifest, minBuild, RELEASES } from '../api/index.ts'

const MANIFEST: Manifest = {
  release: '0.2.1',
  version: '0.2.1-0001',
  file: 'highsea-0.2.1-0001.spk',
  size: 36_000,
  md5: '0123456789abcdef0123456789abcdef',
  sha256: 'ab'.repeat(32),
  os_min_ver: '7.2.1-69057',
  deppkgs: 'ContainerManager>=20.10.23-1432',
  desc: 'highsea finds, downloads and organises your films.',
}

/** A source reading the manifest from a fake GitHub, and how many times it was asked. */
function source(answer: () => Response = () => Response.json(MANIFEST)) {
  let now = 0
  const asked: string[] = []
  const handle = createSource({
    manifest: `${RELEASES}/latest/download/highsea-spk.json`,
    downloads: (release) => `${RELEASES}/download/v${release}`,
    fetch: async (input) => {
      asked.push(String(input))
      return answer()
    },
    now: () => now,
  })
  return { handle, asked, later: (ms: number) => (now += ms) }
}

/** What Package Center sends, as a form. */
const post = (fields: Record<string, string>) =>
  new Request('https://packages.highsea.tv/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })

const DSM_741 = { build: '90080', arch: 'geminilake', language: 'enu', major: '7' }

describe('minBuild', () => {
  test('is the build after the dash', () => {
    expect(minBuild('7.2.1-69057')).toBe(69057)
    expect(() => minBuild('7.2.1')).toThrow('no build')
  })
})

describe('the package source', () => {
  test('lists the latest release for a DSM new enough, as spkrepo shapes it', async () => {
    const { handle } = source()
    const response = await handle(post(DSM_741))
    expect(response.status).toBe(200)
    const { packages } = (await response.json()) as { packages: Record<string, unknown>[] }
    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatchObject({
      package: 'highsea',
      version: '0.2.1-0001',
      dname: 'highsea',
      link: `${RELEASES}/download/v0.2.1/highsea-0.2.1-0001.spk`,
      md5: MANIFEST.md5,
      size: 36_000,
      thumbnail: [
        'https://packages.highsea.tv/icon_72.png',
        'https://packages.highsea.tv/icon_120.png',
      ],
      qinst: false,
      qupgrade: true,
      qstart: false,
      changelog: `Release notes: ${RELEASES}/tag/v0.2.1`,
      deppkgs: 'ContainerManager>=20.10.23-1432',
    })
  })

  test('answers the query DSM 7.4 sends', async () => {
    const { handle } = source()
    // as the DS1520+ asked on 2026-10-29
    const query =
      'package_update_channel=beta&unique=synology_geminilake_1520%2B&build=90080&language=enu&major=7&micro=1&arch=geminilake&minor=4&timezone=Pacific&nano=1'
    const response = await handle(new Request(`https://packages.highsea.tv/?${query}`))
    expect(((await response.json()) as { packages: unknown[] }).packages).toHaveLength(1)
  })

  test('lists nothing for a DSM older than the package needs', async () => {
    const { handle } = source()
    const response = await handle(post({ ...DSM_741, build: '64570' }))
    expect(await response.json()).toEqual({ packages: [] })
  })

  test('sends a browser to the guide, and refuses a request without a build', async () => {
    const { handle, asked } = source()
    const browser = await handle(
      new Request('https://packages.highsea.tv/', { headers: { accept: 'text/html' } }),
    )
    expect(browser.status).toBe(302)
    expect(browser.headers.get('location')).toBe(
      'https://docs.highsea.tv/install/synology/#install-the-package',
    )
    expect((await handle(new Request('https://packages.highsea.tv/'))).status).toBe(400)
    expect(asked).toHaveLength(0)
  })

  test('reads the manifest once in five minutes, and keeps the last one when GitHub fails', async () => {
    let up = true
    const { handle, asked, later } = source(() =>
      up ? Response.json(MANIFEST) : new Response('', { status: 502 }),
    )
    await handle(post(DSM_741))
    await handle(post(DSM_741))
    expect(asked).toHaveLength(1)
    later(5 * 60 * 1000)
    up = false
    const response = await handle(post(DSM_741))
    expect(asked).toHaveLength(2)
    expect(((await response.json()) as { packages: unknown[] }).packages).toHaveLength(1)
  })

  test('says so when no release has a package yet', async () => {
    const { handle } = source(() => new Response('Not Found', { status: 404 }))
    expect((await handle(post(DSM_741))).status).toBe(503)
  })
})
