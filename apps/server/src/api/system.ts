// SPDX-License-Identifier: AGPL-3.0-only
// System, setup and network settings over HTTP.
import { type ItemJob, type ItemWork, routes } from '@highsea-tv/api-contract'
import { AppError, iso } from '@highsea-tv/core'
import { type ItemJob as QueuedJob, subjectKey } from '@highsea-tv/jobs'
import { checkHardlinks, listFolders, localAddresses, setupDefaults } from '@highsea-tv/runtime'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { setSession } from './accounts.ts'
import { type Env, me } from './guard.ts'
import { sessionView } from './views.ts'

/** A job on a library item, as the contract gives it (HT-106). */
function itemJobView(j: QueuedJob, now: number): ItemJob {
  return {
    id: j.id,
    type: j.type,
    state: j.status,
    subject: j.subject,
    since: iso(j.since),
    retryAt: j.status === 'queued' && j.runAt > now && j.error ? iso(j.runAt) : null,
    progress: j.progress === null ? null : Math.round(j.progress * 100),
    finishedAt: j.finishedAt === null ? null : iso(j.finishedAt),
    error: j.error,
  }
}

/** Setup's routes answer only until setup is complete (setup.md). */
export function setupOpen(c: Context<Env>) {
  if (c.get('runtime').setupComplete())
    throw new AppError('not-found', 'Setup is already complete.')
}

export function registerSystem(app: OpenAPIHono<Env>) {
  const rt = (c: Context<Env>) => c.get('runtime')

  app.openapi(routes.system.server, (c) => c.json(rt(c).server(), 200))

  app.openapi(routes.system.status, (c) => {
    const s = rt(c).status()
    return c.json({ ...s, startedAt: iso(s.startedAt) }, 200)
  })

  app.openapi(routes.system.jobs, (c) => {
    const now = rt(c).clock.now()
    const jobs = rt(c).jobs.list({ status: ['running', 'queued'], limit: 50 })
    return c.json(
      jobs.map((j) => ({
        id: j.id,
        name: j.type,
        state:
          j.status === 'running'
            ? ('running' as const)
            : j.runAt > now
              ? ('idle' as const)
              : ('queued' as const),
        nextRun: j.status === 'queued' ? iso(j.runAt) : null,
      })),
      200,
    )
  })

  // HT-106: what's in hand on each library item, for its page and its card or row
  app.openapi(routes.system.work, (c) => {
    const now = rt(c).clock.now()
    const items = new Map<string, ItemWork>()
    for (const j of rt(c).jobs.atWork()) {
      const key = subjectKey(j.of)
      const item = items.get(key) ?? { kind: j.of.kind, id: j.of.id, jobs: [] }
      item.jobs.push(itemJobView(j, now))
      items.set(key, item)
    }
    return c.json([...items.values()], 200)
  })

  app.openapi(routes.system.itemWork, (c) => {
    const { kind, id } = c.req.valid('param')
    const now = rt(c).clock.now()
    const work = rt(c).jobs.workOf({ kind, id })
    return c.json(
      {
        kind,
        id,
        active: work.active.map((j) => itemJobView(j, now)),
        finished: work.finished.map((j) => itemJobView(j, now)),
      },
      200,
    )
  })

  // System › Tasks (checkpoint 8a): every schedule, its last run and its next
  app.openapi(routes.system.tasks, (c) =>
    c.json(
      rt(c)
        .jobs.tasks()
        .map((t) => ({
          id: t.type,
          state: t.state,
          interval: Math.round(t.everyMs / 1000),
          lastRun: t.lastRunAt ? iso(t.lastRunAt) : null,
          nextRun: t.enabled ? iso(t.nextRunAt) : null,
          lastError: t.lastError,
        })),
      200,
    ),
  )

  app.openapi(routes.system.runTask, (c) => {
    rt(c).jobs.runNow(c.req.valid('param').id)
    return c.body(null, 204)
  })

  app.openapi(routes.system.healthChecks, (c) =>
    c.json(
      rt(c)
        .issues()
        .map((i) => ({ ...i, since: iso(i.since) })),
      200,
    ),
  )

  app.openapi(routes.system.dismissHealthCheck, (c) => {
    if (!rt(c).dismissIssue(c.req.valid('param').id))
      throw new AppError('not-found', 'There’s no check to dismiss there.')
    return c.body(null, 204)
  })

  // ---------------------------------------------------------------- setup

  app.openapi(routes.setup.defaults, (c) => {
    setupOpen(c)
    return c.json(setupDefaults(rt(c).config), 200)
  })

  app.openapi(routes.setup.detect, (c) => {
    setupOpen(c)
    return c.json(rt(c).detectSetup(), 200)
  })

  app.openapi(routes.setup.listFolders, (c) => {
    setupOpen(c)
    return c.json(listFolders(rt(c).config, c.req.valid('query').path), 200)
  })

  app.openapi(routes.setup.checkHardlinks, (c) => {
    setupOpen(c)
    const { a, b } = c.req.valid('query')
    return c.json(checkHardlinks(rt(c).config, a, b), 200)
  })

  app.openapi(routes.setup.starterPack, (c) => {
    setupOpen(c)
    return c.json(rt(c).starterPack(), 200)
  })

  app.openapi(routes.setup.languages, (c) => {
    setupOpen(c)
    return c.json(rt(c).subtitles.languages(), 200)
  })

  app.openapi(routes.setup.complete, async (c) => {
    setupOpen(c)
    const issued = await rt(c).completeSetup(c.req.valid('json'), c.get('meta'))
    setSession(c, issued.secret, issued.session.expiresAt)
    return c.json({ server: rt(c).server(), session: sessionView(issued.session) }, 200)
  })

  // ---------------------------------------------------------------- network settings

  const networkStatus = (c: Context<Env>) => ({
    ...rt(c).network.settings(),
    localAddresses: localAddresses(rt(c).config.port),
    discoveryPort: rt(c).config.discoveryPort,
    tlsProblem: rt(c).network.tlsProblem(),
  })

  app.openapi(routes.settings.network, (c) => c.json(networkStatus(c), 200))

  app.openapi(routes.settings.saveNetwork, (c) => {
    const p = me(c)
    if (p.via === 'key')
      throw new AppError('forbidden', 'Network settings can’t be changed with an API key.')
    rt(c).network.save(c.req.valid('json'))
    rt(c).auth.ctx.audit({
      action: 'settings.network',
      actor: { id: p.user.id, name: p.user.username },
      address: c.get('meta').address,
    })
    return c.json(networkStatus(c), 200)
  })
}
