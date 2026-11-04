// SPDX-License-Identifier: AGPL-3.0-only
// The player's routes in the mock (play.ts, B2) through the SDK's own client, against the real
// server's rules (packages/runtime's playback.ts): every answer exactly its contract schema; a
// session plays the clip it's handed from where the person left off, or waits without one; each
// of the toolbar's stream states; reports save the place on the film's own length and mark it
// watched at 90%; leaving ends the session; Now playing's Stop is heard and answered with who and
// why; what plays next is the collection's next unwatched film.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { NEXT_UP_S } from '@highsea-tv/client/player'
import { SEED, WATCHED_AT } from '@highsea-tv/mock/films'
import { MOCK_CLIP, STOP_AFTER_MS, STOPPED_BY } from '@highsea-tv/mock/play'
import type { ProtoState } from '@highsea-tv/mock/state'
import type { ApiError, HighseaClient } from '@highsea-tv/sdk'
import { parse, signedIn } from './fixtures/films-reads.ts'

const movie = { type: 'movie' as const, id: SEED.film.id }
const media = {
  clip: `/web/${MOCK_CLIP.clip}`,
  subtitles: `/web/${MOCK_CLIP.subtitles}`,
  duration: 52,
}

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('it answered')
}

const as = (stream: ProtoState['stream'], withMedia = true) =>
  signedIn({ state: { stream }, media: withMedia ? media : undefined })

const play = (a: HighseaClient, body = {}) => a.playback.play({ params: movie, body })

describe('a play session', () => {
  test('plays the clip directly, with text subtitles as WebVTT, in the contract’s shape', async () => {
    const a = await as('normal')
    const s = await play(a)
    expect(parse(routes.playback.play, s)).toStrictEqual(s)
    expect(s.decision.method).toBe('direct-play')
    expect(s.url).toBe(media.clip)
    expect(s.duration).toBe(media.duration)
    const text = s.subtitles.filter((t) => t.url)
    expect(text.length).toBeGreaterThan(0)
    for (const t of text) expect(t.url).toBe(media.subtitles)
  })

  test('without a clip it waits, as a first transcode does', async () => {
    const s = await play(await as('normal', false))
    expect(s.decision.method).toBe('transcode')
    expect(s.url).toBeNull()
    expect(s.subtitles.every((t) => t.url === null)).toBe(true)
  })

  test('starts where the person left off, on the clip’s length, or where asked', async () => {
    const a = await as('normal')
    const first = await play(a)
    expect(first.start).toBe(0)
    const item = (await a.library.item({ params: movie })).item
    const length = (item.runtimeMinutes ?? 0) * 60
    await a.playback.progress({ params: { id: first.id }, body: { position: 26, paused: false } })
    const again = await play(a)
    expect(again.start).toBeCloseTo(26, 5)
    const placed = (await a.library.item({ params: movie })).item
    expect(placed.position).toBeCloseTo(length / 2, 5)
    expect((await play(a, { start: 10 })).start).toBe(10)
  })

  test('each of the toolbar’s states', async () => {
    const preparing = await play(await as('preparing'))
    expect(preparing).toMatchObject({ url: null, decision: { method: 'transcode' } })
    const buffering = await play(await as('buffering'))
    expect(buffering).toMatchObject({ url: null, decision: { method: 'direct-play' } })
    const failed = await play(await as('failed'))
    expect(failed.decision.method).toBe('unplayable')
    expect(failed.decision.reasons.some((r) => r.kind === 'rejected')).toBe(true)
    const nextUp = await play(await as('next-up'))
    expect(nextUp.start).toBe(media.duration - NEXT_UP_S + 2)
    for (const s of [preparing, buffering, failed, nextUp])
      expect(parse(routes.playback.play, s)).toStrictEqual(s)
  })

  test('a version that isn’t the title’s is refused', async () => {
    const e = await caught(play(await as('normal'), { versionId: 'nope' }))
    expect(e.status).toBe(400)
  })
})

describe('reports and leaving', () => {
  test('at 90% of the clip the film is watched', async () => {
    const a = await as('normal')
    const s = await play(a)
    const r = await a.playback.progress({
      params: { id: s.id },
      body: { position: media.duration * WATCHED_AT, paused: false },
    })
    expect(parse(routes.playback.progress, r)).toStrictEqual(r)
    expect(r.watched).toBe(true)
    expect((await a.library.item({ params: movie })).item.watched).toBe(true)
  })

  test('leaving ends the session, and its reports are refused after', async () => {
    const a = await as('normal')
    const s = await play(a)
    await a.playback.stop({ params: { id: s.id } })
    const e = await caught(
      a.playback.progress({ params: { id: s.id }, body: { position: 3, paused: true } }),
    )
    expect(e.status).toBe(404)
    expect(e.message).toBe('That play session has ended.')
    expect((await caught(a.playback.stop({ params: { id: s.id } }))).status).toBe(404)
  })

  test('someone else’s session isn’t theirs', async () => {
    const a = await as('normal')
    const s = await play(a)
    const other = await signedIn({ media }, 'theo')
    const e = await caught(
      other.playback.progress({ params: { id: s.id }, body: { position: 3, paused: false } }),
    )
    expect(e.status).toBe(404)
  })

  test('Stop from Now playing is heard, and the report says who and why', async () => {
    const a = await as('stopped')
    const heard: { topic: string; ids?: string[] }[] = []
    const stop = a.events.subscribe((e) => heard.push(e as (typeof heard)[number]))
    const s = await play(a)
    expect(s.url).toBe(media.clip)
    const end = Date.now() + STOP_AFTER_MS + 1000
    while (!heard.some((e) => e.topic === 'playback.stopped')) {
      if (Date.now() > end) throw new Error('not heard')
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(heard.find((e) => e.topic === 'playback.stopped')?.ids).toEqual([s.id])
    const e = await caught(
      a.playback.progress({ params: { id: s.id }, body: { position: 3, paused: false } }),
    )
    expect(e.status).toBe(404)
    expect(e.details).toEqual({ reason: 'stopped', ...STOPPED_BY })
    stop()
  })

  test('the device’s report is taken', async () => {
    const a = await as('normal')
    expect(await a.playback.report({ body: { base: 'web-chromium' } })).toBeUndefined()
  })
})

describe('what plays next, and the previews', () => {
  test('the collection’s next unwatched film, and nothing after the last', async () => {
    const a = await as('normal')
    const c = await a.library.collection({ params: { id: SEED.collection.id }, query: {} })
    const ids = c.items.map((i) => i.id)
    expect(ids.length).toBeGreaterThan(1)
    const [first, second] = ids as [number, number]
    const next = await a.playback.next({ params: { type: 'movie', id: first } })
    expect(parse(routes.playback.next, next)).toStrictEqual(next)
    expect(next.item?.id).toBe(second)
    await a.playback.played({ params: { type: 'movie', id: second } })
    const after = await a.playback.next({ params: { type: 'movie', id: first } })
    expect(after.item?.id).toBe(ids[2] ?? second)
    const last = ids[ids.length - 1] as number
    expect((await a.playback.next({ params: { type: 'movie', id: last } })).item).toBeNull()
  })

  test('no previews are made, so the scrubber draws without them', async () => {
    const a = await as('normal')
    const t = await a.playback.trickplay({ params: movie, query: {} })
    expect(parse(routes.playback.trickplay, t)).toStrictEqual(t)
    expect(t.manifest).toBeNull()
  })
})
