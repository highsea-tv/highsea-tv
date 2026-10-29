// SPDX-License-Identifier: AGPL-3.0-only
// Playback over the real HTTP server (checkpoint 4.1a): the play decision through the API, the
// stream token and `/stream/files/{token}` with byte ranges (RFC 9110 § 14: 206, 416, If-Range and
// HEAD), sessions ended by leaving, by signing the device out and by losing the library; and each
// person's watch state: positions, watched past 90%, played and unplayed, the player's picks and
// Next up. The decision itself is tested in packages/stream, the watch state's rules in
// packages/media.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { ApiError, createClient } from '@highsea-tv/sdk'
import { createApi } from '../src/api/app.ts'
import { createHttpServer } from '../src/http.ts'
import { createStream } from '../src/stream/index.ts'
import {
  addMember,
  BYTES,
  bootRuntime,
  cleanup,
  film,
  meta,
  OWNER,
  SIZE,
  withOwner,
} from './helpers.ts'

const SINTEL = 45745
const TEARS = 133701

const cleanups: (() => Promise<void> | void)[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
  await cleanup()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function serve() {
  const runtime = await bootRuntime()
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Sam')
  const dir = mkdtempSync(join(tmpdir(), 'highsea-play-'))
  dirs.push(dir)
  // Sintel's subtitles: SRT, a Blu-ray picture track, and styled ASS
  const track = (index: number, codec: string, language: string) => ({
    index,
    codec,
    language,
    title: null,
    forced: false,
    hi: false,
    default: false,
  })
  film(runtime, dir, SINTEL, 'Sintel', 2010, [
    track(2, 'subrip', 'eng'),
    track(3, 'hdmv_pgs_subtitle', 'eng'),
    track(4, 'ass', 'jpn'),
  ])
  film(runtime, dir, TEARS, 'Tears of Steel', 2012)
  const server = createHttpServer({ api: createApi(runtime), stream: createStream(runtime) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  )
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    runtime,
    url,
    owner,
    member,
    api: createClient({ baseUrl: url, token }),
    memberApi: createClient({ baseUrl: url, token: member.token }),
  }
}

const item = (id: number) => ({ type: 'movie' as const, id })

async function code(call: Promise<unknown>) {
  try {
    await call
  } catch (e) {
    if (e instanceof ApiError) return e.code
    throw e
  }
  throw new Error('expected the call to fail')
}

describe('playing', () => {
  test('direct play at home: the decision, the tracks, and a URL to the file', async () => {
    const { api } = await serve()
    const session = await api.playback.play({ params: item(SINTEL), body: {} })
    expect(session.decision).toMatchObject({
      method: 'direct-play',
      audio: { id: `fil_${SINTEL}:1`, action: 'copy' },
      subtitle: null,
    })
    expect(session).toMatchObject({ start: 0, duration: 100 })
    expect(session.url).toMatch(/^\/stream\/files\/[\w-]+\.fil_45745\.[\w-]+$/)
    const detail = await api.library.item({ params: item(SINTEL) })
    expect(detail.versions[0]).toMatchObject({
      playable: true,
      audio: [{ id: `fil_${SINTEL}:1`, language: 'en', default: true }],
    })
    expect(detail.item.playable).toBe(true)
    // a track or version that isn't this one's is refused
    expect(
      await code(api.playback.play({ params: item(SINTEL), body: { audioId: `fil_${TEARS}:1` } })),
    ).toBe('invalid')
    expect(
      await code(api.playback.play({ params: item(SINTEL), body: { versionId: `ver_${TEARS}` } })),
    ).toBe('not-found')
    expect(await code(api.playback.play({ params: item(1), body: {} }))).toBe('not-found')
  })

  test('a picture subtitle and styled ASS are burned in; each track says how it’d be sent', async () => {
    const { api } = await serve()
    const [srt, pgs, ass] = [2, 3, 4].map((i) => `fil_${SINTEL}:${i}`) as [string, string, string]
    const play = (subtitleId: string | null) =>
      api.playback.play({
        params: item(SINTEL),
        body: { subtitleId, profile: 'web-chromium' },
      })
    const plain = await play(srt)
    expect(plain.decision).toMatchObject({
      method: 'direct-play',
      subtitle: { id: srt, delivery: 'external' },
    })
    expect(plain.subtitles.map((t) => [t.id, t.delivery])).toEqual([
      [srt, 'external'],
      [pgs, 'burn-in'],
      [ass, 'burn-in'],
    ])
    expect(plain.subtitles[1]?.url).toBeNull()
    for (const id of [pgs, ass]) {
      const burnt = await play(id)
      expect(burnt.decision).toMatchObject({
        method: 'transcode',
        subtitle: { id, delivery: 'burn-in' },
      })
      expect(burnt.decision.reasons.map((r) => r.code)).toContain('subtitle.burnIn')
      expect(burnt.url).toMatch(/\/main\.m3u8$/)
    }
  })

  test('the file by byte ranges: 200, 206, a suffix, 416, If-Range and HEAD', async () => {
    const { api, url } = await serve()
    const { url: path } = await api.playback.play({ params: item(SINTEL), body: {} })
    const file = `${url}${path}`

    const whole = await fetch(file)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('accept-ranges')).toBe('bytes')
    expect(whole.headers.get('content-type')).toBe('video/mp4')
    expect(whole.headers.get('referrer-policy')).toBe('no-referrer')
    expect(whole.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await whole.arrayBuffer()).equals(BYTES)).toBe(true)
    const etag = whole.headers.get('etag') as string
    const lastModified = whole.headers.get('last-modified') as string

    const part = await fetch(file, { headers: { range: 'bytes=100-199' } })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe(`bytes 100-199/${SIZE}`)
    expect(part.headers.get('content-length')).toBe('100')
    expect(Buffer.from(await part.arrayBuffer()).equals(BYTES.subarray(100, 200))).toBe(true)

    const open = await fetch(file, { headers: { range: 'bytes=4000-' } })
    expect(open.headers.get('content-range')).toBe(`bytes 4000-4095/${SIZE}`)
    await open.arrayBuffer()
    const suffix = await fetch(file, { headers: { range: 'bytes=-10' } })
    expect(suffix.headers.get('content-range')).toBe(`bytes 4086-4095/${SIZE}`)
    expect(Buffer.from(await suffix.arrayBuffer()).equals(BYTES.subarray(4086))).toBe(true)

    const past = await fetch(file, { headers: { range: `bytes=${SIZE}-` } })
    expect(past.status).toBe(416)
    expect(past.headers.get('content-range')).toBe(`bytes */${SIZE}`)

    // several ranges: the whole file (§ 14.2 lets a server ignore Range)
    const several = await fetch(file, { headers: { range: 'bytes=0-1,5-6' } })
    expect(several.status).toBe(200)
    await several.arrayBuffer()

    for (const ok of [etag, lastModified]) {
      const r = await fetch(file, { headers: { range: 'bytes=0-9', 'if-range': ok } })
      expect(r.status).toBe(206)
      await r.arrayBuffer()
    }
    for (const stale of ['"0-0"', `W/${etag}`, 'Thu, 01 Jan 1970 00:00:00 GMT']) {
      const r = await fetch(file, { headers: { range: 'bytes=0-9', 'if-range': stale } })
      expect(r.status).toBe(200)
      await r.arrayBuffer()
    }

    const head = await fetch(file, { method: 'HEAD', headers: { range: 'bytes=10-19' } })
    expect(head.status).toBe(206)
    expect(head.headers.get('content-length')).toBe('10')
    expect((await fetch(file, { method: 'POST' })).status).toBe(405)
  })

  test('a token works only for its file, while its session lasts', async () => {
    const { api, memberApi, runtime, url, owner } = await serve()
    const session = await api.playback.play({ params: item(SINTEL), body: {} })
    const token = (session.url as string).slice('/stream/files/'.length)
    const [id, , sig] = token.split('.')
    const status = async (t: string) => {
      const r = await fetch(`${url}/stream/files/${t}`)
      await r.arrayBuffer()
      return r.status
    }
    expect(await status(token)).toBe(200)
    // another file, a changed signature, or nothing at all
    expect(await status(`${id}.fil_${TEARS}.${sig}`)).toBe(404)
    expect(await status(`${id}.fil_${SINTEL}.${(sig as string).replace(/^./, 'A')}x`)).toBe(404)
    expect(await status('nothing')).toBe(404)

    // someone else can't report on or end it
    expect(
      await code(
        memberApi.playback.progress({
          params: { id: session.id },
          body: { position: 5, paused: false },
        }),
      ),
    ).toBe('not-found')
    await api.playback.stop({ params: { id: session.id } })
    expect(await status(token)).toBe(404)
    expect(await code(api.playback.stop({ params: { id: session.id } }))).toBe('not-found')

    // signing the device out ends its sessions at once
    const again = await api.playback.play({ params: item(SINTEL), body: {} })
    expect(await status((again.url as string).slice('/stream/files/'.length))).toBe(200)
    const device = runtime.auth.devices.list(owner.id).find((d) => d.client === 'tvos')
    runtime.auth.devices.revoke(device?.id as string, { id: owner.id, name: OWNER.username }, meta)
    expect(runtime.playback.sessions()).toEqual([])
    expect(await status((again.url as string).slice('/stream/files/'.length))).toBe(404)
  })

  test('losing the movie library ends the person’s sessions and hides the titles', async () => {
    const { memberApi, runtime, owner, member, url } = await serve()
    const session = await memberApi.playback.play({ params: item(SINTEL), body: {} })
    // only `movies` exists yet, so the access is taken away in the table, as another library
    // in a later phase would leave it
    runtime.db.delete(schema.libraryAccess).run()
    runtime.db
      .insert(schema.libraryAccess)
      .values([
        { userId: owner.id, library: '*' },
        { userId: member.id, library: 'shows' },
      ])
      .run()
    runtime.events.emit({ topic: 'users.updated', ids: [member.id] })
    expect(runtime.playback.sessions()).toEqual([])
    const r = await fetch(`${url}${session.url}`)
    expect(r.status).toBe(404)
    expect(await code(memberApi.playback.play({ params: item(SINTEL), body: {} }))).toBe(
      'not-found',
    )
    expect(await code(memberApi.library.item({ params: item(SINTEL) }))).toBe('not-found')
    expect(await code(memberApi.playback.prefs({ params: item(SINTEL) }))).toBe('not-found')
  })
})

describe('watch state', () => {
  test('reports save the place; past 90% it’s watched, once, and Resume starts there', async () => {
    const { api, memberApi } = await serve()
    const session = await api.playback.play({ params: item(SINTEL), body: {} })
    expect(
      await api.playback.progress({
        params: { id: session.id },
        body: { position: 42, paused: false },
      }),
    ).toMatchObject({ watched: false })
    expect((await api.library.item({ params: item(SINTEL) })).item.progress).toBe(0.42)
    // each person's own
    expect((await memberApi.library.item({ params: item(SINTEL) })).item.progress).toBeNull()
    const resumed = await api.playback.play({ params: item(SINTEL), body: {} })
    expect(resumed.start).toBe(42)

    // a pause saves at once; past 90 seconds of 100 it's watched and the place is cleared
    expect(
      await api.playback.progress({
        params: { id: resumed.id },
        body: { position: 91, paused: true },
      }),
    ).toMatchObject({ watched: true })
    const watched = (await api.library.item({ params: item(SINTEL) })).item
    expect(watched).toMatchObject({ watched: true, progress: null })
    // the credits keep reporting: it isn't counted again
    expect(
      await api.playback.progress({
        params: { id: resumed.id },
        body: { position: 95, paused: false },
      }),
    ).toMatchObject({ watched: false })
  })

  test('played and unplayed, from the title’s menu', async () => {
    const { api, runtime } = await serve()
    await api.playback.itemProgress({ params: item(SINTEL), body: { position: 30 } })
    expect((await api.library.item({ params: item(SINTEL) })).item.progress).toBe(0.3)
    await api.playback.played({ params: item(SINTEL) })
    expect((await api.library.item({ params: item(SINTEL) })).item).toMatchObject({
      watched: true,
      progress: null,
    })
    await api.playback.played({ params: item(SINTEL) })
    const history = runtime.db.select().from(schema.watchHistory).get()
    expect(history).toMatchObject({ played: true, playCount: 2 })
    await api.playback.unplayed({ params: item(SINTEL) })
    expect((await api.library.item({ params: item(SINTEL) })).item.watched).toBe(false)
    expect(runtime.db.select().from(schema.watchHistory).all()).toEqual([])
  })

  test('the player’s picks are kept per person and title', async () => {
    const { api } = await serve()
    expect(await api.playback.prefs({ params: item(SINTEL) })).toEqual({
      versionId: null,
      audioId: null,
      subtitleId: null,
      subtitleOffsetMs: 0,
    })
    expect(
      await api.playback.setPrefs({
        params: item(SINTEL),
        body: { audioId: `fil_${SINTEL}:1`, subtitleOffsetMs: -250 },
      }),
    ).toMatchObject({ audioId: `fil_${SINTEL}:1`, subtitleOffsetMs: -250 })
    expect(
      await code(api.playback.setPrefs({ params: item(SINTEL), body: { versionId: 'ver_other' } })),
    ).toBe('invalid')
    // the pick is played next time
    const session = await api.playback.play({ params: item(SINTEL), body: {} })
    expect(session.decision.audio?.id).toBe(`fil_${SINTEL}:1`)
  })

  test('Next up: the next film in the collection, the first not yet watched', async () => {
    const { api } = await serve()
    expect((await api.playback.next({ params: item(SINTEL) })).item?.id).toBe(TEARS)
    // the last film has nothing after it
    expect((await api.playback.next({ params: item(TEARS) })).item).toBeNull()
    await api.playback.played({ params: item(TEARS) })
    // all watched after it: still the next one
    expect((await api.playback.next({ params: item(SINTEL) })).item?.id).toBe(TEARS)
  })

  test('a device’s reported profile is kept, and a report needs a device', async () => {
    const { api, runtime } = await serve()
    await api.playback.report({
      body: { base: 'web-chromium', containers: ['mp4', 'webm'], video: [{ codec: 'h264' }] },
    })
    expect(runtime.db.select().from(schema.deviceProfiles).all()).toHaveLength(1)
    expect(await code(api.playback.report({ body: { base: 'nothing-like-it' } }))).toBe('invalid')
  })
})
