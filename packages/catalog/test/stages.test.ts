// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's stages (ADR 0069): the weekly rules, what the bundle carries, and its schema.
import { describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BuildError, buildCatalog, writeCatalog } from '../src/build.ts'
import { bundleSchema } from '../src/format.ts'
import { sha256, signManifest } from '../src/signing.ts'
import {
  applyChecks,
  BETA_DAYS,
  bundleStatuses,
  type CheckInput,
  daysBetween,
  definitionStatusSchema,
  emptyStages,
  RETIRE_AFTER_DAYS,
  RETIRED_KEPT_DAYS,
  readStatuses,
  retire,
  type StagesFile,
  stagesFileSchema,
} from '../src/stages.ts'
import { definition, keyPair, setup, sources, tmp } from './helpers.ts'

const ROOT = join(import.meta.dir, '../../..')

const check = (key: string, result: CheckInput['result'], version = '1.0.0'): CheckInput => ({
  key,
  name: key,
  version,
  result,
  reason: result === 'working' ? null : 'The test search: It found nothing.',
})

/** Runs weekly checks in turn, a week apart from `start`. */
function weeks(start: string, runs: CheckInput[][], stages = emptyStages(), held?: Set<string>) {
  let s: StagesFile = stages
  const all = []
  let day = Date.parse(`${start}T00:00:00Z`)
  for (const run of runs) {
    const date = new Date(day).toISOString().slice(0, 10)
    const out = applyChecks(s, run, date, held)
    s = out.stages
    all.push({ date, events: out.events })
    day += BETA_DAYS * 86_400_000
  }
  return { stages: s, runs: all }
}

describe('dates', () => {
  test('whole days between two dates, across a month and a year', () => {
    expect(daysBetween('2026-11-19', '2026-11-26')).toBe(7)
    expect(daysBetween('2026-11-30', '2026-12-30')).toBe(30)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    // the clocks change in late March and October in Europe; dates stay whole days
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2)
  })
})

describe('Beta to stable: a week and two passing checks', () => {
  test('two passes a week apart promote it on the second', () => {
    const { runs, stages } = weeks('2026-11-19', [
      [check('beta/yts', 'working')],
      [check('beta/yts', 'working')],
    ])
    expect(runs[0]?.events).toEqual([])
    expect(runs[1]?.events).toEqual([
      { kind: 'promoted', key: 'beta/yts', name: 'beta/yts', id: 'yts' },
    ])
    expect(Object.keys(stages.definitions)).toEqual(['yts'])
    expect(stages.definitions.yts).toMatchObject({ passes: 2, firstSeen: '2026-11-19' })
  })

  test('two passes within the week aren’t enough', () => {
    const first = applyChecks(emptyStages(), [check('beta/yts', 'working')], '2026-11-19')
    const second = applyChecks(first.stages, [check('beta/yts', 'working')], '2026-11-25')
    expect(second.events).toEqual([])
    const third = applyChecks(second.stages, [check('beta/yts', 'working')], '2026-11-26')
    expect(third.events.map((e) => e.kind)).toEqual(['promoted'])
  })

  test('a week with one pass and one failure isn’t enough, and a new version starts again', () => {
    const { runs, stages } = weeks('2026-11-19', [
      [check('beta/yts', 'failing')],
      [check('beta/yts', 'working')],
      [check('beta/yts', 'working', '1.0.1')],
      [check('beta/yts', 'working', '1.0.1')],
    ])
    expect(runs.map((r) => r.events.map((e) => e.kind))).toEqual([[], [], [], ['promoted']])
    expect(stages.definitions.yts).toMatchObject({ version: '1.0.1', firstSeen: '2026-12-03' })
  })

  test('an open report holds it on Beta', () => {
    const { runs, stages } = weeks(
      '2026-11-19',
      [[check('beta/yts', 'working')], [check('beta/yts', 'working')]],
      emptyStages(),
      new Set(['yts']),
    )
    expect(runs[1]?.events).toEqual([
      { kind: 'held', key: 'beta/yts', name: 'beta/yts', why: 'An open report names it.' },
    ])
    expect(Object.keys(stages.definitions)).toEqual(['beta/yts'])
  })

  test('a definition left out of this run isn’t promoted', () => {
    const one = applyChecks(emptyStages(), [check('beta/yts', 'working')], '2026-11-19')
    const two = applyChecks(one.stages, [check('beta/yts', 'working')], '2026-11-22')
    const three = applyChecks(two.stages, [check('knaben', 'working')], '2026-11-29')
    expect(three.events).toEqual([])
    expect(Object.keys(three.stages.definitions)).toEqual(['beta/yts', 'knaben'])
  })

  test('a stable definition is never “promoted”', () => {
    const { runs } = weeks('2026-11-19', [[check('yts', 'working')], [check('yts', 'working')]])
    expect(runs.flatMap((r) => r.events)).toEqual([])
  })
})

describe('broken and recovered', () => {
  test('one failure is never enough; two in a row make it broken, with a note', () => {
    const { runs, stages } = weeks('2026-11-19', [
      [check('yts', 'working')],
      [check('yts', 'failing')],
      [check('yts', 'failing')],
    ])
    expect(runs.map((r) => r.events.map((e) => e.kind))).toEqual([[], [], ['broken']])
    expect(stages.definitions.yts).toMatchObject({
      status: 'broken',
      since: '2026-12-03',
      note: 'Its searches stopped working. A fix is being worked on.',
      failures: 2,
    })
  })

  test('a failure between passes resets the count', () => {
    const { runs } = weeks('2026-11-19', [
      [check('yts', 'failing')],
      [check('yts', 'working')],
      [check('yts', 'failing')],
    ])
    expect(runs.flatMap((r) => r.events)).toEqual([])
  })

  test('a challenge counts as a failure, and its note says so', () => {
    const { stages } = weeks('2026-11-19', [
      [check('yts', 'challenge')],
      [check('yts', 'challenge')],
    ])
    expect(stages.definitions.yts?.note).toBe(
      'The site now shows a browser challenge to searches. A fix is being worked on.',
    )
  })

  test('a skipped check changes nothing', () => {
    const { stages } = weeks('2026-11-19', [
      [check('yts', 'failing')],
      [check('yts', 'skipped')],
      [check('yts', 'failing')],
    ])
    expect(stages.definitions.yts?.status).toBe('broken')
  })

  test('a pass recovers a broken one, and clears its note', () => {
    const { runs, stages } = weeks('2026-11-19', [
      [check('yts', 'failing')],
      [check('yts', 'failing')],
      [check('yts', 'working')],
    ])
    expect(runs[2]?.events).toEqual([{ kind: 'recovered', key: 'yts', name: 'yts' }])
    expect(stages.definitions.yts).toMatchObject({ status: 'working', since: null, note: null })
  })

  test('broken by hand (the NAS and a report agree) stays broken until a pass', () => {
    const stages: StagesFile = {
      ...emptyStages(),
      definitions: {
        yts: {
          name: 'YTS',
          status: 'broken',
          since: '2026-11-20',
          note: 'The site changed how it answers searches. A fix is being worked on.',
          version: '1.0.0',
          firstSeen: '2026-11-01',
          passes: 3,
          failures: 0,
        },
      },
    }
    const failing = applyChecks(stages, [check('yts', 'failing')], '2026-11-26')
    expect(failing.events).toEqual([])
    expect(failing.stages.definitions.yts?.note).toContain('changed how it answers')
  })
})

describe('retirement after 30 days broken', () => {
  const broken = (since: string): StagesFile => ({
    ...emptyStages(),
    definitions: {
      yts: {
        name: 'YTS',
        status: 'broken',
        since,
        note: 'Its searches stopped working. A fix is being worked on.',
        version: '1.0.0',
        firstSeen: '2026-10-01',
        passes: 0,
        failures: 4,
      },
    },
  })

  test('29 days isn’t due; 30 is', () => {
    expect(applyChecks(broken('2026-11-01'), [], '2026-11-30').events).toEqual([])
    expect(RETIRE_AFTER_DAYS).toBe(30)
    expect(applyChecks(broken('2026-11-01'), [], '2026-12-01').events).toEqual([
      { kind: 'retire-due', key: 'yts', name: 'YTS', since: '2026-11-01', days: 30 },
    ])
  })

  test('retiring keeps the note; a retired one is never checked again', () => {
    const retired = retire(
      broken('2026-11-01'),
      'yts',
      'YTS',
      '1.0.0',
      'The site closed.',
      '2026-12-02',
    )
    expect(retired.definitions.yts).toMatchObject({
      status: 'retired',
      since: '2026-12-02',
      note: 'The site closed.',
    })
    expect(applyChecks(retired, [check('yts', 'working')], '2026-12-09')).toEqual({
      stages: retired,
      events: [],
    })
  })
})

describe('the bundle', () => {
  const verified = {
    about: '',
    definitions: {
      yts: {
        name: 'YTS',
        version: '1.0.0',
        channel: 'stable' as const,
        result: 'working' as const,
        reason: null,
        checked: '2026-11-19',
        verified: '2026-11-19',
        counts: { probes: 3, working: 3, releases: 60, withSize: 60 },
      },
      'beta/knaben': {
        name: 'Knaben',
        version: '1.1.0',
        channel: 'beta' as const,
        result: 'failing' as const,
        reason: 'x',
        checked: '2026-11-19',
        verified: '2026-11-12',
        counts: { probes: 3, working: 1, releases: 20, withSize: 20 },
      },
    },
  }
  const stages: StagesFile = {
    ...emptyStages(),
    definitions: {
      gone: {
        name: 'Gone',
        status: 'retired',
        since: '2026-11-01',
        note: 'The site closed.',
        version: '1.0.0',
        firstSeen: '2026-10-01',
        passes: 0,
        failures: 0,
      },
      yts: {
        name: 'YTS',
        status: 'broken',
        since: '2026-11-19',
        note: 'Its searches stopped working. A fix is being worked on.',
        version: '1.0.0',
        firstSeen: '2026-10-01',
        passes: 0,
        failures: 2,
      },
    },
  }

  test('each definition’s stage, status and last check, and a retired one’s note', () => {
    const out = bundleStatuses({
      channel: 'beta',
      chosen: [
        { id: 'knaben', name: 'Knaben', version: '1.1.0', from: 'beta' },
        { id: 'yts', name: 'YTS', version: '1.0.0', from: 'stable' },
      ],
      verified,
      stages,
      today: '2026-11-20',
    })
    expect(out).toEqual({
      gone: {
        name: 'Gone',
        stage: 'stable',
        status: 'retired',
        since: '2026-11-01',
        note: 'The site closed.',
        checked: null,
        result: null,
        verified: null,
      },
      knaben: {
        name: 'Knaben',
        stage: 'beta',
        status: 'working',
        since: null,
        note: null,
        checked: '2026-11-19',
        result: 'failing',
        verified: '2026-11-12',
      },
      yts: {
        name: 'YTS',
        stage: 'stable',
        status: 'broken',
        since: '2026-11-19',
        note: 'Its searches stopped working. A fix is being worked on.',
        checked: '2026-11-19',
        result: 'working',
        verified: '2026-11-19',
      },
    })
    for (const v of Object.values(out)) expect(definitionStatusSchema.parse(v)).toEqual(v)
  })

  test('a new version is neither checked nor broken yet', () => {
    const out = bundleStatuses({
      channel: 'stable',
      chosen: [{ id: 'yts', name: 'YTS', version: '1.0.1', from: 'stable' }],
      verified,
      stages,
      today: '2026-11-20',
    })
    expect(out.yts).toMatchObject({ status: 'working', checked: null, verified: null, note: null })
  })

  test('a retired note goes after 6 months; a beta one stays off stable', () => {
    const later = (today: string, channel: 'stable' | 'beta', key = 'gone') =>
      bundleStatuses({
        channel,
        chosen: [],
        verified: null,
        stages: { ...stages, definitions: { [key]: stages.definitions.gone as never } },
        today,
      })
    expect(RETIRED_KEPT_DAYS).toBe(183)
    expect(Object.keys(later('2027-05-02', 'stable'))).toEqual(['gone'])
    expect(Object.keys(later('2027-05-03', 'stable'))).toEqual([])
    expect(Object.keys(later('2026-11-20', 'stable', 'beta/gone'))).toEqual([])
    expect(Object.keys(later('2026-11-20', 'beta', 'beta/gone'))).toEqual(['gone'])
  })

  test('an entry a server can’t read is skipped, never the bundle', () => {
    const parsed = bundleSchema.parse({
      format: 1,
      kind: 'indexers',
      version: '2026.11.20',
      definitions: [],
      status: {
        yts: {
          ...{ name: 'YTS', stage: 'stable', status: 'working' },
          since: null,
          note: null,
          checked: null,
          result: null,
          verified: null,
          later: 1,
        },
        future: { name: 'F', stage: 'stable', status: 'deprecated' },
      },
    })
    expect([...readStatuses(parsed.status).keys()]).toEqual(['yts'])
    // an older server's schema had no `status`: Zod's object drops what it doesn't know
    const older = bundleSchema.omit({ status: true }).parse({ ...parsed })
    expect('status' in older).toBe(false)
  })
})

describe('the build', () => {
  const key = keyPair()

  test('the bundle carries the stages, signed with the definitions', () => {
    const root = sources([definition('alpha')], ['2026.11.20'], [definition('bravo')])
    writeFileSync(
      join(root, 'stages.json'),
      JSON.stringify({
        ...emptyStages(),
        definitions: {
          'beta/bravo': {
            name: 'bravo',
            status: 'working',
            since: null,
            note: null,
            version: '1.0.0',
            firstSeen: '2026-11-19',
            passes: 1,
            failures: 0,
          },
        },
      }),
    )
    const [stable, beta] = buildCatalog({ root }, key)
    expect(Object.keys(JSON.parse(stable?.bundle as string).status)).toEqual(['alpha'])
    const betaStatus = JSON.parse(beta?.bundle as string).status
    expect(betaStatus.bravo.stage).toBe('beta')
    expect(betaStatus.alpha.stage).toBe('stable')
  })

  test('a stages file that doesn’t validate stops the build', () => {
    const root = sources([definition('alpha')], ['2026.11.20'])
    writeFileSync(join(root, 'stages.json'), JSON.stringify({ about: '', definitions: {} }))
    expect(() => buildCatalog({ root }, key)).toThrow('stages.json doesn’t validate')
  })

  test('public indexers are never on by default: a starter must be listed, and never from Beta', () => {
    const root = sources(
      [definition('alpha', { starter: true }), definition('bravo', { starter: true })],
      ['2026.11.20'],
      [definition('charlie', { starter: true })],
    )
    writeFileSync(
      join(root, 'stages.json'),
      JSON.stringify({ ...emptyStages(), starters: ['alpha', 'charlie'] }),
    )
    try {
      buildCatalog({ root }, key)
      throw new Error('it built')
    } catch (e) {
      expect(e).toBeInstanceOf(BuildError)
      expect((e as BuildError).problems.map((p) => p.file)).toEqual(['bravo.yml', 'charlie.yml'])
    }
  })

  test('the repo’s stages validate, and only the Internet Archive is a starter', () => {
    const file = stagesFileSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'catalog/indexers/stages.json'), 'utf8')),
    )
    expect(file.starters).toEqual(['internet-archive'])
  })
})

describe('the server', () => {
  test('reads each definition’s status, and a retired one’s note by its id', () => {
    const key = keyPair()
    const root = sources([definition('alpha')], ['2026.11.20'])
    writeFileSync(
      join(root, 'verified.json'),
      JSON.stringify({
        about: '',
        definitions: {
          alpha: {
            name: 'alpha',
            version: '1.0.0',
            channel: 'stable',
            result: 'working',
            reason: null,
            checked: '2026-11-19',
            verified: '2026-11-19',
            counts: { probes: 2, working: 2, releases: 10, withSize: 10 },
          },
        },
      }),
    )
    const retiredStages = retire(
      emptyStages(),
      'gone',
      'Gone',
      '1.0.0',
      'The site closed.',
      '2026-11-19',
    )
    writeFileSync(join(root, 'stages.json'), JSON.stringify(retiredStages))
    const seed = tmp('seed')
    writeCatalog(buildCatalog({ root }, key), seed)
    const s = setup({ seedDir: seed, mainUrl: null, trusted: [key.trusted] })
    s.catalog.start()
    expect(s.catalog.definition('alpha')?.status).toMatchObject({
      stage: 'stable',
      status: 'working',
      checked: '2026-11-19',
      verified: '2026-11-19',
    })
    expect(s.catalog.definition('gone')).toBeNull()
    expect(s.catalog.statusOf('gone')).toMatchObject({
      status: 'retired',
      note: 'The site closed.',
    })
  })

  test('a catalog built before stages installs as before, with nothing known', () => {
    const key = keyPair()
    const [built] = buildCatalog({ root: sources([definition('alpha')], ['2026.10.14']) }, key)
    // the bundle as a build before stages wrote it, signed again
    const { status: _, ...bundle } = JSON.parse(built?.bundle as string)
    const text = JSON.stringify(bundle)
    const manifest = {
      ...(built?.manifest as object),
      bundle: {
        path: 'indexers-2026.10.14.json',
        sha256: sha256(text),
        size: Buffer.byteLength(text),
      },
    }
    const seed = tmp('seed')
    mkdirSync(join(seed, 'stable'), { recursive: true })
    writeFileSync(join(seed, 'stable', 'indexers-2026.10.14.json'), text)
    writeFileSync(
      join(seed, 'stable', 'manifest.json'),
      JSON.stringify(signManifest(JSON.stringify(manifest), key.privateKey, key.keyId)),
    )
    const s = setup({ seedDir: seed, mainUrl: null, trusted: [key.trusted] })
    s.catalog.start()
    expect(s.catalog.definition('alpha')?.status).toBeNull()
    expect(s.catalog.statusOf('alpha')).toBeNull()
  })
})
