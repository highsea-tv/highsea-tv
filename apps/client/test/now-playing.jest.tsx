// SPDX-License-Identifier: AGPL-3.0-only
// What the system's Now Playing shows (packages/native/src/now-playing.ts, HT-58): the title and
// the line under it for a film and an episode, and the poster handed over as a file from the
// app's own image cache, loaded with the sign-in's header, never a URL with a token in it.
import { artworkFile, nowPlayingText, within } from '../../../packages/native/src/now-playing.ts'

const film = { item: { id: 1, title: 'Tears of Steel', year: 2012 } }
const episode = {
  item: { id: 2, title: 'Pilot', year: 2021 },
  episode: { show: { id: 9, title: 'The Lantern Keepers' }, code: 'S1, E1', title: 'Pilot' },
}

describe('Now Playing’s text', () => {
  test('a film is its title and its year', () => {
    expect(nowPlayingText(film)).toEqual({ title: 'Tears of Steel', artist: '2012' })
  })

  test('an episode is its show, then its code and title, as the player’s top bar has them', () => {
    expect(nowPlayingText(episode)).toEqual({
      title: 'The Lantern Keepers',
      artist: 'S1, E1 · Pilot',
    })
  })

  test('a film without a year has the title alone; nothing loaded yet has nothing', () => {
    expect(nowPlayingText({ item: { id: 1, title: 'Tears of Steel', year: null } })).toEqual({
      title: 'Tears of Steel',
    })
    expect(nowPlayingText(undefined)).toEqual({})
  })
})

/** A disk cache in memory, with what it was asked. */
function cache(ok = true, start: string[] = []) {
  const disk = new Set(start)
  const asked: { uri: string; headers?: Record<string, string> }[] = []
  return {
    asked,
    prefetch: async (uri: string, headers?: Record<string, string>) => {
      asked.push({ uri, headers })
      if (ok) disk.add(uri)
      return ok
    },
    path: async (uri: string) => (disk.has(uri) ? `/Caches/${disk.size}.jpg` : null),
  }
}

const poster = {
  uri: 'http://nas.local:3000/api/v1/items/1/art/poster',
  headers: { authorization: 'Bearer t' },
}

describe('Now Playing’s poster', () => {
  test('is fetched into the cache with the sign-in’s header, then handed over as a file', async () => {
    const c = cache()
    expect(await artworkFile(poster, c)).toBe('file:///Caches/1.jpg')
    expect(c.asked).toEqual([poster])
  })

  test('one the item page already drew comes from the disk, with no request', async () => {
    const c = cache(true, [poster.uri])
    expect(await artworkFile(poster, c)).toBe('file:///Caches/1.jpg')
    expect(c.asked).toEqual([])
  })

  test('a poster that won’t load, or none, leaves Now Playing without a picture', async () => {
    expect(await artworkFile(poster, cache(false))).toBeUndefined()
    expect(await artworkFile(undefined, cache())).toBeUndefined()
    const broken = { prefetch: async () => true, path: async () => Promise.reject(new Error('x')) }
    expect(await artworkFile(poster, broken)).toBeUndefined()
  })

  test('the film waits for a slow poster only so long', async () => {
    const never = new Promise<string | undefined>(() => {})
    expect(await within(never, 10)).toBeUndefined()
    expect(await within(Promise.resolve('file:///a.jpg'), 10)).toBe('file:///a.jpg')
  })
})
