// SPDX-License-Identifier: AGPL-3.0-only
// Open-Meteo's forecast and place search answered in process (`HIGHSEA_WEATHER_FAKE=1`, the tests
// and the sweeps), so nothing reaches the network. A mild, changeable week by the sea in November,
// as HT-47's drafts drew it; any other host is refused, so a stray request fails loudly. The
// answers have the shape of the documented ones (https://open-meteo.com/en/docs and
// https://open-meteo.com/en/docs/geocoding-api).
import type { Fetch } from '@highsea-tv/core'
import { FORECAST_URL, PLACES_URL } from './weather.ts'

const WEEK = [
  { high: 18, low: 12, code: 2, rain: 20 },
  { high: 17, low: 13, code: 80, rain: 70 },
  { high: 16, low: 11, code: 63, rain: 90 },
  { high: 17, low: 10, code: 3, rain: 30 },
  { high: 19, low: 11, code: 0, rain: 5 },
  { high: 20, low: 12, code: 0, rain: 0 },
  { high: 18, low: 13, code: 2, rain: 15 },
]

export const FAKE_PLACES = [
  {
    name: 'Lisbon',
    admin1: 'Lisbon',
    country: 'Portugal',
    latitude: 38.71667,
    longitude: -9.13333,
  },
  {
    name: 'Lisburn',
    admin1: 'Northern Ireland',
    country: 'United Kingdom',
    latitude: 54.5097,
    longitude: -6.03737,
  },
  { name: 'Oslo', admin1: 'Oslo', country: 'Norway', latitude: 59.91273, longitude: 10.74609 },
]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export type FakeWeather = {
  fetch: Fetch
  /** Every URL asked, in order. */
  asked: string[]
  /** While true, Open-Meteo is down: every request is a 503. */
  down: boolean
}

export function createFakeWeather(now: () => number = () => Date.now()): FakeWeather {
  const fake: FakeWeather = {
    asked: [],
    down: false,
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString())
      fake.asked.push(url.toString())
      if (fake.down) return json({ error: true, reason: 'Service unavailable' }, 503)
      const base = `${url.origin}${url.pathname}`
      if (base === FORECAST_URL) {
        const start = new Date(now())
        const hour = start.getUTCHours()
        const warmth = (1 + Math.cos(((hour - 15) / 24) * 2 * Math.PI)) / 2
        const today = WEEK[0] as (typeof WEEK)[number]
        const temperature = Math.round((today.low + (today.high - today.low) * warmth) * 10) / 10
        const days = WEEK.map((_, i) =>
          new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i))
            .toISOString()
            .slice(0, 10),
        )
        return json({
          latitude: Number(url.searchParams.get('latitude')),
          longitude: Number(url.searchParams.get('longitude')),
          timezone: 'Europe/Lisbon',
          utc_offset_seconds: 0,
          current: {
            time: start.toISOString().slice(0, 16),
            interval: 900,
            temperature_2m: temperature,
            apparent_temperature: temperature - 1,
            relative_humidity_2m: 72,
            wind_speed_10m: 14,
            weather_code: today.code,
          },
          daily: {
            time: days,
            weather_code: WEEK.map((d) => d.code),
            temperature_2m_max: WEEK.map((d) => d.high),
            temperature_2m_min: WEEK.map((d) => d.low),
            precipitation_probability_max: WEEK.map((d) => d.rain),
          },
        })
      }
      if (base === PLACES_URL) {
        const name = (url.searchParams.get('name') ?? '').toLowerCase()
        const results = FAKE_PLACES.filter(
          (p) => name.length >= 2 && p.name.toLowerCase().startsWith(name),
        )
        // the geocoder leaves `results` out when nothing matches
        return json(
          results.length ? { results, generationtime_ms: 0.4 } : { generationtime_ms: 0.2 },
        )
      }
      throw new Error(`The weather fake doesn’t answer ${url.host}`)
    },
  }
  return fake
}
