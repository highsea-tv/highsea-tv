// SPDX-License-Identifier: AGPL-3.0-only
// The admin's movies routes (one-client-platform-d.md › D2), answered from the mock's api: the
// library and a movie's page (its versions, files, history, release search and grabs), Discover,
// Upcoming and Recently added, TMDB's metadata, Wanted and the calendar with its feed, and the
// import lists the add dialog reads. Smart collections are movies-collections.ts's.
//
// The checks are the server's own (packages/media's library, packages/downloads' grab, the wanted
// routes), in its words, before the mock's writes run; the mock's writes raise their own topics
// (`movies.updated`, `item.updated`, `queue.updated`), which the transport relays.
//
// What the mock doesn't keep, and what stands in for it here:
// - tags on movies: kept beside the mock, per transport, from add, update and the bulk bar;
// - a release search's freshness: the last search per movie is kept for 30 minutes, as the
//   indexers' service keeps it, so `releases` and a grab answer as the server's do;
// - a release's protocol, grabs, flags and languages: torrent, unknown, none and none;
// - a movie's digital release: 45 days after its cinema one, a plain gap for the calendar;
// - the calendar feed's key: per person, made and revoked here, under the host's own address.
import {
  CALENDAR_KINDS,
  type CalendarEntry,
  type ImportList,
  MEDIA_TOPICS,
  type Movie,
  type MovieMetadata,
  type QueueItem,
  type Release,
} from '@highsea-tv/api-contract'
import { credit, dayOf, tmdbNumber, video } from '../films.ts'
import {
  collectionRefs,
  movieMetadata,
  recommendations,
  collection as tmdbCollection,
} from '../metadata.ts'
import type {
  MediaItem,
  ImportListSettings as MockListSettings,
  Release as MockRelease,
  Torrent,
} from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'
import { collectionsAnswers } from './movies-collections.ts'
import { DAY, type MoviesMemory, moviesKit, pageOf, t, titleMatches } from './movies-shared.ts'

/** How long a search's releases stay grabbable (the indexers' service's 30 minutes). */
const FRESH_MS = 30 * 60_000
/** The calendar's widest range (packages/media's CALENDAR_MAX_DAYS). */
const CALENDAR_MAX_DAYS = 400
/** TMDB's page size, for Discover. */
const DISCOVER_PAGE = 20
/** A digital release's gap after the cinema one, which the mock doesn't have. */
const DIGITAL_AFTER_DAYS = 45
const MAX_VERSIONS = 10

/** A movies list's source as the contract has it: TMDB's shows' charts are only a shows list's. */
const settingsOf = (s: MockListSettings): ImportList['settings'] => {
  if (s.kind !== 'tmdb') return s
  const { source } = s
  return source === 'on-the-air' || source === 'airing-today'
    ? { kind: 'tmdb', source: 'popular' }
    : { ...s, source }
}

export function moviesAnswers(kit: AdminKit): Answers {
  const memory: MoviesMemory = { tags: new Map(), searches: new Map(), feed: new Map() }
  const k = moviesKit(kit, memory)
  const { inLibrary, movieOf, discoverOf, libraryOf } = k

  const movies = (ctx: Ctx) => libraryOf(ctx.srv.state).map(movieOf)
  const enabledIndexers = (ctx: Ctx) => ctx.srv.state.indexers.filter((i) => i.enabled)
  const requireIndexers = (ctx: Ctx) => {
    if (!enabledIndexers(ctx).length)
      throw refuse('conflict', t('movies.noIndexers'), { reason: 'no-indexers' })
  }
  const requireFolder = (ctx: Ctx, path: string) => {
    if (!ctx.api.movies.rootFolders().includes(path))
      throw refuse('invalid', t('movies.rootFolder'), {
        field: 'rootFolder',
        reason: 'unknown-root-folder',
      })
  }
  const requireQualityProfile = (ctx: Ctx, id: string) => {
    if (!ctx.srv.state.qualityProfiles.some((p) => p.id === id))
      throw refuse('not-found', t('movies.qualityProfile'))
  }
  const requireLanguageProfile = (ctx: Ctx, id: string | null | undefined) => {
    if (id && !ctx.srv.state.languageProfiles.some((p) => p.id === id))
      throw refuse('not-found', t('movies.languageProfile'), {
        field: 'languageProfileId',
        reason: 'unknown',
      })
  }
  const requireLabels = (labels: string[]) => {
    const seen = new Set(labels.map((l) => l.trim().toLowerCase()))
    if (seen.size !== labels.length)
      throw refuse('invalid', t('movies.duplicateLabel'), {
        field: 'label',
        reason: 'duplicate-label',
      })
  }
  /** The mock's update, which raises `movies.updated` and `item.updated` itself. */
  const write = (ctx: Ctx, m: MediaItem, patch: Partial<MediaItem>) =>
    movieOf(ctx.api.movies.update(m.id, patch))

  const releaseOf = (ctx: Ctx, r: MockRelease): Release => ({
    guid: r.guid,
    title: r.title,
    indexerId: r.indexerId,
    indexer: r.indexer,
    protocol: 'torrent',
    size: r.size,
    seeders: r.seeders,
    leechers: r.leechers,
    grabs: null,
    publishedAt: kit.wallMs(ctx.srv.clock.now() - r.ageHours * 3_600_000),
    ageHours: r.ageHours,
    details: null,
    quality: r.quality,
    customFormats: r.customFormats,
    formatScore: r.formatScore,
    flags: [],
    languages: [],
    approved: r.approved,
    reasons: r.reasons,
  })

  const queueItemOf = (m: MediaItem, x: Torrent): QueueItem => ({
    id: x.id,
    torrentId: x.id,
    movieId: m.tmdbId,
    title: m.title,
    year: m.year || null,
    release: x.name,
    quality: x.quality,
    size: x.size,
    progress: x.progress,
    downRate: x.downRate,
    upRate: x.upRate,
    eta: x.eta,
    ratio: x.ratio,
    state: x.state,
    stateReason: x.stateReason,
  })

  /** The last search's releases while fresh, best first. */
  const fresh = (ctx: Ctx, m: MediaItem): Release[] => {
    const s = memory.searches.get(m.tmdbId)
    if (!s || Date.now() - s.at > FRESH_MS) return []
    return ctx.api.movies
      .interactiveSearch(m.id)
      .filter((r) => s.guids.has(r.guid))
      .map((r) => releaseOf(ctx, r))
  }

  /** packages/media's wanted lists: monitored, past their minimum availability, without a file or under the cutoff. */
  const wantedOf = (ctx: Ctx, which: 'missing' | 'cutoff-unmet') =>
    libraryOf(ctx.srv.state)
      .filter((m) => m.monitored && m.status === which)
      .map(movieOf)

  const setTags = (id: number, tags: string[]) => {
    if (tags.length) memory.tags.set(id, [...new Set(tags)].sort())
    else memory.tags.delete(id)
  }

  const feedOf = (ctx: Ctx) => {
    const key = memory.feed.get(ctx.userId)
    if (!key) return { url: null, createdAt: null }
    // the host's own address; '' is the page's, which a calendar app can't reach, so the LAN's
    const base = ctx.host.origin || 'http://192.168.1.20:3000'
    return {
      url: `${base}/feed/v1/calendar.ics?key=${encodeURIComponent(key.secret)}`,
      createdAt: new Date(key.createdAt).toISOString(),
    }
  }

  const metadataOf = (ctx: Ctx, id: number): MovieMetadata => {
    const title = k.known(ctx, id)
    const meta = movieMetadata(ctx.srv.state, title.id, ctx.srv.clock.now())
    if (!meta) throw refuse('not-found', t('movies.tmdbMovie'))
    const here = libraryOf(ctx.srv.state).some((m) => m.tmdbId === id)
    return {
      ...discoverOf(title, here),
      originalTitle: meta.originalTitle,
      originalLanguage: meta.originalLanguage,
      tagline: meta.tagline,
      certification: meta.certification,
      budget: meta.budget,
      revenue: meta.revenue,
      studios: meta.studios,
      imdbId: meta.imdbId,
      wikidataId: meta.wikidataId,
      cast: meta.cast.map((c, i) => credit(c, id, 'cast', i)),
      crew: meta.crew.map((c, i) => credit(c, id, 'crew', i)),
      videos: meta.videos.map(video),
      collection: meta.collection
        ? { id: tmdbNumber(meta.collection.id), name: meta.collection.name }
        : null,
      gone: false,
      // the metadata cache's last fetch, which the mock doesn't keep: a day before its clock
      fetchedAt: kit.wallMs(ctx.srv.clock.now() - DAY),
    }
  }

  const discoverList = (ctx: Ctx, query: string | undefined, list: string | undefined) => {
    const now = ctx.srv.clock.now()
    const here = new Set(libraryOf(ctx.srv.state).map((m) => m.tmdbId))
    const all = ctx.api.movies.discover(query ?? '')
    if (query?.trim()) return all.map((x) => discoverOf(x, here.has(x.tmdbId)))
    const released = (x: { releaseDate: string }) => Date.parse(x.releaseDate) <= now
    const picked =
      list === 'popular'
        ? [...all].sort((a, b) => b.rating - a.rating)
        : list === 'now-playing'
          ? all.filter((x) => released(x) && now - Date.parse(x.releaseDate) < 60 * DAY)
          : list === 'upcoming'
            ? all
                .filter((x) => !released(x))
                .sort((a, b) => Date.parse(a.releaseDate) - Date.parse(b.releaseDate))
            : // trending: the newest first, as the week's chart leans
              [...all].sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate))
    return picked.map((x) => discoverOf(x, here.has(x.tmdbId)))
  }

  const answers: Answers = {
    movies: {
      list: ({ query }, ctx) => {
        const base = movies(ctx).filter(
          (m) =>
            titleMatches(m, query.title) &&
            (!query.qualityProfileId || m.qualityProfileId === query.qualityProfileId) &&
            (!query.monitored || m.monitored === (query.monitored === 'true')) &&
            (!query.tag || m.tags.includes(query.tag)),
        )
        const rows = query.status ? base.filter((m) => m.status === query.status) : base
        return pageOf(rows, base, query)
      },
      get: ({ params }, ctx) => movieOf(inLibrary(ctx, params.id)),
      add: ({ body }, ctx) => {
        const here = libraryOf(ctx.srv.state).find((m) => m.tmdbId === body.tmdbId)
        if (here) return movieOf(here)
        const title = k.known(ctx, body.tmdbId)
        requireFolder(ctx, body.rootFolder)
        for (const v of body.versions) requireQualityProfile(ctx, v.qualityProfileId)
        requireLabels(body.versions.map((v) => v.label))
        requireLanguageProfile(ctx, body.languageProfileId)
        if (body.searchNow) requireIndexers(ctx)
        const first = body.versions[0] as { label: string; qualityProfileId: string }
        const added = ctx.api.movies.add({
          tmdbId: body.tmdbId,
          title: title.title,
          year: title.year,
          rootFolder: body.rootFolder,
          qualityProfileId: first.qualityProfileId,
          // left out, the mock's default; null for none
          languageProfileId:
            body.languageProfileId === undefined ? '' : (body.languageProfileId ?? ''),
          monitored: body.monitored,
          minimumAvailability: body.minimumAvailability,
          searchNow: body.searchNow,
        })
        // the add dialog's versions, with their own labels
        const versions = body.versions.map((v, i) => ({
          id: `${added.id}-v${i + 1}`,
          label: v.label.trim(),
          qualityProfileId: v.qualityProfileId,
          fileId: null,
        }))
        setTags(body.tmdbId, body.tags ?? [])
        return write(ctx, added, {
          versions,
          ...(body.languageProfileId === null ? { languageProfileId: '' } : {}),
        })
      },
      update: ({ params, body }, ctx) => {
        const m = inLibrary(ctx, params.id)
        if (body.rootFolder !== undefined) requireFolder(ctx, body.rootFolder)
        requireLanguageProfile(ctx, body.languageProfileId)
        if (body.tags) setTags(m.tmdbId, body.tags)
        const patch: Partial<MediaItem> = {}
        if (body.monitored !== undefined) {
          patch.monitored = body.monitored
        }
        if (body.minimumAvailability) patch.minimumAvailability = body.minimumAvailability
        if (body.languageProfileId !== undefined)
          patch.languageProfileId = body.languageProfileId ?? ''
        if (body.rootFolder !== undefined) {
          patch.rootFolder = body.rootFolder
          patch.path = `${body.rootFolder}/${m.path.split('/').pop() ?? m.title}`
        }
        return write(ctx, m, patch)
      },
      delete: ({ params, query }, ctx) => {
        const m = inLibrary(ctx, params.id)
        ctx.api.movies.delete(m.id, { deleteFiles: query.deleteFiles === 'true' })
        memory.tags.delete(m.tmdbId)
        return undefined
      },
      // queued, then `metadata.updated` when the refresh has written: the mock's metadata is
      // derived, so it's written at once
      refresh: ({ params }, ctx) => {
        inLibrary(ctx, params.id)
        kit.emit(MEDIA_TOPICS.metadata)
        return undefined
      },
      bulk: ({ body }, ctx) => {
        const state = ctx.srv.state
        const found = body.ids.flatMap((id) => {
          const m = libraryOf(state).find((x) => x.tmdbId === id)
          return m ? [m] : []
        })
        const ids = found.map((m) => m.tmdbId)
        const missing = body.ids.filter((id) => !ids.includes(id))
        const mockIds = found.map((m) => m.id)
        switch (body.action) {
          case 'monitor':
          case 'unmonitor':
            ctx.api.movies.bulkUpdate(mockIds, { monitored: body.action === 'monitor' })
            break
          case 'setQualityProfile':
            requireQualityProfile(ctx, body.qualityProfileId)
            ctx.api.movies.bulkSetQualityProfile(mockIds, body.qualityProfileId)
            break
          case 'setLanguageProfile':
            requireLanguageProfile(ctx, body.languageProfileId)
            ctx.api.movies.bulkUpdate(mockIds, { languageProfileId: body.languageProfileId ?? '' })
            break
          case 'search':
            requireIndexers(ctx)
            ctx.api.movies.bulkSearch(mockIds)
            break
          case 'refresh':
            kit.emit(MEDIA_TOPICS.metadata)
            break
          case 'setTags':
            for (const m of found) {
              const had = memory.tags.get(m.tmdbId) ?? []
              setTags(
                m.tmdbId,
                body.mode === 'replace'
                  ? body.tagIds
                  : body.mode === 'add'
                    ? [...had, ...body.tagIds]
                    : had.filter((x) => !body.tagIds.includes(x)),
              )
            }
            kit.emit(MEDIA_TOPICS.movies)
            break
          case 'delete':
            // `exclude` would keep import lists from adding them again; the mock's lists don't sync
            ctx.api.movies.bulkDelete(mockIds, body.deleteFiles ?? false)
            for (const id of ids) memory.tags.delete(id)
            break
        }
        return { ids, missing }
      },
      upcoming: ({ query }, ctx) => ctx.api.movies.upcoming(query.days ?? 14).map(movieOf),
      recent: ({ query }, ctx) => ctx.api.movies.recent(query.limit ?? 8).map(movieOf),
      discover: ({ query }, ctx) => {
        const all = discoverList(ctx, query.query, query.list)
        const page = query.page ?? 1
        return {
          items: all.slice((page - 1) * DISCOVER_PAGE, page * DISCOVER_PAGE),
          page,
          totalPages: Math.max(1, Math.ceil(all.length / DISCOVER_PAGE)),
          totalResults: all.length,
        }
      },

      addVersion: ({ params, body }, ctx) => {
        const m = inLibrary(ctx, params.id)
        if (m.versions.length >= MAX_VERSIONS)
          throw refuse('invalid', t('movies.versionsMax'), {
            field: 'versions',
            reason: 'versions',
          })
        requireQualityProfile(ctx, body.qualityProfileId)
        requireLabels([...m.versions.map((v) => v.label), body.label])
        const n = Math.max(0, ...m.versions.map((v) => Number(/-v(\d+)$/.exec(v.id)?.[1] ?? 0))) + 1
        return write(ctx, m, {
          versions: [
            ...m.versions,
            {
              id: `${m.id}-v${n}`,
              label: body.label.trim(),
              qualityProfileId: body.qualityProfileId,
              fileId: null,
            },
          ],
        })
      },
      updateVersion: ({ params, body }, ctx) => {
        const m = inLibrary(ctx, params.id)
        const v = m.versions.find((x) => x.id === params.versionId)
        if (!v) throw refuse('not-found', t('movies.versionUnknown'))
        if (body.qualityProfileId) requireQualityProfile(ctx, body.qualityProfileId)
        if (body.label)
          requireLabels(m.versions.map((x) => (x.id === v.id ? (body.label as string) : x.label)))
        return write(ctx, m, {
          versions: m.versions.map((x) =>
            x.id === v.id
              ? {
                  ...x,
                  ...(body.label ? { label: body.label.trim() } : {}),
                  ...(body.qualityProfileId ? { qualityProfileId: body.qualityProfileId } : {}),
                }
              : x,
          ),
        })
      },
      removeVersion: ({ params }, ctx) => {
        const m = inLibrary(ctx, params.id)
        if (!m.versions.some((v) => v.id === params.versionId))
          throw refuse('not-found', t('movies.versionUnknown'))
        if (m.versions.length === 1)
          throw refuse('conflict', t('movies.lastVersion'), { reason: 'last-version' })
        return write(ctx, m, { versions: m.versions.filter((v) => v.id !== params.versionId) })
      },

      files: ({ params }, ctx) => {
        const m = inLibrary(ctx, params.id)
        return ctx.api.movies.files(m.id).map((f) => ({
          id: f.id,
          movieId: m.tmdbId,
          versionId: f.versionId,
          path: f.path,
          size: f.size,
          quality: {
            // the parser's name for the pair, as Radarr writes it ("Bluray-1080p")
            name: `${f.quality.source}-${f.quality.resolution}`,
            resolution: f.quality.resolution,
            source: f.quality.source,
            codec: f.quality.codec,
          },
          releaseGroup: f.releaseGroup,
          sceneName: f.sceneName || null,
          edition: null,
          // highsea hardlinks when the downloads and the library share a filesystem (ADR 0039)
          transfer: 'hardlink',
          addedAt: kit.wall(f.addedAt),
          streams: f.streams,
        }))
      },
      history: ({ params, query }, ctx) => {
        const m = inLibrary(ctx, params.id)
        const all = ctx.api.movies
          .history(m.id)
          .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
        const from = query.cursor === undefined ? 0 : Number(/^p:(\d+)$/.exec(query.cursor)?.[1])
        if (!Number.isFinite(from))
          throw refuse('invalid', t('movies.cursor'), { field: 'cursor', reason: 'cursor' })
        const PAGE = 50
        return {
          items: all.slice(from, from + PAGE).map((h) => ({
            id: h.id,
            movieId: m.tmdbId,
            title: m.title,
            year: m.year || null,
            type: h.type,
            date: kit.wall(h.date),
            sourceTitle: h.sourceTitle,
            quality: h.quality,
            indexer: h.indexer,
            message: h.message,
          })),
          next: from + PAGE < all.length ? `p:${from + PAGE}` : null,
        }
      },

      interactiveSearch: ({ params }, ctx) => {
        const m = inLibrary(ctx, params.id)
        requireIndexers(ctx)
        const found = ctx.api.movies.interactiveSearch(m.id)
        memory.searches.set(m.tmdbId, { at: Date.now(), guids: new Set(found.map((r) => r.guid)) })
        // approved first, then the profile's ranking (the format score)
        const releases = found
          .map((r) => releaseOf(ctx, r))
          .sort((a, b) => Number(b.approved) - Number(a.approved) || b.formatScore - a.formatScore)
        return { releases, searched: enabledIndexers(ctx).length, failed: [] }
      },
      releases: ({ params }, ctx) => {
        const m = inLibrary(ctx, params.id)
        return fresh(ctx, m).sort(
          (a, b) => Number(b.approved) - Number(a.approved) || b.formatScore - a.formatScore,
        )
      },
      grabRelease: ({ params, body }, ctx) => {
        const m = inLibrary(ctx, params.id)
        const r = fresh(ctx, m).find(
          (x) => x.guid === params.guid && x.indexerId === body.indexerId,
        )
        if (!r) throw refuse('not-found', t('movies.releaseGone'))
        if (!body.force && !r.approved) {
          const why = r.reasons.find((x) => x.kind === 'rejected')?.message
          throw refuse('conflict', t('movies.rejected', { why: why ? `: ${why}` : '' }))
        }
        return queueItemOf(m, ctx.api.movies.grabRelease(m.id, r.guid))
      },
    },

    metadata: {
      movie: ({ params }, ctx) => metadataOf(ctx, params.id),
      recommendations: ({ params }, ctx) => {
        const title = k.known(ctx, params.id)
        const here = new Set(libraryOf(ctx.srv.state).map((m) => m.tmdbId))
        return recommendations(ctx.srv.state, title.id, 20).map((x) =>
          discoverOf(x, here.has(x.tmdbId)),
        )
      },
      collection: ({ params }, ctx) => {
        const ref = collectionRefs().find((c) => tmdbNumber(c.id) === params.id)
        const c = ref ? tmdbCollection(ctx.srv.state, ref.id) : null
        if (!c) throw refuse('not-found', t('movies.tmdbCollection'))
        const here = new Set(libraryOf(ctx.srv.state).map((m) => m.tmdbId))
        // oldest first, those without a date last
        const parts = [...c.parts].sort(
          (a, b) => Date.parse(a.releaseDate) - Date.parse(b.releaseDate),
        )
        const first = parts[0]
        return {
          id: params.id,
          name: c.name,
          overview: c.overview,
          // TMDB's collection art, which the mock doesn't draw: its first part's
          art: { poster: first?.art.poster || null, backdrop: first?.art.backdrop || null },
          parts: parts.map((x) => discoverOf(x, here.has(x.tmdbId))),
        }
      },
    },

    wanted: {
      missing: ({ query }, ctx) => {
        const rows = wantedOf(ctx, 'missing').filter((m) => titleMatches(m, query.title))
        return pageOf(rows, rows, query)
      },
      cutoff: ({ query }, ctx) => {
        const rows = wantedOf(ctx, 'cutoff-unmet').filter((m) => titleMatches(m, query.title))
        return pageOf(rows, rows, query)
      },
      search: ({ body }, ctx) => {
        requireIndexers(ctx)
        const lists = body.all
          ? wantedOf(ctx, body.all === 'missing' ? 'missing' : 'cutoff-unmet').map((m) => m.id)
          : (body.ids ?? [])
        const found = libraryOf(ctx.srv.state).filter((m) => lists.includes(m.tmdbId))
        // the mock's search grabs what's missing at once; a cutoff search queues without a grab
        ctx.api.movies.bulkSearch(found.map((m) => m.id))
        return { queued: found.length }
      },
      calendar: ({ query }, ctx) => {
        const from = Date.parse(`${query.from}T00:00:00Z`)
        const to = Date.parse(`${query.to}T00:00:00Z`)
        if (to < from)
          throw refuse('invalid', t('movies.rangeBackwards'), { field: 'to', reason: 'range' })
        if ((to - from) / DAY > CALENDAR_MAX_DAYS)
          throw refuse('invalid', t('movies.rangeLong', { max: CALENDAR_MAX_DAYS }), {
            field: 'to',
            reason: 'range',
          })
        const [cinema, digital] = CALENDAR_KINDS
        const entries: CalendarEntry[] = libraryOf(ctx.srv.state)
          .filter((m) => m.monitored)
          .flatMap((m) => {
            const movie: Movie = movieOf(m)
            const at = Date.parse(kit.wall(m.releaseDate))
            return [
              { date: dayOf(new Date(at).toISOString()), kind: cinema, movie },
              {
                date: dayOf(new Date(at + DIGITAL_AFTER_DAYS * DAY).toISOString()),
                kind: digital,
                movie,
              },
            ]
          })
        return entries
          .filter((e) => e.date >= query.from && e.date <= query.to)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.movie.id - b.movie.id))
      },
      feedKey: (_, ctx) => feedOf(ctx),
      makeFeedKey: (_, ctx) => {
        const bytes = new Uint8Array(24)
        crypto.getRandomValues(bytes)
        const secret = `hs_${[...bytes].map((b) => b.toString(36).padStart(2, '0')).join('')}`
        memory.feed.set(ctx.userId, { secret, createdAt: Date.now() })
        return feedOf(ctx)
      },
      revokeFeedKey: (_, ctx) => {
        memory.feed.delete(ctx.userId)
        return undefined
      },
    },

    // the add dialog's and the library's reads; the rest of Settings › Import lists is another area's
    importLists: {
      list: (_, ctx) =>
        ctx.api.importLists
          .list()
          // the server's lists add movies only (it has no shows yet)
          .filter((l) => l.kind === 'movies')
          .map(
            (l): ImportList => ({
              id: l.id,
              kind: l.settings.kind,
              name: l.name,
              enabled: l.enabled,
              settings: settingsOf(l.settings),
              rootFolder: l.rootFolder,
              qualityProfileId: l.qualityProfileId,
              languageProfileId: l.languageProfileId,
              monitored: l.monitored,
              minimumAvailability: l.minimumAvailability,
              searchOnAdd: l.searchOnAdd,
              tags: l.tags,
              items: l.items,
              lastSync: l.lastSync ? kit.wall(l.lastSync) : null,
              lastResult: l.lastResult,
            }),
          ),
    },
  }

  return { ...answers, ...collectionsAnswers(kit, k) }
}
