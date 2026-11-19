// SPDX-License-Identifier: AGPL-3.0-only
// What's in hand on a library item (HT-106), as the server's `system.work` and `system.itemWork`
// give it: the mock's Refresh and Search on a film, a show, an artist or an album queue a job under
// the server's job type, which waits a moment, runs a few seconds of the mock's clock while saying
// how far it is, and ends; finished ones stay ten minutes. One store a mock server, so a reset
// starts empty. `jobs.updated` follows each change, as the server's queue raises it.
import type { ItemJob, ItemWork, WorkKind, WorkSubject } from '@highsea-tv/api-contract'
import type { MockServer } from '../server.ts'
import type { AdminKit, Answers, Ctx } from './kit.ts'

/** Seconds a job waits before it runs, and runs for. */
const WAITS = 1
const RUNS = 6
const KEPT_MS = 10 * 60_000

type Entry = {
  id: string
  type: string
  subject: WorkSubject
  of: WorkSubject
  state: ItemJob['state']
  queuedAt: number
  startsAt: number
  endsAt: number
  finishedAt: number | null
  error: string | null
}

type Store = { entries: Entry[]; next: number }
const stores = new WeakMap<MockServer, Store>()

function storeOf(srv: MockServer, emit: () => void): Store {
  let store = stores.get(srv)
  if (store) return store
  const made: Store = { entries: [], next: 1 }
  store = made
  stores.set(srv, made)
  srv.clock.onAdvance((_, now) => {
    let changed = false
    for (const e of made.entries) {
      if (e.state === 'queued' && now >= e.startsAt) {
        e.state = 'running'
        changed = true
      }
      if (e.state === 'running') {
        changed = true
        if (now >= e.endsAt) {
          e.state = 'succeeded'
          e.finishedAt = now
        }
      }
    }
    made.entries = made.entries.filter((e) => e.finishedAt === null || now - e.finishedAt < KEPT_MS)
    if (changed) emit()
  })
  return made
}

export type ItemWorkKit = {
  /**
   * Queues a job of `type` on an item, unless one of that type is already waiting or running on it
   * (the server's dedupe key does the same). `of` is the item whose page stands for it.
   */
  queue: (ctx: Ctx, type: string, subject: WorkSubject, of?: WorkSubject) => void
}

export function itemWorkKit({ emit, wallMs }: AdminKit) {
  const announce = () => emit('jobs.updated')
  const view = (e: Entry, now: number): ItemJob => ({
    id: e.id,
    type: e.type,
    state: e.state,
    subject: e.subject,
    since: wallMs(e.state === 'running' ? e.startsAt : e.queuedAt),
    retryAt: null,
    progress:
      e.state === 'running'
        ? Math.min(100, Math.round(((now - e.startsAt) / (e.endsAt - e.startsAt)) * 100))
        : null,
    finishedAt: e.finishedAt === null ? null : wallMs(e.finishedAt),
    error: e.error,
  })
  const active = (e: Entry) => e.state === 'queued' || e.state === 'running'
  const same = (a: WorkSubject, b: WorkSubject) => a.kind === b.kind && a.id === b.id

  const kit: ItemWorkKit = {
    queue(ctx, type, subject, of = subject) {
      const store = storeOf(ctx.srv, announce)
      if (store.entries.some((e) => active(e) && e.type === type && same(e.subject, subject)))
        return
      const now = ctx.srv.clock.now()
      store.entries.push({
        id: `job-work-${store.next++}`,
        type,
        subject,
        of,
        state: 'queued',
        queuedAt: now,
        startsAt: now + WAITS * 1000,
        endsAt: now + (WAITS + RUNS) * 1000,
        finishedAt: null,
        error: null,
      })
      announce()
    },
  }

  const answers: Answers = {
    system: {
      work: (_, ctx) => {
        const now = ctx.srv.clock.now()
        const items = new Map<string, ItemWork>()
        for (const e of storeOf(ctx.srv, announce).entries.filter(active)) {
          const key = `${e.of.kind}:${e.of.id}`
          const item = items.get(key) ?? { ...e.of, jobs: [] }
          item.jobs.push(view(e, now))
          items.set(key, item)
        }
        return [...items.values()]
      },
      itemWork: ({ params }, ctx) => {
        const now = ctx.srv.clock.now()
        const item = { kind: params.kind as WorkKind, id: params.id }
        const mine = storeOf(ctx.srv, announce).entries.filter(
          (e) => same(e.of, item) || same(e.subject, item),
        )
        return {
          ...item,
          active: mine.filter(active).map((e) => view(e, now)),
          finished: mine
            .filter((e) => !active(e))
            .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
            .map((e) => view(e, now)),
        }
      },
    },
  }
  return { kit, answers }
}
