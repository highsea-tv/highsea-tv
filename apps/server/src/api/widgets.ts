// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard's newer widgets (HT-60): the network's whole activity, and the weather with its
// place search. Thin handlers over the runtime's `networkActivity` and `weather`; the contract
// keeps them staff only. The weather is asked only with a place the widget's settings give.
import { routes } from '@highsea-tv/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from './guard.ts'

export function registerWidgets(app: OpenAPIHono<Env>) {
  app.openapi(routes.widgets.network, (c) =>
    c.json(c.get('runtime').networkActivity.read(c.req.valid('query').minutes ?? 10), 200),
  )

  app.openapi(routes.widgets.weather, async (c) => {
    const { latitude, longitude } = c.req.valid('query')
    return c.json(await c.get('runtime').weather.read(latitude, longitude), 200)
  })

  app.openapi(routes.widgets.places, async (c) => {
    const { name, language } = c.req.valid('query')
    return c.json(await c.get('runtime').weather.places(name, language), 200)
  })
}
