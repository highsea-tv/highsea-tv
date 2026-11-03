// SPDX-License-Identifier: AGPL-3.0-only
// Runs one XCUITest on a booted simulator, for tv.ts and tv-compare.ts (apps/tv/uitest's DpadWalk,
// the default) and layout.ts (apps/client/uitest's Layout): the project generated with XcodeGen
// into a scratch folder, then `xcodebuild test`
// (https://developer.apple.com/documentation/xctest/xcuiremote). Variables for the test go
// through xcodebuild's TEST_RUNNER_ prefix (man xcodebuild). Lines the test prints with its prefix
// (`WALK ` by default) are shown as they come, so a long run shows how far it has got.
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from './lib.ts'

/** Which test project to run, and how to show and bound its run. */
export type UITestProject = {
  /** The XcodeGen spec's folder, from the repository's root. */
  dir: string
  /** The project's name in the spec (`<name>.xcodeproj`). */
  project: string
  scheme: string
  /** The test case's class, for -only-testing (`<scheme>/<class>/<test>`). */
  testClass: string
  /** Lines with this are shown as they come, from where it starts. */
  prefix: string
  /** The run is stopped after this long (ms), as a failure; none by default. */
  timeout?: number
}

const DPAD_WALK: UITestProject = {
  dir: 'apps/tv/uitest',
  project: 'DpadWalk',
  scheme: 'DpadWalk',
  testClass: 'DpadWalk',
  prefix: 'WALK ',
}

/**
 * Runs `<scheme>/<testClass>/<test>` on the simulator and returns whether it passed, with its
 * output's lines and whether it was stopped for taking too long.
 */
export async function runUITest(
  udid: string,
  test: string,
  env: Record<string, string> = {},
  project: UITestProject = DPAD_WALK,
) {
  const work = mkdtempSync(join(tmpdir(), 'highsea-uitest-'))
  try {
    cpSync(join(ROOT, project.dir), work, { recursive: true })
    execFileSync('xcodegen', ['generate', '--quiet'], { cwd: work, stdio: 'inherit' })
    const run = spawn(
      'xcodebuild',
      [
        'test',
        '-project',
        `${project.project}.xcodeproj`,
        '-scheme',
        project.scheme,
        '-destination',
        `id=${udid}`,
        '-derivedDataPath',
        'build',
        `-only-testing:${project.scheme}/${project.testClass}/${test}`,
        'CODE_SIGNING_ALLOWED=NO',
      ],
      {
        cwd: work,
        env: {
          ...process.env,
          ...Object.fromEntries(Object.entries(env).map(([k, v]) => [`TEST_RUNNER_${k}`, v])),
        },
      },
    )
    let timedOut = false
    const timer = project.timeout
      ? setTimeout(() => {
          timedOut = true
          run.kill('SIGTERM')
        }, project.timeout)
      : undefined
    const lines: string[] = []
    let rest = ''
    const take = (chunk: Buffer) => {
      const parts = (rest + chunk.toString('utf8')).split('\n')
      rest = parts.pop() ?? ''
      for (const line of parts) {
        lines.push(line)
        if (line.includes(project.prefix)) console.log(line.slice(line.indexOf(project.prefix)))
      }
    }
    run.stdout.on('data', take)
    run.stderr.on('data', take)
    const status = await new Promise<number | null>((done) => run.on('close', done))
    clearTimeout(timer)
    if (rest) lines.push(rest)
    if (timedOut) console.error(`xcodebuild was stopped after ${project.timeout} ms`)
    if (status !== 0)
      console.error(
        lines
          .filter((l) => /error|failed/i.test(l))
          .slice(-20)
          .join('\n'),
      )
    return { passed: status === 0 && !timedOut, lines, timedOut }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** The booted simulator of a runtime, or the one `variable` names: exactly one should be booted. */
export function booted(runtime: 'iOS' | 'tvOS', variable: string): string {
  const named = process.env[variable]
  if (named) return named
  const list = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], { encoding: 'utf8' }),
  ) as { devices: Record<string, { udid: string; name: string }[]> }
  const devices = Object.entries(list.devices)
    .filter(([r]) => r.includes(`SimRuntime.${runtime}-`))
    .flatMap(([, d]) => d)
  const [one] = devices
  if (!one || devices.length > 1)
    throw new Error(
      `${devices.length} ${runtime} simulators are booted: boot one, or name one in ${variable}`,
    )
  return one.udid
}

/** The booted Apple TV simulator's UDID, or TV_SIMULATOR's: exactly one should be booted. */
export const bootedTV = (): string => booted('tvOS', 'TV_SIMULATOR')

/** The booted iPhone simulator's UDID, or PHONE_SIMULATOR's: exactly one should be booted. */
export const bootedPhone = (): string => booted('iOS', 'PHONE_SIMULATOR')
