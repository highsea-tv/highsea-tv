// SPDX-License-Identifier: AGPL-3.0-only
// The weekly check's own logic, on results made here: nothing leaves the process.
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyStages, type StagesFile } from '@highsea-tv/catalog'
import { testFolder } from '@highsea-tv/core/testing'
import {
  addChanges,
  applyWeek,
  issueBody,
  LAUNCHD_LABEL,
  planWeek,
  readStages,
  renderPlist,
  report,
  reportedIds,
} from './catalog-check.ts'
import type { Verification, VerifiedFile } from './catalog-verify.ts'

const def = (id: string, version = '1.0.0') => ({
  id,
  version,
  minEngineVersion: '1.0.0',
  name: id.toUpperCase(),
  description: `The ${id} feed.`,
  kind: 'rss',
  privacy: 'public',
  language: 'en',
  links: [`https://${id}.test/`],
  categories: [{ id: 'movies', standard: 2000 }],
  search: { request: { path: '/rss' } },
  source: { author: 'highsea tests', documentation: `https://${id}.test/docs` },
  license: 'CC0-1.0',
})

/** A catalog folder with stable and beta definitions. */
function catalog(stable: string[], beta: string[]) {
  const dir = testFolder('catalog-check')
  mkdirSync(join(dir, 'definitions'))
  mkdirSync(join(dir, 'beta'))
  for (const id of stable)
    writeFileSync(join(dir, 'definitions', `${id}.json`), JSON.stringify(def(id)))
  for (const id of beta)
    writeFileSync(join(dir, 'beta', `${id}.json`), JSON.stringify(def(id, '1.1.0')))
  writeFileSync(join(dir, 'CHANGES.md'), '# Catalog changes\n\n## 2026.11.19.5\n\n- Before.\n')
  return dir
}

const result = (
  id: string,
  outcome: Verification['result'],
  channel: 'stable' | 'beta' = 'stable',
): Verification => ({
  id,
  name: id.toUpperCase(),
  version: channel === 'beta' ? '1.1.0' : '1.0.0',
  channel,
  result: outcome,
  reason: outcome === 'working' ? null : 'The test search for “dune”: It found nothing.',
  probes: [],
  grab: null,
})

const noVerified: VerifiedFile = { about: '', definitions: {} }

/** Plans and applies each week in turn, a week apart. */
function run(dir: string, weeks: { date: string; results: Verification[]; held?: Set<string> }[]) {
  let last: ReturnType<typeof planWeek> | null = null
  let verified = noVerified
  let stages: StagesFile = emptyStages()
  for (const w of weeks) {
    last = planWeek({
      dir,
      today: w.date,
      results: w.results,
      verified,
      stages,
      changes: readFileSync(join(dir, 'CHANGES.md'), 'utf8'),
      held: w.held,
    })
    applyWeek(dir, last)
    verified = last.verified
    stages = last.stages
  }
  return last as ReturnType<typeof planWeek>
}

describe('a week', () => {
  test('a quiet week writes the check and the counts, and no CHANGES.md line', () => {
    const dir = catalog(['alpha'], [])
    const week = run(dir, [{ date: '2026-11-23', results: [result('alpha', 'working')] }])
    expect(week.events).toEqual([])
    expect(week.changes).toBeNull()
    expect(readStages(join(dir, 'stages.json')).definitions.alpha).toMatchObject({
      status: 'working',
      passes: 1,
    })
    expect(
      JSON.parse(readFileSync(join(dir, 'verified.json'), 'utf8')).definitions.alpha,
    ).toMatchObject({
      checked: '2026-11-23',
      verified: '2026-11-23',
    })
    expect(readFileSync(join(dir, 'CHANGES.md'), 'utf8')).not.toContain('2026.11.23')
  })

  test('promotion moves the beta file over the stable one, with its check, and notes it', () => {
    const dir = catalog(['alpha'], ['alpha'])
    const week = run(dir, [
      {
        date: '2026-11-23',
        results: [result('alpha', 'working'), result('alpha', 'working', 'beta')],
      },
      {
        date: '2026-11-30',
        results: [result('alpha', 'working'), result('alpha', 'working', 'beta')],
      },
    ])
    expect(week.events.map((e) => e.kind)).toEqual(['promoted'])
    expect(existsSync(join(dir, 'beta', 'alpha.json'))).toBe(false)
    expect(JSON.parse(readFileSync(join(dir, 'definitions', 'alpha.json'), 'utf8')).version).toBe(
      '1.1.0',
    )
    const verified = JSON.parse(readFileSync(join(dir, 'verified.json'), 'utf8')).definitions
    expect(Object.keys(verified)).toEqual(['alpha'])
    expect(verified.alpha).toMatchObject({ version: '1.1.0', channel: 'stable' })
    expect(Object.keys(readStages(join(dir, 'stages.json')).definitions)).toEqual(['alpha'])
    expect(readFileSync(join(dir, 'CHANGES.md'), 'utf8')).toStartWith(
      '# Catalog changes\n\n## 2026.11.30\n\n- ALPHA moves from Beta to stable.\n\n## 2026.11.19.5',
    )
  })

  test('an open report holds a promotion; the report says so', () => {
    const dir = catalog([], ['bravo'])
    const week = run(dir, [
      { date: '2026-11-23', results: [result('bravo', 'working', 'beta')] },
      {
        date: '2026-11-30',
        results: [result('bravo', 'working', 'beta')],
        held: new Set(['bravo']),
      },
    ])
    expect(existsSync(join(dir, 'beta', 'bravo.json'))).toBe(true)
    expect(
      report({ today: '2026-11-30', results: [result('bravo', 'working', 'beta')], week }),
    ).toContain('Held on Beta:\n- BRAVO (beta/bravo): An open report names it.')
  })

  test('the report: newly broken, recovered, promoted and due for retirement', () => {
    const dir = catalog(['alpha', 'charlie'], ['bravo'])
    const stages: StagesFile = {
      ...emptyStages(),
      definitions: {
        alpha: {
          name: 'ALPHA',
          status: 'working',
          since: null,
          note: null,
          version: '1.0.0',
          firstSeen: '2026-11-01',
          passes: 3,
          failures: 1,
        },
        charlie: {
          name: 'CHARLIE',
          status: 'broken',
          since: '2026-10-20',
          note: 'x',
          version: '1.0.0',
          firstSeen: '2026-10-01',
          passes: 0,
          failures: 2,
        },
        delta: {
          name: 'DELTA',
          status: 'broken',
          since: '2026-10-01',
          note: 'x',
          version: '1.0.0',
          firstSeen: '2026-09-01',
          passes: 0,
          failures: 6,
        },
        'beta/bravo': {
          name: 'BRAVO',
          status: 'working',
          since: null,
          note: null,
          version: '1.1.0',
          firstSeen: '2026-11-16',
          passes: 1,
          failures: 0,
        },
      },
    }
    const results = [
      result('alpha', 'failing'),
      result('bravo', 'working', 'beta'),
      result('charlie', 'working'),
    ]
    const week = planWeek({
      dir,
      today: '2026-11-23',
      results,
      verified: noVerified,
      stages,
      changes: readFileSync(join(dir, 'CHANGES.md'), 'utf8'),
    })
    expect(report({ today: '2026-11-23', results, week })).toBe(
      [
        'Catalog check, 2026-11-23',
        '',
        'Newly broken:',
        '- ALPHA (alpha): The test search for “dune”: It found nothing.',
        '',
        'Recovered:',
        '- CHARLIE (charlie)',
        '',
        'Promoted to stable:',
        `- BRAVO (beta/bravo): a week on Beta and two passing checks; ${join(dir, 'beta/bravo.json')} moved to ${join(dir, 'definitions/bravo.json')}`,
        '',
        'Due for retirement:',
        '- DELTA (delta): broken since 2026-10-01, 53 days. If there\'s no fix in sight: bun run catalog:check retire delta --note "…"',
        '',
        'Checked 3: 2 working, 1 failing, 0 challenge, 0 skipped.',
        '- alpha: The test search for “dune”: It found nothing.',
      ].join('\n'),
    )
    expect(week.changes).toContain(
      '## 2026.11.23\n\n- ALPHA is marked broken: two weekly checks failed.\n- CHARLIE works again.\n- BRAVO moves from Beta to stable.\n',
    )
  })

  test('a second run the same day adds a version after the first', () => {
    expect(addChanges('# C\n\n## 2026.11.23\n\n- a\n', ['b'], '2026-11-23')).toBe(
      '# C\n\n## 2026.11.23.2\n\n- b\n\n## 2026.11.23\n\n- a\n',
    )
  })
})

describe('GitHub', () => {
  test('the reports’ indexer ids come from the form’s first field', () => {
    const body = (id: string) =>
      `### Which indexer\n\n${id}\n\n### Indexer version\n\n3\n\n### What happens\n\nNo results`
    expect([
      ...reportedIds([
        { body: body('yts') },
        { body: body('Knaben ') },
        { body: null },
        { body: body('_No response_') },
      ]),
    ]).toEqual(['yts', 'knaben'])
  })

  test('the issue’s table has every definition’s stage, status and dates', () => {
    const verified: VerifiedFile = {
      about: '',
      definitions: {
        'beta/bravo': {
          name: 'B',
          version: '1.1.0',
          channel: 'beta',
          result: 'working',
          reason: null,
          checked: '2026-11-23',
          verified: '2026-11-23',
          counts: { probes: 1, working: 1, releases: 1, withSize: 1 },
        },
        yts: {
          name: 'YTS',
          version: '1.0.0',
          channel: 'stable',
          result: 'failing',
          reason: 'x',
          checked: '2026-11-23',
          verified: null,
          counts: { probes: 1, working: 0, releases: 0, withSize: 0 },
        },
      },
    }
    const stages: StagesFile = {
      ...emptyStages(),
      definitions: {
        yts: {
          name: 'YTS',
          status: 'broken',
          since: '2026-11-23',
          note: 'x',
          version: '1.0.0',
          firstSeen: '2026-11-01',
          passes: 0,
          failures: 2,
        },
      },
    }
    const body = issueBody('2026-11-23', verified, stages)
    expect(body).toContain(
      '| beta/bravo | 1.1.0 | Beta | working | working | 2026-11-23 | 2026-11-23 |',
    )
    expect(body).toContain('| yts | 1.0.0 | Stable | broken | failing | 2026-11-23 | — |')
  })
})

describe('launchd', () => {
  const template = readFileSync(join(import.meta.dir, 'launchd', `${LAUNCHD_LABEL}.plist`), 'utf8')

  test('the paths are filled in, escaped, and nothing is left to fill', () => {
    const plist = renderPlist(template, {
      bun: '/Users/o/.bun/bin/bun',
      repo: '/Users/o/highsea & co',
      path: '/Users/o/.bun/bin:/usr/bin:/bin',
      log: '/Users/o/Library/Logs/highsea-catalog-check.log',
    })
    expect(plist).not.toMatch(/__[A-Z]+__/)
    expect(plist).toContain('<string>/Users/o/highsea &amp; co</string>')
    expect(plist).toContain(`<string>${LAUNCHD_LABEL}</string>`)
    // weekly: Monday at 09:00
    expect(plist).toMatch(
      /<key>Weekday<\/key>\s*<integer>1<\/integer>\s*<key>Hour<\/key>\s*<integer>9<\/integer>/,
    )
  })
})
