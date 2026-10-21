// SPDX-License-Identifier: AGPL-3.0-only
// Searching and keeping subtitles (checkpoint 7's plan, "Scoring" and "Processing"). A search asks
// every provider that's on and ready at once, each with 20 seconds to answer (ADR 0043), and scores
// what comes back against the file. A6's Search keeps its results for 30 minutes so Use sends an id
// and the server never takes a download link from the browser. The automatic search picks the best
// result per wanted track above the minimum score; the download job keeps it.
import { basename, extname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { AppError, newId } from '@highsea/core'
import { schema } from '@highsea/db'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { PROVIDER_INFO, PROVIDER_ORDER } from '../providers/index.ts'
import { languageName } from '../shared/languages.ts'
import { sidecarPath } from '../shared/naming.ts'
import { processSubtitle } from '../shared/processing/index.ts'
import { cutoffMet, type Profiles, type Want, wantsOf } from '../shared/profiles.ts'
import {
  compareResults,
  fitsRule,
  type Match,
  type ScoredFile,
  scoreResult,
} from '../shared/scoring.ts'
import type { Settings } from '../shared/settings.ts'
import type {
  LanguageProfile,
  LanguageRule,
  ProviderId,
  ProviderResult,
  SubtitleQuery,
} from '../shared/types.ts'
import type { Accounts } from './accounts.ts'
import { announce, RESULTS_TTL_MS, SEARCH_DEADLINE_MS, type SubtitlesDeps } from './context.ts'
import type { FileInfo, FileRow, ItemRow, Tracks, TrackView } from './tracks.ts'
import type { Wanted } from './wanted.ts'

const { movieMetadata, subtitleFiles, subtitleResults } = schema

/** A result as A6 lists it: the prototype's `SubtitleSearchResult` with its id into the cache. */
export type ResultView = {
  id: string
  language: string
  releaseName: string
  /** The provider's name. */
  provider: string
  score: number
  matches: Match[]
  forced: boolean
  hi: boolean
  format: string | null
  /** The line the provider's terms ask for where its subtitles are picked, or null. */
  attribution: string | null
}

/** A scored result, as the cache and the download job keep it. */
export type Candidate = {
  result: ProviderResult
  score: number
  matches: Match[]
  /** Taken for a Without SDH rule only because nothing else was found: its SDH text goes. */
  fallback: boolean
}

/** What one search found, per provider; a provider that failed is named with its reason. */
type Found = { results: ProviderResult[]; failed: { provider: ProviderId; message: string }[] }

/** ffprobe's codec names in the parser's spelling, for scoring a file whose name doesn't say. */
const CODECS: Record<string, string> = {
  h264: 'avc',
  hevc: 'hevc',
  av1: 'av1',
  vc1: 'vc1',
  mpeg2video: 'mpeg2',
  vp9: 'vp9',
}

function codecOf(info: FileInfo): string | null {
  const video = info.probe?.video
  if (!video) return null
  if (video.codec === 'mpeg4') {
    const tag = video.codecTag?.toUpperCase() ?? ''
    if (tag === 'XVID') return 'xvid'
    if (tag.startsWith('DIV') || tag === 'DX50') return 'divx'
  }
  return CODECS[video.codec] ?? null
}

/** The rule a language has in a profile, or null when the profile doesn't ask for it. */
const ruleFor = (profile: LanguageProfile | null, language: string): LanguageRule | null =>
  profile?.languages.find((l) => l.code === language) ?? null

/** The download job's payload: one chosen result for one file. */
export type DownloadPayload = {
  fileId: string
  candidate: Candidate
  /** Chosen with Use. */
  chosen: boolean
  /** The track an upgrade replaces. */
  replaces: string | null
}

export function createSearch(
  deps: SubtitlesDeps,
  {
    accounts,
    tracks,
    wanted,
    profiles,
    settings,
  }: {
    accounts: Accounts
    tracks: Tracks
    wanted: Wanted
    profiles: Profiles
    settings: Settings
  },
) {
  const { db, clock, media, events } = deps
  const log = deps.logger.child('subtitles')

  function profileOf(item: ItemRow): LanguageProfile | null {
    return item.languageProfileId ? profiles.find(item.languageProfileId) : null
  }

  /** The higher of the profile's minimum score and the global one (subtitles.md › Decisions). */
  const minScore = (profile: LanguageProfile | null) =>
    Math.max(settings.get().minScore, profile?.minScore ?? 0)

  function scoredFile(file: FileRow, item: ItemRow): ScoredFile {
    const info = (file.mediaInfo ?? {}) as FileInfo
    return {
      title: item.title,
      year: item.year,
      releaseName: file.sceneName ?? basename(file.path, extname(file.path)),
      videoCodec: codecOf(info),
    }
  }

  function query(file: FileRow, item: ItemRow, languages: string[]): SubtitleQuery {
    const imdb = db
      .select({ imdbId: sql<string | null>`json_extract(${movieMetadata.data}, '$.imdbId')` })
      .from(movieMetadata)
      .where(eq(movieMetadata.tmdbId, item.tmdbId))
      .get()?.imdbId
    const info = (file.mediaInfo ?? {}) as FileInfo
    return {
      tmdbId: item.tmdbId,
      imdbId: imdb ?? null,
      title: item.title,
      year: item.year,
      moviehash: info.moviehash ?? null,
      languages,
    }
  }

  /** Asks every ready provider at once; each has until the deadline. */
  async function ask(q: SubtitleQuery, signal?: AbortSignal): Promise<Found> {
    const ids = accounts.active()
    if (ids.length === 0)
      throw new AppError('conflict', 'Turn on a subtitle provider in Subtitles first.', {
        reason: 'no-providers',
      })
    const deadline = AbortSignal.timeout(SEARCH_DEADLINE_MS)
    const both = signal ? AbortSignal.any([signal, deadline]) : deadline
    const settled = await Promise.allSettled(
      ids.map((id) => accounts.call(id, (p) => p.search(q, both))),
    )
    const found: Found = { results: [], failed: [] }
    ids.forEach((provider, i) => {
      const s = settled[i]
      if (s?.status === 'fulfilled') found.results.push(...s.value)
      else if (s) {
        const message = (s.reason as Error).message
        found.failed.push({ provider, message })
        log.warn('provider search failed', { provider, error: message })
      }
    })
    return found
  }

  /** A result's score for a want; null when it can't fill it. */
  function candidate(
    result: ProviderResult,
    file: ScoredFile,
    want: Pick<Want, 'language' | 'forced' | 'hi'>,
    rule: LanguageRule,
  ): Candidate | null {
    if (!fitsRule(result, want, rule)) return null
    const { score, matches } = scoreResult(result, file, rule, {
      preferReleaseMatch: settings.get().preferReleaseMatch,
    })
    return { result, score, matches, fallback: rule.hi === 'no' && result.hi }
  }

  const rank = (c: Candidate) => ({
    score: c.score,
    downloads: c.result.downloads,
    rating: c.result.rating,
    providerRank: PROVIDER_ORDER.indexOf(c.result.provider),
    fallback: c.fallback,
  })

  /** The best candidate for a want at or above `min`, or null. */
  function best(
    found: ProviderResult[],
    file: ScoredFile,
    want: Want,
    min: number,
  ): Candidate | null {
    const fits = found
      .map((r) => candidate(r, file, want, want.rule))
      .filter((c): c is Candidate => c !== null && c.score >= min)
      .sort((a, b) => compareResults(rank(a), rank(b)))
    return fits[0] ?? null
  }

  // ------------------------------------------------------------------ A6's Search and Use

  const resultView = (id: string, c: Candidate): ResultView => ({
    id,
    language: c.result.language,
    releaseName: c.result.releaseName,
    provider: PROVIDER_INFO[c.result.provider].name,
    score: c.score,
    matches: c.matches,
    forced: c.result.forced,
    hi: c.result.hi,
    format: c.result.format,
    attribution: PROVIDER_INFO[c.result.provider].attribution,
  })

  /**
   * A6's Search: every result in the language, best first, kept for Use. A language the profile
   * doesn't ask for is scored as With or without SDH.
   */
  async function searchItem(
    tmdbId: number,
    language: string,
    fileId?: string,
  ): Promise<ResultView[]> {
    const item = tracks.itemByTmdb(tmdbId)
    const files = tracks.filesOf(item.id)
    const file = fileId ? files.find((f) => f.id === fileId) : files[0]
    if (!file) throw new AppError('conflict', 'This movie has no file yet.', { reason: 'no-file' })
    const profile = profileOf(item)
    const rule = ruleFor(profile, language) ?? { code: language, forced: 'also', hi: 'also' }
    const found = await ask(query(file, item, [language]))
    if (
      found.results.length === 0 &&
      found.failed.length > 0 &&
      found.failed.length === accounts.active().length
    )
      throw new AppError(
        'unavailable',
        'No subtitle provider answered. Try again in a few minutes.',
        {
          reason: 'providers-failed',
        },
      )
    const sf = scoredFile(file, item)
    const scored = found.results
      .map((r) =>
        candidate(
          r,
          sf,
          { language, forced: r.forced, hi: r.hi },
          { ...rule, forced: 'also', hi: 'also' },
        ),
      )
      .filter((c): c is Candidate => c !== null)
      .sort((a, b) => compareResults(rank(a), rank(b)))
    const now = clock.now()
    return db.transaction((tx) => {
      tx.delete(subtitleResults).where(lt(subtitleResults.expiresAt, now)).run()
      tx.delete(subtitleResults)
        .where(
          and(eq(subtitleResults.mediaFileId, file.id), eq(subtitleResults.language, language)),
        )
        .run()
      return scored.map((c) => {
        const id = newId('sr')
        tx.insert(subtitleResults)
          .values({
            id,
            mediaFileId: file.id,
            itemId: item.id,
            language,
            provider: c.result.provider,
            score: c.score,
            result: c,
            expiresAt: now + RESULTS_TTL_MS,
          })
          .run()
        return resultView(id, c)
      })
    })
  }

  /** Use: downloads a cached result now and answers with the track. */
  async function use(tmdbId: number, resultId: string): Promise<TrackView> {
    const item = tracks.itemByTmdb(tmdbId)
    const row = db
      .select()
      .from(subtitleResults)
      .where(
        and(
          eq(subtitleResults.id, resultId),
          eq(subtitleResults.itemId, item.id),
          gt(subtitleResults.expiresAt, clock.now()),
        ),
      )
      .get()
    if (!row)
      throw new AppError('not-found', 'That result has expired. Search again.', {
        reason: 'result-expired',
      })
    const kept = await keep({
      fileId: row.mediaFileId,
      candidate: row.result as Candidate,
      chosen: true,
      replaces: null,
    })
    return tracks.view(kept, item.tmdbId)
  }

  // ------------------------------------------------------------------ keeping a subtitle

  /** The title part a second track with the same language and flags takes: its provider's name. */
  const titleFor = (provider: ProviderId) => PROVIDER_INFO[provider].name.replace(/\.com$/, '')

  /**
   * Downloads a result, processes it and writes its sidecar and row. A rerun finds the row it
   * wrote and does nothing; the provider's link was stored before it was fetched (ADR 0043).
   */
  async function keep(p: DownloadPayload, signal?: AbortSignal) {
    const file = tracks.file(p.fileId)
    if (!file) throw new AppError('not-found', 'That file is no longer in the library.')
    const item = tracks.item(file.itemId)
    if (!item) throw new AppError('not-found', 'That movie isn’t in the library.')
    const { result, score, matches, fallback } = p.candidate
    const already = db
      .select()
      .from(subtitleFiles)
      .where(
        and(
          eq(subtitleFiles.mediaFileId, file.id),
          eq(subtitleFiles.provider, result.provider),
          eq(subtitleFiles.providerSubtitleId, result.ref),
        ),
      )
      .get()
    if (already) return already

    const downloaded = await accounts.call(result.provider, (provider) =>
      provider.download(result, signal),
    )
    const processed = processSubtitle(downloaded.bytes, { removeHi: fallback })
    if (!processed.ok)
      throw new AppError('invalid', processed.message, {
        reason: processed.reason,
        provider: result.provider,
      })

    // the SDH fallback is cleaned, so it's kept as a track without SDH
    const flags = { language: result.language, forced: result.forced, hi: result.hi && !fallback }
    const same = db
      .select()
      .from(subtitleFiles)
      .where(
        and(
          eq(subtitleFiles.mediaFileId, file.id),
          eq(subtitleFiles.language, flags.language),
          eq(subtitleFiles.forced, flags.forced),
          eq(subtitleFiles.hi, flags.hi),
        ),
      )
      .all()
    const replaced =
      same.find((t) => t.id === p.replaces) ??
      same.find((t) => t.provider === result.provider) ??
      null
    // an upgrade that replaces another provider's track also takes the place of this provider's own
    const clash = same.find((t) => t !== replaced && t.provider === result.provider) ?? null
    const others = same.filter((t) => t !== replaced && t !== clash)
    const track = { ...flags, format: processed.format }
    // another provider's track keeps the plain name; this one takes its provider's (Use keeps both)
    const path = sidecarPath(
      file.path,
      track,
      others.some((t) => t.path === sidecarPath(file.path, { ...track, format: t.format }))
        ? titleFor(result.provider)
        : undefined,
    )
    await tracks.write(path, processed.text)
    if (replaced && replaced.path !== path) await tracks.unlink(replaced.path)
    if (clash && clash.path !== path) await tracks.unlink(clash.path)

    const now = clock.now()
    const values = {
      mediaFileId: file.id,
      itemId: item.id,
      ...flags,
      format: processed.format,
      kind: 'external' as const,
      path,
      provider: result.provider,
      providerSubtitleId: result.ref,
      releaseName: result.releaseName,
      score,
      matches,
      chosen: p.chosen,
      original: gzipSync(Buffer.from(processed.original, 'utf8')),
      encoding: processed.encoding,
      hiRemoved: fallback,
      // the download job queues the sync; with Sync to the audio off the track keeps its timing
      syncStatus: settings.get().autoSync ? ('queued' as const) : ('unsynced' as const),
      syncConfidence: null,
      syncRatio: null,
      syncOffsetMs: null,
      syncSplits: null,
      manualOffsetMs: 0,
      syncedAt: null,
      updatedAt: now,
    }
    const id = replaced?.id ?? newId('sub')
    db.transaction((tx) => {
      if (clash) tx.delete(subtitleFiles).where(eq(subtitleFiles.id, clash.id)).run()
      if (replaced) {
        tx.update(subtitleFiles).set(values).where(eq(subtitleFiles.id, id)).run()
      } else {
        tx.insert(subtitleFiles)
          .values({ id, ...values, createdAt: now })
          .run()
      }
    })

    const key = `${file.id}:${result.provider}:${result.ref}`
    const upgraded = replaced !== null && !p.chosen
    const type = upgraded ? 'subtitle-upgraded' : 'subtitle-downloaded'
    if (!media.history.has(item.id, type, 'key', key))
      media.history.write({
        itemId: item.id,
        type,
        sourceTitle: result.releaseName,
        indexer: PROVIDER_INFO[result.provider].name,
        message: upgraded
          ? `Upgraded ${languageName(result.language)} subtitles from ${PROVIDER_INFO[result.provider].name} (score ${replaced.score} to ${score})`
          : `Downloaded ${languageName(result.language)} subtitles from ${PROVIDER_INFO[result.provider].name} (score ${score})`,
        data: { key, trackId: id, score, matches },
      })
    wanted.refresh(item.id)
    announce(events, [item.tmdbId], { history: true })
    log.info('subtitle kept', {
      tmdbId: item.tmdbId,
      language: result.language,
      provider: result.provider,
      score,
    })
    return tracks.track(id)
  }

  // ------------------------------------------------------------------ the automatic search

  /**
   * Searches for what a file still wants and returns the picks for the download job. Rows nothing
   * was picked for wait longer.
   */
  async function searchFile(fileId: string, signal?: AbortSignal): Promise<DownloadPayload[]> {
    const file = tracks.file(fileId)
    if (!file) return []
    const item = tracks.item(file.itemId)
    if (!item) return []
    const rows = wanted.forFile(fileId)
    if (rows.length === 0) return []
    const profile = profileOf(item)
    if (!profile) return []
    const wants = profile.languages
      .flatMap(wantsOf)
      .filter((w) =>
        rows.some((r) => r.language === w.language && r.forced === w.forced && r.hi === w.hi),
      )
    const found = await ask(query(file, item, [...new Set(wants.map((w) => w.language))]), signal)
    const sf = scoredFile(file, item)
    const min = minScore(profile)
    const picks: DownloadPayload[] = []
    const unpicked = rows.filter((r) => {
      const want = wants.find(
        (w) => w.language === r.language && w.forced === r.forced && w.hi === r.hi,
      )
      const pick = want ? best(found.results, sf, want, min) : null
      if (pick) picks.push({ fileId, candidate: pick, chosen: false, replaces: null })
      return !pick
    })
    // a provider that failed leaves the rows due, so the next run asks it again
    if (found.failed.length === 0) wanted.searched(unpicked)
    return picks
  }

  /**
   * Upgrades (Keep upgrading for): tracks downloaded inside the window, not chosen by hand, below
   * the maximum, in a language the cutoff still lets upgrade. A result must beat the track's score
   * by at least one, as Bazarr's upgrade search asks.
   */
  async function upgradeFile(fileId: string, signal?: AbortSignal): Promise<DownloadPayload[]> {
    const file = tracks.file(fileId)
    if (!file) return []
    const item = tracks.item(file.itemId)
    if (!item) return []
    const profile = profileOf(item)
    if (!profile) return []
    const since = clock.now() - settings.get().upgradeDays * 24 * 60 * 60_000
    const met = cutoffMet(profile, tracks.present(file))
    const upgradable = tracks
      .rowsOf(fileId)
      .filter(
        (t) =>
          t.kind === 'external' &&
          !t.chosen &&
          t.createdAt >= since &&
          t.score < 100 &&
          (!met || t.language === profile.cutoff),
      )
    if (upgradable.length === 0) return []
    const found = await ask(
      query(file, item, [...new Set(upgradable.map((t) => t.language))]),
      signal,
    )
    const sf = scoredFile(file, item)
    const min = minScore(profile)
    const picks: DownloadPayload[] = []
    for (const t of upgradable) {
      const rule = ruleFor(profile, t.language)
      if (!rule) continue
      const want: Want = { language: t.language, forced: t.forced, hi: rule.hi === 'only', rule }
      const pick = best(found.results, sf, want, Math.max(min, t.score + 1))
      if (
        pick &&
        !(pick.result.provider === t.provider && pick.result.ref === t.providerSubtitleId)
      )
        picks.push({ fileId, candidate: pick, chosen: false, replaces: t.id })
    }
    return picks
  }

  return { searchItem, use, keep, searchFile, upgradeFile, minScore }
}

export type Search = ReturnType<typeof createSearch>
