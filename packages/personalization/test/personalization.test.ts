// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { AppError } from '@highsea/core'
import { schema } from '@highsea/db'
import { defaultSoundPack } from '@highsea/tokens'
import { eq } from 'drizzle-orm'
import { appKind } from '../src/keys.ts'
import { checkMark } from '../src/marks.ts'
import { normalize, ownerDefault, type WidgetPlacement, widgetDefinitions } from '../src/widgets.ts'
import { png, setup, svg } from './helpers.ts'

const reason = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof AppError) return `${e.code}:${(e.details as { reason?: string })?.reason}`
    throw e
  }
  return 'no error'
}

describe('widgets', () => {
  test('normalize keeps a placement in range and fills its settings', () => {
    const w = normalize({ id: 'a', kind: 'network', span: 4 as 1, rows: 9 })
    expect(w).toEqual({ id: 'a', kind: 'network', span: 2, rows: 4, settings: { minutes: 10 } })
  })

  test('settings that no longer parse fall back to the defaults', () => {
    const w = normalize({ id: 'a', kind: 'upcoming', span: 2, rows: 2, settings: { days: 900 } })
    expect(w.settings).toEqual({ days: 14 })
  })
})

describe('dashboard layouts', () => {
  test('a person sees their role default until they save', () => {
    const { p, person } = setup()
    const owner = person('o', 'owner')
    const admin = person('a')
    expect(p.dashboard.layout(owner)).toMatchObject({ inherited: true, updatedAt: null })
    for (const who of [owner, admin])
      expect(p.dashboard.layout(who).widgets.map((w) => w.kind)).toEqual(
        ownerDefault.map((w) => w.kind),
      )
  })

  test('every widget is for the owner and admins, the dashboard’s only readers (ADR 0032)', () => {
    for (const d of widgetDefinitions)
      expect(d.roles.toSorted(), d.kind).toEqual(['admin', 'owner'])
  })

  test('saving keeps the order, and reset forgets it', () => {
    const { p, person, seen } = setup()
    const me = person('m')
    const widgets: WidgetPlacement[] = [
      { id: 'b', kind: 'calendar', span: 2, rows: 3 },
      { id: 'a', kind: 'recently-added', span: 1, rows: 3 },
    ]
    const saved = p.dashboard.save(me, widgets)
    expect(saved.inherited).toBe(false)
    expect(saved.widgets.map((w) => w.id)).toEqual(['b', 'a'])
    expect(seen.at(-1)).toEqual(expect.objectContaining({ topic: 'layout.updated', ids: ['m'] }))
    expect(p.dashboard.reset(me).inherited).toBe(true)
  })

  test('duplicates and bad settings are refused', () => {
    const { p, person } = setup()
    const me = person('m')
    const cal = { id: 'c', kind: 'calendar', span: 2, rows: 3 } as const
    expect(reason(() => p.dashboard.save(me, [cal, { ...cal, id: 'd' }]))).toBe('invalid:duplicate')
    expect(
      reason(() =>
        p.dashboard.save(me, [
          { id: 'u', kind: 'upcoming', span: 2, rows: 2, settings: { days: 0 } },
        ]),
      ),
    ).toBe('invalid:settings')
  })

  test('kinds this version doesn’t know are kept but not shown', () => {
    const { p, person, db } = setup()
    const me = person('m')
    p.dashboard.save(me, [{ id: 'c', kind: 'calendar', span: 2, rows: 3 }])
    db.update(schema.widgetLayouts)
      .set({
        widgets: [
          { id: 'c', kind: 'calendar', span: 2, rows: 3 },
          { id: 'x', kind: 'weather', span: 1, rows: 2 },
        ],
      })
      .run()
    expect(p.dashboard.layout(me).widgets.map((w) => w.id)).toEqual(['c'])
    p.dashboard.save(me, [{ id: 'r', kind: 'recently-added', span: 2, rows: 3 }])
    const stored = db.select().from(schema.widgetLayouts).get()?.widgets as { id: string }[]
    expect(stored.map((w) => w.id)).toEqual(['r', 'x'])
  })

  test('the admins’ default reaches every admin who hasn’t saved their own', () => {
    const { p, person } = setup()
    const saved = p.dashboard.saveRoleDefault('admin', [
      { id: 'c', kind: 'calendar', span: 2, rows: 3 },
    ])
    expect(saved.dropped).toEqual([])
    expect(p.dashboard.layout(person('a')).widgets.map((w) => w.kind)).toEqual(['calendar'])
    expect(p.dashboard.layout(person('o', 'owner')).widgets.map((w) => w.kind)).toEqual(
      ownerDefault.map((w) => w.kind),
    )
  })
})

describe('appearance', () => {
  test('the defaults, and saving the name, accent and default theme', () => {
    const { p, name, seen } = setup()
    expect(p.appearance.get()).toMatchObject({
      defaultTheme: 'default',
      packs: [{ id: 'felt', name: 'Felt and wood', builtIn: true }],
      branding: { name: 'Harbor', accent: null, customMark: false, mark: null },
    })
    const view = p.appearance.save({
      name: ' Lighthouse ',
      accent: 'rgb(20 160 170)',
      defaultTheme: 'oled',
    })
    expect(name()).toBe('Lighthouse')
    expect(view.branding.accent).toMatch(/^#[0-9a-f]{6}$/)
    expect(view.defaultTheme).toBe('oled')
    expect(seen.at(-1)?.topic).toBe('server.updated')
  })

  test('bad names, accents, themes and packs are refused', () => {
    const { p } = setup()
    expect(reason(() => p.appearance.save({ name: '  ' }))).toBe('invalid:name')
    expect(reason(() => p.appearance.save({ name: 'x'.repeat(41) }))).toBe('invalid:name')
    expect(reason(() => p.appearance.save({ accent: 'teal-ish' }))).toBe('invalid:accent')
    expect(reason(() => p.appearance.save({ defaultTheme: 'nope' }))).toBe('invalid:theme')
    expect(
      reason(() =>
        p.appearance.save({
          sound: { tv: true, phone: false, web: false, volume: 1, pack: 'nope' },
        }),
      ),
    ).toBe('invalid:pack')
  })

  test('a theme is saved only when it passes the audit', () => {
    const { p } = setup()
    const theme = p.appearance.saveTheme('harbor', {
      name: 'Harbor',
      base: 'default',
      accent: '#3355ff',
    })
    expect(theme).toEqual({ id: 'harbor', name: 'Harbor', base: 'default', accent: '#3355ff' })
    expect(
      reason(() =>
        p.appearance.saveTheme('murky', {
          name: 'Murky',
          base: 'default',
          accent: '#3355ff',
          colors: { text: '#333333' },
        }),
      ),
    ).toBe('invalid:contrast')
    expect(
      reason(() => p.appearance.saveTheme('oled', { name: 'X', base: 'oled', accent: '#fff' })),
    ).toBe('conflict:built-in')
  })

  test('deleting the default theme falls back to Abyss Neutral', () => {
    const { p } = setup()
    p.appearance.saveTheme('harbor', { name: 'Harbor', base: 'default', accent: '#3355ff' })
    p.appearance.save({ defaultTheme: 'harbor' })
    p.appearance.deleteTheme('harbor')
    expect(p.appearance.get().defaultTheme).toBe('default')
    expect(reason(() => p.appearance.deleteTheme('harbor'))).toBe('not-found:undefined')
  })

  test('sound packs: checked, uploaded, and the built-in one kept', () => {
    const { p } = setup()
    expect(p.appearance.soundPack('felt')).toBe(defaultSoundPack)
    const pack = { ...defaultSoundPack, id: 'harbor', name: 'Harbor' }
    expect(p.appearance.uploadSoundPack(pack)).toEqual({
      id: 'harbor',
      name: 'Harbor',
      builtIn: false,
    })
    expect(p.appearance.soundPack('harbor')).toEqual(pack)
    expect(reason(() => p.appearance.uploadSoundPack({ ...defaultSoundPack, gain: 9 }))).toBe(
      'invalid:sound-rules',
    )
    expect(reason(() => p.appearance.uploadSoundPack(defaultSoundPack))).toBe('conflict:built-in')
    expect(reason(() => p.appearance.deleteSoundPack('felt'))).toBe('conflict:built-in')
    p.appearance.save({ sound: { tv: true, phone: true, web: false, volume: 0.5, pack: 'harbor' } })
    p.appearance.deleteSoundPack('harbor')
    expect(p.appearance.settings().sound.pack).toBe('felt')
  })

  test('the mark is versioned by its content and can be removed', () => {
    const { p } = setup()
    const branding = p.appearance.setMark(png(512, 512))
    expect(branding.customMark).toBe(true)
    expect(branding.mark).toMatch(/^\/api\/v1\/appearance\/mark\?v=[0-9a-f]{12}$/)
    expect(p.appearance.mark()?.type).toBe('image/png')
    const next = p.appearance.setMark(png(256, 256))
    expect(next.mark).not.toBe(branding.mark)
    expect(p.appearance.removeMark()).toMatchObject({ customMark: false, mark: null })
    expect(p.appearance.mark()).toBeNull()
  })
})

describe('the mark check', () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle r="8"/></svg>'

  test('square PNGs and SVGs pass', () => {
    expect(checkMark(png(256, 256))).toBe('image/png')
    expect(checkMark(svg(ok))).toBe('image/svg+xml')
    expect(checkMark(svg(`<?xml version="1.0"?>\n<!-- mark -->\n${ok}`))).toBe('image/svg+xml')
  })

  test('everything else is refused with a reason', () => {
    const r = (b: Uint8Array) => reason(() => checkMark(b))
    expect(r(new Uint8Array())).toBe('invalid:empty')
    expect(r(new Uint8Array(1_000_001))).toBe('invalid:size')
    expect(r(png(512, 256))).toBe('invalid:not-square')
    expect(r(png(128, 128))).toBe('invalid:too-small')
    expect(r(png(512, 512).subarray(0, 20))).toBe('invalid:damaged')
    expect(r(svg(`<!DOCTYPE svg [<!ENTITY a "a">]>${ok}`))).toBe('invalid:doctype')
    expect(r(svg('<svg viewBox="0 0 64 64"></svg>'))).toBe('invalid:namespace')
    expect(r(svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"></svg>'))).toBe(
      'invalid:not-square',
    )
    expect(r(svg('<html></html>'))).toBe('invalid:type')
    expect(r(new Uint8Array([0xff, 0xfe, 0x00]))).toBe('invalid:type')
  })
})

describe('preferences', () => {
  test('app kinds', () => {
    expect([appKind('tvos'), appKind('ios'), appKind('web'), appKind(null)]).toEqual([
      'tv',
      'phone',
      'web',
      'web',
    ])
  })

  test('the server’s defaults depend on the kind of app', () => {
    const { p, person, device } = setup()
    person('m')
    const tv = device('tv', 'm', 'tvos')
    const phone = device('phone', 'm', 'ios')
    expect(p.preferences.resolve('m', tv).values).toEqual({
      theme: 'default',
      sound: true,
      volume: 0.8,
      'admin.addMovie.defaults': null,
    })
    expect(p.preferences.resolve('m', phone).values.sound).toBe(false)
    expect(p.preferences.resolve('m', null)).toMatchObject({ client: null, deviceId: null })
  })

  test('the most specific layer wins, and clearing a key lets the next show through', () => {
    const { p, person, device, seen } = setup()
    person('m')
    const tv = device('tv', 'm', 'tvos')
    p.preferences.save('m', tv, 'user', { theme: 'oled', volume: 0.5 })
    p.preferences.save('m', tv, 'client', { theme: 'high-contrast' }, 'tvos')
    const view = p.preferences.save('m', tv, 'device', { volume: 0.2 })
    expect(view.values).toEqual({
      theme: 'high-contrast',
      sound: true,
      volume: 0.2,
      'admin.addMovie.defaults': null,
    })
    expect(view.from).toEqual({
      theme: 'client',
      sound: 'server',
      volume: 'device',
      'admin.addMovie.defaults': 'server',
    })
    expect(seen.at(-1)).toEqual(
      expect.objectContaining({ topic: 'preferences.updated', ids: ['m'] }),
    )
    const cleared = p.preferences.save('m', tv, 'device', { volume: null })
    expect(cleared.values.volume).toBe(0.5)
    expect(cleared.layers.device).toEqual({})
  })

  test('a deleted theme lets the next layer show through', () => {
    const { p, person } = setup()
    person('m')
    p.appearance.saveTheme('harbor', { name: 'Harbor', base: 'default', accent: '#3355ff' })
    p.preferences.save('m', null, 'user', { theme: 'harbor' })
    p.appearance.deleteTheme('harbor')
    expect(p.preferences.resolve('m', null).values.theme).toBe('default')
  })

  test('a device’s layer goes with the device, and someone else’s device isn’t yours', () => {
    const { p, person, device, db } = setup()
    person('m')
    person('n')
    const tv = device('tv', 'm', 'tvos')
    p.preferences.save('m', tv, 'device', { sound: false })
    expect(reason(() => p.preferences.save('n', tv, 'device', { sound: false }))).toBe(
      'invalid:no-device',
    )
    expect(reason(() => p.preferences.save('m', null, 'user', { theme: 'nope' }))).toBe(
      'invalid:theme',
    )
    db.delete(schema.devices).where(eq(schema.devices.id, tv)).run()
    expect(db.select().from(schema.preferences).all()).toEqual([])
  })
})

describe('home', () => {
  test('rows in the person’s order; ids not offered yet are kept', () => {
    const { p, person, seen } = setup()
    person('m')
    expect(p.home.layout('m')).toEqual({
      order: [],
      hidden: [],
      rows: [{ id: 'continue', title: null }],
    })
    const saved = p.home.save('m', { order: ['later', 'continue', 'later'], hidden: ['continue'] })
    expect(saved).toMatchObject({ order: ['later', 'continue'], hidden: ['continue'] })
    expect(seen.at(-1)).toEqual(expect.objectContaining({ topic: 'home.updated', ids: ['m'] }))
  })
})
