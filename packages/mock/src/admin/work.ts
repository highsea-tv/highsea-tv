// SPDX-License-Identifier: AGPL-3.0-only
// The admin's work routes (one-client-platform-d.md › D2), answered from the mock's api: Activity's
// queue, history and blocklist, Downloads, and (from work-imports.ts and work-indexers.ts) manual
// import, library import, the folder picker, indexers and the catalog's definitions.
//
// The mock keeps a title's own id on its torrents, history and blocklist (`itemId`); the contract
// addresses a movie by its TMDB id, so each is looked up in the mock's items. A row for an episode
// (the prototype's stage 6) has no movie: the queue shows it with `movieId: null`, and history,
// whose rows always have a movie, leaves it out, as a server without shows has none.
import {
  type BlocklistEntry,
  DOWNLOAD_TOPICS,
  type HistoryEvent,
  type QueueItem,
  type Torrent,
  type TorrentCategory,
} from '@highsea-tv/api-contract'
import type { ServerState } from '../seed.ts'
import type { Torrent as MockTorrent } from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'
import { importAnswers } from './work-imports.ts'
import { indexerAnswers } from './work-indexers.ts'
import { movieOf, tw } from './work-shared.ts'

/** History's page, as the server pages it. */
const PAGE = 50
/** Where the mock's torrents save; each category's folder under it, as `{downloads}/{name}`. */
const DOWNLOADS = '/data/downloads/complete'

/** A torrent added by hand is `manual`'s; the mock files those under `movies`. */
const categoryOf = (t: MockTorrent) =>
  t.itemId === null && t.category === 'movies' ? 'manual' : t.category

export function workAnswers(kit: AdminKit): Answers {
  const { wall, emit } = kit

  const torrentOf = (s: ServerState, t: MockTorrent): Torrent => ({
    id: t.id,
    name: t.name,
    infoHash: t.infoHash,
    movieId: movieOf(s, t.itemId)?.tmdbId ?? null,
    category: categoryOf(t),
    manual: t.itemId === null,
    size: t.size,
    downloaded: t.downloaded,
    uploaded: t.uploaded,
    progress: t.progress,
    downRate: t.downRate,
    upRate: t.upRate,
    eta: t.eta,
    peers: { ...t.peers },
    seeds: { ...t.seeds },
    ratio: t.ratio,
    state: t.state,
    stateReason: t.stateReason,
    indexer: t.indexer,
    quality: t.quality,
    addedAt: wall(t.addedAt),
    completedAt: t.completedAt && wall(t.completedAt),
    savePath: t.savePath,
    // a private tracker's torrent is one from a private indexer
    private: s.indexers.some((i) => i.name === t.indexer && i.privacy === 'private'),
    files: t.files.map((f) => ({ ...f })),
    trackers: t.trackers.map((x) => ({ ...x })),
    // the mock keeps no minimum seeding time: none, as Settings › Download client's default has
    seedingRule: { ratio: t.seedingRule.ratio, minutes: t.seedingRule.minutes, minMinutes: null },
  })

  /** The queue's row for a torrent, from the mock's own queue (which names an episode by its show). */
  const queueOf = (ctx: Ctx, t: MockTorrent): QueueItem => {
    const row = ctx.api.queue.list().find((q) => q.torrentId === t.id)
    const m = movieOf(ctx.srv.state, t.itemId)
    return {
      id: `q-${t.id}`,
      torrentId: t.id,
      movieId: m?.tmdbId ?? null,
      title: m?.title ?? row?.title ?? t.name,
      year: m?.year ?? null,
      release: t.name,
      quality: t.quality,
      size: t.size,
      progress: t.progress,
      downRate: t.downRate,
      upRate: t.upRate,
      eta: t.eta,
      ratio: t.ratio,
      state: t.state,
      stateReason: t.stateReason,
    }
  }

  /** A queue id's torrent: the queue holds a library's grabs until they're done. */
  const queued = (ctx: Ctx, id: string) => {
    const t = ctx.srv.state.torrents.find(
      (x) => `q-${x.id}` === id && x.itemId && x.state !== 'completed',
    )
    if (!t) throw refuse('not-found', tw('work.queueGone'))
    return t
  }

  const torrent = (ctx: Ctx, id: string) => {
    const t = ctx.srv.state.torrents.find((x) => x.id === id)
    if (!t) throw refuse('not-found', tw('work.torrentGone'))
    return t
  }

  /** The blocklist's row for a torrent, as Remove › Blocklist and Find another write it. */
  const blocklistTorrent = (ctx: Ctx, t: MockTorrent, reason: string) => {
    if (!t.itemId) return
    ctx.srv.state.blocklist.unshift({
      id: `bl-${t.id}-${ctx.srv.clock.now()}`,
      itemId: t.itemId,
      sourceTitle: t.name,
      indexer: t.indexer ?? 'Manual',
      reason,
      date: new Date(ctx.srv.clock.now()).toISOString(),
    })
  }

  const historyOf = (s: ServerState): HistoryEvent[] =>
    s.history.flatMap((h) => {
      const m = movieOf(s, h.itemId)
      return m
        ? [
            {
              id: h.id,
              movieId: m.tmdbId,
              title: m.title,
              year: m.year,
              type: h.type,
              date: wall(h.date),
              sourceTitle: h.sourceTitle,
              quality: h.quality,
              indexer: h.indexer,
              message: h.message,
            },
          ]
        : []
    })

  const blocklistOf = (s: ServerState): BlocklistEntry[] =>
    s.blocklist.map((b) => {
      const m = movieOf(s, b.itemId)
      return {
        id: b.id,
        movieId: m?.tmdbId ?? null,
        title: m?.title ?? null,
        year: m?.year ?? null,
        sourceTitle: b.sourceTitle,
        indexer: b.indexer,
        // the mock keeps no quality on a blocklisted release
        quality: null,
        reason: b.reason,
        date: wall(b.date),
      }
    })

  /** Movies, manual, then any other a torrent is in, by name; the mock keeps no owner's categories. */
  const categoriesOf = (s: ServerState): TorrentCategory[] => {
    const count = (name: string) => s.torrents.filter((t) => categoryOf(t) === name).length
    const others = [...new Set(s.torrents.map(categoryOf))]
      .filter((n) => n !== 'movies' && n !== 'manual')
      .sort((a, b) => a.localeCompare(b))
    return [
      { name: 'movies', folder: `${DOWNLOADS}/movies`, fixed: true, torrents: count('movies') },
      { name: 'manual', folder: `${DOWNLOADS}/manual`, fixed: true, torrents: count('manual') },
      ...others.map((name) => ({
        name,
        folder: `${DOWNLOADS}/${name}`,
        fixed: false,
        torrents: count(name),
      })),
    ]
  }

  /** The name the mock gives a torrent added from a link (server.ts's downloads.add). */
  const nameOf = (link: string) =>
    link.startsWith('magnet:')
      ? decodeURIComponent(link.split('&dn=')[1]?.split('&')[0] ?? 'Custom.Magnet.Release')
      : (link.split('/').pop() ?? 'Custom.Torrent.Release')

  const own: Answers = {
    queue: {
      list: (_, ctx) => {
        const s = ctx.srv.state
        return ctx.api.queue.list().flatMap((q) => {
          const t = s.torrents.find((x) => x.id === q.torrentId)
          return t ? [queueOf(ctx, t)] : []
        })
      },
      pause: ({ params }, ctx) => {
        const t = queued(ctx, params.id)
        ctx.api.queue.pause(t.id)
        return queueOf(ctx, t)
      },
      resume: ({ params }, ctx) => {
        const t = queued(ctx, params.id)
        ctx.api.queue.resume(t.id)
        return queueOf(ctx, t)
      },
      forceImport: ({ params }, ctx) => {
        const t = queued(ctx, params.id)
        if (t.state !== 'import-blocked') throw refuse('conflict', tw('work.onlyBlocked'))
        ctx.api.queue.forceImport(t.id)
        return queueOf(ctx, t)
      },
      searchAlternative: ({ params, body }, ctx) => {
        const t = queued(ctx, params.id)
        if (t.state === 'error') throw refuse('conflict', tw('work.finished'))
        const reason = body?.reason?.trim() || t.stateReason || tw('work.replaced')
        ctx.api.queue.searchAlternative(t.id)
        // the mock writes the torrent's own reason; the one given wins, as on the server
        const entry = ctx.srv.state.blocklist[0]
        if (entry?.sourceTitle === t.name) entry.reason = reason
        emit(DOWNLOAD_TOPICS.history)
        return undefined
      },
      remove: ({ params, body }, ctx) => {
        const t = queued(ctx, params.id)
        if (body?.blocklist) blocklistTorrent(ctx, t, tw('work.removed'))
        ctx.api.queue.remove(t.id, body?.deleteData ?? false)
        if (body?.blocklist) emit(DOWNLOAD_TOPICS.history)
        return undefined
      },
    },

    history: {
      list: ({ query }, ctx) => {
        const all = historyOf(ctx.srv.state)
        const from = query.cursor ? Number(query.cursor) : 0
        if (!Number.isInteger(from) || from < 0 || from > all.length)
          throw refuse('invalid', tw('work.badCursor'), { field: 'cursor' })
        const items = all.slice(from, from + PAGE)
        return { items, next: from + PAGE < all.length ? String(from + PAGE) : null }
      },
      clear: (_, ctx) => {
        ctx.api.history.clear()
        return undefined
      },
    },

    blocklist: {
      list: (_, ctx) => blocklistOf(ctx.srv.state),
      remove: ({ params }, ctx) => {
        if (!ctx.srv.state.blocklist.some((b) => b.id === params.id))
          throw refuse('not-found', tw('work.blocklistGone'))
        ctx.api.blocklist.remove(params.id)
        return undefined
      },
    },

    downloads: {
      list: (_, ctx) => ctx.api.downloads.list().map((t) => torrentOf(ctx.srv.state, t)),
      get: ({ params }, ctx) => torrentOf(ctx.srv.state, torrent(ctx, params.id)),
      add: ({ body }, ctx) => {
        const s = ctx.srv.state
        const category = body.category ?? 'manual'
        if (category === 'movies')
          throw refuse('invalid', tw('work.moviesCategory'), { field: 'category' })
        if (!categoriesOf(s).some((c) => c.name === category))
          throw refuse('invalid', tw('work.noCategory', { name: category }), {
            field: 'category',
          })
        const link = body.urlOrMagnet?.trim()
        if (link && !link.startsWith('magnet:') && !/^https?:\/\//i.test(link))
          throw refuse('invalid', tw('work.notALink'), { field: 'urlOrMagnet' })
        // a .torrent's bytes aren't read: the mock names it as a release added by hand
        const source = link ?? 'Manual.Release.torrent'
        if (s.torrents.some((t) => t.name === nameOf(source)))
          throw refuse('conflict', tw('work.duplicate'))
        const added = ctx.api.downloads.add({
          urlOrMagnet: source,
          category,
          savePath: `${DOWNLOADS}/${category}`,
          startImmediately: !body.paused,
        })
        return torrentOf(s, added)
      },
      delete: ({ params, body }, ctx) => {
        torrent(ctx, params.id)
        ctx.api.downloads.delete(params.id, body?.deleteData ?? false)
        return undefined
      },
      pause: ({ params }, ctx) => {
        const t = torrent(ctx, params.id)
        ctx.api.downloads.pause(t.id)
        return torrentOf(ctx.srv.state, t)
      },
      resume: ({ params }, ctx) => {
        const t = torrent(ctx, params.id)
        ctx.api.downloads.resume(t.id)
        return torrentOf(ctx.srv.state, t)
      },
      pauseAll: (_, ctx) => {
        ctx.api.downloads.pauseAll()
        return undefined
      },
      resumeAll: (_, ctx) => {
        ctx.api.downloads.resumeAll()
        return undefined
      },
      setFilePriority: ({ params, body }, ctx) => {
        const t = torrent(ctx, params.id)
        if (!t.files.some((f) => f.path === body.path))
          throw refuse('not-found', tw('work.fileGone'))
        ctx.api.downloads.setFilePriority(t.id, body.path, body.priority)
        return torrentOf(ctx.srv.state, t)
      },
      limits: (_, ctx) => {
        const l = ctx.api.downloads.limits()
        return { downloadRate: l.downRateLimit, uploadRate: l.upRateLimit }
      },
      setLimits: ({ body }, ctx) => {
        const l = ctx.api.downloads.setLimits({
          ...(body.downloadRate === undefined ? {} : { downRateLimit: body.downloadRate }),
          ...(body.uploadRate === undefined ? {} : { upRateLimit: body.uploadRate }),
        })
        return { downloadRate: l.downRateLimit, uploadRate: l.upRateLimit }
      },
      categories: (_, ctx) => categoriesOf(ctx.srv.state),
    },
  }

  const out: Record<string, Record<string, unknown>> = {}
  for (const area of [own, importAnswers(kit), indexerAnswers(kit)] as Record<
    string,
    Record<string, unknown>
  >[])
    for (const [group, routes] of Object.entries(area)) out[group] = { ...out[group], ...routes }
  return out as Answers
}
