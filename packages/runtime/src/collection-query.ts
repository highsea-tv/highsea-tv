// SPDX-License-Identifier: AGPL-3.0-only
// A smart collection's rules as one SQL query (checkpoint 8d, ADR 0049). Every condition becomes an
// expression over the library's own columns and the fact tables 8d added (`movie_terms`,
// `credits`, `media_file_languages`, the file columns), so SQLite answers a collection with its
// indexes rather than the server reading every title. Values are always bound: a list is one
// parameter, a JSON array read back with `json_each` (https://sqlite.org/json1.html#jeach).
//
// - A negated condition ("not in English") matches a title that has nothing to say, as people
//   mean it: `NOT coalesce(x, 0)`, since `NOT NULL` is NULL (https://sqlite.org/nulls.html).
// - Another collection named in a rule is its own query inside this one; a loop back to one
//   already being answered matches nothing.
// - Sorts put titles without a value last, both ways. Shuffled changes once a day: SQLite has no
//   seeded random (`random()` can't be seeded, https://sqlite.org/lang_corefunc.html#random), so
//   the rowid is mixed with a seed from the day and the collection and multiplied by Knuth's
//   golden-ratio constant modulo a prime (TAOCP vol. 3, 6.4), a stable order for the day.
import { ROLE_JOBS, type RuleGroup } from '@highsea-tv/api-contract'
import {
  type CollectionDef,
  type Condition,
  isSmartId,
  listOf,
  NOT_RATED,
  resolutionOf,
} from '@highsea-tv/curation/collections'
import { type SQL, sql } from 'drizzle-orm'

const DAY = 86_400_000

/** One bound parameter holding a list, as a subquery `IN` can read. */
const list = (xs: readonly (string | number)[]) =>
  sql`(SELECT value FROM json_each(${JSON.stringify(xs)}))`

/** A library movie, the base every query repeats. */
export const IN_LIBRARY = sql`mi.type = 'movie' AND mi.parent_id IS NULL`

/** A version has a file: what the apps can show (curation's "playable"). */
/** A sidecar's language without its region or script (`pt-BR` is `pt`): what the rule's ISO 639-1
 * codes compare with (BCP 47, RFC 5646 § 2.2.1, the primary subtag comes first). */
export const PRIMARY_SUBTAG = sql`lower(CASE WHEN instr(sf.language, '-') > 0
  THEN substr(sf.language, 1, instr(sf.language, '-') - 1) ELSE sf.language END)`

export const PLAYABLE = sql`mi.id IN (SELECT v.item_id FROM versions v WHERE v.file_id IS NOT NULL)`

const not = (x: SQL) => sql`NOT coalesce((${x}), 0)`
const anyOf = (xs: SQL[]) => (xs.length ? sql`(${sql.join(xs, sql` OR `)})` : sql`0`)
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const POSITIVE = new Set(['is', 'includes', 'oneOf', 'anyOf'])
const NEGATIVE = new Set(['isNot', 'excludes', 'notOneOf', 'noneOf'])

type Ctx = {
  now: number
  lookup: (id: string) => CollectionDef | null
  /** Collections being answered, outermost first. */
  visiting: Set<string>
  /** The region's certifications, mildest first (TMDB's `order`); null until TMDB has been asked. */
  ratings: string[] | null
}

/** `any` when a value matches, `all` when every one does; negatives are `any`'s opposite. */
function setOp(op: string, any: SQL, all?: SQL): SQL {
  if (POSITIVE.has(op)) return any
  if (NEGATIVE.has(op)) return not(any)
  if (op === 'allOf' && all) return all
  return sql`0`
}

/** A comparison of a number, for `is`, `atLeast`, `atMost` and `between`. */
function compare(column: SQL, c: Condition): SQL {
  const v = c.value
  if (c.op === 'between' && Array.isArray(v)) {
    const [a, b] = v as [number, number]
    return sql`${column} BETWEEN ${Math.min(a, b)} AND ${Math.max(a, b)}`
  }
  const n = Number(v)
  if (c.op === 'atLeast') return sql`${column} >= ${n}`
  if (c.op === 'atMost') return sql`${column} <= ${n}`
  if (c.op === 'before') return sql`${column} < ${n}`
  if (c.op === 'after') return sql`${column} > ${n}`
  return sql`${column} = ${n}`
}

// Each lookup in another table is an uncorrelated `IN (SELECT …)`: SQLite evaluates it once and
// reuses the result for every title (https://sqlite.org/lang_expr.html#subq), where a correlated
// EXISTS runs once per title, which at 100k titles costs hundreds of milliseconds.

const terms = (kind: string, values: string[]) =>
  sql`mi.tmdb_id IN (SELECT t.movie_id FROM movie_terms t WHERE t.kind = ${kind}
    AND t.value IN ${list(values)})`
const allTerms = (kind: string, values: string[]) =>
  sql`mi.tmdb_id IN (SELECT t.movie_id FROM movie_terms t WHERE t.kind = ${kind}
    AND t.value IN ${list(values)} GROUP BY t.movie_id
    HAVING count(DISTINCT t.value) = ${new Set(values).size})`

const fileLanguage = (kind: 'audio' | 'subtitle', values: string[], negate = false) =>
  sql`mi.id IN (SELECT mf.item_id FROM media_files mf JOIN media_file_languages l ON l.file_id = mf.id
    WHERE l.kind = ${kind} AND l.language ${negate ? sql`NOT IN` : sql`IN`} ${list(values)})`

const anyFile = (where: SQL) => sql`mi.id IN (SELECT mf.item_id FROM media_files mf WHERE ${where})`

/** Titles whose files, taken together, pass `having`: the best file's lines, the largest's bytes. */
const files = (having: SQL) =>
  sql`mi.id IN (SELECT mf.item_id FROM media_files mf GROUP BY mf.item_id HAVING ${having})`

function credits(field: Condition['field'], ids: number[]): SQL {
  const people = list(ids)
  if (field === 'actor')
    return sql`mi.tmdb_id IN (SELECT cr.movie_id FROM credits cr WHERE cr.kind = 'cast'
      AND cr.person_id IN ${people})`
  const jobs = ROLE_JOBS[field as keyof typeof ROLE_JOBS]
  if (jobs)
    return sql`mi.tmdb_id IN (SELECT cr.movie_id FROM credits cr WHERE cr.kind = 'crew'
      AND cr.role IN ${list(jobs)} AND cr.person_id IN ${people})`
  return sql`mi.tmdb_id IN (SELECT cr.movie_id FROM credits cr WHERE cr.person_id IN ${people})`
}

/** One condition as an expression over `mi` (the item) and `mm` (its metadata). */
export function conditionSql(c: Condition, ctx: Ctx): SQL {
  const values = listOf(c.value)
  const n = Number(c.value)
  switch (c.field) {
    case 'title': {
      const like = `%${String(c.value)
        .trim()
        .replace(/[\\%_]/g, (x) => `\\${x}`)}%`
      // LIKE ignores case for ASCII letters (https://sqlite.org/lang_expr.html#like)
      return sql`mi.title LIKE ${like} ESCAPE '\\'`
    }
    case 'year':
      if (c.op === 'inLast') return sql`mi.year >= ${new Date(ctx.now).getUTCFullYear() - n}`
      return compare(sql`mi.year`, c)
    case 'releaseDate':
      if (c.op === 'inLast')
        return sql`mi.release_date BETWEEN ${isoDay(ctx.now - n * DAY)} AND ${isoDay(ctx.now)}`
      return c.op === 'before'
        ? sql`mi.release_date < ${String(c.value)}`
        : sql`mi.release_date > ${String(c.value)}`
    case 'decade':
      return setOp(
        c.op,
        anyOf(values.map(Number).map((d) => sql`mi.year BETWEEN ${d} AND ${d + 9}`)),
      )
    case 'rating':
      // out of 5 in the rules, as the admin shows it; 0 is TMDB's "no votes yet"
      return sql`mi.rating > 0 AND ${compare(sql`round(mi.rating / 2.0, 1)`, c)}`
    case 'votes':
      return compare(sql`mm.vote_count`, c)
    case 'certification': {
      if (c.op === 'atMost') {
        const chosen = values[0] as string
        // without the region's order (TMDB not asked yet, or offline), only that rating itself
        if (!ctx.ratings) return sql`mm.certification = ${chosen}`
        // the region's ratings up to the chosen one in TMDB's order, bound as one parameter;
        // not rated has no place in the order
        const ordered = ctx.ratings.filter((r) => r !== NOT_RATED)
        const rank = ordered.indexOf(chosen)
        return rank < 0 ? sql`0` : sql`mm.certification IN ${list(ordered.slice(0, rank + 1))}`
      }
      return setOp(c.op, sql`coalesce(mm.certification, ${NOT_RATED}) IN ${list(values)}`)
    }
    case 'originalLanguage':
      return setOp(c.op, sql`mm.original_language IN ${list(values)}`)
    case 'audioLanguage':
      if (c.op === 'only')
        return sql`${fileLanguage('audio', values)} AND NOT ${fileLanguage('audio', values, true)}`
      return setOp(c.op, fileLanguage('audio', values))
    case 'subtitleLanguage':
      return setOp(
        c.op,
        sql`(${fileLanguage('subtitle', values)} OR mi.id IN (SELECT sf.item_id FROM subtitle_files sf
          WHERE ${PRIMARY_SUBTAG} IN ${list(values)}))`,
      )
    case 'genre':
    case 'keyword':
    case 'studio':
    case 'country':
      return setOp(c.op, terms(c.field, values), allTerms(c.field, values))
    case 'runtime':
      return compare(sql`mm.runtime`, c)
    case 'actor':
    case 'director':
    case 'writer':
    case 'composer':
    case 'producer':
    case 'cinematographer':
    case 'editor':
    case 'person':
      return setOp(c.op, credits(c.field, values.map(Number)))
    case 'collection': {
      const tmdb = values.filter((v) => !isSmartId(v)).map(Number)
      const parts: SQL[] = tmdb.length ? [sql`mm.collection_id IN ${list(tmdb)}`] : []
      for (const id of values.filter(isSmartId)) {
        const other = ctx.visiting.has(id) ? null : ctx.lookup(id)
        if (other) parts.push(sql`mi.id IN (${membersSql(other, ctx, sql`mi.id`, true)})`)
      }
      return setOp(c.op, anyOf(parts))
    }
    case 'added':
      if (c.op === 'inLast') return sql`mi.added_at BETWEEN ${ctx.now - n * DAY} AND ${ctx.now}`
      // a day is UTC midnight to midnight; "after" starts the day after
      return c.op === 'before'
        ? sql`mi.added_at < ${Date.parse(String(c.value))}`
        : sql`mi.added_at >= ${Date.parse(String(c.value)) + DAY}`
    case 'status':
      return setOp(c.op, sql`mi.status IN ${list(values)}`)
    case 'tag':
      return setOp(
        c.op,
        sql`mi.id IN (SELECT it.item_id FROM media_item_tags it WHERE it.tag_id IN ${list(values)})`,
        sql`mi.id IN (SELECT it.item_id FROM media_item_tags it WHERE it.tag_id IN ${list(values)}
          GROUP BY it.item_id HAVING count(DISTINCT it.tag_id) = ${new Set(values).size})`,
      )
    case 'rootFolder':
      return setOp(c.op, sql`mi.root_folder IN ${list(values)}`)
    case 'qualityProfile':
      return setOp(
        c.op,
        sql`mi.id IN (SELECT v.item_id FROM versions v WHERE v.quality_profile_id IN ${list(values)})`,
      )
    case 'resolution': {
      const lines = values.flatMap((v) => resolutionOf(v) ?? [])
      return c.op === 'atLeast'
        ? anyFile(sql`mf.resolution >= ${Math.min(...lines)}`)
        : files(sql`max(mf.resolution) IN ${list(lines)}`)
    }
    case 'hdr': {
      const v = values[0]
      if (v === 'any') return anyFile(sql`mf.hdr IS NOT NULL AND mf.hdr <> 'none'`)
      if (v === 'none')
        return sql`${anyFile(sql`mf.hdr = 'none'`)} AND NOT ${anyFile(sql`mf.hdr <> 'none'`)}`
      return anyFile(sql`mf.hdr IN ${list(values)}`)
    }
    case 'videoCodec':
      return setOp(
        c.op,
        anyFile(sql`mf.video_codec IN ${list(values.map((v) => v.toLowerCase()))}`),
      )
    case 'edition':
      return setOp(c.op, anyFile(sql`mf.edition IN ${list(values)}`))
    case 'size':
      // GB as people count them, 10^9 bytes
      return files(sql`max(mf.size) > 0 AND ${compare(sql`(max(mf.size) / 1e9)`, c)}`)
    // watch state comes with playback (Phase 4); refused on save, nothing until then
    case 'watched':
    case 'lastPlayed':
      return sql`0`
  }
}

/** A group: all or any of its rules. An empty one asks nothing of a title. */
export function groupSql(g: { match: 'all' | 'any'; rules: RuleGroup['rules'] }, ctx: Ctx): SQL {
  if (!g.rules.length) return sql`1`
  const parts = g.rules.map((r) =>
    r.kind === 'group' ? groupSql(r, ctx) : sql`(${conditionSql(r, ctx)})`,
  )
  return sql`(${sql.join(parts, g.match === 'all' ? sql` AND ` : sql` OR `)})`
}

/** FNV-1a, 32 bits: the day's seed for a shuffled collection. */
function hash(s: string): number {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619)
  return h >>> 0
}

function orderSql(def: CollectionDef, now: number): SQL {
  const dir = def.descending ? sql.raw('DESC') : sql.raw('ASC')
  const keys = (...exprs: SQL[]) =>
    sql.join(
      exprs.map((e) => sql`(${e}) IS NULL, (${e}) ${dir}`),
      sql`, `,
    )
  const tie = sql`mi.sort_title, mi.id`
  switch (def.sort) {
    case 'manual':
      return sql`(SELECT p.key FROM json_each(${JSON.stringify(def.include)}) p WHERE p.value = mi.id) IS NULL,
        (SELECT p.key FROM json_each(${JSON.stringify(def.include)}) p WHERE p.value = mi.id), ${tie}`
    case 'rating':
      return sql`${keys(sql`CASE WHEN mi.rating > 0 THEN mi.rating END`, sql`mm.vote_count`)}, ${tie}`
    case 'release':
      return sql`${keys(sql`mi.release_date`)}, ${tie}`
    case 'year':
      return sql`${keys(sql`mi.year`, sql`mi.release_date`)}, ${tie}`
    case 'added':
      return sql`${keys(sql`mi.added_at`)}, ${tie}`
    case 'title':
      return sql`mi.sort_title ${dir}, mi.id`
    case 'runtime':
      return sql`${keys(sql`mm.runtime`)}, ${tie}`
    case 'popularity':
      return sql`${keys(sql`mm.popularity`)}, ${tie}`
    case 'random': {
      // SQLite has no XOR: a ^ b is (a | b) - (a & b)
      const seed = hash(`${Math.floor(now / DAY)}:${def.id}`)
      return sql`(((mi.rowid | ${seed}) - (mi.rowid & ${seed})) * 2654435761) % 4294967291, mi.id`
    }
  }
}

/**
 * What a collection holds: what its rules match plus Always include, less Never include, in its
 * order and after its limit. Without rules, its picks. `columns` is what each row returns.
 */
export function membersSql(def: CollectionDef, outer: Ctx, columns: SQL, asSet = false): SQL {
  const ctx: Ctx = { ...outer, visiting: new Set([...outer.visiting, def.id]) }
  const picked = sql`mi.id IN ${list(def.include)}`
  const which = def.rules ? sql`(${groupSql(def.rules, ctx)} OR ${picked})` : picked
  // as a set (another collection's rule), the order matters only to choose the first N
  const order =
    asSet && def.limit === null
      ? sql``
      : sql` ORDER BY ${orderSql(def, ctx.now)}${def.limit === null ? sql`` : sql` LIMIT ${def.limit}`}`
  return sql`SELECT ${columns} FROM media_items mi
    LEFT JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id
    WHERE ${IN_LIBRARY} AND mi.id NOT IN ${list(def.exclude)} AND ${which}${order}`
}

/** The query `evaluate` runs: each title's item and TMDB ids and whether it can be played. */
export function collectionQuery(
  def: CollectionDef,
  lookup: (id: string) => CollectionDef | null,
  now: number,
  ratings: string[] | null = null,
): SQL {
  return membersSql(
    def,
    { now, lookup, visiting: new Set(), ratings },
    sql`mi.id AS itemId, mi.tmdb_id AS tmdbId, ${PLAYABLE} AS playable`,
  )
}
