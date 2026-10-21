// SPDX-License-Identifier: AGPL-3.0-only
// Syncing a movie's subtitle tracks to their video (ADR 0044; checkpoint 7, The sync engine). The
// engine runs in the worker pool through `deps.sync`; this module picks the reference, keeps the
// track's status, writes the sidecar from the stored original with the correction and the manual
// nudge, and records the result. A sync is safe to repeat (ADR 0022): it works from the original,
// writes the sidecar by renaming a finished file, and keys its history entry by its job, which
// keeps its id through retries and restarts.
import { AppError } from '@highsea/core'
import { schema } from '@highsea/db'
import { eq, inArray } from 'drizzle-orm'
import { languageName } from '../shared/languages.ts'
import { renderSubtitle, subtitleCues } from '../shared/processing/index.ts'
import { MAX_POINTS, WEIGHTS } from '../shared/scoring.ts'
import type { Settings } from '../shared/settings.ts'
import { applyCorrection, type Correction, IDENTITY, type Section } from '../sync/align.ts'
import { SyncError } from '../sync/binaries.ts'
import { chooseReference } from '../sync/reference.ts'
import type { SyncOutcome, SyncTask } from '../sync/worker.ts'
import { announce, type SubtitlesDeps } from './context.ts'
import type { FileInfo, TrackRow, Tracks, TrackView } from './tracks.ts'

const { subtitleFiles } = schema

/** How the runtime runs a sync: in the worker pool, stopping when the signal fires. */
export type RunSync = (task: SyncTask, signal: AbortSignal) => Promise<SyncOutcome>

/** The furthest the manual nudge goes: ten minutes either way. */
export const MAX_NUDGE_MS = 10 * 60_000

const REFERENCE_NAMES: Record<SyncOutcome['reference'], string> = {
  audio: 'the audio',
  text: 'the file’s own subtitles',
  image: 'the file’s own subtitles',
}

const percent = (n: number) => `${Math.round(n * 100)}%`

/** The correction a track's row holds: none unless it's synced. */
export function correctionOf(row: TrackRow): Correction {
  const sections = row.syncSplits as Section[] | null
  if (row.syncStatus !== 'synced' || !sections || sections.length === 0) return IDENTITY
  return { ratio: row.syncRatio ?? 1, sections }
}

/** The offset the sync found, while its correction holds; the view adds the nudge to it. */
export const syncedOffsetOf = (row: TrackRow): number =>
  correctionOf(row) === IDENTITY ? 0 : (row.syncOffsetMs ?? 0)

/** "Framerate corrected (25 → 23.976)" or "2 sections moved", for A6's detail line; null for one offset. */
export function correctionDetail(c: Correction): string | null {
  if (c.ratio !== 1) {
    // the ratio maps the subtitle's times onto the video's: subtitle fps / video fps
    const pairs: [number, number][] = [
      [25, 24],
      [25, 23.976],
      [24, 23.976],
    ]
    for (const [a, b] of pairs) {
      if (Math.abs(c.ratio - a / b) < 1e-4) return `Framerate corrected (${a} → ${b})`
      if (Math.abs(c.ratio - b / a) < 1e-4) return `Framerate corrected (${b} → ${a})`
    }
    return 'Framerate corrected'
  }
  return c.sections.length > 1 ? `${c.sections.length} sections moved` : null
}

export function createSync(
  deps: SubtitlesDeps,
  { tracks, settings, run }: { tracks: Tracks; settings: Settings; run: RunSync },
) {
  const { db, clock, events, media } = deps
  const log = deps.logger.child('subtitles')

  /** Writes a track's sidecar from its original, moved by `correction` and the nudge. */
  async function render(row: TrackRow, correction: Correction, nudgeMs: number): Promise<void> {
    const original = tracks.originalOf(row)
    if (!original) return
    const moved = correction === IDENTITY && nudgeMs === 0
    const { text } = renderSubtitle(original, {
      removeHi: row.hiRemoved,
      shift: moved ? undefined : (ms, anchor) => applyCorrection(correction, ms, anchor) + nudgeMs,
    })
    await tracks.write(row.path, text)
  }

  const set = (id: string, values: Partial<TrackRow>) =>
    db
      .update(subtitleFiles)
      .set({ ...values, updatedAt: clock.now() })
      .where(eq(subtitleFiles.id, id))
      .run()

  const announceRow = (row: TrackRow, history = false) => {
    const item = tracks.item(row.itemId)
    if (item) announce(events, [item.tmdbId], { history })
  }

  /** A text track with its original can be synced and nudged; an image subtitle can't. */
  function textTrack(trackId: string): TrackRow {
    const row = tracks.track(trackId)
    if (!row.original)
      throw new AppError('invalid', 'Only a text subtitle can be synced or moved.', {
        reason: 'image-subtitle',
      })
    return row
  }

  /**
   * Marks a track Waiting to sync and returns what the job needs. The nudge goes back to zero: a
   * fresh sync replaces the owner's judgement with the engine's (judgement call 18).
   */
  function prepare(row: TrackRow): { trackId: string; requestedAt: number } {
    const requestedAt = clock.now()
    set(row.id, { syncStatus: 'queued', manualOffsetMs: 0 })
    return { trackId: row.id, requestedAt }
  }

  /** The `subtitles.sync` job. */
  async function syncTrack(
    { trackId, requestedAt }: { trackId: string; requestedAt: number },
    ctx: { jobId: string; signal: AbortSignal; attempt: number; attempts: number },
  ): Promise<void> {
    const row = db.select().from(subtitleFiles).where(eq(subtitleFiles.id, trackId)).get()
    // deleted since, or finished by an earlier run of this request
    if (!row?.original) return
    const finished = row.syncStatus !== 'queued' && row.syncStatus !== 'syncing'
    if (finished && row.syncedAt !== null && row.syncedAt >= requestedAt) return
    const file = tracks.file(row.mediaFileId)
    const item = tracks.item(row.itemId)
    if (!file || !item) return
    const key = ctx.jobId
    const language = languageName(row.language)
    const sourceTitle = tracks.nameOf(row.path)
    const record = (
      type: 'subtitle-synced' | 'subtitle-sync-failed',
      message: string,
      data: object,
    ) => {
      if (!media.history.has(item.id, type, 'key', key))
        media.history.write({
          itemId: item.id,
          type,
          sourceTitle,
          message,
          data: { key, trackId, ...data },
        })
    }

    const probe = ((file.mediaInfo ?? {}) as FileInfo).probe
    const reference = probe ? chooseReference(probe) : null
    if (!reference) {
      set(trackId, { syncStatus: 'failed', syncedAt: clock.now() })
      record(
        'subtitle-sync-failed',
        `Couldn’t sync ${language} subtitles: the file has no audio.`,
        {},
      )
      announceRow(row, true)
      return
    }

    set(trackId, { syncStatus: 'syncing' })
    announceRow(row)
    let outcome: SyncOutcome
    try {
      const original = tracks.originalOf(row) as string
      const cues = subtitleCues(original, { removeHi: row.hiRemoved })
      outcome = await run({ file: file.path, reference, cues }, ctx.signal)
    } catch (e) {
      const error = e as Error
      const last = e instanceof SyncError || ctx.attempt >= ctx.attempts
      if (!last) {
        set(trackId, { syncStatus: 'queued' })
        announceRow(row)
        throw e
      }
      set(trackId, { syncStatus: 'failed', syncedAt: clock.now() })
      record('subtitle-sync-failed', `Couldn’t sync ${language} subtitles: ${error.message}`, {})
      announceRow(row, true)
      log.warn('subtitle sync failed', { trackId, error: error.message })
      // a missing ffmpeg won't be fixed by trying again; anything else gets the job's record
      if (e instanceof SyncError) return
      throw e
    }

    const now = clock.now()
    const latest = tracks.track(trackId)
    const min = settings.get().minConfidence
    const confidence = Math.round(outcome.confidence * 1000) / 1000
    if (outcome.confidence >= min) {
      const c = outcome.correction
      await render(latest, c, latest.manualOffsetMs)
      set(trackId, {
        syncStatus: 'synced',
        syncConfidence: confidence,
        syncRatio: c.ratio,
        syncOffsetMs: outcome.offsetMs,
        syncSplits: c.sections,
        syncedAt: now,
      })
      const detail = correctionDetail(c)
      record(
        'subtitle-synced',
        `Synced ${language} subtitles to ${REFERENCE_NAMES[outcome.reference]}: ${percent(outcome.confidence)} confidence${detail ? `. ${detail}` : ''}.`,
        {
          confidence,
          offsetMs: outcome.offsetMs,
          ratio: c.ratio,
          sections: c.sections.length,
          reference: outcome.reference,
        },
      )
    } else {
      // the original timing stays (subtitles.md); only the nudge moves it
      await render(latest, IDENTITY, latest.manualOffsetMs)
      set(trackId, {
        syncStatus: 'unsynced',
        syncConfidence: confidence,
        syncRatio: null,
        syncOffsetMs: null,
        syncSplits: null,
        syncedAt: now,
      })
      record(
        'subtitle-sync-failed',
        `Kept the original timing: ${percent(outcome.confidence)} confidence.`,
        {
          confidence,
          reference: outcome.reference,
          measures: outcome.measures,
        },
      )
    }
    announceRow(row, true)
    log.info('subtitle synced', {
      trackId,
      confidence,
      offsetMs: outcome.offsetMs,
      reference: outcome.reference,
      kept: outcome.confidence >= min,
    })
  }

  /**
   * − and + on A6: `ms` is the offset the owner sees, the sync's own plus the nudge, so the nudge is
   * what's left after the sync's. The sync's correction is kept; the sidecar is written at once.
   */
  async function setOffset(trackId: string, ms: number): Promise<TrackView> {
    if (!Number.isInteger(ms) || Math.abs(ms) > MAX_NUDGE_MS)
      throw new AppError(
        'invalid',
        'The offset must be a whole number of milliseconds, at most 10 minutes.',
      )
    const row = textTrack(trackId)
    const nudge = ms - syncedOffsetOf(row)
    await render(row, correctionOf(row), nudge)
    set(trackId, { manualOffsetMs: nudge })
    announceRow(row)
    const item = tracks.item(row.itemId)
    return tracks.view(tracks.track(trackId), item?.tmdbId ?? 0)
  }

  /**
   * A file was replaced: its tracks were made for the old one. A hash match no longer holds, so
   * the score drops to what the title and year give (judgement call 38), and each text track
   * waits for a sync.
   */
  function replaced(fileId: string): { trackId: string; requestedAt: number }[] {
    const rows = tracks.rowsOf(fileId).filter((r) => r.original !== null)
    return rows.map((row) => {
      const matches = (row.matches as string[]) ?? []
      if (matches.includes('hash')) {
        const kept = ['title', 'year'] as const
        set(row.id, {
          matches: [...kept],
          score: Math.round(((WEIGHTS.title + WEIGHTS.year) * 100) / MAX_POINTS),
        })
      }
      return prepare(row)
    })
  }

  /** Boot: tracks left waiting or mid-sync by a stop are queued again (the dedupe key holds one). */
  function waiting(): { trackId: string; requestedAt: number }[] {
    return db
      .select({ id: subtitleFiles.id, updatedAt: subtitleFiles.updatedAt })
      .from(subtitleFiles)
      .where(inArray(subtitleFiles.syncStatus, ['queued', 'syncing']))
      .all()
      .map((r) => ({ trackId: r.id, requestedAt: r.updatedAt }))
  }

  return {
    syncTrack,
    setOffset,
    /** Re-sync: the track waits for a sync, its nudge back at zero. */
    request: (trackId: string) => prepare(textTrack(trackId)),
    replaced,
    waiting,
    render,
  }
}

export type Sync = ReturnType<typeof createSync>
