// SPDX-License-Identifier: AGPL-3.0-only
// VPN connections (docs/product/vpn.md, docs/plans/phase-3-checkpoint-6.md › VPN connections).
// Whatever the mode, this hands the torrent engine one binding through `onBinding`: an address and
// resolvers while torrents may leave, or null while they mustn't. 6a runs two modes:
//
// - A VPN container: highsea shares gluetun's network, whose only route is the tunnel, so the
//   binding is "any address" while gluetun's control server reports the tunnel running, and null
//   otherwise. A stopped tunnel is restarted (PUT stopped, then running), waiting longer after each
//   try, up to 5 minutes (vpn.md › States).
// - An interface on this machine: the binding is the interface's IPv4 address, read with
//   `os.networkInterfaces()` every 2 seconds
//   (https://nodejs.org/docs/latest-v24.x/api/os.html#osnetworkinterfaces), and null while it's
//   gone.
//
// The checks run on connect, every 5 minutes, after a reconnect, and on Check now. The binding is
// handed over only once the first checks are done. In these two modes no check takes it away:
// the container has no other route, and in the interface mode every socket is already bound to the
// tunnel's address, so the binding is the kill switch. A failing check only warns.
// (Matching exit answers in the interface mode usually mean the whole host uses the VPN.)
// highsea connects (the built-in tunnel) is 6b's (answer V1): it saves, and says so.
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
import { type ComposeInput, composeFor } from './compose.ts'
import { checkCopy, failures, systemCopy } from './copy.ts'
import { askEcho, boundFetch as defaultBoundFetch, type Echo } from './echo.ts'
import { createGluetun, GluetunError } from './gluetun.ts'
import {
  mergeSettings,
  openSecrets,
  readStored,
  type StoredVpnSettings,
  toPublic,
  writeStored,
} from './settings.ts'
import { buildStatus, initialRuntime, type VpnRuntime } from './status.ts'
import type { VpnBinding, VpnInterface, VpnSettings, VpnSettingsInput, VpnStatus } from './types.ts'

export const VPN_TIMINGS = {
  /** How often the interface mode looks for its address (the plan: every 2 seconds). */
  interfaceMs: 2_000,
  /** How often gluetun's control server is asked for the tunnel's state. */
  containerMs: 5_000,
  /** The checks' period (vpn.md › Checks). */
  checkMs: 5 * 60_000,
  /** The first reconnect's wait, doubled after each try. */
  backoffMs: 5_000,
  /** The longest wait between reconnects (vpn.md › States: "up to 5 minutes"). */
  backoffMaxMs: 5 * 60_000,
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
  /** A fetch leaving from an address: the bound half of the exit check. */
  boundFetch?: (localAddress: string) => Fetch
  interfaces?: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>
  /** The torrent engine's `setBinding`: null stops every torrent's networking. */
  onBinding(binding: VpnBinding | null): void | Promise<void>
  /** gluetun's forwarded port, for the engine to listen on (6b wires it). */
  onForwardedPort?(port: number | null): void
  /** The engine's listening port, for the interface mode's port forwarding row. */
  listeningPort(): number
  /** Peers that connected in, for the port forwarding row. */
  peersIn?(): number
  timers?: Timers
}

export type Vpn = ReturnType<typeof createVpn>

const sameBinding = (a: VpnBinding | null, b: VpnBinding | null) =>
  a === b || (a !== null && b !== null && a.address === b.address && a.dns.join() === b.dns.join())

/** The interface's first IPv4 address, and its first IPv6 address that isn't link-local. */
function addressesOf(infos: os.NetworkInterfaceInfo[] | undefined) {
  const list = infos ?? []
  return {
    ipv4: list.find((i) => i.family === 'IPv4')?.address ?? null,
    ipv6: list.find((i) => i.family === 'IPv6' && !/^fe80:/i.test(i.address))?.address ?? null,
  }
}

export function createVpn(deps: VpnDeps) {
  const timers = deps.timers ?? systemTimers
  const readInterfaces = deps.interfaces ?? (() => os.networkInterfaces())
  const bound = deps.boundFetch ?? defaultBoundFetch
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
  let attempts = 0
  let polling = false
  let checking = false
  let lastForwarded: number | null | undefined
  // when the state last changed, for System's "since"
  let phaseSince = deps.clock.now()
  const inFlight = new Set<Promise<unknown>>()

  const track = <T>(p: Promise<T>) => {
    inFlight.add(p)
    p.finally(() => inFlight.delete(p)).catch(() => {})
    return p
  }

  function emit() {
    deps.events.emit({ topic: 'vpn.updated' })
  }

  function desired(): VpnBinding | null {
    if (stored.mode === 'off') return { address: null, dns: [] }
    if (rt.phase !== 'connected') return null
    if (stored.mode === 'container') return { address: null, dns: [] }
    if (stored.mode === 'interface' && rt.address) return { address: rt.address, dns: [] }
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
    poller = checker = retry = null
  }

  const gluetun = (s: StoredVpnSettings = stored) =>
    createGluetun({
      url: s.containerUrl,
      apiKey: openSecrets(s, deps.sealer).containerKey ?? '',
      fetch: deps.fetch,
    })

  // the container mode

  function scheduleReconnect() {
    if (retry !== null) return
    const wait = Math.min(VPN_TIMINGS.backoffMs * 2 ** attempts, VPN_TIMINGS.backoffMaxMs)
    attempts++
    const g = generation
    retry = timers.setTimeout(() => {
      retry = null
      if (g !== generation) return
      log.info('Restarting the tunnel', { attempt: attempts })
      track(restartContainer(g)).catch(() => {})
    }, wait)
  }

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

  function lost(row: readonly [string, string], reconnect: boolean) {
    update({ phase: 'down', down: row, exit: null, exitResult: null, forwardedPort: null })
    if (reconnect) scheduleReconnect()
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
      else return
      if (g !== generation) return
      attempts = 0
      update({
        ...patch,
        phase: 'connected',
        down: null,
        failure: null,
        checkedAt: deps.clock.now(),
      })
      const port = rt.forwardedPort
      if (s.mode === 'container' && port !== lastForwarded) {
        lastForwarded = port
        deps.onForwardedPort?.(port)
      }
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
    clearTimers()
    attempts = 0
    polling = checking = false
    rt = initialRuntime()
    if (stored.mode === 'off') update({ phase: 'off' })
    else if (stored.mode === 'builtin') update({ phase: 'failed', failure: failures.builtinLater })
    else if (stored.mode === 'container') {
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
    return buildStatus(stored, rt, deps.listeningPort(), deps.peersIn?.() ?? 0)
  }

  return {
    /** Reads the settings and starts the mode they name. */
    start() {
      started = true
      stored = readStored(deps.db)
      apply()
    },
    stop() {
      started = false
      generation++
      clearTimers()
    },
    status,
    /**
     * System's health checks (docs/product/vpn.md › Elsewhere): the VPN down or failed, and a
     * check that fails. Port forwarding failing joins them with 6b.
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
      return s.checks
        .filter((c) => c.result === 'fail')
        .map((c) => ({
          id: `vpn-${c.id}`,
          level: 'error' as const,
          message: systemCopy.check(c.title),
          since: s.checkedAt ? Date.parse(s.checkedAt) : phaseSince,
        }))
    },
    /** The binding last handed) to the engine; undefined before `start`. */
    binding: () => binding,
    settings(): VpnSettings {
      return toPublic(stored)
    },
    /**
     * Checks and saves Settings › VPN, then reconnects with them. The container mode's key and
     * address are tried against gluetun first, as the prototype's form does.
     */
    async save(input: VpnSettingsInput): Promise<VpnSettings> {
      const next = mergeSettings(stored, input, deps.sealer)
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
      await Promise.allSettled([...inFlight])
      return status()
    },
    /** Restarts gluetun's tunnel, or looks at the interface again. */
    async reconnect(): Promise<VpnStatus> {
      if (stored.mode === 'container') {
        update({ phase: 'connecting', exit: null, exitResult: null })
        await track(restartContainer(generation))
      } else if (stored.mode === 'interface') {
        update({ phase: 'connecting', address: null })
        pollInterface()
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
