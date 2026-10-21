// SPDX-License-Identifier: AGPL-3.0-only
// The status Settings › VPN and A8 show, worked out from the settings and what the tunnel last
// reported. It follows the prototype's `vpnStatus` (design/prototypes/src/mock/vpn.ts) row for
// row; the values are real instead of played.
import { checkCopy as c, failures, labels } from './copy.ts'
import type { VpnProviderDefinition } from './providers.ts'
import type { StoredVpnSettings } from './settings.ts'
import type { VpnCheck, VpnStatus } from './types.ts'

/** What `createVpn` knows about the tunnel, apart from the settings. */
export type VpnRuntime = {
  phase: 'off' | 'connecting' | 'connected' | 'down' | 'failed'
  /** Why it failed, in the spec's copy. */
  failure: string | null
  /** The tunnel row while it's down: what this mode can see. */
  down: readonly [string, string] | null
  /** The interface's addresses in the interface mode; the tunnel's in highsea connects. */
  address: string | null
  ipv6: string | null
  exit: { ip: string; country: string | null } | null
  /** `own` and `not-provider` are leaks in highsea connects: torrents stop. */
  exitResult: 'pass' | 'unknown' | 'own-unknown' | 'same' | 'own' | 'not-provider' | null
  forwardedPort: number | null
  checkedAt: number | null
  /** highsea connects: the latest handshake, in milliseconds since the epoch. */
  handshakeAt: number | null
  /** highsea connects: whether names go through the tunnel (a DNS line), and the kill switch. */
  names: boolean | null
  killSwitch: boolean | null
  /** highsea connects: the provider didn't forward a port the last time highsea asked. */
  forwardFailed: boolean
}

export const initialRuntime = (): VpnRuntime => ({
  phase: 'off',
  failure: null,
  down: null,
  address: null,
  ipv6: null,
  exit: null,
  exitResult: null,
  forwardedPort: null,
  checkedAt: null,
  handshakeAt: null,
  names: null,
  killSwitch: null,
  forwardFailed: false,
})

/** Whether a check found a leak, which takes the binding away in highsea connects. */
export const leaking = (rt: VpnRuntime) =>
  rt.names === false ||
  rt.killSwitch === false ||
  rt.exitResult === 'own' ||
  rt.exitResult === 'not-provider'

const check = (
  id: VpnCheck['id'],
  result: VpnCheck['result'],
  title: string,
  detail?: string,
): VpnCheck =>
  detail
    ? { id, label: labels[id], result, title, detail }
    : { id, label: labels[id], result, title }

const IDS: VpnCheck['id'][] = ['tunnel', 'exit', 'names', 'killSwitch', 'portForwarding', 'ipv6']

export function buildStatus(
  s: StoredVpnSettings,
  rt: VpnRuntime,
  p: VpnProviderDefinition | undefined,
  listeningPort: number,
  peersIn: number,
  now: number,
): VpnStatus {
  const name =
    s.mode === 'builtin'
      ? (p?.name ?? 'your provider')
      : s.mode === 'container'
        ? 'gluetun'
        : s.interface
  const base: VpnStatus = {
    mode: s.mode,
    provider: s.mode === 'off' ? null : name,
    state: 'off',
    message: null,
    needsCapability: false,
    exitIp: null,
    country: null,
    forwardedPort: null,
    checks: [],
    checkedAt:
      s.mode === 'off' || rt.checkedAt === null ? null : new Date(rt.checkedAt).toISOString(),
  }
  if (s.mode === 'off') return base
  if (rt.phase === 'failed')
    return {
      ...base,
      state: 'failed',
      message: rt.failure,
      needsCapability: rt.failure === failures.needsCapability,
    }
  if (rt.phase === 'connecting' || rt.phase === 'off')
    return {
      ...base,
      state: 'connecting',
      checks: IDS.map((id) => check(id, 'pending', c.waiting)),
    }
  if (rt.phase === 'down')
    return {
      ...base,
      state: 'down',
      checks: [
        check('tunnel', 'fail', ...(rt.down ?? c.containerDown)),
        check('killSwitch', 'pass', ...c.stopped),
        ...IDS.filter((id) => id !== 'tunnel' && id !== 'killSwitch').map((id) =>
          check(id, 'pending', c.checkedLater),
        ),
      ],
    }
  if (s.mode === 'builtin') return { ...base, ...builtinChecks(s, rt, p, name, peersIn, now) }

  const container = s.mode === 'container'
  const tunnel = container
    ? check('tunnel', 'pass', c.containerTunnel)
    : check('tunnel', 'pass', ...c.interfaceTunnel(s.interface, rt.address ?? ''))
  const exitTitle = rt.exit ? c.exit(rt.exit.ip, rt.exit.country) : ''
  const exit =
    rt.exitResult === 'unknown' || !rt.exit
      ? check('exit', 'warn', ...c.exitUnknown)
      : rt.exitResult === 'same'
        ? check('exit', 'warn', ...c.exitSame(s.interface))
        : rt.exitResult === 'own-unknown'
          ? check('exit', 'warn', ...c.exitOwnUnknown)
          : check('exit', 'pass', exitTitle, container ? c.exitContainer : c.exitNotOwn)
  const names = container
    ? check('names', 'pass', ...c.namesContainer)
    : check('names', 'pass', c.names)
  const killSwitch = container
    ? check('killSwitch', 'pass', ...c.killSwitchContainer)
    : check('killSwitch', 'warn', ...c.killSwitchInterface(s.interface))
  const forwardedPort = container && s.useForwardedPort ? rt.forwardedPort : null
  const portForwarding = !container
    ? check('portForwarding', 'info', ...c.listening(listeningPort))
    : forwardedPort
      ? check('portForwarding', 'pass', ...c.forwarded(forwardedPort, peersIn))
      : !s.useForwardedPort
        ? check('portForwarding', 'info', ...c.notForwarding)
        : check('portForwarding', 'warn', ...c.doesntForward(name))
  const ipv6 =
    !container && rt.ipv6 ? check('ipv6', 'pass', c.ipv6) : check('ipv6', 'info', ...c.ipv4Only)
  return {
    ...base,
    state: 'connected',
    exitIp: rt.exit?.ip ?? null,
    country: rt.exit?.country ?? null,
    forwardedPort,
    checks: [tunnel, exit, names, killSwitch, portForwarding, ipv6],
  }
}

/** highsea connects' rows (vpn.md › Checks), where a leak fails and stops torrents. */
function builtinChecks(
  s: StoredVpnSettings,
  rt: VpnRuntime,
  p: VpnProviderDefinition | undefined,
  name: string,
  peersIn: number,
  now: number,
): Pick<VpnStatus, 'state' | 'exitIp' | 'country' | 'forwardedPort' | 'checks'> {
  const seconds =
    rt.handshakeAt === null ? 0 : Math.max(0, Math.round((now - rt.handshakeAt) / 1000))
  const tunnel = check('tunnel', 'pass', ...c.builtinTunnel(name, seconds))
  const exit =
    rt.exitResult === 'own'
      ? check('exit', 'fail', ...c.exitOwn)
      : rt.exitResult === 'not-provider'
        ? check('exit', 'fail', ...c.exitNotProvider(name, rt.exit?.ip ?? ''))
        : rt.exitResult === 'own-unknown' && rt.exit
          ? check('exit', 'warn', ...c.exitOwnUnknown)
          : rt.exitResult === 'pass' && rt.exit
            ? check('exit', 'pass', c.exit(rt.exit.ip, rt.exit.country), c.exitNotOwn)
            : check('exit', 'warn', ...c.exitUnknown)
  const names =
    rt.names === false ? check('names', 'fail', ...c.namesOutside) : check('names', 'pass', c.names)
  const killSwitch =
    rt.killSwitch === false
      ? check('killSwitch', 'fail', ...c.killSwitchMissing)
      : check('killSwitch', 'pass', ...c.killSwitchBuiltin)
  const method = p?.portForwarding.method ?? 'none'
  const forwardedPort = s.useForwardedPort ? rt.forwardedPort : null
  const portForwarding = !s.useForwardedPort
    ? check('portForwarding', 'info', ...c.notForwarding)
    : forwardedPort
      ? check('portForwarding', 'pass', ...c.forwarded(forwardedPort, peersIn))
      : method === 'none'
        ? check('portForwarding', 'warn', ...c.doesntForward(name))
        : method === 'static'
          ? check('portForwarding', 'warn', ...c.noForwardedPortSet)
          : rt.forwardFailed
            ? check('portForwarding', 'warn', ...c.forwardingFailed(name))
            : check('portForwarding', 'pending', c.askingForPort(name))
  return {
    state: 'connected',
    exitIp: rt.exit?.ip ?? null,
    country: rt.exit?.country ?? null,
    forwardedPort,
    checks: [
      tunnel,
      exit,
      names,
      killSwitch,
      portForwarding,
      check('ipv6', 'info', ...c.ipv4OnlyBuiltin),
    ],
  }
}
