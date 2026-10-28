// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (checkpoint 4.3a, docs/product/now-playing.md): the live play sessions as the admin
// shows them, and 30 days of what was watched.
//
// - **Live:** playback's sessions, each with what was worked out when it started (the version,
//   what's sent, the person's device) and what its transcode says now (waiting for a slot, its
//   speed). A session someone stopped stays 10 s, saying so, then goes.
// - **`sessions.updated`** as a session starts, pauses, plays, ends or goes, and at most every
//   `MOVED_MS` while reports move the places on, so the page follows without a timer of its own.
// - **History:** a row per session that ended, with no address (answer 10). A stream restarted for
//   another sound or subtitle track, on the same device within `JOIN_MS`, adds to the row before it,
//   so one evening's film reads as one row. A session nothing was watched in leaves none. The daily
//   `playback.prune` removes rows older than 30 days; deleting is safe to repeat (ADR 0022).
import { randomUUID } from 'node:crypto'
import {
  type ClientType,
  type NowPlaying,
  SESSIONS_TOPICS,
  type StreamSession,
  type WatchRecord,
} from '@highsea-tv/api-contract'
import type { Clock, EventBus, Logger } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import {
  audioChannelsOf,
  codecName,
  type MediaInfo,
  resolutionOf,
  versionDetail,
} from '@highsea-tv/media/shared'
import { type PlaybackDecision, streamT } from '@highsea-tv/stream/decision'
import type { Transcodes } from '@highsea-tv/stream/hls'
import type { EndReason, PlaySession } from '@highsea-tv/stream/sessions'
import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { z } from 'zod'

const { playbackHistory, users } = schema

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const HISTORY_PRUNE_JOB = 'playback.prune'
/** How long the history keeps a session (answer 10). */
export const KEEP_HISTORY_MS = 30 * DAY
/** A stopped session's row stays this long, saying who stopped it (now-playing.md › States). */
export const STOPPED_LINGER_MS = 10 * SECOND
/** Reports moving the places on announce `sessions.updated` at most this often. */
export const MOVED_MS = 5 * SECOND
/** A stream started again this soon after one ended, on the same device, adds to its row. */
export const JOIN_MS = 2 * MINUTE

/** What's known when a session starts, kept beside it while it lives. */
type Facts = {
  deviceName: string
  client: ClientType
  year: number | null
  poster: string | null
  version: string
  sent: string
  mbps: number
}

type Lingering = { view: StreamSession; until: number }

const AUDIO: Record<string, string> = {
  aac: 'AAC',
  ac3: 'AC-3',
  eac3: 'E-AC-3',
  dts: 'DTS',
  truehd: 'TrueHD',
  flac: 'FLAC',
  opus: 'Opus',
  mp3: 'MP3',
  alac: 'ALAC',
  vorbis: 'Vorbis',
}

/** "2.0" reads as stereo and "1.0" as mono, as the prototype has them. */
const channelWords = (layout: string) =>
  layout === '2.0' ? 'stereo' : layout === '1.0' ? 'mono' : layout

const lines = (h: number) => (h >= 2100 ? '4K' : `${h}p`)

/** "1080p · H.264 · AAC stereo": what goes out, from the decision and the file. */
export function sentAs(d: PlaybackDecision, info: MediaInfo): string {
  const parts: string[] = []
  const v = info.video
  if (d.video?.action === 'transcode') parts.push(lines(d.video.height), 'H.264')
  else if (v) {
    const r = resolutionOf(v)
    if (r) parts.push(lines(r))
    parts.push(codecName(v.codec))
  }
  if (d.audio?.action === 'transcode') {
    const n = d.audio.channels
    parts.push(`AAC ${channelWords(n <= 2 ? `${n}.0` : `${n - 1}.1`)}`)
  } else if (d.audio) {
    const a = info.audio.find((x) => x.index === d.audio?.index)
    if (a)
      parts.push(
        `${AUDIO[a.codec] ?? a.codec.toUpperCase()} ${channelWords(audioChannelsOf(a))}`.trim(),
      )
  }
  return parts.join(' · ')
}

/** Mbps sent: a transcode's ceiling, or the file's own rate. */
export function mbpsOf(d: PlaybackDecision): number {
  const audio = d.audio?.action === 'transcode' ? (d.audio.channels > 2 ? 384_000 : 160_000) : 0
  const bits = d.video?.action === 'transcode' ? d.video.bitrate + audio : (d.bitrate ?? 0)
  return Math.round(bits / 100_000) / 10
}

const said = streamT()

export function createNowPlaying(deps: {
  db: Db
  clock: Clock
  events: EventBus
  jobs: JobQueue
  logger: Logger
  transcodes: Pick<Transcodes, 'get'>
  /** The live sessions, from playback. */
  live(): PlaySession[]
  displayName(userId: string): string | null
  device(deviceId: string): { name: string; client: ClientType } | null
  poster(tmdbId: number): string | null
  /** A new watch began: not a restart for another track, which joins the one before. */
  onStarted?(p: {
    sessionId: string
    tmdbId: number
    person: string
    device: string
    method: 'direct-play' | 'direct-stream' | 'transcode'
    sent: string
    away: boolean
  }): void
}) {
  const { db, clock, events, jobs } = deps
  const log = deps.logger.child('now-playing')
  const facts = new Map<string, Facts>()
  const lingering = new Map<string, Lingering>()

  // -------------------------------------------------------------- sessions.updated

  let announcedAt = 0
  let pending: ReturnType<typeof setTimeout> | null = null
  const announce = () => {
    if (pending) clearTimeout(pending)
    pending = null
    announcedAt = clock.now()
    events.emit({ topic: SESSIONS_TOPICS.updated })
  }
  /** Places moved: announced now if it's been a while, else once the while is up. */
  const moved = () => {
    if (pending) return
    const wait = announcedAt + MOVED_MS - clock.now()
    if (wait <= 0) return announce()
    pending = setTimeout(announce, wait)
    pending.unref?.()
  }

  // -------------------------------------------------------------- the view

  function view(s: PlaySession, f: Facts, stopped: StreamSession['stopped']): StreamSession {
    const t = deps.transcodes.get(s.id)
    const method = s.decision.method === 'unplayable' ? 'direct-play' : s.decision.method
    return {
      id: s.id,
      user: { id: s.userId, displayName: deps.displayName(s.userId) ?? 'Someone' },
      deviceName: f.deviceName,
      client: f.client,
      item: { tmdbId: s.tmdbId, title: s.title, year: f.year, poster: f.poster },
      version: f.version,
      kind: 'stream',
      state: t?.waiting() ? 'waiting' : s.paused ? 'paused' : 'playing',
      position: s.position,
      runtime: s.duration,
      method,
      reasons: [
        ...s.decision.reasons.filter((r) => r.kind !== 'accepted').map((r) => r.message),
        ...(t?.fellBack() ? [said('transcode.fellBack')] : []),
      ],
      sent: f.sent,
      mbps: f.mbps,
      network: s.away ? 'remote' : 'lan',
      address: s.address,
      // the GPU path the run takes (4.3b), or the processor
      hardware: method === 'transcode' ? (t?.hardware() ?? null) : null,
      speed:
        method === 'transcode' && s.decision.video?.action === 'transcode'
          ? (t?.speed() ?? null)
          : null,
      startedAt: new Date(s.startedAt).toISOString(),
      stopped,
    }
  }

  function list(): NowPlaying {
    const now = clock.now()
    for (const [id, l] of lingering) if (l.until <= now) lingering.delete(id)
    const live = deps.live().flatMap((s) => {
      const f = facts.get(s.id)
      return f && s.decision.method !== 'unplayable' ? [view(s, f, null)] : []
    })
    const sessions = [...live, ...[...lingering.values()].map((l) => l.view)].sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
    )
    const sending = live.filter((s) => s.state === 'playing')
    const sum = (xs: StreamSession[]) => Math.round(xs.reduce((n, s) => n + s.mbps, 0) * 10) / 10
    return {
      sessions,
      totalMbps: sum(sending),
      remoteMbps: sum(sending.filter((s) => s.network === 'remote')),
      transcodes: live.filter((s) => s.method === 'transcode' && s.state !== 'waiting').length,
    }
  }

  // -------------------------------------------------------------- the hooks playback calls

  /** A session started: what it plays, from where, and how. */
  function started(s: PlaySession, file: { info: MediaInfo; year: number | null }) {
    if (s.decision.method === 'unplayable') return
    const device = s.deviceId ? deps.device(s.deviceId) : null
    facts.set(s.id, {
      deviceName: device?.name ?? 'Unknown device',
      client: device?.client ?? 'web',
      year: file.year,
      poster: deps.poster(s.tmdbId),
      version: versionDetail(file.info, s.file.size),
      sent: sentAs(s.decision, file.info),
      mbps: mbpsOf(s.decision),
    })
    announce()
    const f = facts.get(s.id) as Facts
    if (deps.onStarted && !resumed(s, f, clock.now()))
      deps.onStarted({
        sessionId: s.id,
        tmdbId: s.tmdbId,
        person: deps.displayName(s.userId) ?? 'Someone',
        device: f.deviceName,
        method: s.decision.method,
        sent: f.sent,
        away: s.away,
      })
  }

  /** A report: a pause or a play is news at once, a place moving on soon. */
  function heard(paused: boolean, was: boolean) {
    if (paused !== was) announce()
    else moved()
  }

  /** A session ended: its row in the history, and for a stop, its row lingers saying so. */
  function ended(
    s: PlaySession,
    why: EndReason,
    stoppedBy?: { name: string; message: string | null },
  ) {
    const f = facts.get(s.id)
    facts.delete(s.id)
    if (!f) return
    const now = clock.now()
    if (why === 'staff' && stoppedBy) {
      const stopped = {
        by: stoppedBy.name,
        message: stoppedBy.message,
        at: new Date(now).toISOString(),
      }
      lingering.set(s.id, { view: view(s, f, stopped), until: now + STOPPED_LINGER_MS })
      const t = setTimeout(announce, STOPPED_LINGER_MS)
      t.unref?.()
    }
    try {
      record(s, f, now)
    } catch (e) {
      // the person was deleted as the session ended: their rows go with them anyway
      log.debug('a play session’s history wasn’t kept', {
        session: s.id,
        error: (e as Error).message,
      })
    }
    announce()
  }

  // -------------------------------------------------------------- the history

  /** The row this session joins: the same film on the same device, ended a moment ago. */
  const joins = (s: PlaySession, f: Facts, now: number) =>
    db
      .select()
      .from(playbackHistory)
      .where(
        and(
          eq(playbackHistory.userId, s.userId),
          eq(playbackHistory.tmdbId, s.tmdbId),
          eq(playbackHistory.deviceName, f.deviceName),
          gte(playbackHistory.endedAt, now - JOIN_MS),
        ),
      )
      .orderBy(desc(playbackHistory.endedAt))
      .get()

  /** A restart of a watch already going: one that joins a row, or the same film live there. */
  const resumed = (s: PlaySession, f: Facts, now: number) =>
    !!joins(s, f, now) ||
    deps
      .live()
      .some(
        (o) =>
          o.id !== s.id &&
          o.userId === s.userId &&
          o.tmdbId === s.tmdbId &&
          facts.get(o.id)?.deviceName === f.deviceName,
      )

  function record(s: PlaySession, f: Facts, now: number) {
    const watched = Math.round(s.played)
    const method = s.decision.method === 'unplayable' ? null : s.decision.method
    if (!method) return
    const before = joins(s, f, now)
    if (before) {
      db.update(playbackHistory)
        .set({
          watched: before.watched + watched,
          finished: before.finished || s.finished,
          method,
          version: f.version,
          away: before.away || s.away,
          endedAt: now,
        })
        .where(eq(playbackHistory.id, before.id))
        .run()
      return
    }
    if (watched < 1 && !s.finished) return
    db.insert(playbackHistory)
      .values({
        id: randomUUID(),
        userId: s.userId,
        deviceName: f.deviceName,
        client: f.client,
        itemId: s.itemId,
        tmdbId: s.tmdbId,
        title: s.title,
        year: f.year,
        version: f.version,
        method,
        away: s.away,
        watched,
        finished: s.finished,
        startedAt: s.startedAt,
        endedAt: now,
      })
      .run()
  }

  /** The last 30 days, newest first; one person's when asked. */
  function history(userId?: string): WatchRecord[] {
    const since = clock.now() - KEEP_HISTORY_MS
    const rows = db
      .select({ row: playbackHistory, displayName: users.displayName })
      .from(playbackHistory)
      .innerJoin(users, eq(users.id, playbackHistory.userId))
      .where(
        and(
          gte(playbackHistory.endedAt, since),
          userId ? eq(playbackHistory.userId, userId) : undefined,
        ),
      )
      .orderBy(desc(playbackHistory.startedAt))
      .all()
    return rows.map(({ row, displayName }) => ({
      id: row.id,
      user: { id: row.userId, displayName },
      deviceName: row.deviceName,
      client: row.client,
      item: {
        tmdbId: row.itemId ? row.tmdbId : null,
        title: row.title,
        year: row.year,
        poster: row.itemId ? deps.poster(row.tmdbId) : null,
      },
      version: row.version,
      method: row.method,
      network: row.away ? 'remote' : 'lan',
      startedAt: new Date(row.startedAt).toISOString(),
      endedAt: new Date(row.endedAt).toISOString(),
      watched: row.watched,
      finished: row.finished,
    }))
  }

  /** Removes the rows older than 30 days. */
  function prune(): number {
    return db
      .delete(playbackHistory)
      .where(lt(playbackHistory.endedAt, clock.now() - KEEP_HISTORY_MS))
      .returning({ id: playbackHistory.id })
      .all().length
  }

  jobs.define({
    type: HISTORY_PRUNE_JOB,
    payload: z.object({}),
    async run() {
      const n = prune()
      if (n) log.info('Pruned the playback history', { removed: n })
    },
  })

  return {
    list,
    history,
    prune,
    hooks: { started, heard, ended },
    /** The daily prune, first an hour after boot. */
    schedule(now: number) {
      jobs.schedule(HISTORY_PRUNE_JOB, DAY, { firstRunAt: now + HOUR })
    },
    close() {
      if (pending) clearTimeout(pending)
      pending = null
    },
  }
}

export type NowPlayingService = ReturnType<typeof createNowPlaying>
