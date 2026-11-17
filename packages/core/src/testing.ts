// SPDX-License-Identifier: AGPL-3.0-only
// Temp folders that remove themselves. Under `bun test`, a hook registered while a test file loads,
// as this module's is when the file imports it, runs after that file's tests, whether they pass or
// fail (https://bun.com/docs/test/lifecycle); `bun run test` loads each file on its own (--isolate),
// so each file's folders go when it ends.
//
// The torrent package's helpers use it, and scripts load them outside a test run: the smoke test
// under Node, where `bun:test` can't be loaded (Node's ESM loader takes only file:, data: and node:
// URLs, https://nodejs.org/api/esm.html#urls), and the end-to-end fixtures under Bun, where
// afterAll() throws outside the test runner. There the folders go when the process exits
// (https://nodejs.org/api/process.html#event-exit).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const made: string[] = []

const removeAll = () => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
}

let registered = false
if (process.versions.bun)
  try {
    const { afterAll } = await import('bun:test')
    afterAll(removeAll)
    registered = true
  } catch {
    // not in a test run
  }
if (!registered) process.once('exit', removeAll)

/** A new folder in the temp folder, `highsea-<name>-XXXXXX`, removed after the file's tests. */
export function testFolder(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `highsea-${name}-`))
  made.push(dir)
  return dir
}
