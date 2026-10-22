// SPDX-License-Identifier: AGPL-3.0-only
// The movie screens' data, apart from React: the add dialog's starting values and what it sends,
// the missing-key check, the library's paged loading, and how a download's state looks
// (checkpoint 6). Kept free of the DOM so tests import it directly.
import type {
  AddMovieDefaults,
  AddMovieInput,
  HistoryPage,
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
  /** Whether an enabled indexer exists: Search now is off and disabled while none does. */
  canSearch?: boolean
}

/** A root folder's default language profile while it still exists (checkpoint 8c), else undefined. */
export function folderLanguageOf(
  folders: RootFolder[],
  language: LanguageProfile[],
  path: string,
): string | undefined {
  const id = folders.find((f) => f.path === path)?.languageProfileId
  return id && language.some((l) => l.id === id) ? id : undefined
}

/** The remembered values while they still name a folder and profiles that exist, else the first. */
export function initialForm({
  folders,
  quality,
  language,
  defaults: d,
  canSearch = false,
}: AddOptions): AddForm {
  const has = <T extends { id: string }>(list: T[], id: string | null | undefined) =>
    id != null && list.some((x) => x.id === id)
  const rootFolder =
    d && folders.some((f) => f.path === d.rootFolder) ? d.rootFolder : (folders[0]?.path ?? '')
  // the folder's own default comes first (checkpoint 8c), then the remembered choice
  const folderLanguage = folderLanguageOf(folders, language, rootFolder)
  return {
    rootFolder,
    qualityProfileId:
      d && has(quality, d.qualityProfileId) ? d.qualityProfileId : (quality[0]?.id ?? ''),
    languageProfileId:
      folderLanguage ??
      (d && has(language, d.languageProfileId)
        ? (d.languageProfileId ?? null)
        : (language[0]?.id ?? null)),
    minimumAvailability: d?.minimumAvailability ?? 'released',
    // decision 2: off while no indexer is enabled; with one, the remembered choice, else on
    // (movies.md: adding usually means "get it")
    searchNow: canSearch && (d?.searchNow ?? true),
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
  /** A tag's id (checkpoint 8c). */
  tag?: string
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

/** Every page of a movie's history up to `pages`, following the cursor (Show more asks for more). */
export async function loadHistory(
  c: Pick<HighseaClient, 'movies'>,
  id: number,
  pages: number,
): Promise<HistoryPage> {
  const items: HistoryPage['items'] = []
  let cursor: string | undefined
  let page: HistoryPage
  let n = 0
  do {
    page = await c.movies.history({ params: { id }, query: cursor ? { cursor } : {} })
    items.push(...page.items)
    cursor = page.next ?? undefined
  } while (cursor && ++n < pages)
  return { items, next: page.next }
}
