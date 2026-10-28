// SPDX-License-Identifier: AGPL-3.0-only
// Live play sessions (checkpoint 4.1a): who is playing what, on which device, how, and where they
// are. Kept in memory, as a restart ends every stream anyway; 4.3's Now playing reads them. A
// session nobody reports on for `idleMs` ends by itself, and its URL with it.
//
// The URL's token (`/stream/files/{token}`) names the session and the file, signed with HMAC-SHA256
// (RFC 2104, Node's `crypto.createHmac`) under a key made when the process starts, and compared in
// constant time (`crypto.timingSafeEqual`). It's good while its session lives and for `tokenMs`
// after the last report, so a report renews it and ending the session ends it at once (answer 4).
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { PlaybackDecision } from '../decision/index.ts'

/** How long a URL works after the last report: 6 hours (answer 4). */
export const TOKEN_MS = 6 * 60 * 60 * 1000
/** A session with no report for this long has been left: 5 minutes. */
export const IDLE_MS = 5 * 60 * 1000
/** Positions are saved at most this often per session, and on every pause (ADR 0054). */
export const SAVE_EVERY_MS = 5_000

export type SessionInput = {
  userId: string
  deviceId: string | null
  /** The library item, and its TMDB id for the API and events. */
  itemId: string
  tmdbId: number
  title: string
  versionId: string
  file: { id: string; path: string; size: number }
  decision: PlaybackDecision
  /** Seconds in at the start. */
  position: number
  duration: number | null
}

export type PlaySession = SessionInput & {
  id: string
  paused: boolean
  startedAt: number
  /** The last report, or the start. */
  heardAt: number
  /** When the URL stops working without another report. */
  expiresAt: number
  savedAt: number
}

export function createSessions({
  now,
  idleMs = IDLE_MS,
  tokenMs = TOKEN_MS,
  onEnd,
}: {
  now: () => number
  idleMs?: number
  tokenMs?: number
  /** Hears each session as it ends, whether left, idle or taken away. */
  onEnd?: (session: PlaySession, why: 'stopped' | 'idle' | 'revoked') => void
}) {
  const live = new Map<string, PlaySession>()
  const key = randomBytes(32)

  const mac = (s: Pick<PlaySession, 'id' | 'userId'>, fileId: string) =>
    createHmac('sha256', key).update(`${s.id}\n${s.userId}\n${fileId}`).digest('base64url')

  function end(id: string, why: 'stopped' | 'idle' | 'revoked' = 'stopped'): boolean {
    const s = live.get(id)
    if (!s) return false
    live.delete(id)
    onEnd?.(s, why)
    return true
  }

  /** Ends the sessions nobody has reported on for `idleMs`. */
  function sweep() {
    const t = now()
    for (const s of [...live.values()]) if (t - s.heardAt >= idleMs) end(s.id, 'idle')
  }

  function start(input: SessionInput): PlaySession {
    const t = now()
    const s: PlaySession = {
      ...input,
      id: randomUUID(),
      paused: false,
      startedAt: t,
      heardAt: t,
      expiresAt: t + tokenMs,
      savedAt: 0,
    }
    live.set(s.id, s)
    return s
  }

  /** The person's live session, or null: someone else's reads as absent. */
  function get(id: string, userId: string): PlaySession | null {
    sweep()
    const s = live.get(id)
    return s && s.userId === userId ? s : null
  }

  /**
   * A report: the place and whether it's paused. Renews the URL, and says whether the position is
   * due to be saved: the first report, a pause, or `SAVE_EVERY_MS` since the last save.
   */
  function heard(s: PlaySession, report: { position: number; paused: boolean }) {
    const t = now()
    const save = s.savedAt === 0 || report.paused !== s.paused || t - s.savedAt >= SAVE_EVERY_MS
    s.position = report.position
    s.paused = report.paused
    s.heardAt = t
    s.expiresAt = t + tokenMs
    if (save) s.savedAt = t
    return { save }
  }

  /** `{session}.{file}.{signature}`: the path segment `/stream/files/` takes. */
  const token = (s: PlaySession) => `${s.id}.${s.file.id}.${mac(s, s.file.id)}`

  /** The live session a token belongs to, or null when it's forged, expired or ended. */
  function verify(token: string): PlaySession | null {
    const [id, fileId, sig, ...rest] = token.split('.')
    if (!id || !fileId || !sig || rest.length) return null
    sweep()
    const s = live.get(id)
    if (!s || s.file.id !== fileId || now() >= s.expiresAt) return null
    const want = Buffer.from(mac(s, fileId))
    const got = Buffer.from(sig)
    return want.length === got.length && timingSafeEqual(want, got) ? s : null
  }

  /** Ends every session of a person's that `keep` refuses: a library taken away, a device signed out. */
  function revoke(userId: string, keep: (s: PlaySession) => boolean = () => false) {
    for (const s of [...live.values()]) if (s.userId === userId && !keep(s)) end(s.id, 'revoked')
  }

  /** Every live session, for Now playing (4.3) and the test page. */
  const list = (): PlaySession[] => {
    sweep()
    return [...live.values()]
  }

  return { start, get, heard, end, sweep, token, verify, revoke, list }
}

export type Sessions = ReturnType<typeof createSessions>
