// SPDX-License-Identifier: AGPL-3.0-only
// The front door (HT-53): HTTPS only behind a proxy, and noticing a proxy highsea isn't set for.
import { describe, expect, test } from 'bun:test'
import {
  defaultNetworkSettings,
  HSTS,
  httpsOnly,
  lastForwarded,
  type NetworkSettings,
  PRIVATE_RANGES,
  parseTrustedProxies,
  publicHost,
  sightProxy,
} from '../src/index.ts'

const proxied: NetworkSettings = {
  ...defaultNetworkSettings,
  remoteAccess: 'reverse-proxy',
  externalUrl: 'https://watch.example.net',
  trustedProxies: PRIVATE_RANGES.join(', '),
  proxyHeaders: true,
  tls: 'proxy',
}
const { trusted } = parseTrustedProxies(proxied.trustedProxies)
const viaProxy = (headers: Record<string, string>, url = '/movies?sort=added') =>
  httpsOnly({ settings: proxied, remoteAddress: '127.0.0.1', headers, trusted, url })

describe('HTTPS only, behind a proxy', () => {
  test('plain HTTP the proxy carried goes to the External URL, path and query kept', () => {
    expect(viaProxy({ host: 'watch.example.net', 'x-forwarded-proto': 'http' })).toEqual({
      redirect: 'https://watch.example.net/movies?sort=added',
    })
  })

  test('HTTPS the proxy carried gets HSTS for a year, without subdomains or preload', () => {
    expect(viaProxy({ host: 'watch.example.net', 'x-forwarded-proto': 'https' })).toEqual({
      hsts: HSTS,
    })
    expect(HSTS).toBe('max-age=31536000')
    // the forwarded host counts over Host, and the nearest proxy's value is the last
    expect(
      viaProxy({
        host: 'localhost:3000',
        'x-forwarded-proto': 'http, https',
        'x-forwarded-host': 'watch.example.net',
      }),
    ).toEqual({ hsts: HSTS })
  })

  test('no HSTS for a name that isn’t the External URL’s', () => {
    expect(viaProxy({ host: 'other.example.net', 'x-forwarded-proto': 'https' })).toBeNull()
  })

  test('the LAN’s plain HTTP address keeps working: no proxy header, no redirect', () => {
    // a phone on the LAN is inside the trusted private ranges, but no proxy says anything
    expect(
      httpsOnly({
        settings: proxied,
        remoteAddress: '192.168.1.40',
        headers: { host: '192.168.1.20:3000' },
        trusted,
        url: '/web',
      }),
    ).toBeNull()
  })

  test('only a trusted proxy’s word counts', () => {
    expect(
      httpsOnly({
        settings: proxied,
        remoteAddress: '203.0.113.9',
        headers: { host: 'watch.example.net', 'x-forwarded-proto': 'http' },
        trusted,
        url: '/',
      }),
    ).toBeNull()
  })

  test('off unless set for a proxy with an https:// External URL', () => {
    const headers = { host: 'watch.example.net', 'x-forwarded-proto': 'http' }
    for (const settings of [
      defaultNetworkSettings,
      { ...proxied, proxyHeaders: false },
      { ...proxied, tls: 'built-in' as const },
      { ...proxied, externalUrl: 'http://watch.example.net' },
      { ...proxied, externalUrl: '' },
    ])
      expect(
        httpsOnly({ settings, remoteAddress: '127.0.0.1', headers, trusted, url: '/' }),
      ).toBeNull()
  })
})

describe('noticing a proxy', () => {
  const local = defaultNetworkSettings
  const see = (headers: Record<string, string>, settings = local) =>
    sightProxy({ settings, remoteAddress: '::ffff:127.0.0.1', headers })

  test('X-Forwarded-Proto and a name that isn’t an address: a proxy, seen over HTTPS', () => {
    expect(see({ host: 'watch.example.net', 'x-forwarded-proto': 'https' })).toEqual({
      host: 'watch.example.net',
      secure: true,
      peer: '127.0.0.1',
    })
  })

  test('X-Forwarded-Host names the host; Forwarded (RFC 7239) counts too', () => {
    expect(see({ host: 'localhost:3000', 'x-forwarded-host': 'Watch.Example.net' })?.host).toBe(
      'watch.example.net',
    )
    expect(
      see({
        host: 'localhost:3000',
        forwarded: 'for=192.0.2.60;proto=https;host="watch.example.net"',
      }),
    ).toEqual({ host: 'watch.example.net', secure: true, peer: '127.0.0.1' })
  })

  test('without the headers, nothing', () => {
    expect(see({ host: 'watch.example.net' })).toBeNull()
  })

  test('the server’s own addresses aren’t a proxy’s name', () => {
    for (const host of [
      '192.168.1.20:3000',
      '[fd00::1]:3000',
      'localhost:3000',
      'nas.local',
      'nas',
    ])
      expect(see({ host, 'x-forwarded-proto': 'http' })).toBeNull()
  })

  test('nothing once set for a proxy', () => {
    expect(see({ host: 'watch.example.net', 'x-forwarded-proto': 'https' }, proxied)).toBeNull()
  })

  test('a host that isn’t a plain name is refused', () => {
    expect(publicHost('watch.example.net:8443')).toBe('watch.example.net:8443')
    for (const bad of ['evil.example.net/path', 'user@evil.example.net', 'a b.example.net', ''])
      expect(publicHost(bad)).toBeNull()
  })

  test('Forwarded: the last element, quoted or not', () => {
    expect(lastForwarded('for=1.2.3.4;proto=http, for=5.6.7.8;proto=HTTPS;host=a.example')).toEqual(
      { proto: 'https', host: 'a.example' },
    )
    expect(lastForwarded(undefined)).toEqual({})
  })
})
