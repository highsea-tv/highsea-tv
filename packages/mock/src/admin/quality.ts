// SPDX-License-Identifier: AGPL-3.0-only
// The admin's quality and media management routes (one-client-platform-d.md › D3), answered from
// the mock's seeded state in the contract's shapes: Settings › Profiles and formats with the
// profile and format editors, Quality sizes and its editor, and Media management with its root
// folders and Tags. The server's rules are @highsea-tv/media/shared's profiles.ts (a profile or a
// format checked by @highsea-tv/quality's schemas, `name-taken`, a profile in use or the last one
// left kept) and settings.ts (media management checked field by field, each format's tokens by
// @highsea-tv/media/naming's `checkFormat`); each refusal here is one of theirs, in their words.
//
// What the mock doesn't keep, chosen here:
// - a format's `edited`: kept per transport, for the presets saved through it; the seed's are as
//   the bundle has them, so none starts edited;
// - media management's shows' naming (`episodes`, the prototype's stage 6) isn't in the contract:
//   it's left as it is on save;
// - the tags, root folders and language profiles are the mock's own api's, which checks them as
//   the server does; only the shapes are mapped here.
// Shows' settings (series-settings.ts in the contract, drafted with D3's answer 5) are answered
// here too, from the mock's own: episode naming (`settings.media.episodes`), the sizes per minute
// of an episode (`settings.episodeSizes`, checked as the films' are) and each profile's use. The
// screen checks episode formats before saving (the server has no episode naming to check them by
// yet), so the mock keeps whatever the contract's schema lets through.
import type { CustomFormat, MediaManagementSettings, RootFolder } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { checkFormat } from '@highsea-tv/media/naming'
import {
  completeItems,
  customFormatSchema,
  type ProfileItem,
  qualityProfileSchema,
  qualitySizeSchema,
  seedProfiles,
  validateFormat,
} from '@highsea-tv/quality'
import type { ServerState } from '../seed.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'

export const qualityMessages = defineMessages({
  'quality.profileUnknown': 'That quality profile doesn’t exist.',
  'quality.formatUnknown': 'That custom format doesn’t exist.',
  'quality.profileTaken': 'There’s a profile called {name} already.',
  'quality.formatTaken': 'There’s a format called {name} already.',
  'quality.checkProfile': 'Check the profile.',
  'quality.checkFormat': 'Check the format.',
  'quality.inUse':
    '{count, plural, one {1 movie uses this profile. Move it to another first.} other {# movies use this profile. Move them to another first.}}',
  'quality.last': 'This is the only profile. Add another before deleting it.',
  'quality.sizes': 'List every quality once.',
  'media.invalid': 'That setting isn’t valid. Check it and try again.',
  'media.recycleBin': 'Use a full path for the recycle bin, starting with /.',
  'folders.unknown': 'There’s no such root folder.',
})

const t = createT(qualityMessages)

/** The profiles highsea starts with are built in, as the server marks them. */
const SEEDED = new Set(seedProfiles().map((p) => p.id))
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const invalid = (message: string, reason = 'invalid') => refuse('invalid', message, { reason })

/** A movies' root folder as the API gives it (the dashboard's list and these answers share it). */
export function rootFolderOf(f: ReturnType<Ctx['api']['rootFolders']['list']>[number]): RootFolder {
  return {
    id: f.id,
    path: f.path,
    free: f.free,
    total: f.total,
    // the mock's seeded filesystem has every folder under /data on one disk, `data`
    device: f.accessible && f.path.startsWith('/data/') ? 'data' : null,
    accessible: f.accessible,
    movies: f.titles,
    languageProfileId: f.languageProfileId,
    waiting: f.waiting,
  }
}

/** A profile as the editor sends it: names the schema checks, so plain strings here. */
type ProfileBody = {
  name: string
  items: { name: string; qualities: string[]; allowed: boolean }[]
  formats: { formatId: string; score: number }[]
  waitMinutes?: number
}

export function qualityAnswers({ emit }: AdminKit): Answers {
  /** Presets saved through this transport, which read as the owner's ("Yours"). */
  const edited = new Set<string>()
  let made = 0

  const formatOf = (f: ServerState['customFormats'][number]): CustomFormat => ({
    ...f,
    edited: f.source === 'preset' && edited.has(f.id),
  })
  const profileOf = (p: ServerState['qualityProfiles'][number]) => ({
    ...p,
    builtIn: SEEDED.has(p.id),
  })

  /** The profile checked as @highsea-tv/quality checks it, with every quality listed. */
  const checkProfile = (s: ServerState, id: string, body: ProfileBody) => {
    const known = new Set(s.customFormats.map((f) => f.id))
    const parsed = qualityProfileSchema.safeParse({
      ...body,
      id,
      name: body.name.trim(),
      waitMinutes: body.waitMinutes ?? 0,
      items: completeItems(body.items as ProfileItem[]),
      // a score for a format that's gone means nothing; a 0 is the same as none
      formats: body.formats.filter((f) => known.has(f.formatId) && f.score !== 0),
    })
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? t('quality.checkProfile'))
    const taken = s.qualityProfiles.find((p) => p.id !== id && sameName(p.name, parsed.data.name))
    if (taken)
      throw refuse('conflict', t('quality.profileTaken', { name: taken.name }), {
        reason: 'name-taken',
      })
    return parsed.data
  }

  const checkCustom = (
    s: ServerState,
    id: string,
    body: { name: string; conditions: unknown[] },
    base: ServerState['customFormats'][number] | null,
  ) => {
    const parsed = customFormatSchema.safeParse({
      id,
      name: body.name.trim(),
      source: base?.source ?? 'custom',
      trashId: base?.trashId ?? null,
      conditions: body.conditions,
    })
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? t('quality.checkFormat'))
    const issue = validateFormat(parsed.data)[0]
    if (issue) throw invalid(issue.message)
    const taken = s.customFormats.find((f) => f.id !== id && sameName(f.name, parsed.data.name))
    if (taken)
      throw refuse('conflict', t('quality.formatTaken', { name: taken.name }), {
        reason: 'name-taken',
      })
    return parsed.data
  }

  const profileAt = (s: ServerState, id: string) => {
    const i = s.qualityProfiles.findIndex((p) => p.id === id)
    if (i < 0)
      throw refuse('not-found', t('quality.profileUnknown'), { reason: 'unknown-quality-profile' })
    return i
  }
  const formatAt = (s: ServerState, id: string) => {
    const i = s.customFormats.findIndex((f) => f.id === id)
    if (i < 0)
      throw refuse('not-found', t('quality.formatUnknown'), { reason: 'unknown-custom-format' })
    return i
  }

  /** The contract's media management: the mock's, less the shows' naming it doesn't carry. */
  const mediaOf = (s: ServerState): MediaManagementSettings => {
    const { episodes: _, ...movies } = s.settings.media
    return movies
  }

  /** A size table checked as the server checks the films': every quality once, each row valid. */
  const checkSizes = (have: string[], body: { quality: string }[]) => {
    const sent = body.map((q) => q.quality)
    if (sent.length !== have.length || !have.every((q) => sent.includes(q)))
      throw invalid(t('quality.sizes'))
    const rows = body.map((row) => {
      const c = qualitySizeSchema.safeParse(row)
      if (!c.success) throw invalid(`${row.quality}: ${c.error.issues[0]?.message ?? ''}`)
      return c.data
    })
    // lowest quality first, as the server keeps them
    return have.map((q) => rows.find((r) => r.quality === q) as (typeof rows)[number])
  }

  return {
    series: {
      naming: (_, ctx) => ctx.srv.state.settings.media.episodes,
      saveNaming: ({ body }, ctx) => {
        const s = ctx.srv.state
        s.settings.media = { ...s.settings.media, episodes: body }
        emit('settings.updated')
        return s.settings.media.episodes
      },
      qualitySizes: (_, ctx) => ctx.srv.state.settings.episodeSizes,
      saveQualitySizes: ({ body }, ctx) => {
        const s = ctx.srv.state
        s.settings.episodeSizes = checkSizes(
          s.settings.episodeSizes.map((q) => q.quality),
          body,
        )
        emit('settings.updated')
        return s.settings.episodeSizes
      },
      profileUsage: (_, ctx) =>
        Object.entries(ctx.api.movies.profileUsage()).map(([profileId, use]) => ({
          profileId,
          ...use,
        })),
    },

    quality: {
      profile: ({ params }, ctx) => {
        const s = ctx.srv.state
        const p = s.qualityProfiles[profileAt(s, params.id)]
        if (!p)
          throw refuse('not-found', t('quality.profileUnknown'), {
            reason: 'unknown-quality-profile',
          })
        return profileOf(p)
      },
      addProfile: ({ body }, ctx) => {
        const s = ctx.srv.state
        const p = checkProfile(s, `qp-new-${++made}`, body)
        s.qualityProfiles.push(p)
        emit('settings.updated')
        return profileOf(p)
      },
      saveProfile: ({ params, body }, ctx) => {
        const s = ctx.srv.state
        const at = profileAt(s, params.id)
        const p = checkProfile(s, params.id, body)
        s.qualityProfiles[at] = p
        emit('settings.updated')
        return profileOf(p)
      },
      /** Refused while a movie uses it, as Radarr refuses, and for the last one left. */
      removeProfile: ({ params }, ctx) => {
        const s = ctx.srv.state
        profileAt(s, params.id)
        const used = s.items.filter(
          (m) => m.type === 'movie' && m.versions.some((v) => v.qualityProfileId === params.id),
        ).length
        if (used > 0)
          throw refuse('conflict', t('quality.inUse', { count: used }), {
            reason: 'in-use',
            movies: used,
          })
        if (s.qualityProfiles.length <= 1)
          throw refuse('conflict', t('quality.last'), { reason: 'last-profile' })
        s.qualityProfiles = s.qualityProfiles.filter((p) => p.id !== params.id)
        emit('settings.updated')
      },
      customFormats: (_, ctx) => ctx.srv.state.customFormats.map(formatOf),
      addFormat: ({ body }, ctx) => {
        const s = ctx.srv.state
        const f = checkCustom(s, `cf-new-${++made}`, body, null)
        s.customFormats.push(f)
        emit('settings.updated')
        return formatOf(f)
      },
      /** Saving a preset makes it the owner's: `edited`, so the presets' updates leave it alone. */
      saveFormat: ({ params, body }, ctx) => {
        const s = ctx.srv.state
        const at = formatAt(s, params.id)
        const base = s.customFormats[at] ?? null
        const f = checkCustom(s, params.id, body, base)
        s.customFormats[at] = f
        if (f.source === 'preset') edited.add(f.id)
        emit('settings.updated')
        return formatOf(f)
      },
      /** Its scores go from every profile, as Radarr removes them. */
      removeFormat: ({ params }, ctx) => {
        const s = ctx.srv.state
        formatAt(s, params.id)
        s.customFormats = s.customFormats.filter((f) => f.id !== params.id)
        for (const p of s.qualityProfiles)
          p.formats = p.formats.filter((x) => x.formatId !== params.id)
        emit('settings.updated')
      },
    },

    settings: {
      qualitySizes: (_, ctx) => ctx.srv.state.settings.qualitySizes,
      saveQualitySizes: ({ body }, ctx) => {
        const s = ctx.srv.state
        s.settings.qualitySizes = checkSizes(
          s.settings.qualitySizes.map((q) => q.quality),
          body,
        )
        emit('settings.updated')
        return s.settings.qualitySizes
      },
      mediaManagement: (_, ctx) => mediaOf(ctx.srv.state),
      saveMediaManagement: ({ body }, ctx) => {
        const s = ctx.srv.state
        for (const key of ['folderFormat', 'fileFormat'] as const) {
          const problem = checkFormat(body[key], key === 'folderFormat' ? 'folder' : 'file')
          if (problem) throw invalid(problem, key)
        }
        if (body.recycleBin && !body.recycleBin.startsWith('/'))
          throw invalid(t('media.recycleBin'), 'recycleBin')
        s.settings.media = { ...s.settings.media, ...body }
        emit('settings.updated')
        return mediaOf(s)
      },
    },

    tags: {
      add: ({ body }, ctx) => ctx.api.tags.add(body.label) as never,
      rename: ({ params, body }, ctx) => {
        ctx.api.tags.rename(params.id, body.label)
        return ctx.api.tags.list().find((x) => x.id === params.id) as never
      },
      remove: ({ params }, ctx) => {
        ctx.api.tags.remove(params.id)
      },
    },

    rootFolders: {
      add: ({ body }, ctx) => rootFolderOf(ctx.api.rootFolders.add(body.path, 'movies')),
      update: ({ params, body }, ctx) => {
        const s = ctx.srv.state
        if (!s.settings.rootFolders.some((f) => f.id === params.id && f.kind === 'movies'))
          throw refuse('not-found', t('folders.unknown'))
        ctx.api.rootFolders.update(params.id, body)
        const f = ctx.api.rootFolders.list('movies').find((x) => x.id === params.id)
        return rootFolderOf(f as NonNullable<typeof f>)
      },
      remove: ({ params }, ctx) => {
        ctx.api.rootFolders.remove(params.id)
      },
    },
  }
}
