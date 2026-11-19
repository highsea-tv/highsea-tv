// SPDX-License-Identifier: AGPL-3.0-only
// Shuffle (HT-96): the order made once (Fisher–Yates), what goes in it, Next and Previous through
// it, and the one shuffle on the device, handed from item to item and ended on leaving.
import { afterEach, describe, expect, test } from 'bun:test'
import { shuffleUpNext } from '../src/player/index.ts'
import {
  canPlayAll,
  canShuffle,
  collectionFilms,
  currentShuffle,
  endShuffle,
  handOn,
  makeQueue,
  makeShuffle,
  playInOrder,
  queuePath,
  queueResumePath,
  releaseShuffle,
  showEpisodes,
  shuffleAt,
  shuffled,
  shuffleFor,
  shuffleNext,
  shufflePrevious,
  startShuffle,
} from '../src/shuffle/index.ts'

/** A seeded generator (mulberry32), so a test's order is the same every run. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

afterEach(() => endShuffle())

describe('shuffled', () => {
  test('holds every item once, and leaves the list it was given alone', () => {
    const xs = Array.from({ length: 50 }, (_, i) => i)
    const out = shuffled(xs, seeded(1))
    expect([...out].sort((a, b) => a - b)).toEqual(xs)
    expect(out).not.toEqual(xs)
    expect(xs[0]).toBe(0)
  })

  test('is uniform: each of 3 items lands in each place about a third of the time', () => {
    const random = seeded(7)
    const counts = [0, 0, 0].map(() => [0, 0, 0])
    const runs = 30_000
    for (let i = 0; i < runs; i++)
      shuffled([0, 1, 2], random).forEach((x, at) => {
        const row = counts[x] as number[]
        row[at] = (row[at] ?? 0) + 1
      })
    for (const row of counts)
      for (const n of row) expect(Math.abs(n / runs - 1 / 3)).toBeLessThan(0.02)
  })

  test('every one of the six orders of three comes up', () => {
    const random = seeded(3)
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(shuffled(['a', 'b', 'c'], random).join(''))
    expect(seen.size).toBe(6)
  })
})

describe('what goes in', () => {
  const ep = (id: number) => ({ id })
  test('a show: its seasons’ episodes, specials left out', () => {
    expect(
      showEpisodes([
        { number: 1, episodes: [ep(1), ep(2)] },
        { number: 2, episodes: [ep(3)] },
        { number: 0, episodes: [ep(9)] },
      ]),
    ).toEqual([1, 2, 3])
  })

  test('a show of only specials shuffles its specials', () => {
    expect(showEpisodes([{ number: 0, episodes: [ep(9), ep(8)] }])).toEqual([9, 8])
  })

  test('a collection: its films with a file, watched or not', () => {
    expect(
      collectionFilms([
        { id: 1, playable: true },
        { id: 2, playable: false },
        { id: 3, playable: true },
      ]),
    ).toEqual([1, 3])
  })

  test('a collection’s Play is offered with one or more', () => {
    expect(canPlayAll([])).toBe(false)
    expect(canPlayAll([7])).toBe(true)
  })

  test('offered with two or more', () => {
    expect(canShuffle([])).toBe(false)
    expect(canShuffle([1])).toBe(false)
    expect(canShuffle([1, 2])).toBe(true)
  })
})

describe('Next and Previous', () => {
  test('move through the order kept, and stop at either end', () => {
    const s = makeShuffle('movie', [1, 2, 3, 4], seeded(5))
    const seen: number[] = [s.ids[0] as number]
    let at = s
    for (;;) {
      const next = shuffleNext(at)
      if (next === null) break
      seen.push(next)
      at = shuffleAt(at, next) ?? at
    }
    expect(seen).toEqual(s.ids)
    expect(shuffleNext(at)).toBeNull()
    expect(shufflePrevious(at)).toBe(s.ids[2] as number)
    expect(shufflePrevious(s)).toBeNull()
  })

  test('an item twice in the list comes once', () => {
    expect(makeShuffle('movie', [1, 1, 2], seeded(2)).ids).toHaveLength(2)
  })

  test('an item that isn’t in it moves nothing', () => {
    expect(shuffleAt(makeShuffle('movie', [1, 2]), 9)).toBeNull()
  })

  test('each item plays from its start, marked as a shuffle’s', () => {
    expect(queuePath('episode', 12)).toBe('/play/episode/12/start?queue=1')
    expect(queuePath('movie', 603)).toBe('/play/603/start?queue=1')
  })
})

describe('a collection’s Play', () => {
  test('keeps the order the page lists, once each, and isn’t shuffled', () => {
    const q = makeQueue('movie', [30, 10, 20, 10])
    expect(q.ids).toEqual([30, 10, 20])
    expect(q.shuffled).toBe(false)
    expect(makeShuffle('movie', [1, 2]).shuffled).toBe(true)
  })

  test('resumes its first film, and the player there finds the queue; the rest start at the beginning', () => {
    expect(playInOrder('movie', [30, 10, 20])).toBe(queueResumePath('movie', 30))
    expect(queueResumePath('movie', 30)).toBe('/play/30?queue=1')
    const at = shuffleFor('movie', 30, true)
    expect(at?.at).toBe(0)
    expect(at && shuffleNext(at)).toBe(10)
    expect(queuePath('movie', 10)).toBe('/play/10/start?queue=1')
  })

  test('stops after the last film', () => {
    playInOrder('movie', [30, 10])
    const last = shuffleFor('movie', 10, true)
    expect(last && shuffleNext(last)).toBeNull()
    expect(last && shufflePrevious(last)).toBe(30)
  })

  test('nothing to play starts nothing', () => {
    expect(playInOrder('movie', [])).toBeNull()
    expect(currentShuffle()).toBeNull()
  })
})

describe('the shuffle on the device', () => {
  test('starts at its first item, and the player there finds it', () => {
    const to = startShuffle('episode', [10, 11, 12], seeded(9))
    const s = currentShuffle()
    expect(s).not.toBeNull()
    expect(to).toBe(queuePath('episode', s?.ids[0] as number))
    expect(shuffleFor('episode', s?.ids[0] as number, true)?.at).toBe(0)
  })

  test('nothing to shuffle starts nothing', () => {
    expect(startShuffle('movie', [])).toBeNull()
    expect(currentShuffle()).toBeNull()
  })

  test('a player not opened from a shuffle, or of another kind, isn’t in it', () => {
    startShuffle('episode', [10, 11], seeded(1))
    const first = currentShuffle()?.ids[0] as number
    expect(shuffleFor('episode', first, false)).toBeNull()
    expect(shuffleFor('movie', first, true)).toBeNull()
  })

  test('handed on to the next item, the player closing behind it doesn’t end it', () => {
    startShuffle('movie', [1, 2, 3], seeded(4))
    const ids = currentShuffle()?.ids as number[]
    const one = shuffleFor('movie', ids[0] as number, true)
    if (!one) throw new Error('the first item isn’t in the shuffle')
    handOn(one)
    releaseShuffle(one)
    const two = shuffleFor('movie', ids[1] as number, true)
    expect(two?.at).toBe(1)
    // the order is the one made when Shuffle was pressed
    expect(two?.ids).toEqual(ids)
  })

  test('closing the player ends it, so the next player isn’t in it', () => {
    startShuffle('movie', [1, 2], seeded(4))
    const ids = currentShuffle()?.ids as number[]
    const one = shuffleFor('movie', ids[0] as number, true)
    releaseShuffle(one)
    expect(currentShuffle()).toBeNull()
    expect(shuffleFor('movie', ids[1] as number, true)).toBeNull()
  })
})

describe('Next up in a shuffle', () => {
  test('an episode: its title, with its place as the line', () => {
    expect(
      shuffleUpNext({
        id: 5,
        title: 'Chernobyl',
        still: 's.jpg',
        episode: { code: 'S1, E3', title: 'Open Wide, O Earth' },
      }),
    ).toEqual({
      kind: 'shuffle',
      id: 5,
      title: 'Open Wide, O Earth',
      line: 'S1, E3',
      still: 's.jpg',
      season: null,
    })
  })

  test('in a collection’s Play it reads as plain Next up', () => {
    expect(shuffleUpNext({ id: 1, title: 'Alien', still: null }, 'queue')?.kind).toBe('queue')
  })

  test('a film: its title; at the end, nothing', () => {
    expect(shuffleUpNext({ id: 1, title: 'Alien', still: null })?.title).toBe('Alien')
    expect(shuffleUpNext(null)).toBeNull()
  })
})
