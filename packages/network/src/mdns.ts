// SPDX-License-Identifier: AGPL-3.0-only
// mDNS advertising of `_highsea._tcp` (ADR 0020), through @homebridge/ciao, which implements
// RFC 6762/6763 (probing, conflict resolution, goodbye packets) and passes Apple's Bonjour
// Conformance Test. The TXT record carries the server id and version, so a client can tell
// servers apart before probing. The responder is injected, so tests don't multicast.
import type { Logger } from '@highsea/core'

export const MDNS_TYPE = 'highsea'

/** The parts of a ciao service this uses. */
export type MdnsService = {
  advertise(): Promise<void>
  end(): Promise<void>
  destroy(): Promise<void>
}
export type MdnsResponder = {
  createService(options: {
    name: string
    type: string
    port: number
    txt: Record<string, string>
  }): MdnsService
  shutdown(): Promise<void>
}

export type MdnsAdvertiser = {
  start(info: { name: string; id: string; version: string; port: number }): Promise<void>
  stop(): Promise<void>
  running(): boolean
}

export async function ciaoResponder(): Promise<MdnsResponder> {
  const ciao = (await import('@homebridge/ciao')).default
  return ciao.getResponder() as unknown as MdnsResponder
}

export function createMdnsAdvertiser({
  responder,
  logger,
}: {
  responder: () => Promise<MdnsResponder>
  logger?: Logger
}): MdnsAdvertiser {
  let current: { responder: MdnsResponder; service: MdnsService } | null = null
  return {
    async start(info) {
      if (current) await this.stop()
      const r = await responder()
      const service = r.createService({
        name: info.name,
        type: MDNS_TYPE,
        port: info.port,
        txt: { id: info.id, version: info.version },
      })
      current = { responder: r, service }
      try {
        await service.advertise()
        logger?.info('advertising over mDNS', { type: `_${MDNS_TYPE}._tcp`, name: info.name })
      } catch (e) {
        logger?.warn('couldn’t advertise over mDNS', { error: (e as Error).message })
      }
    },
    async stop() {
      const c = current
      current = null
      if (!c) return
      // goodbye packets go out on shutdown (ciao's README: call it on SIGTERM)
      await c.service.end().catch(() => {})
      await c.service.destroy().catch(() => {})
      await c.responder.shutdown().catch(() => {})
    },
    running: () => current !== null,
  }
}
