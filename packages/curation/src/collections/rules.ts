// SPDX-License-Identifier: AGPL-3.0-only
// What smart collections decide without the database (collections.md › The rules): whether a rule
// tree makes sense, which other collections it names, and the rules in words. The fields, their
// types and comparisons are the contract's `RULE_FIELDS`; the library answers the rules in SQL
// (the runtime's collection query).
import {
  PLAYBACK_FIELDS,
  RULE_FIELDS,
  type RuleCondition,
  type RuleField,
  type RuleGroup,
} from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { createT, defineMessages } from '@highsea-tv/i18n'

/** A collection's id: `sc-` and a random part. A TMDB collection is its number. */
export const SMART_PREFIX = 'sc-'
export const isSmartId = (id: string) => id.startsWith(SMART_PREFIX)

/**
 * Not rated: a title without a certification in the server's region. The region's own ratings come
 * from TMDB (`/3/certification/movie/list`, through `@highsea-tv/metadata`), mildest first; they're
 * null until TMDB has been asked.
 */
export const NOT_RATED = 'NR'
export type Ratings = string[] | null
/** Without the region's list (offline, before TMDB is asked), a certification is any short text. */
const RATING = /^.{1,10}$/u
/** Lines, as the probe measures a file's height; the rule's `1080p` reads as `1080`. */
export const RESOLUTIONS = [480, 576, 720, 1080, 2160] as const
/**
 * The HDR choices: the file facts' formats (HDR10 and HDR10+ are HDR10; every Dolby Vision profile
 * is Dolby Vision), any of them, or none.
 */
export const HDR_CHOICES = ['any', 'dolby-vision', 'hdr10', 'hlg', 'none'] as const

/** `1080`, `1080p` and `4K` are the same answer. */
export function resolutionOf(value: string): number | null {
  const v = value.trim().toLowerCase()
  if (v === '4k') return 2160
  const n = Number.parseInt(v, 10)
  return (RESOLUTIONS as readonly number[]).includes(n) ? n : null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export type Condition = RuleCondition
type Rule = RuleGroup['rules'][number]

/** Every condition in a tree, groups opened. */
export const conditionsOf = (g: RuleGroup): Condition[] =>
  g.rules.flatMap((r: Rule) => (r.kind === 'group' ? r.rules : [r]))

/** The values a condition lists, as strings. */
export const listOf = (v: Condition['value']): string[] =>
  Array.isArray(v) ? v.map(String) : v === '' ? [] : [String(v)]

/** The server's own collections a tree names. */
export const namedCollections = (g: RuleGroup | null): string[] =>
  g
    ? [
        ...new Set(
          conditionsOf(g)
            .filter((c) => c.field === 'collection')
            .flatMap((c) => listOf(c.value).filter(isSmartId)),
        ),
      ]
    : []

const invalid = (message: string, field: string, ruleId?: string) =>
  new AppError('invalid', message, {
    field,
    reason: 'invalid',
    ...(ruleId ? { rule: ruleId } : {}),
  })

/** Why a condition can't be kept, or null. Its field and comparison are known to go together. */
function problem(c: Condition, ratings: Ratings): string | null {
  const { type } = RULE_FIELDS[c.field]
  const v = c.value
  const list = listOf(v)
  const isNum = typeof v === 'number' && Number.isFinite(v)
  const isPair =
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  switch (type) {
    case 'text':
      return typeof v === 'string' && v.trim() ? null : 'Write some of the title.'
    case 'number':
      if (c.op === 'between') return isPair ? null : 'Give both ends of the range.'
      if (!isNum || (v as number) < 0) return 'Give a number, 0 or more.'
      if (c.field === 'year' && c.op === 'inLast' && (v as number) < 1)
        return 'Give a number of years, 1 or more.'
      return null
    case 'date':
      if (c.op === 'inLast')
        return isNum && (v as number) >= 1 ? null : 'Give a number of days, 1 or more.'
      return typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v))
        ? null
        : 'Give a date as YYYY-MM-DD.'
    case 'choice':
    case 'list':
      if (!list.length || list.some((x) => !x.trim())) return 'Choose at least one.'
      if (c.field === 'decade' && list.some((x) => !/^\d{3}0$/.test(x)))
        return 'Choose a decade, such as 1990.'
      if (c.field === 'certification') {
        const known = (x: string) => (ratings ? ratings.includes(x) : RATING.test(x))
        // "or milder" needs a rating with a place in the order; not rated has none
        const bad =
          c.op === 'atMost'
            ? list.length !== 1 || list[0] === NOT_RATED || !known(list[0] as string)
            : list.some((x) => x !== NOT_RATED && !known(x))
        if (bad) return 'Choose a certification from the list.'
      }
      if (c.field === 'resolution' && list.some((x) => resolutionOf(x) === null))
        return 'Choose 480p, 576p, 720p, 1080p or 4K.'
      if (c.field === 'hdr' && list.some((x) => !(HDR_CHOICES as readonly string[]).includes(x)))
        return 'Choose an HDR format, any HDR, or none.'
      if (c.field === 'collection' && list.some((x) => !isSmartId(x) && !/^\d+$/.test(x)))
        return 'Choose a collection.'
      return null
    case 'person':
      return list.length && list.every((x) => /^\d+$/.test(x))
        ? null
        : 'Choose at least one person.'
  }
}

/**
 * Throws `invalid` for the first rule at fault: a field and comparison that don't go together, a
 * value of the wrong shape, a field that comes with playback, or groups more than one level deep.
 * `ratings` is the region's certifications, or null when they aren't known yet.
 */
export function checkRules(g: RuleGroup, ratings: Ratings = null) {
  for (const r of g.rules)
    if (r.kind === 'group' && r.rules.some((x: { kind: string }) => x.kind === 'group'))
      throw invalid('Groups go one level deep.', 'rules', r.id)
  for (const c of conditionsOf(g)) {
    if (PLAYBACK_FIELDS.includes(c.field))
      throw invalid('Watch state comes with playback, so it can’t be used yet.', 'rules', c.id)
    if (!(RULE_FIELDS[c.field].ops as readonly string[]).includes(c.op))
      throw invalid('That comparison doesn’t go with that field.', 'rules', c.id)
    const why = problem(c, ratings)
    if (why) throw invalid(why, 'rules', c.id)
  }
}

/**
 * Whether `id` would reach itself through the collections its rules name, following each named
 * collection's own rules. `rulesOf` answers for the saved ones.
 */
export function drawsOnItself(
  id: string,
  rules: RuleGroup | null,
  rulesOf: (id: string) => RuleGroup | null,
): boolean {
  const seen = new Set<string>()
  const stack = namedCollections(rules)
  while (stack.length) {
    const next = stack.pop() as string
    if (next === id) return true
    if (seen.has(next)) continue
    seen.add(next)
    stack.push(...namedCollections(rulesOf(next)))
  }
  return false
}

// ---------------------------------------------------------------- in words

export const collectionMessages = defineMessages({
  called: 'called “{text}”',
  status: '{name}',
  'status.not': 'not {name}',
  'year.between': 'released {lo}–{hi}',
  'year.before': 'released before {year}',
  'year.after': 'released after {year}',
  'year.inLast': 'released in the last {n, plural, one {# year} other {# years}}',
  'year.is': 'released in {year}',
  'released.inLast': 'released in the last {n, plural, one {# day} other {# days}}',
  'released.before': 'released before {date}',
  'released.after': 'released after {date}',
  'added.inLast': 'added in the last {n, plural, one {# day} other {# days}}',
  'added.before': 'added before {date}',
  'added.after': 'added after {date}',
  decade: 'from the {decade}s',
  'decade.not': 'not from the {decade}s',
  'rating.between': 'rated {lo} to {hi}',
  'rating.atMost': 'rated {n} or less',
  'rating.atLeast': 'rated {n} or more',
  votes: 'with {n, number} votes or more',
  'certification.atMost': 'rated {name} or milder',
  certification: 'rated {name}',
  'certification.not': 'not rated {name}',
  originalLanguage: 'in {names}',
  'originalLanguage.not': 'not in {names}',
  'audio.only': 'with audio only in {names}',
  'audio.excludes': 'without {names} audio',
  'audio.includes': 'with {names} audio',
  'subtitles.excludes': 'without {names} subtitles',
  'subtitles.includes': 'with {names} subtitles',
  genre: '{names}',
  'genre.not': 'not {names}',
  keyword: 'about {names}',
  'keyword.not': 'not about {names}',
  tag: 'tagged {names}',
  'tag.not': 'not tagged {names}',
  'runtime.between': '{lo}–{hi} minutes long',
  'runtime.atMost': '{n} minutes or shorter',
  'runtime.atLeast': '{n} minutes or longer',
  studio: 'from {names}',
  'studio.not': 'not from {names}',
  country: 'made in {names}',
  'country.not': 'not made in {names}',
  collection: 'in {names}',
  'collection.not': 'not in {names}',
  actor: 'with {names}',
  'actor.not': 'without {names}',
  director: 'directed by {names}',
  'director.not': 'not directed by {names}',
  writer: 'written by {names}',
  'writer.not': 'not written by {names}',
  composer: 'scored by {names}',
  'composer.not': 'not scored by {names}',
  producer: 'produced by {names}',
  'producer.not': 'not produced by {names}',
  cinematographer: 'shot by {names}',
  'cinematographer.not': 'not shot by {names}',
  editor: 'edited by {names}',
  'editor.not': 'not edited by {names}',
  person: 'with {names} in the cast or crew',
  'person.not': 'without {names} in the cast or crew',
  rootFolder: 'in {names}',
  'rootFolder.not': 'not in {names}',
  qualityProfile: 'on {names}',
  'qualityProfile.not': 'not on {names}',
  'resolution.atLeast': 'in {name} or better',
  resolution: 'in {name}',
  'hdr.none': 'without HDR',
  hdr: 'in {name}',
  videoCodec: '{names}',
  'videoCodec.not': 'not {names}',
  edition: '{names}',
  'edition.not': 'not {names}',
  'size.atMost': '{n} GB or smaller',
  'size.atLeast': '{n} GB or larger',
  watch: 'watch state',
  and: '{first} and {last}',
  or: '{first} or {last}',
  group: '({words})',
})

const t = createT(collectionMessages)

/** "a, b and c", "a, b or c". */
export const joinWords = (xs: string[], word: 'and' | 'or') =>
  xs.length <= 1
    ? (xs[0] ?? '')
    : t(word, { first: xs.slice(0, -1).join(', '), last: xs[xs.length - 1] as string })

/** The label each value of a field shows, as the editor's choices name them. */
export type Labels = (field: RuleField, value: string) => string

const shortDate = (v: string) =>
  new Date(`${v}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** One condition in words: "released 2010–2020", "rated 4.5 or more", "scored by Jan Morgenstern". */
export function describeCondition(c: Condition, label: Labels): string {
  const values = listOf(c.value)
  const names = (word: 'and' | 'or' = 'or') =>
    joinWords(
      values.map((v) => label(c.field, v)),
      word,
    )
  const name = label(c.field, values[0] ?? '')
  const pair = Array.isArray(c.value) && typeof c.value[0] === 'number' ? c.value : null
  const lo = pair ? Math.min(pair[0] as number, pair[1] as number) : 0
  const hi = pair ? Math.max(pair[0] as number, pair[1] as number) : 0
  const n = typeof c.value === 'number' ? c.value : Number(c.value)
  const not = c.op === 'isNot' || c.op === 'excludes' || c.op === 'notOneOf' || c.op === 'noneOf'
  switch (c.field) {
    case 'title':
      return t('called', { text: String(c.value).trim() })
    case 'status':
      return t(not ? 'status.not' : 'status', { name: names().toLowerCase() })
    case 'year':
      if (c.op === 'between') return t('year.between', { lo, hi })
      if (c.op === 'before') return t('year.before', { year: n })
      if (c.op === 'after') return t('year.after', { year: n })
      if (c.op === 'inLast') return t('year.inLast', { n })
      return t('year.is', { year: n })
    case 'releaseDate':
    case 'added': {
      const verb = c.field === 'added' ? 'added' : 'released'
      if (c.op === 'inLast') return t(`${verb}.inLast`, { n })
      return t(c.op === 'before' ? `${verb}.before` : `${verb}.after`, {
        date: shortDate(String(c.value)),
      })
    }
    case 'decade':
      return t(not ? 'decade.not' : 'decade', { decade: values.join('s, ') })
    case 'rating':
      if (c.op === 'between') return t('rating.between', { lo, hi })
      return t(c.op === 'atMost' ? 'rating.atMost' : 'rating.atLeast', { n })
    case 'votes':
      return t('votes', { n })
    case 'certification':
      return c.op === 'atMost'
        ? t('certification.atMost', { name })
        : t(not ? 'certification.not' : 'certification', { name: names() })
    case 'audioLanguage':
      return t(
        c.op === 'only' ? 'audio.only' : c.op === 'excludes' ? 'audio.excludes' : 'audio.includes',
        { names: names() },
      )
    case 'subtitleLanguage':
      return t(c.op === 'excludes' ? 'subtitles.excludes' : 'subtitles.includes', {
        names: names(),
      })
    case 'genre':
    case 'keyword':
    case 'tag':
      return t(not ? `${c.field}.not` : c.field, { names: names(c.op === 'allOf' ? 'and' : 'or') })
    case 'runtime':
      if (c.op === 'between') return t('runtime.between', { lo, hi })
      return t(c.op === 'atMost' ? 'runtime.atMost' : 'runtime.atLeast', { n })
    case 'resolution':
      return t(c.op === 'atLeast' ? 'resolution.atLeast' : 'resolution', { name })
    case 'hdr':
      return values[0] === 'none' ? t('hdr.none') : t('hdr', { name })
    case 'size':
      return t(c.op === 'atMost' ? 'size.atMost' : 'size.atLeast', { n })
    case 'watched':
    case 'lastPlayed':
      return t('watch')
    default:
      // the fields whose words are "{field} {names}" or "{field}.not {names}"
      return t(not ? `${c.field}.not` : c.field, { names: names() })
  }
}

/** The rules in words: "Released 2010–2020, rated 4.5 or more, in English". Null without rules. */
export function describe(rules: RuleGroup | null, label: Labels): string | null {
  if (!rules || rules.rules.length === 0) return null
  const words = (g: { match: 'all' | 'any'; rules: readonly Rule[] }): string => {
    const parts = g.rules.map((r) =>
      r.kind === 'group' ? t('group', { words: words(r) }) : describeCondition(r, label),
    )
    return g.match === 'all' ? parts.join(', ') : joinWords(parts, 'or')
  }
  const text = words(rules)
  return text.charAt(0).toUpperCase() + text.slice(1)
}
