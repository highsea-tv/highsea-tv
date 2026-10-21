// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createFakeClock } from '@highsea/core'
import { migrate, openDatabase, writeSetting } from '@highsea/db'
import { createSettings, defaultSettings, SUBTITLES_KEY } from '../../src/shared/settings.ts'
import { reason } from '../movies/helpers.ts'

const setup = () => {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  return { db, clock, settings: createSettings({ db, clock }) }
}

describe('the subtitles settings', () => {
  test('the prototype’s defaults', () => {
    expect(setup().settings.get()).toEqual({
      minScore: 80,
      autoSync: true,
      minConfidence: 0.7,
      upgradeDays: 14,
      preferReleaseMatch: true,
    })
    expect(defaultSettings().minScore).toBe(80)
  })

  test('a patch is saved over what’s there', () => {
    const { settings } = setup()
    settings.save({ minScore: 90 })
    settings.save({ upgradeDays: 0 })
    expect(settings.get()).toMatchObject({ minScore: 90, upgradeDays: 0, autoSync: true })
  })

  test('an invalid value is refused with its field', async () => {
    const { settings } = setup()
    expect(await reason(() => settings.save({ minScore: 101 }))).toBe('invalid:minScore')
    expect(await reason(() => settings.save({ minConfidence: -0.1 }))).toBe('invalid:minConfidence')
    expect(await reason(() => settings.save({ upgradeDays: 1.5 }))).toBe('invalid:upgradeDays')
    expect(settings.get().minScore).toBe(80)
  })

  test('a stored field that no longer parses reads its default', () => {
    const { db, clock, settings } = setup()
    writeSetting(db, SUBTITLES_KEY, { minScore: 'high', upgradeDays: 3 }, clock.now())
    expect(settings.get()).toMatchObject({ minScore: 80, upgradeDays: 3 })
  })
})
