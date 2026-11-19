// SPDX-License-Identifier: AGPL-3.0-only
// `connect: token` (HT-87) against a fake of NordVPN's API, with the seed's NordVPN entry: the
// owner pastes only the token, highsea fetches the NordLynx key and a recommended server (in a
// country, if one is picked) and builds the tunnel; a server that goes away is replaced on the
// reconnect. A refused token, a country with no servers and the API out of reach each say why. The
// token stays sealed, out of every address, log line and answer. Nothing runs or leaves the machine.
import { describe, expect, test } from 'bun:test'
import { AppError, createLogger } from '@highsea-tv/core'
import { readSetting } from '@highsea-tv/db'
import { createTokenApi, readStored, VPN_TIMINGS } from '../src/index.ts'
import { createFakeNordVpn, createFakeWireGuard } from './fake/index.ts'
import { echoes, testVpn, wgConfig } from './helpers.ts'

const OWN = '81.2.69.160'
const EXIT = '194.127.167.108'

function nord(options: { handshake?: boolean } = {}) {
  const api = createFakeNordVpn()
  const wg = createFakeWireGuard()
  const e = echoes(
    new Map<string | null, string | Error>([
      [null, OWN],
      ['10.5.0.2', EXIT],
      ['10.2.0.2', EXIT],
    ]),
  )
  const logged: string[] = []
  const logger = createLogger({
    level: 'debug',
    sinks: [(entry) => logged.push(JSON.stringify(entry))],
  })
  let now = () => 0
  const t = testVpn({
    logger,
    runner: async (c) => {
      if (options.handshake && c.program === 'wg' && c.args[0] === 'show' && wg.kernel.link)
        wg.kernel.handshake = Math.floor(now() / 1000)
      return wg.runner(c)
    },
    fetch: e.fetch,
    boundFetch: e.boundFetch,
    tokenApi: createTokenApi(api.fetch),
  })
  now = () => t.clock.now()
  async function step(ms: number, handshake = true) {
    for (let done = 0; done < ms; done += 5_000) {
      if (handshake && wg.kernel.link) wg.kernel.handshake = Math.floor(t.clock.now() / 1000)
      t.timers.advance(Math.min(5_000, ms - done))
      await t.vpn.settled()
    }
  }
  const peerLine = () => wg.lines().findLast((l) => l.includes(' peer ')) ?? ''
  return { ...t, api, wg, logged, step, peerLine }
}

describe('NordVPN by access token alone', () => {
  test('the token alone: the key it unlocks, a recommended server, and the tunnel through it', async () => {
    const n = nord()
    const token = n.api.state.token
    const saved = await n.vpn.save({ mode: 'builtin', provider: 'nordvpn', token })
    expect(saved).toMatchObject({ tokenSet: true, tokenCountry: '', configName: null })
    expect(JSON.stringify(saved)).not.toContain(token)
    n.vpn.start()
    await n.vpn.settled()

    // the key went in on standard input, from NordVPN's answer; the server is its station:51820
    const keyIn = n.wg.commands.find((c) => c.args.includes('private-key'))?.stdin?.trim()
    expect(keyIn).toBe(n.api.state.privateKey)
    expect(n.wg.lines()).toContain('ip -4 address add 10.5.0.2/32 dev hswg0')
    expect(n.peerLine()).toContain(`endpoint 194.127.167.108:51820`)
    expect(n.peerLine()).toContain(Buffer.alloc(32, 3).toString('base64'))
    await n.step(5_000)
    expect(n.last()).toEqual({ address: '10.5.0.2', dns: ['103.86.96.100', '103.86.99.100'] })
    expect(n.vpn.status()).toMatchObject({ state: 'connected', provider: 'NordVPN', exitIp: EXIT })
    expect(n.vpn.status().checks.find((c) => c.id === 'portForwarding')).toMatchObject({
      result: 'warn',
      title: 'NordVPN doesn’t forward ports',
    })

    // the token went only in the Authorization header: never in an address, the row or a log
    const credentials = n.api.state.requests.filter((r) => r.url.includes('credentials'))
    expect(credentials.length).toBeGreaterThanOrEqual(2) // checked on save, then used to connect
    for (const r of credentials)
      expect(r.authorization).toBe(`Basic ${Buffer.from(`token:${token}`).toString('base64')}`)
    for (const r of n.api.state.requests) expect(r.url).not.toContain(token)
    // the server lists never get the token
    for (const r of n.api.state.requests.filter((r) => !r.url.includes('credentials')))
      expect(r.authorization).toBeNull()
    expect(JSON.stringify(readSetting(n.db, 'vpn', {}))).not.toContain(token)
    expect(n.logged.join('\n')).not.toContain(token)
    expect(n.logged.join('\n')).not.toContain(n.api.state.privateKey)
    expect(JSON.stringify(n.vpn.settings())).not.toContain(token)
    await n.vpn.stop()
  })

  test('a country narrows the recommendation, by name or code', async () => {
    const n = nord()
    await n.vpn.save({
      mode: 'builtin',
      provider: 'nordvpn',
      token: n.api.state.token,
      tokenCountry: 'united states',
    })
    n.vpn.start()
    await n.vpn.settled()
    const asked = n.api.state.requests.find((r) => r.url.includes('recommendations'))?.url ?? ''
    expect(new URL(asked).searchParams.get('filters[country_id]')).toBe('228')
    expect(n.peerLine()).toContain('endpoint 185.203.218.10:51820')
    await n.vpn.save({ tokenCountry: 'SE' })
    await n.vpn.settled()
    // Sweden has no servers in the fake: a plain reason, and highsea tries again
    expect(n.vpn.status()).toMatchObject({
      state: 'failed',
      message:
        'NordVPN recommends no WireGuard server in SE right now. Pick another country, or leave it to NordVPN.',
    })
    expect(n.timers.pending()).toBeGreaterThan(0)
    await n.vpn.save({ tokenCountry: 'Atlantis' })
    await n.vpn.settled()
    expect(n.vpn.status().message).toBe('NordVPN has no country called Atlantis. Pick another one.')
    await n.vpn.stop()
  })

  test('a refused token is refused on save, and later fails without retrying', async () => {
    const n = nord()
    const refused = await n.vpn
      .save({ mode: 'builtin', provider: 'nordvpn', token: 'not-a-token' })
      .catch((e) => e)
    expect(refused).toBeInstanceOf(AppError)
    expect(refused).toMatchObject({
      message:
        'NordVPN didn’t accept that access token. Generate a new one in your NordVPN account and paste it here.',
      details: { field: 'token' },
    })
    expect(n.vpn.settings().tokenSet).toBe(false)

    // nothing saved without a token or a file
    const empty = await n.vpn.save({ mode: 'builtin', provider: 'nordvpn' }).catch((e) => e)
    expect(empty).toMatchObject({
      message: 'Paste your NordVPN access token.',
      details: { field: 'token' },
    })

    await n.vpn.save({ mode: 'builtin', provider: 'nordvpn', token: n.api.state.token })
    n.api.state.token = 'revoked in Nord Account'
    n.vpn.start()
    await n.vpn.settled()
    expect(n.vpn.status()).toMatchObject({
      state: 'failed',
      message:
        'NordVPN didn’t accept that access token. Generate a new one in your NordVPN account and paste it here.',
    })
    expect(n.timers.pending()).toBe(0)
    expect(n.wg.kernel.link).toBe(false)
    await n.vpn.stop()
  })

  test('the API out of reach is down, says so, and connects once it answers again', async () => {
    const n = nord()
    await n.vpn.save({ mode: 'builtin', provider: 'nordvpn', token: n.api.state.token })
    n.api.state.reachable = false
    n.vpn.start()
    await n.vpn.settled()
    expect(n.vpn.status()).toMatchObject({ state: 'down' })
    expect(n.vpn.status().checks[0]).toMatchObject({ title: 'Couldn’t reach NordVPN' })
    expect(n.last()).toBeNull()
    n.api.state.reachable = true
    await n.step(VPN_TIMINGS.backoffMs + 5_000)
    expect(n.vpn.status().state).toBe('connected')
    await n.vpn.stop()
  })

  test('a server that goes away is replaced: the reconnect asks for a fresh recommendation', async () => {
    const n = nord()
    await n.vpn.save({
      mode: 'builtin',
      provider: 'nordvpn',
      token: n.api.state.token,
      tokenCountry: 'Netherlands',
    })
    n.vpn.start()
    await n.vpn.settled()
    await n.step(5_000)
    expect(n.vpn.status().state).toBe('connected')
    expect(n.peerLine()).toContain('194.127.167.108:51820')

    // nl930 stops answering, and NordVPN now recommends nl931
    n.api.state.offset = 1
    await n.step(VPN_TIMINGS.handshakeTimeoutMs, false)
    // down, and the reconnect has already asked again
    expect(n.vpn.status().state).not.toBe('connected')
    expect(n.last()).toBeNull()
    await n.step(VPN_TIMINGS.backoffMs + 5_000)
    expect(n.peerLine()).toContain('194.127.167.109:51820')
    expect(n.vpn.status().state).toBe('connected')
    await n.vpn.stop()
  })

  test('a hand-written WireGuard file still works when no token is set', async () => {
    const n = nord()
    await n.vpn.save({ mode: 'builtin', provider: 'nordvpn', config: wgConfig() })
    expect(n.vpn.settings()).toMatchObject({ tokenSet: false, configName: 'wireguard.conf' })
    n.vpn.start()
    await n.vpn.settled()
    expect(n.peerLine()).toContain('185.159.157.4:51820')
    expect(n.api.state.requests).toEqual([])
    await n.vpn.stop()
  })

  test('Test tries a token without saving it, and says why one is refused', async () => {
    const n = nord({ handshake: true })
    n.vpn.start()
    const ok = await n.vpn.test({ mode: 'builtin', provider: 'nordvpn', token: n.api.state.token })
    expect(ok.checks.map((c) => [c.id, c.result, c.title])).toEqual([
      ['tunnel', 'pass', 'The tunnel came up with NordVPN'],
      ['exit', 'pass', `Traffic leaves from ${EXIT} (Netherlands)`],
      ['names', 'pass', 'Names resolve through the tunnel'],
      ['portForwarding', 'warn', 'NordVPN doesn’t forward ports'],
    ])
    expect(ok.ok).toBe(true)
    expect(n.wg.kernel.link).toBe(false)
    expect(n.vpn.settings()).toMatchObject({ mode: 'builtin', tokenSet: false })
    expect(readStored(n.db).tokenSealed).toBeNull()

    const bad = await n.vpn.test({ mode: 'builtin', provider: 'nordvpn', token: 'nope' })
    expect(bad.ok).toBe(false)
    expect(bad.checks[0]).toMatchObject({
      id: 'tunnel',
      result: 'fail',
      title:
        'NordVPN didn’t accept that access token. Generate a new one in your NordVPN account and paste it here.',
    })
    await n.vpn.stop()
  })
})
