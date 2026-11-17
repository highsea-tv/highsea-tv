// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allowed, human, parseArgs, tempTargets } from './clean.ts'

const ROOT = realpathSync(join(import.meta.dir, '..'))

describe('what clean may remove', () => {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'highsea-clean-')))

  test('the checkout’s output and the temp folder’s, nothing else', () => {
    expect(allowed(join(ROOT, 'apps/server/.next'), ROOT, temp)).toBe(true)
    expect(allowed(join(temp, 'highsea-layout-abcdef'), ROOT, temp)).toBe(true)
    expect(allowed(ROOT, ROOT, temp)).toBe(false)
    expect(allowed(temp, ROOT, temp)).toBe(false)
    expect(allowed(join(ROOT, '.dev'), ROOT, temp)).toBe(false)
    expect(allowed(join(ROOT, '.dev/data'), ROOT, temp)).toBe(false)
    expect(allowed(join(ROOT, '.git/objects'), ROOT, temp)).toBe(false)
    expect(allowed('/Volumes/data/media', ROOT, temp)).toBe(false)
    expect(allowed('/etc/hosts', ROOT, temp)).toBe(false)
    expect(allowed(join(ROOT, '..', 'elsewhere'), ROOT, temp)).toBe(false)
  })

  test('a link inside is removed as a link: what it points to is judged by where the link is', () => {
    const inside = join(temp, 'highsea-link')
    symlinkSync('/Volumes', inside)
    expect(allowed(inside, ROOT, temp)).toBe(true)
    // a link to a folder outside doesn't make what's under it allowed
    expect(allowed(join(inside, 'data'), ROOT, temp)).toBe(false)
  })

  test('temp folders nothing changed in for an hour, highsea’s only, never a lock', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'highsea-clean-temp-')))
    const now = Date.now()
    const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000)
    const make = (name: string, age: number, inner?: number) => {
      const dir = join(base, name)
      mkdirSync(dir)
      writeFileSync(join(dir, 'file'), 'x')
      utimesSync(join(dir, 'file'), hoursAgo(inner ?? age), hoursAgo(inner ?? age))
      utimesSync(dir, hoursAgo(age), hoursAgo(age))
    }
    make('highsea-seed-old', 2)
    make('highsea-layout-new', 0)
    // its folder is old, but something in it changed a minute ago: a run still going
    make('highsea-sweep-busy', 3, 1 / 60)
    make('other-tool-old', 5)
    writeFileSync(join(base, 'highsea-client-ios.lock'), '1')
    utimesSync(join(base, 'highsea-client-ios.lock'), hoursAgo(4), hoursAgo(4))
    expect(tempTargets(now, base)).toEqual([join(base, 'highsea-seed-old')])
  })
})

test('flags', () => {
  expect(parseArgs([])).toEqual({ docker: false, deps: false, dryRun: false })
  expect(parseArgs(['--docker', '--deps', '--dry-run'])).toEqual({
    docker: true,
    deps: true,
    dryRun: true,
  })
  expect(() => parseArgs(['--all'])).toThrow('unknown --all')
})

test('sizes', () => {
  expect(human(512)).toBe('512 B')
  expect(human(4_300_000_000)).toBe('4.3 GB')
})
