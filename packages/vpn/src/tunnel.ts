// SPDX-License-Identifier: AGPL-3.0-only
// The built-in VPN’s tunnel: a WireGuard interface highsea sets up and takes down itself, with the
// routing that makes it the kill switch (docs/product/vpn.md › Ways to connect, ADR 0042 › 6b).
//
// Routing by source address, as WireGuard's own documentation describes for sending only some
// traffic through a tunnel (https://www.wireguard.com/netns/ › "Improved Rule-based Routing", and
// ip-rule(8)): the tunnel's routes live in their own table, which a rule consults only for packets
// from the tunnel's address. The table ends in an `unreachable` default (ip-route(8) › unreachable),
// so a packet from that address goes through the tunnel or fails: once the interface goes, the
// kernel removes its routes and only the unreachable one is left. Torrent sockets bind to the
// tunnel's address, so they take the rule; everything else (the admin, TMDB, the catalog, and
// WireGuard's own encrypted packets, which leave from the host's address) keeps the main table.
// That's also why no fwmark is needed: WireGuard's UDP socket isn't bound to the tunnel's address.
//
// The interface is kernel WireGuard (Linux 5.6 and later) when the kernel has it, and wireguard-go
// on /dev/net/tun when it doesn't (https://www.wireguard.com/xplatform/, "wireguard-go").
import {
  type Command,
  CommandFailed,
  cidrArg,
  type Family,
  KEEPALIVE_SECONDS,
  ops,
  type Runner,
  run,
  TUNNEL_RULE_PRIORITY,
  TUNNEL_TABLE,
} from './commands.ts'
import type { WireGuardPeer } from './wireguard.ts'

/** wg-quick's default MTU for an IPv4 endpoint: 1500 less WireGuard's 80 bytes of overhead. */
export const DEFAULT_MTU = 1420

/** What the tunnel is built from: a parsed configuration, or PIA's answer turned into one. */
export type TunnelSpec = {
  privateKey: string
  addresses: string[]
  peers: WireGuardPeer[]
  mtu: number | null
}

/** The tunnel's own addresses, without prefixes: the IPv4 one is the binding. */
export function tunnelAddresses(spec: Pick<TunnelSpec, 'addresses'>) {
  const parsed = spec.addresses.map((a) => cidrArg(a))
  return {
    ipv4: parsed.find((a) => a.family === 4)?.address ?? null,
    ipv6: parsed.find((a) => a.family === 6)?.address ?? null,
  }
}

/**
 * The commands that configure an interface already created, in order: addresses, keys and peers,
 * the link up, then per family the table's routes, its unreachable default and the rule. Pure, so
 * the plan is tested without running anything.
 */
export function routingPlan(spec: TunnelSpec): Command[] {
  const plan: Command[] = spec.addresses.map((a) => ops.addressAdd(a))
  plan.push(ops.privateKey(spec.privateKey))
  for (const peer of spec.peers)
    plan.push(
      ops.peer({
        publicKey: peer.publicKey,
        presharedKey: peer.presharedKey,
        endpoint: peer.endpoint,
        allowedIps: peer.allowedIps,
        keepalive: peer.persistentKeepalive ?? KEEPALIVE_SECONDS,
      }),
    )
  plan.push(ops.linkUp(spec.mtu ?? DEFAULT_MTU))
  const addresses = tunnelAddresses(spec)
  for (const family of [4, 6] as const) {
    const own = family === 4 ? addresses.ipv4 : addresses.ipv6
    if (!own) continue
    const routes = new Set(
      spec.peers
        .flatMap((p) => p.allowedIps)
        .map((a) => cidrArg(a))
        .filter((a) => a.family === family)
        .map((a) => a.cidr),
    )
    for (const r of routes) plan.push(ops.routeAdd(r))
    plan.push(ops.routeUnreachable(family), ops.ruleAdd(own))
  }
  return plan
}

/** Everything highsea added, removed in reverse. Each step may find nothing to remove. */
export function teardownPlan(): Command[] {
  return [
    ops.ruleDelete(4),
    ops.ruleDelete(6),
    ops.routeFlush(4),
    ops.routeFlush(6),
    ops.linkDelete(),
  ]
}

/** Why the tunnel couldn't come up, for the status's copy. */
export type TunnelFailure =
  | { kind: 'capability' }
  /** No /dev/net/tun in the container. */
  | { kind: 'no-device' }
  /** /dev/net/tun is there, but the host hasn't loaded the tun module behind it. */
  | { kind: 'no-module' }
  /** /dev/net/tun is there, but highsea isn't allowed to open it. */
  | { kind: 'device-denied' }
  | { kind: 'not-installed' }
  | { kind: 'platform' }
  | { kind: 'other'; message: string }

export class TunnelError extends Error {
  readonly failure: TunnelFailure
  constructor(failure: TunnelFailure, message: string) {
    super(message)
    this.name = 'TunnelError'
    this.failure = failure
  }
}

/**
 * What wireguard-go's failure to start means, from its own words (`wireguardGoOutput`). Called
 * once the kernel has answered "Unknown device type", so highsea has NET_ADMIN (without it the
 * kernel refuses first, with "Operation not permitted"), and what's left is the TUN device. From
 * wireguard-go's tun/tun_linux.go, `CreateTUN`, which opens /dev/net/tun and asks for an interface
 * with TUNSETIFF:
 * - "/dev/net/tun does not exist" (its own words for ENOENT): no device node;
 * - "no such device" (ENODEV): the node is there, but no driver answers for 10:200, so the host
 *   hasn't loaded tun (the kernel's misc devices: drivers/char/misc.c, misc_open);
 * - "permission denied" (EACCES): the node's mode doesn't let highsea's user open it (open(2));
 *   "operation not permitted" (EPERM): the container's device cgroup doesn't allow 10:200
 *   (https://docs.kernel.org/admin-guide/cgroup-v1/devices.html).
 * Anything else is passed on in wireguard-go's words (ADR 0042, 2026-11-19, HT-98).
 */
export function wireguardGoFailure(said: string): TunnelFailure {
  // only its "Failed to create TUN device" line is the device: "UAPI listen error: permission
  // denied", say, is its control socket
  const tun = /Failed to create TUN device: (.*)/i.exec(said)?.[1] ?? ''
  if (/does not exist|no such file or directory/i.test(tun)) return { kind: 'no-device' }
  if (/no such device(?! or)/i.test(tun)) return { kind: 'no-module' }
  if (/permission denied|operation not permitted/i.test(tun)) return { kind: 'device-denied' }
  return { kind: 'other', message: `start wireguard-go failed: ${said}` }
}

function asTunnelError(e: unknown): TunnelError {
  if (e instanceof TunnelError) return e
  if (e instanceof CommandFailed) {
    const failure: TunnelFailure =
      e.kind === 'permission'
        ? { kind: 'capability' }
        : e.kind === 'not-installed'
          ? { kind: 'not-installed' }
          : e.kind === 'platform'
            ? { kind: 'platform' }
            : { kind: 'other', message: e.message }
    return new TunnelError(failure, e.message)
  }
  return new TunnelError({ kind: 'other', message: (e as Error).message }, (e as Error).message)
}

export type Tunnel = ReturnType<typeof createTunnel>

export function createTunnel(runner: Runner) {
  /** Removes whatever an earlier run left: a crash, or a restart without a clean stop. */
  async function teardown() {
    for (const cmd of teardownPlan()) {
      try {
        await run(runner, cmd)
      } catch (e) {
        // nothing to remove is the usual answer; anything else surfaces when bringing it up
        if (e instanceof CommandFailed && e.kind === 'platform') return
      }
    }
  }

  /** Creates the interface: kernel WireGuard first, then wireguard-go. */
  async function create(): Promise<'kernel' | 'userspace'> {
    try {
      await run(runner, ops.linkAddKernel())
      return 'kernel'
    } catch (e) {
      if (!(e instanceof CommandFailed) || e.kind !== 'unsupported') throw asTunnelError(e)
    }
    try {
      await run(runner, ops.linkAddUserspace())
      return 'userspace'
    } catch (e) {
      if (e instanceof CommandFailed && e.kind !== 'platform' && e.kind !== 'not-installed')
        throw new TunnelError(wireguardGoFailure(e.stderr), e.message)
      throw asTunnelError(e)
    }
  }

  return {
    teardown,
    /** Tears down what's left, then builds the tunnel. Throws a `TunnelError`. */
    async up(spec: TunnelSpec): Promise<'kernel' | 'userspace'> {
      // every value is checked here, before any command runs
      let plan: Command[]
      try {
        plan = routingPlan(spec)
      } catch (e) {
        throw asTunnelError(e)
      }
      await teardown()
      const kind = await create()
      try {
        for (const cmd of plan) await run(runner, cmd)
      } catch (e) {
        await teardown()
        throw asTunnelError(e)
      }
      return kind
    },
    /** When each peer last shook hands, in seconds since the epoch (0 for never). */
    async handshakes(): Promise<Map<string, number>> {
      const out = new Map<string, number>()
      const text = await run(runner, ops.handshakes())
      for (const line of text.split('\n')) {
        const [key, at] = line.trim().split(/\s+/)
        if (key && at && /^\d+$/.test(at)) out.set(key, Number(at))
      }
      return out
    },
    /**
     * Whether the kill switch is in place for a family: the rule from the tunnel's address to the
     * table, and the table's unreachable default.
     */
    async killSwitch(family: Family, address: string): Promise<boolean> {
      const [rules, routes] = await Promise.all([
        run(runner, ops.ruleShow(family)),
        run(runner, ops.routeShow(family)),
      ])
      const rule = rules
        .split('\n')
        .some(
          (l) =>
            l.startsWith(`${TUNNEL_RULE_PRIORITY}:`) &&
            l.includes(`from ${address} `) &&
            new RegExp(`lookup ${TUNNEL_TABLE}\\b`).test(l),
        )
      const unreachable = routes.split('\n').some((l) => /^unreachable default\b/.test(l.trim()))
      return rule && unreachable
    },
    /** Puts the unreachable default and the rule back, after the kill switch check found one gone. */
    async restoreKillSwitch(family: Family, address: string) {
      for (const cmd of [
        ops.ruleDelete(family),
        ops.routeUnreachable(family),
        ops.ruleAdd(address),
      ])
        try {
          await run(runner, cmd)
        } catch (e) {
          if (!(e instanceof CommandFailed) || (e.kind !== 'exists' && e.kind !== 'missing'))
            throw asTunnelError(e)
        }
    },
  }
}
