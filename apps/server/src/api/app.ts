// SPDX-License-Identifier: AGPL-3.0-only
// The public API (ADR 0006): a Hono app implementing @highsea/api-contract's routes over the
// runtime's services. Handlers stay thin; the logic lives in the domain packages.
import { API_PREFIX, type ErrorBody, routes } from '@highsea/api-contract'
import { isAppError } from '@highsea/core'
import type { Runtime } from '@highsea/runtime'
import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { events } from './events.ts'

export type Env = { Variables: { runtime: Runtime } }

const body = (code: ErrorBody['error']['code'], message: string, details?: unknown): ErrorBody => ({
  error: details === undefined ? { code, message } : { code, message, details },
})

export function createApi(runtime: Runtime) {
  const app = new OpenAPIHono<Env>({
    // a request that doesn't match the contract gets the shared error body, with zod's issues
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json(body('invalid', 'That request isn’t valid.', result.error.issues), 400)
    },
  })

  app.use(async (c, next) => {
    c.set('runtime', runtime)
    await next()
  })

  app.openapi(routes.system.health, (c) => {
    const health = runtime.health()
    return health.status === 'ok'
      ? c.json(health, 200)
      : c.json(body('unavailable', 'The server isn’t healthy.', health), 503)
  })

  app.openapi(routes.system.publicInfo, (c) => c.json(runtime.publicInfo(), 200))

  // a stream, not JSON: served directly, and listed in the document from the contract
  app.get(routes.system.events.path, events(runtime))
  app.openAPIRegistry.registerPath(routes.system.events)

  app.doc31(`${API_PREFIX}/openapi.json`, {
    openapi: '3.1.0',
    info: {
      title: 'highsea',
      version: runtime.version,
      description: 'The highsea server API. Every admin capability is here, with admin scope.',
      license: { name: 'AGPL-3.0-only' },
    },
  })
  app.get('/api/docs', Scalar({ url: `${API_PREFIX}/openapi.json`, pageTitle: 'highsea API' }))

  app.notFound((c) => c.json(body('not-found', 'There’s no API route at that address.'), 404))

  app.onError((err, c) => {
    if (isAppError(err)) return c.json(body(err.code, err.message, err.details), err.status as 400)
    runtime.logger.child('api').error('unhandled error', { path: c.req.path, error: err })
    return c.json(body('internal', 'Something went wrong on the server. It’s in the logs.'), 500)
  })

  return app
}

export type Api = ReturnType<typeof createApi>
