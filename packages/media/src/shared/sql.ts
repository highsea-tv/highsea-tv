// SPDX-License-Identifier: AGPL-3.0-only
// Small query helpers every media type's library uses.
import { type SQL, sql } from 'drizzle-orm'

/** SQLite's documented default limit on bound parameters is 32,766; chunks stay far below it. */
export const CHUNK = 500

export const chunks = <T>(list: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

/** A LIKE pattern's own characters escaped, for `LIKE ? ESCAPE '\'`. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * A path outside every one of `roots` (or no path at all), for leaving out what's filed under the
 * root folders highsea only reads (ADR 0063). A prefix compare, not LIKE, so a folder name's `_`
 * or `%` matches only itself.
 */
export function notUnderRoots(roots: readonly string[], path: SQL): SQL {
  if (!roots.length) return sql`1 = 1`
  const inside = sql.join(
    roots.map(
      (root) => sql`(${path} = ${root} OR substr(${path}, 1, ${root.length + 1}) = ${`${root}/`})`,
    ),
    sql` OR `,
  )
  return sql`(${path} IS NULL OR NOT (${inside}))`
}
