// SPDX-License-Identifier: AGPL-3.0-only
// The movie screens' data, apart from React: the add dialog's starting values and what it sends,
// the missing-key check, and the library's paged loading. Kept free of the DOM so tests import it
// directly.
import type {
  AddMovieDefaults,
  AddMovieInput,
  LanguageProfile,
  MinimumAvailability,
  Movie,
  MoviePage,
  MovieStatus,
  QualityProfile,
  RootFolder,
} from '@highsea/api-contract'
import type { ApiError, HighseaClient } from '@highsea/sdk'

/** Where the missing-key messages link (checkpoint 4 plan, decision 1). */
export const METADATA_SETTINGS = '/settings/general#metadata'
/** Where root folders are added (checkpoint 4 plan › Admin). */
export const MEDIA_SETTINGS = '/settings/media'

export const AVAILABILITY = [
  'announced',
  'in-cinemas',
  'released',
] as const satisfies MinimumAvailability[]

// ---------------------------------------------------------------- the add dialog

export type AddForm = AddMovieDefaults & { monitored: boolean }

export type AddOptions = {
  folders: RootFolder[]
  quality: QualityProfile[]
  language: LanguageProfile[]
  defaults: AddMovieDefaults | null
}

/** The remembered values while they still name a folder and profiles that exist, else the first. */
export function initialForm({ folders, quality, language, defaults: d }: AddOptions): AddForm {
  const has = <T extends { id: string }>(list: T[], id: string | null | undefined) =>
    id != null && list.some((x) => x.id === id)
  return {
    rootFolder:
      d && folders.some((f) => f.path === d.rootFolder) ? d.rootFolder : (folders[0]?.path ?? ''),
    qualityProfileId:
      d && has(quality, d.qualityProfileId) ? d.qualityProfileId : (quality[0]?.id ?? ''),
    languageProfileId:
      d && has(language, d.languageProfileId)
        ? (d.languageProfileId ?? null)
        : (language[0]?.id ?? null),
    minimumAvailability: d?.minimumAvailability ?? 'released',
    // decision 2: off while there are no indexers to search; checkpoint 5 reads the remembered one
    searchNow: false,
    monitored: true,
  }
}

/**
 * What the dialog sends for one movie. Its one version is labelled with the profile's name, the
 * way the library's tags read ("HD 1080p"); a second version gets its own label on the movie page.
 */
export function addInput(tmdbId: number, f: AddForm, quality: QualityProfile[]): AddMovieInput {
  const label = quality.find((p) => p.id === f.qualityProfileId)?.name ?? 'Main'
  return {
    tmdbId,
    rootFolder: f.rootFolder,
    monitored: f.monitored,
    minimumAvailability: f.minimumAvailability,
    languageProfileId: f.languageProfileId ?? null,
    versions: [{ label, qualityProfileId: f.qualityProfileId }],
    ...(f.searchNow ? { searchNow: true } : {}),
  }
}

/** What's remembered: everything but Monitored, which starts on each time. */
export const defaultsOf = ({ monitored: _, ...defaults }: AddForm): AddMovieDefaults => defaults

/** True when the server answered that it has no TMDB key (contract: `details.reason`). */
export const isNoMetadataKey = (e: unknown) =>
  (e as ApiError | undefined)?.status === 503 &&
  ((e as ApiError).details as { reason?: string } | undefined)?.reason === 'no-tmdb-key'

// ---------------------------------------------------------------- the library

/** A page of the library, as the API's default. */
export const PAGE = 60
/** The most one request returns (MovieListQuery's `limit`). */
const MAX_LIMIT = 200

export type LibraryFilters = {
  status?: MovieStatus
  title?: string
  sort: 'title' | 'added' | 'year' | 'rating'
}

/**
 * The first `count` movies for these filters, following the cursor. Show more asks for more, and a
 * live update asks again for everything shown, so a movie added or removed never leaves a gap or a
 * repeat between pages.
 */
export async function loadMovies(
  c: Pick<HighseaClient, 'movies'>,
  filters: LibraryFilters,
  count: number,
): Promise<MoviePage> {
  const items: Movie[] = []
  let cursor: string | undefined
  let page: MoviePage
  do {
    page = await c.movies.list({
      query: { ...filters, cursor, limit: Math.min(MAX_LIMIT, count - items.length) },
    })
    items.push(...page.items)
    cursor = page.next ?? undefined
  } while (cursor && items.length < count)
  return { ...page, items }
}
