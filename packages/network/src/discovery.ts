// SPDX-License-Identifier: AGPL-3.0-only
// LAN discovery (ADR 0020): a client broadcasts `highsea:discover:1` to UDP 7368; the server
// answers the sender with its public info as JSON. mDNS advertising is in mdns.ts.
import { createSocket, type Socket } from 'node:dgram'
import type { Logger } from '@highsea/core'

export const DISCOVERY_MESSAGE = 'highsea:discover:1'
export const DEFAULT_DISCOVERY_PORT = 7368

export type DiscoveryResponder = {
  start(): Promise<void>
  stop(): Promise<void>
  running(): boolean
  /** The bound port (useful when started on port 0 in tests). */
  port(): number | null
}

export function createDiscoveryResponder({
  port,
  host = '0.0.0.0',
  answer,
  logger,
}: {
  port: number
  host?: string
  /** The public info to send back; called for each request, so it's always current. */
  answer: () => object
  logger?: Logger
}): DiscoveryResponder {
  let socket: Socket | null = null
  let bound: number | null = null
  return {
    async start() {
      if (socket) return
      const s = createSocket({ type: 'udp4', reuseAddr: true })
      s.on('message', (msg, remote) => {
        if (msg.toString('utf8').trim() !== DISCOVERY_MESSAGE) return
        const body = Buffer.from(JSON.stringify(answer()))
        s.send(body, remote.port, remote.address, (err) => {
          if (err) logger?.warn('couldn’t answer a discovery request', { error: err.message })
          else logger?.debug('answered a discovery request', { from: remote.address })
        })
      })
      await new Promise<void>((resolve, reject) => {
        s.once('error', reject)
        s.bind(port, host, () => {
          s.off('error', reject)
          s.on('error', (err) => logger?.warn('discovery socket error', { error: err.message }))
          resolve()
        })
      })
      bound = s.address().port
      socket = s
      logger?.info('answering discovery', { port: bound })
    },
    async stop() {
      const s = socket
      socket = null
      bound = null
      if (s) await new Promise<void>((r) => s.close(() => r()))
    },
    running: () => socket !== null,
    port: () => bound,
  }
}
