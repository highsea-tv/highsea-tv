// SPDX-License-Identifier: AGPL-3.0-only
// System, setup and network settings over HTTP.
import { routes } from '@highsea/api-contract'
import { AppError, iso } from '@highsea/core'
import { checkHardlinks, listFolders, localAddresses, setupDefaults } from '@highsea/runtime'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { setSession } from './accounts.ts'
import { type Env, me } from './guard.ts'
import { sessionView } from './views.ts'

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

  app.openapi(routes.system.healthChecks, (c) =>
    c.json(
      rt(c)
        .issues()
        .map((i) => ({ ...i, since: iso(i.since) })),
      200,
    ),
  )

  // ---------------------------------------------------------------- setup

  app.openapi(routes.setup.defaults, (c) => {
    setupOpen(c)
    return c.json(setupDefaults(rt(c).config), 200)
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
