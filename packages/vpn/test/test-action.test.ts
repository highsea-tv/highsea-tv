// SPDX-License-Identifier: AGPL-3.0-only
// Settings › VPN's Test (HT-82) against the package's fakes: the settings on the page are tried
// without being saved, one line each for the tunnel, the exit, names and port forwarding. The
// built-in VPN's test tunnel is taken down after, a live tunnel is checked without being touched,
// and torrents never get a test tunnel's binding. Nothing runs and nothing leaves the machine.
import { describe, expect, test } from 'bun:test'
import type os from 'node:os'
import type { AppError } from '@highsea-tv/core'
import type { NatPmpOptions } from '../src/index.ts'
import { createFakeWireGuard, startFakeGluetun } from './fake/index.ts'
import { echoes, iface, KEY_A, KEY_B, testVpn, wgConfig } from './helpers.ts'

const OWN = '81.2.69.160'
const EXIT = '185.159.157.4'

function tester(
  options: {
    answers?: [string | null, string | Error][]
    handshake?: boolean
    resolve?: () => Promise<string[]>
    interfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>
  } = {},
) {
  const wg = createFakeWireGuard()
  const e = echoes(
    new Map<string | null, string | Error>(
      options.answers ?? [
        [null, OWN],
        ['10.2.0.2', EXIT],
        ['10.5.0.2', EXIT],
        ['10.2.0.15', EXIT],
      ],
    ),
  )
  const nat: NatPmpOptions[] = []
  let now = () => 0
  const t = testVpn({
    // the peer answers as soon as the interface is up, unless a test says it doesn't
    runner: async (c) => {
      if (
        options.handshake !== false &&
        c.program === 'wg' &&
        c.args[0] === 'show' &&
        wg.kernel.link
      )
        wg.kernel.handshake = Math.floor(now() / 1000)
      return wg.runner(c)
    },
    fetch: e.fetch,
    boundFetch: e.boundFetch,
    natPmp: async (o, lifetime) => {
      nat.push(o)
      return { externalPort: 53186, lifetime, epoch: 1 }
    },
    ...(options.resolve ? { resolve: options.resolve } : {}),
    ...(options.interfaces ? { interfaces: () => options.interfaces ?? {} } : {}),
  })
  now = () => t.clock.now()
  const rows = (r: { checks: { id: string; result: string; title: string }[] }) =>
    r.checks.map((c) => [c.id, c.result, c.title])
  return { ...t, wg, nat, rows }
}

/** Runs a test while the fake clock moves on, a second at a time. */
async function stepping<T>(t: ReturnType<typeof tester>, run: Promise<T>): Promise<T> {
  let done = false
  const out = run.finally(() => {
    done = true
  })
  for (let i = 0; i < 40 && !done; i++) {
    await Promise.resolve()
    await new Promise((r) => setImmediate(r))
    t.timers.advance(1_000)
  }
  return out
}

describe('Test in Settings › VPN', () => {
  test('the built-in VPN: brings the tunnel up, proves each line, takes it down, saves nothing', async () => {
    const t = tester()
    t.vpn.start()
    const r = await t.vpn.test({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    expect(r.ok).toBe(true)
    expect(t.rows(r)).toEqual([
      ['tunnel', 'pass', 'The tunnel came up with Proton VPN'],
      ['exit', 'pass', `Traffic leaves from ${EXIT} (Netherlands)`],
      ['names', 'pass', 'Names resolve through the tunnel'],
      ['portForwarding', 'pass', '53186 is forwarded'],
    ])
    expect(t.nat).toEqual([{ gateway: '10.2.0.1', localAddress: '10.2.0.2' }])
    // taken down again, nothing saved, and torrents never had the test tunnel
    expect(t.wg.kernel.link).toBe(false)
    expect(t.vpn.settings()).toMatchObject({ mode: 'builtin', configName: null })
    expect(t.bindings.every((b) => b === null || b.address === null)).toBe(true)
  })

  test('no handshake in 15 seconds fails the tunnel, and the rest isn’t checked', async () => {
    const t = tester({ handshake: false })
    const r = await stepping(
      t,
      t.vpn.test({ mode: 'builtin', provider: 'proton', config: wgConfig() }),
    )
    expect(r.ok).toBe(false)
    expect(r.checks[0]).toMatchObject({ id: 'tunnel', result: 'fail' })
    expect(r.checks[0]?.title).toContain('Proton VPN didn’t answer')
    expect(r.checks.slice(1).map((c) => [c.id, c.result, c.title])).toEqual([
      ['exit', 'info', 'Not checked: the tunnel didn’t come up.'],
      ['names', 'info', 'Not checked: the tunnel didn’t come up.'],
      ['portForwarding', 'info', 'Not checked: the tunnel didn’t come up.'],
    ])
    expect(t.wg.kernel.link).toBe(false)
  })

  test('the tunnel’s own address as the exit fails, and so does a file with no DNS line', async () => {
    const t = tester({
      answers: [
        [null, OWN],
        ['10.2.0.2', OWN],
      ],
    })
    const noDns = `[Interface]\nPrivateKey = ${KEY_A}\nAddress = 10.2.0.2/32\n[Peer]\nPublicKey = ${KEY_B}\nAllowedIPs = 0.0.0.0/0\nEndpoint = 185.159.157.4:51820\n`
    const r = await t.vpn.test({ mode: 'builtin', provider: 'other', config: noDns })
    expect(r.ok).toBe(false)
    expect(t.rows(r).slice(1, 3)).toEqual([
      ['exit', 'fail', 'The exit address is your own'],
      ['names', 'fail', 'The file has no DNS line'],
    ])
  })

  test('names that don’t resolve through the tunnel fail with the servers asked', async () => {
    const t = tester({ resolve: () => Promise.reject(new Error('ETIMEOUT')) })
    const r = await t.vpn.test({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    expect(r.checks[2]).toMatchObject({
      id: 'names',
      result: 'fail',
      title: 'Names didn’t resolve through the tunnel',
      detail: '10.2.0.1 didn’t answer from the tunnel’s address.',
    })
  })

  test('NordVPN forwards no ports: a warning that says what that means for seeding', async () => {
    const t = tester()
    const nord = `[Interface]\nPrivateKey = ${KEY_A}\nAddress = 10.5.0.2/32\nDNS = 103.86.96.100, 103.86.99.100\n[Peer]\nPublicKey = ${KEY_B}\nAllowedIPs = 0.0.0.0/0\nEndpoint = nl1.nordvpn.example:51820\n`
    const r = await t.vpn.test({ mode: 'builtin', provider: 'nordvpn', config: nord })
    expect(r.ok).toBe(true)
    expect(r.checks[3]).toEqual({
      id: 'portForwarding',
      label: 'Port forwarding',
      result: 'warn',
      title: 'NordVPN doesn’t forward ports',
      detail:
        'Downloads work, but peers can’t connect in, so seeding reaches only peers that accept connections. Ratios on private trackers grow slowly.',
    })
    expect(t.nat).toEqual([])
  })

  test('a refusal in the settings is the save’s, with its field', async () => {
    const t = tester()
    const err = (await t.vpn
      .test({ mode: 'builtin', provider: 'mullvad' })
      .catch((e) => e)) as AppError
    expect(err.message).toBe('Upload a WireGuard configuration from Mullvad.')
    expect((err.details as { field: string }).field).toBe('config')
    const off = (await t.vpn.test({ mode: 'off' }).catch((e) => e)) as AppError
    expect(off.message).toBe('Choose a connection to test.')
  })

  test('a live tunnel: the same settings are checked in place; others are refused', async () => {
    const t = tester()
    await t.vpn.save({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    t.vpn.start()
    await t.vpn.settled()
    expect(t.vpn.status().state).toBe('connected')
    const before = t.wg.commands.length
    const linkAdds = () =>
      t.wg.commands.filter((c) => c.args[0] === 'link' && c.args[1] === 'add').length
    const adds = linkAdds()
    const r = await t.vpn.test({ mode: 'builtin', useForwardedPort: true })
    expect(r.checks[0]).toMatchObject({
      result: 'pass',
      title: 'The tunnel to Proton VPN is up',
    })
    expect(linkAdds()).toBe(adds)
    expect(t.wg.commands.length).toBeGreaterThanOrEqual(before)
    expect(t.wg.kernel.link).toBe(true)
    expect(t.last()?.address).toBe('10.2.0.2')
    const other = (await t.vpn
      .test({ mode: 'builtin', config: wgConfig() })
      .catch((e) => e)) as AppError
    expect(other.code).toBe('conflict')
    expect(other.message).toContain('Save these instead')
    await t.vpn.stop()
  })

  test('a VPN container: read from gluetun, nothing restarted', async () => {
    const gluetun = await startFakeGluetun()
    try {
      const t = testVpn()
      const r = await t.vpn.test({
        mode: 'container',
        containerUrl: gluetun.url,
        containerKey: gluetun.state.apiKey,
      })
      expect(r.ok).toBe(true)
      expect(r.checks.map((c) => [c.id, c.result, c.title])).toEqual([
        ['tunnel', 'pass', 'gluetun reports the tunnel running'],
        ['exit', 'pass', 'gluetun’s exit is 198.51.100.23 (Switzerland)'],
        ['names', 'pass', 'Names are looked up through the tunnel'],
        ['portForwarding', 'pass', '41822 is forwarded'],
      ])
      expect(gluetun.requests.some((q) => q.method === 'PUT')).toBe(false)
      expect(t.vpn.settings()).toMatchObject({ mode: 'builtin', configName: null })
      const refused = await t.vpn.test({
        mode: 'container',
        containerUrl: gluetun.url,
        containerKey: 'wrong',
      })
      expect(refused.ok).toBe(false)
      expect(refused.checks[0]?.title).toBe(
        `gluetun’s control server at ${gluetun.url} refused that API key.`,
      )
    } finally {
      await gluetun.close()
    }
  })

  test('an interface: its address and the exit through it', async () => {
    const t = tester({ interfaces: { wg0: [iface('10.2.0.15')] } })
    const r = await t.vpn.test({ mode: 'interface', interface: 'wg0' })
    expect(t.rows(r)).toEqual([
      ['tunnel', 'pass', 'wg0 is up'],
      ['exit', 'pass', `Traffic leaves from ${EXIT} (Netherlands)`],
      ['names', 'info', 'Names use your system’s resolver'],
      ['portForwarding', 'info', 'Torrents listen on port 51413'],
    ])
    const gone = await t.vpn.test({ mode: 'interface', interface: 'wg1' })
    expect(gone.ok).toBe(false)
    expect(gone.checks[0]?.title).toBe('wg1 has no IPv4 address')
  })
})
