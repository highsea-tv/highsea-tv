// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard widgets' services (HT-60): the network's sampled activity, and the weather from
// Open-Meteo, answered by the fake so nothing reaches the network.
import { describe, expect, test } from 'bun:test'
import { createFakeClock, silentLogger } from '@highsea-tv/core'
import { createNetworkActivity } from '../src/network-activity.ts'
import { conditionOf, createWeather, FORECAST_URL, PLACES_URL } from '../src/weather.ts'
import { createFakeWeather } from '../src/weather-fake.ts'

describe('the network’s activity', () => {
  function sampler() {
    const clock = createFakeClock()
    let torrents = { down: 0, up: 0 }
    const activity = createNetworkActivity({
      clock,
      torrents: () => torrents,
      counts: () => ({ downloads: 2, seeding: 3 }),
      streams: () => ({ local: 1, remote: 1 }),
    })
    const tick = (seconds = 1) => {
      clock.advance(seconds * 1000)
      activity.sample()
    }
    return { clock, activity, tick, set: (t: typeof torrents) => (torrents = t) }
  }

  test('turns the bytes sent to players into a rate, with the torrent client’s', () => {
    const { activity, tick, set } = sampler()
    set({ down: 5_000, up: 1_000 })
    activity.sent(3_000)
    activity.sent(1_000)
    tick()
    tick()
    const read = activity.read(10)
    expect(read.samples.map((s) => s.streams)).toEqual([4_000, 0])
    expect(read.samples[0]).toMatchObject({ down: 5_000, up: 1_000 })
    expect(read).toMatchObject({ minutes: 10, downloads: 2, seeding: 3, streams: { local: 1 } })
  })

  test('a read is the window asked for, averaged to at most 120 points', () => {
    const { activity, tick, set } = sampler()
    set({ down: 100, up: 0 })
    for (let i = 0; i < 3_600; i++) tick()
    expect(activity.read(60).samples).toHaveLength(120)
    expect(activity.read(10).samples).toHaveLength(120)
    expect(activity.read(1).samples).toHaveLength(60)
    expect(activity.read(60).samples.every((s) => s.down === 100)).toBe(true)
  })

  test('keeps an hour, no more', () => {
    const { activity, tick } = sampler()
    for (let i = 0; i < 4_000; i++) tick()
    // the hour's 3,600 samples, five a point
    expect(activity.read(120).samples).toHaveLength(120)
  })
})

describe('the weather', () => {
  function weather() {
    const clock = createFakeClock(Date.UTC(2026, 10, 18, 12))
    const fake = createFakeWeather(clock.now)
    return {
      clock,
      fake,
      service: createWeather({ fetch: fake.fetch, clock, logger: silentLogger }),
    }
  }

  test('reads Open-Meteo’s forecast into the widget’s shape, its codes as conditions', async () => {
    const { service, fake } = weather()
    const w = await service.read(38.71667, -9.13333)
    expect(w).toMatchObject({
      latitude: 38.72,
      longitude: -9.13,
      timeZone: 'Europe/Lisbon',
      stale: false,
      current: { condition: 'partly-cloudy', humidity: 72, wind: 14 },
    })
    expect(w.days).toHaveLength(7)
    expect(w.days[1]).toMatchObject({ day: '2026-11-19', condition: 'showers', rain: 70 })
    // the coordinates leave rounded to two decimals, about a kilometre
    const asked = new URL(fake.asked[0] ?? '')
    expect(`${asked.origin}${asked.pathname}`).toBe(FORECAST_URL)
    expect(asked.searchParams.get('latitude')).toBe('38.72')
    expect(asked.searchParams.get('longitude')).toBe('-9.13')
  })

  test('keeps a reading 15 minutes, and asks once for two widgets at once', async () => {
    const { service, fake, clock } = weather()
    await Promise.all([service.read(38.72, -9.14), service.read(38.72, -9.14)])
    expect(fake.asked).toHaveLength(1)
    clock.advance(14 * 60_000)
    await service.read(38.72, -9.14)
    expect(fake.asked).toHaveLength(1)
    clock.advance(2 * 60_000)
    await service.read(38.72, -9.14)
    expect(fake.asked).toHaveLength(2)
  })

  test('shows the last reading, marked stale, while Open-Meteo is down', async () => {
    const { service, fake, clock } = weather()
    const first = await service.read(38.72, -9.14)
    fake.down = true
    clock.advance(30 * 60_000)
    const later = await service.read(38.72, -9.14)
    expect(later).toMatchObject({ stale: true, updatedAt: first.updatedAt })
  })

  test('says it can’t be reached when there’s no reading to fall back on', async () => {
    const { service, fake } = weather()
    fake.down = true
    await expect(service.read(38.72, -9.14)).rejects.toMatchObject({ code: 'unavailable' })
  })

  test('finds places by name, with where each is', async () => {
    const { service, fake } = weather()
    expect(await service.places('lis')).toEqual([
      { name: 'Lisbon', detail: 'Lisbon, Portugal', latitude: 38.72, longitude: -9.13 },
      {
        name: 'Lisburn',
        detail: 'Northern Ireland, United Kingdom',
        latitude: 54.51,
        longitude: -6.04,
      },
    ])
    expect(await service.places('nowhere')).toEqual([])
    expect(fake.asked.every((u) => u.startsWith(PLACES_URL))).toBe(true)
  })

  test('names every WMO code it can be sent', () => {
    expect([0, 1, 2, 3, 45, 51, 61, 71, 80, 85, 95, 99].map(conditionOf)).toEqual([
      'clear',
      'clear',
      'partly-cloudy',
      'cloudy',
      'fog',
      'drizzle',
      'rain',
      'snow',
      'showers',
      'snow',
      'thunderstorm',
      'thunderstorm',
    ])
  })
})
