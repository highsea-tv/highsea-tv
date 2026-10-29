// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '@highsea-tv/core'
import {
  checkHardlinks,
  checkSetup,
  detectAddress,
  detectFolders,
  detectServerName,
  isAddress,
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

  test('a server name from the host’s, unless it’s Docker’s id or localhost', () => {
    expect(detectServerName('harbor.local')).toBe('harbor')
    expect(detectServerName('DS1520')).toBe('DS1520')
    expect(detectServerName('8c7c974a32a7')).toBeNull()
    expect(detectServerName('localhost')).toBeNull()
    expect(detectServerName('')).toBeNull()
  })

  test('folders found under /data, in either case, or asked for', () => {
    const { config: c } = config()
    // this fixture has movies and downloads at the top
    expect(detectFolders(c)).toEqual({
      movies: join(c.dataDir, 'movies'),
      downloads: join(c.dataDir, 'downloads'),
    })
    // TRaSH's layout first, matched without regard to case; torrents for downloads
    rmSync(join(c.dataDir, 'movies'), { recursive: true })
    rmSync(join(c.dataDir, 'downloads'), { recursive: true })
    mkdirSync(join(c.dataDir, 'Media', 'Movies'), { recursive: true })
    mkdirSync(join(c.dataDir, 'torrents'))
    expect(detectFolders(c)).toEqual({
      movies: join(c.dataDir, 'Media', 'Movies'),
      downloads: join(c.dataDir, 'torrents'),
    })
    // movies without downloads: downloads goes beside them
    rmSync(join(c.dataDir, 'torrents'), { recursive: true })
    expect(detectFolders(c)?.downloads).toBe(join(c.dataDir, 'downloads'))
    // other folders and no movies: the owner points at them
    rmSync(join(c.dataDir, 'Media'), { recursive: true })
    mkdirSync(join(c.dataDir, 'tv'))
    expect(detectFolders(c)).toBeNull()
    // empty (hidden folders, lost+found and the transcode cache don't count): highsea's own layout
    rmSync(join(c.dataDir, 'tv'), { recursive: true })
    mkdirSync(join(c.dataDir, 'lost+found'))
    mkdirSync(join(c.dataDir, 'transcodes'))
    expect(detectFolders(c)).toEqual(setupDefaults(c).folders)
  })

  test('the address apps use: the published URL, the LAN address, or null in a bridge', () => {
    const { config: c } = config()
    const nic = (address: string, internal = false) => ({
      address,
      family: 'IPv4' as const,
      internal,
      netmask: '255.255.255.0',
      mac: '00:00:00:00:00:00',
      cidr: null,
    })
    const host = {
      lo: [nic('127.0.0.1', true)],
      docker0: [nic('172.17.0.1')],
      eth0: [nic('192.168.1.20')],
      eth1: [nic('169.254.3.4')],
    }
    expect(detectAddress(c, { interfaces: host, inContainer: false })).toBe(
      `192.168.1.20:${c.port}`,
    )
    // host networking: Docker's interfaces show, so the host's address is ours
    expect(detectAddress(c, { interfaces: host, inContainer: true })).toBe(`192.168.1.20:${c.port}`)
    // a bridge network: only the container's own address, which nothing outside reaches
    expect(
      detectAddress(c, {
        interfaces: { lo: host.lo, eth0: [nic('172.18.0.5')] },
        inContainer: true,
      }),
    ).toBeNull()
    expect(detectAddress(c, { interfaces: { lo: host.lo }, inContainer: false })).toBeNull()
    const published = loadConfig({
      HIGHSEA_DATA_DIR: c.dataDir,
      HIGHSEA_PUBLISHED_URL: 'http://nas.home.arpa:8096/',
    })
    expect(detectAddress(published, { interfaces: {}, inContainer: true })).toBe(
      'nas.home.arpa:8096',
    )
  })

  test('the address check, and setup refusing a wrong one', () => {
    const { config: c } = config()
    expect(isAddress('192.168.1.20:3000')).toBe(true)
    expect(isAddress('harbor.local')).toBe(true)
    for (const wrong of ['http://x', 'a b', '', 'x:port', '[::1]:3000'])
      expect(isAddress(wrong)).toBe(false)
    const input = {
      serverName: 'Harbor',
      folders: setupDefaults(c).folders,
      remoteAccess: { kind: 'local-only' as const },
    }
    expect(field(() => checkSetup(c, { ...input, address: '192.168.1.20:3000' }))).toBeNull()
    expect(field(() => checkSetup(c, { ...input, address: 'http://x' }))).toBe('address')
  })
})
