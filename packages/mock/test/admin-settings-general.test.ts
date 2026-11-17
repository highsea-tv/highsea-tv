// SPDX-License-Identifier: AGPL-3.0-only
// Settings › General, Appearance, Playback and Download client through the mock's transport
// (one-client-platform-d.md › D3): in the contract's shapes, the writes showing on the next read,
// and the server's refusals.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'
import { defaultSoundPack } from '@highsea-tv/tokens'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ruth’s Mac', client: 'web' as const, appVersion: '0.4.0' }

const setup = async (role: 'owner' | 'admin' | 'user' = 'owner') => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  const r = await createClient({ baseUrl: LAN, fetch }).auth.signIn({
    body: { username: 'ruth', password: 'x', device },
  })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  fetch.setState({ role })
  return createClient({ baseUrl: LAN, fetch, token: r.token })
}

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('it answered')
}

type Schema = { parse(value: unknown): unknown }
const shaped = (route: { responses: Record<number, unknown> }, value: unknown) => {
  const ok = (route.responses[200] ?? route.responses[201]) as {
    content: { 'application/json': { schema: Schema } }
  }
  return ok.content['application/json'].schema.parse(value)
}

describe('Settings › General', () => {
  test('Region, Updates, Diagnostics and /metrics save, and an admin may only read them', async () => {
    const c = await setup()
    const general = await c.settings.general()
    shaped(routes.settings.general, general)
    await c.settings.saveGeneral({ body: { ...general, updateChannel: 'beta' } })
    expect((await c.settings.general()).updateChannel).toBe('beta')
    await c.settings.saveMetrics({ body: { enabled: true } })
    expect(await c.settings.metrics()).toEqual({ enabled: true })

    const admin = await setup('admin')
    shaped(routes.settings.general, await admin.settings.general())
    const refused = await caught(admin.settings.saveGeneral({ body: general }))
    expect(refused.status).toBe(403)
  })

  test('TMDB’s key: a new one is checked, one TMDB refuses is refused on its field', async () => {
    const c = await setup()
    shaped(routes.settings.metadata, await c.settings.metadata())
    const saved = await c.settings.saveMetadata({ body: { key: 'a-good-key-0123456789abcd' } })
    expect(saved.key).toMatchObject({ set: true, last4: 'abcd' })
    const wrong = await caught(c.settings.saveMetadata({ body: { key: 'wrong-key-0123456789' } }))
    expect(wrong.status).toBe(400)
    const removed = await c.settings.removeMetadataKey()
    shaped(routes.settings.removeMetadataKey, removed)
    expect(removed.key.set).toBe(false)
  })

  test('the indexer catalog’s channel and extras', async () => {
    const c = await setup()
    const now = await c.catalog.settings()
    shaped(routes.catalog.settings, now)
    const beta = await c.catalog.updateSettings({ body: { channel: 'beta' } })
    expect(beta.channel).toBe('beta')
    const bad = await caught(
      c.catalog.updateSettings({
        body: { extras: [{ url: 'http://x.example/manifest.json', keyId: 'k', publicKey: 'x' }] },
      }),
    )
    expect(bad.status).toBe(400)
  })
})

describe('Settings › Playback', () => {
  test('the settings save, and the status is in the contract’s shape', async () => {
    const c = await setup()
    const settings = await c.settings.playback()
    shaped(routes.settings.playback, settings)
    await c.settings.savePlayback({ body: { ...settings, maxTranscodes: 3 } })
    expect((await c.settings.playback()).maxTranscodes).toBe(3)
    const status = await c.playback.status()
    shaped(routes.playback.status, status)
    shaped(routes.playback.clearCache, await c.playback.clearCache())
    expect((await c.playback.status()).cache.transcodeBytes).toBe(0)
  })

  test('a check runs once at a time on a path that can be used', async () => {
    const c = await setup()
    const status = await c.playback.status()
    const usable = status.paths.find((p) => !p.unavailable && p.id !== 'videotoolbox')
    if (usable) {
      const started = await c.playback.check({ params: { path: usable.id } })
      shaped(routes.playback.check, started)
      expect(started.paths.find((p) => p.id === usable.id)?.checking).toBe(true)
      const again = await caught(c.playback.check({ params: { path: usable.id } }))
      expect(again.status).toBe(409)
    }
    const unusable = status.paths.find((p) => p.unavailable)
    if (unusable) {
      const refused = await caught(c.playback.check({ params: { path: unusable.id } }))
      expect(refused.status).toBe(409)
    }
  })
})

describe('Settings › Appearance', () => {
  test('the name, default theme and themes save, and read back', async () => {
    const c = await setup()
    const before = await c.appearance.get()
    const saved = await c.appearance.save({
      body: {
        name: 'Lighthouse',
        accent: before.branding.accent,
        defaultTheme: before.defaultTheme,
        sound: before.sound,
      },
    })
    shaped(routes.appearance.save, saved)
    expect((await c.appearance.get()).branding.name).toBe('Lighthouse')

    const theme = await c.appearance.saveTheme({
      params: { id: 'theme-dusk' },
      body: { name: 'Dusk', base: 'default', accent: '#d6cfc2' },
    })
    expect(theme).toMatchObject({ id: 'theme-dusk', name: 'Dusk' })
    expect((await c.appearance.get()).themes.map((t) => t.id)).toContain('theme-dusk')
    await c.appearance.deleteTheme({ params: { id: 'theme-dusk' } })
    expect((await c.appearance.get()).themes.map((t) => t.id)).not.toContain('theme-dusk')
  })

  test('the built-in sound pack’s recipe, and no other', async () => {
    const c = await setup()
    shaped(
      routes.appearance.soundPack,
      await c.appearance.soundPack({ params: { id: defaultSoundPack.id } }),
    )
    const none = await caught(c.appearance.soundPack({ params: { id: 'chimes' } }))
    expect(none.status).toBe(404)
  })
})

describe('Settings › Download client', () => {
  test('the contract’s fields, the rates shared with Downloads’ limits', async () => {
    const c = await setup()
    const now = await c.settings.downloadClient()
    shaped(routes.settings.downloadClient, now)
    const saved = await c.settings.saveDownloadClient({
      body: { ...now, port: 51_515, downloadRate: 2048, watchFolder: '/data/watch' },
    })
    expect(saved).toMatchObject({ port: 51_515, downloadRate: 2048, watchFolder: '/data/watch' })
    expect((await c.downloads.limits()).downloadRate).toBe(2048)
    expect((await c.settings.downloadClient()).watchFolder).toBe('/data/watch')
  })
})
