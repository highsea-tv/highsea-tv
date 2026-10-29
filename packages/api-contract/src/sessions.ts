// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (checkpoint 4.3a, docs/product/now-playing.md): who's watching what now, how each
// stream is sent and why, Stop with a message, and 30 days of what was watched. The owner and
// admins only. These sit beside 4.1's `/playback/sessions`, which the clients use for their own.
import { createRoute, z } from '@hono/zod-openapi'
import { ClientType } from './accounts.ts'
import { API_PREFIX, access, body, errors, IdParam, IsoDate, json } from './common.ts'
import { ACCELERATION_PATHS } from './playback-settings.ts'

/**
 * - `sessions.updated`: a session started, moved, changed or ended. Staff only. Ids are empty.
 * - `playback.stopped`: someone stopped this person's stream from Now playing. Only the person
 *   hears it; ids are the session's. Their player then reads who and why from the session's
 *   answer (a 404 with `reason: 'stopped'`).
 */
export const SESSIONS_TOPICS = {
  updated: 'sessions.updated',
  stopped: 'playback.stopped',
} as const

/** Who stopped a stream and their message, as a report's 404 gives it to the player. */
export const StoppedDetails = z
  .object({
    reason: z.literal('stopped'),
    by: z.string(),
    message: z.string().nullable(),
  })
  .openapi('StoppedDetails')

const Person = z.object({ id: z.string(), displayName: z.string() })

const Title = z.object({
  /** Null when the title has left the library since. */
  tmdbId: z.number().int().nullable(),
  title: z.string(),
  year: z.number().int().nullable(),
  /** The server's image path, or null. */
  poster: z.string().nullable(),
})

export const DeliveryMethod = z
  .enum(['direct-play', 'direct-stream', 'transcode'])
  .openapi('DeliveryMethod')

export const StreamSession = z
  .object({
    id: z.string(),
    user: Person,
    deviceName: z.string(),
    client: ClientType,
    item: Title,
    /** The version it's made from: "4K · HDR10 · HEVC · 18.2 GB". */
    version: z.string(),
    /** A stream to watch, or a copy made for a device to keep (Downloads, later). */
    kind: z.enum(['stream', 'download']),
    /** `waiting`: a transcode waiting for a free slot (Settings › Playback's limit). */
    state: z.enum(['playing', 'paused', 'waiting']),
    /** Seconds into the film. */
    position: z.number(),
    /** Seconds; null when the file's length isn't known. */
    runtime: z.number().nullable(),
    method: DeliveryMethod,
    /** Why it isn't direct play, a sentence each, in the server's language. */
    reasons: z.array(z.string()),
    /** What's sent: "1080p · H.264 · AAC 2.0". */
    sent: z.string(),
    mbps: z.number(),
    network: z.enum(['lan', 'remote']),
    address: z.string(),
    /** The path transcoding it, or null for the processor; only for transcodes. */
    hardware: z.enum(ACCELERATION_PATHS).nullable(),
    /** Film seconds made per second while a transcode runs; below 1 it can't keep up. */
    speed: z.number().nullable(),
    startedAt: IsoDate,
    /** Set for 10 seconds after someone stops it, then it goes. */
    stopped: z.object({ by: z.string(), message: z.string().nullable(), at: IsoDate }).nullable(),
  })
  .openapi('StreamSession')

export const NowPlaying = z
  .object({
    sessions: z.array(StreamSession),
    /** Mbps sent in all, by the streams that are playing. */
    totalMbps: z.number(),
    remoteMbps: z.number(),
    transcodes: z.number().int(),
  })
  .openapi('NowPlaying')

/** A session that ended (4.3's answer 10): no addresses are kept. */
export const WatchRecord = z
  .object({
    id: z.string(),
    user: Person,
    deviceName: z.string(),
    client: ClientType,
    item: Title,
    version: z.string(),
    method: DeliveryMethod,
    network: z.enum(['lan', 'remote']),
    startedAt: IsoDate,
    endedAt: IsoDate,
    /** Seconds watched. */
    watched: z.number().int(),
    /** Played past 90%. */
    finished: z.boolean(),
  })
  .openapi('WatchRecord')

export const HistoryQuery = z.object({
  userId: z.string().optional(),
})

export const StopRequest = z
  .object({
    /** Shown in their player, with your name. */
    message: z.string().trim().max(200).default(''),
  })
  .openapi('StopRequest')

export const sessions = {
  list: createRoute({
    method: 'get',
    path: `${API_PREFIX}/sessions`,
    tags: ['Sessions'],
    summary: 'Who’s watching what now, and how each stream is sent',
    ...access('staff'),
    responses: {
      200: json(NowPlaying, 'The live sessions and the totals'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  history: createRoute({
    method: 'get',
    path: `${API_PREFIX}/sessions/history`,
    tags: ['Sessions'],
    summary: 'What was watched in the last 30 days, newest first',
    ...access('staff'),
    request: { query: HistoryQuery },
    responses: {
      200: json(z.array(WatchRecord), 'The sessions that ended'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  stop: createRoute({
    method: 'post',
    path: `${API_PREFIX}/sessions/{id}/stop`,
    tags: ['Sessions'],
    summary: 'Stop a stream, with a message for the person watching',
    description:
      'Ends the session and its URL at once. The person’s player stops and shows who stopped it and the message; they can start it again. 404 when it has already ended.',
    ...access('staff'),
    request: { params: IdParam, ...body(StopRequest) },
    responses: {
      200: json(NowPlaying, 'Stopped'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
}

export type StreamSession = z.infer<typeof StreamSession>
export type NowPlaying = z.infer<typeof NowPlaying>
export type WatchRecord = z.infer<typeof WatchRecord>
export type StoppedDetails = z.infer<typeof StoppedDetails>
export type DeliveryMethod = z.infer<typeof DeliveryMethod>
