// SPDX-License-Identifier: AGPL-3.0-only
// That CI's test shards ran every test file exactly once (ADR 0062's 2026-11-17 section):
//
//   bun scripts/test-shards.ts check <folder>
//
// CI splits Bun's tests with `bun test --shard=i/n` and the client's Jest tests with
// `jest --shard=i/n`, each shard on its own runner. Both runners document that the shards are
// disjoint and cover every file (https://bun.com/docs/test/parallel,
// https://jestjs.io/docs/cli#--shard), and this checks it on the run itself, so a dropped file
// fails `check` instead of passing unnoticed. The folder holds what the shards wrote:
//
// - `bun-<i>.json`: `bun test --timings=… --update-timings` under `--shard` writes the durations
//   of the files that shard ran, keyed by their paths from the root (the same page).
// - `jest-<i>.json`: `jest --json --outputFile=…` writes each file's result, `testResults[].name`
//   being its absolute path (https://jestjs.io/docs/cli#--json).
//
// The files that should have run are the checkout's: for Bun, the names its runner looks for,
// `*.test`, `*_test`, `*.spec` and `*_spec` with a .js, .jsx, .ts, .tsx, .mjs, .cjs, .mts or .cts
// extension, outside
// node_modules (https://bun.com/docs/test, "Run tests"); for Jest, jest.config.js's `testMatch`,
// apps/client/test/**/*.jest.tsx. A file missing from every shard, or in two, fails the check.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const BUN_TEST = /(^|\/)[^/]+[._](test|spec)\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/
export const JEST_TEST = /^apps\/client\/test\/(.+\/)?[^/]+\.jest\.tsx$/

/** The files each runner should run, from a list of the checkout's paths. */
export function expected(paths: readonly string[]): { bun: string[]; jest: string[] } {
  const files = paths.filter((p) => !p.split('/').includes('node_modules'))
  return {
    bun: files.filter((p) => BUN_TEST.test(p)).sort(),
    jest: files.filter((p) => JEST_TEST.test(p)).sort(),
  }
}

export type Coverage = { missing: string[]; twice: string[]; unexpected: string[] }

/** What the shards ran, each a list of paths from the root, against what should have run. */
export function coverage(
  want: readonly string[],
  shards: readonly (readonly string[])[],
): Coverage {
  const seen = new Map<string, number>()
  for (const shard of shards) for (const file of shard) seen.set(file, (seen.get(file) ?? 0) + 1)
  const wanted = new Set(want)
  return {
    missing: want.filter((f) => !seen.has(f)),
    twice: [...seen]
      .filter(([, n]) => n > 1)
      .map(([f]) => f)
      .sort(),
    unexpected: [...seen.keys()].filter((f) => !wanted.has(f)).sort(),
  }
}

/** The files a Bun shard ran, from its timings file. */
export function bunShard(json: string): string[] {
  const parsed = JSON.parse(json) as { files?: Record<string, number> }
  return Object.keys(parsed.files ?? {})
}

/** The files a Jest shard ran, from its --json output, as paths from the root. */
export function jestShard(json: string, root: string): string[] {
  const parsed = JSON.parse(json) as { testResults?: { name: string }[] }
  return (parsed.testResults ?? []).map((r) => relative(root, r.name))
}

function report(name: string, shards: number, c: Coverage, total: number): boolean {
  console.log(`${name}: ${total} files expected, ${shards} shards`)
  for (const f of c.missing) console.log(`  not run by any shard: ${f}`)
  for (const f of c.twice) console.log(`  run by more than one shard: ${f}`)
  // a file the runner found that git doesn't track (a generated one) is reported, not failed
  for (const f of c.unexpected) console.log(`  run, but not a tracked test file: ${f}`)
  return c.missing.length === 0 && c.twice.length === 0
}

async function main(args: string[]): Promise<number> {
  const [command, folder, root = process.cwd()] = args
  if (command !== 'check' || !folder) {
    console.error('usage: bun scripts/test-shards.ts check <folder> [root]')
    return 2
  }
  const tracked = Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: root })
  if (tracked.exitCode !== 0) {
    console.error(tracked.stderr.toString())
    return 1
  }
  const want = expected(tracked.stdout.toString().split('\0').filter(Boolean))
  const names = readdirSync(folder).sort()
  const read = (n: string) => readFileSync(join(folder, n), 'utf8')
  const bun = names.filter((n) => /^bun-\d+\.json$/.test(n)).map((n) => bunShard(read(n)))
  const jest = names.filter((n) => /^jest-\d+\.json$/.test(n)).map((n) => jestShard(read(n), root))
  const ok = [
    report('Bun', bun.length, coverage(want.bun, bun), want.bun.length),
    report('Jest', jest.length, coverage(want.jest, jest), want.jest.length),
  ].every(Boolean)
  console.log(
    ok ? 'Every test file ran exactly once.' : 'The shards left a file out or ran one twice.',
  )
  return ok ? 0 : 1
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
