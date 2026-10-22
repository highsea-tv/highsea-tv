// SPDX-License-Identifier: AGPL-3.0-only
// Subtitles over HTTP (checkpoint 7): A10's Wanted, Providers, Languages and Scoring tabs, and A6's
// Subtitles tab with Re-sync and the offset (7b). Thin handlers over @highsea-tv/subtitles/movies. The contract keeps a provider's
// account the owner's; saving one goes in the audit log, its credentials never do.
import { routes, type SubtitleProvider } from '@highsea-tv/api-contract'
import type { ProviderView } from '@highsea-tv/subtitles/movies'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

// the service names a field's key as a string; the contract lists the three it can be
const view = (p: ProviderView) => p as SubtitleProvider

export function registerSubtitles(app: OpenAPIHono<Env>) {
  const subtitles = (c: Context<Env>) => c.get('runtime').subtitles

  app.openapi(routes.subtitles.stats, (c) => c.json(subtitles(c).stats(), 200))

  app.openapi(routes.subtitles.wanted, (c) => {
    const { cursor, limit } = c.req.valid('query')
    return c.json(subtitles(c).wanted(cursor, limit), 200)
  })

  app.openapi(routes.subtitles.searchAllMissing, (c) =>
    c.json(subtitles(c).searchAllMissing(), 200),
  )

  app.openapi(routes.subtitles.forItem, (c) =>
    c.json(subtitles(c).forItem(c.req.valid('param').id), 200),
  )

  app.openapi(routes.subtitles.search, async (c) => {
    const { language, fileId } = c.req.valid('json')
    return c.json(await subtitles(c).search(c.req.valid('param').id, language, fileId), 200)
  })

  app.openapi(routes.subtitles.download, async (c) =>
    c.json(await subtitles(c).download(c.req.valid('param').id, c.req.valid('json').resultId), 200),
  )

  app.openapi(routes.subtitles.delete, async (c) => {
    await subtitles(c).delete(c.req.valid('param').id)
    return c.body(null, 204)
  })

  app.openapi(routes.subtitles.sync, (c) => c.json(subtitles(c).sync(c.req.valid('param').id), 200))

  app.openapi(routes.subtitles.setOffset, async (c) =>
    c.json(await subtitles(c).setOffset(c.req.valid('param').id, c.req.valid('json').ms), 200),
  )

  app.openapi(routes.subtitles.providers, (c) =>
    c.json(subtitles(c).providers.list().map(view), 200),
  )

  app.openapi(routes.subtitles.toggleProvider, (c) =>
    c.json(
      view(subtitles(c).providers.toggle(c.req.valid('param').id, c.req.valid('json').enabled)),
      200,
    ),
  )

  app.openapi(routes.subtitles.saveProvider, (c) => {
    const { id } = c.req.valid('param')
    const saved = subtitles(c).providers.save(id, clean(c.req.valid('json')))
    c.get('runtime').auth.ctx.audit({
      action: 'subtitles.provider.save',
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: 'subtitle-provider',
      targetId: id,
    })
    return c.json(view(saved), 200)
  })

  app.openapi(routes.subtitles.testProvider, async (c) => {
    const result = await subtitles(c).providers.test(
      c.req.valid('param').id,
      clean(c.req.valid('json')),
    )
    return c.json({ ...result, account: result.account?.account ?? null }, 200)
  })

  app.openapi(routes.subtitles.languages, (c) => c.json(subtitles(c).languages(), 200))

  app.openapi(routes.subtitles.languageProfiles, (c) => c.json(subtitles(c).profiles.list(), 200))

  app.openapi(routes.subtitles.createLanguageProfile, (c) =>
    c.json(subtitles(c).profiles.save(c.req.valid('json')), 200),
  )

  app.openapi(routes.subtitles.saveLanguageProfile, (c) =>
    c.json(subtitles(c).profiles.save(c.req.valid('json'), c.req.valid('param').id), 200),
  )

  app.openapi(routes.subtitles.deleteLanguageProfile, (c) => {
    subtitles(c).profiles.remove(c.req.valid('param').id)
    return c.body(null, 204)
  })

  app.openapi(routes.subtitles.settings, (c) => c.json(subtitles(c).settings.get(), 200))

  app.openapi(routes.subtitles.saveSettings, (c) =>
    c.json(subtitles(c).settings.save(c.req.valid('json')), 200),
  )
}

/** The fields given, without the ones left out. */
const clean = (given: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(given).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
