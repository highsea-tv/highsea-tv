// SPDX-License-Identifier: AGPL-3.0-only
// Server events over SSE, read with `fetch` so a bearer token can go in a header (EventSource
// can't send one). One connection is shared by every subscriber, opened by the first and closed
// after the last. It reconnects with backoff, sending Last-Event-ID so nothing is missed.

import { API_PREFIX, RESET_TOPIC, type ServerEvent } from '@highsea-tv/api-contract'
import type { Fetch } from './client.ts'

export type EventListener = (event: ServerEvent) => void

export type EventStream = {
  subscribe(listener: EventListener): () => void
  /** Whether the stream is connected now. */
  connected(): boolean
}

export function createEventStream({
  baseUrl,
  fetch: doFetch,
  headers,
  retryMs = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
}: {
  baseUrl: string
  fetch: Fetch
  headers: () => Record<string, string>
  retryMs?: (attempt: number) => number
}): EventStream {
  const listeners = new Set<EventListener>()
  let controller: AbortController | null = null
  let lastId: number | null = null
  let open = false

  const deliver = (event: ServerEvent) => {
    for (const l of listeners) {
      try {
        l(event)
      } catch {
        // a listener's error is its own
      }
    }
  }

  async function run(signal: AbortSignal) {
    let attempt = 0
    while (!signal.aborted) {
      try {
        const h = headers()
        if (lastId !== null) h['last-event-id'] = String(lastId)
        const res = await doFetch(`${baseUrl}${API_PREFIX}/events`, {
          headers: h,
          signal,
          credentials: 'include',
        })
        if (!res.ok || !res.body) throw new Error(`events answered ${res.status}`)
        open = true
        attempt = 0
        await read(res.body, signal, (event) => {
          lastId = event.id
          deliver(event)
        })
      } catch {
        // dropped or refused: wait, then try again
      }
      open = false
      if (signal.aborted) return
      await new Promise((r) => setTimeout(r, retryMs(attempt++)))
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!controller) {
        controller = new AbortController()
        void run(controller.signal)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && controller) {
          controller.abort()
          controller = null
          open = false
        }
      }
    },
    connected: () => open,
  }
}

/** Parses an SSE body: `data:` lines (JSON ServerEvents) separated by blank lines. */
export async function read(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: ServerEvent) => void,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  signal.addEventListener('abort', () => void reader.cancel().catch(() => {}), { once: true })
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let end = buffer.search(/\r?\n\r?\n/)
    while (end !== -1) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '')
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (data) {
        try {
          onEvent(JSON.parse(data) as ServerEvent)
        } catch {
          // not ours
        }
      }
      end = buffer.search(/\r?\n\r?\n/)
    }
  }
}

export { RESET_TOPIC }
