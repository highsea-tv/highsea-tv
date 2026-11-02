// SPDX-License-Identifier: AGPL-3.0-only
// One naming preview for the admin (prototype-gaps.md › 5.2): Settings › Media management's
// "Becomes" lines and manual import's column both name files with `@highsea-tv/media/naming`, the
// functions the server's import uses, so the three never disagree.
import {
  buildFileName,
  buildFolderName,
  type NamingMovie,
  PREVIEW_FILE,
  PREVIEW_MOVIE,
} from '@highsea-tv/media/naming'
import type { QualityName } from '@highsea-tv/quality'

/** Settings' preview: the folder format with Sintel. */
export const previewFolder = (format: string) => buildFolderName(format, PREVIEW_MOVIE)

/** Settings' preview: the file format with Sintel's 1080p Blu-ray. */
export const previewFile = (format: string) => buildFileName(format, PREVIEW_MOVIE, PREVIEW_FILE)

/** The mock's quality line ("WEB 1080p") as the vocabulary names it ("WEBDL-1080p"). */
const qualityOf = (line: string) => line.replace(/^WEB /, 'WEBDL ').replace(' ', '-') as QualityName

/** Where manual import puts a file: the movie's folder, then its name with the file's extension. */
export function importedAs(
  formats: { folderFormat: string; fileFormat: string },
  m: { title: string; year: number; tmdbId?: number },
  file: { path: string; quality: string },
) {
  const movie: NamingMovie = {
    title: m.title,
    originalTitle: m.title,
    year: m.year,
    imdbId: null,
    tmdbId: m.tmdbId ?? 0,
    collection: null,
  }
  const name = buildFileName(formats.fileFormat, movie, {
    quality: qualityOf(file.quality),
    releaseGroup: null,
    edition: null,
    mediaInfo: null,
  })
  return `${buildFolderName(formats.folderFormat, movie)}/${name}.${file.path.split('.').pop()}`
}
