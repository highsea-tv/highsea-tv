// SPDX-License-Identifier: AGPL-3.0-only
// Every message catalog the server shows, its own and the domain packages', is valid ICU: a message
// that doesn't parse throws when it's shown, and takes its screen down with it.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { type Messages, unparsable } from '@highsea-tv/i18n'
import { Glob } from 'bun'

const ROOT = join(import.meta.dir, '../../..')
const sources = ['apps/server/src', 'packages']
  .flatMap((dir) =>
    [...new Glob('**/*.{ts,tsx}').scanSync(join(ROOT, dir))].map((f) => join(ROOT, dir, f)),
  )
  .filter((f) => !f.includes('/node_modules/') && !f.includes('/test/'))
  .filter((f) => readFileSync(f, 'utf8').includes('defineMessages('))

const isCatalog = (value: unknown): value is Messages =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.values(value).every((m) => typeof m === 'string')

describe('message catalogs', () => {
  test('are found', () => {
    expect(sources.length).toBeGreaterThan(40)
  })

  for (const file of sources)
    test(`parse: ${relative(ROOT, file)}`, async () => {
      const exports = Object.values((await import(file)) as Record<string, unknown>)
      const catalogs = exports.filter(isCatalog)
      expect(catalogs.flatMap((c) => unparsable(c))).toEqual([])
    })
})
