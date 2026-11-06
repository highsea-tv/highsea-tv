// SPDX-License-Identifier: AGPL-3.0-only
// The admin's quality and media management routes through the mock transport
// (one-client-platform-d.md › D3): profiles and formats with their editors, the size table, media
// management, its root folders and tags, in the contract's shapes, with the server's refusals.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Theo’s Mac', client: 'web' as const, appVersion: '0.4.0' }

/** Signed in as staff (Theo, an admin) unless someone else is named, the toolbar's role following. */
const setup = async (as = 'theo') => {
  const role = as === 'theo' ? 'admin' : 'user'
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage(), state: { role } })
  const anon = createClient({ baseUrl: LAN, fetch })
  const r = await anon.auth.signIn({ body: { username: as, password: 'x', device } })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  return createClient({ baseUrl: LAN, fetch, token: r.token })
}

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError & { details?: { reason?: string } }
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

describe('quality profiles', () => {
  test('adds, saves and deletes one; a taken name is `name-taken`', async () => {
    const c = await setup()
    const [first] = await c.quality.profiles()
    if (!first) throw new Error('no profiles')
    const { id: _, builtIn: __, ...input } = first
    const added = await c.quality.addProfile({ body: { ...input, name: 'Mine' } })
    shaped(routes.quality.addProfile, added)
    expect(added.builtIn).toBe(false)
    const taken = await caught(c.quality.addProfile({ body: { ...input, name: first.name } }))
    expect(taken.details?.reason).toBe('name-taken')
    const saved = await c.quality.saveProfile({
      params: { id: added.id },
      body: { ...input, name: 'Mine, renamed', waitMinutes: 30 },
    })
    expect(saved.waitMinutes).toBe(30)
    await c.quality.removeProfile({ params: { id: added.id } })
    expect((await c.quality.profiles()).some((p) => p.id === added.id)).toBe(false)
  })

  test('a cutoff the profile doesn’t want is invalid; one in use can’t be deleted', async () => {
    const c = await setup()
    const [first] = await c.quality.profiles()
    if (!first) throw new Error('no profiles')
    const { id: _, builtIn: __, ...input } = first
    const bad = await caught(
      c.quality.addProfile({ body: { ...input, name: 'Odd', cutoff: 'Not a quality' } }),
    )
    expect(bad.status).toBe(400)
    const inUse = await caught(c.quality.removeProfile({ params: { id: first.id } }))
    expect(inUse.details?.reason).toBe('in-use')
  })
})

describe('custom formats', () => {
  test('adds one, and a preset saved reads as edited; deleting takes its scores away', async () => {
    const c = await setup()
    const formats = await c.quality.customFormats()
    shaped(routes.quality.customFormats, formats)
    const preset = formats.find((f) => f.source === 'preset')
    if (!preset) throw new Error('no preset')
    expect(preset.edited).toBe(false)
    const saved = await c.quality.saveFormat({
      params: { id: preset.id },
      body: { name: preset.name, conditions: preset.conditions },
    })
    expect(saved.edited).toBe(true)
    const added = await c.quality.addFormat({
      body: {
        name: 'Mine',
        conditions: [
          { kind: 'title', name: '', value: '\\bmine\\b', negate: false, required: false },
        ],
      },
    })
    shaped(routes.quality.addFormat, added)
    const bad = await caught(
      c.quality.addFormat({
        body: {
          name: 'Broken',
          conditions: [{ kind: 'title', name: '', value: '(', negate: false, required: false }],
        },
      }),
    )
    expect(bad.status).toBe(400)
    await c.quality.removeFormat({ params: { id: added.id } })
    expect((await c.quality.customFormats()).some((f) => f.id === added.id)).toBe(false)
  })
})

describe('quality sizes', () => {
  test('saves the table, and refuses a row whose maximum is under its minimum', async () => {
    const c = await setup()
    const rows = await c.settings.qualitySizes()
    shaped(routes.settings.qualitySizes, rows)
    const changed = rows.map((r, i) => (i === 0 ? { ...r, min: 1 } : r))
    const saved = await c.settings.saveQualitySizes({ body: changed })
    expect(saved[0]?.min).toBe(1)
    const bad = await caught(
      c.settings.saveQualitySizes({
        body: rows.map((r, i) => (i === 0 ? { ...r, min: 50, max: 10 } : r)),
      }),
    )
    expect(bad.status).toBe(400)
  })
})

describe('shows’ settings (drafted)', () => {
  test('episode naming and sizes save; each profile’s use counts movies and shows', async () => {
    const c = await setup()
    const naming = await c.series.naming()
    shaped(routes.series.naming, naming)
    const saved = await c.series.saveNaming({
      body: { ...naming, multiEpisodeStyle: 'range' },
    })
    expect(saved.multiEpisodeStyle).toBe('range')
    expect((await c.series.naming()).multiEpisodeStyle).toBe('range')

    const sizes = await c.series.qualitySizes()
    shaped(routes.series.qualitySizes, sizes)
    const changed = await c.series.saveQualitySizes({
      body: sizes.map((r, i) => (i === 0 ? { ...r, min: 2 } : r)),
    })
    expect(changed[0]?.min).toBe(2)
    // the films' table is its own
    expect((await c.settings.qualitySizes())[0]?.min).not.toBe(2)
    const bad = await caught(c.series.saveQualitySizes({ body: sizes.slice(1) }))
    expect(bad.status).toBe(400)

    const usage = await c.series.profileUsage()
    shaped(routes.series.profileUsage, usage)
    const profiles = await c.quality.profiles()
    expect(usage.map((u) => u.profileId).sort()).toEqual(profiles.map((p) => p.id).sort())
    expect(usage.some((u) => u.shows > 0)).toBe(true)
  })
})

describe('media management', () => {
  test('reads and saves the settings; an unknown token names its field', async () => {
    const c = await setup()
    const m = await c.settings.mediaManagement()
    shaped(routes.settings.mediaManagement, m)
    expect('episodes' in m).toBe(false)
    const saved = await c.settings.saveMediaManagement({ body: { ...m, nfo: !m.nfo } })
    expect(saved.nfo).toBe(!m.nfo)
    const bad = await caught(
      c.settings.saveMediaManagement({ body: { ...m, fileFormat: '{Movie Title} {Nonsense}' } }),
    )
    expect(bad.details?.reason).toBe('fileFormat')
  })

  test('adds a root folder, sets its languages and removes it', async () => {
    const c = await setup()
    const added = await c.rootFolders.add({ body: { path: '/data/media/new' } })
    shaped(routes.rootFolders.add, added)
    const missing = await caught(c.rootFolders.add({ body: { path: '/elsewhere' } }))
    expect(missing.details?.reason).toBe('not-found')
    const [profile] = await c.subtitles.languageProfiles()
    if (!profile) throw new Error('no language profiles')
    const updated = await c.rootFolders.update({
      params: { id: added.id },
      body: { languageProfileId: profile.id },
    })
    expect(updated.languageProfileId).toBe(profile.id)
    await c.rootFolders.remove({ params: { id: added.id } })
    expect((await c.rootFolders.list()).some((f) => f.id === added.id)).toBe(false)
  })

  test('adds, renames and removes a tag; a label taken is `exists`', async () => {
    const c = await setup()
    const tag = await c.tags.add({ body: { label: 'weekend' } })
    shaped(routes.tags.add, tag)
    const taken = await caught(c.tags.add({ body: { label: 'Weekend' } }))
    expect(taken.details?.reason).toBe('exists')
    const renamed = await c.tags.rename({ params: { id: tag.id }, body: { label: 'family' } })
    expect(renamed.label).toBe('family')
    await c.tags.remove({ params: { id: tag.id } })
    expect((await c.tags.list()).some((t) => t.id === tag.id)).toBe(false)
  })

  test('a user is turned away', async () => {
    const c = await setup('ruth')
    const e = await caught(c.settings.mediaManagement())
    expect(e.status).toBe(403)
  })
})
