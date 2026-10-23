// SPDX-License-Identifier: AGPL-3.0-only
// Fetching a grabbed release (checkpoint 6): its `.torrent` from the link the search kept, through
// the same rate limit and sign-in as the search, or its magnet. Torznab servers such as Prowlarr
// and Jackett answer a download link with a redirect to a magnet when the release has no file, so
// a redirect to one is taken as the magnet, as Radarr's TorrentClientBase.DownloadFromWebUrl does
// (src/NzbDrone.Core/Download/TorrentClientBase.cs). The bytes are checked to be a bencoded
// dictionary (BEP 3), so a sign-in page that came back instead fails here, not in the engine.
import type { Fetch } from '@highsea-tv/core'
import { checkStatus, IndexerError } from './http.ts'

/** A `.torrent` is metadata: no real one comes near this. */
export const MAX_TORRENT_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 5

export type Fetched = { torrent: Uint8Array } | { magnet: string }

export type FetchReleaseContext = {
  fetch: Fetch
  timeoutMs: number
  now: () => number
  beforeRequest: () => Promise<void>
  /** The indexer's own address: its sign-in cookie goes only there. */
  origin: string
  cookie: string | null
}

/** Fetches a `.torrent`, following redirects by hand so a magnet one can be caught. */
export async function fetchRelease(ctx: FetchReleaseContext, link: string): Promise<Fetched> {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    throw new IndexerError('parse', 'The release’s download link isn’t an address.')
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol === 'magnet:') return { magnet: url.href }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new IndexerError('parse', 'The release’s download link isn’t an address.')
    const headers = new Headers({ 'user-agent': 'highsea' })
    if (ctx.cookie && url.origin === ctx.origin) headers.set('cookie', ctx.cookie)
    await ctx.beforeRequest()
    let response: Response
    try {
      response = await ctx.fetch(url, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(ctx.timeoutMs),
      })
    } catch (e) {
      const err = e as Error
      if (err.name === 'TimeoutError' || err.name === 'AbortError')
        throw new IndexerError(
          'timeout',
          `The indexer didn’t send the torrent within ${Math.round(ctx.timeoutMs / 1000)} seconds.`,
        )
      throw new IndexerError('unavailable', 'Couldn’t reach the indexer for the torrent.')
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new IndexerError('parse', 'The indexer redirected to nowhere.')
      url = new URL(location, url)
      continue
    }
    const answer = {
      status: response.status,
      headers: response.headers,
      body: '',
      url: url.href,
      ms: 0,
    }
    checkStatus(answer, ctx.now())
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_TORRENT_BYTES)
      throw new IndexerError('parse', 'The indexer sent something too large to be a torrent.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > MAX_TORRENT_BYTES)
      throw new IndexerError('parse', 'The indexer sent something too large to be a torrent.')
    // a bencoded dictionary starts with `d` and ends with `e` (BEP 3)
    if (bytes[0] !== 0x64 || bytes[bytes.length - 1] !== 0x65) {
      const text = new TextDecoder().decode(bytes.subarray(0, 512)).trim()
      if (text.startsWith('magnet:')) return { magnet: text.split(/\s/)[0] as string }
      throw new IndexerError(
        /<html|<!doctype/i.test(text) ? 'auth' : 'parse',
        /<html|<!doctype/i.test(text)
          ? 'The indexer sent a web page instead of the torrent. Check its sign-in.'
          : 'The indexer’s answer isn’t a torrent.',
      )
    }
    return { torrent: bytes }
  }
  throw new IndexerError('parse', 'The indexer redirected too many times.')
}
