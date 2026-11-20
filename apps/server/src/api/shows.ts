// SPDX-License-Identifier: AGPL-3.0-only
// Shows over HTTP (Phase 5 B, ADR 0064): the apps' `/shows` (client-shows.md) and the admin's
// `/series` (shows.md) with Shows' settings and the unmatched files' Match and Dismiss, thin
// handlers over @highsea-tv/media/shows. The admin
// addresses a show by its TMDB id as a string. Search, the interactive release search for a season
// or an episode and its grab are part C1's, over the runtime's show search and downloads. Someone
// who can't see the shows gets none: an empty list and a 404 for a show. Every admin change goes
// in the audit log, as the films' do.
import { routes } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'
import { viewer } from './playback.ts'

export function registerShows(app: OpenAPIHono<Env>) {
  const shows = (c: Context<Env>) => c.get('runtime').shows
  const audit = (c: Context<Env>, action: string, id?: string) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      ...(id ? { targetType: 'show', targetId: id } : {}),
    })

  // ---------------------------------------------------------------- the apps

  app.openapi(routes.shows.list, (c) => {
    const p = me(c)
    const { libraries } = p.user
    if (libraries !== 'all' && !libraries.includes('shows')) return c.json([], 200)
    return c.json(shows(c).client.list(p.profileId), 200)
  })

  app.openapi(routes.shows.show, (c) => {
    const who = viewer(c, 'episode')
    return c.json(shows(c).client.show(c.req.valid('param').id, who.profileId), 200)
  })

  app.openapi(routes.shows.watched, (c) => {
    const { season, watched } = c.req.valid('json')
    shows(c).client.setWatched(viewer(c, 'episode'), c.req.valid('param').id, season, watched)
    return c.body(null, 204)
  })

  // ---------------------------------------------------------------- the admin
  // static paths before `/series/{id}`, in the contract's order

  app.openapi(routes.series.discover, async (c) => {
    const { query, page } = c.req.valid('query')
    return c.json(await shows(c).admin.discover(query, page), 200)
  })

  app.openapi(routes.series.rootFolders, (c) => c.json(shows(c).admin.rootFolders(), 200))

  app.openapi(routes.series.naming, (c) => c.json(shows(c).settings.naming(), 200))

  app.openapi(routes.series.saveNaming, (c) => {
    const saved = shows(c).settings.saveNaming(c.req.valid('json'))
    audit(c, 'settings.episode-naming')
    return c.json(saved, 200)
  })

  app.openapi(routes.series.qualitySizes, (c) => c.json(shows(c).settings.sizes(), 200))

  app.openapi(routes.series.saveQualitySizes, (c) => {
    const saved = shows(c).settings.saveSizes(c.req.valid('json'))
    audit(c, 'settings.episode-sizes')
    return c.json(saved, 200)
  })

  app.openapi(routes.series.profileUsage, (c) => {
    const ids = c
      .get('runtime')
      .media.profiles.list()
      .map((p) => p.id)
    return c.json(shows(c).settings.profileUsage(ids), 200)
  })

  app.openapi(routes.series.unmatched, (c) =>
    c.json(shows(c).admin.unmatched(c.req.valid('query').rootFolder), 200),
  )

  app.openapi(routes.series.matchUnmatched, async (c) => {
    const { path, show, episodes } = c.req.valid('json')
    await shows(c).matchUnmatched({ path, tmdbId: show ? Number(show) : undefined, episodes })
    audit(c, 'show.unmatched-matched', show)
    return c.body(null, 204)
  })

  app.openapi(routes.series.dismissUnmatched, (c) => {
    shows(c).dismissUnmatched(c.req.valid('json').path)
    audit(c, 'show.unmatched-dismissed')
    return c.body(null, 204)
  })

  app.openapi(routes.series.list, (c) => c.json(shows(c).admin.list(), 200))

  app.openapi(routes.series.add, async (c) => {
    const input = c.req.valid('json')
    const { show, created } = await shows(c).add(input)
    if (created) audit(c, 'show.added', String(show.tmdbId))
    // Start searching (Phase 5 C1): the missing episodes it monitors, as Search on the show; with
    // no indexer yet, or a folder highsea only reads, the show is added and nothing is searched
    const rt = c.get('runtime')
    if (
      created &&
      input.search &&
      rt.indexers.hasEnabled() &&
      rt.media.rootFolders.readOnlyAt(show.path) === null
    )
      rt.showSearch.queue(show.tmdbId)
    return c.json(shows(c).admin.detailOf(show), 200)
  })

  app.openapi(routes.series.get, (c) => c.json(shows(c).admin.get(c.req.valid('param').id), 200))

  app.openapi(routes.series.update, (c) => {
    const { id } = c.req.valid('param')
    const saved = shows(c).admin.update(id, c.req.valid('json'))
    audit(c, 'show.updated', id)
    return c.json(saved, 200)
  })

  app.openapi(routes.series.remove, (c) => {
    const { id } = c.req.valid('param')
    shows(c).admin.remove(id, c.req.valid('query').deleteFiles === 'true')
    audit(c, 'show.removed', id)
    return c.body(null, 204)
  })

  app.openapi(routes.series.refresh, async (c) => {
    const { id } = c.req.valid('param')
    if (!/^\d+$/.test(id)) throw new AppError('not-found', 'That show isn’t in the library.')
    await shows(c).refresh(Number(id))
    audit(c, 'show.refreshed', id)
    return c.body(null, 204)
  })

  app.openapi(routes.series.monitorSeason, (c) => {
    const { id, season } = c.req.valid('param')
    shows(c).admin.monitorSeason(id, season, c.req.valid('json').monitored)
    audit(c, 'show.season-monitored', id)
    return c.body(null, 204)
  })

  app.openapi(routes.series.monitorEpisode, (c) => {
    const { id, episodeId } = c.req.valid('param')
    if (!/^\d+$/.test(episodeId))
      throw new AppError('not-found', 'That episode isn’t in this show.')
    shows(c).admin.monitorEpisode(id, episodeId, c.req.valid('json').monitored)
    audit(c, 'show.episode-monitored', id)
    return c.body(null, 204)
  })

  // ---------------------------------------------------------------- searching and grabbing (C1)

  app.openapi(routes.series.search, (c) => {
    const { id } = c.req.valid('param')
    const { tmdbId, scope } = shows(c).admin.scopeOf(id, c.req.valid('json'))
    const found = c.get('runtime').showSearch.queue(tmdbId, scope)
    audit(c, 'show.searched', id)
    return c.json({ found }, 200)
  })

  app.openapi(routes.series.interactiveSearch, async (c) => {
    const { id } = c.req.valid('param')
    const { tmdbId, scope } = shows(c).admin.scopeOf(id, c.req.valid('json'))
    if (!scope) throw new AppError('invalid', 'Pick a season or an episode.')
    const result = await c.get('runtime').showSearch.interactive(tmdbId, scope)
    return c.json({ ...result, releases: result.releases.map(release) }, 200)
  })

  app.openapi(routes.series.releases, (c) => {
    const { id } = c.req.valid('param')
    const { tmdbId, scope } = shows(c).admin.scopeOf(id, c.req.valid('query'))
    if (!scope) throw new AppError('invalid', 'Pick a season or an episode.')
    return c.json(c.get('runtime').indexers.episodeReleases(tmdbId, scope).map(release), 200)
  })

  app.openapi(routes.series.grabRelease, async (c) => {
    const { id, guid } = c.req.valid('param')
    const { indexerId, season, episode, force } = c.req.valid('json')
    const rt = c.get('runtime')
    const { tmdbId, scope } = shows(c).admin.scopeOf(id, { season, episode })
    const show = rt.showSearch.inputFor(tmdbId, scope ?? { season })
    if (!show || !scope) throw new AppError('not-found', 'That show isn’t in the library.')
    const item = await rt.downloads.grabEpisodes({
      itemId: show.showItemId,
      scope,
      indexerId,
      guid,
      force,
    })
    audit(c, force ? 'release.grabbed-anyway' : 'release.grabbed', id)
    return c.json(item, 200)
  })

  // an episode's intro and credits (Phase 5 C2, ADR 0067): the owner's word, or found again
  app.openapi(routes.series.setMarkers, (c) => {
    const { id, episodeId } = c.req.valid('param')
    if (!/^\d+$/.test(episodeId))
      throw new AppError('not-found', 'That episode isn’t in this show.')
    shows(c).admin.setMarkers(id, episodeId, c.req.valid('json'))
    audit(c, 'show.episode-markers', id)
    return c.body(null, 204)
  })

  app.openapi(routes.series.findMarkers, (c) => {
    const { id, episodeId } = c.req.valid('param')
    if (!/^\d+$/.test(episodeId))
      throw new AppError('not-found', 'That episode isn’t in this show.')
    shows(c).admin.findMarkers(id, episodeId)
    audit(c, 'show.episode-markers-found', id)
    return c.body(null, 204)
  })
}

/** A show's release as the contract has it: the episode items' ids stay on the server. */
const release = <R extends { episodeIds: string[] }>({ episodeIds: _ids, ...rest }: R) => rest
