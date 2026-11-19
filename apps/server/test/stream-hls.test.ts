// SPDX-License-Identifier: AGPL-3.0-only
// HLS and WebVTT over the real HTTP server (checkpoint 4.1b), on a Matroska clip made here with
// ffmpeg, so Chrome's profile gets a direct stream: the play response's playlist and subtitles,
// the multivariant and media playlists, the initialization section and a segment far ahead that
// play as one file, a text track as a rendition of WebVTT segments cut from the stream's own read
// (HT-49) and whole for direct play, the session's folder gone when it ends, the player told "This
// film didn't start" when ffmpeg fails, and the scrubber's previews made by the `media.trickplay`
// job and served, the keyframes read ahead by `media.ahead` (and a Matroska film's subtitles left
// to its streams), and a resume's playlist and timing lines. Skipped, and said so, without ffmpeg; the
// runs themselves are tested in packages/stream.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { createProbe } from '@highsea-tv/media/shared'
import { hasFfmpeg, runTool } from '@highsea-tv/media/testing'
import type { Runtime } from '@highsea-tv/runtime'
import { createClient } from '@highsea-tv/sdk'
import { createApi } from '../src/api/app.ts'
import { createHttpServer } from '../src/http.ts'
import { createStream } from '../src/stream/index.ts'
import { bootRuntime, cleanup, withOwner } from './helpers.ts'

const SINTEL = 45745
const SECONDS = 60
const ffprobe = process.env.HIGHSEA_FFPROBE || 'ffprobe'

/**
 * A minute of H.264 at 24 fps with a keyframe every 2 s, AAC, and an English SubRip track. Made
 * without blocking, under the tools' time limit (TOOL_LIMIT in @highsea-tv/media/testing): a sync
 * ffmpeg here once hung CI for four hours (Bun's lost sync-spawn exit, oven-sh/bun#47257).
 */
async function makeClip(path: string) {
  const srt = `${path}.srt`
  writeFileSync(srt, '1\n00:00:00,000 --> 00:00:02,000\nHello.\n')
  await runTool(process.env.HIGHSEA_FFMPEG || 'ffmpeg', [
    ...[
      '-v',
      'error',
      '-y',
      '-nostdin',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=320x180:rate=24:duration=${SECONDS}`,
    ],
    // the sound 24 ms late: AAC's 1,024 priming samples start it 23 ms before the picture,
    // which would move the film's start and every time below (ffmpeg 6.1 to 9.0 all do)
    ...[
      '-itsoffset',
      '0.024',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${SECONDS}`,
      '-i',
      srt,
    ],
    ...['-map', '0:v', '-map', '1:a', '-map', '2:s'],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '48'],
    ...['-c:a', 'aac', '-c:s', 'srt', '-metadata:s:s:0', 'language=eng', path],
  ])
  return path
}

describe.skipIf(!hasFfmpeg)('HLS over HTTP', () => {
  let dir: string
  let runtime: Runtime
  let url: string
  let api: ReturnType<typeof createClient>
  let token: string
  let close: (() => Promise<void>) | undefined

  // Making the clip, probing it and booting take a second or two, more on a busy runner: past
  // bun:test's default 5 s, which hooks share with tests (https://bun.com/docs/test/writing-tests,
  // Timeouts), the hook would fail half-done. The clip's own limit ends a stall well before this.
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'highsea-hls-api-'))
    const path = await makeClip(join(dir, 'Sintel (2010).mkv'))
    const probe = await createProbe()(path)
    runtime = await bootRuntime()
    ;({ token } = await withOwner(runtime))
    const now = Date.now()
    const { db } = runtime
    db.insert(schema.movieMetadata)
      .values({
        tmdbId: SINTEL,
        title: 'Sintel',
        originalTitle: 'Sintel',
        year: 2010,
        releaseDate: '2010-09-27',
        language: 'en',
        data: {},
        fetchedAt: now,
      })
      .run()
    db.insert(schema.mediaItems)
      .values({
        id: 'itm_sintel',
        type: 'movie',
        tmdbId: SINTEL,
        title: 'Sintel',
        sortTitle: 'sintel',
        year: 2010,
        releaseDate: '2010-09-27',
        status: 'available',
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 'qp-hd',
        rootFolder: dir,
        path: dir,
        addedAt: now,
        updatedAt: now,
      })
      .run()
    db.insert(schema.mediaFiles)
      .values({
        id: 'fil_sintel',
        itemId: 'itm_sintel',
        path,
        size: Bun.file(path).size,
        mediaInfo: { probe },
        addedAt: now,
      } as typeof schema.mediaFiles.$inferInsert)
      .run()
    db.insert(schema.versions)
      .values({
        id: 'ver_sintel',
        itemId: 'itm_sintel',
        label: 'Default',
        qualityProfileId: 'qp-hd',
        fileId: 'fil_sintel',
        position: 0,
        createdAt: now,
      } as typeof schema.versions.$inferInsert)
      .run()
    const server = createHttpServer({ api: createApi(runtime), stream: createStream(runtime) })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    api = createClient({ baseUrl: url, token })
    close = () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      })
  }, 60_000)
  // whatever the setup reached, everything it started is stopped and its folder removed
  afterAll(async () => {
    try {
      await close?.()
    } finally {
      try {
        await cleanup()
      } finally {
        if (dir) rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  const play = () =>
    api.playback.play({
      params: { type: 'movie', id: SINTEL },
      body: { profile: 'web-chromium', subtitleId: 'fil_sintel:2' },
    })

  /**
   * Waits for `check` for as long as the test's time limit allows: a fixed count of short sleeps
   * guesses the machine's speed, and a loaded runner runs past it (HT-72).
   */
  const until = async (check: () => boolean) => {
    while (!check()) await Bun.sleep(10)
  }

  const logged = (message: string, session?: string) =>
    runtime.logs
      .entries()
      .filter(
        (l) =>
          l.source === 'playback' &&
          l.message === message &&
          (!session || l.fields?.session === session),
      )

  test('read ahead of the first play: the keyframes kept; a Matroska film’s subtitles left to its streams', async () => {
    const file = runtime.db.select().from(schema.mediaFiles).get() as { id: string; size: number }
    const root = join(runtime.config.dataDir, 'webvtt')
    const orphan = join(root, 'fil_gone')
    mkdirSync(orphan, { recursive: true })
    expect(runtime.db.select().from(schema.fileKeyframes).all()).toEqual([])

    runtime.jobs.enqueue('media.ahead', {}, { dedupeKey: 'ahead' })
    await runtime.jobs.tick()
    await runtime.jobs.idle()
    // the keyframes' job queues the subtitles' once no file is left without keyframes
    await runtime.jobs.tick()
    await runtime.jobs.idle()

    // a minute with a keyframe every 2 s
    const kept = runtime.db.select().from(schema.fileKeyframes).get()
    expect(kept).toMatchObject({ fileId: file.id, size: file.size })
    expect(kept?.times.length).toBe(30)
    // an MKV is never played as it is, and a stream's runs write its subtitles (HT-49), so
    // nothing reads the film for them
    expect(existsSync(join(root, file.id))).toBe(false)
    expect(existsSync(orphan)).toBe(false)
    // from the file's index (HT-48), then the subtitles in a job of their own
    expect(logged('read ahead of the first play')[0]?.fields).toMatchObject({
      file: file.id,
      keyframes: 30,
      from: 'index',
    })
    expect(logged('subtitles converted ahead of the first play')).toEqual([])

    // so a play reads nothing but its stream: its subtitle's first segment comes from its run
    const session = await play()
    const base = `${url}${(session.url as string).replace(/main\.m3u8$/, '')}`
    const first = await fetch(`${base}0.m4s`)
    expect(first.status).toBe(200)
    await first.arrayBuffer()
    const sub = await fetch(`${url}${session.subtitles[0]?.url?.replace(/\.m3u8$/, '/0.vtt')}`)
    expect(await sub.text()).toContain('Hello.')
    expect(logged('keyframes read', session.id)).toEqual([])
    expect(logged('subtitle converted', session.id)).toEqual([])
    expect(existsSync(join(root, file.id))).toBe(false)
    // the segment is counted when its sending ends, as its "first segment served" line is written
    await until(() => logged('first segment served', session.id).length > 0)
    await api.playback.stop({ params: { id: session.id } })
    // one segment and gone: a player that gave up, said at warn (HT-56)
    expect(logged('play session ended early', session.id).map((l) => [l.level, l.fields])).toEqual([
      ['warn', { session: session.id, why: 'stopped', segments: 1 }],
    ])
  })

  test('a resume: the playlist starts there, and the log says where the start’s time went', async () => {
    const session = await api.playback.play({
      params: { type: 'movie', id: SINTEL },
      body: { profile: 'web-chromium', start: 31 },
    })
    const base = `${url}${(session.url as string).replace(/main\.m3u8$/, '')}`
    const media = await (await fetch(`${base}video.m3u8`)).text()
    expect(media).toContain('#EXT-X-START:TIME-OFFSET=31.000,PRECISE=YES')
    // a segment begins at the keyframe before the resume (30 s), and it's a short one
    const lines = media.split('\n')
    let at = 0
    let name = ''
    for (let i = 0; i < lines.length && !name; i++) {
      if (!lines[i]?.startsWith('#EXTINF:')) continue
      const length = Number(lines[i]?.slice(8).split(',')[0])
      if (at + length > 31) {
        expect(at).toBeCloseTo(30, 1)
        expect(length).toBeCloseTo(2, 1)
        name = lines[i + 1] as string
      }
      at += length
    }
    expect((await fetch(`${base}${name}`)).status).toBe(200)

    const one = (message: string) => {
      const lines = logged(message, session.id)
      expect(lines.map((l) => l.level)).toEqual(['info'])
      return lines[0]?.fields as Record<string, number>
    }
    expect(one('play session started')).toMatchObject({ start: 31, method: 'direct-stream' })
    expect(one('play session started').decisionMs).toBeGreaterThanOrEqual(0)
    // ffmpeg began at the keyframe before the resume, not at the film's start
    const started = one('ffmpeg started')
    expect(started).toMatchObject({ run: 1, method: 'direct-stream', piece: 15 })
    expect(started.start).toBeCloseTo(30, 1)
    const ready = one('first segment ready')
    expect(ready).toMatchObject({ run: 1, piece: 15 })
    expect(ready.ffmpegMs).toBeGreaterThan(0)
    expect(ready.playlistMs).toBeGreaterThanOrEqual(0)
    expect(ready.sinceOpenMs).toBeGreaterThanOrEqual(ready.ffmpegMs as number)
    await until(() => logged('first segment served', session.id).length > 0)
    const served = one('first segment served')
    expect(served).toMatchObject({ segment: Number(name.split('.')[0]) })
    expect(served.bytes).toBeGreaterThan(0)
    expect(served.sincePlayMs).toBeGreaterThanOrEqual(served.sendMs as number)
    // once a session: the next segment says nothing more. Read whole, as a player does: a
    // segment counts once it's sent whole, so the stop below can't come before it (HT-56)
    await (await fetch(`${base}${Number(name.split('.')[0]) + 1}.m4s`)).arrayBuffer()
    expect(logged('first segment served', session.id).length).toBe(1)
    await api.playback.stop({ params: { id: session.id } })
    expect(logged('play session ended early', session.id)).toEqual([])
  })

  test('a direct stream: the playlists, the init and a segment far ahead, played as one file', async () => {
    const session = await play()
    expect(session.decision.method).toBe('direct-stream')
    expect(session.url).toMatch(/^\/stream\/hls\/[\w.-]+\/main\.m3u8$/)
    expect(session.subtitles).toEqual([
      {
        id: 'fil_sintel:2',
        url: expect.stringMatching(/^\/stream\/hls\/[\w.-]+\/subs\/fil_sintel%3A2\.m3u8$/),
        delivery: 'external',
      },
    ])
    const base = `${url}${(session.url as string).replace(/main\.m3u8$/, '')}`

    const main = await fetch(`${base}main.m3u8`)
    expect(main.headers.get('content-type')).toBe('application/vnd.apple.mpegurl')
    const multivariant = await main.text()
    expect(multivariant).toContain('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs"')
    expect(multivariant).toContain('URI="subs/fil_sintel%3A2.m3u8"')
    expect(multivariant).toContain('RESOLUTION=320x180,SUBTITLES="subs"\nvideo.m3u8')

    const media = await (await fetch(`${base}video.m3u8`)).text()
    expect(media.startsWith('#EXTM3U\n#EXT-X-VERSION:7')).toBe(true)
    expect(media).toContain('#EXT-X-MAP:URI="init.mp4"')
    const segments = media.split('\n').filter((l) => /^\d+\.m4s$/.test(l))
    expect(segments.length).toBeGreaterThan(3)
    expect(media.trimEnd().endsWith('#EXT-X-ENDLIST')).toBe(true)

    // a segment near the end, far past what the first run made: a new run starts there
    const last = segments.at(-1) as string
    const segment = await fetch(`${base}${last}`)
    expect(segment.status).toBe(200)
    expect(segment.headers.get('content-type')).toBe('video/mp4')
    const body = Buffer.from(await segment.arrayBuffer())
    const init = Buffer.from(await (await fetch(`${base}init.mp4`)).arrayBuffer())
    const joined = join(dir, 'joined.mp4')
    writeFileSync(joined, Buffer.concat([init, body]))
    const first = (
      await runTool(ffprobe, [
        ...['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time'],
        ...['-of', 'csv=p=0', '-read_intervals', '%+#1', joined],
      ])
    ).trim()
    // on the film's timeline: the last segment starts in the film's last minute's end
    expect(Number(first)).toBeGreaterThan(SECONDS - 15)

    // the subtitle's rendition, a WebVTT segment at each of the picture's (HT-49), and its first,
    // cut from the run the picture's first segment starts
    const list = await (await fetch(`${base}subs/fil_sintel%3A2.m3u8`)).text()
    const cues = list.split('\n').filter((l) => l.endsWith('.vtt'))
    expect(cues).toEqual(segments.map((_, i) => `fil_sintel%3A2/${i}.vtt`))
    expect(list.split('\n').filter((l) => l.startsWith('#EXTINF'))).toEqual(
      media.split('\n').filter((l) => l.startsWith('#EXTINF')),
    )
    expect((await fetch(`${base}${segments[0]}`)).status).toBe(200)
    const vtt = await fetch(`${base}subs/fil_sintel%3A2/0.vtt`)
    expect(vtt.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    expect(await vtt.text()).toBe(
      'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n00:00.000 --> 00:02.000\nHello.\n',
    )
    expect((await fetch(`${base}subs/fil_sintel%3A2/${segments.length}.vtt`)).status).toBe(404)
    expect((await fetch(`${base}nothing`)).status).toBe(404)

    // leaving ends the session and removes its folder
    const folder = join(runtime.config.dataDir, 'transcodes', session.id)
    expect(existsSync(folder)).toBe(true)
    await api.playback.stop({ params: { id: session.id } })
    await until(() => !existsSync(folder))
    expect(existsSync(folder)).toBe(false)
    expect((await fetch(`${base}video.m3u8`)).status).toBe(404)
  })

  test('a text track whole, as direct play has it', async () => {
    const session = await play()
    const token = (session.url as string).split('/')[3]
    const vtt = await fetch(`${url}/stream/subtitles/${token}/fil_sintel%3A2.vtt`)
    expect(vtt.status).toBe(200)
    expect(await vtt.text()).toMatch(/^WEBVTT/)
    expect((await fetch(`${url}/stream/subtitles/${token}/fil_sintel%3A9.vtt`)).status).toBe(404)
    await api.playback.stop({ params: { id: session.id } })
  })

  test('ffmpeg failing: the player is told the film didn’t start', async () => {
    // the keyframes are kept from the first test, so the session starts, then the file goes
    const { path } = runtime.db.select().from(schema.mediaFiles).get() as { path: string }
    const session = await play()
    const moved = `${path}.away`
    renameSync(path, moved)
    try {
      const base = `${url}${(session.url as string).replace(/main\.m3u8$/, '')}`
      const r = await fetch(`${base}9.m4s`)
      expect(r.status).toBe(500)
      expect(((await r.json()) as { error: { message: string } }).error.message).toBe(
        'This film didn’t start.',
      )
    } finally {
      renameSync(moved, path)
      await api.playback.stop({ params: { id: session.id } })
    }
  })

  test('trickplay: made by the job, then its manifest and sheets served', async () => {
    const get = (path: string) =>
      fetch(`${url}/api/v1/items/movie/${SINTEL}/trickplay${path}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    expect(await (await get('')).json()).toEqual({ versionId: 'ver_sintel', manifest: null })
    expect((await get('/0.jpg')).status).toBe(404)

    runtime.jobs.enqueue('media.trickplay', {}, { dedupeKey: 'trickplay' })
    await runtime.jobs.tick()
    await runtime.jobs.idle()

    // a minute at a preview every 10 s: six, on one sheet
    expect(await (await get('')).json()).toEqual({
      versionId: 'ver_sintel',
      manifest: {
        interval: 10,
        width: 320,
        height: 180,
        columns: 10,
        rows: 10,
        count: 6,
        sheets: 1,
      },
    })
    const sheet = await get('/0.jpg')
    expect(sheet.status).toBe(200)
    expect(sheet.headers.get('content-type')).toBe('image/jpeg')
    expect([...new Uint8Array(await sheet.arrayBuffer()).subarray(0, 2)]).toEqual([0xff, 0xd8])
    expect((await get('/1.jpg')).status).toBe(404)
    expect((await get('/x.jpg')).status).toBe(404)
    expect((await fetch(`${url}/api/v1/items/movie/${SINTEL}/trickplay/0.jpg`)).status).toBe(401)
  })

  test('trickplay: a changed file is made again, and folders without a file are removed', async () => {
    const root = join(runtime.config.dataDir, 'trickplay')
    const orphan = join(root, 'fil_gone')
    mkdirSync(orphan, { recursive: true })
    // the test's library is this one file
    const file = schema.mediaFiles
    const { size } = runtime.db.select().from(file).get() as { size: number }
    // the same path, another size: what's stored is for the old file
    runtime.db
      .update(file)
      .set({ size: size + 1 })
      .run()
    const manifest = async () =>
      (
        (await (
          await fetch(`${url}/api/v1/items/movie/${SINTEL}/trickplay`, {
            headers: { authorization: `Bearer ${token}` },
          })
        ).json()) as { manifest: unknown }
      ).manifest
    expect(await manifest()).toBeNull()
    runtime.jobs.enqueue('media.trickplay', {}, { dedupeKey: 'trickplay' })
    await runtime.jobs.tick()
    await runtime.jobs.idle()
    expect(await manifest()).toMatchObject({ count: 6, sheets: 1 })
    expect(existsSync(orphan)).toBe(false)
    runtime.db.update(file).set({ size }).run()
  })
})
