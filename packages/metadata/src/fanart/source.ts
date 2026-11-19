// SPDX-License-Identifier: AGPL-3.0-only
// fanart.tv as highsea's second artwork source (HT-74, ADR 0070). TMDB stays the first: fanart.tv
// gives a film's logo only when TMDB has none, and adds its posters, backgrounds and logos to the
// artwork dialog's choices. Its answers are kept in `fanart_images`, by what fanart.tv keys a title
// on, and read from there; nothing waits on fanart.tv but the dialog.
//
// Subjects: a film by its TMDB id now. A show by its TheTVDB id (`/tv/{id}`, show_metadata's
// `tvdb_id`) and a music artist by its MusicBrainz id (`/music/{mbid}`) are rows of `SUBJECTS`
// below; adding one is its row, its types in types.ts, and its owner in `subjectOf` (service.ts).
import { schema } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import type { ArtworkKind, ArtworkOption } from '../artwork.ts'
import type { MetadataDeps } from '../context.ts'
import { createFanartClient, type FanartClient, type FanartKeys } from './client.ts'
import type { FanartAnswer, FanartImage } from './types.ts'

const { fanartImages } = schema
const DAY = 24 * 60 * 60 * 1000

/** A found answer is asked again after a month, as TMDB's rows are swept (ADR 0030). */
export const FANART_FOUND_FRESH_MS = 30 * DAY
/**
 * "Nothing" is asked again after a week: a project key sees an image seven days after it's added
 * (fanart.tv's Access Tiers), so asking sooner can't find more.
 */
export const FANART_NONE_FRESH_MS = 7 * DAY

export type FanartSubject = 'movie' | 'show' | 'artist'

/** fanart.tv's path and its image types for each of highsea's kinds, best first. */
export const SUBJECTS: Record<
  FanartSubject,
  { path: string; kinds: Record<ArtworkKind, readonly string[]> }
> = {
  movie: {
    path: 'movies',
    kinds: { poster: ['movieposter'], backdrop: ['moviebackground'], logo: ['hdmovielogo'] },
  },
  show: {
    path: 'tv',
    kinds: { poster: ['tvposter'], backdrop: ['showbackground'], logo: ['hdtvlogo'] },
  },
  artist: {
    path: 'music',
    kinds: { poster: ['artistthumb'], backdrop: ['artistbackground'], logo: ['hdmusiclogo'] },
  },
}

/**
 * fanart.tv's files get a name of highsea's in image addresses: `/ftv_` and the file's own name
 * (`/ftv_fight-club-52751b914903b.png`), which TMDB's never start with. The address is served only
 * when the title's cached answer lists a file by that name, so nothing else is fetched.
 */
export const FANART_PREFIX = '/ftv_'
const NAME = /^[A-Za-z0-9_-]{1,90}\.(jpg|jpeg|png)$/

export function fileOf(url: string): string | null {
  const name = url.slice(url.lastIndexOf('/') + 1)
  return NAME.test(name) ? `${FANART_PREFIX}${name}` : null
}

export const isFanartFile = (file: string) => file.startsWith(FANART_PREFIX)

const num = (s: string | undefined) => {
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}
/** `00` and empty mean no text on it. */
const lang = (i: FanartImage) => (i.lang && i.lang !== '00' ? i.lang.toLowerCase() : null)

export type FanartDeps = Pick<MetadataDeps, 'db' | 'clock' | 'logger' | 'fetch' | 'sleep'> & {
  /** highsea's project key, from the image (ADR 0057's pattern), and the owner's personal key. */
  keys: () => FanartKeys
  client?: FanartClient
}

export function createFanart(deps: FanartDeps) {
  const { db, clock } = deps
  const logger = deps.logger.child('fanart')
  const client =
    deps.client ?? createFanartClient({ fetch: deps.fetch, clock, logger, sleep: deps.sleep })

  const where = (subject: FanartSubject, id: string) =>
    and(eq(fanartImages.subject, subject), eq(fanartImages.externalId, id))

  function row(subject: FanartSubject, id: string | number) {
    return db
      .select({ data: fanartImages.data, fetchedAt: fanartImages.fetchedAt })
      .from(fanartImages)
      .where(where(subject, String(id)))
      .get()
  }

  const answer = (subject: FanartSubject, id: string | number) =>
    (row(subject, id)?.data ?? null) as FanartAnswer | null

  /** fanart.tv's images of a kind for the title, in the order it lists them. */
  function imagesOf(subject: FanartSubject, id: string | number, kind: ArtworkKind) {
    const data = answer(subject, id) as Record<string, FanartImage[] | undefined> | null
    if (!data) return []
    return SUBJECTS[subject].kinds[kind].flatMap((type) =>
      Array.isArray(data[type]) ? (data[type] as FanartImage[]) : [],
    )
  }

  /** Raster images with a name highsea can serve; a logo must be a PNG (its ground shows through). */
  const usable = (kind: ArtworkKind) => (i: FanartImage) => {
    const file = typeof i.url === 'string' ? fileOf(i.url) : null
    return !!file && (kind !== 'logo' || file.endsWith('.png'))
  }

  const enabled = () => {
    const k = deps.keys()
    return !!(k.project || k.personal)
  }

  return {
    /** On when highsea has its project key or the owner has added a personal one. */
    enabled,

    /** Whether the title's answer is missing or old enough to ask again. */
    due(subject: FanartSubject, id: string | number) {
      const r = row(subject, id)
      if (!r) return true
      const age = clock.now() - r.fetchedAt
      return age >= (r.data ? FANART_FOUND_FRESH_MS : FANART_NONE_FRESH_MS)
    },

    /**
     * Asks fanart.tv for the title and keeps the answer, or that there's none. Throws when it can't
     * be asked (off, resting, down, the key refused); nothing is written then. Safe to repeat.
     */
    async refresh(subject: FanartSubject, id: string | number) {
      const keys = deps.keys()
      if (!keys.project && !keys.personal) return { found: false }
      const data = await client.get<FanartAnswer>(
        `${SUBJECTS[subject].path}/${encodeURIComponent(String(id))}`,
        keys,
      )
      const values = {
        subject,
        externalId: String(id),
        data: data as object | null,
        fetchedAt: clock.now(),
      }
      db.insert(fanartImages)
        .values(values)
        .onConflictDoUpdate({
          target: [fanartImages.subject, fanartImages.externalId],
          set: values,
        })
        .run()
      return { found: !!data }
    },

    /**
     * The automatic logo when TMDB has none (the owner's change 4): fanart.tv's HD logo in the
     * metadata language first, then English, then any, the most liked within each.
     */
    logo(subject: FanartSubject, id: string | number, language: string): string | null {
      const want = language.split('-')[0]?.toLowerCase()
      const rank = (i: FanartImage) => (lang(i) === want ? 0 : lang(i) === 'en' ? 1 : 2)
      const best = imagesOf(subject, id, 'logo')
        .filter(usable('logo'))
        .sort((a, b) => rank(a) - rank(b) || (num(b.likes) ?? 0) - (num(a.likes) ?? 0))[0]
      return best ? fileOf(best.url) : null
    },

    /** The dialog's choices from fanart.tv for a kind, the most liked first. */
    options(subject: FanartSubject, id: string | number, kind: ArtworkKind): ArtworkOption[] {
      return imagesOf(subject, id, kind)
        .filter(usable(kind))
        .sort((a, b) => (num(b.likes) ?? 0) - (num(a.likes) ?? 0))
        .map((i) => ({
          source: 'fanart' as const,
          file: fileOf(i.url) as string,
          language: lang(i),
          width: num(i.width) ?? 0,
          height: num(i.height) ?? 0,
          voteAverage: null,
          voteCount: null,
          likes: num(i.likes) ?? 0,
        }))
    },

    /**
     * Where a fanart file is, from the title's cached answer; null when the answer has no such file.
     * `size` is the width wanted: fanart.tv's `bigpreview` (at most 400 px) serves the dialog's
     * tiles, as its docs advise for pickers, and the full file the rest.
     */
    urlOf(subject: FanartSubject, id: string | number, file: string, width: number) {
      if (!isFanartFile(file)) return null
      for (const kind of ['poster', 'backdrop', 'logo'] as const)
        for (const i of imagesOf(subject, id, kind))
          if (typeof i.url === 'string' && fileOf(i.url) === file)
            return (width <= 300 ? i.url.replace('/fanart/', '/bigpreview/') : i.url).replace(
              /^http:/,
              'https:',
            )
      return null
    },

    /** Removes kept answers older than `before` for ids not in `keep`. */
    purge(subject: FanartSubject, before: number, keep: Set<string>) {
      const old = db
        .select({ id: fanartImages.externalId, fetchedAt: fanartImages.fetchedAt })
        .from(fanartImages)
        .where(eq(fanartImages.subject, subject))
        .all()
        .filter((r) => r.fetchedAt < before && !keep.has(r.id))
      for (const r of old) db.delete(fanartImages).where(where(subject, r.id)).run()
      return old.length
    },

    /**
     * Checks a personal key with one request (fanart.tv has no call for that): a film's images with
     * that key alone, which a personal key may be (its Authentication docs). A 404 is still a
     * key it took. Throws `fanart-key-rejected` on a 401.
     */
    async check(personal: string) {
      await client.get('movies/550', { project: null, personal })
    },

    image: client.image,
  }
}

export type Fanart = ReturnType<typeof createFanart>
