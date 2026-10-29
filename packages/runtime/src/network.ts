// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Network and what follows from it: the external URL, the trusted proxies, built-in
// TLS's certificate, and LAN discovery (UDP and mDNS, ADR 0020), restarted when the settings
// change. Also counts the clients with the event stream open, for the server card. Since 4.3c,
// remote access by a forwarded port asks the router to forward it, with NAT-PMP or UPnP through
// the torrent engine's port mapper, only once the owner has chosen it (install-simplicity.md,
// answer 10); Health says whether the router did.
import dgram from 'node:dgram'
import { AppError, type Clock, type EventBus, type Logger } from '@highsea-tv/core'
import { type Db, readSetting, writeSetting } from '@highsea-tv/db'
import {
  chooseResponder,
  createDiscoveryResponder,
  createMdnsAdvertiser,
  defaultNetworkSettings,
  loadCertificate,
  type MdnsResponder,
  NETWORK_KEY,
  type NetworkSettings,
  parseTrustedProxies,
  type TrustedProxies,
} from '@highsea-tv/network'
import { createPortMapper } from '@highsea-tv/torrent'
import type { Config } from './config.ts'

/** What the router did with remote access's port: still asking, forwarding it, or not. */
export type RouterMapping = {
  port: number
  state: 'trying' | 'open' | 'failed'
  via: 'nat-pmp' | 'upnp' | null
}

/** The part of the torrent engine's port mapper this uses; tests pass a fake. */
export type PortMapper = Pick<ReturnType<typeof createPortMapper>, 'start' | 'stop' | 'status'>

export type NetworkService = {
  settings(): NetworkSettings
  save(input: NetworkSettings): NetworkSettings
  /** The external URL from Settings, else HIGHSEA_PUBLIC_URL, else null. */
  externalUrl(): string | null
  trusted(): TrustedProxies
  /** Built-in TLS's problem, when it's on and can't serve. */
  tlsProblem(): string | null
  /** Discovery's problem, when it's on and couldn't start (the port's taken). */
  discoveryProblem(): string | null
  startDiscovery(): Promise<void>
  stopDiscovery(): Promise<void>
  /** The router's forwarding of the HTTPS port, when remote access is by a forwarded port. */
  router(): RouterMapping | null
  /** Asks the router for the HTTPS port, or lets it go, to match the settings. */
  applyRouter(): Promise<void>
  /** Discovery and the router's mapping, stopped on shutdown. */
  close(): Promise<void>
  /** Counts an open event stream; call the result when it closes. */
  connect(): () => void
  clientsConnected(): number
}

const URL_PROBLEM = 'Enter the full address, starting with https://'

/** Checks and normalizes the settings: the URL without a trailing slash, valid proxies. */
export function checkNetwork(input: NetworkSettings): NetworkSettings {
  const externalUrl = input.externalUrl.trim().replace(/\/+$/, '')
  if (externalUrl) {
    let url: URL | null = null
    try {
      url = new URL(externalUrl)
    } catch {}
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash)
      throw new AppError('invalid', URL_PROBLEM, { field: 'externalUrl' })
  }
  const { invalid } = parseTrustedProxies(input.trustedProxies)
  if (invalid.length)
    throw new AppError('invalid', `These aren’t addresses or ranges: ${invalid.join(', ')}.`, {
      field: 'trustedProxies',
    })
  if (!Number.isInteger(input.httpsPort) || input.httpsPort < 1024 || input.httpsPort > 65535)
    throw new AppError('invalid', 'Use a port from 1024 to 65535.', { field: 'httpsPort' })
  return { ...input, externalUrl, trustedProxies: input.trustedProxies.trim() }
}

export function createNetworkService({
  db,
  config,
  clock,
  events,
  logger,
  answer,
  mdnsInfo,
  responder = chooseResponder,
  discovery = true,
  portMapper,
}: {
  db: Db
  config: Config
  clock: Clock
  events: EventBus
  logger: Logger
  /** What discovery answers: the public info. */
  answer: () => object
  mdnsInfo: () => { name: string; id: string; version: string }
  responder?: () => Promise<MdnsResponder>
  /** Tests turn the sockets off, and with them the router's mapping. */
  discovery?: boolean
  /** The router's port mapper; tests pass a fake. */
  portMapper?: () => PortMapper
}): NetworkService {
  const log = logger.child('network')
  const settings = () => readSetting(db, NETWORK_KEY, defaultNetworkSettings)
  let trusted = parseTrustedProxies(settings().trustedProxies).trusted
  let connected = 0
  let discoveryProblem: string | null = null
  const udp = createDiscoveryResponder({ port: config.discoveryPort, answer, logger: log })
  const mdns = createMdnsAdvertiser({ responder, logger: log })

  // the router's mapping: one mapper per port asked for
  let mapper: PortMapper | null = null
  let router: RouterMapping | null = null
  const newMapper =
    portMapper ??
    (() =>
      createPortMapper({
        // NAT-PMP's requests from a socket of its own (RFC 6886 § 3.1: any source port)
        udp: () =>
          new Promise((done, fail) => {
            const socket = dgram.createSocket('udp4')
            socket.once('error', fail)
            socket.bind(0, () => done(socket))
          }),
        log: (level, message, fields) => log[level](message, fields),
        protocols: ['tcp'],
      }))
  const wantedPort = () => {
    const s = settings()
    return discovery && s.remoteAccess === 'port-forward' && s.tls === 'built-in'
      ? s.httpsPort
      : null
  }
  const stopRouter = async () => {
    const m = mapper
    mapper = null
    router = null
    await m?.stop()
  }

  const service: NetworkService = {
    settings,
    save(input) {
      const next = writeSetting(db, NETWORK_KEY, checkNetwork(input), clock.now())
      trusted = parseTrustedProxies(next.trustedProxies).trusted
      events.emit({ topic: 'settings.updated', ids: ['network'] })
      events.emit({ topic: 'server.updated' })
      void service.startDiscovery()
      void service.applyRouter()
      return next
    },
    externalUrl: () => settings().externalUrl || config.publicUrl?.replace(/\/+$/, '') || null,
    trusted: () => trusted,
    tlsProblem() {
      if (settings().tls !== 'built-in') return null
      const cert = loadCertificate(config.configDir)
      return cert.ok ? null : cert.problem
    },
    discoveryProblem: () => discoveryProblem,
    async startDiscovery() {
      await service.stopDiscovery()
      if (!discovery || !settings().discovery) return
      try {
        await udp.start()
        discoveryProblem = null
      } catch (e) {
        discoveryProblem = `Discovery couldn’t listen on UDP ${config.discoveryPort}: ${(e as Error).message}`
        log.warn(discoveryProblem)
      }
      await mdns.start({ ...mdnsInfo(), port: config.port })
    },
    async stopDiscovery() {
      await udp.stop()
      await mdns.stop()
    },
    router: () => router,
    async applyRouter() {
      const port = wantedPort()
      if (port === (router?.port ?? null)) return
      await stopRouter()
      if (port === null) return
      const m = newMapper()
      mapper = m
      router = { port, state: 'trying', via: null }
      await m.start(port)
      if (mapper !== m) return
      const status = m.status()
      router = { port, state: status ? 'open' : 'failed', via: status?.via ?? null }
      events.emit({ topic: 'health.updated' })
    },
    async close() {
      await service.stopDiscovery()
      await stopRouter()
    },
    connect() {
      connected++
      events.emit({ topic: 'server.updated' })
      let open = true
      return () => {
        if (!open) return
        open = false
        connected--
        events.emit({ topic: 'server.updated' })
      }
    },
    clientsConnected: () => connected,
  }
  return service
}
