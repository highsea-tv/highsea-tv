// SPDX-License-Identifier: AGPL-3.0-only
// The watch folder (checkpoint 6b): a `.torrent` dropped in Settings › Download client's folder is
// added as a manual torrent in its category, then renamed `.torrent.added`, as Transmission's
// daemon does when it isn't told to trash the original (`onFileAdded` in daemon/daemon.cc renames
// to `filename + ".added"`). qBittorrent deletes the file instead (src/base/torrentfileswatcher.cpp);
// the rename is the plan's choice, since it keeps a record of what was added and is easy to undo.
//
// How often: every 10 seconds, the interval both programs poll at when they can't be told of a
// change (qBittorrent's `WATCH_INTERVAL` in src/base/torrentfileswatcher.cpp; Transmission's
// generic watchdir). It's a timer the runtime owns, not a scheduled job: a job every 10 seconds
// would write 8,640 job rows a day to the table System's tasks read, for a check that's a single
// directory listing. Each tick is safe to repeat (ADR 0022's rule, kept here too): a file is only
// ever added and renamed, and one added before a crash cut the rename short is found in Downloads
// the next time and renamed then.
//
// A file that doesn't parse may still be being written, so it's left alone while it's younger
// than a minute: qBittorrent retries such a file 5 times, 10 seconds apart, before renaming it
// `.qbt_rejected`. After that highsea renames it `.torrent.invalid` and logs why.
import { readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { AppError, type Clock, type Logger } from '@highsea/core'
import { parseTorrentFile } from '@highsea/torrent'
import type { DownloadClientSettings } from './settings.ts'

export const WATCH_EVERY_MS = 10_000
/** A file that still doesn't parse this long after it last changed is given up on. */
export const WATCH_SETTLE_MS = 60_000
/** Larger than any real `.torrent`; the API's own limit is the same (14 MB of base64). */
const MAX_TORRENT_BYTES = 10 * 1024 * 1024

export const ADDED_SUFFIX = '.added'
export const INVALID_SUFFIX = '.invalid'

export type WatchOutcome = {
  file: string
  /** Added; already in Downloads (renamed all the same); not a torrent; still being written; or the add failed and is tried again. */
  result: 'added' | 'duplicate' | 'invalid' | 'waiting' | 'failed'
  message?: string
}

export type WatchDeps = {
  clock: Clock
  logger: Logger
  settings(): Pick<DownloadClientSettings, 'watchFolder' | 'watchCategory'>
  /** The folder, checked again each tick: inside the folders highsea may write to, or it throws. */
  checkFolder(path: string): string
  add(input: { source: { torrent: Uint8Array }; category: string }): Promise<unknown>
}

export function createWatchFolder(deps: WatchDeps) {
  const logger = deps.logger.child('watch-folder')
  // a problem is logged once, not every ten seconds while it lasts
  const told = new Set<string>()
  const tellOnce = (key: string, message: string, fields: Record<string, unknown>) => {
    if (told.has(key)) return
    told.add(key)
    logger.warn(message, fields)
  }
  let running: Promise<WatchOutcome[]> | null = null

  function rename(path: string, suffix: string): boolean {
    try {
      renameSync(path, `${path}${suffix}`)
      return true
    } catch (e) {
      tellOnce(`rename:${path}`, 'couldn’t rename a file in the watch folder', {
        file: path,
        error: (e as Error).message,
      })
      return false
    }
  }

  async function scan(): Promise<WatchOutcome[]> {
    const { watchFolder, watchCategory } = deps.settings()
    if (!watchFolder) return []
    let folder: string
    try {
      folder = deps.checkFolder(watchFolder)
    } catch (e) {
      tellOnce(`folder:${watchFolder}`, 'the watch folder isn’t inside an allowed folder', {
        folder: watchFolder,
        error: (e as Error).message,
      })
      return []
    }
    let names: import('node:fs').Dirent[]
    try {
      names = readdirSync(folder, { withFileTypes: true })
    } catch (e) {
      tellOnce(`folder:${folder}`, 'couldn’t read the watch folder', {
        folder,
        error: (e as Error).message,
      })
      return []
    }
    told.delete(`folder:${watchFolder}`)
    told.delete(`folder:${folder}`)
    const out: WatchOutcome[] = []
    for (const d of names) {
      if (!d.isFile() || d.name.startsWith('.') || !d.name.toLowerCase().endsWith('.torrent'))
        continue
      const path = join(folder, d.name)
      let bytes: Uint8Array
      let changedAt: number
      try {
        const st = statSync(path)
        changedAt = st.mtimeMs
        if (st.size > MAX_TORRENT_BYTES) {
          logger.warn('a file in the watch folder is too large to be a .torrent', { file: path })
          rename(path, INVALID_SUFFIX)
          out.push({ file: path, result: 'invalid', message: 'Too large to be a .torrent.' })
          continue
        }
        bytes = new Uint8Array(readFileSync(path))
      } catch {
        // gone since the listing: nothing to do
        continue
      }
      try {
        parseTorrentFile(bytes)
      } catch (e) {
        if (deps.clock.now() - changedAt < WATCH_SETTLE_MS) {
          out.push({ file: path, result: 'waiting' })
          continue
        }
        const message = (e as Error).message
        logger.warn('a file in the watch folder isn’t a .torrent; renamed .invalid', {
          file: path,
          error: message,
        })
        rename(path, INVALID_SUFFIX)
        out.push({ file: path, result: 'invalid', message })
        continue
      }
      try {
        await deps.add({ source: { torrent: bytes }, category: watchCategory })
        logger.info('added a torrent from the watch folder', {
          file: path,
          category: watchCategory,
        })
        rename(path, ADDED_SUFFIX)
        out.push({ file: path, result: 'added' })
      } catch (e) {
        if (e instanceof AppError && e.code === 'conflict') {
          // already in Downloads: added before, perhaps by a tick a restart cut short
          rename(path, ADDED_SUFFIX)
          out.push({ file: path, result: 'duplicate' })
          continue
        }
        const message = (e as Error).message
        tellOnce(`add:${path}:${message}`, 'couldn’t add a torrent from the watch folder', {
          file: path,
          error: message,
        })
        out.push({ file: path, result: 'failed', message })
      }
    }
    return out
  }

  /** One look in the folder; a tick asked for while one runs shares it. */
  function tick(): Promise<WatchOutcome[]> {
    running ??= scan().finally(() => {
      running = null
    })
    return running
  }

  return {
    tick,

    /** Looks every `everyMs` until stopped. Returns the stop function. */
    start(everyMs = WATCH_EVERY_MS): () => void {
      const timer = setInterval(() => {
        tick().catch((e) =>
          logger.error('the watch folder check failed', { error: (e as Error).message }),
        )
      }, everyMs)
      timer.unref?.()
      return () => clearInterval(timer)
    },
  }
}

export type WatchFolder = ReturnType<typeof createWatchFolder>
