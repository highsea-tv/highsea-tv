// SPDX-License-Identifier: AGPL-3.0-only
// `bun run export:web:mock`: the client's web export in mock mode (EXPO_PUBLIC_HIGHSEA_MOCK=1),
// which the prototypes' server serves at /web (design/prototypes/client-export.ts). Expo empties
// its output folder before it writes (https://docs.expo.dev/more/expo-cli/#exporting), so it
// exports into a folder of this run's own and swaps that in as dist-mock only once it has built:
// a failed run leaves the last export, two runs at once never write into one folder, and a server
// serving it never sees a half-written export. dist-mock is missing only for the moment between
// the swap's two renames, when a request meets the server's 503 (a reload then finds it). A run
// stopped part way can leave its own .dist-mock-* folders, which git ignores. Every run stamps
// the export with its inputs' hash as they were when it started (./stamp.ts), so the prototypes'
// server takes an export made by hand as current.
import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inputsStamp, ROOT, STAMP_FILE } from './stamp.ts'

export type ExportOptions = {
  /** The repository whose apps/client is exported: this one, or a test's own. */
  root?: string
  /** The command that exports, given `--output-dir`: Expo's, or a test's stand-in. */
  expo?: string[]
}

/** Exports the client in mock mode into apps/client/dist-mock, stamped. Returns whether it did. */
export function exportMock({ root = ROOT, expo }: ExportOptions = {}): boolean {
  const client = join(root, 'apps/client')
  const target = join(client, 'dist-mock')
  const temp = join(client, `.dist-mock-${process.pid}-${Date.now()}`)
  const aside: string[] = []

  /** Moves dist-mock aside, if there is one. */
  const moveAside = (attempt: number) => {
    const old = `${temp}-old-${attempt}`
    try {
      renameSync(target, old)
      aside.push(old)
    } catch (error) {
      // another run's swap moved it first
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  /**
   * Puts this run's export in as dist-mock. A folder can't be renamed onto one with files in it,
   * so the old one goes aside first; if another run's export lands in between (ENOTEMPTY, or
   * EEXIST on some systems), that one goes aside too and the swap is tried again, so the export
   * last finished is the one kept.
   */
  const swapIn = () => {
    for (let attempt = 0; ; attempt++) {
      moveAside(attempt)
      try {
        renameSync(temp, target)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if ((code !== 'ENOTEMPTY' && code !== 'EEXIST') || attempt >= 4) throw error
      }
    }
  }

  // before the export, so an edit made while it builds leaves it stale rather than stamped current
  const stamp = inputsStamp(root)
  const [command = '', ...args] = expo ?? [
    join(client, 'node_modules/.bin/expo'),
    'export',
    '--platform',
    'web',
  ]
  const run = spawnSync(command, [...args, '--output-dir', temp], {
    cwd: client,
    stdio: 'inherit',
    env: {
      ...process.env,
      EXPO_PUBLIC_HIGHSEA_MOCK: '1',
      EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1',
      EXPO_UNSTABLE_TREE_SHAKING: '1',
    },
  })
  try {
    if (run.status !== 0 || !existsSync(join(temp, 'index.html'))) {
      console.error('The mock web export failed: dist-mock is as it was.')
      return false
    }
    writeFileSync(join(temp, STAMP_FILE), stamp)
    swapIn()
    return true
  } finally {
    // this run's own folders, whatever happened: the export if it never went in, and the old ones
    for (const folder of [temp, ...aside]) rmSync(folder, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && !exportMock()) process.exitCode = 1
