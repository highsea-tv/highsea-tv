// SPDX-License-Identifier: AGPL-3.0-only
// Torznab, Newznab and RSS answers. Both APIs are RSS 2.0 with extended attributes
// (`<torznab:attr name value>`, `<newznab:attr>`), capabilities from `t=caps`, and errors as
// `<error code description>` (Torznab 1.3: https://torznab.github.io/spec-1.3-draft/torznab/Specification-v1.3.html;
// Newznab: https://newznab.readthedocs.io/en/latest/misc/api/). A plain RSS feed is the same items
// without the attributes.
import { isMovieCategory } from '@highsea-tv/schemas/indexers'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { IndexerError } from './http.ts'
import { type IndexerRelease, toRelease } from './release.ts'

const LISTS = new Set(['item', 'category', 'subcat', 'enclosure'])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // every value stays text; `toRelease` reads numbers and dates once
  parseTagValue: false,
  parseAttributeValue: false,
  htmlEntities: true,
  isArray: (name) => LISTS.has(name) || name.endsWith(':attr') || name === 'attr',
})

type Node = Record<string, unknown>

/** Parses XML or throws a `parse` failure; a well-formedness check first, as the docs advise. */
export function readXml(text: string): Node {
  const valid = XMLValidator.validate(text)
  if (valid !== true)
    throw new IndexerError('parse', `The indexer’s answer isn’t valid XML (${valid.err.msg}).`)
  return parser.parse(text) as Node
}

const asArray = (v: unknown): Node[] =>
  Array.isArray(v) ? (v as Node[]) : v && typeof v === 'object' ? [v as Node] : []

/** An element's text, whether it has attributes or not. */
function textOf(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return textOf(v[0])
  if (typeof v === 'object' && '#text' in (v as Node)) return textOf((v as Node)['#text'])
  return null
}

const attr = (node: unknown, name: string): string | null =>
  node && typeof node === 'object' ? textOf((node as Node)[`@_${name}`]) : null

/** Newznab's error codes 100–102 are the credentials; 500 and 501 are its rate limits. */
export function throwIfError(doc: Node): void {
  const error = doc.error
  if (!error) return
  const code = Number(attr(error, 'code'))
  const description = attr(error, 'description') ?? 'no description'
  if (code >= 100 && code <= 102)
    throw new IndexerError('auth', `The indexer refused the credentials: ${description} (${code}).`)
  if (code === 500 || code === 501)
    throw new IndexerError('rate-limited', `The indexer’s limit is reached: ${description}.`)
  throw new IndexerError(
    'unavailable',
    `The indexer answered with an error: ${description} (${code}).`,
  )
}

export type SearchMode = { available: boolean; params: string[] }

export type Caps = {
  search: SearchMode
  movie: SearchMode
  /** Every category the indexer lists, subcategories with their parent. */
  categories: { id: number; name: string; parent: number | null }[]
  limits: { max: number | null; default: number | null }
}

function mode(node: unknown): SearchMode {
  return {
    available: attr(node, 'available') === 'yes',
    params: (attr(node, 'supportedParams') ?? '')
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
  }
}

export function readCaps(text: string): Caps {
  const doc = readXml(text)
  throwIfError(doc)
  const caps = doc.caps as Node | undefined
  if (!caps) throw new IndexerError('parse', 'The indexer’s capabilities have no <caps> element.')
  // an empty element parses to '', and ''.search is String.prototype.search
  const searching = (
    caps.searching && typeof caps.searching === 'object' ? caps.searching : {}
  ) as Node
  const categories: Caps['categories'] = []
  for (const c of asArray((caps.categories as Node | undefined)?.category)) {
    const id = Number(attr(c, 'id'))
    if (!Number.isInteger(id)) continue
    categories.push({ id, name: attr(c, 'name') ?? '', parent: null })
    for (const s of asArray(c.subcat)) {
      const sid = Number(attr(s, 'id'))
      if (Number.isInteger(sid))
        categories.push({ id: sid, name: attr(s, 'name') ?? '', parent: id })
    }
  }
  const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null)
  // a feed without a <search> element still answers t=search, which every Newznab API has
  const search = Object.hasOwn(searching, 'search')
    ? mode(searching.search)
    : { available: true, params: ['q'] }
  return {
    search,
    movie: mode(searching['movie-search']),
    categories,
    limits: { max: num(attr(caps.limits, 'max')), default: num(attr(caps.limits, 'default')) },
  }
}

/** The standard movie categories a caps document lists, for `cat=`. */
export function movieCategoryIds(caps: Caps): number[] {
  return caps.categories.filter((c) => isMovieCategory(c.id)).map((c) => c.id)
}

/** Extended attributes by lower-case name, each a list (Torznab: names may repeat). */
function attrsOf(item: Node): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [key, value] of Object.entries(item)) {
    if (!(key.endsWith(':attr') || key === 'attr')) continue
    for (const a of asArray(value)) {
      const name = attr(a, 'name')?.toLowerCase()
      const v = attr(a, 'value')
      if (!name || v == null) continue
      const list = out.get(name) ?? []
      if (!list.includes(v)) list.push(v)
      out.set(name, list)
    }
  }
  return out
}

export type FeedOptions = {
  /** For a plain RSS feed: the site's category text to standard ids. */
  mapCategory?: (text: string) => number | null
  now: number
}

/** The items of an RSS 2.0 answer as releases; items without a title or a link are dropped. */
export function readItems(text: string, options: FeedOptions): IndexerRelease[] {
  const doc = readXml(text)
  throwIfError(doc)
  const channel = (doc.rss as Node | undefined)?.channel as Node | undefined
  if (!channel) throw new IndexerError('parse', 'The indexer’s answer isn’t an RSS feed.')
  const out: IndexerRelease[] = []
  for (const item of asArray(channel.item)) {
    const attrs = attrsOf(item)
    const one = (name: string) => attrs.get(name)?.[0] ?? null
    const enclosure = asArray(item.enclosure)[0]
    const link = textOf(item.link)
    const enclosureUrl = attr(enclosure, 'url')
    const magnet =
      one('magneturl') ??
      (enclosureUrl?.startsWith('magnet:') ? enclosureUrl : null) ??
      (link?.startsWith('magnet:') ? link : null)
    const download =
      enclosureUrl && !enclosureUrl.startsWith('magnet:')
        ? enclosureUrl
        : link && !link.startsWith('magnet:')
          ? link
          : null
    const categories = new Set<number>()
    for (const c of attrs.get('category') ?? []) if (/^\d+$/.test(c)) categories.add(Number(c))
    // RSS's own <category>: a standard id, or the site's text the definition maps
    for (const c of Array.isArray(item.category) ? item.category : []) {
      const t = textOf(c)?.trim()
      if (!t) continue
      const mapped = options.mapCategory?.(t) ?? (/^\d+$/.test(t) ? Number(t) : null)
      if (mapped !== null) categories.add(mapped)
    }
    const release = toRelease(
      {
        title: textOf(item.title),
        guid: textOf(item.guid) ?? one('guid'),
        download,
        magnet,
        infohash: one('infohash'),
        details: textOf(item.comments) ?? (download && link !== download ? link : null),
        size: textOf(item.size) ?? one('size') ?? attr(enclosure, 'length'),
        seeders: one('seeders'),
        leechers: one('leechers'),
        peers: one('peers'),
        grabs: one('grabs'),
        files: one('files'),
        published: textOf(item.pubDate) ?? one('usenetdate'),
        imdbId: one('imdb') ?? one('imdbid'),
        tmdbId: one('tmdbid') ?? one('tmdb'),
        downloadVolumeFactor: one('downloadvolumefactor'),
        uploadVolumeFactor: one('uploadvolumefactor'),
        minimumRatio: one('minimumratio'),
        minimumSeedTime: one('minimumseedtime'),
      },
      [...categories].filter((c) => c > 0),
      options.now,
    )
    if (release) out.push(release)
  }
  return out
}
