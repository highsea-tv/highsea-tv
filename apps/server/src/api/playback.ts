// SPDX-License-Identifier: AGPL-3.0-only
// Playback (checkpoint 4.1a): playing a title on a device, its session's reports, the device's
// reported profile, and each person's watch state per title (ADR 0054). Thin handlers over the
// runtime's playback and @highsea-tv/media/movies. A library the person can't see answers 404, as
// the library's reads do. 4.1b adds the scrubber's previews (trickplay), and 4.3a Settings › Playback
// with its status and Clear, for the owner and admins.
import { readFile } from 'node:fs/promises'
import { routes } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

/** The person, with the movie library checked: 404 when it isn't theirs. */
export function viewer(c: Context<Env>) {
  const p = me(c)
  const { libraries } = p.user
  if (libraries !== 'all' && !libraries.includes('movies'))
    throw new AppError('not-found', 'That movie isn’t in the library.')
  return { userId: p.user.id, deviceId: p.deviceId, libraries }
}

export function registerPlayback(app: OpenAPIHono<Env>) {
  const playback = (c: Context<Env>) => c.get('runtime').playback
  const watch = (c: Context<Env>) => c.get('runtime').movies.playback

  app.openapi(routes.playback.play, (c) => {
    const { id } = c.req.valid('param')
    const session = playback(c).play(viewer(c), id, c.req.valid('json'), {
      address: c.get('client').address,
    })
    return c.json(session, 200)
  })

  app.openapi(routes.playback.progress, (c) => {
    const { id } = c.req.valid('param')
    return c.json(playback(c).progress(me(c).user.id, id, c.req.valid('json')), 200)
  })

  app.openapi(routes.playback.stop, (c) => {
    playback(c).stop(me(c).user.id, c.req.valid('param').id)
    return c.body(null, 204)
  })

  app.openapi(routes.playback.report, (c) => {
    playback(c).report(me(c).deviceId, c.req.valid('json'))
    return c.body(null, 204)
  })

  app.openapi(routes.playback.prefs, (c) => {
    const { userId } = viewer(c)
    return c.json(watch(c).prefs(userId, c.req.valid('param').id), 200)
  })

  app.openapi(routes.playback.setPrefs, (c) => {
    const { userId } = viewer(c)
    return c.json(watch(c).setPrefs(userId, c.req.valid('param').id, c.req.valid('json')), 200)
  })

  app.openapi(routes.playback.played, (c) => {
    watch(c).played(viewer(c).userId, c.req.valid('param').id)
    return c.body(null, 204)
  })

  app.openapi(routes.playback.unplayed, (c) => {
    watch(c).unplayed(viewer(c).userId, c.req.valid('param').id)
    return c.body(null, 204)
  })

  app.openapi(routes.playback.itemProgress, (c) => {
    const { position, duration } = c.req.valid('json')
    return c.json(
      watch(c).position(viewer(c).userId, c.req.valid('param').id, position, duration),
      200,
    )
  })

  app.openapi(routes.playback.next, (c) => {
    const { userId } = viewer(c)
    return c.json({ item: watch(c).next(userId, c.req.valid('param').id) }, 200)
  })

  app.openapi(routes.playback.trickplay, (c) => {
    const { versionId, manifest } = playback(c).trickplay(
      viewer(c),
      c.req.valid('param').id,
      c.req.valid('query').versionId,
    )
    return c.json({ versionId, manifest }, 200)
  })

  // bytes, not JSON: served directly, listed in the document from the contract, as images are
  app.get(routes.playback.trickplaySheet.path.replace(/\{(\w+)\}/g, ':$1'), async (c) => {
    const id = Number(c.req.param('id'))
    const sheet = /^(\d{1,5})\.jpg$/.exec(c.req.param('sheet') ?? '')
    if (c.req.param('type') !== 'movie' || !Number.isInteger(id) || id <= 0 || !sheet)
      throw new AppError('not-found', 'Those previews aren’t made yet.')
    const path = playback(c).trickplaySheet(
      viewer(c),
      id,
      Number(sheet[1]),
      c.req.query('versionId') || undefined,
    )
    const bytes = await readFile(path).catch(() => {
      throw new AppError('not-found', 'Those previews aren’t made yet.')
    })
    return c.body(new Uint8Array(bytes), 200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
  })
  app.openAPIRegistry.registerPath(routes.playback.trickplaySheet)

  // ---------------------------------------------------------------- Settings › Playback (4.3a)

  const settings = (c: Context<Env>) => c.get('runtime').playbackSettings
  const audit = (c: Context<Env>, action: string) =>
    c.get('runtime').auth.ctx.audit({ action, actor: actor(me(c)), address: c.get('meta').address })

  app.openapi(routes.settings.playback, (c) => c.json(settings(c).get(), 200))

  app.openapi(routes.settings.savePlayback, (c) => {
    const saved = settings(c).update(c.req.valid('json'))
    audit(c, 'settings.playback')
    return c.json(saved, 200)
  })

  app.openapi(routes.playback.status, async (c) => c.json(await settings(c).status(), 200))

  app.openapi(routes.playback.clearCache, async (c) => {
    const status = await settings(c).clearCache()
    audit(c, 'playback.cache-cleared')
    return c.json(status, 200)
  })
}
