// SPDX-License-Identifier: AGPL-3.0-only
// What the server tells its connections (8b, ADR 0046): the runtime hears what happened through the
// seams the domain packages already have, and turns it into the notification service's events. No
// domain package imports notifications (ADR 0036):
// - the history (media's `onHistory`): a grab, an import (and an upgrade), a subtitle downloaded
//   and then synced, or kept as it came;
// - downloads' `failed`: a download blocklisted and given up on, and whether another took its place;
// - a list run's `onAdded`, once per run; a person adding a movie, from the API;
// - `updates.available` on the event bus;
// - the health issues, diffed every minute against the last ones seen, kept in a setting so a
//   restart doesn't announce them again: one message when an issue appears, one when it clears.
// Each event's id is the thing that happened (the download, the history row, the track's download,
// the issue's first sighting), so a job that runs twice sends one message.
//
// A poster's address is the server's own image route, signed so the service that shows it (Discord,
// Slack, Telegram) can fetch it without signing in: an HMAC-SHA-256 of the path with a key kept
// sealed in settings. Without an external URL there's no address a service could reach, so the
// messages carry no link and no poster.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Clock, Logger, Sealer } from '@highsea/core'
import { type Db, readSetting, schema, writeSetting } from '@highsea/db'
import type { DownloadFailure } from '@highsea/downloads'
import type { HistoryInput } from '@highsea/media/shared'
import { IMAGE_ROUTE } from '@highsea/metadata'
import type { Notifications } from '@highsea/notifications/service'
import type { MovieRef } from '@highsea/notifications/shared'
import { and, eq } from 'drizzle-orm'
import type { HealthIssue } from './system.ts'

const { mediaItems, downloads, subtitleFiles, users } = schema

export const IMAGE_KEY_SETTING = 'notifications.imageKey'
export const HEALTH_SETTING = 'notifications.health'
/** How often the health issues are compared with the last ones seen. */
export const HEALTH_EVERY_MS = 60_000

type SeenIssue = { source: string; level: 'warning' | 'error'; message: string; since: number }

export type NotifyDeps = {
  db: Db
  clock: Clock
  logger: Logger
  sealer: Sealer
  notifications: Notifications
  /** A movie's cached poster: the server's image path. */
  poster(tmdbId: number): string | null
  externalUrl(): string | null
  issues(): HealthIssue[]
  /** The server's language and time zone, from General. */
  general(): { language: string; timeZone: string }
}

export function createNotify(deps: NotifyDeps) {
  const { db, clock, notifications } = deps
  const log = deps.logger.child('notifications')

  // ------------------------------------------------------------ signed posters

  let imageKey: Buffer | null = null
  function key(): Buffer {
    if (imageKey) return imageKey
    const stored = readSetting(db, IMAGE_KEY_SETTING, { key: '' })
    if (stored.key) imageKey = Buffer.from(deps.sealer.open(stored.key), 'base64url')
    else {
      imageKey = randomBytes(32)
      writeSetting(
        db,
        IMAGE_KEY_SETTING,
        { key: deps.sealer.seal(imageKey.toString('base64url')) },
        clock.now(),
      )
    }
    return imageKey
  }
  const mac = (path: string) => createHmac('sha256', key()).update(path).digest('base64url')

  /** Whether `sig` is this server's signature of the image path. */
  function verifyImage(path: string, sig: string | null | undefined): boolean {
    if (!sig || !path.startsWith(`${IMAGE_ROUTE}/`)) return false
    const want = Buffer.from(mac(path))
    const got = Buffer.from(sig)
    return want.length === got.length && timingSafeEqual(want, got)
  }

  const base = () => deps.externalUrl()?.replace(/\/+$/, '') ?? null
  /** An admin page's absolute address, or null without an external URL. */
  const page = (path: string) => {
    const b = base()
    return b ? `${b}${path}` : null
  }

  function movieRef(row: { tmdbId: number | null; title: string; year: number | null }): MovieRef {
    const tmdbId = row.tmdbId ?? 0
    const b = base()
    const poster = b ? deps.poster(tmdbId) : null
    return {
      title: row.title,
      year: row.year,
      tmdbId,
      url: b ? `${b}/movies/${tmdbId}` : null,
      posterUrl: b && poster ? `${b}${poster}?sig=${mac(poster)}` : null,
    }
  }

  function item(itemId: string) {
    const row = db
      .select({ tmdbId: mediaItems.tmdbId, title: mediaItems.title, year: mediaItems.year })
      .from(mediaItems)
      .where(eq(mediaItems.id, itemId))
      .get()
    return row?.tmdbId != null ? movieRef(row) : null
  }

  function byTmdb(tmdbId: number) {
    const row = db
      .select({
        id: mediaItems.id,
        tmdbId: mediaItems.tmdbId,
        title: mediaItems.title,
        year: mediaItems.year,
      })
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'movie'), eq(mediaItems.tmdbId, tmdbId)))
      .get()
    return row ? { id: row.id, ref: movieRef(row) } : null
  }

  const languageName = (code: string) => {
    try {
      return new Intl.DisplayNames(deps.general().language, { type: 'language' }).of(code) ?? code
    } catch {
      return code
    }
  }

  /** Each listener is a side line: what it throws is logged, and the work it heard goes on. */
  const guarded =
    <A extends unknown[]>(what: string, fn: (...args: A) => void) =>
    (...args: A) => {
      try {
        fn(...args)
      } catch (e) {
        log.warn(`couldn’t queue a notification for ${what}`, { error: (e as Error).message })
      }
    }

  // ------------------------------------------------------------ the history

  function subtitle(trackId: unknown, synced: boolean | 'if-unsynced') {
    if (typeof trackId !== 'string') return
    const track = db.select().from(subtitleFiles).where(eq(subtitleFiles.id, trackId)).get()
    // a track that came with the release isn't one that was added
    if (!track || track.provider === 'release') return
    // downloaded with Sync to the audio on: the sync's outcome says the rest
    if (synced === 'if-unsynced' && track.syncStatus !== 'unsynced') return
    const movie = item(track.itemId)
    if (!movie) return
    notifications.notify(
      'subtitle-added',
      { movie, language: languageName(track.language), synced: synced === true },
      `subtitle:${track.id}:${track.provider}:${track.providerSubtitleId ?? ''}`,
    )
  }

  function onHistory(id: string, entry: HistoryInput) {
    const data = entry.data ?? {}
    switch (entry.type) {
      case 'grabbed': {
        const movie = item(entry.itemId)
        if (!movie) return
        const size = entry.downloadId
          ? (db
              .select({ size: downloads.size })
              .from(downloads)
              .where(eq(downloads.id, entry.downloadId))
              .get()?.size ?? 0)
          : 0
        notifications.notify(
          'grabbed',
          { movie, release: entry.sourceTitle, indexer: entry.indexer ?? '', size },
          `grabbed:${entry.downloadId ?? id}`,
        )
        return
      }
      case 'imported': {
        // a file the library scan found in place isn't news
        if (data.inPlace === true) return
        const movie = item(entry.itemId)
        if (!movie) return
        const quality = entry.quality ?? ''
        const size = typeof data.size === 'number' ? data.size : 0
        const from = typeof data.upgradedFrom === 'string' ? data.upgradedFrom : null
        // one id for both: a connection that hears Imported and Upgraded gets one message
        const eventId = `import:${id}`
        if (from)
          notifications.notify('upgraded', { movie, quality, size, upgradedFrom: from }, eventId)
        notifications.notify('imported', { movie, quality, size, upgradedFrom: from }, eventId)
        return
      }
      case 'subtitle-downloaded':
      case 'subtitle-upgraded':
        subtitle(data.trackId, 'if-unsynced')
        return
      case 'subtitle-synced':
        subtitle(data.trackId, true)
        return
      case 'subtitle-sync-failed':
        subtitle(data.trackId, false)
        return
    }
  }

  // ------------------------------------------------------------ downloads, lists, people

  function onFailed(f: DownloadFailure) {
    const movie = item(f.itemId)
    if (!movie) return
    notifications.notify(
      'download-failed',
      { movie, release: f.releaseTitle, reason: f.reason, replaced: f.replaced },
      `download-failed:${f.downloadId}`,
    )
  }

  /** The first few, for the message's names. */
  const NAMED = 3

  function onListAdded(run: { listId: string; name: string; at: number; tmdbIds: number[] }) {
    const movies = run.tmdbIds
      .slice(0, NAMED)
      .map((t) => byTmdb(t)?.ref)
      .filter((m): m is MovieRef => !!m)
    notifications.notify(
      'movie-added',
      { count: run.tmdbIds.length, source: run.name, movies, by: 'list' },
      `list:${run.listId}:${run.at}`,
    )
  }

  /** A person added a movie (the API's add). */
  function movieAdded(tmdbId: number, by: string) {
    const found = byTmdb(tmdbId)
    if (!found) return
    notifications.notify(
      'movie-added',
      { count: 1, source: by, movies: [found.ref], by: 'person' },
      `movie-added:${found.id}`,
    )
  }

  function updateAvailable(version: string) {
    notifications.notify('update', { version, url: page('/settings/general') }, `update:${version}`)
  }

  // ------------------------------------------------------------ health

  /** Compares the issues with the last ones seen; returns how many changes it announced. */
  function checkHealth(): number {
    const now = clock.now()
    const seen = readSetting<Record<string, SeenIssue>>(db, HEALTH_SETTING, {})
    const current = new Map<string, HealthIssue & { level: 'warning' | 'error' }>()
    for (const i of deps.issues())
      if (i.level === 'warning' || i.level === 'error')
        current.set(`${i.id}|${i.level}`, i as HealthIssue & { level: 'warning' | 'error' })
    const next: Record<string, SeenIssue> = {}
    const url = page('/system/health')
    let changes = 0
    for (const [k, i] of current) {
      const before = seen[k]
      if (before) {
        next[k] = before
        continue
      }
      next[k] = { source: i.source, level: i.level, message: i.message, since: now }
      notifications.notify(
        'health',
        { level: i.level, source: i.source, message: i.message, cleared: false, url },
        `health:${k}:${now}`,
      )
      changes++
    }
    for (const [k, before] of Object.entries(seen)) {
      if (current.has(k)) continue
      notifications.notify(
        'health',
        {
          level: before.level,
          source: before.source,
          message: before.message,
          cleared: true,
          url,
        },
        `health:${k}:${before.since}:cleared`,
      )
      changes++
    }
    if (changes) writeSetting(db, HEALTH_SETTING, next, now)
    return changes
  }

  // ------------------------------------------------------------ the server's mail

  /**
   * Emails an invite or a reset link through the server's mail, when there is one and the person
   * has an address. False when nothing was sent; a mail server that refused it is logged.
   */
  async function mailLink(input: {
    kind: 'invite' | 'reset'
    userId: string
    link: string
    expiresAt: number
    inviter?: string
  }): Promise<boolean> {
    if (!notifications.hasServerMail()) return false
    const person = db.select().from(users).where(eq(users.id, input.userId)).get()
    if (!person?.email) return false
    try {
      // people have no language of their own yet: the email is in the server's (its brand)
      return await notifications.sendServerMail(person.email, {
        kind: input.kind,
        name: person.displayName,
        inviter: input.inviter,
        link: input.link,
        expiresAt: input.expiresAt,
      })
    } catch (e) {
      log.warn('couldn’t email a link', { kind: input.kind, error: (e as Error).message })
      return false
    }
  }

  return {
    onHistory: guarded('the history', onHistory),
    onFailed: guarded('a failed download', onFailed),
    onListAdded: guarded('a list', onListAdded),
    movieAdded: guarded('a movie added', movieAdded),
    updateAvailable: guarded('an update', updateAvailable),
    checkHealth,
    verifyImage,
    mailLink,
  }
}

export type Notify = ReturnType<typeof createNotify>
