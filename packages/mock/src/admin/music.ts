// SPDX-License-Identifier: AGPL-3.0-only
// The admin's music routes (HT-68, Phase 5's part D), in the contract (`musicLibrary`,
// api-contract's music-library.ts) and answered here from the mock's music as the admin keeps it
// (music-admin.ts): the artists and albums with their discs, tracks and files, Refresh, Unmatched
// with its match and ignore, each Music folder's figures, and music's naming. The real server
// serves them since HT-101 (apps/server/src/api/music.ts).
//
// What the mock doesn't keep, and what stands in for it here:
// - Refresh reads nothing again: it says it's done, as the job would once MusicBrainz answered;
// - a matched folder's album is the admin's only: the apps' music (music.ts) doesn't gain it;
// - the times: `addedAt` and `foundAt` are moved to the wall clock, as every answer gives them.
import { createT, defineMessages } from '@highsea-tv/i18n'
import { musicLibrary } from '../music.ts'
import { matchedAlbum, musicAdmin, type UnmatchedFolder, unmatchedSeed } from '../music-admin.ts'
import type { MockServer } from '../server.ts'
import type { ClientMusic } from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'

const t = createT(
  defineMessages({
    artist: 'That artist isn’t in the library.',
    album: 'That album isn’t in the library.',
    folder: 'That folder isn’t waiting any more.',
    naming: 'A format can’t be empty.',
    track: 'A track’s file needs {token} in it, or two tracks would get one name.',
  }),
)

const DAY = 86_400_000
const TOPIC = 'music.updated'

/** What the owner changed in this server's music: folders matched or ignored. */
type Kept = {
  unmatched: UnmatchedFolder[]
  matched: { folder: UnmatchedFolder; match: Parameters<typeof matchedAlbum>[2]; at: string }[]
}
const kept = new WeakMap<MockServer, Kept>()

/** Lidarr's default track naming (https://wiki.servarr.com/lidarr/settings#track-naming). */
export const DEFAULT_TRACK_NAMING = {
  rename: false,
  standardFormat:
    '{Album Title} ({Release Year})/{Artist Name} - {Album Title} - {track:00} - {Track Title}',
  multiDiscFormat:
    '{Album Title} ({Release Year})/{Medium Format} {medium:00}/{Artist Name} - {Album Title} - {track:00} - {Track Title}',
  artistFolderFormat: '{Artist Name}',
}
const naming = new WeakMap<MockServer, typeof DEFAULT_TRACK_NAMING>()

export function musicAnswers(kit: AdminKit): Answers {
  const keptOf = (ctx: Ctx): Kept => {
    let k = kept.get(ctx.srv)
    if (!k) {
      k = { unmatched: unmatchedSeed(ctx.srv.kind), matched: [] }
      kept.set(ctx.srv, k)
    }
    return k
  }
  /** The music as the admin keeps it now: the seeded library and what's been matched since. */
  const libraryOf = (ctx: Ctx) => {
    let music: ClientMusic = musicLibrary(ctx.srv.kind, ctx.srv.clock.now())
    for (const m of keptOf(ctx).matched) music = matchedAlbum(music, m.folder, m.match, m.at)
    return musicAdmin(music)
  }
  const changed = <R>(r: R): R => {
    kit.emit(TOPIC)
    return r
  }
  const dated = <T extends { addedAt: string }>(x: T): T => ({ ...x, addedAt: kit.wall(x.addedAt) })

  return {
    musicLibrary: {
      folders: (_, ctx) => {
        const m = libraryOf(ctx)
        const waiting = keptOf(ctx).unmatched
        // the mock's music is all in its first Music folder; any other one is empty
        const music = ctx.srv.state.settings.rootFolders.filter((f) => f.kind === 'music')
        return music.map((f, i) => ({
          id: f.id,
          artists: i === 0 ? m.artists.length : 0,
          albums: i === 0 ? m.albums.length : 0,
          tracks: i === 0 ? m.albums.reduce((n, a) => n + a.tracks, 0) : 0,
          size: i === 0 ? m.size : 0,
          unmatched: i === 0 ? waiting.length : 0,
        }))
      },
      unmatched: (_, ctx) =>
        keptOf(ctx).unmatched.map(({ days, ...u }) => ({
          ...u,
          foundAt: kit.wallMs(ctx.srv.clock.now() - days * DAY),
        })),
      match: ({ params, body }, ctx) => {
        const k = keptOf(ctx)
        const folder = k.unmatched.find((u) => u.id === params.id)
        if (!folder) throw refuse('not-found', t('folder'))
        k.unmatched = k.unmatched.filter((u) => u.id !== params.id)
        k.matched.push({
          folder,
          match: { artist: body.artist, album: body.album, year: body.year },
          at: new Date(ctx.srv.clock.now()).toISOString(),
        })
        return changed(undefined)
      },
      ignore: ({ params }, ctx) => {
        const k = keptOf(ctx)
        if (!k.unmatched.some((u) => u.id === params.id)) throw refuse('not-found', t('folder'))
        k.unmatched = k.unmatched.filter((u) => u.id !== params.id)
        return changed(undefined)
      },
      artists: (_, ctx) => libraryOf(ctx).artists.map(dated),
      artist: ({ params }, ctx) => {
        const a = libraryOf(ctx).artist(params.id)
        if (!a) throw refuse('not-found', t('artist'))
        return { ...dated(a), albumList: a.albumList.map(dated) }
      },
      refreshArtist: ({ params }, ctx) => {
        if (!libraryOf(ctx).artist(params.id)) throw refuse('not-found', t('artist'))
        return changed(undefined)
      },
      albums: (_, ctx) => libraryOf(ctx).albums.map(dated),
      album: ({ params }, ctx) => {
        const a = libraryOf(ctx).album(params.id)
        if (!a) throw refuse('not-found', t('album'))
        return dated(a)
      },
      refreshAlbum: ({ params }, ctx) => {
        if (!libraryOf(ctx).album(params.id)) throw refuse('not-found', t('album'))
        return changed(undefined)
      },
      naming: (_, ctx) => naming.get(ctx.srv) ?? DEFAULT_TRACK_NAMING,
      saveNaming: ({ body }, ctx) => {
        for (const k of ['standardFormat', 'multiDiscFormat', 'artistFolderFormat'] as const)
          if (!body[k].trim()) throw refuse('invalid', t('naming'), { reason: k })
        for (const k of ['standardFormat', 'multiDiscFormat'] as const)
          if (!/\{track(:0+)?\}/i.test(body[k]))
            throw refuse('invalid', t('track', { token: '{track:00}' }), { reason: k })
        naming.set(ctx.srv, body)
        kit.emit('settings.updated')
        return body
      },
    },
  }
}
