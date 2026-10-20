// SPDX-License-Identifier: AGPL-3.0-only
// GET /api/v1/events: server events as SSE. A reconnecting client sends Last-Event-ID and gets what
// it missed, or a `reset` when that's no longer in the buffer. A comment every 25s keeps proxies
// from closing an idle stream. The guard has already checked the caller is signed in.
import { RESET_TOPIC, type ServerEvent } from '@highsea/api-contract'
import type { Runtime } from '@highsea/runtime'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

export const KEEPALIVE_MS = 25_000

export const events = (runtime: Runtime) => (c: Context) => {
  const topics = c.req.query('topics')?.split(',').filter(Boolean)
  const wanted = (e: ServerEvent) =>
    !topics?.length || topics.includes(e.topic) || e.topic === RESET_TOPIC
  const last = Number(c.req.header('last-event-id'))

  return streamSSE(c, async (stream) => {
    const queue: ServerEvent[] = []
    let wake: (() => void) | null = null
    const push = (e: ServerEvent) => {
      if (!wanted(e)) return
      queue.push(e)
      wake?.()
    }
    // an open stream is a connected client, for the network card's count; counted before
    // subscribing, so a client isn't told about its own arrival
    const release = runtime.network.connect()
    const unsubscribe = runtime.events.subscribe(push)
    stream.onAbort(() => {
      unsubscribe()
      release()
      wake?.()
    })

    if (Number.isFinite(last)) {
      const missed = runtime.events.since(last)
      if (missed === null)
        queue.unshift({ id: runtime.events.lastId(), topic: RESET_TOPIC, at: runtime.clock.now() })
      else queue.unshift(...missed.filter(wanted))
    }

    while (!stream.aborted) {
      while (queue.length) {
        const e = queue.shift() as ServerEvent
        await stream.writeSSE({ id: String(e.id), data: JSON.stringify(e) })
      }
      const timer = new Promise<'keepalive'>((r) => {
        const t = setTimeout(() => r('keepalive'), KEEPALIVE_MS)
        stream.onAbort(() => clearTimeout(t))
      })
      const woken = new Promise<'event'>((r) => {
        wake = () => r('event')
      })
      if ((await Promise.race([timer, woken])) === 'keepalive' && !stream.aborted)
        await stream.write(': keepalive\n\n')
      wake = null
    }
  })
}
