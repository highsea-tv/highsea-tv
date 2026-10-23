// SPDX-License-Identifier: AGPL-3.0-only
// Connections over HTTP (settings.md › Connections; checkpoint 8b, ADR 0046): thin handlers over
// `@highsea-tv/notifications`. Static paths (`/test`, `/push-key`) come before `/{id}`, in the
// contract's order. Changes go in the audit log, as other settings do; secrets never do. A Browser
// connection made without people is for whoever made it. Web push subscriptions are each person's
// own: nobody sees or removes another's.
import { routes } from '@highsea-tv/api-contract'
import type { ConnectionInput, ConnectionView, LogEntry } from '@highsea-tv/notifications/service'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

const iso = (ms: number) => new Date(ms).toISOString()
const isoOrNull = (ms: number | null) => (ms === null ? null : iso(ms))

const view = (c: ConnectionView) => ({
  ...c,
  createdAt: iso(c.createdAt),
  updatedAt: iso(c.updatedAt),
  lastSentAt: isoOrNull(c.lastSentAt),
})

const logView = (e: LogEntry) => ({
  id: e.id,
  event: e.event,
  status: e.status,
  attempts: e.attempts,
  lastError: e.lastError,
  createdAt: iso(e.createdAt),
  sentAt: isoOrNull(e.sentAt),
})

export function registerConnections(app: OpenAPIHono<Env>) {
  const notifications = (c: Context<Env>) => c.get('runtime').notifications
  const audit = (c: Context<Env>, action: string, id: string) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: 'connection',
      targetId: id,
    })
  /** A Browser connection without people is for the person making it. */
  const withPeople = <I extends Pick<ConnectionInput, 'kind' | 'settings'>>(
    c: Context<Env>,
    input: I,
  ): I => {
    const ids = input.settings.userIds
    return input.kind === 'browser' && (!Array.isArray(ids) || !ids.length)
      ? { ...input, settings: { ...input.settings, userIds: [me(c).user.id] } }
      : input
  }

  /** Tags must exist (checkpoint 8c): the library's tags, which notifications don't import. */
  const withTags = <I extends { tags?: string[] }>(c: Context<Env>, input: I): I => ({
    ...input,
    tags: c.get('runtime').media.tags.check(input.tags),
  })

  app.openapi(routes.connections.list, (c) => c.json(notifications(c).list().map(view), 200))

  app.openapi(routes.connections.add, (c) => {
    const added = notifications(c).add(withTags(c, withPeople(c, c.req.valid('json'))))
    audit(c, 'connection.added', added.id)
    return c.json(view(added), 201)
  })

  app.openapi(routes.connections.test, async (c) => {
    const out = await notifications(c).test(withPeople(c, c.req.valid('json')))
    return c.json({ ok: out.ok, message: out.ok ? null : out.message }, 200)
  })

  app.openapi(routes.connections.pushKey, (c) =>
    c.json({ publicKey: notifications(c).vapidPublicKey() }, 200),
  )

  app.openapi(routes.connections.update, (c) => {
    const { id } = c.req.valid('param')
    const saved = notifications(c).update(id, withTags(c, withPeople(c, c.req.valid('json'))))
    audit(c, 'connection.updated', id)
    return c.json(view(saved), 200)
  })

  app.openapi(routes.connections.remove, (c) => {
    const { id } = c.req.valid('param')
    notifications(c).remove(id)
    audit(c, 'connection.removed', id)
    return c.body(null, 204)
  })

  app.openapi(routes.connections.testSaved, async (c) => {
    const out = await notifications(c).test(c.req.valid('param').id)
    return c.json({ ok: out.ok, message: out.ok ? null : out.message }, 200)
  })

  app.openapi(routes.connections.log, (c) => {
    const { id } = c.req.valid('param')
    // not-found for a connection that isn't there, rather than an empty log
    notifications(c).get(id)
    return c.json(notifications(c).log({ connectionId: id }).map(logView), 200)
  })

  // ---------------------------------------------------------------- web push, each person's

  const pushView = (s: { id: string; label: string; service: string; createdAt: number }) => ({
    ...s,
    createdAt: iso(s.createdAt),
  })

  app.openapi(routes.pushSubscriptions.list, (c) =>
    c.json(notifications(c).push.list(me(c).user.id).map(pushView), 200),
  )

  app.openapi(routes.pushSubscriptions.add, (c) =>
    c.json(pushView(notifications(c).push.subscribe(me(c).user.id, c.req.valid('json'))), 201),
  )

  app.openapi(routes.pushSubscriptions.remove, (c) => {
    notifications(c).push.unsubscribe(me(c).user.id, c.req.valid('param').id)
    return c.body(null, 204)
  })
}
