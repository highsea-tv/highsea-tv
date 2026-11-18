// SPDX-License-Identifier: AGPL-3.0-only
// The network's whole activity for the dashboard's Network widget (HT-60): the torrent client's
// rates both ways, which the downloads service already samples a second at a time, and what the
// server sends to players, which nothing measured before. `/stream` counts the bytes it hands to
// each response (direct play, direct stream and transcodes alike) into `sent`, and a sample a
// second turns the count into a rate. An hour of samples stays in memory (the widget's longest
// setting); nothing is written to the database, so a restart starts the graph again.
import { type Clock, iso } from '@highsea-tv/core'
import { unref } from '@highsea-tv/core/timers'

/** One sample a second, and an hour of them: the Network widget's longest window. */
const STEP_MS = 1000
const KEEP = 3600
/** The most samples a read returns: one every five seconds over ten minutes. */
const POINTS = 120

type Sample = { at: number; down: number; up: number; streams: number }

export type NetworkActivityDeps = {
  clock: Clock
  /** The torrent client's rates now, bytes a second. */
  torrents(): { down: number; up: number }
  /** How many torrents download and seed now. */
  counts(): { downloads: number; seeding: number }
  /** How many streams play now, by where the player is. */
  streams(): { local: number; remote: number }
}

export function createNetworkActivity(deps: NetworkActivityDeps) {
  const samples: Sample[] = []
  let sent = 0
  let last = deps.clock.now()

  function sample() {
    const now = deps.clock.now()
    const seconds = Math.max(STEP_MS, now - last) / 1000
    const t = deps.torrents()
    samples.push({ at: now, down: t.down, up: t.up, streams: sent / seconds })
    if (samples.length > KEEP) samples.shift()
    sent = 0
    last = now
  }

  return {
    /** Bytes `/stream` just handed to a player. */
    sent(bytes: number) {
      sent += bytes
    },

    /** Samples a second until the returned function is called. */
    start() {
      last = deps.clock.now()
      const timer = setInterval(sample, STEP_MS)
      unref(timer)
      return () => clearInterval(timer)
    },

    /** Takes a sample now: for tests, which don't wait a second. */
    sample,

    /** The last `minutes`, averaged to at most 120 samples, and what's running now. */
    read(minutes = 10) {
      const since = deps.clock.now() - minutes * 60_000
      const shown = samples.filter((s) => s.at > since)
      const size = Math.max(1, Math.ceil(shown.length / POINTS))
      const out: { at: string; down: number; up: number; streams: number }[] = []
      for (let i = 0; i < shown.length; i += size) {
        const group = shown.slice(i, i + size)
        const mean = (k: 'down' | 'up' | 'streams') =>
          Math.round(group.reduce((n, s) => n + s[k], 0) / group.length)
        out.push({
          at: iso((group[group.length - 1] as Sample).at),
          down: mean('down'),
          up: mean('up'),
          streams: mean('streams'),
        })
      }
      return { minutes, samples: out, ...deps.counts(), streams: deps.streams() }
    },
  }
}

export type NetworkActivityService = ReturnType<typeof createNetworkActivity>
