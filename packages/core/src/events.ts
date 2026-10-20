// SPDX-License-Identifier: AGPL-3.0-only
// The in-process event bus. Services announce what changed by topic (`movies.updated`) and id;
// SSE forwards events to clients, who refetch what they show. Events never carry full objects.
// A short ring buffer lets a reconnecting client catch up from `Last-Event-ID`.

export type ServerEvent = {
  /** Increasing per process; SSE's `id:`. */
  id: number
  topic: string
  /** The ids that changed, when it's narrower than "everything on this topic". */
  ids?: string[]
  at: number
}

export type EventInput = { topic: string; ids?: string[] }

export type EventBus = {
  emit(event: EventInput): ServerEvent
  subscribe(listener: (event: ServerEvent) => void): () => void
  /** Events after `id`, if they're still in the buffer; `null` when the client fell too far behind. */
  since(id: number): ServerEvent[] | null
  lastId(): number
}

export function createEventBus({
  now = () => Date.now(),
  buffer = 500,
}: {
  now?: () => number
  buffer?: number
} = {}): EventBus {
  const listeners = new Set<(event: ServerEvent) => void>()
  const recent: ServerEvent[] = []
  let next = 1
  return {
    emit(input) {
      const event: ServerEvent = { id: next++, topic: input.topic, at: now() }
      if (input.ids?.length) event.ids = input.ids
      recent.push(event)
      if (recent.length > buffer) recent.shift()
      for (const l of listeners) {
        try {
          l(event)
        } catch {
          // one bad listener mustn't stop the others
        }
      }
      return event
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    since(id) {
      if (id >= next - 1) return []
      const first = recent[0]
      if (!first || id < first.id - 1) return null
      return recent.filter((e) => e.id > id)
    },
    lastId: () => next - 1,
  }
}
