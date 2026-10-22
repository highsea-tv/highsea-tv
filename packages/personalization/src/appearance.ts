// SPDX-License-Identifier: AGPL-3.0-only
// Appearance (appearance.md): how the server presents itself to everyone who connects. Its name,
// mark and accent; the default theme and the owner's own themes; and where interface sounds play
// by default. Themes and sound packs are checked by the design system's own rules before they're
// saved (@highsea-tv/tokens), so a failing one never reaches a client.
import { createHash } from 'node:crypto'
import { AppError } from '@highsea-tv/core'
import { readSetting, schema, writeSetting } from '@highsea-tv/db'
import {
  type BuiltInThemeId,
  builtInThemes,
  checkSoundPack,
  createTheme,
  defaultSoundPack,
  formatHex,
  parseColor,
  type SoundPack,
} from '@highsea-tv/tokens'
import { asc, eq } from 'drizzle-orm'
import type { Ctx } from './context.ts'
import { checkMark, type MarkType } from './marks.ts'

/** What the apps play until someone changes it on their own device. */
export type SoundDefaults = {
  tv: boolean
  phone: boolean
  web: boolean
  /** 0–1. */
  volume: number
  pack: string
}

/** The `appearance` settings row. The server's name stays in its identity row. */
export type AppearanceSettings = {
  /** A built-in theme id or one of the server's. */
  defaultTheme: string
  /** The brand accent; null lets each theme keep its own. */
  accent: string | null
  sound: SoundDefaults
}

export const APPEARANCE_KEY = 'appearance'

/** sound.md › Defaults: on for TVs, off on phones and the web. */
export const defaultAppearance: AppearanceSettings = {
  defaultTheme: 'default',
  accent: null,
  sound: { tv: true, phone: false, web: false, volume: 0.8, pack: 'felt' },
}

/** "Felt and wood" (brand direction › sound). Built in, and can't be deleted. */
export const BUILT_IN_PACK = { id: defaultSoundPack.id, name: 'Felt and wood' } as const

export const NAME_MAX = 40
export const THEMES_MAX = 50
export const PACKS_MAX = 20

/** A custom theme: a `ThemeInput` for the theme engine, with its id and name. */
export type CustomTheme = {
  id: string
  name: string
  base: BuiltInThemeId
  accent: string
  colors?: Record<string, string>
}

export type SoundPackSummary = { id: string; name: string; builtIn: boolean }

export type Branding = {
  name: string
  accent: string | null
  customMark: boolean
  /** Where the mark is served, versioned by its content; null for the highsea mark. */
  mark: string | null
}

export type AppearanceView = {
  defaultTheme: string
  themes: CustomTheme[]
  sound: SoundDefaults
  packs: SoundPackSummary[]
  branding: Branding
}

export type AppearancePatch = {
  name?: string
  accent?: string | null
  defaultTheme?: string
  sound?: SoundDefaults
}

export type Mark = { type: MarkType; data: Uint8Array; hash: string; updatedAt: number }

export const MARK_PATH = '/api/v1/appearance/mark'

const isBuiltIn = (id: string): id is BuiltInThemeId => id in builtInThemes

const invalid = (message: string, details?: unknown) => new AppError('invalid', message, details)

/** `#rrggbb`, or `invalid` when it isn't a color. */
function accentHex(accent: string): string {
  try {
    return formatHex({ ...parseColor(accent.trim()), a: 1 })
  } catch {
    throw invalid('That accent isn’t a color.', { reason: 'accent' })
  }
}

export function createAppearance(ctx: Ctx) {
  const { db, clock, events } = ctx

  const settings = () => readSetting(db, APPEARANCE_KEY, defaultAppearance)
  const write = (next: AppearanceSettings) => writeSetting(db, APPEARANCE_KEY, next, clock.now())
  const changed = () => events.emit({ topic: 'server.updated' })

  const themeRows = () =>
    db.select().from(schema.themes).orderBy(asc(schema.themes.createdAt)).all()
  const toTheme = (r: typeof schema.themes.$inferSelect): CustomTheme => ({
    id: r.id,
    name: r.name,
    base: r.base,
    accent: r.accent,
    ...(r.colors ? { colors: r.colors as Record<string, string> } : {}),
  })
  const themeExists = (id: string) =>
    isBuiltIn(id) || !!db.select().from(schema.themes).where(eq(schema.themes.id, id)).get()

  const packRows = () =>
    db.select().from(schema.soundPacks).orderBy(asc(schema.soundPacks.createdAt)).all()
  const packExists = (id: string) =>
    id === BUILT_IN_PACK.id ||
    !!db.select().from(schema.soundPacks).where(eq(schema.soundPacks.id, id)).get()

  const markRow = () => db.select().from(schema.uploads).where(eq(schema.uploads.key, 'mark')).get()

  const branding = (): Branding => {
    const mark = markRow()
    return {
      name: ctx.serverName(),
      accent: settings().accent,
      customMark: !!mark,
      mark: mark ? `${MARK_PATH}?v=${mark.hash.slice(0, 12)}` : null,
    }
  }

  const get = (): AppearanceView => {
    const s = settings()
    return {
      defaultTheme: s.defaultTheme,
      themes: themeRows().map(toTheme),
      sound: s.sound,
      packs: [
        { ...BUILT_IN_PACK, builtIn: true },
        ...packRows().map((p) => ({ id: p.id, name: p.name, builtIn: false })),
      ],
      branding: branding(),
    }
  }

  return {
    settings,
    branding,
    themeExists,

    get,

    /** Saves the identity, default theme and sound defaults together. */
    save(patch: AppearancePatch): AppearanceView {
      const current = settings()
      const next = { ...current }
      if (patch.name !== undefined) {
        const name = patch.name.trim()
        if (!name) throw invalid('The server needs a name.', { reason: 'name' })
        if (name.length > NAME_MAX)
          throw invalid(`The name can be up to ${NAME_MAX} characters.`, { reason: 'name' })
      }
      if (patch.accent !== undefined)
        next.accent = patch.accent === null ? null : accentHex(patch.accent)
      if (patch.defaultTheme !== undefined) {
        if (!themeExists(patch.defaultTheme))
          throw invalid('There’s no theme with that id.', { reason: 'theme' })
        next.defaultTheme = patch.defaultTheme
      }
      if (patch.sound !== undefined) {
        if (!packExists(patch.sound.pack))
          throw invalid('There’s no sound pack with that id.', { reason: 'pack' })
        next.sound = patch.sound
      }
      write(next)
      if (patch.name !== undefined && patch.name.trim() !== ctx.serverName())
        ctx.rename(patch.name.trim())
      changed()
      return get()
    },

    // ---------------------------------------------------------------- themes

    /** Adds or replaces a theme. It must pass the contrast audit (appearance.md › Decisions). */
    saveTheme(id: string, input: Omit<CustomTheme, 'id'>): CustomTheme {
      if (isBuiltIn(id))
        throw new AppError('conflict', 'That id belongs to a built-in theme.', {
          reason: 'built-in',
        })
      let build: ReturnType<typeof createTheme>
      try {
        build = createTheme({ ...input, id })
      } catch (e) {
        throw invalid('That theme isn’t valid.', {
          reason: 'theme',
          issues: (e as { issues?: unknown }).issues,
        })
      }
      if (!build.audit.pass)
        throw invalid('Themes that fail can’t be saved: someone would struggle to read them.', {
          reason: 'contrast',
          failing: build.audit.results
            .filter((r) => !r.pass)
            .map((r) => ({ label: r.label, lc: Math.round(r.lc), min: r.min })),
        })
      const existing = db.select().from(schema.themes).where(eq(schema.themes.id, id)).get()
      if (!existing && themeRows().length >= THEMES_MAX)
        throw new AppError('conflict', `A server can keep up to ${THEMES_MAX} themes.`, {
          reason: 'limit',
        })
      const now = clock.now()
      const row = {
        id,
        name: input.name.trim(),
        base: input.base,
        accent: accentHex(input.accent),
        colors: input.colors && Object.keys(input.colors).length ? input.colors : null,
        updatedAt: now,
      }
      db.insert(schema.themes)
        .values({ ...row, createdAt: now })
        .onConflictDoUpdate({ target: schema.themes.id, set: row })
        .run()
      changed()
      return toTheme({ ...row, createdAt: existing?.createdAt ?? now })
    },

    /** Deletes a theme. If it was the default, the default falls back to Abyss Neutral. */
    deleteTheme(id: string) {
      const gone = db.delete(schema.themes).where(eq(schema.themes.id, id)).returning().all()
      if (!gone.length) throw new AppError('not-found', 'There’s no theme with that id.')
      const s = settings()
      if (s.defaultTheme === id) write({ ...s, defaultTheme: defaultAppearance.defaultTheme })
      changed()
    },

    // ---------------------------------------------------------------- sound packs

    /** A pack's recipe, for clients to play. */
    soundPack(id: string): SoundPack {
      if (id === BUILT_IN_PACK.id) return defaultSoundPack
      const row = db.select().from(schema.soundPacks).where(eq(schema.soundPacks.id, id)).get()
      if (!row) throw new AppError('not-found', 'There’s no sound pack with that id.')
      return row.recipe as SoundPack
    },

    /**
     * Adds a pack, or replaces an uploaded one with the same id. It must pass the same loudness and
     * length rules the catalog applies (sound.md › Sound packs).
     */
    uploadSoundPack(recipe: unknown): SoundPackSummary {
      const report = checkSoundPack(recipe)
      if (!report.pass)
        throw invalid('That sound pack doesn’t meet the sound rules.', {
          reason: 'sound-rules',
          issues: report.issues,
        })
      const pack = recipe as SoundPack
      if (pack.id === BUILT_IN_PACK.id)
        throw new AppError('conflict', 'That id belongs to the built-in pack.', {
          reason: 'built-in',
        })
      const existing = packExists(pack.id)
      if (!existing && packRows().length >= PACKS_MAX)
        throw new AppError('conflict', `A server can keep up to ${PACKS_MAX} sound packs.`, {
          reason: 'limit',
        })
      const row = { id: pack.id, name: pack.name, recipe: pack }
      db.insert(schema.soundPacks)
        .values({ ...row, createdAt: clock.now() })
        .onConflictDoUpdate({ target: schema.soundPacks.id, set: row })
        .run()
      changed()
      return { id: pack.id, name: pack.name, builtIn: false }
    },

    /** Deletes an uploaded pack. If it was the default, the default goes back to the built-in one. */
    deleteSoundPack(id: string) {
      if (id === BUILT_IN_PACK.id)
        throw new AppError('conflict', 'The built-in pack can’t be deleted.', {
          reason: 'built-in',
        })
      const gone = db
        .delete(schema.soundPacks)
        .where(eq(schema.soundPacks.id, id))
        .returning()
        .all()
      if (!gone.length) throw new AppError('not-found', 'There’s no sound pack with that id.')
      const s = settings()
      if (s.sound.pack === id) write({ ...s, sound: { ...s.sound, pack: BUILT_IN_PACK.id } })
      changed()
    },

    // ---------------------------------------------------------------- the mark

    mark(): Mark | null {
      const row = markRow()
      return row
        ? { type: row.type as MarkType, data: row.data, hash: row.hash, updatedAt: row.updatedAt }
        : null
    },

    /** Checks and keeps the server's mark, replacing the last one. */
    setMark(bytes: Uint8Array): Branding {
      const type = checkMark(bytes)
      const hash = createHash('sha256').update(bytes).digest('hex')
      const row = { type, data: Buffer.from(bytes), hash, updatedAt: clock.now() }
      db.insert(schema.uploads)
        .values({ key: 'mark', ...row })
        .onConflictDoUpdate({ target: schema.uploads.key, set: row })
        .run()
      changed()
      return branding()
    },

    /** Back to the highsea mark. */
    removeMark(): Branding {
      db.delete(schema.uploads).where(eq(schema.uploads.key, 'mark')).run()
      changed()
      return branding()
    },
  }
}

export type AppearanceService = ReturnType<typeof createAppearance>
