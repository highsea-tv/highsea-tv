// SPDX-License-Identifier: AGPL-3.0-only
// The dependency check (the Phase 3 plan's exit criterion 8; phase-3-checkpoint-9.md › Tests):
// `bun audit` checks the lockfile's production packages against npm's advisory database and fails
// on a high or critical advisory (https://bun.com/docs/pm/cli/audit). It reads the network, so CI
// runs it as a step, never as a test. Since 4.4a, `cargo audit` checks the desktop app's
// Cargo.lock against RustSec's database the same way, failing on any vulnerability
// (https://docs.rs/cargo-audit/0.22.2/cargo_audit/; ADR 0058): `cargo install cargo-audit@0.22.2
// --locked` once.
//
// An advisory that doesn't apply to highsea is listed in audit-exceptions.json with the reason, as
// licence exceptions are, and with the date it must be looked at again: past that date, it fails
// the check until it's fixed or reviewed. `--ignore` takes GHSA ids for npm's packages and
// RUSTSEC ids for crates.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Exception = { advisory: string; package: string; until: string; reason: string }

const exceptions = JSON.parse(
  readFileSync(join(import.meta.dir, 'audit-exceptions.json'), 'utf8'),
) as Exception[]

const GHSA = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/
const RUSTSEC = /^RUSTSEC-\d{4}-\d{4}$/

const today = new Date().toISOString().slice(0, 10)
const problems: string[] = []
for (const e of exceptions) {
  if (!GHSA.test(e.advisory) && !RUSTSEC.test(e.advisory))
    problems.push(`${e.advisory}: not a GHSA or RUSTSEC id`)
  if (!e.reason?.trim()) problems.push(`${e.advisory}: give the reason it doesn't apply`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.until)) problems.push(`${e.advisory}: until isn't a date`)
  else if (e.until < today)
    problems.push(
      `${e.advisory} (${e.package}): its exception ran out on ${e.until}; fix or review it`,
    )
}
if (problems.length) {
  console.error(`audit-exceptions.json:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}

const ignore = (ids: RegExp) =>
  exceptions.filter((e) => ids.test(e.advisory)).flatMap((e) => ['--ignore', e.advisory])
const npm = spawnSync('bun', ['audit', '--prod', '--audit-level=high', ...ignore(GHSA)], {
  stdio: 'inherit',
})
const cargo = spawnSync(
  'cargo',
  [
    'audit',
    '--file',
    join(import.meta.dir, '../apps/desktop/src-tauri/Cargo.lock'),
    ...ignore(RUSTSEC),
  ],
  { stdio: 'inherit' },
)
if (cargo.error)
  console.error('cargo audit isn’t installed: cargo install cargo-audit@0.22.2 --locked')
if (exceptions.length)
  console.log(
    `\nIgnored, with reasons in scripts/audit-exceptions.json: ${exceptions.map((e) => `${e.advisory} (${e.package}, until ${e.until})`).join(', ')}`,
  )
process.exit(npm.status || cargo.status || (cargo.error ? 1 : 0))
