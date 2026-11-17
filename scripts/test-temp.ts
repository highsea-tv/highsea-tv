// SPDX-License-Identifier: AGPL-3.0-only
// The tests' temp folder: each test file gets one of its own, `highsea-test-XXXXXX` in the system's,
// removed when the file's tests end, whether they pass or fail. A folder a test makes and doesn't
// remove goes with it, so the tests can't fill the disk (they once left 16 GB, 2026-11-17).
//
// Preloaded by bunfig.toml (https://bun.com/docs/runtime/bunfig#test-preload), so it runs before
// each file `bun run test` loads (--isolate); a hook a preload registers runs after the file's
// tests (https://bun.com/docs/test/lifecycle). os.tmpdir() reads TMPDIR each time it's called
// (https://nodejs.org/api/os.html#ostmpdir), and child processes inherit it. A run killed outright
// leaves its folder for `bun run clean`.
import { afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const system = process.env.HIGHSEA_SYSTEM_TMPDIR ?? tmpdir()
process.env.HIGHSEA_SYSTEM_TMPDIR = system
const dir = mkdtempSync(join(system, 'highsea-test-'))
process.env.TMPDIR = dir

afterAll(() => rmSync(dir, { recursive: true, force: true }))
