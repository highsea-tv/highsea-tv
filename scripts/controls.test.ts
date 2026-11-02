// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scan } from './controls.ts'

describe('controls come from the library', () => {
  test('every exception has a reason', () => {
    const list = JSON.parse(readFileSync(join(ROOT, 'scripts/control-exceptions.json'), 'utf8'))
    for (const e of list) expect(e.reason?.length ?? 0).toBeGreaterThan(10)
  })

  test('no app or prototype draws a control of its own (bun scripts/controls.ts lists them)', () => {
    const found = scan().map((f) => `${f.file}:${f.line} <${f.tag}> ${f.why}`)
    expect(found).toEqual([])
  })
})
