// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (checkpoint 4.3a, docs/product/playback-settings.md): transcodes at once, the
// encoder, the remote ceiling, and the transcode cache's folder and limit, kept in `settings` under
// `playback` and read as each stream starts. The hardware's paths and their checks are 4.3b's;
// until then the status lists none and transcodes use the processor.
//
// - The cache's folder is checked as Backups' is (a full path highsea can write) and must stay out
//   of the library and the downloads, since highsea removes what it makes there. A new folder is
//   used by streams that start after it; those playing keep theirs until they end.
// - The cache's use is the sessions' folders; trickplay's previews are counted apart, never towards
//   the limit (the spec's Cache group).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import {
  PLAYBACK_SETTINGS_TOPICS,
  PlaybackSettings,
  type PlaybackStatus,
} from '@highsea-tv/api-contract'
import { AppError, type Clock, type EventBus, type Logger } from '@highsea-tv/core'
import { type Db, readSetting, writeSetting } from '@highsea-tv/db'
import { isWithin, realOrParent } from '@highsea-tv/media/shared'
import type { Ceiling } from '@highsea-tv/stream/decision'
import type { Limits, Transcodes } from '@highsea-tv/stream/hls'

export const PLAYBACK_KEY = 'playback'
const GB = 1_000_000_000
/** While anyone streams, how often the cache's use is looked at for the page. */
const WATCH_MS = 10_000

export const defaultPlaybackSettings = (dataDir: string): PlaybackSettings => ({
  acceleration: 'auto',
  toneMapping: true,
  maxTranscodes: 3,
  preset: 'balanced',
  remoteMaxMbps: 8,
  cachePath: join(resolve(dataDir), 'transcodes'),
  cacheLimitGb: 20,
})

/**
 * Each remote ceiling's bitrate and the picture it allows, as Settings › Playback names them:
 * 4 Mbps at 720p, 8 and 12 at 1080p, 20 and 40 at 4K.
 */
export function ceilingOf(mbps: PlaybackSettings['remoteMaxMbps']): Ceiling | null {
  if (mbps === null) return null
  return { bitrate: mbps * 1_000_000, height: mbps <= 4 ? 720 : mbps <= 12 ? 1080 : 2160 }
}

export const limitsOf = (s: PlaybackSettings): Limits => ({
  maxTranscodes: s.maxTranscodes,
  cacheBytes: s.cacheLimitGb * GB,
  preset: s.preset,
})

/**
 * The cache's folder: a full path highsea can write, and not in the library or the downloads,
 * since highsea removes the segments it makes there.
 */
export function checkCacheFolder(path: string, shared: readonly string[]) {
  if (!isAbsolute(path))
    throw new AppError('invalid', 'Give the folder’s full path.', { field: 'cachePath' })
  const real = realOrParent(resolve(path))
  for (const root of shared) {
    if (!root) continue
    const other = realOrParent(resolve(root))
    if (isWithin(other, real) || isWithin(real, other))
      throw new AppError(
        'invalid',
        'Choose a folder outside your library and downloads. highsea removes what it makes there.',
        { field: 'cachePath', reason: 'shared-folder' },
      )
  }
  try {
    mkdirSync(path, { recursive: true })
    const probe = join(path, `.highsea-write-${process.pid}`)
    writeFileSync(probe, '')
    rmSync(probe)
  } catch {
    throw new AppError('invalid', 'highsea can’t write to that folder.', {
      field: 'cachePath',
      reason: 'not-writable',
    })
  }
}

/** The bytes under a folder, its subfolders included; nothing when it's gone. */
export async function folderBytes(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  let total = 0
  for (const e of entries) {
    const path = join(dir, e.name)
    if (e.isDirectory()) total += await folderBytes(path)
    else if (e.isFile()) total += (await stat(path).catch(() => null))?.size ?? 0
  }
  return total
}

export function createPlaybackSettings(deps: {
  db: Db
  clock: Clock
  events: EventBus
  logger: Logger
  dataDir: string
  transcodes: Transcodes
  /** Trickplay's previews: counted apart from the cache. */
  trickplayRoot: string
  /** The root folders and the downloads folder, which the cache stays out of. */
  shared: () => string[]
  /** Whether anyone streams now, so the cache's use is worth watching. */
  streaming: () => boolean
}) {
  const { db, clock, events, transcodes } = deps
  const log = deps.logger.child('playback')
  const get = () => readSetting(db, PLAYBACK_KEY, defaultPlaybackSettings(deps.dataDir))
  const changed = () => events.emit({ topic: PLAYBACK_SETTINGS_TOPICS.updated, ids: [] })

  /** At boot: the saved folder, unless it's gone, when the default is used until it's back. */
  async function start() {
    const path = get().cachePath
    try {
      await transcodes.moveTo(path)
    } catch (e) {
      log.warn('the transcode cache’s folder can’t be used, so the default is', {
        path,
        error: (e as Error).message,
      })
    }
    await transcodes.clear()
  }

  function update(input: PlaybackSettings): PlaybackSettings {
    const parsed = PlaybackSettings.safeParse(input)
    if (!parsed.success)
      throw new AppError('invalid', 'Those settings aren’t valid.', parsed.error.issues)
    const before = get()
    if (!isAbsolute(parsed.data.cachePath))
      throw new AppError('invalid', 'Give the folder’s full path.', { field: 'cachePath' })
    const next = { ...parsed.data, cachePath: resolve(parsed.data.cachePath) }
    if (next.cachePath !== before.cachePath) checkCacheFolder(next.cachePath, deps.shared())
    writeSetting(db, PLAYBACK_KEY, next, clock.now())
    if (next.cachePath !== before.cachePath) {
      void transcodes
        .moveTo(next.cachePath)
        .catch((e: Error) => log.warn('couldn’t move the transcode cache', { error: e.message }))
      log.info('the transcode cache moved', { from: before.cachePath, to: next.cachePath })
    }
    transcodes.limitsChanged()
    changed()
    return next
  }

  async function status(): Promise<PlaybackStatus> {
    const s = get()
    const [transcodeBytes, trickplayBytes] = await Promise.all([
      transcodes.size(),
      folderBytes(deps.trickplayRoot),
    ])
    const limitBytes = s.cacheLimitGb * GB
    return {
      // hardware acceleration's paths come with 4.3b
      paths: [],
      inUse: null,
      cache: { transcodeBytes, trickplayBytes, limitBytes, over: transcodeBytes > limitBytes },
    }
  }

  async function clearCache() {
    await transcodes.empty()
    changed()
    return status()
  }

  // while anyone streams, the page hears the cache grow, at most every 10 s
  let last = -1
  const timer = setInterval(() => {
    if (!deps.streaming() && last === 0) return
    void transcodes.size().then((n) => {
      if (n !== last) changed()
      last = n
    })
  }, WATCH_MS)
  timer.unref?.()

  return {
    get,
    update,
    status,
    clearCache,
    start,
    ceiling: () => ceilingOf(get().remoteMaxMbps),
    limits: () => limitsOf(get()),
    close: () => clearInterval(timer),
  }
}

export type PlaybackSettingsService = ReturnType<typeof createPlaybackSettings>
