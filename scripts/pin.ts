// SPDX-License-Identifier: AGPL-3.0-only
// The dependency rule (docs/plans/phase-3-server.md#standing-rules): pin exact versions released
// at least two weeks ago, with a compatible license. This prints, for each package, the highest
// stable version published before the cutoff that isn't deprecated, its date and its license.
// `name@2` keeps to one major version. With --crate, the names are Rust crates on crates.io, and
// a yanked version counts as deprecated (ADR 0058).
// Usage: bun run pin hono zod next
//        bun run pin --crate tauri@2 keyring
import { execFileSync } from 'node:child_process'

const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
const semver = (v: string) => v.split('.').map(Number) as [number, number, number]
const stable = /^\d+\.\d+\.\d+$/
const newestFirst = ([a]: [string, ...unknown[]], [b]: [string, ...unknown[]]) => {
  const [x, y] = [semver(a), semver(b)]
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]
}

/** `name` or `name@major`; npm's scoped names keep their leading @. */
function parse(arg: string): { name: string; major: number | null } {
  const at = arg.lastIndexOf('@')
  if (at <= 0) return { name: arg, major: null }
  return { name: arg.slice(0, at), major: Number(arg.slice(at + 1)) }
}

const inMajor = (v: string, major: number | null) => major === null || semver(v)[0] === major

function npm(name: string, major: number | null) {
  const view = (field: string, spec = name) =>
    execFileSync('npm', ['view', spec, field, '--json'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
  const times = JSON.parse(view('time')) as Record<string, string>
  const license = JSON.parse(view('license') || '"UNKNOWN"') as string
  // a deprecated version is one its authors say not to use (Fumadocs 17.0.0 was published by
  // mistake), so the next one down is offered instead
  const [version, date] =
    Object.entries(times)
      .filter(([v, d]) => stable.test(v) && inMajor(v, major) && Date.parse(d) < cutoff)
      .sort(newestFirst)
      .find(([v]) => !view('deprecated', `${name}@${v}`).trim()) ?? []
  return version ? { version, date, license } : null
}

type CrateVersion = { num: string; created_at: string; yanked: boolean; license: string | null }

/** crates.io's API asks for a User-Agent that says who's calling (https://crates.io/data-access). */
async function crate(name: string, major: number | null) {
  const res = await fetch(`https://crates.io/api/v1/crates/${name}/versions?per_page=100`, {
    headers: { 'user-agent': 'highsea pin (https://github.com/highsea-tv/highsea-tv)' },
  })
  if (!res.ok) throw new Error(`crates.io answered ${res.status}`)
  const { versions } = (await res.json()) as { versions: CrateVersion[] }
  const [version, date, license] =
    versions
      .filter(
        (v) =>
          !v.yanked &&
          stable.test(v.num) &&
          inMajor(v.num, major) &&
          Date.parse(v.created_at) < cutoff,
      )
      .map((v) => [v.num, v.created_at, v.license ?? 'UNKNOWN'] as [string, string, string])
      .sort(newestFirst)[0] ?? []
  return version ? { version, date, license } : null
}

const args = process.argv.slice(2)
const crates = args.includes('--crate')
for (const arg of args.filter((a) => a !== '--crate')) {
  const { name, major } = parse(arg)
  try {
    const found = crates ? await crate(name, major) : npm(name, major)
    console.log(
      found
        ? `${name}${crates ? ' = "=' : '@'}${found.version}${crates ? '"' : ''}  (${found.date?.slice(0, 10)}, ${found.license})`
        : `${name}: nothing older than two weeks`,
    )
  } catch {
    console.log(`${name}: not found`)
  }
}
