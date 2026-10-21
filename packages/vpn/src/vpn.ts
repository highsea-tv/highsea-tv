// SPDX-License-Identifier: AGPL-3.0-only
// VPN connections (docs/product/vpn.md, docs/plans/phase-3-checkpoint-6.md › VPN connections).
// Whatever the mode, this hands the torrent engine one binding through `onBinding`: an address and
// resolvers while torrents may leave, or null while they mustn't. Three modes:
//
// - highsea connects (6b): highsea brings up a WireGuard tunnel itself (tunnel.ts), from a
//   configuration file or PIA's API, and binds torrents to the tunnel's address, which the kernel
//   routes through the tunnel or nowhere. The tunnel is up once a handshake is seen (`wg show
//   latest-handshakes`, every 5 seconds); no handshake for 3 minutes is down (vpn.md › Checks), and
//   highsea tears the tunnel down and connects again, waiting longer after each try, up to
//   5 minutes. Here a check that finds a leak takes the binding away (judgement call 17): the exit
//   address being your own, names looked up outside the tunnel (no DNS line), or the routing rule
//   gone (put back at once, and failing only if it can't be). Port forwarding is asked for once
//   connected and renewed before it lapses; it failing only warns.
// - A VPN container: highsea shares gluetun's network, whose only route is the tunnel, so the
//   binding is "any address" while gluetun's control server reports the tunnel running, and null
//   otherwise. A stopped tunnel is restarted (PUT stopped, then running), with the same backoff.
// - An interface on this machine: the binding is the interface's IPv4 address, read with
//   `os.networkInterfaces()` every 2 seconds
//   (https://nodejs.org/docs/latest-v24.x/api/os.html#osnetworkinterfaces), and null while it's
//   gone.
//
// The checks run on connect, every 5 minutes, after a reconnect, and on Check now. The binding is
// handed over only once the first checks are done. In the container and interface modes no check
// takes it away: the container has no other route, and in the interface mode every socket is
// already bound to the tunnel's address, so a failing check only warns.
import os from 'node:os'
import {
  AppError,
  type Clock,
  type EventBus,
  type Fetch,
  type Logger,
  type Sealer,
} from '@highsea/core'
import type { Db } from '@highsea/db'
import { type Runner, spawnRunner } from './commands.ts'
import { type ComposeInput, composeFor } from './compose.ts'
import { checkCopy, failures, systemCopy, wireGuardFailures } from './copy.ts'
import { askEcho, askEchoFields, type Echo } from './echo.ts'
import { type BoundFetchOptions, boundFetch as defaultBoundFetch } from './fetch.ts'
import { createGluetun, GluetunError } from './gluetun.ts'
import { forwardWithNatPmp, type Mapping, type NatPmpOptions } from './natpmp.ts'
import {
  createPia,
  findRegion,
  PIA_BIND_EVERY_MS,
  type Pia,
  PiaError,
  type PiaForward,
  type PiaRegion,
} from './pia.ts'
import { findProvider, toApiProvider, type VpnProviderDefinition } from './providers.ts'
import {
  mergeSettings,
  openSecrets,
  readStored,
  type StoredVpnSettings,
  toPublic,
  writeStored,
} from './settings.ts'
import { buildStatus, initialRuntime, leaking, type VpnRuntime } from './status.ts'
import { createTunnel, TunnelError, type TunnelSpec, tunnelAddresses } from './tunnel.ts'
import type {
  VpnBinding,
  VpnInterface,
  VpnProvider,
  VpnSettings,
  VpnSettingsInput,
  VpnStatus,
} from './types.ts'
import { parseWireGuard, WireGuardError } from './wireguard.ts'

export const VPN_TIMINGS = {
  /** How often the interface mode looks for its address (the plan: every 2 seconds). */
  interfaceMs: 2_000,
  /** How often gluetun's control server is asked for the tunnel's state. */
  containerMs: 5_000,
  /** How often highsea connects reads the tunnel's latest handshake. */
  handshakeMs: 5_000,
  /** No handshake for this long is down (vpn.md › Checks: "No handshake for 3 minutes"). */
  handshakeTimeoutMs: 3 * 60_000,
  /** The checks' period (vpn.md › Checks). */
  checkMs: 5 * 60_000,
  /** The first reconnect's wait, doubled after each try. */
  backoffMs: 5_000,
  /** The longest wait between reconnects (vpn.md › States: "up to 5 minutes"). */
  backoffMaxMs: 5 * 60_000,
  /** Port forwarding asked again after a failure. */
  forwardRetryMs: 60_000,
  /** PIA's forwarded port is asked for again this long before it expires. */
  piaRenewBeforeMs: 24 * 60 * 60_000,
}

export type Timers = {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

const unref = (h: unknown) => {
  ;(h as { unref?: () => void }).unref?.()
  return h
}

const systemTimers: Timers = {
  setTimeout: (fn, ms) => unref(setTimeout(fn, ms)),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => unref(setInterval(fn, ms)),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
}

export type VpnDeps = {
  db: Db
  sealer: Sealer
  logger: Logger
  clock: Clock
  events: Pick<EventBus, 'emit'>
  /** The fetch seam: gluetun's control server, and the unbound half of the exit check. */
  fetch: Fetch
  /** A fetch leaving from an address: the bound half of the exit check, and indexers (V6). */
  boundFetch?: (localAddress: string, options?: BoundFetchOptions) => Fetch
  interfaces?: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>
  /** The catalog's `vpn-providers` entries (`@highsea/catalog`'s provider reader). */
  providers?: () => readonly VpnProviderDefinition[]
  /** Runs `ip` and `wg` for highsea connects; tests pass a fake that records each command. */
  runner?: Runner
  /** PIA's API; tests pass one over a fake transport. */
  pia?: Pia
  /** NAT-PMP's mapping; tests pass a fake gateway's. */
  natPmp?: (options: NatPmpOptions, lifetime: number, current: number | null) => Promise<Mapping>
  /** The torrent engine's `setBinding`: null stops every torrent's networking. */
  onBinding(binding: VpnBinding | null): void | Promise<void>
  /** A forwarded port, for the engine to listen on (`engine.setPort`). */
  onForwardedPort?(port: number | null): void
  /** The engine's listening port, for the interface mode's port forwarding row. */
  listeningPort(): number
  /** Peers that connected in, for the port forwarding row. */
  peersIn?(): number
  timers?: Timers
}

export type Vpn = ReturnType<typeof createVpn>

const sameBinding = (a: VpnBinding | null, b: VpnBinding | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.address === b.address &&
    a.address6 === b.address6 &&
    a.dns.join() === b.dns.join())

/** The interface's first IPv4 address, and its first IPv6 address that isn't link-local. */
function addressesOf(infos: os.NetworkInterfaceInfo[] | undefined) {
  const list = infos ?? []
  return {
    ipv4: list.find((i) => i.family === 'IPv4')?.address ?? null,
    ipv6: list.find((i) => i.family === 'IPv6' && !/^fe80:/i.test(i.address))?.address ?? null,
  }
}

/**
 * highsea connects carries IPv4 for now (judgement call in the 6b report): torrents bind to one
 * IPv4 address, and an IPv6 address on the interface would fail where Docker turns IPv6 off.
 */
function ipv4Only(spec: TunnelSpec): TunnelSpec {
  const v4 = (a: string) => !a.includes(':')
  return {
    ...spec,
    addresses: spec.addresses.filter(v4),
    peers: spec.peers
      .map((p) => ({ ...p, allowedIps: p.allowedIps.filter(v4) }))
      .filter((p) => p.allowedIps.length > 0),
  }
}

/** A running highsea connects tunnel. */
type Session = {
  address: string
  dns: string[]
  upAt: number
  provider: VpnProviderDefinition
  pia: {
    server: PiaRegion['server']
    token: string
    tokenAt: number
    forward: PiaForward | null
  } | null
}

export function createVpn(deps: VpnDeps) {
  const timers = deps.timers ?? systemTimers
  const readInterfaces = deps.interfaces ?? (() => os.networkInterfaces())
  const bound = deps.boundFetch ?? defaultBoundFetch
  const providerList = deps.providers ?? (() => [])
  const tunnel = createTunnel(deps.runner ?? spawnRunner())
  const pia = deps.pia ?? createPia()
  const natPmp = deps.natPmp ?? forwardWithNatPmp
  const log = deps.logger.child('vpn')

  let stored: StoredVpnSettings = readStored(deps.db)
  let rt: VpnRuntime = initialRuntime()
  /** What `onBinding` was last given; undefined before the first call. */
  let binding: VpnBinding | null | undefined
  /** Bumped by every apply and stop, so work started for old settings drops its answer. */
  let generation = 0
  let started = false
  let poller: unknown = null
  let checker: unknown = null
  let retry: unknown = null
  let forwarder: unknown = null
  let attempts = 0
  let polling = false
  let checking = false
  let lastForwarded: number | null | undefined
  /** highsea connects' tunnel, while it's up. */
  let session: Session | null = null
  /** Whether highsea may have left an interface behind, to take down. */
  let tunnelTouched = false
  // when the state last changed, for System's "since"
  let phaseSince = deps.clock.now()
  const inFlight = new Set<Promise<unknown>>()

  const track = <T>(p: Promise<T>) => {
    inFlight.add(p)
    p.finally(() => inFlight.delete(p)).catch(() => {})
    return p
  }

  const currentProvider = (s: StoredVpnSettings = stored) =>
    findProvider(providerList(), s.provider)

  function emit() {
    deps.events.emit({ topic: 'vpn.updated' })
  }

  function desired(): VpnBinding | null {
    if (stored.mode === 'off') return { address: null, dns: [] }
    if (rt.phase !== 'connected') return null
    if (stored.mode === 'container') return { address: null, dns: [] }
    if (stored.mode === 'interface' && rt.address)
      // IPv6 only when the tunnel has an address in it (6b)
      return { address: rt.address, ...(rt.ipv6 ? { address6: rt.ipv6 } : {}), dns: [] }
    if (stored.mode === 'builtin' && session && rt.address === session.address && !leaking(rt))
      return { address: session.address, dns: session.dns }
    return null
  }

  function sync() {
    const next = desired()
    if (binding !== undefined && sameBinding(binding, next)) return
    binding = next
    try {
      const r = deps.onBinding(next)
      if (r instanceof Promise)
        track(r).catch((e) => log.error('The binding failed', { error: (e as Error).message }))
    } catch (e) {
      log.error('The binding failed', { error: (e as Error).message })
    }
  }

  /** Changes the runtime, hands over the binding it implies, and says so if anything changed. */
  function update(patch: Partial<VpnRuntime>) {
    const before = JSON.stringify(rt)
    if (patch.phase && patch.phase !== rt.phase) phaseSince = deps.clock.now()
    rt = { ...rt, ...patch }
    sync()
    if (JSON.stringify(rt) !== before) emit()
  }

  function clearTimers() {
    if (poller !== null) timers.clearInterval(poller)
    if (checker !== null) timers.clearInterval(checker)
    if (retry !== null) timers.clearTimeout(retry)
    if (forwarder !== null) timers.clearTimeout(forwarder)
    poller = checker = retry = forwarder = null
  }

  const gluetun = (s: StoredVpnSettings = stored) =>
    createGluetun({
      url: s.containerUrl,
      apiKey: openSecrets(s, deps.sealer).containerKey ?? '',
      fetch: deps.fetch,
    })

  function setForwarded(port: number | null) {
    update({ forwardedPort: port, forwardFailed: false })
    if (port !== lastForwarded) {
      lastForwarded = port
      deps.onForwardedPort?.(port)
    }
  }

  // reconnecting, in the container mode and highsea connects

  function scheduleReconnect() {
    if (retry !== null) return
    const wait = Math.min(VPN_TIMINGS.backoffMs * 2 ** attempts, VPN_TIMINGS.backoffMaxMs)
    attempts++
    const g = generation
    retry = timers.setTimeout(() => {
      retry = null
      if (g !== generation) return
      log.info('Reconnecting', { attempt: attempts })
      if (stored.mode === 'container') track(restartContainer(g)).catch(() => {})
      else if (stored.mode === 'builtin') track(connectBuiltin(g)).catch(() => {})
    }, wait)
  }

  function lost(row: readonly [string, string], reconnect: boolean) {
    update({
      phase: 'down',
      down: row,
      exit: null,
      exitResult: null,
      forwardedPort: null,
      handshakeAt: null,
      names: null,
      killSwitch: null,
      forwardFailed: false,
    })
    if (reconnect) scheduleReconnect()
  }

  // the container mode

  async function restartContainer(g: number) {
    try {
      const gl = gluetun()
      await gl.setStatus('stopped')
      await gl.setStatus('running')
    } catch (e) {
      if (g === generation)
        log.warn('gluetun didn’t restart the tunnel', { error: (e as Error).message })
    }
    if (g === generation) await pollContainer()
  }

  async function pollContainer() {
    if (polling) return
    polling = true
    const g = generation
    const url = stored.containerUrl
    try {
      const state = await gluetun().status()
      if (g !== generation) return
      if (state === 'running') {
        if (rt.phase !== 'connected' && !checking) {
          if (rt.phase !== 'connecting') update({ phase: 'connecting', failure: null, down: null })
          await runChecks()
        }
      } else lost(checkCopy.containerDown, true)
    } catch (e) {
      if (g !== generation) return
      if (e instanceof GluetunError && e.kind === 'refused') {
        if (retry !== null) timers.clearTimeout(retry)
        retry = null
        update({ phase: 'failed', failure: failures.keyRefused(url), exit: null, exitResult: null })
      } else if (rt.phase === 'connected' || rt.phase === 'down')
        lost(checkCopy.containerGone(url), false)
      else update({ phase: 'failed', failure: failures.unreachable(url) })
    } finally {
      polling = false
    }
  }

  // the interface mode

  function pollInterface() {
    const { ipv4, ipv6 } = addressesOf(readInterfaces()[stored.interface])
    if (!ipv4) {
      if (rt.phase !== 'down') lost(checkCopy.interfaceDown(stored.interface), false)
      return
    }
    if (rt.phase === 'connected' && rt.address === ipv4) {
      if (rt.ipv6 !== ipv6) update({ ipv6 })
      return
    }
    if (checking) return
    // a new address, or the interface is back: check again before torrents use it
    update({ phase: 'connecting', address: ipv4, ipv6, down: null, failure: null })
    track(runChecks()).catch(() => {})
  }

  // highsea connects

  function failBuiltin(message: string, retryLater = false) {
    update({ phase: 'failed', failure: message, exit: null, exitResult: null })
    if (retryLater) scheduleReconnect()
  }

  /** Takes the tunnel down; the binding has already gone null. */
  async function closeTunnel() {
    session = null
    if (poller !== null) timers.clearInterval(poller)
    if (forwarder !== null) timers.clearTimeout(forwarder)
    poller = forwarder = null
    if (!tunnelTouched) return
    tunnelTouched = false
    try {
      await tunnel.teardown()
    } catch (e) {
      log.warn('Couldn’t take the tunnel down', { error: (e as Error).message })
    }
  }

  /** The tunnel to build, from the provider: a configuration file, or PIA's API. */
  async function prepare(
    s: StoredVpnSettings,
    provider: VpnProviderDefinition,
  ): Promise<{ spec: TunnelSpec; dns: string[]; pia: Session['pia'] }> {
    const secrets = openSecrets(s, deps.sealer)
    if (provider.connect === 'pia') {
      const token = await pia.token(s.piaUsername, secrets.piaPassword ?? '')
      const region = findRegion(await pia.regions(), s.piaRegion)
      if (!region) throw new WireGuardError(failures.piaRegion(s.piaRegion))
      const r = await pia.connect(region, token)
      return {
        spec: r.spec,
        dns: r.dns,
        pia: { server: r.server, token, tokenAt: deps.clock.now(), forward: null },
      }
    }
    if (!secrets.config) throw new WireGuardError(failures.upload(provider.name))
    const config = parseWireGuard(secrets.config)
    return {
      spec: {
        privateKey: config.privateKey,
        addresses: config.addresses,
        peers: config.peers,
        mtu: config.mtu,
      },
      dns: config.dns.filter((d) => !d.includes(':')),
      pia: null,
    }
  }

  async function connectBuiltin(g: number) {
    const s = stored
    const provider = currentProvider(s)
    if (!provider) return failBuiltin(failures.provider)
    if (rt.phase !== 'connecting') update({ phase: 'connecting', down: null, failure: null })
    await closeTunnel()
    if (g !== generation) return
    let prepared: Awaited<ReturnType<typeof prepare>>
    try {
      prepared = await prepare(s, provider)
    } catch (e) {
      if (g !== generation) return
      if (e instanceof PiaError && e.kind === 'refused') return failBuiltin(failures.piaRefused)
      if (e instanceof WireGuardError) return failBuiltin(e.message)
      log.warn('Couldn’t reach the provider', { error: (e as Error).message })
      return lost(checkCopy.providerUnreachable(provider.name), true)
    }
    const spec = ipv4Only(prepared.spec)
    const address = tunnelAddresses(spec).ipv4
    if (!address) return failBuiltin(failures.noAddress)
    if (!spec.peers.length) return failBuiltin(wireGuardFailures.noPeer)
    if (spec.peers.some((p) => !p.endpoint)) return failBuiltin(failures.noEndpoint)
    try {
      tunnelTouched = true
      const kind = await tunnel.up(spec)
      log.info('The tunnel is up', { wireguard: kind })
    } catch (e) {
      if (g !== generation) return
      const f =
        e instanceof TunnelError ? e.failure : { kind: 'other' as const, message: String(e) }
      log.warn('Couldn’t bring the tunnel up', { error: (e as Error).message })
      if (f.kind === 'capability') return failBuiltin(failures.needsCapability)
      if (f.kind === 'platform') return failBuiltin(failures.linuxOnly)
      if (f.kind === 'no-device') return failBuiltin(failures.noDevice)
      if (f.kind === 'not-installed') return failBuiltin(failures.notInstalled)
      return failBuiltin(failures.tunnelFailed((e as Error).message), true)
    }
    if (g !== generation) {
      await tunnel.teardown().catch(() => {})
      return
    }
    session = {
      address,
      dns: prepared.dns,
      upAt: deps.clock.now(),
      provider,
      pia: prepared.pia,
    }
    update({ address, ipv6: null })
    poller = timers.setInterval(() => track(pollHandshake(g)), VPN_TIMINGS.handshakeMs)
    await pollHandshake(g)
  }

  async function pollHandshake(g: number) {
    const sess = session
    if (!sess || polling) return
    polling = true
    try {
      const shakes = await tunnel.handshakes()
      if (g !== generation || session !== sess) return
      const latest = Math.max(0, ...shakes.values()) * 1000
      const now = deps.clock.now()
      if (latest > 0 && now - latest < VPN_TIMINGS.handshakeTimeoutMs) {
        if (rt.phase === 'connected') {
          if (rt.handshakeAt !== latest) update({ handshakeAt: latest })
        } else if (!checking) {
          update({ handshakeAt: latest })
          polling = false
          await runChecks()
        }
      } else if (now - Math.max(latest, sess.upAt) >= VPN_TIMINGS.handshakeTimeoutMs)
        await dropTunnel(g, checkCopy.noHandshake)
    } catch (e) {
      if (g !== generation) return
      // the interface went away under highsea
      log.warn('Couldn’t read the tunnel’s handshakes', { error: (e as Error).message })
      await dropTunnel(g, checkCopy.noHandshake)
    } finally {
      polling = false
    }
  }

  async function dropTunnel(g: number, row: readonly [string, string]) {
    lost(row, false)
    await closeTunnel()
    if (g === generation) scheduleReconnect()
  }

  /** The kill switch, put back at once if it's gone; false only when it can't be. */
  async function killSwitchHolds(address: string): Promise<boolean> {
    try {
      if (await tunnel.killSwitch(4, address)) return true
      log.warn('The routing rule is missing; putting it back')
      await tunnel.restoreKillSwitch(4, address)
      return await tunnel.killSwitch(4, address)
    } catch (e) {
      log.warn('Couldn’t check the routing rule', { error: (e as Error).message })
      return false
    }
  }

  async function builtinExit(s: StoredVpnSettings, sess: Session): Promise<Partial<VpnRuntime>> {
    const own = sess.provider.check
    const [through, outside] = await Promise.allSettled([
      askEchoFields(bound(sess.address, { dns: sess.dns }), own?.url ?? s.echoUrl),
      askEcho(deps.fetch, s.echoUrl),
    ])
    if (through.status === 'rejected') {
      log.warn('The exit check’s echo service didn’t answer', { error: String(through.reason) })
      return { exit: null, exitResult: 'unknown' }
    }
    const exit = { ip: through.value.ip, country: through.value.country }
    if (own && through.value.fields[own.field] === false) {
      log.warn('The provider says the exit isn’t theirs', { ip: exit.ip })
      return { exit, exitResult: 'not-provider' }
    }
    if (outside.status === 'rejected') return { exit, exitResult: 'own-unknown' }
    if (outside.value.ip === exit.ip) {
      log.warn('The exit address is your own', { ip: exit.ip })
      return { exit, exitResult: 'own' }
    }
    return { exit, exitResult: 'pass' }
  }

  function scheduleForward(ms: number) {
    if (forwarder !== null) timers.clearTimeout(forwarder)
    const g = generation
    forwarder = timers.setTimeout(() => {
      forwarder = null
      if (g === generation) track(forward(g)).catch(() => {})
    }, ms)
  }

  /** Asks for the forwarded port, or renews it, then plans the next time. */
  async function forward(g: number) {
    const sess = session
    const s = stored
    if (!sess || !s.useForwardedPort) return
    const pf = sess.provider.portForwarding
    try {
      if (pf.method === 'static') return setForwarded(s.staticPort)
      if (pf.method === 'none') return
      if (pf.method === 'natpmp') {
        const m = await natPmp(
          { gateway: pf.gateway, localAddress: sess.address },
          pf.lifetimeSeconds,
          rt.forwardedPort,
        )
        if (g !== generation || session !== sess) return
        setForwarded(m.externalPort)
        scheduleForward(pf.renewSeconds * 1000)
      } else if (pf.method === 'pia' && sess.pia) {
        const p = sess.pia
        const now = deps.clock.now()
        if (!p.forward || p.forward.expiresAt - now < VPN_TIMINGS.piaRenewBeforeMs) {
          // a token lasts 24 hours (get_token.sh); the one from connecting is used while fresh
          if (now - p.tokenAt > 23 * 60 * 60_000) {
            p.token = await pia.token(s.piaUsername, openSecrets(s, deps.sealer).piaPassword ?? '')
            p.tokenAt = now
          }
          p.forward = await pia.signature(p.server, p.token, sess.address)
        }
        await pia.bind(p.server, p.forward, sess.address)
        if (g !== generation || session !== sess) return
        setForwarded(p.forward.port)
        scheduleForward(PIA_BIND_EVERY_MS)
      }
    } catch (e) {
      if (g !== generation || session !== sess) return
      log.warn('Port forwarding failed', { error: (e as Error).message })
      update({ forwardFailed: true })
      scheduleForward(VPN_TIMINGS.forwardRetryMs)
    }
  }

  // the checks

  async function exitCheck(s: StoredVpnSettings, address: string): Promise<Partial<VpnRuntime>> {
    const [through, own] = await Promise.allSettled([
      askEcho(bound(address), s.echoUrl),
      askEcho(deps.fetch, s.echoUrl),
    ])
    if (through.status === 'rejected') {
      log.warn('The exit check’s echo service didn’t answer', { error: String(through.reason) })
      return { exit: null, exitResult: 'unknown' }
    }
    const exit: Echo = through.value
    if (own.status === 'rejected') return { exit, exitResult: 'own-unknown' }
    if (own.value.ip === exit.ip) {
      log.warn('Both exit answers came from the same address', { ip: exit.ip })
      return { exit, exitResult: 'same' }
    }
    return { exit, exitResult: 'pass' }
  }

  async function runChecks() {
    if (checking) return
    checking = true
    const g = generation
    const s = stored
    const sess = session
    const firstConnect = rt.phase !== 'connected'
    try {
      let patch: Partial<VpnRuntime> = {}
      if (s.mode === 'container') {
        const gl = gluetun(s)
        const [ip, port] = await Promise.allSettled([
          gl.publicIp(),
          s.useForwardedPort ? gl.forwardedPort() : Promise.resolve(null),
        ])
        const exit =
          ip.status === 'fulfilled' && ip.value.ip
            ? { ip: ip.value.ip, country: ip.value.country }
            : null
        patch = {
          exit,
          exitResult: exit ? 'pass' : 'unknown',
          forwardedPort: port.status === 'fulfilled' ? port.value : null,
        }
      } else if (s.mode === 'interface' && rt.address) patch = await exitCheck(s, rt.address)
      else if (s.mode === 'builtin' && sess) {
        const [killSwitch, exit] = await Promise.all([
          killSwitchHolds(sess.address),
          builtinExit(s, sess),
        ])
        patch = { ...exit, killSwitch, names: sess.dns.length > 0 }
      } else return
      if (g !== generation || session !== sess) return
      attempts = 0
      update({
        ...patch,
        phase: 'connected',
        down: null,
        failure: null,
        checkedAt: deps.clock.now(),
      })
      if (leaking(rt)) log.warn('A check found a leak; torrents are stopped')
      const port = rt.forwardedPort
      if (s.mode === 'container' && port !== lastForwarded) {
        lastForwarded = port
        deps.onForwardedPort?.(port)
      }
      if (s.mode === 'builtin' && firstConnect) track(forward(g)).catch(() => {})
      if (checker === null)
        checker = timers.setInterval(() => {
          if (rt.phase === 'connected') track(runChecks()).catch(() => {})
        }, VPN_TIMINGS.checkMs)
    } finally {
      checking = false
    }
  }

  // the modes

  function apply() {
    generation++
    const g = generation
    clearTimers()
    attempts = 0
    polling = checking = false
    rt = initialRuntime()
    // the old tunnel goes before anything new starts
    const closing = closeTunnel()
    if (stored.mode === 'off') update({ phase: 'off' })
    else if (stored.mode === 'builtin') {
      update({ phase: 'connecting' })
      track(closing.then(() => (g === generation ? connectBuiltin(g) : undefined))).catch(() => {})
    } else if (stored.mode === 'container') {
      update({ phase: 'connecting' })
      poller = timers.setInterval(() => track(pollContainer()), VPN_TIMINGS.containerMs)
      track(pollContainer())
    } else {
      update({ phase: 'connecting' })
      poller = timers.setInterval(pollInterface, VPN_TIMINGS.interfaceMs)
      pollInterface()
    }
    emit()
  }

  function status(): VpnStatus {
    return buildStatus(
      stored,
      rt,
      currentProvider(),
      deps.listeningPort(),
      deps.peersIn?.() ?? 0,
      deps.clock.now(),
    )
  }

  /**
   * The fetch indexer searches and .torrent downloads use (answer V6). With the switch off, or in
   * the container mode (whose only route is the tunnel already), it's the outside fetch. Otherwise
   * it leaves from the tunnel's address, and fails while there's no binding rather than going
   * around the tunnel.
   */
  const indexerFetch: Fetch = (input, init) => {
    const s = stored
    if (!s.indexersThroughVpn || s.mode === 'off' || s.mode === 'container')
      return deps.fetch(input, init)
    const b = binding
    if (!b?.address) return Promise.reject(new Error(systemCopy.indexersWaiting))
    return bound(b.address, { dns: b.dns })(input, init)
  }

  return {
    /** Reads the settings and starts the mode they name. */
    start() {
      started = true
      stored = readStored(deps.db)
      apply()
    },
    /** Stops, and takes highsea connects' tunnel down. */
    async stop() {
      started = false
      generation++
      clearTimers()
      await closeTunnel()
    },
    status,
    /**
     * System's health checks (docs/product/vpn.md › Elsewhere): the VPN down or failed, a check
     * that fails, and port forwarding failing in highsea connects (a warning).
     */
    issues(): { id: string; level: 'warning' | 'error'; message: string; since: number }[] {
      const s = status()
      if (s.state === 'down')
        return [{ id: 'vpn-down', level: 'error', message: systemCopy.down, since: phaseSince }]
      if (s.state === 'failed')
        return [
          {
            id: 'vpn-failed',
            level: 'error',
            message: systemCopy.failed(s.message),
            since: phaseSince,
          },
        ]
      const since = s.checkedAt ? Date.parse(s.checkedAt) : phaseSince
      const out: { id: string; level: 'warning' | 'error'; message: string; since: number }[] =
        s.checks
          .filter((c) => c.result === 'fail')
          .map((c) => ({
            id: `vpn-${c.id}`,
            level: 'error' as const,
            message: systemCopy.check(c.title),
            since,
          }))
      if (stored.mode === 'builtin' && rt.forwardFailed && stored.useForwardedPort)
        out.push({
          id: 'vpn-portForwarding',
          level: 'warning' as const,
          message: systemCopy.forwarding(s.provider ?? 'The provider'),
          since,
        })
      return out
    },
    /** The binding last handed to the engine; undefined before `start`. */
    binding: () => binding,
    indexerFetch,
    settings(): VpnSettings {
      return toPublic(stored)
    },
    /** The providers, in the API's shape. */
    providers(): VpnProvider[] {
      return providerList().map(toApiProvider)
    },
    provider: (id: string) => findProvider(providerList(), id),
    /**
     * Checks and saves Settings › VPN, then reconnects with them. The container mode's key and
     * address are tried against gluetun first, and PIA's username and password against PIA, as the
     * prototype's form does.
     */
    async save(input: VpnSettingsInput): Promise<VpnSettings> {
      const next = mergeSettings(stored, input, deps.sealer, providerList())
      if (next.mode === 'container') {
        try {
          await gluetun(next).status()
        } catch (e) {
          if (!(e instanceof GluetunError)) throw e
          throw e.kind === 'refused'
            ? new AppError('invalid', failures.keyRefused(next.containerUrl), {
                field: 'containerKey',
              })
            : new AppError('invalid', failures.unreachable(next.containerUrl), {
                field: 'containerUrl',
              })
        }
      }
      const changedAccount =
        (input.piaPassword !== undefined && input.piaPassword !== '') ||
        (input.piaUsername !== undefined && input.piaUsername.trim() !== stored.piaUsername)
      if (next.mode === 'builtin' && currentProvider(next)?.connect === 'pia' && changedAccount) {
        try {
          await pia.token(next.piaUsername, openSecrets(next, deps.sealer).piaPassword ?? '')
        } catch (e) {
          // a refusal is the owner's to fix; PIA out of reach is tried again when connecting
          if (e instanceof PiaError && e.kind === 'refused')
            throw new AppError('invalid', failures.piaRefused, { field: 'piaPassword' })
        }
      }
      stored = writeStored(deps.db, next, deps.clock.now())
      if (started) apply()
      else emit()
      return toPublic(stored)
    },
    /** Check now: the checks when connected, else another look at the tunnel. */
    async check(): Promise<VpnStatus> {
      if (rt.phase === 'connected') await track(runChecks())
      else if (stored.mode === 'container') await track(pollContainer())
      else if (stored.mode === 'interface') pollInterface()
      else if (stored.mode === 'builtin' && session) await track(pollHandshake(generation))
      await Promise.allSettled([...inFlight])
      return status()
    },
    /** Restarts the tunnel (highsea's or gluetun's), or looks at the interface again. */
    async reconnect(): Promise<VpnStatus> {
      if (stored.mode === 'container') {
        update({ phase: 'connecting', exit: null, exitResult: null })
        await track(restartContainer(generation))
      } else if (stored.mode === 'interface') {
        update({ phase: 'connecting', address: null })
        pollInterface()
      } else if (stored.mode === 'builtin') {
        if (retry !== null) timers.clearTimeout(retry)
        retry = null
        attempts = 0
        update({ phase: 'connecting', exit: null, exitResult: null, address: null })
        await track(connectBuiltin(generation))
      }
      await Promise.allSettled([...inFlight])
      return status()
    },
    /** The interfaces the owner can pick, without loopback. */
    interfaces(): VpnInterface[] {
      return Object.entries(readInterfaces())
        .filter(([, infos]) => infos?.length && !infos.every((i) => i.internal))
        .map(([name, infos]) => ({ name, ...addressesOf(infos) }))
    },
    compose(input: ComposeInput): string {
      return composeFor(input)
    },
    /** Resolves once the work started so far has finished; for tests on fake timers. */
    async settled() {
      while (inFlight.size) await Promise.allSettled([...inFlight])
    },
  }
}
