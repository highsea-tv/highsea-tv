// SPDX-License-Identifier: AGPL-3.0-only
// The dependency check (the Phase 3 plan's exit criterion 8; phase-3-checkpoint-9.md › Tests):
// `bun audit` checks the lockfile's production packages against npm's advisory database and fails
// on a high or critical advisory (https://bun.com/docs/pm/cli/audit). It reads the network, so CI
// runs it as a step, never as a test.
//
// An advisory that doesn't apply to highsea is listed in audit-exceptions.json with the reason, as
// licence exceptions are, and with the date it must be looked at again: past that date, it fails
// the check until it's fixed or reviewed. `--ignore` takes GHSA ids.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Exception = { advisory: string; package: string; until: string; reason: string }

const exceptions = JSON.parse(
  readFileSync(join(import.meta.dir, 'audit-exceptions.json'), 'utf8'),
) as Exception[]

const today = new Date().toISOString().slice(0, 10)
const problems: string[] = []
for (const e of exceptions) {
  if (!/^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/.test(e.advisory))
    problems.push(`${e.advisory}: not a GHSA id`)
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

const audit = spawnSync(
  'bun',
  ['audit', '--prod', '--audit-level=high', ...exceptions.flatMap((e) => ['--ignore', e.advisory])],
  { stdio: 'inherit' },
)
if (exceptions.length)
  console.log(
    `\nIgnored, with reasons in scripts/audit-exceptions.json: ${exceptions.map((e) => `${e.advisory} (${e.package}, until ${e.until})`).join(', ')}`,
  )
process.exit(audit.status ?? 1)
