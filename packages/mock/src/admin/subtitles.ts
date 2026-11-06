// SPDX-License-Identifier: AGPL-3.0-only
// The admin's subtitles routes (one-client-platform-d.md › D2), answered from the mock's api in the
// contract's shapes: Subtitles' Wanted, Providers, Languages and Scoring tabs, and a movie's
// Subtitles tab with search, Use, Re-sync and the offset. The server's rules are
// packages/subtitles' movies service (tracks.ts, search.ts, sync.ts, accounts.ts, wanted.ts) and
// shared/profiles.ts; each refusal here is one of theirs, in their words.
//
// The contract addresses movies by TMDB's number, the mock by its own id, so a movie is found by
// its `tmdbId`. The mock's api already raises `subtitles.updated` (and `history.updated` for a
// download) on its event stream, which the transport relays; what this file writes itself, a
// provider's account and a new profile's checks, it raises with `emit`.
//
// What the mock doesn't keep, chosen here:
// - a provider's secrets: an account (the mock's `username`) means every field is set, and the
//   secrets' values are never sent, as on the server; no provider waits (no throttle); every
//   provider is usable in the mock's build (`unavailable` null);
// - a track's release name, matches and Use: kept for the tracks downloaded through this transport;
//   the seeded tracks have no release name and their matches follow their score;
// - a track's `addedAt`: its file's, or the mock's clock when downloaded here; no sync `detail`;
// - search results' matches follow their score, as the server's scoring would give them.
import {
  SUBTITLE_TOPICS,
  type SubtitleSearchResult,
  type SubtitleTrack,
} from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { PROVIDER_INFO } from '@highsea-tv/subtitles/providers/info'
import type {
  LanguageProfile as MockProfile,
  SubtitleProvider as MockProvider,
  SubtitleSearchResult as MockResult,
  SubtitleTrack as MockTrack,
} from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'

export const subtitlesMessages = defineMessages({
  'subtitles.movieUnknown': 'That movie isn’t in the library.',
  'subtitles.trackUnknown': 'That subtitle track doesn’t exist.',
  'subtitles.noProviders': 'Turn on a subtitle provider in Subtitles first.',
  'subtitles.resultExpired': 'That result has expired. Search again.',
  'subtitles.imageSubtitle': 'Only a text subtitle can be synced or moved.',
  'subtitles.providerUnknown': 'That provider doesn’t exist.',
  'subtitles.noAccount': 'Add your account first.',
  'subtitles.fillIn': 'Fill in every field.',
  'subtitles.signedIn': 'Signed in to {name}.',
  'subtitles.profileUnknown': 'That language profile doesn’t exist.',
  'subtitles.profileTwice': 'Each language can be in a profile once.',
  'subtitles.profileCutoff': 'The cutoff must be one of the profile’s languages.',
  'subtitles.profileName': 'A profile already has that name.',
  'subtitles.profileInUse': 'Movies still use {name}. Move them to another profile first.',
  'subtitles.profileLast': 'Keep at least one language profile.',
  'subtitles.badCursor': 'That page link has expired. Start from the first page.',
})
const t = createT(subtitlesMessages)

/** Search results are kept for Use this long, as the server's cache keeps them. */
const RESULT_TTL_MS = 30 * 60 * 1000
const WANTED_LIMIT = 50

type ProviderId = keyof typeof PROVIDER_INFO
type Match = SubtitleSearchResult['matches'][number]

/** What a score means in matches, the server's scoring read backwards (shared/score.ts). */
const matchesFor = (score: number): Match[] =>
  score >= 99
    ? ['hash']
    : score >= 95
      ? ['title', 'year', 'source', 'releaseGroup', 'resolution', 'videoCodec']
      : score >= 90
        ? ['title', 'year', 'source', 'resolution']
        : score >= 80
          ? ['title', 'year', 'source']
          : ['title', 'year']

const masked = (key: string) => `••••${key.slice(-4)}`

const encodeCursor = (c: { t: string; i: string }) =>
  btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function decodeCursor(cursor: string): { t: string; i: string } {
  try {
    const c = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))) as {
      t?: unknown
      i?: unknown
    }
    if (typeof c?.t === 'string' && typeof c.i === 'string') return { t: c.t, i: c.i }
  } catch {
    // falls through
  }
  throw refuse('invalid', t('subtitles.badCursor'), { reason: 'bad-cursor' })
}

export function subtitlesAnswers(kit: AdminKit): Answers {
  const { wall, wallMs, emit } = kit
  /** Search results for Use, by the id sent: the movie's mock id, the result and when it was found. */
  const results = new Map<string, { itemId: string; result: MockResult; at: number }>()
  /** What the mock's tracks don't keep, for the ones downloaded here. */
  const extras = new Map<string, { releaseName: string; matches: string[]; addedAt: string }>()

  const movie = (ctx: Ctx, tmdbId: number) => {
    const m = ctx.srv.state.items.find((x) => x.type === 'movie' && x.tmdbId === tmdbId)
    if (!m) throw refuse('not-found', t('subtitles.movieUnknown'))
    return m
  }
  const track = (ctx: Ctx, id: string) => {
    const tr = ctx.srv.state.subtitles.find((s) => s.id === id)
    if (!tr) throw refuse('not-found', t('subtitles.trackUnknown'))
    return tr
  }
  const textTrack = (ctx: Ctx, id: string) => {
    const tr = track(ctx, id)
    if (tr.format === 'pgs')
      throw refuse('invalid', t('subtitles.imageSubtitle'), { reason: 'image-subtitle' })
    return tr
  }

  const trackOf = (ctx: Ctx, tr: MockTrack): SubtitleTrack => {
    const item = ctx.srv.state.items.find((x) => x.id === tr.itemId)
    const file = ctx.srv.state.files.find((f) => f.id === tr.fileId)
    const extra = extras.get(tr.id)
    return {
      id: tr.id,
      itemId: item?.tmdbId ?? 0,
      fileId: tr.fileId,
      // an embedded stream is the file's, never a track (the contract's `kind`)
      kind: tr.kind === 'bundled' ? 'bundled' : 'external',
      language: tr.language,
      format: tr.format,
      forced: tr.forced,
      hi: tr.hi,
      provider: tr.kind === 'bundled' ? null : tr.provider,
      releaseName: extra?.releaseName ?? null,
      score: tr.kind === 'bundled' ? 100 : tr.score,
      matches: extra?.matches ?? (tr.score === null ? [] : matchesFor(tr.score)),
      chosen: Boolean(extra),
      sync: {
        status: tr.sync.status,
        confidence: tr.sync.confidence,
        offsetMs: tr.sync.offsetMs,
        detail: null,
      },
      path: tr.path ?? '',
      addedAt: extra?.addedAt ?? (file ? wall(file.addedAt) : wallMs(ctx.srv.clock.now())),
    }
  }

  const providerOf = (p: MockProvider) => {
    const info = PROVIDER_INFO[p.id as ProviderId]
    const account = p.username ?? null
    return {
      id: info.id,
      name: info.name,
      url: info.url,
      enabled: p.enabled,
      requiresAuth: p.requiresAuth,
      account,
      rateLimitRemaining: p.rateLimitRemaining,
      rateLimitMax: p.rateLimitMax,
      throttledUntil: null,
      throttleReason: null,
      fields: info.fields.map((f) => ({
        key: f.key,
        secret: f.secret,
        set: account !== null,
        value: f.secret ? null : f.key === 'username' ? account : null,
      })),
      attribution: info.attribution,
      unavailable: null,
    }
  }
  const provider = (ctx: Ctx, id: ProviderId) => {
    const p = ctx.srv.state.providers.find((x) => x.id === id)
    // the three are always seeded; the server's row() refuses the same way
    if (!p) throw refuse('not-found', t('subtitles.providerUnknown'))
    return p
  }
  /** The fields as given, a blank secret keeping the stored one (accounts.ts's `merged`). */
  const merged = (p: MockProvider, given: Record<string, string | undefined>) => {
    const out: Record<string, string> = {}
    for (const f of PROVIDER_INFO[p.id as ProviderId].fields) {
      const value = (given[f.key] ?? '').trim()
      const stored = f.secret && p.username ? 'stored' : ''
      const kept = value || stored
      if (!kept) throw refuse('invalid', t('subtitles.fillIn'), { reason: f.key })
      out[f.key] = kept
    }
    return out
  }
  const accountLabel = (p: MockProvider, creds: Record<string, string>) =>
    creds.username ??
    (creds.apiKey && creds.apiKey !== 'stored' ? masked(creds.apiKey) : (p.username ?? null))

  /** shared/profiles.ts's `check` and `nameTaken`, past the contract's own schema. */
  const checkProfile = (
    ctx: Ctx,
    p: { name: string; languages: { code: string }[]; cutoff: string | null },
    except?: string,
  ) => {
    const codes = p.languages.map((l) => l.code)
    if (new Set(codes).size !== codes.length)
      throw refuse('invalid', t('subtitles.profileTwice'), { reason: 'languages' })
    if (p.cutoff !== null && !codes.includes(p.cutoff))
      throw refuse('invalid', t('subtitles.profileCutoff'), { reason: 'cutoff' })
    if (ctx.srv.state.languageProfiles.some((x) => x.name === p.name && x.id !== except))
      throw refuse('conflict', t('subtitles.profileName'), { reason: 'duplicate-name' })
  }
  const profileOf = (p: MockProfile) => ({
    id: p.id,
    name: p.name,
    languages: p.languages.map((l) => ({ code: l.code, forced: l.forced, hi: l.hi })),
    cutoff: p.cutoff,
    minScore: p.minScore,
  })
  const profile = (ctx: Ctx, id: string) => {
    const p = ctx.srv.state.languageProfiles.find((x) => x.id === id)
    if (!p)
      throw refuse('not-found', t('subtitles.profileUnknown'), {
        reason: 'unknown-language-profile',
      })
    return p
  }

  const wantedRows = (ctx: Ctx) =>
    ctx.api.subtitles
      .wanted()
      .filter((w) => w.movie.type === 'movie')
      .sort(
        (a, b) =>
          a.movie.sortTitle.localeCompare(b.movie.sortTitle) ||
          a.movie.id.localeCompare(b.movie.id),
      )

  return {
    subtitles: {
      stats: (_, ctx) => {
        const s = ctx.api.subtitles.stats()
        return {
          syncedToday: s.syncedToday,
          waiting: s.waiting,
          avgOffsetMs: Math.round(s.avgOffsetMs),
          avgConfidence: s.avgConfidence,
        }
      },

      // cursor-paged by sort title (wanted.ts), 50 to a page
      wanted: ({ query }, ctx) => {
        const rows = wantedRows(ctx)
        const limit = query.limit ?? WANTED_LIMIT
        let start = 0
        if (query.cursor) {
          const c = decodeCursor(query.cursor)
          start = rows.findIndex(
            (w) =>
              w.movie.sortTitle.localeCompare(c.t) > 0 ||
              (w.movie.sortTitle === c.t && w.movie.id.localeCompare(c.i) > 0),
          )
          if (start < 0) start = rows.length
        }
        const page = rows.slice(start, start + limit)
        const last = page.at(-1)
        return {
          items: page.map((w) => ({
            movie: {
              id: w.movie.tmdbId,
              title: w.movie.title,
              year: w.movie.year,
              path: w.movie.path,
            },
            missingLanguages: w.missingLanguages,
          })),
          next:
            last && start + limit < rows.length
              ? encodeCursor({ t: last.movie.sortTitle, i: last.movie.id })
              : null,
          total: rows.length,
        }
      },

      // a search per file: each movie on the list has one
      searchAllMissing: (_, ctx) => {
        const queued = wantedRows(ctx).length
        ctx.api.subtitles.searchAllMissing()
        return { queued }
      },

      forItem: ({ params }, ctx) => {
        const m = movie(ctx, params.id)
        return ctx.api.subtitles
          .forItem(m.id)
          .filter((tr) => tr.kind !== 'embedded')
          .map((tr) => trackOf(ctx, tr))
      },

      search: ({ params, body }, ctx) => {
        const m = movie(ctx, params.id)
        const on = ctx.srv.state.providers.filter((p) => p.enabled)
        if (on.length === 0)
          throw refuse('conflict', t('subtitles.noProviders'), { reason: 'no-providers' })
        const names = new Set(on.map((p) => PROVIDER_INFO[p.id as ProviderId]?.name ?? p.name))
        const now = ctx.srv.clock.now()
        return ctx.api.subtitles
          .search(m.id, body.language)
          .filter((r) => names.has(r.provider))
          .sort((a, b) => b.score - a.score)
          .map((r) => {
            const id = `${r.id}-${body.language}`
            results.set(id, { itemId: m.id, result: r, at: now })
            const info = Object.values(PROVIDER_INFO).find((p) => p.name === r.provider)
            return {
              id,
              language: r.language,
              releaseName: r.releaseName,
              provider: r.provider,
              score: r.score,
              matches: matchesFor(r.score),
              forced: r.forced,
              hi: r.hi,
              format: r.format,
              attribution: info?.attribution ?? null,
            }
          })
      },

      download: ({ params, body }, ctx) => {
        const m = movie(ctx, params.id)
        const kept = results.get(body.resultId)
        if (!kept || kept.itemId !== m.id || ctx.srv.clock.now() - kept.at > RESULT_TTL_MS)
          throw refuse('not-found', t('subtitles.resultExpired'), { reason: 'result-expired' })
        const tr = ctx.api.subtitles.download(m.id, kept.result)
        extras.set(tr.id, {
          releaseName: kept.result.releaseName,
          matches: matchesFor(kept.result.score),
          addedAt: wallMs(ctx.srv.clock.now()),
        })
        // a track coming announces the title too (SUBTITLE_TOPICS' note)
        emit('item.updated')
        return trackOf(ctx, tr)
      },

      delete: ({ params }, ctx) => {
        track(ctx, params.id)
        ctx.api.subtitles.delete(params.id)
        extras.delete(params.id)
        emit('item.updated')
        emit('history.updated')
        return undefined
      },

      // Waiting to sync at once, the mock's pipeline finishing it; the nudge goes back to zero
      sync: ({ params }, ctx) => {
        textTrack(ctx, params.id)
        return trackOf(ctx, ctx.api.subtitles.sync(params.id))
      },

      setOffset: ({ params, body }, ctx) => {
        textTrack(ctx, params.id)
        return trackOf(ctx, ctx.api.subtitles.setOffset(params.id, body.ms))
      },

      providers: (_, ctx) => ctx.api.subtitles.providers().map(providerOf),

      toggleProvider: ({ params, body }, ctx) => {
        const p = provider(ctx, params.id)
        if (body.enabled && !p.username)
          throw refuse('conflict', t('subtitles.noAccount'), { reason: 'no-account' })
        return providerOf(ctx.api.subtitles.toggleProvider(params.id, body.enabled))
      },

      // the mock's api has no account to save: kept on its provider, as the label the server shows
      saveProvider: ({ params, body }, ctx) => {
        const p = provider(ctx, params.id)
        const creds = merged(p, body)
        p.username = accountLabel(p, creds) ?? undefined
        emit(SUBTITLE_TOPICS.subtitles)
        return providerOf(p)
      },

      // no provider to ask: an account with every field signs in
      testProvider: ({ params, body }, ctx) => {
        const p = provider(ctx, params.id)
        const name = PROVIDER_INFO[params.id].name
        try {
          const creds = merged(p, body)
          return {
            ok: true,
            message: t('subtitles.signedIn', { name }),
            account: accountLabel(p, creds),
          }
        } catch (e) {
          return { ok: false, message: (e as Error).message, account: null }
        }
      },

      languages: (_, ctx) => ctx.api.subtitles.languages().map((l) => ({ ...l })),

      languageProfiles: (_, ctx) => ctx.api.subtitles.languageProfiles().map(profileOf),

      createLanguageProfile: ({ body }, ctx) => {
        checkProfile(ctx, body)
        const taken = new Set(ctx.srv.state.languageProfiles.map((p) => p.id))
        let n = taken.size + 1
        while (taken.has(`lp-${n}`)) n++
        return profileOf(ctx.api.subtitles.saveLanguageProfile({ ...body, id: `lp-${n}` }))
      },

      saveLanguageProfile: ({ params, body }, ctx) => {
        profile(ctx, params.id)
        checkProfile(ctx, body, params.id)
        return profileOf(ctx.api.subtitles.saveLanguageProfile({ ...body, id: params.id }))
      },

      deleteLanguageProfile: ({ params }, ctx) => {
        const p = profile(ctx, params.id)
        if (ctx.srv.state.items.some((m) => m.languageProfileId === p.id))
          throw refuse('conflict', t('subtitles.profileInUse', { name: p.name }), {
            reason: 'in-use',
          })
        if (ctx.srv.state.languageProfiles.length <= 1)
          throw refuse('conflict', t('subtitles.profileLast'), { reason: 'last-profile' })
        ctx.api.subtitles.deleteLanguageProfile(p.id)
        return undefined
      },

      settings: (_, ctx) => ({ ...ctx.api.subtitles.settings() }),

      saveSettings: ({ body }, ctx) => {
        const patch = Object.fromEntries(
          Object.entries(body).filter(([, v]) => v !== undefined),
        ) as Partial<ReturnType<Ctx['api']['subtitles']['settings']>>
        return { ...ctx.api.subtitles.saveSettings(patch) }
      },
    },
  }
}
