// SPDX-License-Identifier: AGPL-3.0-only
// Temp folders for tests that remove themselves. A hook registered while a test file loads, as
// this module's is when the file imports it, runs after that file's tests, whether they pass or
// fail (https://bun.com/docs/test/lifecycle); `bun run test` loads each file on its own (--isolate),
// so each file's folders go when it ends.
import { afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const made: string[] = []

afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A new folder in the temp folder, `highsea-<name>-XXXXXX`, removed after the file's tests. */
export function testFolder(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `highsea-${name}-`))
  made.push(dir)
  return dir
}
