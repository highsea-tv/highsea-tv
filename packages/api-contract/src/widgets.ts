// SPDX-License-Identifier: AGPL-3.0-only
// What the dashboard's newer widgets read (HT-60, drafted in HT-47): the network's whole activity
// (the torrents both ways and the streams sent to players, sampled in memory), and the weather
// from Open-Meteo, asked by the server for a place an admin chose and cached. All staff only,
// like the dashboard they draw.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, errors, IsoDate, IsoDay, json } from './common.ts'

const WIDGETS = `${API_PREFIX}/widgets`

// ---------------------------------------------------------------- network

export const NetworkSample = z
  .object({
    at: IsoDate,
    /** The torrent client's rates, bytes a second. */
    down: z.number(),
    up: z.number(),
    /** What the server sent to players (direct play, direct stream and transcodes), bytes a second. */
    streams: z.number(),
  })
  .openapi('NetworkSample')

export const NetworkActivity = z
  .object({
    /** The window asked for, in minutes. */
    minutes: z.number().int(),
    /** Oldest first, each the average of the seconds up to it; at most 120. */
    samples: z.array(NetworkSample),
    /** Torrents downloading and seeding now. */
    downloads: z.number().int(),
    seeding: z.number().int(),
    /** Streams playing now, by where their player is. */
    streams: z.object({ local: z.number().int(), remote: z.number().int() }),
  })
  .openapi('NetworkActivity')

// ---------------------------------------------------------------- weather

/** What the sky is doing: the WMO weather codes Open-Meteo answers with, grouped. */
export const WEATHER_CONDITIONS = [
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'showers',
  'thunderstorm',
  'snow',
] as const
export const WeatherCondition = z.enum(WEATHER_CONDITIONS)

export const Weather = z
  .object({
    /** The coordinates asked, rounded as they were sent. */
    latitude: z.number(),
    longitude: z.number(),
    /** The place's own time zone, as Open-Meteo resolved it. */
    timeZone: z.string(),
    /** When Open-Meteo answered. */
    updatedAt: IsoDate,
    /** True when Open-Meteo couldn't be reached and this is the last reading. */
    stale: z.boolean(),
    /** Degrees Celsius, km/h and percent; the widget writes them in its own units. */
    current: z.object({
      temperature: z.number(),
      feelsLike: z.number(),
      condition: WeatherCondition,
      wind: z.number(),
      humidity: z.number(),
    }),
    /** Today first, on the place's own calendar. `rain` is the chance of it, 0 to 100. */
    days: z.array(
      z.object({
        day: IsoDay,
        high: z.number(),
        low: z.number(),
        condition: WeatherCondition,
        rain: z.number(),
      }),
    ),
  })
  .openapi('Weather')

export const WeatherPlaceResult = z
  .object({
    name: z.string(),
    /** The region and country. */
    detail: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  })
  .openapi('WeatherPlaceResult')

const Latitude = z.coerce.number<number>().min(-90).max(90)
const Longitude = z.coerce.number<number>().min(-180).max(180)

export const widgets = {
  network: createRoute({
    method: 'get',
    path: `${WIDGETS}/network`,
    tags: ['Dashboard'],
    summary: 'The network’s activity: downloads, uploads and streams',
    description:
      'Kept in memory a second at a time for an hour, and averaged to at most 120 samples.',
    ...access('staff'),
    request: {
      query: z.object({
        minutes: z.coerce.number<number>().int().min(1).max(60).optional().openapi({
          description: '10 when absent',
        }),
      }),
    },
    responses: {
      200: json(NetworkActivity, 'The activity'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  weather: createRoute({
    method: 'get',
    path: `${WIDGETS}/weather`,
    tags: ['Dashboard'],
    summary: 'The weather at a place, from Open-Meteo',
    description:
      'The server asks Open-Meteo with the coordinates rounded to two decimals and keeps the answer for 15 minutes. When Open-Meteo can’t be reached the last reading comes back with `stale`.',
    ...access('staff'),
    request: { query: z.object({ latitude: Latitude, longitude: Longitude }) },
    responses: {
      200: json(Weather, 'The weather'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'unavailable'),
    },
  }),
  places: createRoute({
    method: 'get',
    path: `${WIDGETS}/weather/places`,
    tags: ['Dashboard'],
    summary: 'Places by name, from Open-Meteo’s place search',
    description: 'What’s typed is sent to Open-Meteo’s geocoding service.',
    ...access('staff'),
    request: {
      query: z.object({
        name: z.string().trim().min(2).max(100),
        language: z
          .string()
          .regex(/^[a-z]{2}$/)
          .optional(),
      }),
    },
    responses: {
      200: json(z.array(WeatherPlaceResult), 'Up to five places'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'unavailable'),
    },
  }),
} as const

export type NetworkActivity = z.infer<typeof NetworkActivity>
export type NetworkSample = z.infer<typeof NetworkSample>
export type Weather = z.infer<typeof Weather>
export type WeatherCondition = z.infer<typeof WeatherCondition>
export type WeatherPlaceResult = z.infer<typeof WeatherPlaceResult>
