// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createT, defineMessages, unknownIds } from '../src/index.ts'

const messages = defineMessages({
  title: 'highsea',
  greeting: 'Welcome back, {name}.',
  jobs: '{count, plural, =0 {Nothing running} one {# job running} other {# jobs running}}',
})

describe('i18n', () => {
  test('formats plain, argument and plural messages', () => {
    const t = createT(messages)
    expect(t('title')).toBe('highsea')
    expect(t('greeting', { name: 'Ines' })).toBe('Welcome back, Ines.')
    expect(t('jobs', { count: 0 })).toBe('Nothing running')
    expect(t('jobs', { count: 1 })).toBe('1 job running')
    expect(t('jobs', { count: 1200 })).toBe('1,200 jobs running')
  })

  test('a translation wins where it has the id; English fills the rest', () => {
    const t = createT(messages, 'de', { greeting: 'Willkommen zurück, {name}.' })
    expect(t('greeting', { name: 'Ines' })).toBe('Willkommen zurück, Ines.')
    expect(t('jobs', { count: 1200 })).toBe('1.200 jobs running')
  })

  test('the types catch unknown ids and missing values', () => {
    const t = createT(messages)
    // checked by tsc (`bun run typecheck`), never run
    const typeOnly = () => {
      // @ts-expect-error: no such id
      t('nope')
      // @ts-expect-error: `name` is required
      t('greeting')
      // @ts-expect-error: `title` takes no values
      t('title', { name: 'x' })
    }
    expect(typeof typeOnly).toBe('function')
  })

  test('finds ids a translation has that the source doesn’t', () => {
    expect(unknownIds(messages, { title: 'x', gone: 'y' })).toEqual(['gone'])
  })
})
