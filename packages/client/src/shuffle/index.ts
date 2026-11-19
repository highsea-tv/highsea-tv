// SPDX-License-Identifier: AGPL-3.0-only
// Shuffle and a collection's Play (player.md › Shuffle and Play in order; HT-96): a show's
// episodes or a collection's films played one after another, in a random order or in the
// collection's own. The order is made once, when Shuffle or Play is pressed, and kept on this
// device for that sitting, so Next and Previous move through it and nothing comes twice; after
// the last it stops. Leaving the player ends it. It lives on the client, in memory, since the
// server holds no queues for video; each item is a title the player already plays, at its own
// address, with `?queue=1` so a player opened any other way never follows a stale order.
//
// The video players hold one item at a time: expo-video's VideoPlayer swaps its source with
// `replace()` and has no queue of its own (https://docs.expo.dev/versions/latest/sdk/video/), and
// the web's <video> plays one `src` (https://html.spec.whatwg.org/multipage/media.html). So, as
// Next up already does, the next item takes the player's place in the history.
import type { ClientEpisode, ClientItem } from '@highsea-tv/api-contract'

export type ShuffleKind = 'episode' | 'movie'

export type Shuffle = {
  kind: ShuffleKind
  /** What's played, in the order made when Shuffle was pressed. */
  ids: number[]
  /** Where in `ids` the player is. */
  at: number
  /** Shuffled (Shuffle), or in the order the page lists them (a collection's Play). */
  shuffled: boolean
}

/**
 * A uniform shuffle (Fisher–Yates, as Durstenfeld wrote it: Knuth, The Art of Computer
 * Programming, vol. 2, § 3.4.2, Algorithm P), into a new array. `random` returns [0, 1), as
 * Math.random does; the tests pass their own.
 */
export function shuffled<T>(xs: readonly T[], random: () => number = Math.random): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

/**
 * A show's episodes to shuffle: every one the page lists, which are those with a file (the server
 * lists what's on disk), specials left out unless the show has only specials. Watched ones are
 * in: shuffle is mostly for watching again.
 */
export function showEpisodes(
  seasons: readonly { number: number; episodes: readonly Pick<ClientEpisode, 'id'>[] }[],
): number[] {
  const of = (special: boolean) =>
    seasons.filter((s) => (s.number === 0) === special).flatMap((s) => s.episodes.map((e) => e.id))
  const regular = of(false)
  return regular.length ? regular : of(true)
}

/** A collection's films to shuffle: those with a file, watched or not. */
export const collectionFilms = (items: readonly Pick<ClientItem, 'id' | 'playable'>[]) =>
  items.filter((m) => m.playable).map((m) => m.id)

/** Whether a page offers Shuffle: two or more to play, or there's nothing to shuffle. */
export const canShuffle = (ids: readonly number[]) => ids.length > 1

/** Whether a collection offers Play: one film or more to play. */
export const canPlayAll = (ids: readonly number[]) => ids.length > 0

/** A new shuffle of `ids`, at its first. */
export const makeShuffle = (
  kind: ShuffleKind,
  ids: readonly number[],
  random: () => number = Math.random,
): Shuffle => ({ kind, ids: shuffled([...new Set(ids)], random), at: 0, shuffled: true })

/** A queue of `ids` in the order given (a collection's Play), at its first. */
export const makeQueue = (kind: ShuffleKind, ids: readonly number[]): Shuffle => ({
  kind,
  ids: [...new Set(ids)],
  at: 0,
  shuffled: false,
})

/** The item after this one, or null at the end: it stops, it doesn't go round again. */
export const shuffleNext = (s: Shuffle): number | null => s.ids[s.at + 1] ?? null

/** The item before this one, or null at the first. */
export const shufflePrevious = (s: Shuffle): number | null =>
  s.at > 0 ? (s.ids[s.at - 1] ?? null) : null

/** The shuffle moved to `id`, or null when it isn't one of its items. */
export function shuffleAt(s: Shuffle, id: number): Shuffle | null {
  const at = s.ids.indexOf(id)
  return at < 0 ? null : { ...s, at }
}

const playPath = (kind: ShuffleKind, id: number) =>
  kind === 'episode' ? `/play/episode/${id}` : `/play/${id}`

/** The player at an item of the queue: from its start, never its resume point. */
export const queuePath = (kind: ShuffleKind, id: number) => `${playPath(kind, id)}/start?queue=1`

/**
 * The player at a queue's first item from where the person left off, as plain Play opens it: a
 * collection's Play resumes its first film; the films after it start at their beginning.
 */
export const queueResumePath = (kind: ShuffleKind, id: number) => `${playPath(kind, id)}?queue=1`

// ---------------------------------------------------------------------------------------------
// The one shuffle playing on this device, in memory: one person plays at a time on a device, and
// switching profiles leaves the player, which ends it.

let current: Shuffle | null = null

/** Starts a shuffle and returns the player's address for its first item, or null if empty. */
export function startShuffle(
  kind: ShuffleKind,
  ids: readonly number[],
  random: () => number = Math.random,
): string | null {
  const s = makeShuffle(kind, ids, random)
  const first = s.ids[0]
  if (first === undefined) return null
  current = s
  return queuePath(kind, first)
}

/**
 * Starts a queue in the order given (a collection's Play) and returns the player's address for
 * its first item, resumed where the person left off, or null if empty.
 */
export function playInOrder(kind: ShuffleKind, ids: readonly number[]): string | null {
  const s = makeQueue(kind, ids)
  const first = s.ids[0]
  if (first === undefined) return null
  current = s
  return queueResumePath(kind, first)
}

/**
 * The shuffle the player at `id` is part of, moved to it: null when the player wasn't opened from
 * one (`inQueue` false), none is playing, or `id` isn't in it.
 */
export function shuffleFor(kind: ShuffleKind, id: number, inQueue: boolean): Shuffle | null {
  if (!inQueue || !current || current.kind !== kind) return null
  const moved = shuffleAt(current, id)
  if (moved) current = moved
  return moved
}

/**
 * Hands the shuffle on to the next item's player, as a new object, so the player closing behind
 * it (`releaseShuffle`) doesn't end it.
 */
export function handOn(s: Shuffle) {
  current = { ...s }
}

/**
 * The player of `s`'s item closed: the shuffle ends, unless it was handed on to the next item.
 * Covers every way out of the player, the browser's Back and a swipe among them.
 */
export function releaseShuffle(s: Shuffle | null) {
  if (s && current === s) current = null
}

/** Ends the shuffle: the person left the player. */
export function endShuffle() {
  current = null
}

/** The shuffle playing now, for the tests. */
export const currentShuffle = () => current
