// SPDX-License-Identifier: AGPL-3.0-only
// The drafted routes (one-client-platform-b.md › B3) through the SDK's own client, answered by the
// mock from its state (kinds.ts and profiles.ts): every answer exactly its contract schema; a
// show's season marked; an episode read, played and finished through the films' `{type}` routes;
// Home's and Search's other kinds; music, the queue and playlists; and the account's profiles,
// with Theo's PIN, a wrong one, the fifth in a row resting him, the most an account may have and
// the account's own. Public info lists the drafted sources, which the real server doesn't.
import { describe, expect, test } from 'bun:test'
import { CLIENT_SOURCES, isFilmRow, MAX_PROFILES, routes } from '@highsea-tv/api-contract'
import { createMock } from '@highsea-tv/mock/mock'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { ApiError, createClient } from '@highsea-tv/sdk'
import { parse, signedIn } from './fixtures/films-reads.ts'

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('it answered')
}
/** The value, or a failed test saying what was missing. */
const need = <T>(x: T | undefined | null, what = 'a value'): T => {
  if (x === undefined || x === null) throw new Error(`no ${what}`)
  return x
}
const detailsOf = (e: ApiError) => e.details as Record<string, unknown> | undefined

describe('the drafted routes in the mock', () => {
  test('every answer is exactly its schema', async () => {
    const a = await signedIn()
    const r = routes
    const shows = await a.shows.list()
    expect(shows.length).toBeGreaterThan(0)
    const show = await a.shows.show({ params: { id: need(shows[0]).id } })
    const music = await a.music.library()
    const album = need(music.albums[0])
    const artist = need(music.artists[0])
    const lists = await a.playlists.list()
    const answers: [{ responses: Record<number, unknown> }, unknown][] = [
      [r.shows.list, shows],
      [r.shows.show, show],
      [r.music.library, music],
      [r.music.songs, await a.music.songs()],
      [r.music.album, await a.music.album({ params: { id: album.id } })],
      [r.music.artist, await a.music.artist({ params: { id: artist.id } })],
      [
        r.music.queue,
        await a.music.queue({ body: { source: { album: album.id }, shuffle: false } }),
      ],
      [r.playlists.list, lists],
      [r.playlists.get, await a.playlists.get({ params: { id: need(lists[0]).id } })],
      [r.profiles.list, await a.profiles.list()],
    ]
    for (const [route, value] of answers) expect(parse(route, value)).toStrictEqual(value)
  })

  test('public info lists shows, music and profiles', async () => {
    const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
    const info = await createClient({
      baseUrl: 'http://192.168.1.20:3000',
      fetch,
    }).system.publicInfo()
    for (const s of CLIENT_SOURCES) expect(info.sources).toContain(s)
  })
})

describe('shows and episodes', () => {
  test('a season marked watched marks each of its episodes', async () => {
    const a = await signedIn()
    const first = need((await a.shows.list())[0], 'show')
    const before = await a.shows.show({ params: { id: first.id } })
    const season = need(before.seasons.find((s) => s.number > 0))
    await a.shows.watched({
      params: { id: first.id },
      body: { season: season.number, watched: true },
    })
    const after = await a.shows.show({ params: { id: first.id } })
    const marked = need(after.seasons.find((s) => s.number === season.number))
    expect(marked.episodes.every((e) => e.watched)).toBe(true)
    await a.shows.watched({ params: { id: first.id }, body: { season: null, watched: false } })
    const cleared = await a.shows.show({ params: { id: first.id } })
    expect(
      cleared.seasons
        .filter((s) => s.number > 0)
        .flatMap((s) => s.episodes)
        .some((e) => e.watched),
    ).toBe(false)
  })

  test('an unknown show, or a season it hasn’t, is 404', async () => {
    const a = await signedIn()
    expect((await caught(a.shows.show({ params: { id: 1 } }))).status).toBe(404)
    const first = need((await a.shows.list())[0], 'show')
    const e = await caught(
      a.shows.watched({ params: { id: first.id }, body: { season: 99, watched: true } }),
    )
    expect(e.status).toBe(404)
  })

  test('an episode reads, plays and finishes through the films’ routes', async () => {
    const a = await signedIn()
    const first = need((await a.shows.list())[0], 'show')
    const show = await a.shows.show({ params: { id: first.id } })
    const episode = need(need(show.seasons.find((s) => s.number > 0)).episodes[0])
    const params = { type: 'episode' as const, id: episode.id }

    const d = await a.library.item({ params })
    expect(parse(routes.library.item, d)).toStrictEqual(d)
    expect(d.item.type).toBe('episode')
    expect(d.episode?.show.id).toBe(first.id)
    expect(d.versions.length).toBeGreaterThan(0)

    const s = await a.playback.play({ params, body: {} })
    const done = await a.playback.progress({
      params: { id: s.id },
      body: { position: s.duration ?? 0, paused: false },
    })
    expect(done.watched).toBe(true)
    const marked = await a.shows.show({ params: { id: first.id } })
    const again = marked.seasons.flatMap((x) => x.episodes).find((e) => e.id === episode.id)
    expect(again?.watched).toBe(true)

    await a.playback.unplayed({ params })
    expect((await a.library.item({ params })).item.watched).toBe(false)
    expect((await caught(a.library.item({ params: { type: 'episode', id: 1 } }))).status).toBe(404)
  })
})

describe('Home and Search', () => {
  test('Home has episodes on Continue watching, Next up after it, and shows’ and music’s rows', async () => {
    const a = await signedIn()
    const rows = await a.home.sections({ query: { client: 'tvos' } })
    const ids = rows.map((r) => r.id)
    const cont = rows.find((r) => r.id === 'continue')
    if (cont && isFilmRow(cont)) expect(cont.items.some((i) => i.type === 'episode')).toBe(true)
    if (ids.includes('next-up')) expect(ids.indexOf('next-up')).toBe(ids.indexOf('continue') + 1)
    const layouts = rows.map((r) => r.layout)
    expect(layouts).toContain('shows')
    expect(layouts).toContain('music')
  })

  test('Search finds shows and music with the films', async () => {
    const a = await signedIn()
    const first = need((await a.shows.list())[0], 'show')
    const found = await a.library.search({ query: { query: first.title } })
    expect(found.sections[0]?.kind).toBe('shows')
    const music = await a.music.library()
    const byAlbum = await a.library.search({ query: { query: need(music.albums[0]).title } })
    expect(byAlbum.sections.map((s) => s.kind)).toContain('albums')
  })
})

describe('music and playlists', () => {
  test('the queue is an album in order, or shuffled with the same songs', async () => {
    const a = await signedIn()
    const album = need((await a.music.library()).albums[0])
    const d = await a.music.album({ params: { id: album.id } })
    const inOrder = await a.music.queue({ body: { source: { album: album.id }, shuffle: false } })
    expect(inOrder.map((q) => q.id)).toEqual(d.songs.map((s) => s.id))
    const shuffled = await a.music.queue({ body: { source: { album: album.id }, shuffle: true } })
    expect(shuffled.map((q) => q.id).sort()).toEqual(d.songs.map((s) => s.id).sort())
    const tracks = await a.music.tracks({
      query: {
        ids: d.songs
          .slice(0, 2)
          .map((s) => s.id)
          .join(','),
      },
    })
    expect(tracks.map((q) => q.id)).toEqual(d.songs.slice(0, 2).map((s) => s.id))
  })

  test('a playlist is made, renamed, added to, reordered, emptied and deleted', async () => {
    const a = await signedIn()
    const songs = (await a.music.songs()).slice(0, 3).map((s) => s.id)
    const made = await a.playlists.create({ body: { name: 'Late', songs: songs.slice(0, 1) } })
    expect(made.name).toBe('Late')
    const id = made.id
    await a.playlists.rename({ params: { id }, body: { name: 'Later' } })
    await a.playlists.add({ params: { id }, body: { songs: songs.slice(1) } })
    let d = await a.playlists.get({ params: { id } })
    expect(d.playlist.name).toBe('Later')
    expect(d.songs.map((s) => s.id)).toEqual(songs)
    const entries = d.songs.map((s) => s.entry).reverse()
    await a.playlists.reorder({ params: { id }, body: { entries } })
    d = await a.playlists.get({ params: { id } })
    expect(d.songs.map((s) => s.id)).toEqual([...songs].reverse())
    await a.playlists.remove({ params: { id, entry: need(d.songs[0]).entry } })
    expect((await a.playlists.get({ params: { id } })).songs).toHaveLength(2)
    await a.playlists.delete({ params: { id } })
    expect((await a.playlists.list()).some((p) => p.id === id)).toBe(false)
  })
})

describe('profiles', () => {
  test('every account starts with the prototype’s four, its own first, Theo’s with a PIN', async () => {
    const a = await signedIn()
    const p = await a.profiles.list()
    expect(p.profiles.map((x) => x.name)).toEqual(['Ines', 'Theo', 'Ruth', 'Kids'])
    expect(p.profiles[0]?.main).toBe(true)
    expect(p.profiles.find((x) => x.name === 'Theo')?.hasPin).toBe(true)
    expect(JSON.stringify(p)).not.toContain('2580')
    expect(p.current).toBe('p-ines')
    expect(p.max).toBe(MAX_PROFILES)
  })

  test('Theo’s PIN: a wrong one is 403, the right one switches, and the change is shared', async () => {
    const mock = createMock(memoryStorage())
    const a = await signedIn({ mock })
    const other = await signedIn({ mock })
    const wrong = await caught(
      a.profiles.choose({ params: { id: 'p-theo' }, body: { pin: '1111' } }),
    )
    expect(wrong.status).toBe(403)
    expect(detailsOf(wrong)).toEqual({ field: 'pin', reason: 'wrong-pin' })
    expect(wrong.message).toBe('That isn’t Theo’s PIN. Try again.')
    const none = await caught(a.profiles.choose({ params: { id: 'p-theo' }, body: {} }))
    expect(none.status).toBe(403)
    const chosen = await a.profiles.choose({ params: { id: 'p-theo' }, body: { pin: '2580' } })
    expect(chosen.current).toBe('p-theo')
    expect((await other.profiles.list()).current).toBe('p-theo')
    // the one watching needs no PIN, and one without a PIN needs none
    expect((await a.profiles.choose({ params: { id: 'p-theo' }, body: {} })).current).toBe('p-theo')
    expect((await a.profiles.choose({ params: { id: 'p-ruth' }, body: {} })).current).toBe('p-ruth')
  })

  test('the fifth wrong PIN in a row rests the profile for a minute', async () => {
    const a = await signedIn()
    const choose = (pin: string) => a.profiles.choose({ params: { id: 'p-theo' }, body: { pin } })
    for (let i = 0; i < 4; i++) expect((await caught(choose('0000'))).status).toBe(403)
    const rest = await caught(choose('0000'))
    expect(rest.status).toBe(429)
    expect(detailsOf(rest)).toEqual({ reason: 'rate-limited', retryAfter: 60 })
    // resting, even the right PIN waits
    expect((await caught(choose('2580'))).status).toBe(429)
  })

  test('adding stops at the most, the account’s own can’t go, and a PIN is four digits', async () => {
    const a = await signedIn()
    const made = await a.profiles.create({ body: { name: 'Ada', tone: 'danger' } })
    expect(made).toEqual({ id: made.id, name: 'Ada', tone: 'danger', hasPin: false, main: false })
    await a.profiles.create({ body: { name: 'Bo', tone: 'info' } })
    const full = await caught(a.profiles.create({ body: { name: 'Cy', tone: 'info' } }))
    expect(full.status).toBe(409)
    expect((await caught(a.profiles.delete({ params: { id: 'p-ines' } }))).status).toBe(409)
    expect((await caught(a.profiles.delete({ params: { id: 'nope' } }))).status).toBe(404)

    const pinned = await a.profiles.update({ params: { id: made.id }, body: { pin: '1234' } })
    expect(pinned.hasPin).toBe(true)
    expect(
      (await caught(a.profiles.update({ params: { id: made.id }, body: { pin: '12' } }))).status,
    ).toBe(400)
    const off = await a.profiles.update({
      params: { id: made.id },
      body: { pin: null, name: 'Ada L' },
    })
    expect(off).toMatchObject({ name: 'Ada L', hasPin: false })

    await a.profiles.delete({ params: { id: made.id } })
    expect((await a.profiles.list()).profiles).toHaveLength(MAX_PROFILES - 1)
  })
})
