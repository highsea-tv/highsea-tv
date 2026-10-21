// SPDX-License-Identifier: AGPL-3.0-only
// Metainfo (BEP 3) and magnets (BEP 9). highsea parses `.torrent` files itself with `bencode`
// rather than through `parse-torrent`, so every file path is checked here before it can reach the
// disk: a name of `..` or one with a slash would otherwise write outside the save folder. Tracker
// tiers follow BEP 12, private torrents BEP 27.
import { createHash } from 'node:crypto'
import { AppError } from '@highsea/core'
import bencode from 'bencode'
import magnetDecode, { encode as magnetEncode } from 'magnet-uri'

export type MetainfoFile = {
  /** Relative to the save folder, with `/` between parts; the torrent's name comes first. */
  path: string
  length: number
  /** Where the file starts in the torrent's concatenated data. */
  offset: number
}

export type Metainfo = {
  /** SHA-1 of the bencoded info dictionary, lowercase hex. */
  infoHash: string
  name: string
  pieceLength: number
  /** The 20-byte SHA-1 of every piece, concatenated. */
  pieces: Uint8Array
  pieceCount: number
  length: number
  files: MetainfoFile[]
  private: boolean
  /** BEP 12's tiers, or the single `announce` as one tier. */
  trackers: string[][]
  /** The bencoded info dictionary: what metadata exchange (BEP 9) sends to peers. */
  info: Uint8Array
}

export type Magnet = {
  infoHash: string
  name: string | null
  trackers: string[][]
  /** `x.pe` peer addresses (`host:port`), BEP 9. */
  peers: string[]
}

type Dict = { [key: string]: unknown }

const invalid = (reason: string) =>
  new AppError('invalid', `That isn’t a valid torrent: ${reason}.`)

const isDict = (v: unknown): v is Dict =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array)

const text = (v: unknown) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : null)

export const sha1Hex = (data: Uint8Array) => createHash('sha1').update(data).digest('hex')

/**
 * One path component, safe to join under the save folder. Empty names, `.`, `..`, separators and
 * control characters are replaced, as qBittorrent and Transmission sanitize names.
 */
export function safeComponent(name: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what's removed
  const cleaned = name.replace(/[/\\\u0000-\u001f]/g, '_').trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return '_'
  return cleaned
}

const MAX_PIECE_LENGTH = 128 * 1024 * 1024

const announceUrl = (url: string) => /^(https?|udp):\/\//i.test(url)

function trackersOf(torrent: Dict): string[][] {
  const tiers: string[][] = []
  const list = torrent['announce-list']
  if (Array.isArray(list))
    for (const tier of list) {
      if (!Array.isArray(tier)) continue
      const urls = tier
        .map(text)
        .filter((u): u is string => !!u && announceUrl(u))
        .filter((u, i, all) => all.indexOf(u) === i)
      if (urls.length) tiers.push(urls)
    }
  const single = text(torrent.announce)
  if (!tiers.length && single && announceUrl(single)) tiers.push([single])
  return tiers
}

/** The info dictionary's fields, checked. `infoBytes` must be what `infoHash` hashes. */
export function parseInfo(infoBytes: Uint8Array, trackers: string[][] = []): Metainfo {
  let info: unknown
  try {
    info = bencode.decode(infoBytes)
  } catch {
    throw invalid('the file list can’t be read')
  }
  if (!isDict(info)) throw invalid('the file list can’t be read')
  const rawName = text(info['name.utf-8']) ?? text(info.name)
  if (!rawName) throw invalid('it has no name')
  const name = safeComponent(rawName)
  const pieceLength = info['piece length']
  if (typeof pieceLength !== 'number' || pieceLength <= 0 || !Number.isInteger(pieceLength))
    throw invalid('it has no piece length')
  // real torrents use 16 KiB to 16 MiB; the bound stops a crafted one making each piece gigabytes
  if (pieceLength > MAX_PIECE_LENGTH) throw invalid('its pieces are too large')
  const pieces = info.pieces
  if (!(pieces instanceof Uint8Array) || pieces.length === 0 || pieces.length % 20 !== 0)
    throw invalid('its piece hashes are missing')

  const files: MetainfoFile[] = []
  let offset = 0
  if (Array.isArray(info.files)) {
    for (const f of info.files) {
      if (!isDict(f) || typeof f.length !== 'number' || f.length < 0)
        throw invalid('a file has no size')
      const parts = (Array.isArray(f['path.utf-8']) ? f['path.utf-8'] : f.path) as unknown
      if (!Array.isArray(parts) || parts.length === 0) throw invalid('a file has no path')
      const path = [name, ...parts.map((p) => safeComponent(text(p) ?? ''))].join('/')
      // BEP 47 padding files hold no data worth keeping, but count toward the offsets
      files.push({ path, length: f.length, offset })
      offset += f.length
    }
    if (!files.length) throw invalid('it lists no files')
  } else {
    if (typeof info.length !== 'number' || info.length < 0) throw invalid('it has no size')
    files.push({ path: name, length: info.length, offset: 0 })
    offset = info.length
  }

  const pieceCount = pieces.length / 20
  if (Math.ceil(offset / pieceLength) !== pieceCount)
    throw invalid('its size doesn’t match its pieces')
  const seen = new Set<string>()
  for (const f of files) {
    if (seen.has(f.path)) throw invalid(`it lists ${f.path} twice`)
    seen.add(f.path)
  }
  return {
    infoHash: sha1Hex(infoBytes),
    name,
    pieceLength,
    pieces,
    pieceCount,
    length: offset,
    files,
    private: info.private === 1,
    trackers,
    info: infoBytes,
  }
}

/** A `.torrent` file's contents. */
export function parseTorrentFile(data: Uint8Array): Metainfo {
  let torrent: unknown
  try {
    torrent = bencode.decode(data)
  } catch {
    throw invalid('it isn’t a torrent file')
  }
  if (!isDict(torrent) || !isDict(torrent.info)) throw invalid('it has no file list')
  // the info dictionary is hashed as bencoded, as BEP 3 defines the info hash; bencode's encoder
  // writes keys in sorted order, so a canonical file hashes the same as its bytes
  return parseInfo(bencode.encode(torrent.info), trackersOf(torrent))
}

const HEX_HASH = /^[0-9a-f]{40}$/i

/** A `magnet:` link: its v1 info hash, name, trackers and peers. */
export function parseMagnet(uri: string): Magnet {
  if (!uri.startsWith('magnet:?')) throw new AppError('invalid', 'That isn’t a magnet link.')
  const m = magnetDecode(uri)
  const infoHash = m.infoHash?.toLowerCase()
  if (!infoHash || !HEX_HASH.test(infoHash))
    throw new AppError('invalid', 'That magnet link has no BitTorrent v1 hash.')
  const trackers = (m.announce ?? []).filter(announceUrl)
  return {
    infoHash,
    name: m.name ? safeComponent(m.name) : null,
    // magnets carry no tiers: each tracker is its own tier, as clients treat `tr` parameters
    trackers: trackers.map((t) => [t]),
    peers: m.peerAddresses ?? [],
  }
}

export const toMagnet = (m: { infoHash: string; name: string | null; trackers: string[][] }) =>
  magnetEncode({ infoHash: m.infoHash, name: m.name ?? undefined, announce: m.trackers.flat() })

/** A whole `.torrent` from metadata, to store a magnet's torrent once its metadata arrives. */
export const torrentFileOf = (m: Metainfo) =>
  bencode.encode({
    ...(m.trackers[0]?.[0] ? { announce: m.trackers[0][0] } : {}),
    ...(m.trackers.length ? { 'announce-list': m.trackers } : {}),
    info: bencode.decode(m.info),
  })

/** The size of piece `index`: the last one is usually shorter. */
export const pieceSize = (
  m: Pick<Metainfo, 'pieceLength' | 'length' | 'pieceCount'>,
  index: number,
) => (index === m.pieceCount - 1 ? m.length - m.pieceLength * (m.pieceCount - 1) : m.pieceLength)
