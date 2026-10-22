// SPDX-License-Identifier: AGPL-3.0-only
// Wanted and the calendar over HTTP (wanted.md, A14; checkpoint 8a): thin handlers over
// `movies.wanted` and the runtime's automation, the person's calendar key, and the iCal feed, which
// authenticates by the `calendar` key in its address since calendar apps can't send headers.
import { routes } from '@highsea/api-contract'
import { AppError } from '@highsea/core'
import { CALENDAR_MAX_DAYS } from '@highsea/media/movies'
import { noIndexers } from '@highsea/media/shared'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { type Env, me, ownOrigin } from './guard.ts'
import { calendarIcs } from './ics.ts'

const DAY = 24 * 60 * 60 * 1000
/** The feed's window (the owner's answer 10): 30 days back, a year ahead. */
const FEED_BACK_DAYS = 30
const FEED_AHEAD_DAYS = 365
/** The most movies one Search all queues. */
const SEARCH_ALL_MAX = 10_000

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

export function registerWanted(app: OpenAPIHono<Env>) {
  const rt = (c: Context<Env>) => c.get('runtime')
  const wanted = (c: Context<Env>) => rt(c).movies.wanted

  app.openapi(routes.wanted.missing, (c) => c.json(wanted(c).missing(c.req.valid('query')), 200))

  app.openapi(routes.wanted.cutoff, (c) => c.json(wanted(c).cutoff(c.req.valid('query')), 200))

  app.openapi(routes.wanted.search, (c) => {
    const input = c.req.valid('json')
    if (!rt(c).indexers.hasEnabled()) throw noIndexers()
    let ids = input.ids ?? []
    if (input.all) {
      const list = input.all === 'missing' ? wanted(c).missing : wanted(c).cutoff
      ids = []
      let cursor: string | undefined
      do {
        const page = list({ limit: 200, ...(cursor ? { cursor } : {}) })
        ids.push(...page.items.map((m) => m.id))
        cursor = page.next ?? undefined
      } while (cursor && ids.length < SEARCH_ALL_MAX)
    }
    if (!ids.length && !input.all)
      throw new AppError('invalid', 'Pick the movies to search for.', {
        field: 'ids',
        reason: 'required',
      })
    rt(c).automation.queue(ids)
    return c.json({ queued: ids.length }, 200)
  })

  app.openapi(routes.wanted.calendar, (c) => {
    const { from, to } = c.req.valid('query')
    const days = daysBetween(from, to)
    if (days < 0)
      throw new AppError('invalid', 'The range ends before it starts.', {
        field: 'to',
        reason: 'range',
      })
    if (days > CALENDAR_MAX_DAYS)
      throw new AppError('invalid', `Ask for at most ${CALENDAR_MAX_DAYS} days at once.`, {
        field: 'to',
        reason: 'range',
      })
    return c.json(wanted(c).calendar(from, to), 200)
  })

  app.openapi(routes.wanted.feed, (c) => {
    const runtime = rt(c)
    const person = runtime.auth.apiKeys.calendar.authenticate(c.req.valid('query').key)
    if (!person)
      throw new AppError('unauthorized', 'That calendar address no longer works. Make a new one.', {
        reason: 'bad-key',
      })
    const now = runtime.clock.now()
    const server = runtime.server()
    const body = calendarIcs({
      serverId: server.id,
      serverName: server.name,
      version: server.version,
      now,
      entries: wanted(c).calendar(
        dayOf(now - FEED_BACK_DAYS * DAY),
        dayOf(now + FEED_AHEAD_DAYS * DAY),
      ),
    })
    // RFC 5545 § 8.1 registers text/calendar; the key in the address mustn't be cached by proxies
    return c.body(body, 200, {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'private, no-store',
    }) as never
  })

  /** The feed's address with the person's key, the server's public address first. */
  const feedOf = (c: Context<Env>, key: { secret: string; createdAt: number } | null) => {
    if (!key) return { url: null, createdAt: null }
    const base = rt(c).server().addresses.public ?? ownOrigin(c.get('client'))
    return {
      url: `${base.replace(/\/+$/, '')}/feed/v1/calendar.ics?key=${encodeURIComponent(key.secret)}`,
      createdAt: new Date(key.createdAt).toISOString(),
    }
  }

  app.openapi(routes.wanted.feedKey, (c) =>
    c.json(feedOf(c, rt(c).auth.apiKeys.calendar.get(me(c).user)), 200),
  )

  app.openapi(routes.wanted.makeFeedKey, (c) => {
    const p = me(c)
    const key = rt(c).auth.apiKeys.calendar.make(
      { id: p.user.id, name: p.user.username },
      c.get('meta'),
    )
    return c.json(feedOf(c, key), 200)
  })

  app.openapi(routes.wanted.revokeFeedKey, (c) => {
    const p = me(c)
    rt(c).auth.apiKeys.calendar.revoke({ id: p.user.id, name: p.user.username }, c.get('meta'))
    return c.body(null, 204)
  })
}
