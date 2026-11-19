// SPDX-License-Identifier: AGPL-3.0-only
// MusicBrainz and the Cover Art Archive (Phase 5 D, ADR 0065): their answers mapped from the
// recordings (test/fixtures/musicbrainz/README.md: Blur's Parklife, Pink Floyd's The Wall), one
// request a second with highsea's User-Agent, cached for 30 days, a 404 kept, and the cached
// answer serving when MusicBrainz is down. No network.
import { afterEach, describe, expect, test } from 'bun:test'
import { createFakeClock, silentLogger } from '@highsea-tv/core'
import { albumKindOf, MUSICBRAINZ_FRESH_MS } from '../src/index.ts'
import { createMusicBrainzClient, musicBrainzUserAgent } from '../src/musicbrainz/client.ts'
import { createReplayFetch } from '../src/replay.ts'
import { setup } from './helpers.ts'

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})
const open = async (options: Parameters<typeof setup>[0] = {}) => {
  const t = await setup({ key: false, ...options })
  cleanups.push(t.cleanup)
  return t
}

const BLUR = 'ba853904-ae25-4ebb-89d6-c44cfbd71bd2'
const PARKLIFE_RELEASE = '23a46e92-b629-4869-94f6-ff984ea317c5'
const PARKLIFE = '67461c8e-d864-3910-9bf4-39e44357aac9'
const PINK_FLOYD = '83d91898-7763-47d7-b03b-b92132375c47'
const THE_WALL = 'f2026101-945b-3d05-9ef4-aa718fc3feef'
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

const musicRequests = (t: { fetch: { requests: string[] } }) =>
  t.fetch.requests.filter((r) => r.includes('/ws/2/') || r.includes('/release-group/'))

describe('MusicBrainz’s answers, mapped', () => {
  test('an artist, a release with its label, a release group with its kind, date and cover', async () => {
    const t = await open()
    const blur = await t.metadata.music.artist(BLUR)
    expect(blur).toMatchObject({ id: BLUR, name: 'Blur', sortName: 'Blur' })
    expect(blur?.genres[0]).toBe('Alternative Rock')
    const release = await t.metadata.music.release(PARKLIFE_RELEASE)
    expect(release).toMatchObject({
      title: 'Parklife',
      date: '1994-04-25',
      releaseGroupId: PARKLIFE,
      label: 'Parlophone',
    })
    const group = await t.metadata.music.releaseGroup(PARKLIFE)
    expect(group).toMatchObject({
      title: 'Parklife',
      kind: 'album',
      firstReleaseDate: '1994-04-25',
      artistId: BLUR,
    })
    expect(group?.genres[0]).toBe('Britpop')
    // the Cover Art Archive's front cover, its 500-pixel thumbnail, over https
    expect(await t.metadata.music.cover(PARKLIFE)).toMatch(
      /^https:\/\/coverartarchive\.org\/release\/.+-500\.jpg$/,
    )
    const wall = await t.metadata.music.releaseGroup(THE_WALL)
    expect(wall).toMatchObject({ title: 'The Wall', firstReleaseDate: '1979-11-30' })
    expect((await t.metadata.music.artist(PINK_FLOYD))?.sortName).toBe('Pink Floyd')
  })

  test('kinds as Plexamp groups them: a soundtrack or compilation first, then EP and single', () => {
    expect(albumKindOf('Album', ['Soundtrack'])).toBe('soundtrack')
    expect(albumKindOf('Album', ['Compilation', 'Live'])).toBe('compilation')
    expect(albumKindOf('EP', [])).toBe('ep')
    expect(albumKindOf('Single')).toBe('single')
    expect(albumKindOf('Album', ['Live'])).toBe('album')
    expect(albumKindOf(null)).toBe('album')
  })

  test('an id MusicBrainz doesn’t know is kept as nothing, and not asked again for 30 days', async () => {
    const t = await open()
    expect(await t.metadata.music.artist(UNKNOWN)).toBeNull()
    expect(await t.metadata.music.artist(UNKNOWN)).toBeNull()
    expect(musicRequests(t)).toHaveLength(1)
    t.clock.advance(MUSICBRAINZ_FRESH_MS)
    expect(await t.metadata.music.artist(UNKNOWN)).toBeNull()
    expect(musicRequests(t)).toHaveLength(2)
  })

  test('something that isn’t an id is never sent', async () => {
    const t = await open()
    expect(await t.metadata.music.artist('Blur')).toBeNull()
    expect(await t.metadata.music.releaseGroup('../artist/x')).toBeNull()
    expect(musicRequests(t)).toHaveLength(0)
  })
})

describe('MusicBrainz’s rules', () => {
  test('one request a second, each with highsea’s User-Agent and nothing of the owner’s', async () => {
    const clock = createFakeClock()
    const seen: { at: number; agent: string | null }[] = []
    const replay = createReplayFetch({
      onRequest: (_url, init) => {
        seen.push({ at: clock.now(), agent: new Headers(init?.headers).get('user-agent') })
        return undefined
      },
    })
    const client = createMusicBrainzClient({
      fetch: replay,
      clock,
      logger: silentLogger,
      version: '0.4.7',
      sleep: async (ms) => clock.advance(ms),
    })
    await Promise.all([
      client.lookup('artist', BLUR),
      client.lookup('release-group', PARKLIFE),
      client.lookup('artist', PINK_FLOYD),
    ])
    expect(seen.map((s) => s.at - (seen[0]?.at ?? 0))).toEqual([0, 1000, 2000])
    expect(new Set(seen.map((s) => s.agent))).toEqual(
      new Set(['highsea/0.4.7 ( https://highsea.tv )']),
    )
    expect(musicBrainzUserAgent('1.2.3')).toBe('highsea/1.2.3 ( https://highsea.tv )')
  })

  test('a 503 is waited out and asked again', async () => {
    let refused = 0
    const t = await open({
      onRequest: (url) => {
        if (url.pathname.includes(BLUR) && refused < 1) {
          refused++
          return new Response('slow down', { status: 503, headers: { 'retry-after': '3' } })
        }
        return undefined
      },
    })
    expect((await t.metadata.music.artist(BLUR))?.name).toBe('Blur')
    expect(t.waits).toContain(3000)
  })

  test('when MusicBrainz is down, the cached answer serves and it rests a while', async () => {
    let down = false
    const t = await open({
      onRequest: (url) => {
        if (down && url.hostname === 'musicbrainz.org') throw new TypeError('fetch failed')
        return undefined
      },
    })
    expect((await t.metadata.music.artist(BLUR))?.name).toBe('Blur')
    down = true
    t.clock.advance(MUSICBRAINZ_FRESH_MS)
    // stale, MusicBrainz down: the cached answer still serves
    expect((await t.metadata.music.artist(BLUR))?.name).toBe('Blur')
    const before = musicRequests(t).length
    // resting: not asked at all, and an id never cached is simply unknown
    expect(await t.metadata.music.artist(PINK_FLOYD)).toBeNull()
    expect(musicRequests(t)).toHaveLength(before)
  })
})
