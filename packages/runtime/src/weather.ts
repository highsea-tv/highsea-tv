// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard's Weather widget (HT-60): Open-Meteo's forecast and place search, asked by the
// server, never the browser (the owner's answer of 2026-11-17 at HT-47). Nothing is asked until an
// admin gives the widget a place: the routes are only called with one.
//
// - Forecast: https://open-meteo.com/en/docs (`/v1/forecast` with `current`, `daily` and
//   `timezone=auto`, metric units by default; errors are a 400 with `{ error, reason }`).
// - Places: https://open-meteo.com/en/docs/geocoding-api (`/v1/search`; fewer than two letters
//   find nothing; empty fields are left out).
// - Terms: https://open-meteo.com/en/terms (free for non-commercial use, under 10,000 calls a
//   day, 5,000 an hour and 600 a minute). The data is CC BY 4.0 and the widget carries the link
//   https://open-meteo.com/en/licence asks for ("Weather data by Open-Meteo.com").
// - How long a reading is kept: 15 minutes. Open-Meteo's current conditions are 15-minutely
//   model data (the forecast docs' "Current Weather"), so asking sooner gets the same answer; one
//   place shown all day is 96 calls, far under the limits. When Open-Meteo can't be reached the
//   last reading is answered with `stale`, so the widget shows it with its age.
// - Coordinates are rounded to two decimals (about a kilometre) before they leave the server: the
//   owner's answer, and Open-Meteo's own log may keep them (its terms › privacy).
import { AppError, type Clock, type Fetch, iso, type Logger } from '@highsea-tv/core'

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const PLACES_URL = 'https://geocoding-api.open-meteo.com/v1/search'

const FRESH_MS = 15 * 60_000
/** The places' readings kept: more than any dashboard shows, few enough to never grow. */
const KEEP = 16
const TIMEOUT_MS = 10_000

type Condition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'showers'
  | 'thunderstorm'
  | 'snow'

/** The WMO codes of the forecast docs' table, grouped as the widget's icons are. */
export function conditionOf(code: number): Condition {
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 95) return 'thunderstorm'
  return 'cloudy'
}

/** Two decimals: about a kilometre. */
export const roundCoordinate = (n: number) => Math.round(n * 100) / 100

export type WeatherReading = {
  latitude: number
  longitude: number
  timeZone: string
  updatedAt: string
  stale: boolean
  current: {
    temperature: number
    feelsLike: number
    condition: Condition
    wind: number
    humidity: number
  }
  days: { day: string; high: number; low: number; condition: Condition; rain: number }[]
}

type Forecast = {
  timezone?: string
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    weather_code?: number
  }
  daily?: {
    time?: string[]
    weather_code?: (number | null)[]
    temperature_2m_max?: (number | null)[]
    temperature_2m_min?: (number | null)[]
    precipitation_probability_max?: (number | null)[]
  }
}

type PlaceHit = {
  name?: string
  latitude?: number
  longitude?: number
  country?: string
  admin1?: string
}

export function createWeather(deps: { fetch: Fetch; clock: Clock; logger: Logger }) {
  const log = deps.logger.child('weather')
  const kept = new Map<string, { reading: WeatherReading; at: number }>()
  const asking = new Map<string, Promise<WeatherReading>>()

  async function ask(url: URL): Promise<unknown> {
    const res = await deps.fetch(url.toString(), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`)
    return res.json()
  }

  function readingOf(f: Forecast, latitude: number, longitude: number): WeatherReading {
    const c = f.current
    if (!c || typeof c.temperature_2m !== 'number') throw new Error('No current conditions')
    const d = f.daily ?? {}
    const n = (x: number | null | undefined) => (typeof x === 'number' ? x : 0)
    return {
      latitude,
      longitude,
      timeZone: f.timezone ?? 'UTC',
      updatedAt: iso(deps.clock.now()),
      stale: false,
      current: {
        temperature: c.temperature_2m,
        feelsLike: n(c.apparent_temperature ?? c.temperature_2m),
        condition: conditionOf(n(c.weather_code)),
        wind: n(c.wind_speed_10m),
        humidity: n(c.relative_humidity_2m),
      },
      days: (d.time ?? []).map((day, i) => ({
        day,
        high: n(d.temperature_2m_max?.[i]),
        low: n(d.temperature_2m_min?.[i]),
        condition: conditionOf(n(d.weather_code?.[i])),
        rain: n(d.precipitation_probability_max?.[i]),
      })),
    }
  }

  async function fetchReading(latitude: number, longitude: number) {
    const url = new URL(FORECAST_URL)
    url.searchParams.set('latitude', String(latitude))
    url.searchParams.set('longitude', String(longitude))
    url.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    )
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    )
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '7')
    return readingOf((await ask(url)) as Forecast, latitude, longitude)
  }

  return {
    /** The weather at a place: kept for 15 minutes, and the last reading while Open-Meteo is away. */
    async read(lat: number, lon: number): Promise<WeatherReading> {
      const latitude = roundCoordinate(lat)
      const longitude = roundCoordinate(lon)
      const key = `${latitude},${longitude}`
      const known = kept.get(key)
      if (known && deps.clock.now() - known.at < FRESH_MS) return known.reading
      // one request at a time for a place, however many widgets ask
      const pending = asking.get(key)
      if (pending) return pending
      const run = fetchReading(latitude, longitude)
        .then((reading) => {
          kept.delete(key)
          kept.set(key, { reading, at: deps.clock.now() })
          if (kept.size > KEEP) kept.delete(kept.keys().next().value as string)
          return reading
        })
        .catch((e: Error) => {
          log.warn('Open-Meteo didn’t answer', { error: e.message })
          if (known) return { ...known.reading, stale: true }
          throw new AppError('unavailable', 'Open-Meteo can’t be reached right now.')
        })
        .finally(() => asking.delete(key))
      asking.set(key, run)
      return run
    },

    /** Up to five places by name, in `language` where Open-Meteo has it. */
    async places(name: string, language = 'en') {
      const url = new URL(PLACES_URL)
      url.searchParams.set('name', name)
      url.searchParams.set('count', '5')
      url.searchParams.set('language', language)
      url.searchParams.set('format', 'json')
      let body: { results?: PlaceHit[] }
      try {
        body = (await ask(url)) as { results?: PlaceHit[] }
      } catch (e) {
        log.warn('Open-Meteo’s place search didn’t answer', { error: (e as Error).message })
        throw new AppError('unavailable', 'Open-Meteo’s place search can’t be reached right now.')
      }
      return (body.results ?? []).flatMap((p) =>
        p.name && typeof p.latitude === 'number' && typeof p.longitude === 'number'
          ? [
              {
                name: p.name,
                detail: [p.admin1, p.country].filter(Boolean).join(', '),
                latitude: roundCoordinate(p.latitude),
                longitude: roundCoordinate(p.longitude),
              },
            ]
          : [],
      )
    },
  }
}

export type WeatherService = ReturnType<typeof createWeather>
