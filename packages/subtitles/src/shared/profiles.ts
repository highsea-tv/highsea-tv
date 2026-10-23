// SPDX-License-Identifier: AGPL-3.0-only
// Language profiles (checkpoint 7, judgement calls 3 and 4): a table now, replacing media's
// hard-coded list. The seeded profile keeps its id, `lp-en`, so movies already added keep pointing
// at it. The rules mean what the selects say:
//   Forced  `no` wants a regular track; `also` a regular and a forced one, two tracks; `only` a
//           forced one.
//   SDH     `no` wants a track without SDH, and takes an SDH one only when none other exists, with
//           its SDH text removed; `also` takes either; `only` wants SDH.
// A profile in use can't be deleted, nor can the last one. `media_items.language_profile_id` has
// no foreign key (the schema's subtitles.ts says why), so this module is what checks it.
import { AppError, type Clock, newId } from '@highsea-tv/core'
import type { Db } from '@highsea-tv/db'
import { languageProfiles, mediaItems, rootFolders } from '@highsea-tv/db/schema'
import { asc, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { isLanguageCode, languageName, satisfies } from './languages.ts'
import type { LanguageProfile, LanguageRule } from './types.ts'

export const SEEDED_PROFILE_ID = 'lp-en'

const LIST = new Intl.ListFormat('en', { type: 'conjunction' })

const RULE = z.object({
  code: z.string().refine(isLanguageCode),
  forced: z.enum(['no', 'also', 'only']),
  hi: z.enum(['no', 'also', 'only']),
})

export const profileInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  languages: z.array(RULE).min(1).max(20),
  cutoff: z.string().nullable(),
  minScore: z.number().int().min(0).max(100),
})

export type ProfileInput = z.infer<typeof profileInputSchema>

const seeded = (): ProfileInput => ({
  name: 'English',
  languages: [{ code: 'en', forced: 'also', hi: 'no' }],
  cutoff: 'en',
  minScore: 80,
})

/** The defaults setup's step 6 and a new rule use: Regular and forced, Without SDH. */
export const newRule = (code: string): LanguageRule => ({ code, forced: 'also', hi: 'no' })

const invalid = (message: string, reason: string) => new AppError('invalid', message, { reason })

export const profileNotFound = () =>
  new AppError('not-found', 'That language profile doesn’t exist.', {
    reason: 'unknown-language-profile',
  })

type Row = typeof languageProfiles.$inferSelect

const toProfile = (row: Row): LanguageProfile => ({
  id: row.id,
  name: row.name,
  languages: row.rules as LanguageRule[],
  cutoff: row.cutoff,
  minScore: row.minScore,
})

export function createProfiles({ db, clock }: { db: Db; clock: Clock }) {
  function list(): LanguageProfile[] {
    return db
      .select()
      .from(languageProfiles)
      .orderBy(asc(languageProfiles.createdAt), asc(languageProfiles.id))
      .all()
      .map(toProfile)
  }

  function find(id: string): LanguageProfile | null {
    const row = db.select().from(languageProfiles).where(eq(languageProfiles.id, id)).get()
    return row ? toProfile(row) : null
  }

  function get(id: string): LanguageProfile {
    const p = find(id)
    if (!p) throw profileNotFound()
    return p
  }

  function check(input: unknown): ProfileInput {
    const parsed = profileInputSchema.safeParse(input)
    if (!parsed.success) {
      const key = String(parsed.error.issues[0]?.path[0] ?? 'profile')
      throw invalid('That profile isn’t valid. Check it and try again.', key)
    }
    const p = parsed.data
    const codes = p.languages.map((l) => l.code)
    if (new Set(codes).size !== codes.length)
      throw invalid('Each language can be in a profile once.', 'languages')
    if (p.cutoff !== null && !codes.includes(p.cutoff))
      throw invalid('The cutoff must be one of the profile’s languages.', 'cutoff')
    return p
  }

  function nameTaken(name: string, except?: string) {
    const row = db.select().from(languageProfiles).where(eq(languageProfiles.name, name)).get()
    if (row && row.id !== except)
      throw new AppError('conflict', 'A profile already has that name.', {
        reason: 'duplicate-name',
      })
  }

  /** Creates a profile, or replaces the one with `id`. */
  function save(input: unknown, id?: string): LanguageProfile {
    const p = check(input)
    const now = clock.now()
    if (id) {
      get(id)
      nameTaken(p.name, id)
      db.update(languageProfiles)
        .set({
          name: p.name,
          rules: p.languages,
          cutoff: p.cutoff,
          minScore: p.minScore,
          updatedAt: now,
        })
        .where(eq(languageProfiles.id, id))
        .run()
      return get(id)
    }
    nameTaken(p.name)
    const newIdValue = newId('lp')
    db.insert(languageProfiles)
      .values({
        id: newIdValue,
        name: p.name,
        rules: p.languages,
        cutoff: p.cutoff,
        minScore: p.minScore,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    return get(newIdValue)
  }

  /** How many titles use the profile. */
  function uses(id: string): number {
    return (
      db.select({ n: count() }).from(mediaItems).where(eq(mediaItems.languageProfileId, id)).get()
        ?.n ?? 0
    )
  }

  function remove(id: string): void {
    const p = get(id)
    if (uses(id) > 0)
      throw new AppError(
        'conflict',
        `Movies still use ${p.name}. Move them to another profile first.`,
        {
          reason: 'in-use',
        },
      )
    const total = db.select({ n: count() }).from(languageProfiles).get()?.n ?? 0
    if (total <= 1)
      throw new AppError('conflict', 'Keep at least one language profile.', {
        reason: 'last-profile',
      })
    db.transaction((tx) => {
      // a root folder's default (checkpoint 8c) goes back to none
      tx.update(rootFolders)
        .set({ languageProfileId: null })
        .where(eq(rootFolders.languageProfileId, id))
        .run()
      tx.delete(languageProfiles).where(eq(languageProfiles.id, id)).run()
    })
  }

  /** First boot: `lp-en`. Idempotent; an owner's edits stay. */
  function seed(): void {
    const now = clock.now()
    const p = seeded()
    db.insert(languageProfiles)
      .values({
        id: SEEDED_PROFILE_ID,
        name: p.name,
        rules: p.languages,
        cutoff: p.cutoff,
        minScore: p.minScore,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run()
  }

  /**
   * Setup's step 6: the chosen languages, in order, into `lp-en`, named after the first, each as
   * Regular and forced, Without SDH.
   */
  function fromSetup(codes: string[]): LanguageProfile {
    seed()
    const languages = codes.map(newRule)
    const first = codes[0]
    // "English and Portuguese", as the prototype names a profile
    const name = codes.length > 0 ? LIST.format(codes.map(languageName)) : seeded().name
    return save(
      { name, languages, cutoff: first ?? null, minScore: get(SEEDED_PROFILE_ID).minScore },
      SEEDED_PROFILE_ID,
    )
  }

  return { list, find, get, save, remove, uses, seed, fromSetup }
}

export type Profiles = ReturnType<typeof createProfiles>

// ---------------------------------------------------------------- what a profile wants

/** A track already present, from any source: a sidecar, a bundled file or an embedded stream. */
export type PresentTrack = { language: string; forced: boolean; hi: boolean }

/** One wanted track: a language and its flags. `hi` true only for SDH only. */
export type Want = { language: string; forced: boolean; hi: boolean; rule: LanguageRule }

/** The tracks each rule asks for: one, or two for Regular and forced. */
export function wantsOf(rule: LanguageRule): Want[] {
  const hi = rule.hi === 'only'
  const out: Want[] = []
  if (rule.forced !== 'only') out.push({ language: rule.code, forced: false, hi, rule })
  if (rule.forced !== 'no') out.push({ language: rule.code, forced: true, hi, rule })
  return out
}

/** Whether a present track fills a want under its rule's SDH setting. */
export function fills(track: PresentTrack, want: Want): boolean {
  if (!satisfies(track.language, want.language) || track.forced !== want.forced) return false
  if (want.rule.hi === 'only') return track.hi
  if (want.rule.hi === 'no') return !track.hi
  return true
}

/**
 * The cutoff, as Bazarr documents it ("Stop searching other languages once this language is
 * found", https://wiki.bazarr.media/Additional-Configuration/Settings/Languages/): once a track in
 * the cutoff language is present, the profile's other languages are neither searched nor upgraded.
 */
export function cutoffMet(profile: LanguageProfile, present: PresentTrack[]): boolean {
  const cutoff = profile.cutoff
  return cutoff !== null && present.some((t) => satisfies(t.language, cutoff))
}

/** What a profile still wants, given the tracks a file has. */
export function missing(profile: LanguageProfile, present: PresentTrack[]): Want[] {
  const met = cutoffMet(profile, present)
  return profile.languages
    .filter((rule) => !met || rule.code === profile.cutoff)
    .flatMap(wantsOf)
    .filter((w) => !present.some((t) => fills(t, w)))
}
