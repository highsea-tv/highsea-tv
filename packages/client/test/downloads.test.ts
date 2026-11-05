// SPDX-License-Identifier: AGPL-3.0-only
// Downloads for offline (one-client-platform-b.md › B2): the seed's states, the order the list
// draws, a group's state, the store's simulation and the words, moved from the prototype's
// client/downloads.ts and offline-list.tsx.
import { describe, expect, test } from 'bun:test'
import type { ClientItem } from '@highsea-tv/api-contract'
import { createT } from '@highsea-tv/i18n'
import {
  createDownloads,
  downloadsMessages,
  entriesOf,
  filmSource,
  groupState,
  OFFLINE_DAYS,
  type Offline,
  type OfflineGroup,
  offlineOf,
  qualityName,
  readyLine,
  seedFilms,
  sizeOf,
  spaceLine,
  stateLine,
} from '../src/downloads/index.ts'

const t = createT(downloadsMessages)

const film = (id: number, title: string, runtimeMinutes = 10): ClientItem =>
  ({
    id,
    type: 'movie',
    title,
    runtimeMinutes,
    art: { poster: `/p/${id}`, backdrop: `/b/${id}` },
  }) as unknown as ClientItem

const films = [
  'Sintel',
  'Spring',
  'Tears of Steel',
  'Big Buck Bunny',
  'Agent 327',
  'Sprite Fright',
  'Elephants Dream',
].map((title, i) => film(i + 1, title))

const season: OfflineGroup = {
  kind: 'season',
  id: 'show:1',
  show: { id: 'show', title: 'The Lantern Keepers' },
  season: 1,
  title: 'Season 1',
  poster: null,
}

const episode = (n: number): Offline =>
  offlineOf(
    {
      id: `e${n}`,
      kind: 'episode',
      title: `Episode ${n}`,
      still: null,
      minutes: 40,
      caption: `S1, E${n}`,
      group: season,
    },
    'done',
  )

/** A clock the test moves by hand. */
function manualTimers() {
  const fns = new Set<() => void>()
  return {
    timers: {
      set: (f: () => void) => {
        fns.add(f)
        return f
      },
      clear: (h: unknown) => {
        fns.delete(h as () => void)
      },
    },
    step: () => {
      for (const f of fns) f()
    },
    running: () => fns.size,
  }
}

describe('the seed', () => {
  test('one of each state, from the films after the first, Home’s', () => {
    const seed = seedFilms('desktop', films)
    expect(seed.map((x) => [x.title, x.state])).toEqual([
      ['Spring', 'done'],
      ['Tears of Steel', 'downloading'],
      ['Big Buck Bunny', 'queued'],
      ['Agent 327', 'paused'],
      ['Sprite Fright', 'failed'],
      ['Elephants Dream', 'expired'],
    ])
    expect(seed[0]?.daysLeft).toBe(26)
    expect(seed[5]?.daysLeft).toBe(0)
  })

  test('the phone waits for Wi-Fi where the computer has paused', () => {
    expect(seedFilms('mobile', films)[3]?.state).toBe('waiting-wifi')
  })

  test('a short library seeds what it has', () => {
    expect(seedFilms('mobile', films.slice(0, 3)).length).toBe(2)
    expect(seedFilms('mobile', [])).toEqual([])
  })

  test('a film’s source: its id as a string, its backdrop for a still, its size by quality', () => {
    const x = filmSource(films[1] as ClientItem)
    expect(x).toMatchObject({ id: '2', kind: 'film', still: '/b/2', minutes: 10, group: null })
    expect(sizeOf(x, 'high')).toBe(300e6)
    expect(sizeOf(x, 'saver')).toBe(120e6)
    expect(sizeOf({ kind: 'song', minutes: 2 }, 'high')).toBe(4.8e6)
  })
})

describe('the list', () => {
  test('films stand alone; episodes gather under their season where the first is, in order', () => {
    const items = [episode(3), offlineOf(filmSource(films[1] as ClientItem), 'done'), episode(1)]
    const entries = entriesOf(items)
    expect(entries.map((e) => e.kind)).toEqual(['group', 'item'])
    const group = entries[0]
    expect(group?.kind === 'group' && group.items.map((x) => x.caption)).toEqual([
      'S1, E1',
      'S1, E3',
    ])
  })

  test('a group: all, part or none kept, and how far the part going has got', () => {
    const a = episode(1)
    const b = { ...episode(2), state: 'downloading' as const, progress: 0.5 }
    expect(groupState([a, b, undefined])).toMatchObject({
      done: 1,
      all: false,
      none: false,
      going: true,
    })
    expect(groupState([a, b]).progress).toBeCloseTo(0.75)
    expect(groupState([undefined]).none).toBe(true)
    expect(groupState([a]).all).toBe(true)
  })
})

describe('the store', () => {
  test('a download moves once a tick; when it’s done the next queued one starts', () => {
    const clock = manualTimers()
    const s = createDownloads({ timers: clock.timers })
    const stop = s.subscribe(() => {})
    expect(clock.running()).toBe(1)
    const a = filmSource(film(10, 'Short', 1))
    const b = filmSource(film(11, 'Next', 1))
    s.start([a, b])
    expect(s.get('10')?.state).toBe('downloading')
    expect(s.get('11')?.state).toBe('queued')
    for (let i = 0; i < 5; i++) clock.step()
    expect(s.get('10')).toMatchObject({ state: 'done', progress: 1, daysLeft: OFFLINE_DAYS })
    expect(s.get('11')?.state).toBe('downloading')
    stop()
    expect(clock.running()).toBe(0)
  })

  test('pause, resume, retry, renew and remove', () => {
    const s = createDownloads({ timers: manualTimers().timers })
    s.seed(seedFilms('desktop', films))
    s.pause('3')
    expect(s.get('3')?.state).toBe('paused')
    // the queued one starts while nothing downloads
    expect(s.get('4')?.state).toBe('downloading')
    s.resume('3')
    expect(s.get('3')?.state).toBe('queued')
    s.retry('6')
    expect(s.get('6')?.state).toBe('queued')
    s.renew('7')
    expect(s.get('7')).toMatchObject({ state: 'done', daysLeft: OFFLINE_DAYS })
    s.remove(['2', '7'])
    expect(s.get('2')).toBeUndefined()
    expect(s.snapshot().items.length).toBe(4)
  })

  test('starting again keeps what’s there, but a failed one starts afresh', () => {
    const s = createDownloads({ timers: manualTimers().timers })
    s.seed(seedFilms('desktop', films))
    s.start(filmSource(films[1] as ClientItem))
    expect(s.get('2')?.state).toBe('done')
    s.start(filmSource(films[5] as ClientItem))
    expect(s.get('6')?.state).toBe('queued')
  })

  test('the seed comes once, and what was started before it stays after it', () => {
    const s = createDownloads({ timers: manualTimers().timers })
    s.start(filmSource(films[2] as ClientItem))
    s.seed(seedFilms('desktop', films))
    s.seed([])
    const ids = s.snapshot().items.map((x) => x.id)
    expect(ids).toEqual(['2', '4', '5', '6', '7', '3'])
    expect(s.seeded()).toBe(true)
  })

  test('the quality chosen sizes new downloads', () => {
    const s = createDownloads({ timers: manualTimers().timers })
    s.setQuality('original')
    s.start(filmSource(film(9, 'Big', 2)))
    expect(s.get('9')).toMatchObject({ quality: 'original', bytes: 280e6 })
    expect(s.snapshot().quality).toBe('original')
  })
})

describe('the words', () => {
  test('what’s ready, leaving out what’s none', () => {
    const f = offlineOf(filmSource(films[1] as ClientItem), 'done')
    expect(readyLine([], t)).toBe('Nothing ready yet')
    expect(readyLine([f], t)).toBe('1 film ready')
    expect(readyLine([f, episode(1), episode(2)], t)).toBe('1 film and 2 episodes ready')
    const song = { ...episode(4), kind: 'song' as const }
    expect(readyLine([f, episode(1), song], t)).toBe('1 film, 1 episode and 1 song ready')
  })

  test('the space line', () => {
    const f = offlineOf(filmSource(films[1] as ClientItem), 'done')
    const s = spaceLine('mobile', [f], t)
    expect(s.line).toBe('1 film ready · 300 MB · 63.7 GB free on this phone')
    expect(s.fraction).toBeCloseTo(300e6 / 64e9)
  })

  test('each state’s line, as client-settings.md has them', () => {
    const base = offlineOf(filmSource(films[1] as ClientItem), 'done', { daysLeft: 26 })
    const at = (patch: Partial<Offline>) => stateLine({ ...base, ...patch }, 'Harbor', t)
    expect(at({})).toBe('300 MB · 1080p · plays offline for 26 more days')
    expect(at({ state: 'downloading', progress: 0.5, speed: 6.2e6 })).toBe(
      '6.2 MB/s · 150 MB to go',
    )
    expect(at({ state: 'paused', progress: 0.25 })).toBe('Paused · 75.0 MB of 300 MB')
    expect(at({ state: 'queued' })).toBe('Waiting to download · 300 MB · 1080p')
    expect(at({ state: 'waiting-wifi' })).toBe('Waiting for Wi-Fi · 300 MB · 1080p')
    expect(at({ state: 'failed' })).toBe('The download stopped when Harbor couldn’t be reached.')
    expect(at({ state: 'expired' })).toBe('Connect to Harbor to keep watching it.')
    expect(at({ state: 'expired', kind: 'song' })).toBe(
      'Connect to Harbor to keep listening to it.',
    )
  })

  test('a quality’s name: a film’s resolution, a song’s bit rate', () => {
    expect(qualityName({ kind: 'film', quality: 'saver' }, t)).toBe('720p')
    expect(qualityName({ kind: 'song', quality: 'original' }, t)).toBe('Lossless')
  })
})
