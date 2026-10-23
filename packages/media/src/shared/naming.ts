// SPDX-License-Identifier: AGPL-3.0-only
// The naming engine (checkpoint 6, Naming): Radarr's tokens, so a migrating owner's formats mean
// the same thing (Servarr wiki, Radarr settings › Movie naming:
// https://wiki.servarr.com/radarr/settings#movie-naming-1). The parsing and cleaning follow
// Radarr's FileNameBuilder.cs line for line where it matters
// (https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/Organizer/FileNameBuilder.cs):
// the token pattern with its prefix, separator, custom format and suffix; the case of the token
// setting the case of the value; the clean title; "Title, The"; colon replacement and the
// illegal characters; repeated separators collapsed and trailing ones trimmed.
//
// One function names a file for the import, the settings preview and manual import's "becomes"
// column, so the three never disagree.
import type { QualityName } from '@highsea-tv/quality'
import {
  audioChannelsOf,
  audioCodecName,
  dynamicRangeType,
  type MediaInfo,
  videoCodecName,
} from './probe.ts'
import type { ColonReplacement } from './settings.ts'

export type NamingMovie = {
  title: string
  originalTitle: string | null
  year: number | null
  imdbId: string | null
  tmdbId: number
  collection: string | null
}

export type NamingFile = {
  quality: QualityName | null
  /** The release's revision: version 2 and up is a PROPER, `real` a REAL. */
  revision?: { version: number; real: number }
  releaseGroup: string | null
  edition: string | null
  /** The custom formats to name, in order. */
  customFormats?: string[]
  mediaInfo: MediaInfo | null
  /** The release name it came from, which decides between `x264` and `h264`. */
  sceneName?: string | null
}

export type NamingOptions = { colonReplacement?: ColonReplacement }

/**
 * Settings › Media management's preview: Sintel, as the prototype shows it, named by the same
 * functions the import uses.
 */
export const PREVIEW_MOVIE: NamingMovie = {
  title: 'Sintel',
  originalTitle: 'Sintel',
  year: 2010,
  imdbId: 'tt1727587',
  tmdbId: 45745,
  collection: null,
}
export const PREVIEW_FILE: NamingFile = {
  quality: 'Bluray-1080p',
  releaseGroup: 'GRP',
  edition: null,
  mediaInfo: null,
  sceneName: 'Sintel.2010.1080p.BluRay.x264-GRP',
}

// Radarr's TitleRegex. .NET lets the two `prefix` groups share a name and reads the last; here the
// conditional form's own is `outer`, which Radarr's tag carries.
const TOKEN =
  /(?<tag>\{(?<outer>[-{ ._[(]*)(?:imdb(?:id)?-|edition-))?\{(?<prefix>[-{ ._[(]*)(?<token>(?:[a-z0-9]+)(?:(?<separator>[- ._]+)(?:[a-z0-9]+))?)(?::(?<custom>[ ,a-z0-9|+-]+(?<![- ])))?(?<suffix>[-} ._)\]]*)\}/gi

const FILE_NAME_CLEANUP = /([- ._])(\1)+/g
const TRIM_SEPARATORS = /[- ._]+$/
const SCENIFY_REMOVE =
  /(?<=\s)(,|<|>|\/|\\|;|:|'|"|\||`|’|~|!|\?|@|\$|%|\^|\*|-|_|=){1}(?=\s)|('|`|’|:|\?|,)(?=(?:(?:s|m|t|ve|ll|d|re)\s)|\s|$)|(\(|\)|\[|\]|\{|\})/gi
const SCENIFY_REPLACE = /[/]/g
const TITLE_PREFIX = /^(The|An|A) (.*?)((?: *\([^)]+\))*)$/i
const RESERVED_DEVICE_NAMES = /^(?:aux|com[1-9]|con|lpt[1-9]|nul|prn)\./i

/** Radarr's BadCharacters and the GoodCharacters each becomes when replacing. */
const BAD = ['\\', '/', '<', '>', '?', '*', '|', '"']
const GOOD = ['+', '+', '', '', '!', '-', '', '']

/** Tokens compare without braces, separators or case, as Radarr's token comparer does. */
const keyOf = (token: string) => token.replace(/[{}\- ._]/g, '').toLowerCase()

const removeDiacritics = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')

/** `{Movie CleanTitle}`: "&" as "and", slashes as spaces, punctuation removed, accents folded. */
export function cleanTitle(title: string): string {
  return removeDiacritics(
    title.replace(/&/g, 'and').replace(SCENIFY_REPLACE, ' ').replace(SCENIFY_REMOVE, ''),
  )
}

/** `{Movie TitleThe}`: "The Matrix" as "Matrix, The"; a trailing "(…)" stays at the end. */
export function titleThe(title: string): string {
  return title.trim() ? title.replace(TITLE_PREFIX, '$2, $1$3') : ''
}

/** Radarr's CleanFileName with "Replace Illegal Characters" on. */
export function cleanFileName(name: string, colon: ColonReplacement = 'smart'): string {
  let out = name
  if (colon === 'smart') out = out.replaceAll(': ', ' - ').replaceAll(':', '-')
  else
    out = out.replaceAll(
      ':',
      { delete: '', dash: '-', 'space-dash': ' -', 'space-dash-space': ' - ' }[colon],
    )
  BAD.forEach((b, i) => {
    out = out.replaceAll(b, GOOD[i] as string)
  })
  return out.replace(/^[ .]+/, '').replace(/ +$/, '')
}

/** Radarr's GetEditionToken: title case, ordinals lower, IMAX, 3D, SDR, HDR and DV upper. */
export function editionToken(edition: string): string {
  return edition
    .toLowerCase()
    .replace(
      /(^|[^\p{L}\p{N}'’])(\p{L})/gu,
      (_, before: string, c: string) => before + c.toUpperCase(),
    )
    .replace(/((?:\b|_)\d{1,3}(?:st|th|rd|nd|mm)(?:\b|_))/gi, (m) => m.toLowerCase())
    .replace(/((?:\b|_)(?:IMAX|3D|SDR|HDR|DV)(?:\b|_))/gi, (m) => m.toUpperCase())
}

/** `{Movie Title:30}`: cut to a length, with `{ellipsis}` standing in until the end. */
function truncate(input: string, custom: string | undefined): string {
  if (!input.trim()) return ''
  const max = Number.parseInt(custom ?? '', 10)
  if (!Number.isFinite(max) || max === 0 || input.length <= Math.abs(max)) return input
  if (max < 0)
    return `{ellipsis}${input.slice(input.length - (Math.abs(max) - 3)).replace(/^[ .]+/, '')}`
  return `${input.slice(0, max - 3).replace(/[ .]+$/, '')}{ellipsis}`
}

type Handler = (custom: string | undefined) => string

function movieHandlers(movie: NamingMovie): Record<string, Handler> {
  return {
    [keyOf('Movie Title')]: (c) => truncate(movie.title, c),
    [keyOf('Movie CleanTitle')]: (c) => truncate(cleanTitle(movie.title), c),
    [keyOf('Movie TitleThe')]: (c) => truncate(titleThe(movie.title), c),
    [keyOf('Movie OriginalTitle')]: (c) => truncate(movie.originalTitle ?? '', c),
    [keyOf('Movie CleanOriginalTitle')]: (c) => truncate(cleanTitle(movie.originalTitle ?? ''), c),
    [keyOf('Movie Collection')]: (c) => truncate(movie.collection ?? '', c),
    [keyOf('Release Year')]: () => (movie.year ? String(movie.year) : ''),
    [keyOf('ImdbId')]: () => movie.imdbId ?? '',
    [keyOf('TmdbId')]: () => String(movie.tmdbId),
  }
}

function fileHandlers(file: NamingFile): Record<string, Handler> {
  const quality = file.quality ?? ''
  const proper = (file.revision?.version ?? 1) > 1 ? 'Proper' : ''
  const real = (file.revision?.real ?? 0) > 0 ? 'REAL' : ''
  const info = file.mediaInfo
  const handlers: Record<string, Handler> = {
    [keyOf('Quality Full')]: () => (quality ? `${quality} ${proper} ${real}` : ''),
    [keyOf('Quality Title')]: () => quality,
    [keyOf('Quality Proper')]: () => (quality ? proper : ''),
    [keyOf('Quality Real')]: () => (quality ? real : ''),
    [keyOf('Release Group')]: (c) => truncate(file.releaseGroup ?? '', c),
    [keyOf('Custom Formats')]: () => (file.customFormats ?? []).join(' '),
  }
  if (file.edition?.trim())
    handlers[keyOf('Edition Tags')] = (c) => truncate(editionToken(file.edition as string), c)
  if (info) {
    handlers[keyOf('MediaInfo VideoCodec')] = () => videoCodecName(info, file.sceneName ?? '')
    handlers[keyOf('MediaInfo AudioCodec')] = () => audioCodecName(info)
    handlers[keyOf('MediaInfo AudioChannels')] = () => audioChannelsOf(info.audio[0])
    handlers[keyOf('MediaInfo VideoDynamicRangeType')] = () => dynamicRangeType(info)
    handlers[keyOf('MediaInfo VideoDynamicRange')] = () =>
      (info.video?.hdr ?? 'none') === 'none' ? '' : 'HDR'
  }
  return handlers
}

/** Every token a folder format may use. */
const FOLDER_TOKENS = new Set(
  Object.keys(
    movieHandlers({
      title: '',
      originalTitle: null,
      year: null,
      imdbId: null,
      tmdbId: 0,
      collection: null,
    }),
  ),
)

/** Every token a file format may use. */
const FILE_TOKENS = new Set([
  ...FOLDER_TOKENS,
  ...Object.keys(
    fileHandlers({
      quality: null,
      releaseGroup: null,
      edition: 'x',
      mediaInfo: { duration: null, container: null, video: null, audio: [], subtitles: [] },
    }),
  ),
])

function replaceToken(
  match: RegExpExecArray['groups'] & {},
  handlers: Record<string, Handler>,
  colon: ColonReplacement,
): string {
  const token = match.token as string
  const handler = handlers[keyOf(token)]
  let text = (handler ? handler(match.custom) : '').trim()
  // the token's case sets the value's: {movie title} is lower, {MOVIE TITLE} upper
  if (/^[^\p{L}]*$/u.test(token.replace(/\p{Ll}/gu, ''))) text = text.toLowerCase()
  else if (/^[^\p{L}]*$/u.test(token.replace(/\p{Lu}/gu, ''))) text = text.toUpperCase()
  if (match.separator?.trim()) text = text.replaceAll(' ', match.separator)
  text = cleanFileName(text, colon)
  return text.trim() ? `${match.tag ?? ''}${match.prefix ?? ''}${text}${match.suffix ?? ''}` : ''
}

function replaceTokens(
  pattern: string,
  handlers: Record<string, Handler>,
  colon: ColonReplacement,
) {
  return pattern.replace(TOKEN, (...args) => {
    const groups = args[args.length - 1] as NonNullable<RegExpExecArray['groups']>
    return replaceToken(groups, handlers, colon)
  })
}

const reservedDeviceNames = (s: string) =>
  s.replace(RESERVED_DEVICE_NAMES, (m) => m.replace('.', '_'))

/**
 * A movie file's name from the file format, without the extension. A format with `/` makes
 * subfolders, as Radarr's does.
 */
export function buildFileName(
  format: string,
  movie: NamingMovie,
  file: NamingFile,
  options: NamingOptions = {},
): string {
  const colon = options.colonReplacement ?? 'smart'
  const handlers = { ...movieHandlers(movie), ...fileHandlers(file) }
  const parts: string[] = []
  for (const piece of format.split(/[\\/]/).filter(Boolean)) {
    let c = replaceTokens(piece, handlers, colon).trim()
    c = c.replace(FILE_NAME_CLEANUP, (m) => m[0] as string).replace(TRIM_SEPARATORS, '')
    c = reservedDeviceNames(c.replaceAll('{ellipsis}', '...'))
    if (c.trim()) parts.push(c)
  }
  return parts.join('/')
}

/** A movie's folder name from the folder format: movie tokens only, as Radarr's GetMovieFolder. */
export function buildFolderName(
  format: string,
  movie: NamingMovie,
  options: NamingOptions = {},
): string {
  const colon = options.colonReplacement ?? 'smart'
  const handlers = movieHandlers(movie)
  const parts: string[] = []
  for (const piece of format.split(/[\\/]/).filter(Boolean)) {
    let c = replaceTokens(piece, handlers, colon)
    c = c.replace(FILE_NAME_CLEANUP, (m) => m[0] as string).replace(/^[ .]+|[ .]+$/g, '')
    c = reservedDeviceNames(c.replaceAll('{ellipsis}', '...'))
    if (c.trim()) parts.push(c)
  }
  return parts.join('/')
}

/** Why a format can't be used, or null: empty, an unknown token, or a file token in a folder. */
export function checkFormat(format: string, kind: 'folder' | 'file'): string | null {
  if (!format.trim()) return 'The format can’t be empty.'
  const known = kind === 'folder' ? FOLDER_TOKENS : FILE_TOKENS
  for (const m of format.matchAll(TOKEN)) {
    const token = m.groups?.token as string
    if (known.has(keyOf(token))) continue
    if (kind === 'folder' && FILE_TOKENS.has(keyOf(token)))
      return `{${token}} describes a file, so it can’t name a folder.`
    return `highsea doesn’t know the token {${token}}.`
  }
  if (kind === 'file' && !/\{[^}]*title[^}]*\}/i.test(format))
    return 'The file format needs the movie’s title, so files can be told apart.'
  return null
}
