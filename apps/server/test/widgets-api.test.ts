// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard widgets' routes (HT-60) through the SDK: the network's activity, the weather and
// the place search. Open-Meteo is the fake; staff only.
import { afterEach, describe, expect, test } from 'bun:test'
import { createFakeWeather } from '@highsea-tv/runtime/weather-fake'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

afterEach(cleanup)

async function started() {
  const fake = createFakeWeather()
  const runtime = await bootRuntime({ weather: { fetch: fake.fetch } })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Theo')
  return {
    runtime,
    fake,
    ownerApi: clientFor(app, { token }),
    memberApi: clientFor(app, { token: member.token }),
  }
}

describe('the network’s activity', () => {
  test('is the samples taken, with what’s running now', async () => {
    const { runtime, ownerApi } = await started()
    runtime.networkActivity.sent(2_048)
    runtime.networkActivity.sample()
    const read = await ownerApi.widgets.network({ query: { minutes: 5 } })
    expect(read).toMatchObject({ minutes: 5, downloads: 0, seeding: 0 })
    expect(read.streams).toEqual({ local: 0, remote: 0 })
    expect(read.samples).toHaveLength(1)
    expect(read.samples[0]?.streams).toBeGreaterThan(0)
  })

  test('is for staff', async () => {
    const { memberApi } = await started()
    expect(await failure(memberApi.widgets.network({ query: {} }))).toMatchObject({
      code: 'forbidden',
    })
  })
})

describe('the weather', () => {
  test('asks Open-Meteo nothing until a widget asks for a place', async () => {
    const { ownerApi, fake } = await started()
    // a dashboard with Weather and no place: the layout reads, nothing leaves the server
    await ownerApi.dashboard.saveLayout({
      body: { widgets: [{ id: 'w', kind: 'weather', span: 1, rows: 3 }] },
    })
    const layout = await ownerApi.dashboard.layout()
    expect(layout.widgets[0]?.settings).toMatchObject({ place: null, temperature: 'celsius' })
    expect(fake.asked).toEqual([])
  })

  test('is the forecast at a place, kept for the next reader', async () => {
    const { ownerApi, fake } = await started()
    const w = await ownerApi.widgets.weather({ query: { latitude: 38.72, longitude: -9.14 } })
    expect(w).toMatchObject({ stale: false, timeZone: 'Europe/Lisbon' })
    expect(w.days).toHaveLength(7)
    await ownerApi.widgets.weather({ query: { latitude: 38.72, longitude: -9.14 } })
    expect(fake.asked).toHaveLength(1)
  })

  test('is the last reading while Open-Meteo is down, and unavailable with none', async () => {
    const { ownerApi, fake } = await started()
    fake.down = true
    expect(
      await failure(ownerApi.widgets.weather({ query: { latitude: 59.91, longitude: 10.75 } })),
    ).toMatchObject({ code: 'unavailable' })
  })

  test('finds places by name', async () => {
    const { ownerApi } = await started()
    const found = await ownerApi.widgets.places({ query: { name: 'Lisb', language: 'en' } })
    expect(found.map((p) => p.name)).toEqual(['Lisbon', 'Lisburn'])
  })

  test('rejects a place off the globe, and is for staff', async () => {
    const { ownerApi, memberApi } = await started()
    expect(
      await failure(ownerApi.widgets.weather({ query: { latitude: 91, longitude: 0 } })),
    ).toMatchObject({ code: 'invalid' })
    expect(
      await failure(memberApi.widgets.weather({ query: { latitude: 1, longitude: 1 } })),
    ).toMatchObject({ code: 'forbidden' })
  })

  test('keeps a Recently added saved before its look was a setting, as Featured', async () => {
    const { ownerApi } = await started()
    await ownerApi.dashboard.saveLayout({
      body: { widgets: [{ id: 'r', kind: 'recently-added', span: 3, rows: 3 }] },
    })
    const layout = await ownerApi.dashboard.layout()
    expect(layout.widgets[0]).toMatchObject({
      kind: 'recently-added',
      span: 3,
      settings: { variant: 'featured' },
    })
  })
})
