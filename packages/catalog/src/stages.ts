// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's stages (docs/plans/indexer-catalog-upkeep.md, ADR 0069): where each definition is
// (Beta or stable) and how it stands (working, broken or retired), kept beside the definitions so a
// change of status needs no new definition version.
//
//   catalog/indexers/verified.json   each definition's last live check (`bun run catalog:verify`)
//   catalog/indexers/stages.json     each definition's status and the counts its rules read
//                                    (`bun run catalog:check` keeps it; notes may be edited)
//
// The rules, from the owner's answers of 2026-11-19:
// - A definition in `beta/` moves to stable after a week on Beta and two passing weekly checks,
//   with no open report (answer 6).
// - Two failing weekly checks in a row make it broken (a one-off failure never does). Servers keep
//   searching a broken one under the usual backoff and show its note (answer 5).
// - Broken for 30 days is due for retirement; the owner retires it (the site closed, or no fix in
//   sight). A retired definition leaves the bundle's definitions, and its note stays for 6 months.
// - Only the definitions `starters` names may be checked in setup by default, and never from Beta:
//   public indexers are never on by default (answer 4).
//
// The build carries each definition's status and last check in the bundle beside the definitions,
// so it's signed with them. Older servers ignore it: the bundle's schema is a Zod object, which
// strips keys it doesn't know (https://zod.dev/api#objects), so the bundle's format stays 1.
import { z } from 'zod'
import { CHANNELS, type Channel } from './format.ts'

/** A week on Beta… */
export const BETA_DAYS = 7
/** …with two passing weekly checks. */
export const BETA_PASSES = 2
/** Failing weekly checks in a row before a definition is broken. */
export const BROKEN_AFTER = 2
/** Days broken before a definition is due for retirement. */
export const RETIRE_AFTER_DAYS = 30
/** Days a retired definition's note stays in the bundle, about 6 months. */
export const RETIRED_KEPT_DAYS = 183

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-19.')

export const CHECK_RESULTS = ['working', 'failing', 'challenge', 'skipped'] as const
export type CheckResult = (typeof CHECK_RESULTS)[number]

export const STATUSES = ['working', 'broken', 'retired'] as const
export type DefinitionStatusKind = (typeof STATUSES)[number]

/** `verified.json`, as `bun run catalog:verify` writes it. */
export const verifiedFileSchema = z.object({
  about: z.string(),
  definitions: z.record(
    z.string(),
    z.object({
      name: z.string(),
      version: z.string(),
      channel: z.enum(CHANNELS),
      result: z.enum(CHECK_RESULTS),
      reason: z.string().nullable(),
      checked: date,
      verified: date.nullable(),
      counts: z.object({
        probes: z.number().int().nonnegative(),
        working: z.number().int().nonnegative(),
        releases: z.number().int().nonnegative(),
        withSize: z.number().int().nonnegative(),
      }),
    }),
  ),
})
export type VerifiedFileData = z.infer<typeof verifiedFileSchema>

/** One definition's entry in `stages.json`, keyed like `verified.json`: `id`, or `beta/<id>`. */
export const stageEntrySchema = z.object({
  name: z.string().min(1).max(100),
  status: z.enum(STATUSES),
  /** When it became broken or retired; null while it works. */
  since: date.nullable(),
  /** For owners, in plain words: why it's broken or retired. */
  note: z.string().min(1).max(300).nullable(),
  /** The definition version the counts below are for. */
  version: z.string(),
  /** The first check of this version: its week on Beta starts here. */
  firstSeen: date,
  /** Passing checks of this version. */
  passes: z.number().int().nonnegative(),
  /** Failing checks in a row. */
  failures: z.number().int().nonnegative(),
})
export type StageEntry = z.infer<typeof stageEntrySchema>

export const stagesFileSchema = z.object({
  about: z.string(),
  /** The definitions setup may check by default: sources whose whole catalog is lawful to share. */
  starters: z.array(z.string()),
  definitions: z.record(z.string(), stageEntrySchema),
})
export type StagesFile = z.infer<typeof stagesFileSchema>

export const STAGES_ABOUT =
  'Kept by bun run catalog:check: each definition’s status and the counts its rules read (docs/plans/indexer-catalog-upkeep.md). A note may be edited, and a status set to broken by hand when the NAS and a report agree.'

export const emptyStages = (): StagesFile => ({
  about: STAGES_ABOUT,
  starters: [],
  definitions: {},
})

/**
 * What the bundle says about one definition, beside it. Servers read each entry on its own and
 * skip one they can't parse, so a later field or status never stops a catalog installing.
 */
export const definitionStatusSchema = z.object({
  name: z.string().min(1).max(100),
  /** Beta: on the beta channel only, on its way to stable. */
  stage: z.enum(CHANNELS),
  status: z.enum(STATUSES),
  since: date.nullable(),
  note: z.string().max(300).nullable(),
  /** The last live check of this version, its result, and the last date it passed. */
  checked: date.nullable(),
  result: z.enum(CHECK_RESULTS).nullable(),
  verified: date.nullable(),
})
export type DefinitionStatus = z.infer<typeof definitionStatusSchema>

/** Each entry of a bundle's `status` that parses; the rest are skipped. */
export function readStatuses(
  raw: Record<string, unknown> | undefined,
): Map<string, DefinitionStatus> {
  const out = new Map<string, DefinitionStatus>()
  for (const [id, value] of Object.entries(raw ?? {})) {
    const parsed = definitionStatusSchema.safeParse(value)
    if (parsed.success) out.set(id, parsed.data)
  }
  return out
}

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** A key's id and channel: `beta/yts` is yts on Beta. */
export function splitKey(key: string): { id: string; channel: Channel } {
  return key.startsWith('beta/')
    ? { id: key.slice(5), channel: 'beta' }
    : { id: key, channel: 'stable' }
}

/** The note owners see when the weekly check finds a definition broken. They may be rewritten. */
export function brokenNote(result: CheckResult): string {
  return result === 'challenge'
    ? 'The site now shows a browser challenge to searches. A fix is being worked on.'
    : 'Its searches stopped working. A fix is being worked on.'
}

// ------------------------------------------------------------------ the weekly rules

/** One definition's check, as the rules read it. */
export type CheckInput = {
  key: string
  name: string
  version: string
  result: CheckResult
  reason: string | null
}

export type StageEvent =
  | { kind: 'broken'; key: string; name: string; reason: string | null }
  | { kind: 'recovered'; key: string; name: string }
  | { kind: 'promoted'; key: string; name: string; id: string }
  | { kind: 'held'; key: string; name: string; why: string }
  | { kind: 'retire-due'; key: string; name: string; since: string; days: number }

/**
 * Applies a week's checks to the stages, by the plan's rules. Pure: what to move on disk is in the
 * `promoted` events. `held` names definitions with an open report, which aren't promoted.
 */
export function applyChecks(
  stages: StagesFile,
  checks: readonly CheckInput[],
  today: string,
  held: ReadonlySet<string> = new Set(),
): { stages: StagesFile; events: StageEvent[] } {
  const definitions = { ...stages.definitions }
  const events: StageEvent[] = []
  for (const c of checks) {
    if (c.result === 'skipped') continue
    const earlier = definitions[c.key]
    if (earlier?.status === 'retired') continue
    const e: StageEntry = earlier
      ? { ...earlier, name: c.name }
      : {
          name: c.name,
          status: 'working',
          since: null,
          note: null,
          version: c.version,
          firstSeen: today,
          passes: 0,
          failures: 0,
        }
    if (e.version !== c.version)
      Object.assign(e, { version: c.version, firstSeen: today, passes: 0, failures: 0 })
    if (c.result === 'working') {
      e.passes += 1
      e.failures = 0
      if (e.status === 'broken') {
        Object.assign(e, { status: 'working', since: null, note: null })
        events.push({ kind: 'recovered', key: c.key, name: c.name })
      }
    } else {
      e.failures += 1
      if (e.status === 'working' && e.failures >= BROKEN_AFTER) {
        Object.assign(e, { status: 'broken', since: today, note: brokenNote(c.result) })
        events.push({ kind: 'broken', key: c.key, name: c.name, reason: c.reason })
      }
    }
    definitions[c.key] = e
  }

  const checked = new Set(checks.map((c) => c.key))
  for (const [key, e] of Object.entries(definitions)) {
    if (e.status === 'broken' && e.since) {
      const days = daysBetween(e.since, today)
      if (days >= RETIRE_AFTER_DAYS)
        events.push({ kind: 'retire-due', key, name: e.name, since: e.since, days })
    }
    const { id, channel } = splitKey(key)
    if (
      channel === 'beta' &&
      checked.has(key) &&
      e.status === 'working' &&
      e.passes >= BETA_PASSES &&
      daysBetween(e.firstSeen, today) >= BETA_DAYS
    ) {
      if (held.has(id)) {
        events.push({ kind: 'held', key, name: e.name, why: 'An open report names it.' })
        continue
      }
      delete definitions[key]
      definitions[id] = e
      events.push({ kind: 'promoted', key, name: e.name, id })
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(definitions).sort(([a], [b]) => a.localeCompare(b)),
  )
  return { stages: { ...stages, about: STAGES_ABOUT, definitions: sorted }, events }
}

/** Retires a definition by hand: the site closed, or it stayed broken with no fix in sight. */
export function retire(
  stages: StagesFile,
  key: string,
  name: string,
  version: string,
  note: string,
  today: string,
): StagesFile {
  const earlier = stages.definitions[key]
  const entry: StageEntry = {
    name,
    version,
    firstSeen: earlier?.firstSeen ?? today,
    passes: earlier?.passes ?? 0,
    failures: earlier?.failures ?? 0,
    status: 'retired',
    since: today,
    note,
  }
  return { ...stages, definitions: { ...stages.definitions, [key]: entry } }
}

/** What `CHANGES.md` says of each event, so What changed shows it (plan: Broken and retired). */
export function changeNotes(events: readonly StageEvent[]): string[] {
  const out: string[] = []
  for (const e of events) {
    if (e.kind === 'broken') out.push(`${e.name} is marked broken: two weekly checks failed.`)
    else if (e.kind === 'recovered') out.push(`${e.name} works again.`)
    else if (e.kind === 'promoted') out.push(`${e.name} moves from Beta to stable.`)
  }
  return out
}

// ------------------------------------------------------------------ the bundle

/**
 * Each chosen definition's status and last check for one channel's bundle, and the notes of
 * definitions retired within the last 6 months. A check or status for another version of the
 * definition isn't carried: a new version starts as not checked yet, and as working.
 */
export function bundleStatuses(input: {
  channel: Channel
  chosen: readonly { id: string; name: string; version: string; from: Channel }[]
  verified: VerifiedFileData | null
  stages: StagesFile | null
  /** The catalog version's date: the build stays deterministic. */
  today: string
}): Record<string, DefinitionStatus> {
  const out: Record<string, DefinitionStatus> = {}
  const checkOf = (key: string, version: string) => {
    const v = input.verified?.definitions[key]
    return v && v.version === version
      ? { checked: v.checked, result: v.result, verified: v.verified }
      : { checked: null, result: null, verified: null }
  }
  for (const d of input.chosen) {
    const key = d.from === 'beta' ? `beta/${d.id}` : d.id
    const s = input.stages?.definitions[key]
    const broken = s?.status === 'broken' && s.version === d.version
    out[d.id] = {
      name: d.name,
      stage: d.from,
      status: broken ? 'broken' : 'working',
      since: broken ? (s?.since ?? null) : null,
      note: broken ? (s?.note ?? null) : null,
      ...checkOf(key, d.version),
    }
  }
  for (const [key, s] of Object.entries(input.stages?.definitions ?? {})) {
    const { id, channel } = splitKey(key)
    if (s.status !== 'retired' || out[id] || !s.since) continue
    if (channel === 'beta' && input.channel !== 'beta') continue
    if (daysBetween(s.since, input.today) >= RETIRED_KEPT_DAYS) continue
    out[id] = {
      name: s.name,
      stage: channel,
      status: 'retired',
      since: s.since,
      note: s.note,
      ...checkOf(key, s.version),
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

/** Why a definition may not be checked in setup by default, or null when it may. */
export function starterProblem(
  d: { id: string; starter: boolean; privacy: string },
  from: Channel,
  starters: readonly string[],
): string | null {
  if (!d.starter) return null
  if (from === 'beta') return `${d.id} is on Beta, so it can’t be a starter.`
  if (!starters.includes(d.id))
    return `${d.id} is a starter, but stages.json’s starters doesn’t list it. Public indexers are never on by default: only a source whose whole catalog is lawful to share may be listed there.`
  return null
}
