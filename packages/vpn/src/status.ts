// SPDX-License-Identifier: AGPL-3.0-only
// The status Settings › VPN and A8 show, worked out from the settings and what the tunnel last
// reported. It follows the prototype's `vpnStatus` (design/prototypes/src/mock/vpn.ts) row for
// row; the values are real instead of played.
import { checkCopy as c, failures, labels } from './copy.ts'
import { providerById } from './providers.ts'
import type { StoredVpnSettings } from './settings.ts'
import type { VpnCheck, VpnStatus } from './types.ts'

/** What `createVpn` knows about the tunnel, apart from the settings. */
export type VpnRuntime = {
  phase: 'off' | 'connecting' | 'connected' | 'down' | 'failed'
  /** Why it failed, in the spec's copy. */
  failure: string | null
  /** The tunnel row while it's down: what this mode can see. */
  down: readonly [string, string] | null
  /** The interface's addresses, in the interface mode. */
  address: string | null
  ipv6: string | null
  exit: { ip: string; country: string | null } | null
  exitResult: 'pass' | 'unknown' | 'own-unknown' | 'same' | null
  forwardedPort: number | null
  checkedAt: number | null
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
})

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
  listeningPort: number,
  peersIn: number,
): VpnStatus {
  const p = providerById(s.provider)
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
