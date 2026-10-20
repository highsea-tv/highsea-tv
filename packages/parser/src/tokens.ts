// SPDX-License-Identifier: AGPL-3.0-only
// How the parser's patterns are written. Release names separate their words with dots, spaces,
// underscores or hyphens (scene rules 18.1: "0123456789._-" and letters), so a token's edge is any
// character that isn't a letter or a digit. `\b` won't do: it counts `_` as a word character and
// knows no letters outside ASCII.

/** Before a token: not preceded by a letter or a digit. */
export const START = '(?<![\\p{L}\\p{N}])'
/** After a token: not followed by a letter or a digit. */
export const END = '(?![\\p{L}\\p{N}])'
/** One separator inside a token (`WEB-DL`, `WEB.DL`, `WEB DL`). */
export const SEP = '[ ._\\-]'

/** A whole-token pattern, case-insensitive unless `caseSensitive`. Global, so it can scan. */
export function token(body: string, caseSensitive = false): RegExp {
  return new RegExp(`${START}(?:${body})${END}`, caseSensitive ? 'gu' : 'giu')
}

export type Hit = { index: number; end: number; text: string }

/** The first match at or after `from`, or `null`. */
export function first(re: RegExp, s: string, from = 0): Hit | null {
  re.lastIndex = from
  const m = re.exec(s)
  return m ? { index: m.index, end: m.index + m[0].length, text: m[0] } : null
}

/** Every match at or after `from`, in order. */
export function all(re: RegExp, s: string, from = 0): Hit[] {
  const hits: Hit[] = []
  re.lastIndex = from
  for (let m = re.exec(s); m; m = re.exec(s)) {
    hits.push({ index: m.index, end: m.index + m[0].length, text: m[0] })
    if (m[0].length === 0) re.lastIndex++
  }
  return hits
}

/** Separators made spaces, runs of them collapsed: `Directors.Cut` → `Directors Cut`. */
export function words(s: string): string {
  return s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True when the token is written in capitals (`FRENCH`, `iTALiAN` counts: scene mixed case). */
export function shouty(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '')
  if (letters.length < 2) return false
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length
  return upper / letters.length >= 0.6
}
