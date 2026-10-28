// SPDX-License-Identifier: AGPL-3.0-only
// Playback (checkpoint 4.1, ADR 0051 and 0052): starting a film on a device, the decision and its
// reasons, the play session the device reports its place to, the device's reported profile, and
// each person's watch state per title (ADR 0054): played, the player's picks (player.md › Data),
// and Next up. Titles are addressed by type and TMDB id, as the library's reads are.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IdParam, IsoDate, json, noContent } from './common.ts'
import { ClientItem, ITEMS, ItemParams } from './library.ts'

/**
 * Each person's watch state moved: a position, played or unplayed, or the picks. Ids are
 * `movie:{tmdbId}`; only the person it belongs to hears it, on every device they use.
 */
export const PLAYBACK_TOPICS = { watch: 'watch.updated' } as const

/**
 * What a device reports it plays (ADR 0052), found in a browser with
 * `MediaSource.isTypeSupported()` and `MediaCapabilities.decodingInfo()`. Each list it sends
 * replaces the built-in profile's. The server checks it against `@highsea-tv/stream/profiles`.
 */
export const DeviceReport = z
  .object({
    /** The built-in profile it starts from: `web-chromium`, `web-chromium-macos`, `web-firefox`, `web-safari`. */
    base: z.string().max(64).openapi({ example: 'web-chromium' }),
    containers: z.array(z.string().max(16)).max(16).optional(),
    video: z
      .array(
        z.object({
          codec: z.string().max(16),
          profiles: z.array(z.string().max(32)).max(16).optional(),
          bitDepths: z.array(z.number().int()).max(4).optional(),
          maxWidth: z.number().int().positive().optional(),
          maxHeight: z.number().int().positive().optional(),
          tag: z.string().max(8).optional(),
        }),
      )
      .max(16)
      .optional(),
    hdr: z
      .object({
        formats: z.array(z.string().max(16)).max(8),
        dolbyVision: z.array(z.number().int()).max(8),
      })
      .optional(),
    audio: z
      .array(z.object({ codec: z.string().max(16), maxChannels: z.number().int().positive() }))
      .max(16)
      .optional(),
    subtitles: z.array(z.string().max(16)).max(8).optional(),
    audioTracks: z.boolean().optional(),
  })
  .openapi('DeviceReport')

export const PlaybackReason = z
  .object({
    kind: z.enum(['accepted', 'rejected', 'warning']),
    /** The message's key in `@highsea-tv/stream`'s catalog: `video.codec`, `method.transcode`. */
    code: z.string(),
    /** The reason in a sentence, in the server's language. */
    message: z.string(),
  })
  .openapi('PlaybackReason')

export const PlaybackDecision = z
  .object({
    method: z.enum(['direct-play', 'direct-stream', 'transcode', 'unplayable']),
    /** The file's container, as highsea names it; null when the probe didn't say. */
    container: z.string().nullable(),
    video: z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('copy') }),
        z.object({
          action: z.literal('transcode'),
          codec: z.literal('h264'),
          height: z.number().int(),
          bitrate: z.number().int(),
          toSdr: z.boolean(),
        }),
      ])
      .nullable(),
    audio: z
      .object({
        /** The track's id, as `ClientAudio` names it. */
        id: z.string(),
        action: z.enum(['copy', 'transcode']),
        codec: z.string().nullable(),
        channels: z.number().int().nullable(),
      })
      .nullable(),
    subtitle: z
      .object({
        id: z.string(),
        /** `external`: sent beside the picture as WebVTT (4.1b); `embedded`: drawn by the device. */
        delivery: z.enum(['external', 'embedded', 'burn-in', 'unavailable']),
      })
      .nullable(),
    /** The file's bits a second; null when its length isn't known. */
    bitrate: z.number().int().nullable(),
    reasons: z.array(PlaybackReason),
  })
  .openapi('PlaybackDecision')

export const PlayRequest = z
  .object({
    /** The version to play; the person's pick for the title, then the first version, when absent. */
    versionId: z.string().max(64).optional(),
    /** A track id from `ClientAudio`; the pick, then the file's default, when absent. */
    audioId: z.string().max(128).nullable().optional(),
    /** A track id from `ClientSubtitle`; null is off; the pick when absent. */
    subtitleId: z.string().max(128).nullable().optional(),
    /** Seconds in to start at; where the person stopped when absent. */
    start: z.number().min(0).optional(),
    /** A built-in profile's id, for a device that hasn't reported one. */
    profile: z.string().max(64).optional(),
  })
  .openapi('PlayRequest')

export const PlaySession = z
  .object({
    /** The play session, which the device reports its place to. */
    id: z.string(),
    decision: PlaybackDecision,
    /**
     * What the player loads: the file itself for direct play. Null when the film needs HLS, which
     * comes with checkpoint 4.1b. It carries a token, so it needs no header.
     */
    url: z.string().nullable(),
    /** Seconds in to start at. */
    start: z.number().min(0),
    /** The file's length in seconds, when the probe knows it. */
    duration: z.number().nullable(),
    /** When the URL stops working unless the device reports again. */
    expiresAt: IsoDate,
  })
  .openapi('PlaySession')

export const ProgressReport = z
  .object({
    /** Seconds in. */
    position: z.number().min(0),
    paused: z.boolean().default(false),
  })
  .openapi('ProgressReport')

export const ProgressResult = z
  .object({
    /** Whether the title is now watched: this report passed 90%. */
    watched: z.boolean(),
    expiresAt: IsoDate,
  })
  .openapi('ProgressResult')

export const ItemProgress = z
  .object({
    position: z.number().min(0),
    /** The film's length in seconds, when the device knows it better than the probe. */
    duration: z.number().positive().optional(),
  })
  .openapi('ItemProgress')

export const PlaybackPrefs = z
  .object({
    versionId: z.string().nullable(),
    audioId: z.string().nullable(),
    /** Null is off. */
    subtitleId: z.string().nullable(),
    /** The person's nudge to the subtitles' timing for this title, in 50 ms steps. */
    subtitleOffsetMs: z.number().int(),
  })
  .openapi('PlaybackPrefs')

export const PlaybackPrefsPatch = z
  .object({
    versionId: z.string().max(64).nullable(),
    audioId: z.string().max(128).nullable(),
    subtitleId: z.string().max(128).nullable(),
    subtitleOffsetMs: z
      .number()
      .int()
      .min(-60_000)
      .max(60_000)
      .refine((n) => n % 50 === 0, 'In 50 ms steps'),
  })
  .partial()
  .openapi('PlaybackPrefsPatch')

export const NextUp = z
  .object({
    /** The next film in the title's collection by release date, unwatched first; null when none. */
    item: ClientItem.nullable(),
  })
  .openapi('NextUp')

export const playback = {
  play: createRoute({
    method: 'post',
    path: `${ITEMS}/{type}/{id}/play`,
    tags: ['Playback'],
    summary: 'Play a title on this device',
    description:
      'Decides how the device plays the version: as it is, remuxed or transcoded, with the reasons. Without a reported profile the device names a built-in one. 404 when the title isn’t here or its library isn’t yours; 409 when the version has no file to play.',
    ...access('user'),
    request: { params: ItemParams, ...body(PlayRequest) },
    responses: {
      200: json(PlaySession, 'The play session'),
      ...errors('invalid', 'unauthorized', 'not-found', 'conflict'),
    },
  }),
  progress: createRoute({
    method: 'post',
    path: `${API_PREFIX}/playback/sessions/{id}/progress`,
    tags: ['Playback'],
    summary: 'Report the place in a play session',
    description:
      'Every few seconds while playing, and on pause and seek. Saves the place, keeps the session’s URL working, and marks the title watched past 90%.',
    ...access('user'),
    request: { params: IdParam, ...body(ProgressReport) },
    responses: {
      200: json(ProgressResult, 'Saved'),
      ...errors('invalid', 'unauthorized', 'not-found'),
    },
  }),
  stop: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/playback/sessions/{id}`,
    tags: ['Playback'],
    summary: 'Leave the player',
    description: 'Ends the session; its URL stops working at once.',
    ...access('user'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
  }),
  report: createRoute({
    method: 'put',
    path: `${API_PREFIX}/devices/current/profile`,
    tags: ['Playback'],
    summary: 'Report what this device plays',
    description:
      'Kept for the device with its date, and laid over the built-in profile it names. Needs a signed-in device; an API key has none.',
    ...access('user'),
    request: body(DeviceReport),
    responses: { ...noContent, ...errors('invalid', 'unauthorized', 'conflict') },
  }),
  prefs: createRoute({
    method: 'get',
    path: `${ITEMS}/{type}/{id}/prefs`,
    tags: ['Playback'],
    summary: 'Your picks for a title',
    ...access('user'),
    request: { params: ItemParams },
    responses: {
      200: json(PlaybackPrefs, 'The picks'),
      ...errors('unauthorized', 'not-found'),
    },
  }),
  setPrefs: createRoute({
    method: 'put',
    path: `${ITEMS}/{type}/{id}/prefs`,
    tags: ['Playback'],
    summary: 'Save your picks for a title',
    description: 'Only the picks sent change.',
    ...access('user'),
    request: { params: ItemParams, ...body(PlaybackPrefsPatch) },
    responses: {
      200: json(PlaybackPrefs, 'The picks'),
      ...errors('invalid', 'unauthorized', 'not-found'),
    },
  }),
  played: createRoute({
    method: 'post',
    path: `${ITEMS}/{type}/{id}/played`,
    tags: ['Playback'],
    summary: 'Mark a title watched',
    description: 'Counts as one more viewing, and clears where you stopped.',
    ...access('user'),
    request: { params: ItemParams },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
  }),
  unplayed: createRoute({
    method: 'delete',
    path: `${ITEMS}/{type}/{id}/played`,
    tags: ['Playback'],
    summary: 'Mark a title unwatched',
    description: 'As if never started: the viewings and where you stopped are cleared.',
    ...access('user'),
    request: { params: ItemParams },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
  }),
  itemProgress: createRoute({
    method: 'post',
    path: `${ITEMS}/{type}/{id}/progress`,
    tags: ['Playback'],
    summary: 'Save where you are in a title',
    description:
      'For a device that only saves a place, without a play session. Past 90% the title is watched.',
    ...access('user'),
    request: { params: ItemParams, ...body(ItemProgress) },
    responses: {
      200: json(z.object({ watched: z.boolean() }), 'Saved'),
      ...errors('invalid', 'unauthorized', 'not-found'),
    },
  }),
  next: createRoute({
    method: 'get',
    path: `${ITEMS}/{type}/{id}/next`,
    tags: ['Playback'],
    summary: 'What plays next',
    description:
      'The next film in the title’s collection by release date, one you haven’t watched first. Only films with a file count.',
    ...access('user'),
    request: { params: ItemParams },
    responses: { 200: json(NextUp, 'Next up'), ...errors('unauthorized', 'not-found') },
  }),
} as const

export type DeviceReport = z.infer<typeof DeviceReport>
export type PlaybackReason = z.infer<typeof PlaybackReason>
export type PlaybackDecision = z.infer<typeof PlaybackDecision>
export type PlayRequest = z.infer<typeof PlayRequest>
export type PlaySession = z.infer<typeof PlaySession>
export type ProgressReport = z.infer<typeof ProgressReport>
export type ProgressResult = z.infer<typeof ProgressResult>
export type PlaybackPrefs = z.infer<typeof PlaybackPrefs>
export type PlaybackPrefsPatch = z.infer<typeof PlaybackPrefsPatch>
export type NextUp = z.infer<typeof NextUp>
