// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (checkpoint 4.3, docs/product/playback-settings.md): how highsea transcodes,
// what's sent away from home, and the transcode cache. The owner and admins read and change it
// (the 4.0b scope's answer 6). Hardware acceleration's paths and their checks come with 4.3b; until
// then the status lists none, and transcodes use the processor.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, json } from './common.ts'

/**
 * The settings changed or a check ended (`playback.updated`), or the cache grew or was cleared.
 * Ids are empty.
 */
export const PLAYBACK_SETTINGS_TOPICS = { updated: 'playback.updated' } as const

export const ACCELERATION_PATHS = ['vaapi', 'qsv', 'nvenc', 'videotoolbox'] as const
export const ENCODER_PRESETS = ['speed', 'balanced', 'quality'] as const
/** The remote ceilings Settings › Playback offers, in Mbps; null is no limit. */
export const REMOTE_CEILINGS = [4, 8, 12, 20, 40] as const

export const PlaybackSettings = z
  .object({
    /** `auto` uses the first path whose check passed; an unchecked path is never used on its own. */
    acceleration: z.enum(['auto', ...ACCELERATION_PATHS, 'off']),
    /** Convert HDR to SDR for screens that can’t show it. */
    toneMapping: z.boolean(),
    /** Transcodes at once; more wait for one to finish. Direct streams don’t count. */
    maxTranscodes: z.number().int().min(1).max(8),
    /** Faster, Balanced or Sharper: each encoder’s own speed setting. */
    preset: z.enum(ENCODER_PRESETS),
    /** The most a stream away from home is sent, in Mbps; null for no limit. */
    remoteMaxMbps: z.literal(REMOTE_CEILINGS).nullable(),
    /** The transcode cache’s folder: a full path highsea can write. */
    cachePath: z.string().min(1).max(4000).openapi({ example: '/config/transcodes' }),
    /** The transcode cache’s limit, in GB. Trickplay images aren’t counted. */
    cacheLimitGb: z.number().int().min(2).max(2000),
  })
  .openapi('PlaybackSettings')

export const PathCheck = z
  .object({
    result: z.enum(['pass', 'fail']),
    /** Frames a second for the check’s clip. */
    fps: z.number().nullable(),
    detail: z.string(),
    at: z.iso.datetime(),
  })
  .openapi('PathCheck')

export const PathStatus = z
  .object({
    id: z.enum(ACCELERATION_PATHS),
    /** What highsea found: a render node, a GPU, or nothing. */
    device: z.string().nullable(),
    name: z.string().nullable(),
    check: PathCheck.nullable(),
    /** Why it can’t be used here, when it can’t. */
    unavailable: z.string().nullable(),
    checking: z.boolean(),
  })
  .openapi('PathStatus')

export const PlaybackStatus = z
  .object({
    paths: z.array(PathStatus),
    /** The path transcodes use now, or null for the processor. */
    inUse: z.enum(ACCELERATION_PATHS).nullable(),
    cache: z.object({
      transcodeBytes: z.number().int(),
      trickplayBytes: z.number().int(),
      limitBytes: z.number().int(),
      over: z.boolean(),
    }),
  })
  .openapi('PlaybackStatus')

export const playbackSettings = {
  playback: createRoute({
    method: 'get',
    path: `${API_PREFIX}/settings/playback`,
    tags: ['Settings'],
    summary: 'Playback: transcoding, streams away from home and the cache',
    ...access('staff'),
    responses: {
      200: json(PlaybackSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  savePlayback: createRoute({
    method: 'put',
    path: `${API_PREFIX}/settings/playback`,
    tags: ['Settings'],
    summary: 'Save Playback',
    description:
      'The cache’s folder is checked first: 400 when it isn’t a full path highsea can write. A new folder is used by streams that start after it; the old one’s segments are removed as their streams end. The limits apply at once.',
    ...access('staff'),
    request: { ...body(PlaybackSettings) },
    responses: {
      200: json(PlaybackSettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
}

export const playbackStatusRoutes = {
  status: createRoute({
    method: 'get',
    path: `${API_PREFIX}/playback/status`,
    tags: ['Playback'],
    summary: 'The hardware highsea found, the path in use, and the caches',
    ...access('staff'),
    responses: {
      200: json(PlaybackStatus, 'The status'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  clearCache: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/playback/cache`,
    tags: ['Playback'],
    summary: 'Clear the transcode cache',
    description:
      'Nothing stops: films that are playing make their segments again when they’re asked for. Trickplay images stay.',
    ...access('staff'),
    responses: {
      200: json(PlaybackStatus, 'Cleared'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
}

export type PlaybackSettings = z.infer<typeof PlaybackSettings>
export type PlaybackStatus = z.infer<typeof PlaybackStatus>
export type PathStatus = z.infer<typeof PathStatus>
export type AccelerationPath = (typeof ACCELERATION_PATHS)[number]
export type EncoderPreset = (typeof ENCODER_PRESETS)[number]
