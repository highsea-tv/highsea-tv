// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's weekly check (docs/plans/indexer-catalog-upkeep.md, part B; ADR 0069), run on the
// owner's Mac by launchd, never in CI: many public sites turn away datacentre addresses.
//
//   bun run catalog:check              check every definition live, then update verified.json, the
//                                      stages (stages.json, files moved from beta/ to definitions/),
//                                      CHANGES.md and the seed, and print what changed
//     --dry                            print the report, change no file
//     --github                         also read open "An indexer isn't working" reports (a
//                                      definition with one isn't promoted) and keep the "Catalog
//                                      check" issue up to date, with the owner's own `gh`
//   bun run catalog:check retire <id> --note "The site closed."
//                                      retire a definition: its files go, its note stays 6 months
//   bun run catalog:check schedule     install the weekly launchd job for this checkout
//   bun run catalog:check unschedule   remove it
//
// It makes no commit and pushes nothing: what it changes is left in the working tree for review.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  applyChecks,
  type CheckInput,
  changeNotes,
  emptyStages,
  loadDefinitionFiles,
  retire,
  type StageEvent,
  type StagesFile,
  splitKey,
  stagesFileSchema,
} from '@highsea-tv/catalog'
import { buildCatalog, buildVpnProviderCatalog, writeCatalog } from '@highsea-tv/catalog/build'
import {
  CATALOG_DIR,
  catalogDefinitions,
  keyOf,
  mergeVerified,
  readVerified,
  VERIFIED_FILE,
  type Verification,
  type VerifiedFile,
  verifyAll,
  writeVerified,
} from './catalog-verify.ts'
import { catalogVersionOf, nextCatalogVersion } from './release.ts'

const root = join(import.meta.dir, '..')
export const STAGES_FILE = join(CATALOG_DIR, 'stages.json')
const SEED_DIR = join(root, 'packages/catalog/seed')
export const ISSUE_TITLE = 'Catalog check'

// ------------------------------------------------------------------ the files

export function readStages(file = STAGES_FILE): StagesFile {
  if (!existsSync(file)) return emptyStages()
  return stagesFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
}

export function writeStages(file: string, stages: StagesFile): void {
  writeFileSync(file, `${JSON.stringify(stages, null, 2)}\n`)
}

/** Adds a version to CHANGES.md with these notes; the newest heading is the one built. */
export function addChanges(changes: string, notes: readonly string[], date: string): string {
  const version = nextCatalogVersion(catalogVersionOf(changes), date)
  const at = changes.search(/^## /m)
  const entry = `## ${version}\n\n${notes.map((n) => `- ${n}`).join('\n')}\n\n`
  return at === -1
    ? `${changes.trimEnd()}\n\n${entry}`
    : changes.slice(0, at) + entry + changes.slice(at)
}

/** The definition file in a folder with this id, or null. */
function fileWithId(dir: string, id: string): string | null {
  const found = loadDefinitionFiles(dir).loaded.find((f) => f.definition.id === id)
  return found ? join(dir, found.file) : null
}

// ------------------------------------------------------------------ the week

export type WeekResult = {
  verified: VerifiedFile
  stages: StagesFile
  events: StageEvent[]
  /** CHANGES.md as it would be, or null when nothing needs a line. */
  changes: string | null
  /** Files moved from beta/ to definitions/, and stable files they replace. */
  moves: { id: string; from: string; to: string; replaces: string | null }[]
}

const checksOf = (results: readonly Verification[]): CheckInput[] =>
  results.map((v) => ({
    key: keyOf(v),
    name: v.name,
    version: v.version,
    result: v.result,
    reason: v.reason,
  }))

/** Works out a week's changes from the checks' results, without touching a file. */
export function planWeek(input: {
  dir: string
  today: string
  results: readonly Verification[]
  verified: VerifiedFile
  stages: StagesFile
  changes: string
  held?: ReadonlySet<string>
}): WeekResult {
  let verified = mergeVerified(input.verified, input.results, input.today)
  const { stages, events } = applyChecks(
    input.stages,
    checksOf(input.results),
    input.today,
    input.held,
  )
  const moves: WeekResult['moves'] = []
  for (const e of events) {
    if (e.kind !== 'promoted') continue
    const from = fileWithId(join(input.dir, 'beta'), e.id)
    if (!from) continue
    const replaces = fileWithId(join(input.dir, 'definitions'), e.id)
    moves.push({
      id: e.id,
      from,
      to: join(input.dir, 'definitions', from.split('/').pop() as string),
      replaces,
    })
    // its check moves with it, now on both channels
    const { [e.key]: entry, ...rest } = verified.definitions
    if (entry)
      verified = {
        ...verified,
        definitions: Object.fromEntries(
          Object.entries({ ...rest, [e.id]: { ...entry, channel: 'stable' as const } }).sort(
            ([a], [b]) => a.localeCompare(b),
          ),
        ),
      }
  }
  const notes = changeNotes(events)
  return {
    verified,
    stages,
    events,
    moves,
    changes: notes.length ? addChanges(input.changes, notes, input.today) : null,
  }
}

/** Writes a week's changes to disk. */
export function applyWeek(dir: string, week: WeekResult): void {
  writeVerified(join(dir, 'verified.json'), week.verified)
  writeStages(join(dir, 'stages.json'), week.stages)
  for (const m of week.moves) {
    if (m.replaces) rmSync(m.replaces)
    renameSync(m.from, m.to)
  }
  if (week.changes !== null) writeFileSync(join(dir, 'CHANGES.md'), week.changes)
}

// ------------------------------------------------------------------ the report

const rel = (path: string) => (path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path)

/** What changed this week, in a few lines for a person. */
export function report(input: {
  today: string
  results: readonly Verification[]
  week: WeekResult
}): string {
  const { events, moves } = input.week
  const of = <K extends StageEvent['kind']>(kind: K) =>
    events.filter((e): e is Extract<StageEvent, { kind: K }> => e.kind === kind)
  const lines: string[] = [`Catalog check, ${input.today}`, '']
  const section = (title: string, items: string[]) => {
    if (!items.length) return
    lines.push(`${title}:`, ...items.map((i) => `- ${i}`), '')
  }
  section(
    'Newly broken',
    of('broken').map((e) => `${e.name} (${e.key})${e.reason ? `: ${e.reason}` : ''}`),
  )
  section(
    'Recovered',
    of('recovered').map((e) => `${e.name} (${e.key})`),
  )
  section(
    'Promoted to stable',
    of('promoted').map((e) => {
      const m = moves.find((x) => x.id === e.id)
      return `${e.name} (${e.key}): a week on Beta and two passing checks${m ? `; ${rel(m.from)} moved to ${rel(m.to)}` : ''}`
    }),
  )
  section(
    'Held on Beta',
    of('held').map((e) => `${e.name} (${e.key}): ${e.why}`),
  )
  section(
    'Due for retirement',
    of('retire-due').map(
      (e) =>
        `${e.name} (${e.key}): broken since ${e.since}, ${e.days} days. If there's no fix in sight: bun run catalog:check retire ${splitKey(e.key).id} --note "…"`,
    ),
  )
  if (lines.length === 2) lines.push('Nothing changed stage.', '')
  const failing = input.results.filter((v) => v.result === 'failing' || v.result === 'challenge')
  const counts = ['working', 'failing', 'challenge', 'skipped']
    .map((o) => `${input.results.filter((v) => v.result === o).length} ${o}`)
    .join(', ')
  lines.push(`Checked ${input.results.length}: ${counts}.`)
  for (const v of failing) lines.push(`- ${keyOf(v)}: ${v.reason ?? v.result}`)
  return lines.join('\n').trimEnd()
}

/** The "Catalog check" issue's body: the date and every definition's standing, as a table. */
export function issueBody(today: string, verified: VerifiedFile, stages: StagesFile): string {
  const rows = Object.entries(verified.definitions).map(([key, v]) => {
    const s = stages.definitions[key]
    const status = s && s.version === v.version ? s.status : 'working'
    const stage = splitKey(key).channel === 'beta' ? 'Beta' : 'Stable'
    return `| ${key} | ${v.version} | ${stage} | ${status} | ${v.result} | ${v.checked} | ${v.verified ?? '—'} |`
  })
  return [
    `Kept up to date by \`bun run catalog:check --github\` from the owner's Mac. Last run: ${today}.`,
    '',
    '| Definition | Version | Stage | Status | Last result | Checked | Last working |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'A definition is broken after two failing weekly checks in a row, and moves from Beta to stable after a week and two passing checks with no open report (docs/plans/indexer-catalog-upkeep.md).',
  ].join('\n')
}

// ------------------------------------------------------------------ GitHub, with the owner's gh

/** The indexer ids named by open "An indexer isn't working" issues (the form's first field). */
export function reportedIds(issues: readonly { body: string | null }[]): Set<string> {
  const out = new Set<string>()
  for (const i of issues) {
    const m = /^###\s+Which indexer\s*\n+\s*([^\n]+)/m.exec(i.body ?? '')
    const id = m?.[1]?.trim().toLowerCase()
    if (id && id !== '_no response_') out.add(id)
  }
  return out
}

function gh(args: string[], input?: string): string {
  return execFileSync('gh', args, { cwd: root, encoding: 'utf8', input })
}

function openReports(): Set<string> {
  const json = gh([
    'issue',
    'list',
    '--state',
    'open',
    '--label',
    'broken-indexer',
    '--limit',
    '200',
    '--json',
    'body',
  ])
  return reportedIds(JSON.parse(json) as { body: string | null }[])
}

function updateIssue(body: string, changed: string | null): string {
  const found = (
    JSON.parse(
      gh([
        'issue',
        'list',
        '--state',
        'open',
        '--search',
        `in:title "${ISSUE_TITLE}"`,
        '--json',
        'number,title',
      ]),
    ) as { number: number; title: string }[]
  ).find((i) => i.title === ISSUE_TITLE)
  if (!found) {
    const url = gh(
      ['issue', 'create', '--title', ISSUE_TITLE, '--label', 'catalog', '--body-file', '-'],
      body,
    ).trim()
    return `Opened ${url}.`
  }
  gh(['issue', 'edit', String(found.number), '--body-file', '-'], body)
  if (changed) gh(['issue', 'comment', String(found.number), '--body-file', '-'], changed)
  return `Updated issue #${found.number}${changed ? ' and commented with what changed' : ''}.`
}

// ------------------------------------------------------------------ the seed

/** The seed follows the catalog, signed with the development key, as `catalog:build --seed` does. */
function refreshSeed(): void {
  const key = {
    privateKey: readFileSync(join(root, 'catalog/keys/development.pem'), 'utf8'),
    keyId: 'development',
  }
  const built = buildCatalog({ root: CATALOG_DIR }, key)
  const providers = buildVpnProviderCatalog({ root: join(root, 'catalog/vpn-providers') }, key)
  rmSync(SEED_DIR, { recursive: true, force: true })
  writeCatalog(built, SEED_DIR)
  writeCatalog(providers, join(SEED_DIR, 'vpn-providers'))
}

// ------------------------------------------------------------------ launchd

export const LAUNCHD_LABEL = 'tv.highsea.catalog-check'
const PLIST_TEMPLATE = join(import.meta.dir, 'launchd', `${LAUNCHD_LABEL}.plist`)

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The template with this machine's paths filled in. */
export function renderPlist(
  template: string,
  values: { bun: string; repo: string; path: string; log: string },
): string {
  return template
    .replaceAll('__BUN__', xml(values.bun))
    .replaceAll('__REPO__', xml(values.repo))
    .replaceAll('__PATH__', xml(values.path))
    .replaceAll('__LOG__', xml(values.log))
}

function schedule(remove: boolean): void {
  const target = join(homedir(), 'Library/LaunchAgents', `${LAUNCHD_LABEL}.plist`)
  const domain = `gui/${process.getuid?.() ?? ''}`
  // launchctl(1): bootout removes a service, bootstrap loads one into the user's GUI domain
  try {
    execFileSync('launchctl', ['bootout', `${domain}/${LAUNCHD_LABEL}`], { stdio: 'ignore' })
  } catch {
    // it wasn't loaded
  }
  if (remove) {
    rmSync(target, { force: true })
    console.log(`Removed the weekly check (${target}).`)
    return
  }
  const dirs = [dirname(process.execPath)]
  for (const tool of ['gh', 'git']) {
    const found = Bun.which(tool)
    if (found) dirs.push(dirname(found))
  }
  const path = [...new Set([...dirs, '/usr/local/bin', '/usr/bin', '/bin'])].join(':')
  const log = join(homedir(), 'Library/Logs', 'highsea-catalog-check.log')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(
    target,
    renderPlist(readFileSync(PLIST_TEMPLATE, 'utf8'), {
      bun: process.execPath,
      repo: root,
      path,
      log,
    }),
  )
  execFileSync('launchctl', ['bootstrap', domain, target], { stdio: 'inherit' })
  console.log(
    `The weekly check runs on Mondays at 09:00 from ${root}, and logs to ${log}.\nRemove it with bun run catalog:check unschedule.`,
  )
}

// ------------------------------------------------------------------ the command

function today(): string {
  // the owner's own date, not UTC's
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function retireCommand(args: string[]): void {
  const id = args.find((a) => !a.startsWith('--'))
  const at = args.indexOf('--note')
  const note = at >= 0 ? args[at + 1] : undefined
  if (!id || !note) {
    console.error('Usage: bun run catalog:check retire <id> --note "The site closed."')
    process.exit(1)
  }
  let stages = readStages()
  const removed: string[] = []
  let name = id
  for (const [folder, key] of [
    ['definitions', id],
    ['beta', `beta/${id}`],
  ] as const) {
    const file = fileWithId(join(CATALOG_DIR, folder), id)
    if (!file) continue
    const def = loadDefinitionFiles(join(CATALOG_DIR, folder)).loaded.find(
      (f) => f.definition.id === id,
    )?.definition
    if (!def) continue
    name = def.name
    stages = retire(stages, key, def.name, def.version, note, today())
    rmSync(file)
    removed.push(rel(file))
  }
  if (!removed.length) {
    console.error(`No definition with the id ${id}.`)
    process.exit(1)
  }
  writeStages(STAGES_FILE, stages)
  const changesFile = join(CATALOG_DIR, 'CHANGES.md')
  writeFileSync(
    changesFile,
    addChanges(readFileSync(changesFile, 'utf8'), [`${name} is retired: ${note}`], today()),
  )
  refreshSeed()
  console.log(
    `Retired ${id}: removed ${removed.join(' and ')}, noted it in stages.json and CHANGES.md, and refreshed the seed. Review and commit it; a catalog publish takes it to servers.`,
  )
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const command = args[0]
  if (command === 'retire') retireCommand(args.slice(1))
  else if (command === 'schedule' || command === 'unschedule') schedule(command === 'unschedule')
  else if (command && !command.startsWith('--')) {
    console.error(
      'Usage: bun run catalog:check [--dry] [--github] | retire <id> --note "…" | schedule | unschedule',
    )
    process.exit(1)
  } else {
    const dry = args.includes('--dry')
    const github = args.includes('--github')
    const date = today()
    const held = github ? openReports() : new Set<string>()
    const results = await verifyAll(catalogDefinitions(), {
      fetch: globalThis.fetch,
      clock: { now: Date.now },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    })
    const week = planWeek({
      dir: CATALOG_DIR,
      today: date,
      results,
      verified: readVerified(VERIFIED_FILE),
      stages: readStages(),
      changes: readFileSync(join(CATALOG_DIR, 'CHANGES.md'), 'utf8'),
      held,
    })
    const text = report({ today: date, results, week })
    console.log(text)
    if (dry) {
      console.log('\n--dry: no file changed.')
    } else {
      applyWeek(CATALOG_DIR, week)
      refreshSeed()
      console.log(
        `\nUpdated verified.json, stages.json${week.moves.length ? ', definitions/' : ''}${week.changes ? ', CHANGES.md' : ''} and the seed. Nothing is committed: review the changes with git status.`,
      )
      if (github) {
        const changed = week.events.length ? `\`\`\`\n${text}\n\`\`\`` : null
        console.log(updateIssue(issueBody(date, week.verified, week.stages), changed))
      }
    }
  }
}
