// SPDX-License-Identifier: AGPL-3.0-only
// Web seeds: BEP 19's HTTP seeding, GetRight style (https://www.bittorrent.org/beps/bep_0019.html).
// A web seed is "a permanently unchoked seed": a web server holding the torrent's files under
// `url-list`. The Internet Archive serves its torrents this way, and says so in each one's comment
// ("retrieval usually requires a client that supports webseeding (GetRight style)"); its trackers
// answer with no seeders, so without this nothing downloads.
//
// - The URL: an address ending in `/` gets the torrent's name; a multi-file torrent's is a folder
//   to which the name and each file's path are added (BEP 19 › Metadata Extension, Multi-File
//   Torrents). Paths are the torrent's own spelling, percent-encoded.
// - Each request is an HTTP range (RFC 9110 § 14.2, https://www.rfc-editor.org/rfc/rfc9110#name-range)
//   for blocks the picker hands out, as it does for a peer that has every piece, so web seeds and
//   peers share one picker, one piece check and one storage. A run of blocks crossing files is one
//   request per file; BEP 47 padding files are zeros and never asked for.
// - The download limit is the peers' bucket: a block is asked for only once the bucket gives its
//   bytes. Requests go through the socket factory, so they leave from the binding (the VPN) and
//   stop when it goes, as peer traffic does (ADR 0037).
// - An answer that isn't the bytes asked for (a 404, a range the server ignores, a wrong
//   `Content-Range`) counts against the seed; three in a row and it's dropped. Network failures and
//   5xx answers back off, from 30 seconds doubling to 30 minutes, as libtorrent retries web seeds
//   (`urlseed_wait_retry`, https://www.libtorrent.org/reference-Settings.html). Data that fails its
//   piece hash drops the seed, as a peer sending bad data is banned.
// - BEP 17 (Hoffman-style `httpseeds`, https://www.bittorrent.org/beps/bep_0017.html) needs a
//   script on the server answering by piece; few torrents carry it and the Archive doesn't, so it
//   isn't built.
import type { IncomingMessage } from 'node:http'
import { unref } from '@highsea-tv/core/timers'
import type { Bucket } from './limits.ts'
import { createMeter } from './limits.ts'
import type { Metainfo, MetainfoFile } from './metainfo.ts'
import type { BlockRef, Picker } from './picker.ts'
import { BLOCK } from './picker.ts'
import type { SocketFactory } from './sockets.ts'
import { Unbound } from './sockets.ts'

export type WebSeedStatus = {
  url: string
  status: 'working' | 'updating' | 'error' | 'not-contacted'
  message: string | null
  /** Bytes per second from this seed now. */
  downRate: number
}

/** Requests in flight per seed. */
const IN_FLIGHT = 2
/** At most this much per request: 4 MiB. */
const MAX_BLOCKS = 256
/** Answers that aren't the bytes asked for, in a row, before a seed is dropped. */
const WRONG_LIMIT = 3
const PUMP_MS = 1_000
const TIMEOUT_MS = 30_000

/** The prefix that marks a picker key as a web seed's. */
export const WEB_KEY = 'web:'

/** A file's address on a web seed (BEP 19). */
export function webSeedUrl(base: string, file: Pick<MetainfoFile, 'urlPath'>): string {
  // a multi-file torrent's paths have the name and a slash; a single file's is the name alone
  if (file.urlPath.includes('/')) return `${base.endsWith('/') ? base : `${base}/`}${file.urlPath}`
  return base.endsWith('/') ? `${base}${file.urlPath}` : base
}

/** A wrong answer: counts toward dropping the seed. A plain Error is a failure to retry. */
class WrongAnswer extends Error {}

type Seed = {
  url: string
  key: string
  status: WebSeedStatus['status']
  message: string | null
  fails: number
  wrong: number
  next: number
  busy: number
  dropped: boolean
  meter: ReturnType<typeof createMeter>
  /** Where each file's request was redirected, so the next goes there at once. */
  redirects: Map<string, URL>
  responses: Set<IncomingMessage>
}

export type WebSeeds = ReturnType<typeof createWebSeeds>

export function createWebSeeds(
  urls: string[],
  ctx: {
    sockets: SocketFactory
    metainfo(): Metainfo | null
    picker(): Picker | null
    down: Bucket
    /** Whether to download now: running, downloading, with the metadata. */
    active(): boolean
    /** A block arrived: the session checks and stores it as a peer's. */
    receive(key: string, block: BlockRef, data: Uint8Array): void
    log(level: 'debug' | 'info' | 'warn', message: string, fields?: Record<string, unknown>): void
    now?: () => number
    /** The first wait after a failure, and the longest. */
    backoff?: { firstMs: number; maxMs: number }
    timeoutMs?: number
  },
) {
  const now = ctx.now ?? Date.now
  const backoff = ctx.backoff ?? { firstMs: 30_000, maxMs: 30 * 60_000 }
  const seeds: Seed[] = urls.map((url) => ({
    url,
    key: `${WEB_KEY}${url}`,
    status: 'not-contacted',
    message: null,
    fails: 0,
    wrong: 0,
    next: 0,
    busy: 0,
    dropped: false,
    meter: createMeter(),
    redirects: new Map(),
    responses: new Set(),
  }))
  let timer: ReturnType<typeof setInterval> | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let running = false
  // bumped by stop: a request still finishing from before sees it went stale
  let generation = 0

  const drop = (seed: Seed, why: string) => {
    if (seed.dropped) return
    seed.dropped = true
    seed.status = 'error'
    seed.message = why
    for (const r of seed.responses) r.destroy()
    ctx.picker()?.dropPeer(seed.key)
    ctx.log('warn', 'A web seed was dropped.', { url: seed.url, reason: why })
  }

  const failed = (seed: Seed, e: Error) => {
    seed.status = 'error'
    seed.message = e.message
    seed.redirects.clear()
    if (e instanceof WrongAnswer) {
      seed.wrong++
      if (seed.wrong >= WRONG_LIMIT) {
        drop(seed, `Dropped after ${WRONG_LIMIT} wrong answers: ${e.message}`)
        return
      }
    }
    seed.fails++
    const wait = Math.min(backoff.maxMs, backoff.firstMs * 2 ** (seed.fails - 1))
    seed.next = Math.max(seed.next, now() + wait)
    ctx.log('info', 'A web seed failed; highsea will try it again.', {
      url: seed.url,
      error: e.message,
      retryInSeconds: Math.round((seed.next - now()) / 1000),
    })
  }

  /** Reads `length` bytes of one file from a seed, following its last redirect. */
  const readRange = async (
    seed: Seed,
    file: MetainfoFile,
    from: number,
    length: number,
    into: Uint8Array,
    at: number,
  ): Promise<void> => {
    const direct = new URL(webSeedUrl(seed.url, file))
    const target = seed.redirects.get(file.urlPath) ?? direct
    const range = `bytes=${from}-${from + length - 1}`
    const { response: res, url } = await ctx.sockets.fetch(
      target,
      { range },
      ctx.timeoutMs ?? TIMEOUT_MS,
    )
    seed.responses.add(res)
    try {
      if (url.href !== direct.href) seed.redirects.set(file.urlPath, url)
      const status = res.statusCode ?? 0
      if (status === 429 || status === 503) {
        const after = Number(res.headers['retry-after'])
        if (Number.isFinite(after) && after > 0)
          seed.next = Math.max(seed.next, now() + Math.min(after, 3600) * 1000)
        throw new Error(`${url.host} is busy (HTTP ${status}).`)
      }
      if (status >= 500) throw new Error(`${url.host} answered with HTTP ${status}.`)
      if (status === 206) {
        // RFC 9110 § 14.4: `bytes first-last/complete`
        const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(String(res.headers['content-range'] ?? ''))
        if (!m || Number(m[1]) !== from || Number(m[2]) !== from + length - 1)
          throw new WrongAnswer(`${url.host} sent other bytes than those asked for.`)
        if (m[3] !== '*' && Number(m[3]) !== file.length)
          throw new WrongAnswer(`${url.host} has a different ${file.path}.`)
      } else if (status === 200) {
        // the range was ignored: only usable from the start, and only if it's this file
        const size = Number(res.headers['content-length'])
        if (from !== 0 || (Number.isFinite(size) && size !== file.length))
          throw new WrongAnswer(`${url.host} doesn’t answer ranges.`)
      } else if (status === 404 || status === 410)
        throw new WrongAnswer(`${url.host} doesn’t have ${file.path}.`)
      else throw new WrongAnswer(`${url.host} answered with HTTP ${status}.`)

      let got = 0
      await new Promise<void>((resolve, reject) => {
        res.on('data', (chunk: Buffer) => {
          const take = Math.min(chunk.length, length - got)
          into.set(chunk.subarray(0, take), at + got)
          got += take
          seed.meter.add(take)
          if (got >= length) {
            if (status === 200 || chunk.length > take) res.destroy()
            resolve()
          }
        })
        res.once('end', () =>
          got >= length ? resolve() : reject(new Error(`${url.host} sent too little.`)),
        )
        res.once('error', reject)
        res.once('close', () =>
          got >= length ? resolve() : reject(new Error(`${url.host} hung up.`)),
        )
      })
    } finally {
      seed.responses.delete(res)
      if (!res.destroyed && !res.complete) res.destroy()
    }
  }

  /** One request's worth: a run of blocks asked of the picker, fetched, handed on. */
  const job = async (seed: Seed) => {
    const m = ctx.metainfo()
    const picker = ctx.picker()
    if (!m || !picker) return
    const wanted = Math.min(MAX_BLOCKS, Math.max(16, Math.ceil(m.pieceLength / BLOCK)))
    const all = picker.next({ key: seed.key, has: () => true }, wanted)
    if (!all.length) return
    // the download limit, as for peers: only what the bucket gives now
    let room = 0
    while (room < all.length && ctx.down.tryTake((all[room] as BlockRef).length)) room++
    for (const b of all.slice(room)) picker.release(seed.key, b)
    if (room === 0) {
      later(100)
      return
    }
    const blocks = all.slice(0, room)
    const gen = generation
    seed.busy++
    if (seed.status === 'not-contacted') seed.status = 'updating'
    const pending = new Set(blocks)
    try {
      for (const run of runsOf(m, blocks)) {
        const data = new Uint8Array(run.end - run.start)
        for (const s of fileSpans(m, run.start, run.end)) {
          if (s.file.pad) continue // zeros already
          await readRange(seed, s.file, s.fileOffset, s.length, data, s.at)
        }
        if (gen !== generation || seed.dropped) return
        for (const b of run.blocks) {
          const at = m.pieceLength * b.piece + b.offset - run.start
          pending.delete(b)
          ctx.receive(seed.key, b, data.subarray(at, at + b.length))
        }
      }
      if (seed.dropped) return
      seed.fails = 0
      seed.wrong = 0
      seed.status = 'working'
      seed.message = null
    } catch (e) {
      if (gen !== generation || seed.dropped) return
      if (e instanceof Unbound) return
      failed(seed, e as Error)
    } finally {
      seed.busy--
      if (gen === generation) {
        const p = ctx.picker()
        for (const b of pending) p?.release(seed.key, b)
        if (running) queueMicrotask(pump)
      }
    }
  }

  const later = (ms: number) => {
    if (retry) return
    retry = setTimeout(() => {
      retry = null
      pump()
    }, ms)
    unref(retry)
  }

  const pump = () => {
    if (!running || !ctx.active() || !ctx.sockets.up()) return
    const t = now()
    for (const seed of seeds) {
      if (seed.dropped || seed.next > t) continue
      while (seed.busy < IN_FLIGHT) {
        const before = seed.busy
        void job(seed)
        // nothing to ask for (or the limit's full): the next pump tries again
        if (seed.busy === before) break
      }
    }
  }

  return {
    /** Whether the torrent has any web seed at all. */
    any: () => seeds.length > 0,
    keys: () => new Set(seeds.map((s) => s.key)),

    start() {
      if (running || !seeds.length) return
      running = true
      timer = setInterval(pump, PUMP_MS)
      unref(timer)
      pump()
    },

    /** Stops every request; blocks in flight go back to the picker. */
    stop() {
      running = false
      generation++
      if (timer) clearInterval(timer)
      if (retry) clearTimeout(retry)
      timer = null
      retry = null
      const p = ctx.picker()
      for (const seed of seeds) {
        for (const r of seed.responses) r.destroy()
        seed.responses.clear()
        seed.busy = 0
        p?.dropPeer(seed.key)
        // a fresh start tries every seed again, as peers are
        seed.next = 0
      }
    },

    /** Something changed (a piece verified, priorities): ask for more now. */
    wake: () => pump(),

    /** The seed's data failed its piece hash: it's dropped, as a peer sending bad data is banned. */
    bad(key: string) {
      const seed = seeds.find((s) => s.key === key)
      if (seed) drop(seed, 'It sent data that doesn’t match the torrent.')
    },

    /** Seeds sending now. */
    connected: () => seeds.filter((s) => !s.dropped && s.busy > 0).length,

    /** Seeds still in use: not dropped. */
    usable: () => seeds.filter((s) => !s.dropped).length,

    statuses: (): WebSeedStatus[] =>
      seeds.map((s) => ({
        url: s.url,
        status: s.status,
        message: s.message,
        downRate: s.meter.rate(),
      })),
  }
}

type Run = { start: number; end: number; blocks: BlockRef[] }

/** Blocks sorted and merged into contiguous runs of the torrent's data. */
export function runsOf(m: Pick<Metainfo, 'pieceLength'>, blocks: BlockRef[]): Run[] {
  const sorted = [...blocks].sort((a, b) => a.piece - b.piece || a.offset - b.offset)
  const runs: Run[] = []
  for (const b of sorted) {
    const start = m.pieceLength * b.piece + b.offset
    const last = runs.at(-1)
    if (last && last.end === start) {
      last.end += b.length
      last.blocks.push(b)
    } else runs.push({ start, end: start + b.length, blocks: [b] })
  }
  return runs
}

/** The files a range of the torrent's data falls in, with where in each and in the range. */
export function fileSpans(
  m: Pick<Metainfo, 'files'>,
  start: number,
  end: number,
): { file: MetainfoFile; fileOffset: number; length: number; at: number }[] {
  const out: { file: MetainfoFile; fileOffset: number; length: number; at: number }[] = []
  for (const f of m.files) {
    const fEnd = f.offset + f.length
    if (fEnd <= start || f.offset >= end || f.length === 0) continue
    const from = Math.max(start, f.offset)
    const to = Math.min(end, fEnd)
    out.push({ file: f, fileOffset: from - f.offset, length: to - from, at: from - start })
  }
  return out
}
