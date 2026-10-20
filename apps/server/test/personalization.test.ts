// SPDX-License-Identifier: AGPL-3.0-only
// The checkpoint 3 routes through the SDK: dashboards, preferences, home and Appearance. The happy
// path, and who may not.
import { afterEach, describe, expect, test } from 'bun:test'
import {
  WIDGET_KINDS as CONTRACT_KINDS,
  WIDGET_SOURCES as CONTRACT_SOURCES,
} from '@highsea/api-contract'
import { WIDGET_KINDS, WIDGET_SOURCES } from '@highsea/personalization'
import { defaultSoundPack } from '@highsea/tokens'
import { createApi } from '../src/api/app.ts'
import {
  addMember,
  bootRuntime,
  cleanup,
  clientFor,
  failure,
  ORIGIN,
  withOwner,
} from './helpers.ts'

afterEach(cleanup)

async function started() {
  const runtime = await bootRuntime()
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Theo')
  return {
    runtime,
    app,
    owner,
    anon: clientFor(app),
    ownerApi: clientFor(app, { token }),
    memberApi: clientFor(app, { token: member.token }),
    member,
  }
}

/** A PNG's signature and IHDR chunk: all the mark check reads. */
function png(size: number) {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
  bytes.set(
    [...'IHDR'].map((c) => c.charCodeAt(0)),
    12,
  )
  const view = new DataView(bytes.buffer)
  view.setUint32(16, size)
  view.setUint32(20, size)
  return Buffer.from(bytes).toString('base64')
}

test('the contract’s widget kinds and sources match the registry', () => {
  expect([...CONTRACT_KINDS]).toEqual([...WIDGET_KINDS])
  expect([...CONTRACT_SOURCES]).toEqual([...WIDGET_SOURCES])
})

describe('dashboard', () => {
  test('a role default until saved; staff widgets refused for members; reset', async () => {
    const { ownerApi, memberApi } = await started()
    const mine = await memberApi.dashboard.layout()
    expect(mine.inherited).toBe(true)
    expect(mine.widgets.map((w) => w.kind)).not.toContain('network')

    expect(
      await failure(
        memberApi.dashboard.saveLayout({
          body: { widgets: [{ id: 'n', kind: 'network', span: 2, rows: 2 }] },
        }),
      ),
    ).toEqual({ code: 'forbidden', reason: 'widget-not-allowed' })

    const saved = await memberApi.dashboard.saveLayout({
      body: { widgets: [{ id: 'c', kind: 'calendar', span: 2, rows: 3 }] },
    })
    expect(saved).toMatchObject({ inherited: false, widgets: [{ id: 'c', kind: 'calendar' }] })
    expect((await memberApi.dashboard.resetLayout()).inherited).toBe(true)

    expect((await ownerApi.dashboard.layout()).widgets.map((w) => w.kind)).toContain('network')
  })

  test('only the owner sets role defaults; staff widgets are dropped for members', async () => {
    const { ownerApi, memberApi } = await started()
    expect(await failure(memberApi.dashboard.roleDefault({ params: { role: 'member' } }))).toEqual({
      code: 'forbidden',
      reason: undefined,
    })
    const saved = await ownerApi.dashboard.saveRoleDefault({
      params: { role: 'member' },
      body: {
        widgets: [
          { id: 'n', kind: 'network', span: 2, rows: 2 },
          { id: 'c', kind: 'calendar', span: 2, rows: 3 },
        ],
      },
    })
    expect(saved.dropped).toEqual(['network'])
    expect((await memberApi.dashboard.layout()).widgets.map((w) => w.kind)).toEqual(['calendar'])
    expect(
      (await ownerApi.dashboard.roleDefault({ params: { role: 'member' } })).updatedAt,
    ).not.toBeNull()
  })
})

describe('preferences', () => {
  test('a TV resolves from the server’s defaults, then its own layers', async () => {
    const { runtime, ownerApi, memberApi, member } = await started()
    const start = await memberApi.preferences.get()
    expect(start).toMatchObject({
      client: 'tvos',
      values: { theme: 'default', sound: true, volume: 0.8 },
      from: { theme: 'server', sound: 'server', volume: 'server' },
    })
    await memberApi.preferences.save({ body: { layer: 'user', values: { theme: 'oled' } } })
    const after = await memberApi.preferences.save({
      body: { layer: 'device', values: { sound: false } },
    })
    expect(after.values).toEqual({ theme: 'oled', sound: false, volume: 0.8 })
    expect(after.from).toEqual({ theme: 'user', sound: 'device', volume: 'server' })

    expect(
      await failure(memberApi.preferences.save({ body: { layer: 'client', values: {} } })),
    ).toEqual({ code: 'invalid', reason: 'client' })
    expect(
      await failure(
        memberApi.preferences.save({ body: { layer: 'user', values: { theme: 'nope' } } }),
      ),
    ).toEqual({ code: 'invalid', reason: 'theme' })

    // staff can see why a device behaves as it does; members can't look at others'
    const device = runtime.auth.devices.list(member.id)[0]
    expect(device).toBeDefined()
    const id = device?.id as string
    expect((await ownerApi.preferences.device({ params: { id } })).values.sound).toBe(false)
    expect((await failure(memberApi.preferences.device({ params: { id } }))).code).toBe('forbidden')
    expect((await failure(ownerApi.preferences.device({ params: { id: 'nope' } }))).code).toBe(
      'not-found',
    )
  })
})

describe('home', () => {
  test('order and hidden rows, deduped', async () => {
    const { memberApi, anon } = await started()
    expect(await memberApi.home.layout()).toEqual({
      order: [],
      hidden: [],
      rows: [{ id: 'continue', title: null }],
    })
    const saved = await memberApi.home.saveLayout({
      body: { order: ['continue', 'continue'], hidden: ['continue'] },
    })
    expect(saved).toMatchObject({ order: ['continue'], hidden: ['continue'] })
    expect((await failure(anon.home.layout())).code).toBe('unauthorized')
  })
})

describe('appearance', () => {
  test('everyone reads it; staff change it, and it’s audited', async () => {
    const { runtime, ownerApi, memberApi } = await started()
    expect((await memberApi.appearance.get()).packs).toEqual([
      { id: 'felt', name: 'Felt and wood', builtIn: true },
    ])
    expect(
      (await failure(memberApi.appearance.save({ body: { defaultTheme: 'oled' } }))).code,
    ).toBe('forbidden')

    const view = await ownerApi.appearance.save({
      body: { name: 'Lighthouse', accent: '#3d8bfd', defaultTheme: 'oled' },
    })
    expect(view.branding).toMatchObject({ name: 'Lighthouse', accent: '#3d8bfd' })
    expect(runtime.identity().name).toBe('Lighthouse')
    expect((await ownerApi.system.server()).branding.accent).toBe('#3d8bfd')
    expect((await memberApi.preferences.get()).values.theme).toBe('oled')
    const audit = await ownerApi.audit.list({ query: {} })
    expect(audit.items.map((e) => e.action)).toContain('settings.appearance')
  })

  test('themes must pass the audit; deleting the default falls back', async () => {
    const { ownerApi, memberApi } = await started()
    const theme = await ownerApi.appearance.saveTheme({
      params: { id: 'harbor' },
      body: { name: 'Harbor', base: 'default', accent: '#3355ff' },
    })
    expect(theme.id).toBe('harbor')
    expect(
      await failure(
        ownerApi.appearance.saveTheme({
          params: { id: 'murky' },
          body: { name: 'Murky', base: 'default', accent: '#3355ff', colors: { text: '#333333' } },
        }),
      ),
    ).toEqual({ code: 'invalid', reason: 'contrast' })
    expect(
      (
        await failure(
          memberApi.appearance.saveTheme({
            params: { id: 'x' },
            body: { name: 'X', base: 'default', accent: '#3355ff' },
          }),
        )
      ).code,
    ).toBe('forbidden')
    await ownerApi.appearance.save({ body: { defaultTheme: 'harbor' } })
    await ownerApi.appearance.deleteTheme({ params: { id: 'harbor' } })
    expect((await ownerApi.appearance.get()).defaultTheme).toBe('default')
  })

  test('the mark: uploaded, served with its headers, cached and removed', async () => {
    const { app, ownerApi, memberApi } = await started()
    expect((await app.request(`${ORIGIN}/api/v1/appearance/mark`)).status).toBe(404)
    expect(
      (await failure(memberApi.appearance.uploadMark({ body: { data: png(512) } }))).code,
    ).toBe('forbidden')
    expect(await failure(ownerApi.appearance.uploadMark({ body: { data: png(64) } }))).toEqual({
      code: 'invalid',
      reason: 'too-small',
    })

    const branding = await ownerApi.appearance.uploadMark({ body: { data: png(512) } })
    expect(branding.mark).toMatch(/^\/api\/v1\/appearance\/mark\?v=/)
    expect((await ownerApi.appearance.get()).branding.customMark).toBe(true)

    // public, so apps can show it before signing in
    const res = await app.request(`${ORIGIN}${branding.mark}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    const etag = res.headers.get('etag') as string
    const again = await app.request(`${ORIGIN}/api/v1/appearance/mark`, {
      headers: { 'if-none-match': etag },
    })
    expect(again.status).toBe(304)

    expect((await ownerApi.appearance.removeMark()).mark).toBeNull()
  })

  test('an SVG mark is sandboxed when opened directly', async () => {
    const { app, ownerApi } = await started()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle r="8"/></svg>'
    await ownerApi.appearance.uploadMark({ body: { data: Buffer.from(svg).toString('base64') } })
    const res = await app.request(`${ORIGIN}/api/v1/appearance/mark`)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
  })

  test('a mark over the limit is refused before it’s read', async () => {
    const { app, runtime } = await started()
    const { token } = await addMember(
      runtime,
      runtime.auth.users.list()[0]?.id as string,
      'Ada',
      'admin',
    )
    const res = await app.request(`${ORIGIN}/api/v1/appearance/mark`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'A'.repeat(1_400_000) }),
    })
    expect(res.status).toBe(400)
  })

  test('sound packs: checked on upload, the built-in one kept', async () => {
    const { ownerApi, memberApi } = await started()
    const pack = { ...defaultSoundPack, id: 'harbor', name: 'Harbor' }
    expect(await ownerApi.appearance.uploadSoundPack({ body: pack })).toEqual({
      id: 'harbor',
      name: 'Harbor',
      builtIn: false,
    })
    expect((await memberApi.appearance.soundPack({ params: { id: 'harbor' } })).name).toBe('Harbor')
    expect(
      await failure(ownerApi.appearance.uploadSoundPack({ body: { ...pack, gain: 9 } })),
    ).toEqual({ code: 'invalid', reason: 'sound-rules' })
    expect((await failure(memberApi.appearance.uploadSoundPack({ body: pack }))).code).toBe(
      'forbidden',
    )
    expect(await failure(ownerApi.appearance.deleteSoundPack({ params: { id: 'felt' } }))).toEqual({
      code: 'conflict',
      reason: 'built-in',
    })
    await ownerApi.appearance.deleteSoundPack({ params: { id: 'harbor' } })
    expect((await failure(memberApi.appearance.soundPack({ params: { id: 'harbor' } }))).code).toBe(
      'not-found',
    )
  })

  test('public info lists the sources this server has', async () => {
    const { anon } = await started()
    expect((await anon.system.publicInfo()).sources).toEqual(['system'])
  })
})
