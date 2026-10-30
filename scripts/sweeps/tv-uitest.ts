// SPDX-License-Identifier: AGPL-3.0-only
// Runs one of apps/tv/uitest's XCUITests on the booted Apple TV simulator, for tv.ts and
// tv-compare.ts: the project generated with XcodeGen into a scratch folder, then `xcodebuild
// test` (https://developer.apple.com/documentation/xctest/xcuiremote). Variables for the test go
// through xcodebuild's TEST_RUNNER_ prefix (man xcodebuild).
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from './lib.ts'

/** Runs `DpadWalk/<test>` and returns whether it passed, with its output's lines. */
export function runUITest(udid: string, test: string, env: Record<string, string> = {}) {
  const work = mkdtempSync(join(tmpdir(), 'highsea-tv-uitest-'))
  try {
    cpSync(join(ROOT, 'apps/tv/uitest'), work, { recursive: true })
    execFileSync('xcodegen', ['generate', '--quiet'], { cwd: work, stdio: 'inherit' })
    const run = spawnSync(
      'xcodebuild',
      [
        'test',
        '-project',
        'DpadWalk.xcodeproj',
        '-scheme',
        'DpadWalk',
        '-destination',
        `id=${udid}`,
        '-derivedDataPath',
        'build',
        `-only-testing:DpadWalk/DpadWalk/${test}`,
        'CODE_SIGNING_ALLOWED=NO',
      ],
      {
        cwd: work,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...Object.fromEntries(Object.entries(env).map(([k, v]) => [`TEST_RUNNER_${k}`, v])),
        },
        maxBuffer: 64 * 1024 * 1024,
      },
    )
    const lines = `${run.stdout}${run.stderr}`.split('\n')
    if (run.status !== 0)
      console.error(
        lines
          .filter((l) => /error|failed/i.test(l))
          .slice(-20)
          .join('\n'),
      )
    return { passed: run.status === 0, lines }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** The booted Apple TV simulator's UDID, or TV_SIMULATOR's: exactly one should be booted. */
export function bootedTV(): string {
  if (process.env.TV_SIMULATOR) return process.env.TV_SIMULATOR
  const list = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], { encoding: 'utf8' }),
  ) as { devices: Record<string, { udid: string; name: string }[]> }
  const tvs = Object.entries(list.devices)
    .filter(([runtime]) => runtime.includes('tvOS'))
    .flatMap(([, devices]) => devices)
  const [one] = tvs
  if (!one || tvs.length > 1)
    throw new Error(
      `${tvs.length} Apple TV simulators are booted: boot one, or name one in TV_SIMULATOR`,
    )
  return one.udid
}
