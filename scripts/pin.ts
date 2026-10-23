// SPDX-License-Identifier: AGPL-3.0-only
// The dependency rule (docs/plans/phase-3-server.md#standing-rules): pin exact versions released
// at least two weeks ago, with a compatible license. This prints, for each package, the highest
// stable version published before the cutoff that isn't deprecated, its date and its license.
// Usage: bun run pin hono zod next
import { execFileSync } from 'node:child_process'

const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
const semver = (v: string) => v.split('.').map(Number) as [number, number, number]

for (const name of process.argv.slice(2)) {
  try {
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
        .filter(([v, d]) => /^\d+\.\d+\.\d+$/.test(v) && Date.parse(d) < cutoff)
        .sort(([a], [b]) => {
          const [x, y] = [semver(a), semver(b)]
          return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]
        })
        .find(([v]) => !view('deprecated', `${name}@${v}`).trim()) ?? []
    console.log(
      version
        ? `${name}@${version}  (${date?.slice(0, 10)}, ${license})`
        : `${name}: nothing older than two weeks`,
    )
  } catch {
    console.log(`${name}: not found`)
  }
}
