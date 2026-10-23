// SPDX-License-Identifier: AGPL-3.0-only
// Small query helpers every media type's library uses.

/** SQLite's documented default limit on bound parameters is 32,766; chunks stay far below it. */
export const CHUNK = 500

export const chunks = <T>(list: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

/** A LIKE pattern's own characters escaped, for `LIKE ? ESCAPE '\'`. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
