// SPDX-License-Identifier: AGPL-3.0-only
// The parser runs on every indexer result, so it has to be cheap: a mean under 0.25 ms a name,
// measured over the whole corpus after a warm-up pass.
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { parse } from '../src/index.ts'

const dir = new URL('./fixtures/', import.meta.url)
const names = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) =>
    (JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { name: string }[]).map((c) => c.name),
  )

test('a mean under 0.25 ms a name', () => {
  for (const name of names) parse(name)
  const rounds = 5
  const start = performance.now()
  for (let r = 0; r < rounds; r++) for (const name of names) parse(name)
  const mean = (performance.now() - start) / (rounds * names.length)
  console.log(`parse: ${(mean * 1000).toFixed(1)} µs a name over ${names.length} names`)
  expect(mean).toBeLessThan(0.25)
})
