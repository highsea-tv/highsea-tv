// SPDX-License-Identifier: AGPL-3.0-only
// The IP blocklist (checkpoint 6b): Settings › Download client's `blocklistUrl`, an http(s)
// address or a file in the config folder, parsed by `@highsea-tv/torrent` (P2P, DAT or P2B, maybe
// gzipped) and handed to the engine, which refuses those addresses (ADR 0037).
// - A URL is fetched through the fetch seam once a day, by a job that's safe to repeat (ADR 0022):
//   fetch, parse, write the copy, hand it over. A list that fails to fetch or parse leaves the one
//   in use as it is, and System's health list says why.
// - The last good copy is kept in the config folder, so a restart blocks at once, without the
//   network.
// - A file is read where it is; a path outside the config folder is refused.
// - A changed setting is picked up from `settings.updated`, and fetched straight away.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Clock, EventBus, Fetch, Logger } from '@highsea-tv/core'
import { type Db, readSetting } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import { MAX_LIST_BYTES, parseBlocklist, type TorrentEngine } from '@highsea-tv/torrent'
import { z } from 'zod'
import { DEFAULT_DOWNLOAD_CLIENT, DOWNLOAD_CLIENT_KEY } from './settings.ts'

export const IP_BLOCKLIST_JOB = 'downloads.ip-blocklist'
/** Fetched daily (the plan's Production features). */
export const IP_BLOCKLIST_EVERY_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 120_000

type Meta = { source: string; fetchedAt: number; ranges: number; format: string }

export type IpBlocklistStatus = {
  source: string
  ranges: number
  format: string | null
  updatedAt: number | null
  problem: string | null
}

export type IpBlocklist = ReturnType<typeof createIpBlocklist>

export function createIpBlocklist(deps: {
  db: Db
  jobs: JobQueue
  clock: Clock
  logger: Logger
  events: EventBus
  fetch: Fetch
  engine: Pick<TorrentEngine, 'setBlocklist'>
  configDir: string
}) {
  const log = deps.logger.child('ip-blocklist')
  const dir = join(deps.configDir, 'blocklist')
  const listPath = join(dir, 'list.bin')
  const metaPath = join(dir, 'list.json')
  const source = () =>
    readSetting(deps.db, DOWNLOAD_CLIENT_KEY, DEFAULT_DOWNLOAD_CLIENT).blocklistUrl.trim()
  /** The source last seen in the settings, and the one whose list the engine holds. */
  let seen: string | null = null
  let loaded: string | null = null
  let status: IpBlocklistStatus = {
    source: '',
    ranges: 0,
    format: null,
    updatedAt: null,
    problem: null,
  }
  let problemSince = 0
  let unsubscribe: (() => void) | null = null

  const isUrl = (s: string) => /^https?:\/\//i.test(s)

  /** A file source, inside the config folder only. */
  const fileOf = (s: string) => {
    const path = resolve(deps.configDir, s)
    const rel = relative(resolve(deps.configDir), path)
    if (!rel || rel.startsWith('..') || isAbsolute(rel))
      throw new Error('The blocklist file has to be in the config folder.')
    return path
  }

  const readMeta = (): Meta | null => {
    try {
      return JSON.parse(readFileSync(metaPath, 'utf8')) as Meta
    } catch {
      return null
    }
  }

  const fail = (s: string, e: unknown) => {
    const message = (e as Error).message
    if (status.problem !== message) problemSince = deps.clock.now()
    status = { ...status, source: s, problem: message }
    log.warn('The IP blocklist couldn’t be updated.', { source: s, error: message })
  }

  const use = (s: string, bytes: Uint8Array, at: number) => {
    const parsed = parseBlocklist(bytes)
    deps.engine.setBlocklist(parsed.set)
    loaded = s
    status = {
      source: s,
      ranges: parsed.set.size,
      format: parsed.format,
      updatedAt: at,
      problem: null,
    }
    return parsed
  }

  const download = async (url: string): Promise<Uint8Array> => {
    const res = await deps.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'highsea' },
    })
    if (!res.ok) throw new Error(`The list’s address answered ${res.status}.`)
    const length = Number(res.headers.get('content-length') ?? 0)
    if (length > MAX_LIST_BYTES) throw new Error('The blocklist is too big.')
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > MAX_LIST_BYTES) throw new Error('The blocklist is too big.')
    return bytes
  }

  const blocklist = {
    status: () => status,

    /** Fetches or reads the list and hands it over. Safe to repeat (ADR 0022). */
    async refresh(): Promise<void> {
      const s = source()
      if (!s) {
        deps.engine.setBlocklist(null)
        loaded = ''
        status = { source: '', ranges: 0, format: null, updatedAt: null, problem: null }
        rmSync(dir, { recursive: true, force: true })
        return
      }
      if (!isUrl(s)) {
        try {
          use(s, readFileSync(fileOf(s)), deps.clock.now())
        } catch (e) {
          // a file that can't be read won't read on a retry either: no throw
          fail(s, e)
          if (loaded !== s) deps.engine.setBlocklist(null)
        }
        return
      }
      let bytes: Uint8Array
      try {
        bytes = await download(s)
      } catch (e) {
        fail(s, e)
        if (loaded !== s) deps.engine.setBlocklist(null)
        // the job's retries are for the network
        throw e
      }
      try {
        // checked before it's kept: a broken download never replaces a good copy
        const at = deps.clock.now()
        const parsed = use(s, bytes, at)
        mkdirSync(dir, { recursive: true })
        writeFileSync(`${listPath}.tmp`, bytes)
        renameSync(`${listPath}.tmp`, listPath)
        const meta: Meta = {
          source: s,
          fetchedAt: at,
          ranges: parsed.set.size,
          format: parsed.format,
        }
        writeFileSync(`${metaPath}.tmp`, JSON.stringify(meta))
        renameSync(`${metaPath}.tmp`, metaPath)
        log.info('Updated the IP blocklist.', { ranges: parsed.set.size, format: parsed.format })
      } catch (e) {
        fail(s, e)
        // a source that changed and never loaded leaves nothing blocked from the old one
        if (loaded !== s) deps.engine.setBlocklist(null)
      }
    },

    defineJobs() {
      deps.jobs.define({
        type: IP_BLOCKLIST_JOB,
        payload: z.object({}),
        attempts: 3,
        timeoutMs: 5 * 60 * 1000,
        run: () => blocklist.refresh(),
      })
    },

    /**
     * On boot: the kept copy (or the file) at once, the daily schedule, and a fetch now when the
     * copy is missing, stale or from another address. Returns the stop function.
     */
    start(): () => void {
      deps.jobs.schedule(IP_BLOCKLIST_JOB, IP_BLOCKLIST_EVERY_MS)
      const s = source()
      seen = s
      if (s) {
        const meta = readMeta()
        let fresh = false
        try {
          if (!isUrl(s)) use(s, readFileSync(fileOf(s)), deps.clock.now())
          else if (meta?.source === s && existsSync(listPath)) {
            use(s, readFileSync(listPath), meta.fetchedAt)
            fresh = deps.clock.now() - meta.fetchedAt < IP_BLOCKLIST_EVERY_MS
          }
        } catch (e) {
          fail(s, e)
        }
        if (isUrl(s) && !fresh) deps.jobs.enqueue(IP_BLOCKLIST_JOB, {}, { dedupeKey: 'now' })
      }
      unsubscribe = deps.events.subscribe((e) => {
        if (e.topic !== 'settings.updated' || source() === seen) return
        seen = source()
        deps.jobs.enqueue(IP_BLOCKLIST_JOB, {}, { dedupeKey: 'now' })
      })
      return () => {
        unsubscribe?.()
        unsubscribe = null
      }
    },

    /** For System's health list: a list that couldn't be fetched or read. */
    issues(): { id: string; level: 'warning'; message: string; since: number }[] {
      if (!status.problem) return []
      return [
        {
          id: 'ip-blocklist',
          level: 'warning',
          message: `The IP blocklist couldn’t be updated: ${status.problem}`,
          since: problemSince,
        },
      ]
    },
  }
  return blocklist
}
