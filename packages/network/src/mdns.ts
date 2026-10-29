// SPDX-License-Identifier: AGPL-3.0-only
// mDNS advertising of `_highsea._tcp` (ADR 0020), through @homebridge/ciao, which implements
// RFC 6762/6763 (probing, conflict resolution, goodbye packets) and passes Apple's Bonjour
// Conformance Test. The TXT record carries the server id and version, so a client can tell
// servers apart before probing. The responder is injected, so tests don't multicast.
//
// Where the host runs avahi and hands the container its D-Bus socket (`/run/dbus`), highsea
// publishes through the host's avahi instead (ADR 0020's 2026-10-28 section): one responder per
// host, as RFC 6762 § 15 prefers, and the only way on a NAS whose avahi keeps port 5353 to itself
// (TrueNAS: `disallow-other-stacks=yes`, avahi-daemon.conf(5)) or whose container is on a bridge.
import { spawn } from 'node:child_process'
import { createSocket } from 'node:dgram'
import { existsSync } from 'node:fs'
import type { Logger } from '@highsea-tv/core'

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
  /** Says which responder, when it is not highsea's own. */
  via?: string
  /** What to try when this one can't advertise. */
  fallback?: () => Promise<MdnsResponder>
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

/**
 * The system bus. Its well-known address is unix:path=/var/run/dbus/system_bus_socket (D-Bus
 * specification, "Well-known Message Bus Instances"), and /var/run is /run on Debian.
 */
export const SYSTEM_BUS = '/run/dbus/system_bus_socket'
const AVAHI_PUBLISH = '/usr/bin/avahi-publish'

/** A child process, as much of one as avahiResponder uses. */
export type Child = {
  stdout: NodeJS.ReadableStream | null
  stderr: NodeJS.ReadableStream | null
  once(event: 'exit', listener: (code: number | null) => void): unknown
  once(event: 'error', listener: (error: Error) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

/**
 * Publishes through the host's avahi-daemon with avahi-publish(1), which stays running while the
 * service is registered and withdraws it when stopped. It reports "Established under name …" once
 * avahi has registered the service, renaming it itself on a conflict.
 */
export function avahiResponder(
  run: (args: string[]) => Child = (args) =>
    spawn(AVAHI_PUBLISH, args, { stdio: ['ignore', 'pipe', 'pipe'] }),
  timeoutMs = 10_000,
): MdnsResponder {
  const children = new Set<Child>()
  return {
    via: 'avahi',
    createService({ name, type, port, txt }) {
      let child: Child | null = null
      const stop = async () => {
        if (!child) return
        child.kill('SIGTERM')
        children.delete(child)
        child = null
      }
      return {
        advertise: () =>
          new Promise<void>((resolve, reject) => {
            const args = [
              '-s',
              name,
              `_${type}._tcp`,
              String(port),
              ...Object.entries(txt).map(([k, v]) => `${k}=${v}`),
            ]
            const c = run(args)
            child = c
            children.add(c)
            let said = ''
            const timer = setTimeout(() => fail('avahi didn’t answer in time'), timeoutMs)
            const fail = (why: string) => {
              clearTimeout(timer)
              void stop()
              reject(new Error(why))
            }
            const hear = (chunk: Buffer | string) => {
              said += chunk.toString()
              if (/Established under name/.test(said)) {
                clearTimeout(timer)
                resolve()
              }
            }
            c.stdout?.on('data', hear)
            c.stderr?.on('data', hear)
            c.once('error', (e) => fail(e.message))
            c.once('exit', (code) =>
              fail(said.trim().split('\n').pop() || `avahi-publish exited with ${code}`),
            )
          }),
        end: stop,
        destroy: stop,
      }
    },
    async shutdown() {
      for (const c of children) c.kill('SIGTERM')
      children.clear()
    },
  }
}

/** Can this process bind UDP 5353 alongside others (SO_REUSEADDR), as ciao does? */
export function mdnsPortFree(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: true })
    socket.once('error', () => {
      socket.close()
      resolve(false)
    })
    socket.bind(5353, () => {
      socket.close()
      resolve(true)
    })
  })
}

/** A responder whose advertisement fails with the reason, so it's logged once, plainly. */
function unavailable(reason: string): MdnsResponder {
  return {
    createService: () => ({
      advertise: async () => {
        throw new Error(reason)
      },
      end: async () => {},
      destroy: async () => {},
    }),
    shutdown: async () => {},
  }
}

/**
 * The host's avahi when its bus and avahi-publish are both there, else ciao when it can bind 5353,
 * else none, with the reason.
 */
export async function chooseResponder({
  exists = existsSync,
  portFree = mdnsPortFree,
  ciao = ciaoResponder,
  avahi = () => avahiResponder(),
}: {
  exists?: (path: string) => boolean
  portFree?: () => Promise<boolean>
  ciao?: () => Promise<MdnsResponder>
  avahi?: () => MdnsResponder
} = {}): Promise<MdnsResponder> {
  const own = async () =>
    (await portFree())
      ? ciao()
      : unavailable(
          'another mDNS service holds port 5353. Apps find highsea by its broadcast instead, or give the container the host’s /run/dbus to publish through avahi.',
        )
  // a host with a bus but no avahi running: avahi-publish says so, and highsea answers itself
  if (exists(SYSTEM_BUS) && exists(AVAHI_PUBLISH)) return { ...avahi(), fallback: own }
  return own()
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
      let r = await responder()
      for (;;) {
        const service = r.createService({
          name: info.name,
          type: MDNS_TYPE,
          port: info.port,
          txt: { id: info.id, version: info.version },
        })
        current = { responder: r, service }
        try {
          await service.advertise()
          logger?.info('advertising over mDNS', {
            type: `_${MDNS_TYPE}._tcp`,
            name: info.name,
            ...(r.via ? { via: r.via } : {}),
          })
          return
        } catch (e) {
          const error = (e as Error).message
          if (!r.fallback) return logger?.warn('couldn’t advertise over mDNS', { error })
          logger?.info('the host’s avahi didn’t publish highsea, so it answers mDNS itself', {
            error,
          })
          const next = r.fallback
          await this.stop()
          r = await next()
        }
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
