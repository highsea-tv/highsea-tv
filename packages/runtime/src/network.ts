// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Network and what follows from it: the external URL, the trusted proxies, built-in
// TLS's certificate, and LAN discovery (UDP and mDNS, ADR 0020), restarted when the settings
// change. Also counts the clients with the event stream open, for the server card.
import { AppError, type Clock, type EventBus, type Logger } from '@highsea-tv/core'
import { type Db, readSetting, writeSetting } from '@highsea-tv/db'
import {
  ciaoResponder,
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
import type { Config } from './config.ts'

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
  responder = ciaoResponder,
  discovery = true,
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
  /** Tests turn the sockets off. */
  discovery?: boolean
}): NetworkService {
  const log = logger.child('network')
  const settings = () => readSetting(db, NETWORK_KEY, defaultNetworkSettings)
  let trusted = parseTrustedProxies(settings().trustedProxies).trusted
  let connected = 0
  let discoveryProblem: string | null = null
  const udp = createDiscoveryResponder({ port: config.discoveryPort, answer, logger: log })
  const mdns = createMdnsAdvertiser({ responder, logger: log })

  const service: NetworkService = {
    settings,
    save(input) {
      const next = writeSetting(db, NETWORK_KEY, checkNetwork(input), clock.now())
      trusted = parseTrustedProxies(next.trustedProxies).trusted
      events.emit({ topic: 'settings.updated', ids: ['network'] })
      events.emit({ topic: 'server.updated' })
      void service.startDiscovery()
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
