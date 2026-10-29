// SPDX-License-Identifier: AGPL-3.0-only
// ADR 0027's layers read into what a device uses, and announcements sorted by where they show.
import { describe, expect, test } from 'bun:test'
import type { ClientAnnouncement, Preferences } from '@highsea-tv/api-contract'
import { placements } from '../src/data/index.ts'
import { devicePrefs, SERVER_THEME } from '../src/prefs/index.ts'

const prefs = (layers: Partial<Preferences['layers']>, theme = 'default'): Preferences =>
  ({
    values: { theme, sound: true, volume: 0.6, 'admin.addMovie.defaults': null },
    from: { theme: 'server', sound: 'server', volume: 'server' },
    layers: { device: {}, client: {}, user: {}, ...layers },
  }) as unknown as Preferences

describe('devicePrefs', () => {
  test('follows the server until the device chooses', () => {
    expect(devicePrefs(prefs({}))).toMatchObject({
      theme: 'default',
      chosen: SERVER_THEME,
      everywhere: null,
      soundChosen: false,
    })
  })

  test('the device’s own choice', () => {
    const p = devicePrefs(prefs({ device: { theme: 'oled', sound: false } }, 'oled'))
    expect(p).toMatchObject({ theme: 'oled', chosen: 'oled', everywhere: null, soundChosen: true })
  })

  test('Use on all my devices: the person’s theme wins over the device’s', () => {
    const p = devicePrefs(prefs({ device: { theme: 'oled' }, user: { theme: 'tide' } }, 'oled'))
    expect(p).toMatchObject({ theme: 'tide', chosen: 'tide', everywhere: 'tide' })
  })
})

const announcement = (over: Partial<ClientAnnouncement>): ClientAnnouncement =>
  ({
    id: 'a',
    title: 'Maintenance',
    body: '',
    severity: 'info',
    placements: ['banner'],
    acknowledgement: 'dismiss',
    seen: false,
    ...over,
  }) as ClientAnnouncement

describe('placements', () => {
  test('a required one is the dialog; the rest go where they’re placed; seen ones go', () => {
    const all = [
      announcement({ id: 'req', acknowledgement: 'require', placements: ['banner'] }),
      announcement({ id: 'ban', placements: ['banner', 'card'] }),
      announcement({ id: 'toast', placements: ['toast'] }),
      announcement({ id: 'old', seen: true }),
    ]
    const p = placements(all)
    expect(p.modal?.id).toBe('req')
    expect(p.banners.map((a) => a.id)).toEqual(['ban'])
    expect(p.cards.map((a) => a.id)).toEqual(['ban'])
    expect(p.toasts.map((a) => a.id)).toEqual(['toast'])
    expect(p.latest?.id).toBe('req')
  })

  test('nothing unseen, nothing to show', () => {
    expect(placements([announcement({ seen: true })])).toMatchObject({
      modal: undefined,
      banners: [],
      latest: undefined,
    })
  })
})
