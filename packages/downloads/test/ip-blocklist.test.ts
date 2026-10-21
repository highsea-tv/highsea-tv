// SPDX-License-Identifier: AGPL-3.0-only
// The IP blocklist job (6b): fetched through the fetch seam (a fake here), gzipped or not, kept in
// the config folder so a restart blocks at once without the network, a failed fetch or a broken
// list leaving the one in use alone, files confined to the config folder, and a changed setting
// picked up straight away.
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createEventBus, createFakeClock, silentLogger } from '@highsea/core'
import { migrate, openDatabase, schema, writeSetting } from '@highsea/db'
import { createJobQueue } from '@highsea/jobs'
import type { RangeSet } from '@highsea/torrent'
import { eq } from 'drizzle-orm'
import {
  createIpBlocklist,
  DEFAULT_DOWNLOAD_CLIENT,
  DOWNLOAD_CLIENT_KEY,
  downloadClientSchema,
  IP_BLOCKLIST_EVERY_MS,
  IP_BLOCKLIST_JOB,
} from '../src/index.ts'

const LIST = 'Bad actors:203.0.113.0-203.0.113.255\nMore:198.51.100.1-198.51.100.9\n'
const URL_A = 'https://lists.example/level1.p2p.gz'

function world(options: { configDir?: string; db?: ReturnType<typeof openDatabase> } = {}) {
  const database = options.db ?? openDatabase(':memory:')
  if (!options.db) migrate(database.raw)
  const db = database.db
  const clock = createFakeClock()
  const events = createEventBus({ now: () => clock.now() })
  const jobs = createJobQueue({ db, clock, events })
  const configDir = options.configDir ?? mkdtempSync(join(tmpdir(), 'highsea-config-'))
  let current: RangeSet | null = null
  let fetches = 0
  let answer: () => Response = () => new Response(gzipSync(Buffer.from(LIST)))
  const fetch = (async () => {
    fetches++
    return answer()
  }) as unknown as typeof globalThis.fetch
  const blocklist = createIpBlocklist({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    fetch,
    engine: {
      setBlocklist: (s) => {
        current = s
      },
    },
    configDir,
  })
  blocklist.defineJobs()
  const set = (source: string) => {
    writeSetting(db, DOWNLOAD_CLIENT_KEY, { ...DEFAULT_DOWNLOAD_CLIENT, blocklistUrl: source }, 0)
    events.emit({ topic: 'settings.updated' })
  }
  const queued = () =>
    database.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.type, IP_BLOCKLIST_JOB))
      .all()
      .filter((j) => j.status === 'queued')
  const run = async () => {
    await jobs.tick()
    await jobs.idle()
  }
  return {
    database,
    db,
    clock,
    configDir,
    blocklist,
    jobs,
    set,
    queued,
    run,
    current: () => current,
    fetches: () => fetches,
    answer(fn: () => Response) {
      answer = fn
    },
  }
}

describe('the setting', () => {
  test('empty, an http(s) address or a path; other schemes refused', () => {
    const parse = (blocklistUrl: string) =>
      downloadClientSchema.safeParse({ ...DEFAULT_DOWNLOAD_CLIENT, blocklistUrl }).success
    expect(parse('')).toBe(true)
    expect(parse(URL_A)).toBe(true)
    expect(parse('blocklists/level1.dat')).toBe(true)
    expect(parse('/config/level1.p2b')).toBe(true)
    expect(parse('ftp://lists.example/x')).toBe(false)
    expect(parse('file:///etc/passwd')).toBe(false)
    // a stored row from before 6b has no field: it reads as off
    const { blocklistUrl: _, ...before } = DEFAULT_DOWNLOAD_CLIENT
    expect(downloadClientSchema.parse(before).blocklistUrl).toBe('')
  })
})

describe('a list address', () => {
  test('fetched by the job, gzipped, kept; a restart blocks from the copy without the network', async () => {
    const w = world()
    w.set(URL_A)
    const stop = w.blocklist.start()
    expect(w.queued()).toHaveLength(1)
    await w.run()
    expect(w.fetches()).toBe(1)
    expect(w.current()?.has('203.0.113.50')).toBe(true)
    expect(w.current()?.has('198.51.100.10')).toBe(false)
    expect(w.blocklist.status()).toMatchObject({
      source: URL_A,
      ranges: 2,
      format: 'p2p',
      problem: null,
    })
    expect(existsSync(join(w.configDir, 'blocklist', 'list.bin'))).toBe(true)
    // the job again: safe to repeat
    await w.blocklist.refresh()
    expect(w.current()?.size).toBe(2)
    stop()

    // a restart: the copy is used at once, and it's fresh, so nothing is fetched
    const again = world({ configDir: w.configDir, db: w.database })
    again.answer(() => {
      throw new Error('no network in this test')
    })
    again.blocklist.start()
    expect(again.current()?.has('203.0.113.1')).toBe(true)
    expect(again.queued()).toHaveLength(0)
    expect(again.fetches()).toBe(0)
  })

  test('a failed fetch or a broken list leaves the list in use, and says why', async () => {
    const w = world()
    w.set(URL_A)
    w.blocklist.start()
    await w.run()
    const good = w.current()
    w.answer(() => new Response('', { status: 503 }))
    await expect(w.blocklist.refresh()).rejects.toThrow('503')
    expect(w.current()).toBe(good)
    expect(w.blocklist.issues()[0]?.message).toContain('answered 503')
    // a list that parses to nothing isn't kept, and isn't retried
    w.answer(() => new Response('<html>Not a list</html>'))
    await w.blocklist.refresh()
    expect(w.current()).toBe(good)
    expect(w.blocklist.issues()[0]?.message).toContain('no ranges')
    // the next fetch that works clears the problem
    w.clock.advance(IP_BLOCKLIST_EVERY_MS + 1)
    w.answer(() => new Response(gzipSync(Buffer.from(LIST))))
    await w.blocklist.refresh()
    expect(w.blocklist.issues()).toHaveLength(0)
  })

  test('a changed setting is fetched straight away; empty turns it off and drops the copy', async () => {
    const w = world()
    w.blocklist.start()
    expect(w.queued()).toHaveLength(0)
    w.set(URL_A)
    expect(w.queued()).toHaveLength(1)
    await w.run()
    expect(w.current()?.size).toBe(2)
    w.set('')
    await w.run()
    expect(w.current()).toBeNull()
    expect(existsSync(join(w.configDir, 'blocklist'))).toBe(false)
  })
})

describe('a list file', () => {
  test('read from the config folder; a path outside it is refused', async () => {
    const w = world()
    mkdirSync(join(w.configDir, 'lists'), { recursive: true })
    writeFileSync(join(w.configDir, 'lists', 'level1.dat'), '1.0.0.0 - 1.0.0.255 , 0 , test\n')
    w.set('lists/level1.dat')
    w.blocklist.start()
    expect(w.current()?.has('1.0.0.9')).toBe(true)
    expect(w.queued()).toHaveLength(0)
    w.set('../outside.p2p')
    await w.run()
    expect(w.current()).toBeNull()
    expect(w.blocklist.issues()[0]?.message).toContain('in the config folder')
    expect(w.fetches()).toBe(0)
  })
})
