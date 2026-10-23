// SPDX-License-Identifier: AGPL-3.0-only
// IP blocklists in the three formats qBittorrent reads, parsed into one sorted range set. The
// behaviour follows qBittorrent's `src/base/bittorrent/filterparserthread.cpp`, read for behaviour
// only (it's GPL-2.0; nothing is copied), and the formats' own descriptions:
// - PeerGuardian P2P text: `description:first-last` per line; the description may hold colons.
// - eMule DAT (ipfilter.dat): `first - last , access , description`; a range whose access level is
//   above 127 is allowed, not blocked, as eMule documents it (https://www.emule-project.net/home/perl/help.cgi?l=1&rm=show_topic&topic_id=142).
// - PeerGuardian P2B, binary: 0xFFFFFFFF, "P2B", a version byte. Versions 1 and 2 repeat a
//   NUL-terminated name, then the first and last IPv4 address (4 bytes each, big-endian); version 3
//   holds a count and the names, then a count and records of a name index and two addresses.
// Lines starting with `#` or `//` are comments; addresses may carry leading zeros (`001.002.003.004`).
// Both families are kept: IPv4 as numbers, IPv6 as 128-bit integers, an IPv4-mapped IPv6 address
// read as its IPv4 address. A list may arrive gzipped (RFC 1952), and is unpacked first.
import { isIP } from 'node:net'
import { gunzipSync } from 'node:zlib'

export type BlocklistFormat = 'p2p' | 'dat' | 'p2b'

/** Ranges, sorted and merged, with a binary search per lookup. */
export type RangeSet = {
  has(address: string): boolean
  /** How many ranges, after merging. */
  size: number
}

/** A list unpacked can't be bigger than this: the largest public lists are a few tens of MB. */
export const MAX_LIST_BYTES = 256 * 1024 * 1024

type V4 = [number, number]
type V6 = [bigint, bigint]

/** An IPv4 address as a number, leading zeros allowed (`010` is ten, not octal). */
export function ipv4(text: string): number | null {
  const parts = text.trim().split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

/** An IPv6 address as a 128-bit integer; `::` and a dotted IPv4 tail allowed. */
export function ipv6(text: string): bigint | null {
  let s = text.trim().replace(/^\[|\]$/g, '')
  const zone = s.indexOf('%')
  if (zone >= 0) s = s.slice(0, zone)
  if (isIP(s) !== 6) return null
  let tail: number[] = []
  const lastColon = s.lastIndexOf(':')
  if (s.slice(lastColon + 1).includes('.')) {
    const v4 = ipv4(s.slice(lastColon + 1))
    if (v4 === null) return null
    tail = [Math.floor(v4 / 65536), v4 % 65536]
    s = `${s.slice(0, lastColon + 1)}0:0`
  }
  const [head = '', rest] = s.split('::') as [string, string | undefined]
  const groups = (x: string) => (x ? x.split(':').map((g) => Number.parseInt(g, 16)) : [])
  const left = groups(head)
  const right = rest === undefined ? [] : groups(rest)
  const fill = rest === undefined ? 0 : 8 - left.length - right.length
  const all = [...left, ...new Array(fill).fill(0), ...right]
  if (tail.length) all.splice(6, 2, ...tail)
  if (all.length !== 8) return null
  let n = 0n
  for (const g of all) n = (n << 16n) | BigInt(g)
  return n
}

/** Parses one address of either family into where it's kept. */
function parse(text: string): { v4: number } | { v6: bigint } | null {
  const v4 = ipv4(text)
  if (v4 !== null) return { v4 }
  const v6 = ipv6(text)
  if (v6 === null) return null
  if (v6 >> 32n === 0xffffn) return { v4: Number(v6 & 0xffffffffn) }
  return { v6 }
}

/** Collects ranges of both families while a list is read. */
function collector() {
  const v4: V4[] = []
  const v6: V6[] = []
  return {
    v4,
    v6,
    add(first: string, last: string): boolean {
      const a = parse(first)
      const b = parse(last)
      if (!a || !b) return false
      if ('v4' in a && 'v4' in b) {
        v4.push(a.v4 <= b.v4 ? [a.v4, b.v4] : [b.v4, a.v4])
        return true
      }
      if ('v6' in a && 'v6' in b) {
        v6.push(a.v6 <= b.v6 ? [a.v6, b.v6] : [b.v6, a.v6])
        return true
      }
      return false
    },
  }
}

const isComment = (line: string) => !line || line.startsWith('#') || line.startsWith('//')

/** A `first-last` range, either family; null if it isn't one. */
function splitRange(text: string): [string, string] | null {
  const t = text.trim()
  // IPv6 addresses hold no `-`, so the one dash separates the two ends
  const dash = t.indexOf('-')
  if (dash < 0 || t.indexOf('-', dash + 1) >= 0) return null
  const first = t.slice(0, dash).trim()
  const last = t.slice(dash + 1).trim()
  return first && last ? [first, last] : null
}

/** One PeerGuardian P2P line: the description ends at the colon before a valid range. */
function p2pLine(line: string, add: (a: string, b: string) => boolean): boolean {
  for (let i = line.indexOf(':'); i >= 0; i = line.indexOf(':', i + 1)) {
    const range = splitRange(line.slice(i + 1))
    if (range && add(range[0], range[1])) return true
  }
  return false
}

/** One eMule DAT line: `first - last , access , description`; access above 127 is allowed. */
function datLine(line: string, add: (a: string, b: string) => boolean): boolean {
  const parts = line.split(',')
  const range = splitRange(parts[0] ?? '')
  if (!range) return false
  if (parts.length > 1) {
    const access = Number((parts[1] ?? '').trim())
    if (Number.isFinite(access) && access > 127) return true
  }
  return add(range[0], range[1])
}

const looksDat = (line: string) => /^[0-9a-fA-F:.\s]+-[0-9a-fA-F:.\s]+(,|$)/.test(line)

/** Text lists, either format, one line at a time; a line that's neither is skipped and counted. */
function parseText(text: string, into: ReturnType<typeof collector>) {
  let skipped = 0
  const add = (a: string, b: string) => into.add(a, b)
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (isComment(line)) continue
    const ok = looksDat(line) ? datLine(line, add) : p2pLine(line, add)
    if (!ok) skipped++
  }
  return skipped
}

const P2B_MAGIC = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x50, 0x32, 0x42])

/** PeerGuardian P2B, versions 1 to 3. Names are read past, not kept. */
function parseP2b(data: Buffer, into: ReturnType<typeof collector>) {
  const version = data[7]
  let at = 8
  const v4 = (n: number) => `${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
  const need = (n: number) => {
    if (at + n > data.length) throw new Error('The P2B list ends partway through a range.')
  }
  const skipName = () => {
    const end = data.indexOf(0, at)
    if (end < 0) throw new Error('The P2B list ends partway through a name.')
    at = end + 1
  }
  if (version === 1 || version === 2) {
    while (at < data.length) {
      skipName()
      need(8)
      into.add(v4(data.readUInt32BE(at)), v4(data.readUInt32BE(at + 4)))
      at += 8
    }
    return
  }
  if (version === 3) {
    need(4)
    const names = data.readUInt32BE(at)
    at += 4
    for (let i = 0; i < names; i++) skipName()
    need(4)
    const ranges = data.readUInt32BE(at)
    at += 4
    for (let i = 0; i < ranges; i++) {
      need(12)
      into.add(v4(data.readUInt32BE(at + 4)), v4(data.readUInt32BE(at + 8)))
      at += 12
    }
    return
  }
  throw new Error(`P2B version ${version} isn’t one highsea reads.`)
}

/** Sorts ranges and joins the ones that overlap or touch. */
function merge<T extends number | bigint>(ranges: [T, T][], next: (x: T) => T): [T, T][] {
  ranges.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
  const out: [T, T][] = []
  for (const r of ranges) {
    const last = out[out.length - 1]
    if (last && r[0] <= next(last[1])) {
      if (r[1] > last[1]) last[1] = r[1]
    } else out.push([r[0], r[1]])
  }
  return out
}

function search<T extends number | bigint>(ranges: [T, T][], x: T): boolean {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = ranges[mid] as [T, T]
    if (x < r[0]) hi = mid - 1
    else if (x > r[1]) lo = mid + 1
    else return true
  }
  return false
}

/** A range set from collected ranges; also used for an empty one. */
export function rangeSet(v4: V4[] = [], v6: V6[] = []): RangeSet {
  const a = mergeNumbers(v4)
  const b = mergeBigints(v6)
  return {
    size: a.length + b.length,
    has(address) {
      const p = parse(address.replace(/^::ffff:/i, ''))
      if (!p) return false
      return 'v4' in p ? search(a, p.v4) : search(b, p.v6)
    },
  }
}

const mergeNumbers = (r: V4[]) => merge<number>(r, (x) => x + 1)
const mergeBigints = (r: V6[]) => merge<bigint>(r, (x) => x + 1n)

export type ParsedBlocklist = { set: RangeSet; format: BlocklistFormat; skipped: number }

/** Unpacks gzip if it's gzipped, tells the format by its first bytes, and parses it. */
export function parseBlocklist(input: Uint8Array): ParsedBlocklist {
  let data = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (data[0] === 0x1f && data[1] === 0x8b)
    data = gunzipSync(data, { maxOutputLength: MAX_LIST_BYTES })
  if (data.length > MAX_LIST_BYTES) throw new Error('The blocklist is too big.')
  const into = collector()
  let format: BlocklistFormat
  let skipped = 0
  if (data.subarray(0, 7).equals(P2B_MAGIC)) {
    format = 'p2b'
    parseP2b(data, into)
  } else {
    if (data.subarray(0, Math.min(data.length, 4096)).includes(0))
      throw new Error('The blocklist isn’t P2P, DAT or P2B.')
    const text = data.toString('latin1')
    const firstLine = text.split(/\r?\n/).find((l) => !isComment(l.trim())) ?? ''
    format = looksDat(firstLine.trim()) ? 'dat' : 'p2p'
    skipped = parseText(text, into)
  }
  const set = rangeSet(into.v4, into.v6)
  if (set.size === 0) throw new Error('The blocklist has no ranges highsea could read.')
  return { set, format, skipped }
}

/** Nothing blocked: no list, or one turned off. */
export const NO_BLOCKLIST: RangeSet = rangeSet()
