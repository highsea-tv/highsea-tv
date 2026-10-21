// SPDX-License-Identifier: AGPL-3.0-only
// highsea connects' mechanisms on their own: PIA's API against a fake PIA, NAT-PMP against a fake
// gateway on 127.0.0.1, the bound fetch against a local server, and WireGuard keys. No request
// leaves the machine.
import { afterEach, describe, expect, test } from 'bun:test'
import { createPrivateKey, createPublicKey } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  boundFetch,
  createPia,
  findRegion,
  forwardWithNatPmp,
  generateWireGuardKeys,
  isWireGuardKey,
  NatPmpError,
  natPmpExternalAddress,
  natPmpMap,
  PiaError,
} from '../src/index.ts'
import { createFakePia, startFakeNatPmp } from './fake/index.ts'

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  while (closers.length) await closers.pop()?.()
})

describe('PIA’s API', () => {
  test('signs in, lists regions, registers a key and forwards a port, as the scripts do', async () => {
    const fake = createFakePia()
    const pia = createPia(fake.transport)
    const token = await pia.token('p1234567', 'correct horse')
    expect(token).toBe('token-1')
    // the password goes in a form body, never a URL
    expect(fake.requests[0]).toMatchObject({ method: 'POST', form: { username: 'p1234567' } })
    expect(fake.requests[0]?.url).not.toContain('horse')

    const regions = await pia.regions()
    expect(regions.map((r) => [r.name, r.portForward])).toEqual([
      ['Netherlands', true],
      ['US East', false],
    ])
    const region = findRegion(regions, 'netherlands')
    expect(region?.server).toEqual({ ip: '203.0.113.10', cn: 'amsterdam401' })
    if (!region) throw new Error('no region')

    const connected = await pia.connect(region, token)
    const addKey = fake.requests.at(-1)
    expect(addKey?.connectTo).toBe('203.0.113.10')
    expect(addKey?.url).toStartWith('https://amsterdam401:1337/addKey?pt=token-1&pubkey=')
    expect(connected.dns).toEqual(['10.0.0.243', '10.0.0.242'])
    expect(connected.spec.addresses).toEqual(['10.13.128.7/32'])
    expect(connected.spec.peers).toEqual([
      {
        publicKey: fake.state.serverKey,
        presharedKey: null,
        endpoint: { host: '203.0.113.10', port: 1337 },
        allowedIps: ['0.0.0.0/0'],
        persistentKeepalive: 25,
      },
    ])
    expect(isWireGuardKey(connected.spec.privateKey)).toBe(true)

    const forward = await pia.signature(connected.server, token, '10.13.128.7')
    expect(forward).toMatchObject({ port: 47123, expiresAt: Date.parse('2027-01-01T00:00:00Z') })
    expect(fake.requests.at(-1)).toMatchObject({
      connectTo: '203.0.113.10',
      localAddress: '10.13.128.7',
    })
    await pia.bind(connected.server, forward, '10.13.128.7')
    expect(fake.state.binds).toBe(1)
    expect(fake.requests.at(-1)?.url).toStartWith('https://amsterdam401:19999/bindPort?payload=')
  })

  test('a wrong password is a refusal; PIA out of reach is not', async () => {
    const fake = createFakePia()
    const pia = createPia(fake.transport)
    const refused = await pia.token('p1234567', 'wrong').catch((e) => e)
    expect(refused).toBeInstanceOf(PiaError)
    expect(refused).toMatchObject({
      kind: 'refused',
      message: 'PIA didn’t accept that username and password.',
    })
    fake.state.down = true
    expect(await pia.token('p1234567', 'correct horse').catch((e) => e)).toMatchObject({
      kind: 'unreachable',
    })
  })
})

describe('NAT-PMP', () => {
  test('maps UDP then TCP as Proton documents, and renews with the same port', async () => {
    const gw = await startFakeNatPmp({ externalPort: 53186 })
    closers.push(gw.close)
    const options = { gateway: '127.0.0.1', localAddress: '127.0.0.1', port: gw.port }
    const first = await forwardWithNatPmp(options, 60, null)
    expect(first).toMatchObject({ externalPort: 53186, lifetime: 60 })
    const [udp, tcp] = gw.requests
    // version 0, opcode 1 then 2, internal port 1, no suggestion, lifetime 60 (RFC 6886 § 3.3)
    expect([...(udp ?? [])]).toEqual([0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 60])
    expect(tcp?.[1]).toBe(2)
    expect(tcp?.readUInt16BE(6)).toBe(53186)
    const renewed = await forwardWithNatPmp(options, 60, 53186)
    expect(renewed.externalPort).toBe(53186)
    expect(gw.requests.at(-2)?.readUInt16BE(6)).toBe(53186)
    expect(await natPmpExternalAddress(options)).toBe('198.51.100.9')
  })

  test('sends again when an answer is lost', async () => {
    const gw = await startFakeNatPmp({ dropFirst: 2 })
    closers.push(gw.close)
    const m = await natPmpMap(
      { gateway: '127.0.0.1', localAddress: '127.0.0.1', port: gw.port, initialMs: 10 },
      { protocol: 'udp', internalPort: 1, externalPort: 0, lifetime: 60 },
    )
    expect(m.externalPort).toBe(53186)
    expect(gw.requests.length).toBe(3)
  })

  test('a refusal reads the result code; silence gives up after the tries', async () => {
    const gw = await startFakeNatPmp({ result: 2 })
    closers.push(gw.close)
    const options = { gateway: '127.0.0.1', localAddress: '127.0.0.1', port: gw.port }
    const refused = await forwardWithNatPmp(options, 60, null).catch((e) => e)
    expect(refused).toBeInstanceOf(NatPmpError)
    expect(refused).toMatchObject({ result: 2 })
    expect(refused.message).toBe('The gateway at 127.0.0.1 didn’t map the port: it refused.')

    const silent = await startFakeNatPmp({ dropFirst: 100 })
    closers.push(silent.close)
    const timedOut = await natPmpMap(
      { ...options, port: silent.port, initialMs: 5, tries: 3 },
      { protocol: 'tcp', internalPort: 1, externalPort: 0, lifetime: 60 },
    ).catch((e) => e)
    expect(timedOut.message).toBe('The gateway at 127.0.0.1 didn’t answer.')
    expect(silent.requests.length).toBe(3)
  })
})

describe('The bound fetch', () => {
  async function server() {
    const seen: { method?: string; url?: string; body: string; from?: string }[] = []
    const srv = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c: Buffer) => {
        body += c.toString()
      })
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, body, from: req.socket.remoteAddress })
        if (req.url === '/moved') {
          res.writeHead(302, { location: '/landing' })
          return res.end()
        }
        res.writeHead(200, { 'set-cookie': ['a=1', 'b=2'], 'content-type': 'text/plain' })
        res.end(`${req.method} ${req.url}`)
      })
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    closers.push(() => new Promise<void>((r) => srv.close(() => r())))
    return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, seen }
  }

  test('posts a form from the address, keeps every cookie, and follows a redirect as a GET', async () => {
    const s = await server()
    const f = boundFetch('127.0.0.1')
    const res = await f(`${s.url}/search`, {
      method: 'POST',
      body: new URLSearchParams({ q: 'dune' }),
    })
    expect(await res.text()).toBe('POST /search')
    expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    expect(s.seen[0]).toMatchObject({ body: 'q=dune', from: '127.0.0.1' })

    const moved = await f(`${s.url}/moved`, { method: 'POST', body: 'x' })
    expect(await moved.text()).toBe('GET /landing')
    expect(moved.url).toBe(`${s.url}/landing`)

    const manual = await f(`${s.url}/moved`, { redirect: 'manual' })
    expect(manual.status).toBe(302)
    expect(manual.headers.get('location')).toBe('/landing')
  })

  test('an abort stops the request', async () => {
    const s = await server()
    const controller = new AbortController()
    controller.abort()
    await expect(
      boundFetch('127.0.0.1')(`${s.url}/`, { signal: controller.signal }),
    ).rejects.toThrow()
  })
})

describe('WireGuard keys', () => {
  test('are X25519 pairs in wg’s base64', () => {
    const a = generateWireGuardKeys()
    const b = generateWireGuardKeys()
    expect(isWireGuardKey(a.privateKey) && isWireGuardKey(a.publicKey)).toBe(true)
    expect(a.privateKey).not.toBe(b.privateKey)
    // the public key is the private key's
    const d = Buffer.from(a.privateKey, 'base64').toString('base64url')
    const x = Buffer.from(a.publicKey, 'base64').toString('base64url')
    const priv = createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', d, x }, format: 'jwk' })
    expect(createPublicKey(priv).export({ format: 'jwk' }).x).toBe(x)
  })
})
