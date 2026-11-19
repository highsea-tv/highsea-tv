// SPDX-License-Identifier: AGPL-3.0-only
// Music over HTTP (Phase 5 D, HT-101; ADR 0065): the admin's `/music/artists`, `/albums`,
// `/unmatched` and `/folders` with Match, Ignore, Refresh and track naming; the apps' `/music`
// with the queue, playing a song and their own playlists; and covers and artists' pictures. Thin
// handlers over @highsea-tv/media/music and the runtime's music playback. Someone who can't hear
// the music library gets none: an empty library and a 404 for the rest, as the shows' routes do.
// Every admin change goes in the audit log.
//
// A song's bytes are `/stream/music/{token}` (stream/index.ts), not here: its token is the
// credential, as a film's file's is, so a media element can read it by ranges.
import { readFile } from 'node:fs/promises'
import { routes } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

/** An hour's caching would leave a new cover unseen a while; a day, and the ETag answers sooner. */
const MUSIC_IMAGE_CACHE = 'private, max-age=86400'

/** The person, their profile and device, when they may hear the music; else a 404. */
export function listener(c: Context<Env>, what = 'That isn’t in the library.') {
  const p = me(c)
  const { libraries } = p.user
  if (libraries !== 'all' && !libraries.includes('music')) throw new AppError('not-found', what)
  return { userId: p.user.id, profileId: p.profileId, deviceId: p.deviceId }
}

const hears = (c: Context<Env>) => {
  const { libraries } = me(c).user
  return libraries === 'all' || libraries.includes('music')
}

export function registerMusic(app: OpenAPIHono<Env>) {
  const music = (c: Context<Env>) => c.get('runtime').music
  const audit = (c: Context<Env>, action: string, target?: { type: string; id: string }) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      ...(target ? { targetType: target.type, targetId: target.id } : {}),
    })

  // ---------------------------------------------------------------- the admin

  app.openapi(routes.musicLibrary.folders, (c) => c.json(music(c).admin.folders(), 200))

  app.openapi(routes.musicLibrary.unmatched, (c) => c.json(music(c).admin.unmatched(), 200))

  app.openapi(routes.musicLibrary.match, async (c) => {
    const { id } = c.req.valid('param')
    const { albumId } = await music(c).manage.match(id, c.req.valid('json'))
    audit(
      c,
      'music.matched',
      albumId ? { type: 'album', id: albumId } : { type: 'music-folder', id },
    )
    return c.body(null, 204)
  })

  app.openapi(routes.musicLibrary.ignore, (c) => {
    const { id } = c.req.valid('param')
    music(c).admin.ignore(id)
    audit(c, 'music.ignored', { type: 'music-folder', id })
    return c.body(null, 204)
  })

  app.openapi(routes.musicLibrary.artists, (c) => c.json(music(c).admin.artists(), 200))

  app.openapi(routes.musicLibrary.artist, (c) =>
    c.json(music(c).admin.artist(c.req.valid('param').id), 200),
  )

  app.openapi(routes.musicLibrary.refreshArtist, async (c) => {
    const { id } = c.req.valid('param')
    await music(c).manage.refreshArtist(id)
    audit(c, 'music.refreshed', { type: 'artist', id })
    return c.body(null, 204)
  })

  app.openapi(routes.musicLibrary.albums, (c) => c.json(music(c).admin.albums(), 200))

  app.openapi(routes.musicLibrary.album, (c) =>
    c.json(music(c).admin.album(c.req.valid('param').id), 200),
  )

  app.openapi(routes.musicLibrary.refreshAlbum, async (c) => {
    const { id } = c.req.valid('param')
    await music(c).manage.refreshAlbum(id)
    audit(c, 'music.refreshed', { type: 'album', id })
    return c.body(null, 204)
  })

  app.openapi(routes.musicLibrary.naming, (c) => c.json(music(c).manage.naming(), 200))

  app.openapi(routes.musicLibrary.saveNaming, (c) => {
    const saved = music(c).manage.saveNaming(c.req.valid('json'))
    audit(c, 'settings.track-naming')
    return c.json(saved, 200)
  })

  // ---------------------------------------------------------------- the apps

  app.openapi(routes.music.library, (c) =>
    c.json(hears(c) ? music(c).client.library() : { artists: [], albums: [] }, 200),
  )

  app.openapi(routes.music.songs, (c) => c.json(hears(c) ? music(c).client.songs() : [], 200))

  app.openapi(routes.music.album, (c) => {
    listener(c, 'That album isn’t here.')
    return c.json(music(c).client.album(c.req.valid('param').id), 200)
  })

  app.openapi(routes.music.artist, (c) => {
    listener(c, 'That artist isn’t here.')
    return c.json(music(c).client.artist(c.req.valid('param').id), 200)
  })

  app.openapi(routes.music.queue, (c) => {
    const who = listener(c, 'There’s nothing to play.')
    const { source, shuffle } = c.req.valid('json')
    return c.json(music(c).client.queue(who, source, shuffle), 200)
  })

  app.openapi(routes.music.tracks, (c) => {
    if (!hears(c)) return c.json([], 200)
    const ids = c.req
      .valid('query')
      .ids.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return c.json(music(c).client.tracks(ids), 200)
  })

  app.openapi(routes.music.play, (c) => {
    const who = listener(c, 'That song isn’t here.')
    const play = c
      .get('runtime')
      .musicPlayback.play(who, c.req.valid('param').id, c.req.valid('json'), {
        address: c.get('meta').address,
      })
    return c.json(play, 200)
  })

  app.openapi(routes.music.progress, (c) => {
    const who = listener(c, 'That play has ended.')
    c.get('runtime').musicPlayback.progress(who, c.req.valid('param').id, c.req.valid('json'))
    return c.body(null, 204)
  })

  app.openapi(routes.music.stop, (c) => {
    const who = listener(c, 'That play has ended.')
    c.get('runtime').musicPlayback.stop(who, c.req.valid('param').id)
    return c.body(null, 204)
  })

  // bytes, not JSON: served directly, listed in the document from the contract
  app.get(routes.music.image.path.replace(/\{(\w+)\}/g, ':$1'), async (c) => {
    const kind = c.req.param('kind')
    if (kind !== 'album' && kind !== 'artist')
      throw new AppError('not-found', 'There’s no picture.')
    listener(c, 'There’s no picture.')
    const image = await music(c).images.get(kind, c.req.param('id') ?? '')
    const { etag } = image
    const headers: Record<string, string> = {
      ETag: etag,
      'Cache-Control': MUSIC_IMAGE_CACHE,
      // MDN, X-Content-Type-Options: the browser keeps to the declared type
      'X-Content-Type-Options': 'nosniff',
    }
    // RFC 9110 § 13.1.2: a weak comparison against every tag the client lists
    const match = c.req.header('if-none-match')
    if (match?.split(',').some((t) => t.trim().replace(/^W\//, '') === etag))
      return c.body(null, 304, headers)
    const bytes = await readFile(image.path)
    return c.body(new Uint8Array(bytes), 200, { ...headers, 'Content-Type': image.contentType })
  })
  app.openAPIRegistry.registerPath(routes.music.image)

  // ---------------------------------------------------------------- playlists, each profile's own

  const owner = (c: Context<Env>) => listener(c, 'That playlist isn’t yours, or was deleted.')

  app.openapi(routes.playlists.list, (c) =>
    c.json(hears(c) ? music(c).playlists.list(owner(c)) : [], 200),
  )

  app.openapi(routes.playlists.get, (c) =>
    c.json(music(c).playlists.get(owner(c), c.req.valid('param').id), 200),
  )

  app.openapi(routes.playlists.create, (c) => {
    const { name, songs } = c.req.valid('json')
    return c.json(music(c).playlists.create(owner(c), name, songs), 200)
  })

  app.openapi(routes.playlists.rename, (c) => {
    music(c).playlists.rename(owner(c), c.req.valid('param').id, c.req.valid('json').name)
    return c.body(null, 204)
  })

  app.openapi(routes.playlists.add, (c) => {
    music(c).playlists.add(owner(c), c.req.valid('param').id, c.req.valid('json').songs)
    return c.body(null, 204)
  })

  app.openapi(routes.playlists.remove, (c) => {
    const { id, entry } = c.req.valid('param')
    music(c).playlists.remove(owner(c), id, entry)
    return c.body(null, 204)
  })

  app.openapi(routes.playlists.reorder, (c) => {
    music(c).playlists.reorder(owner(c), c.req.valid('param').id, c.req.valid('json').entries)
    return c.body(null, 204)
  })

  app.openapi(routes.playlists.delete, (c) => {
    music(c).playlists.delete(owner(c), c.req.valid('param').id)
    return c.body(null, 204)
  })
}
