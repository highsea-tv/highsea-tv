// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '@highsea/core'
import {
  checkHardlinks,
  checkSetup,
  listFolders,
  loadConfig,
  networkFor,
  setupDefaults,
} from '../src/index.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function config() {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-setup-'))
  dirs.push(dir)
  const data = join(dir, 'data')
  mkdirSync(join(data, 'movies'), { recursive: true })
  mkdirSync(join(data, 'downloads'))
  mkdirSync(join(data, '.hidden'))
  mkdirSync(join(dir, 'outside'))
  return {
    dir,
    config: loadConfig({ HIGHSEA_CONFIG_DIR: join(dir, 'config'), HIGHSEA_DATA_DIR: data }),
  }
}

const field = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof AppError) return (e.details as { field: string }).field
    throw e
  }
  return null
}

describe('setup', () => {
  test('browsing stays inside the media root (OWASP Path Traversal)', () => {
    const { dir, config: c } = config()
    expect(listFolders(c, c.dataDir).map((f) => f.name)).toEqual(['downloads', 'movies'])
    expect(field(() => listFolders(c, join(c.dataDir, '..')))).toBe('path')
    expect(field(() => listFolders(c, join(c.dataDir, 'movies', '..', '..', 'outside')))).toBe(
      'path',
    )
    // a symlink inside the root that points out of it doesn't lead out
    symlinkSync(join(dir, 'outside'), join(c.dataDir, 'escape'))
    expect(field(() => listFolders(c, join(c.dataDir, 'escape')))).toBe('path')
  })

  test('the hardlink check and the setup checks', () => {
    const { config: c } = config()
    const d = setupDefaults(c)
    expect(checkHardlinks(c, d.folders.downloads, d.folders.movies).ok).toBe(true)
    const input = {
      serverName: 'Harbor',
      folders: d.folders,
      remoteAccess: { kind: 'local-only' as const },
    }
    expect(field(() => checkSetup(c, input))).toBeNull()
    expect(field(() => checkSetup(c, { ...input, serverName: ' ' }))).toBe('serverName')
    expect(
      field(() =>
        checkSetup(c, { ...input, folders: { ...d.folders, downloads: d.folders.movies } }),
      ),
    ).toBe('folders.downloads')
    expect(
      field(() =>
        checkSetup(c, { ...input, remoteAccess: { kind: 'reverse-proxy', url: 'http://x' } }),
      ),
    ).toBe('remoteAccess.url')
    expect(
      field(() => checkSetup(c, { ...input, remoteAccess: { kind: 'port-forward', port: 80 } })),
    ).toBe('remoteAccess.port')
  })

  test('the remote-access answer becomes network settings', () => {
    expect(networkFor({ kind: 'local-only' }).remoteAccess).toBe('local-only')
    expect(networkFor({ kind: 'reverse-proxy', url: 'https://harbor.example.net/' })).toMatchObject(
      {
        externalUrl: 'https://harbor.example.net',
        proxyHeaders: true,
        tls: 'proxy',
      },
    )
    expect(networkFor({ kind: 'port-forward', port: 8443 })).toMatchObject({
      tls: 'built-in',
      httpsPort: 8443,
    })
  })
})
