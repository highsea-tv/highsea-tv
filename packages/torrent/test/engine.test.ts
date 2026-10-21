// SPDX-License-Identifier: AGPL-3.0-only
// Two engines on loopback: one seeds, the other downloads, through a local tracker. The parent
// plan's local-tracker test, with pause and resume, magnets, fast resume, the vet hook and the kill
// switch.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toMagnet } from '../src/index.ts'
import {
  LOOPBACK,
  makeTorrent,
  randomData,
  startTracker,
  tempDir,
  testEngine,
  until,
  writeFiles,
} from './helpers.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

async function seeded(
  files: { path: string; data: Uint8Array }[],
  announce: string[],
  name = 'Sintel',
) {
  const t = makeTorrent({ name, files, announce })
  const dir = tempDir('seed')
  writeFiles(dir, files)
  const a = testEngine()
  cleanups.push(() => a.engine.close())
  await a.engine.start()
  await a.engine.setBinding(LOOPBACK)
  const { id } = await a.engine.add({
    source: { torrent: t.torrent },
    savePath: dir,
    category: 'movies',
  })
  await until(() => a.engine.get(id).state === 'seeding', 10_000, 'the seeder to check its files')
  return { ...t, a, seedId: id }
}

describe('two engines on loopback', () => {
  test('a single-file torrent downloads over an HTTP tracker and the bytes match', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(1_500_000)
    const files = [{ path: 'Sintel.mkv', data }]
    const { torrent, a, seedId } = await seeded(files, [tracker.httpUrl], 'Sintel.mkv')

    const b = testEngine()
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await b.engine.add({ source: { torrent }, savePath: dir, category: 'movies' })
    await until(() => b.engine.get(id).state === 'seeding', 20_000, 'the download')

    expect(Buffer.from(readFileSync(join(dir, 'Sintel.mkv'))).equals(Buffer.from(data))).toBe(true)
    const snap = b.engine.get(id)
    expect(snap.progress).toBe(1)
    expect(snap.files).toEqual([
      { path: 'Sintel.mkv', size: data.length, progress: 1, priority: 'normal' },
    ])
    expect(snap.completedAt).not.toBeNull()
    expect(snap.trackers[0]?.status).toBe('working')
    await until(() => a.engine.get(seedId).uploaded >= data.length, 5_000, 'the seeder’s count')
    expect(b.events.some((e) => e.type === 'finished' && e.id === id)).toBe(true)
    // the finished torrent told the tracker
    await until(() => tracker.announces.some((x) => x.event === 'completed'), 5_000, 'completed')
  }, 30_000)

  test('a folder over a UDP tracker, with one file skipped and never created', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const files = [
      { path: 'Sintel (2010)/Sintel.mkv', data: randomData(700_000) },
      { path: 'Sintel (2010)/Sample/sample.mkv', data: randomData(90_001) },
      { path: 'Sintel (2010)/Sintel.nfo', data: randomData(1_234) },
    ]
    const { torrent } = await seeded(files, [tracker.udpUrl], 'Sintel (2010)')
    const b = testEngine()
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await b.engine.add({
      source: { torrent },
      savePath: dir,
      category: 'movies',
      priorities: ['normal', 'skip', 'normal'],
    })
    await until(() => b.engine.get(id).state === 'seeding', 20_000, 'the download')
    expect(
      readFileSync(join(dir, 'Sintel (2010)', 'Sintel.mkv')).equals(
        Buffer.from(files[0]?.data as Uint8Array),
      ),
    ).toBe(true)
    expect(
      readFileSync(join(dir, 'Sintel (2010)', 'Sintel.nfo')).equals(
        Buffer.from(files[2]?.data as Uint8Array),
      ),
    ).toBe(true)
    expect(existsSync(join(dir, 'Sintel (2010)', 'Sample', 'sample.mkv'))).toBe(false)
    expect(tracker.announces.every((x) => x.via === 'udp')).toBe(true)
  }, 30_000)

  test('a magnet gets its metadata from the seeder, then downloads', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(400_000)
    const { infoHash } = await seeded(
      [{ path: 'Sintel.mkv', data }],
      [tracker.httpUrl],
      'Sintel.mkv',
    )
    const b = testEngine()
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const magnet = toMagnet({ infoHash, name: 'Sintel.mkv', trackers: [[tracker.httpUrl]] })
    const { id } = await b.engine.add({ source: { magnet }, savePath: dir, category: 'movies' })
    expect(b.engine.get(id).hasMetadata).toBe(false)
    await until(() => b.engine.get(id).state === 'seeding', 20_000, 'the magnet')
    expect(b.events.some((e) => e.type === 'metadata' && e.id === id)).toBe(true)
    expect(readFileSync(join(dir, 'Sintel.mkv')).equals(Buffer.from(data))).toBe(true)
    // the metadata is stored, so a restart doesn't need peers to know the files
    expect(b.engine.metainfo(id)?.files[0]?.path).toBe('Sintel.mkv')
  }, 30_000)

  test('the vet hook refuses a release with an executable before anything downloads', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const files = [
      { path: 'Nosferatu/Nosferatu.mkv', data: randomData(100_000) },
      { path: 'Nosferatu/Nosferatu.exe', data: randomData(1_000) },
    ]
    const t = makeTorrent({ name: 'Nosferatu', files, announce: [tracker.httpUrl] })
    const b = testEngine({
      vet: (fs) => {
        const bad = fs.find((f) => f.path.endsWith('.exe'))
        return bad
          ? `The release contains an executable file (${bad.path.split('/').pop()}).`
          : null
      },
    })
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await b.engine.add({
      source: { torrent: t.torrent },
      savePath: dir,
      category: 'movies',
    })
    await until(() => b.events.some((e) => e.type === 'refused'), 2_000, 'the refusal')
    const snap = b.engine.get(id)
    expect(snap.state).toBe('error')
    expect(snap.message).toBe('The release contains an executable file (Nosferatu.exe).')
    await new Promise((r) => setTimeout(r, 300))
    expect(tracker.announces).toHaveLength(0)
    expect(existsSync(join(dir, 'Nosferatu'))).toBe(false)
  })

  test('pause stops the download and resume finishes it', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(1_200_000)
    const { torrent } = await seeded(
      [{ path: 'Sintel.mkv', data }],
      [tracker.httpUrl],
      'Sintel.mkv',
    )
    const b = testEngine({ limits: { downloadRate: 300_000 } })
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await b.engine.add({ source: { torrent }, savePath: dir, category: 'movies' })
    await until(() => b.engine.get(id).progress > 0.1, 10_000, 'some progress')
    b.engine.pause(id)
    await until(() => b.engine.get(id).state === 'paused', 5_000, 'the pause')
    // a piece already in hand when it paused is still checked and kept
    await new Promise((r) => setTimeout(r, 200))
    const at = b.engine.get(id).progress
    expect(b.engine.status().connections).toBe(0)
    await new Promise((r) => setTimeout(r, 500))
    expect(b.engine.get(id).progress).toBe(at)
    b.engine.setLimits({ downloadRate: 0 })
    b.engine.resume(id)
    await until(() => b.engine.get(id).state === 'seeding', 20_000, 'the rest')
    expect(readFileSync(join(dir, 'Sintel.mkv')).equals(Buffer.from(data))).toBe(true)
  }, 30_000)

  test('only three download at once; the fourth waits as queued', async () => {
    const b = testEngine()
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const t = makeTorrent({
        name: `Movie ${i}.mkv`,
        files: [{ path: `Movie ${i}.mkv`, data: randomData(50_000) }],
      })
      ids.push(
        (
          await b.engine.add({
            source: { torrent: t.torrent },
            savePath: tempDir(),
            category: 'movies',
          })
        ).id,
      )
    }
    expect(ids.map((id) => b.engine.get(id).state)).toEqual([
      'downloading',
      'downloading',
      'downloading',
      'queued',
    ])
    b.engine.move(ids[3] as string, 'top')
    expect(b.engine.get(ids[3] as string).state).toBe('downloading')
    expect(b.engine.get(ids[2] as string).state).toBe('queued')
  })
})

describe('fast resume', () => {
  test('a restart picks up where it stopped without checking the pieces again', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(1_500_000)
    const { torrent } = await seeded(
      [{ path: 'Sintel.mkv', data }],
      [tracker.httpUrl],
      'Sintel.mkv',
    )
    const first = testEngine({ limits: { downloadRate: 300_000 } })
    await first.engine.start()
    await first.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await first.engine.add({
      source: { torrent },
      savePath: dir,
      category: 'movies',
    })
    await until(() => first.engine.get(id).progress > 0.25, 10_000, 'some progress')
    await first.engine.close()
    const kept = first.engine.get(id).progress

    // the same database, a new engine: as after a restart
    const second = testEngine({ db: first.database, port: first.port })
    cleanups.push(() => second.engine.close())
    await second.engine.start()
    expect(second.hashes()).toBe(0)
    expect(second.engine.get(id).state).not.toBe('checking')
    expect(second.engine.get(id).progress).toBeGreaterThanOrEqual(kept - 0.05)
    await second.engine.setBinding(LOOPBACK)
    await until(() => second.engine.get(id).state === 'seeding', 20_000, 'the rest')
    expect(readFileSync(join(dir, 'Sintel.mkv')).equals(Buffer.from(data))).toBe(true)
  }, 30_000)

  test('a finished torrent whose file changed is checked again, alone', async () => {
    const data = randomData(200_000)
    const files = [{ path: 'Sintel.mkv', data }]
    const t = makeTorrent({ name: 'Sintel.mkv', files })
    const dir = tempDir('seed')
    writeFiles(dir, files)
    const first = testEngine()
    await first.engine.start()
    const { id } = await first.engine.add({
      source: { torrent: t.torrent },
      savePath: dir,
      category: 'movies',
    })
    await until(() => first.engine.get(id).state === 'seeding', 5_000, 'the check')
    await first.engine.close()

    // the owner replaced a byte in the middle
    const changed = Buffer.from(data)
    changed[100_000] = (changed[100_000] as number) ^ 0xff
    await new Promise((r) => setTimeout(r, 20))
    writeFiles(dir, [{ path: 'Sintel.mkv', data: changed }])

    const second = testEngine({ db: first.database })
    cleanups.push(() => second.engine.close())
    await second.engine.start()
    await until(
      () => second.hashes() > 0 && second.engine.get(id).state !== 'checking',
      5_000,
      'the recheck',
    )
    expect(second.engine.get(id).progress).toBeLessThan(1)
    expect(second.engine.get(id).progress).toBeGreaterThan(0.8)
  })
})

describe('the kill switch', () => {
  test('every socket is bound to the binding’s address, and none opens while it’s gone', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(1_500_000)
    const { torrent } = await seeded(
      [{ path: 'Sintel.mkv', data }],
      [tracker.httpUrl],
      'Sintel.mkv',
    )
    const b = testEngine({ limits: { downloadRate: 300_000 } })
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    const dir = tempDir('leech')
    const { id } = await b.engine.add({ source: { torrent }, savePath: dir, category: 'movies' })

    // no binding yet: nothing moves
    await new Promise((r) => setTimeout(r, 300))
    expect(b.sockets).toHaveLength(0)
    expect(b.engine.get(id).progress).toBe(0)

    await b.engine.setBinding(LOOPBACK)
    await until(() => b.engine.get(id).progress > 0.1, 10_000, 'some progress')
    expect(b.sockets.length).toBeGreaterThan(0)
    expect(b.sockets.every((s) => s.localAddress === '127.0.0.1' || s.kind === 'connect')).toBe(
      true,
    )
    expect(
      b.sockets
        .filter((s) => s.kind !== 'connect' || s.remote !== null)
        .every((s) => s.localAddress === '127.0.0.1'),
    ).toBe(true)

    // the tunnel drops
    await b.engine.setBinding(null)
    expect(b.engine.status().up).toBe(false)
    expect(b.engine.status().connections).toBe(0)
    const opened = b.sockets.length
    await new Promise((r) => setTimeout(r, 200))
    const at = b.engine.get(id).progress
    await new Promise((r) => setTimeout(r, 1_500))
    expect(b.sockets.length).toBe(opened)
    expect(b.engine.get(id).progress).toBe(at)
    expect(b.events.some((e) => e.type === 'network' && !e.up)).toBe(true)

    // and comes back
    b.engine.setLimits({ downloadRate: 0 })
    await b.engine.setBinding(LOOPBACK)
    await until(() => b.engine.get(id).state === 'seeding', 20_000, 'the rest')
    expect(readFileSync(join(dir, 'Sintel.mkv')).equals(Buffer.from(data))).toBe(true)
  }, 40_000)
})
