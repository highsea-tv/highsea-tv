// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createSocket } from 'node:dgram'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDiscoveryResponder,
  createMdnsAdvertiser,
  DISCOVERY_MESSAGE,
  loadCertificate,
  type MdnsResponder,
  PRIVATE_RANGES,
  parseTrustedProxies,
  resolveClient,
} from '../src/index.ts'
import { selfSigned } from './self-signed.ts'

describe('trusted proxies', () => {
  test('parses addresses and ranges, and reports bad entries', () => {
    const { trusted, invalid } = parseTrustedProxies(
      '10.0.0.0/8, 192.168.1.2 fd00::/8 nonsense 10.0.0.0/40',
    )
    expect(invalid).toEqual(['nonsense', '10.0.0.0/40'])
    expect(trusted.has('10.1.2.3')).toBe(true)
    expect(trusted.has('::ffff:10.1.2.3')).toBe(true)
    expect(trusted.has('192.168.1.2')).toBe(true)
    expect(trusted.has('192.168.1.3')).toBe(false)
    expect(trusted.has('fd12::1')).toBe(true)
    expect(trusted.has('not an address')).toBe(false)
  })

  test('the private ranges cover a proxy on the host or a Docker network', () => {
    const { trusted, invalid } = parseTrustedProxies(PRIVATE_RANGES.join(','))
    expect(invalid).toEqual([])
    for (const a of ['127.0.0.1', '::1', '172.18.0.2', '192.168.1.1'])
      expect(trusted.has(a)).toBe(true)
    expect(trusted.has('203.0.113.9')).toBe(false)
  })
})

describe('resolving the client', () => {
  const { trusted } = parseTrustedProxies('172.16.0.0/12')
  const base = { encrypted: false, trusted, useForwardedHeaders: true }

  test('ignores forwarded headers from anyone but a trusted proxy', () => {
    const c = resolveClient({
      ...base,
      remoteAddress: '203.0.113.9',
      headers: { host: 'harbor:3000', 'x-forwarded-for': '1.2.3.4', 'x-forwarded-proto': 'https' },
    })
    expect(c).toEqual({
      address: '203.0.113.9',
      secure: false,
      host: 'harbor:3000',
      proxied: false,
    })
  })

  test('takes the rightmost untrusted address, so a forged left part is ignored', () => {
    const c = resolveClient({
      ...base,
      remoteAddress: '::ffff:172.18.0.2',
      headers: {
        host: 'internal:3000',
        'x-forwarded-for': '6.6.6.6, 198.51.100.7, 172.18.0.3',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'harbor.example.net',
      },
    })
    expect(c).toEqual({
      address: '198.51.100.7',
      secure: true,
      host: 'harbor.example.net',
      proxied: true,
    })
  })

  test('off unless forwarded headers are turned on', () => {
    const c = resolveClient({
      ...base,
      useForwardedHeaders: false,
      remoteAddress: '172.18.0.2',
      headers: { 'x-forwarded-for': '198.51.100.7' },
    })
    expect(c.address).toBe('172.18.0.2')
  })
})

describe('UDP discovery', () => {
  test('answers the discovery message with the current info, and nothing else', async () => {
    let name = 'Harbor'
    const responder = createDiscoveryResponder({
      port: 0,
      host: '127.0.0.1',
      answer: () => ({ id: 'srv_1', name }),
    })
    await responder.start()
    const port = responder.port() as number
    const client = createSocket('udp4')
    await new Promise<void>((r) => client.bind(0, '127.0.0.1', () => r()))
    const ask = (message: string) =>
      new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          client.off('message', onMessage)
          resolve(null)
        }, 300)
        const onMessage = (msg: Buffer) => {
          clearTimeout(timer)
          client.off('message', onMessage)
          resolve(msg.toString('utf8'))
        }
        client.on('message', onMessage)
        client.send(message, port, '127.0.0.1')
      })
    expect(JSON.parse((await ask(DISCOVERY_MESSAGE)) as string)).toEqual({
      id: 'srv_1',
      name: 'Harbor',
    })
    name = 'Harbour'
    expect(JSON.parse((await ask(DISCOVERY_MESSAGE)) as string).name).toBe('Harbour')
    expect(await ask('hello')).toBeNull()
    client.close()
    await responder.stop()
    expect(responder.running()).toBe(false)
  })
})

describe('mDNS', () => {
  test('advertises _highsea._tcp with the id and version, and says goodbye on stop', async () => {
    const calls: string[] = []
    let options: unknown
    const fake: MdnsResponder = {
      createService(o) {
        options = o
        return {
          advertise: async () => void calls.push('advertise'),
          end: async () => void calls.push('end'),
          destroy: async () => void calls.push('destroy'),
        }
      },
      shutdown: async () => void calls.push('shutdown'),
    }
    const mdns = createMdnsAdvertiser({ responder: async () => fake })
    await mdns.start({ name: 'Harbor', id: 'srv_1', version: '0.1.0', port: 3000 })
    expect(options).toEqual({
      name: 'Harbor',
      type: 'highsea',
      port: 3000,
      txt: { id: 'srv_1', version: '0.1.0' },
    })
    expect(mdns.running()).toBe(true)
    await mdns.stop()
    expect(calls).toEqual(['advertise', 'end', 'destroy', 'shutdown'])
    expect(mdns.running()).toBe(false)
  })

  test('a failed advertisement is logged, not thrown', async () => {
    const warnings: string[] = []
    const logger = {
      warn: (m: string) => warnings.push(m),
      info() {},
      debug() {},
      error() {},
      child: () => logger,
    }
    const mdns = createMdnsAdvertiser({
      responder: async () => ({
        createService: () => ({
          advertise: async () => {
            throw new Error('no interfaces')
          },
          end: async () => {},
          destroy: async () => {},
        }),
        shutdown: async () => {},
      }),
      logger: logger as never,
    })
    await mdns.start({ name: 'Harbor', id: 'srv_1', version: '0.1.0', port: 3000 })
    expect(warnings).toHaveLength(1)
  })
})

describe('built-in TLS certificate', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'highsea-tls-'))

  test('says where to put the files when they’re missing', () => {
    const config = dir()
    const result = loadCertificate(config)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem).toContain(join(config, 'tls'))
  })

  test('loads a matching certificate and key', () => {
    const config = dir()
    mkdirSync(join(config, 'tls'))
    const { cert, key } = selfSigned()
    writeFileSync(join(config, 'tls', 'cert.pem'), cert)
    writeFileSync(join(config, 'tls', 'key.pem'), key)
    expect(loadCertificate(config).ok).toBe(true)
  })

  test('refuses a key that doesn’t match', () => {
    const config = dir()
    mkdirSync(join(config, 'tls'))
    writeFileSync(join(config, 'tls', 'cert.pem'), selfSigned().cert)
    writeFileSync(join(config, 'tls', 'key.pem'), selfSigned().key)
    const result = loadCertificate(config)
    expect(result.ok).toBe(false)
  })
})
