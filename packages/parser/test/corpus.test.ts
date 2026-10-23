// SPDX-License-Identifier: AGPL-3.0-only
// The corpus: every fixture in test/fixtures, checked field by field. A failure shows the name and
// the fields that differ. Pending cases must still fail, so a fix that makes one pass is noticed
// and its marker removed. SOURCES.md says where each file comes from.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from '../src/index.ts'
import type { ParsedRelease } from '../src/types.ts'

type Case = {
  name: string
  expect: Record<string, unknown>
  note?: string
  pending?: string
  episode?: boolean
  from: string
}

const FILES = [
  'highsea.json',
  'ptt.json',
  'parse-torrent-title.json',
  'parse-torrent-name.json',
  'oleoo-1.json',
  'oleoo-2.json',
  'oleoo-3.json',
  'oleoo-4.json',
]

function load(file: string): Case[] {
  return JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')) as Case[]
}

/** The parsed fields the case names, and for `quality` and `ids` only the keys it names. */
function pick(got: ParsedRelease, want: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const record = got as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(want)) {
    const actual = record[key]
    if (key === 'quality' || key === 'ids') {
      const nested: Record<string, unknown> = {}
      const from = actual as Record<string, unknown>
      for (const sub of Object.keys(value as object)) {
        if (sub === 'revision') {
          const revision = from.revision as Record<string, unknown>
          nested.revision = Object.fromEntries(
            Object.keys((value as { revision: object }).revision).map((k) => [k, revision[k]]),
          )
        } else nested[sub] = from[sub]
      }
      out[key] = nested
    } else out[key] = actual
  }
  return out
}

const matches = (c: Case) => Bun.deepEquals(pick(parse(c.name), c.expect), c.expect)

for (const file of FILES) {
  const cases = load(file)
  describe(file, () => {
    test('every case asserts the title and one more field', () => {
      for (const c of cases) {
        expect(typeof c.expect.title).toBe('string')
        expect(Object.keys(c.expect).length).toBeGreaterThan(1)
        expect(c.from.length).toBeGreaterThan(0)
      }
    })

    for (const c of cases.filter((c) => !c.pending)) {
      test(c.name, () => {
        expect({ name: c.name, ...pick(parse(c.name), c.expect) }).toEqual({
          name: c.name,
          ...c.expect,
        })
      })
    }

    const pending = cases.filter((c) => c.pending)
    if (pending.length) {
      test(`${pending.length} pending cases still fail (remove the marker from any that pass)`, () => {
        const passing = pending.filter(matches).map((c) => c.name)
        expect(passing).toEqual([])
      })
    }
  })
}

test('the pass rate across the corpus', () => {
  const all = FILES.flatMap(load)
  const settled = all.filter((c) => !c.pending)
  const passing = settled.filter(matches).length
  // Printed so the checkpoint report can quote it.
  console.log(
    `corpus: ${passing}/${settled.length} settled cases pass, ${all.length - settled.length} pending, ${all.length} in all`,
  )
  expect(passing).toBe(settled.length)
})
