// SPDX-License-Identifier: AGPL-3.0-only
// What the Network and Weather widgets show in the prototype, drafted in HT-47 and answered as
// `widgets.network` and `widgets.weather` since HT-60 (admin/dashboard.ts): the network's activity
// with streams beside the torrents' rates, and the weather. Made from the time alone, never from a
// network call, so the same minute always draws the same picture and the widgets move as the clock
// does.

/** One sample of the network's activity: bytes a second, each way and to the players. */
export type ActivitySample = {
  /** When, in ms. */
  at: number
  /** Torrents, coming in. */
  down: number
  /** Torrents, going out. */
  up: number
  /** Playback sent to clients on the LAN. */
  local: number
  /** Playback sent to clients away from home. */
  remote: number
}

export type NetworkActivity = {
  /** Oldest first, one every `ACTIVITY_STEP` seconds. */
  samples: ActivitySample[]
  /** How many torrents are downloading and seeding now. */
  downloads: number
  seeding: number
  /** How many streams play now, by where the client is. */
  streams: { local: number; remote: number }
}

/** What the reviewer picks: a usual evening, everything at once, or nothing at all. */
export type ActivityPattern = 'mixed' | 'busy' | 'idle'

/** Seconds between samples, as the mock's speeds are kept. */
export const ACTIVITY_STEP = 10

const MB = 1_000_000
const MINUTE = 60_000

/** A number from 0 to 1 that is always the same for the same `n`. */
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/** Noise that drifts rather than jumps: eased between one value a `period` and the next. */
function drift(at: number, period: number, seed: number) {
  const x = at / period
  const i = Math.floor(x)
  const f = x - i
  const ease = f * f * (3 - 2 * f)
  return noise(i + seed) * (1 - ease) + noise(i + 1 + seed) * ease
}

/** Where `at` is in a cycle of `minutes`, from 0 to 1. */
const phase = (at: number, minutes: number) => (at % (minutes * MINUTE)) / (minutes * MINUTE)

/** 1 between `from` and `to` of the cycle, easing in and out over `edge`. */
function between(p: number, from: number, to: number, edge = 0.03) {
  if (p < from - edge || p > to + edge) return 0
  if (p < from) return (p - (from - edge)) / edge
  if (p > to) return (to + edge - p) / edge
  return 1
}

/** The streams playing at a time: each a session with its own start, end and bitrate. */
const SESSIONS = [
  // Sintel in 4K on the living room's Apple TV, played directly (38 Mbps)
  { where: 'local', rate: 4.8 * MB, from: 0.02, to: 0.58 },
  // Tears of Steel on a phone away from home, transcoded to 7.6 Mbps
  { where: 'remote', rate: 0.95 * MB, from: 0.2, to: 0.74 },
  // Big Buck Bunny in a browser at home (9.1 Mbps)
  { where: 'local', rate: 1.14 * MB, from: 0.82, to: 0.97 },
] as const

function sample(at: number, pattern: ActivityPattern): ActivitySample {
  if (pattern === 'idle') return { at, down: 0, up: 0, local: 0, remote: 0 }
  // downloads come in bursts: a 4K grab, a pause while nothing is wanted, then a smaller one
  const d = phase(at, 13)
  const grabbing =
    pattern === 'busy' ? 1 : Math.max(between(d, 0.04, 0.4), between(d, 0.72, 0.9) * 0.45)
  const down = grabbing * (17 + 7 * drift(at, 25_000, 1)) * MB
  // seeding never quite stops while something is in the queue, and rises after an import
  const u = phase(at, 17)
  const seedingNow = pattern === 'busy' ? 1 : 0.25 + 0.75 * between(u, 0.3, 0.85, 0.08)
  const up = seedingNow * (0.6 + 2.2 * drift(at, 40_000, 7)) * MB
  // a stream's bitrate wobbles a little around its average
  const p = phase(at, 11)
  let local = 0
  let remote = 0
  SESSIONS.forEach((x, i) => {
    const on = pattern === 'busy' ? 1 : between(p, x.from, x.to, 0.01)
    const rate = on * x.rate * (0.9 + 0.2 * drift(at, 15_000, 20 + i))
    if (x.where === 'local') local += rate
    else remote += rate
  })
  return { at, down, up, local, remote }
}

/** The last `minutes` of the network's activity up to `now`, and what's running at `now`. */
export function networkActivity(
  now: number,
  minutes = 10,
  pattern: ActivityPattern = 'mixed',
): NetworkActivity {
  const step = ACTIVITY_STEP * 1000
  const last = Math.floor(now / step) * step
  const count = (minutes * 60) / ACTIVITY_STEP
  const samples = Array.from({ length: count + 1 }, (_, i) =>
    sample(last - (count - i) * step, pattern),
  )
  const p = phase(last, 11)
  const playing = SESSIONS.filter((x) => pattern === 'busy' || between(p, x.from, x.to, 0) === 1)
  const latest = samples[samples.length - 1] as ActivitySample
  return {
    samples,
    downloads: pattern === 'idle' || latest.down === 0 ? 0 : latest.down > 12 * MB ? 3 : 1,
    seeding: pattern === 'idle' ? 0 : 2,
    streams:
      pattern === 'idle'
        ? { local: 0, remote: 0 }
        : {
            local: playing.filter((x) => x.where === 'local').length,
            remote: playing.filter((x) => x.where === 'remote').length,
          },
  }
}

// ---------------------------------------------------------------- weather

/** What the sky is doing, as the forecast services' weather codes group. */
export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'showers'
  | 'thunderstorm'
  | 'snow'

export type Weather = {
  /** The place the owner chose, as they named it. */
  place: string
  /** When the forecast was fetched, in ms. */
  updatedAt: number
  /** Degrees Celsius; the widget writes them in the server's units. */
  current: {
    temperature: number
    feelsLike: number
    condition: WeatherCondition
    /** km/h. */
    wind: number
    /** 0 to 100. */
    humidity: number
  }
  /** The next hours, soonest first. */
  hours: { at: number; temperature: number; condition: WeatherCondition; rain: number }[]
  /** Today first. `rain` is the chance of it, 0 to 100. */
  days: { at: number; high: number; low: number; condition: WeatherCondition; rain: number }[]
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A mild, changeable week by the sea in November: Lisbon's, where the seeded server keeps its time. */
const WEEK: { high: number; low: number; condition: WeatherCondition; rain: number }[] = [
  { high: 18, low: 12, condition: 'partly-cloudy', rain: 20 },
  { high: 17, low: 13, condition: 'showers', rain: 70 },
  { high: 16, low: 11, condition: 'rain', rain: 90 },
  { high: 17, low: 10, condition: 'cloudy', rain: 30 },
  { high: 19, low: 11, condition: 'clear', rain: 5 },
  { high: 20, low: 12, condition: 'clear', rain: 0 },
  { high: 18, low: 13, condition: 'partly-cloudy', rain: 15 },
]

/** The seeded server's weather at `now`: the conditions, the next hours and the week. */
export function weather(now: number): Weather {
  const hour = Math.floor(now / HOUR) * HOUR
  const today = WEEK[0] as (typeof WEEK)[number]
  // warmest mid-afternoon, coolest before dawn, in the server's own time zone (Lisbon is UTC in winter)
  const at = (t: number) => {
    const h = new Date(t).getUTCHours()
    const warmth = (1 + Math.cos(((h - 15) / 24) * 2 * Math.PI)) / 2
    return Math.round(today.low + (today.high - today.low) * warmth)
  }
  const temperature = at(now)
  return {
    place: 'Lisbon',
    updatedAt: hour + 12 * MINUTE > now ? hour - 18 * MINUTE : hour + 12 * MINUTE,
    current: {
      temperature,
      feelsLike: temperature - 1,
      condition: today.condition,
      wind: 14,
      humidity: 72,
    },
    hours: Array.from({ length: 12 }, (_, i) => {
      const t = hour + (i + 1) * HOUR
      const late = i >= 6
      return {
        at: t,
        temperature: at(t),
        condition: late ? ('showers' as const) : today.condition,
        rain: late ? 60 : 15,
      }
    }),
    days: WEEK.map((d, i) => ({ at: now + i * DAY, ...d })),
  }
}
