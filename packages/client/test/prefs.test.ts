// SPDX-License-Identifier: AGPL-3.0-only
// ADR 0027's layers read into what a device uses, and announcements sorted by where they show.
import { describe, expect, test } from 'bun:test'
import type { ClientAnnouncement, Preferences } from '@highsea-tv/api-contract'
import { placements } from '../src/data/index.ts'
import {
  devicePrefs,
  playbackOptions,
  playbackPatch,
  playbackPrefs,
  SERVER_THEME,
} from '../src/prefs/index.ts'

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

describe('playback settings', () => {
  const values = {
    'playback.audio': 'original',
    'playback.subtitles': 'en',
    'playback.onlyForeign': true,
    'playback.autoplayNext': true,
    'playback.skipIntros': false,
    'playback.qualityHome': 'original',
    'playback.qualityAway': '8',
  }

  test('the keys read into the settings, and a change back into the user layer’s keys', () => {
    const p = { values, from: {}, layers: { device: {}, client: {}, user: {} } }
    expect(playbackPrefs(p as unknown as Preferences)).toEqual({
      audio: 'original',
      subtitles: 'en',
      onlyForeign: true,
      autoplayNext: true,
      skipIntros: false,
      qualityHome: 'original',
      qualityAway: '8',
    })
    expect(playbackPatch({ subtitles: 'off', qualityAway: '4', audio: undefined })).toEqual({
      'playback.subtitles': 'off',
      'playback.qualityAway': '4',
    })
  })

  test('the choices with their words', () => {
    const o = playbackOptions('en')
    expect(o.audio[0]).toEqual({ value: 'original', label: 'Original language', short: 'Original' })
    expect(o.audio.find((x) => x.value === 'de')?.label).toBe('German')
    expect(o.subtitles[0]).toEqual({ value: 'off', label: 'Off' })
    expect(o.quality.map((q) => q.label)).toEqual([
      'Original',
      '20 Mbit/s · 1080p',
      '8 Mbit/s · 1080p',
      '4 Mbit/s · 720p',
      '2 Mbit/s · 480p',
    ])
    expect(o.quality[2]?.short).toBe('8 Mbit/s')
  })
})
