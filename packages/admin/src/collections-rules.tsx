'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The rule builder (collections.md#rules; checkpoint 8d), ported from the prototype's
// collections/rules.tsx: Match all or any of a list of conditions, each a field, a comparison and
// a value, and groups one level deep. The server says which fields there are, their comparisons
// and the library's choices (`GET /curation/collections/fields`); the admin names and groups them.
// Watch state is the reader's own (4.1a); a field the server marks disabled shows, disabled.
//
// What real data changes: people aren't listed with the fields (a real library credits thousands),
// so a role's box searches `GET /curation/collections/people` as you type, and a saved rule's
// people are named from their TMDB page (`GET /people/{id}`).
import type {
  RuleCondition,
  RuleField,
  RuleFieldInfo,
  RuleGroup,
  RuleOp,
} from '@highsea-tv/api-contract'
import type { T as Translate } from '@highsea-tv/i18n'
import { useT } from '@highsea-tv/i18n/react'
import { useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Button,
  Chip,
  Input,
  MultiSelect,
  Press,
  SearchField,
  Select,
  Text,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { collections as messages } from './collections-messages.ts'
import { useSettled } from './curation-shared.tsx'

type T = Translate<typeof messages>
type RuleValue = RuleCondition['value']
type Subgroup = Extract<RuleGroup['rules'][number], { kind: 'group' }>

/** The editor's groups of fields (collections.md › Rules), in the contract's order. */
const FIELD_GROUPS = {
  release: ['title', 'year', 'releaseDate', 'decade'],
  ratings: ['rating', 'votes', 'certification'],
  language: ['originalLanguage', 'audioLanguage', 'subtitleLanguage'],
  content: ['genre', 'runtime', 'keyword', 'studio', 'country', 'collection'],
  people: [
    'actor',
    'director',
    'writer',
    'composer',
    'producer',
    'cinematographer',
    'editor',
    'person',
  ],
  library: ['added', 'status', 'tag', 'rootFolder', 'qualityProfile'],
  file: ['resolution', 'hdr', 'videoCodec', 'edition', 'size'],
  playback: ['watched', 'lastPlayed'],
} as const satisfies Record<string, readonly RuleField[]>

const UNITS: Partial<Record<RuleField, 'stars' | 'minutes' | 'GB'>> = {
  rating: 'stars',
  runtime: 'minutes',
  size: 'GB',
}

/** Comparisons that take several values; the rest take one. */
const MULTI: readonly RuleOp[] = [
  'oneOf',
  'notOneOf',
  'includes',
  'excludes',
  'only',
  'anyOf',
  'allOf',
  'noneOf',
]
const multi = (op: RuleOp) => MULTI.includes(op)

const CODECS = ['h264', 'hevc', 'av1', 'mpeg2video', 'vp9'] as const
const HDR = ['none', 'hdr10', 'dolby-vision', 'hlg'] as const

/**
 * The server stores what ffprobe reports (checkpoint 8d): a codec's lower-case `codec_name`, the HDR
 * format, a resolution's lines. The admin names them; anything it doesn't know shows as stored.
 */
function withLabels(info: RuleFieldInfo, t: T): RuleFieldInfo {
  const label = (value: string, fallback: string): string => {
    if (info.field === 'videoCodec' && (CODECS as readonly string[]).includes(value))
      return t(`codec.${value as (typeof CODECS)[number]}`)
    if (info.field === 'hdr' && (HDR as readonly string[]).includes(value))
      return t(`hdr.${value as (typeof HDR)[number]}`)
    if (info.field === 'resolution' && /^\d+$/.test(value))
      return value === '2160' ? t('resolution.2160') : t('resolution.lines', { lines: value })
    return fallback
  }
  return info.options
    ? { ...info, options: info.options.map((o) => ({ ...o, label: label(o.value, o.label) })) }
    : info
}

let next = 0
/** A new id for a condition or a group, unique within the page. */
export const ruleId = (kind: 'c' | 'g') => `${kind}-${Date.now().toString(36)}-${next++}`

export const emptyRules = (): RuleGroup => ({
  kind: 'group',
  id: ruleId('g'),
  match: 'all',
  rules: [],
})

export function newCondition(info: RuleFieldInfo, now: number, op = info.ops[0]): RuleCondition {
  const at = op ?? 'is'
  return {
    kind: 'condition',
    id: ruleId('c'),
    field: info.field,
    op: at,
    value: initial(info, at, now),
  }
}

/** The value a condition starts with when its field or comparison changes. */
function initial(info: RuleFieldInfo, op: RuleOp, now: number): RuleValue {
  if (info.type === 'person') return []
  if (info.type === 'text') return ''
  if (info.type === 'choice' || info.type === 'list')
    return multi(op) ? [] : (info.options?.[0]?.value ?? '')
  if (op === 'inLast') return info.field === 'year' ? 10 : 30
  if (info.type === 'date') return new Date(now - 365 * 86_400_000).toISOString().slice(0, 10)
  const base: Partial<Record<RuleField, number>> = {
    year: 2010,
    rating: 4,
    votes: 1000,
    runtime: 90,
    size: 10,
  }
  const n = base[info.field] ?? 0
  if (op === 'between')
    return info.field === 'year' ? [2010, 2020] : info.field === 'rating' ? [3.5, 5] : [n / 2, n]
  return n
}

/** What's wrong with a condition, if anything: an empty choice or text. */
export function conditionError(c: RuleCondition, t: T): string | undefined {
  if (Array.isArray(c.value) && c.value.length === 0) return t('error.choose')
  if (typeof c.value === 'string' && !c.value.trim()) return t('error.fill')
  if (typeof c.value === 'number' && Number.isNaN(c.value)) return t('error.number')
  if (Array.isArray(c.value) && c.value.some((v) => typeof v === 'number' && Number.isNaN(v)))
    return t('error.number')
  return undefined
}

export function ruleErrors(g: RuleGroup | Subgroup, t: T): boolean {
  return g.rules.some((r) => (r.kind === 'group' ? ruleErrors(r, t) : !!conditionError(r, t)))
}

const s = tokens.space
const ui = tokens.adminText.ui
/** The web's 6 (gap-1.5, py-1.5), between the space scale's steps. */
const SIX = s['1'] + s['0.5']

// ---------------------------------------------------------------- the form's small parts

/** An error the form shows under what it's about. */
export function FormError({ children }: { children: string }) {
  return (
    <Text role="alert" variant="caption" color="badge-danger">
      {children}
    </Text>
  )
}

/** A search's matches, announced as they change. */
export function MatchList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View role="list" aria-label={label} aria-live="polite" style={{ gap: s['1'] }}>
      {children}
    </View>
  )
}

export function NoMatch({ children }: { children: string }) {
  return (
    <View role="listitem" style={{ paddingHorizontal: s['1'] }}>
      <Text variant="caption" color="text-3">
        {children}
      </Text>
    </View>
  )
}

/** A match: its name (and year), and Add at the end; choosing it adds it. */
export function MatchItem({
  name,
  detail,
  onPress,
}: {
  name: string
  detail?: string
  onPress: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  return (
    <View role="listitem">
      <Press
        onPress={onPress}
        accessibilityLabel={[name, detail, t('add')].filter(Boolean).join(' ')}
        style={({ hovered }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: s['2'],
          paddingHorizontal: s['2'],
          paddingVertical: SIX,
          borderRadius: tokens.radius.md,
          backgroundColor: hovered ? theme.colors.s2 : 'transparent',
        })}
      >
        <Text size={ui.size} leading={ui.leading} numberOfLines={1} style={{ flex: 1 }}>
          {name}
          {detail ? (
            <Text size={ui.size} color="text-3">
              {` ${detail}`}
            </Text>
          ) : null}
        </Text>
        <Text variant="caption" color="accent-text">
          {t('add')}
        </Text>
      </Press>
    </View>
  )
}

// ---------------------------------------------------------------- the builder

export function RuleBuilder({
  rules,
  onChange,
  fields,
  now,
  tried,
}: {
  rules: RuleGroup
  onChange: (g: RuleGroup) => void
  fields: RuleFieldInfo[]
  now: number
  tried: boolean
}) {
  const t = useT(messages)
  const theme = useTheme()
  const offered = fields.filter((f) => !f.disabled)
  const first = offered.find((f) => f.field === 'year') ?? offered[0]
  const setAt = (at: number, r: RuleCondition | Subgroup | null) =>
    onChange({
      ...rules,
      rules: r
        ? rules.rules.map((x, i) => (i === at ? r : x))
        : rules.rules.filter((_, i) => i !== at),
    })
  const box = (fill: 's1' | 's2') =>
    ({
      padding: s['3'],
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: tokens.radius.md,
      backgroundColor: theme.colors[fill],
    }) as const
  return (
    <View style={{ gap: s['3'] }}>
      <MatchLine
        label={t('match')}
        value={rules.match}
        onChange={(match) => onChange({ ...rules, match })}
        what={t('ofThese')}
        aria={t('matchAria')}
      />
      {rules.rules.length === 0 ? (
        <View style={[box('s1'), { backgroundColor: 'transparent', borderStyle: 'dashed' }]}>
          <Text variant="caption" color="text-3">
            {t('noRules')}
          </Text>
        </View>
      ) : (
        <View role="list" aria-label={t('rules')} style={{ gap: s['2'] }}>
          {rules.rules.map((r, at) =>
            r.kind === 'group' ? (
              <View key={r.id} role="listitem" style={[box('s2'), { gap: s['2'] }]}>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: s['2'],
                  }}
                >
                  <MatchLine
                    label={t('group.match', { n: at + 1 })}
                    value={r.match}
                    onChange={(match) => setAt(at, { ...r, match })}
                    what={t('group.of')}
                    aria={t('group.matchAria', { n: at + 1 })}
                  />
                  <View style={{ marginStart: 'auto' }}>
                    <Button
                      variant="ghost"
                      iconOnly
                      icon="delete"
                      accessibilityLabel={t('group.remove', { n: at + 1 })}
                      onPress={() => setAt(at, null)}
                    />
                  </View>
                </View>
                <View
                  role="list"
                  aria-label={t('group', { n: at + 1 })}
                  style={{
                    gap: s['2'],
                    borderStartWidth: 2,
                    borderStartColor: theme.colors.line,
                    paddingStart: s['3'],
                  }}
                >
                  {r.rules.map((c, j) => (
                    <View key={c.id} role="listitem">
                      <ConditionRow
                        name={t('condition', { n: `${at + 1}.${j + 1}` })}
                        condition={c}
                        fields={fields}
                        now={now}
                        tried={tried}
                        onChange={(x) => {
                          const rest = x
                            ? r.rules.map((y, k) => (k === j ? x : y))
                            : r.rules.filter((_, k) => k !== j)
                          // a group left empty goes with its last condition
                          setAt(at, rest.length ? { ...r, rules: rest } : null)
                        }}
                      />
                    </View>
                  ))}
                </View>
                {first && (
                  <View style={{ alignSelf: 'flex-start' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="add"
                      onPress={() =>
                        setAt(at, { ...r, rules: [...r.rules, newCondition(first, now)] })
                      }
                    >
                      {t('group.add', { n: at + 1 })}
                    </Button>
                  </View>
                )}
              </View>
            ) : (
              <View key={r.id} role="listitem" style={box('s1')}>
                <ConditionRow
                  name={t('condition', { n: at + 1 })}
                  condition={r}
                  fields={fields}
                  now={now}
                  tried={tried}
                  onChange={(x) => setAt(at, x)}
                />
              </View>
            ),
          )}
        </View>
      )}
      {first && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
          <Button
            size="sm"
            variant="secondary"
            icon="add"
            onPress={() =>
              onChange({ ...rules, rules: [...rules.rules, newCondition(first, now)] })
            }
          >
            {t('addCondition')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="add"
            onPress={() =>
              onChange({
                ...rules,
                rules: [
                  ...rules.rules,
                  {
                    kind: 'group',
                    id: ruleId('g'),
                    match: rules.match === 'all' ? 'any' : 'all',
                    rules: [newCondition(first, now)],
                  },
                ],
              })
            }
          >
            {t('addGroup')}
          </Button>
        </View>
      )}
    </View>
  )
}

/** Match's select (the web's w-24). */
const MATCH_WIDTH = 96

function MatchLine({
  label,
  value,
  onChange,
  what,
  aria,
}: {
  label: string
  value: 'all' | 'any'
  onChange: (v: 'all' | 'any') => void
  what: string
  aria: string
}) {
  const t = useT(messages)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}>
      <Text size={ui.size} leading={ui.leading} color="text-2">
        {label}
      </Text>
      <View style={{ width: MATCH_WIDTH }}>
        <Select
          aria-label={aria}
          value={value}
          onValueChange={(v) => onChange(v as 'all' | 'any')}
          options={[
            { value: 'all', label: t('match.all') },
            { value: 'any', label: t('match.any') },
          ]}
        />
      </View>
      <Text size={ui.size} leading={ui.leading} color="text-2">
        {what}
      </Text>
    </View>
  )
}

/** A condition's field and comparison columns from medium (the web's 12rem and 10rem). */
const COLUMNS = { field: 192, op: 160 }

function ConditionRow({
  name,
  condition: c,
  fields,
  now,
  tried,
  onChange,
}: {
  name: string
  condition: RuleCondition
  fields: RuleFieldInfo[]
  now: number
  tried: boolean
  onChange: (c: RuleCondition | null) => void
}) {
  const t = useT(messages)
  const side = useWindowAtLeast(breakpoints.medium)
  const info = fields.find((f) => f.field === c.field)
  const error = tried ? conditionError(c, t) : undefined
  const known = new Set(fields.map((f) => f.field))
  // the fields in the editor's groups, in order; a field the server marks disabled shows, disabled
  const options = (Object.keys(FIELD_GROUPS) as (keyof typeof FIELD_GROUPS)[]).flatMap((group) =>
    FIELD_GROUPS[group]
      .filter((f) => known.has(f))
      .map((f) => {
        const disabled = !!fields.find((x) => x.field === f)?.disabled
        return {
          value: f as string,
          label: disabled ? `${t(`field.${f}`)} · ${t('comesWithPlayback')}` : t(`field.${f}`),
          group: t(`fieldGroup.${group}`),
          disabled,
        }
      }),
  )
  return (
    <View style={{ gap: s['2'] }}>
      <View
        style={{
          flexDirection: side ? 'row' : 'column',
          alignItems: side ? 'flex-start' : 'stretch',
          gap: s['2'],
        }}
      >
        <View style={side ? { width: COLUMNS.field } : undefined}>
          <Select
            aria-label={t('condition.field', { name })}
            value={c.field as string}
            onValueChange={(field) => {
              const next = fields.find((f) => f.field === field)
              if (next) onChange({ ...newCondition(next, now), id: c.id })
            }}
            options={options}
          />
        </View>
        <View style={side ? { width: COLUMNS.op } : undefined}>
          <Select
            aria-label={t('condition.op', { name })}
            value={c.op as string}
            onValueChange={(op) =>
              info && onChange({ ...c, op: op as RuleOp, value: carry(info, c, op as RuleOp, now) })
            }
            options={(info?.ops ?? [c.op]).map((op) => ({
              value: op as string,
              label: t(`op.${op}`),
            }))}
          />
        </View>
        <View style={side ? { flex: 1, minWidth: 0 } : undefined}>
          {info ? (
            <ValueControl
              name={name}
              info={info}
              condition={c}
              onChange={onChange}
              invalid={!!error}
            />
          ) : null}
        </View>
        <View style={{ alignSelf: 'flex-end' }}>
          <Button
            variant="ghost"
            iconOnly
            icon="close"
            accessibilityLabel={t('condition.remove', { name: name.toLowerCase() })}
            onPress={() => onChange(null)}
          />
        </View>
      </View>
      {error ? <FormError>{error}</FormError> : null}
    </View>
  )
}

/** Keep the value across a change of comparison when it still fits; start afresh when it doesn't. */
function carry(info: RuleFieldInfo, c: RuleCondition, op: RuleOp, now: number): RuleValue {
  if (info.type === 'list' || info.type === 'choice') {
    if (multi(op) === multi(c.op)) return c.value
    const xs = [c.value].flat().map(String).filter(Boolean)
    return multi(op) ? xs : (xs[0] ?? info.options?.[0]?.value ?? '')
  }
  if (info.type === 'number' || info.type === 'date') {
    const shape = (o: RuleOp) => (o === 'between' ? 'pair' : o === 'inLast' ? 'last' : 'one')
    if (shape(op) === shape(c.op)) return c.value
    return initial(info, op, now)
  }
  return c.value
}

/** A number as a field's text: empty while it isn't one. */
const asText = (n: number) => (Number.isNaN(n) ? '' : String(n))
/** The field's text as a number: not one (NaN) while it's empty or half typed. */
const asNumber = (v: string) => (v.trim() === '' ? Number.NaN : Number(v))

function ValueControl({
  name,
  info: given,
  condition: c,
  onChange,
  invalid,
}: {
  name: string
  info: RuleFieldInfo
  condition: RuleCondition
  onChange: (c: RuleCondition) => void
  invalid: boolean
}) {
  const t = useT(messages)
  const info = withLabels(given, t)
  const label = t('condition.value', { name })
  const set = (value: RuleValue) => onChange({ ...c, value })
  const unit = UNITS[info.field]
  const number = (v: number, aria: string, onValue: (n: number) => void) => (
    <Input
      end={unit ? t(`unit.${unit}`) : undefined}
      inputMode="decimal"
      keyboardType="decimal-pad"
      accessibilityLabel={aria}
      invalid={invalid}
      value={asText(v)}
      onChangeText={(x) => onValue(asNumber(x))}
    />
  )

  if (info.type === 'text')
    return (
      <Input
        accessibilityLabel={label}
        invalid={invalid}
        value={String(c.value)}
        onChangeText={set}
        placeholder={t('textPlaceholder')}
      />
    )
  if (info.type === 'number' || info.type === 'date') {
    if (c.op === 'inLast')
      return (
        <Input
          end={info.field === 'year' ? t('years') : t('days')}
          inputMode="numeric"
          keyboardType="number-pad"
          accessibilityLabel={label}
          invalid={invalid}
          value={asText(Number(c.value))}
          onChangeText={(x) => set(asNumber(x))}
        />
      )
    if (info.type === 'date')
      return <DateInput label={label} value={String(c.value)} onChange={set} invalid={invalid} />
    if (c.op === 'between') {
      const [lo, hi] = Array.isArray(c.value) ? (c.value as [number, number]) : [0, 0]
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {number(lo, t('condition.from', { name }), (n) => set([n, hi]))}
          </View>
          <Text variant="caption" color="text-3">
            {t('and')}
          </Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            {number(hi, t('condition.to', { name }), (n) => set([lo, n]))}
          </View>
        </View>
      )
    }
    return number(Number(c.value), label, set)
  }
  if (info.type === 'person')
    return (
      <PersonSearch
        label={label}
        field={info.field}
        value={[c.value].flat().map(String)}
        onChange={(v) => set(v as RuleValue)}
        invalid={invalid}
      />
    )
  if (!multi(c.op))
    return (
      <Select
        aria-label={label}
        value={String(c.value)}
        onValueChange={set}
        options={info.options ?? []}
      />
    )
  return (
    // several choices from a short list, its field naming what's chosen
    <MultiSelect
      aria-label={label}
      placeholder={t('choose')}
      value={[c.value].flat().map(String)}
      onValueChange={(v) => set(v as RuleValue)}
      options={info.options ?? []}
    />
  )
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A day, typed as YYYY-MM-DD (the web's date input's value). React Native has no date field, so
 * the text is kept as typed and the condition takes it once it's a day.
 */
function DateInput({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  invalid: boolean
}) {
  const [text, setText] = useState(value)
  const bad = text !== value && !(DAY.test(text) && !Number.isNaN(Date.parse(text)))
  return (
    <Input
      accessibilityLabel={label}
      inputMode="numeric"
      placeholder="YYYY-MM-DD"
      maxLength={10}
      invalid={invalid || bad}
      value={text}
      onChangeText={(x) => {
        setText(x)
        if (DAY.test(x) && !Number.isNaN(Date.parse(x))) onChange(x)
      }}
    />
  )
}

/** A chosen person, named from what the search found, or from their page for a saved rule. */
function PersonChip({
  id,
  known,
  onRemove,
}: {
  id: string
  known: string | undefined
  onRemove: () => void
}) {
  const t = useT(messages)
  const person = useQuery(`collections:person:${id}`, (c) =>
    known ? Promise.resolve({ name: known }) : c.metadata.person({ params: { id: Number(id) } }),
  )
  const name = known ?? person.data?.name ?? id
  return (
    <View role="listitem">
      <Chip removable size="sm" accessibilityLabel={t('removePerson', { name })} onPress={onRemove}>
        {name}
      </Chip>
    </View>
  )
}

/** People: search everyone credited in that role in the library, and keep the ones chosen. */
function PersonSearch({
  label,
  field,
  value,
  onChange,
  invalid,
}: {
  label: string
  field: RuleField
  value: string[]
  onChange: (v: string[]) => void
  invalid: boolean
}) {
  const t = useT(messages)
  const [query, setQuery] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const q = useSettled(query.trim(), 200)
  const search = useQuery(`collections:people:${field}:${q}`, (c) =>
    q ? c.collections.people({ query: { q, field } }) : Promise.resolve([]),
  )
  const matches = (search.data ?? []).filter((p) => !value.includes(String(p.id))).slice(0, 6)
  return (
    <View style={{ gap: s['2'], minWidth: 0 }}>
      {value.length > 0 && (
        <View
          role="list"
          aria-label={t('condition.chosen', { label })}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SIX }}
        >
          {value.map((id) => (
            <PersonChip
              key={id}
              id={id}
              known={names[id]}
              onRemove={() => onChange(value.filter((x) => x !== id))}
            />
          ))}
        </View>
      )}
      <SearchField
        label={label}
        invalid={invalid}
        value={query}
        onChangeText={setQuery}
        placeholder={
          field === 'person'
            ? t('searchPeople')
            : t('searchPeople.role', { role: t(`field.${field}`).toLowerCase() })
        }
      />
      {q !== '' && search.status === 'success' && (
        <MatchList label={t('matches', { label })}>
          {matches.length === 0 ? (
            <NoMatch>{t('noPerson', { query: q })}</NoMatch>
          ) : (
            matches.map((p) => (
              <MatchItem
                key={p.id}
                name={p.name}
                onPress={() => {
                  setNames((n) => ({ ...n, [String(p.id)]: p.name }))
                  onChange([...value, String(p.id)])
                  setQuery('')
                }}
              />
            ))
          )}
        </MatchList>
      )}
    </View>
  )
}

/**
 * The rules as the server takes them while the draft is half done: conditions still being filled
 * in are left out, and a group left with none goes too. The editor's checks say what's missing
 * before a save; the live result shouldn't wait for them.
 */
export function completeRules(g: RuleGroup, t: T): RuleGroup {
  const rules = g.rules.flatMap((r): RuleGroup['rules'] => {
    if (r.kind === 'condition') return conditionError(r, t) ? [] : [r]
    const kept = r.rules.filter((c) => !conditionError(c, t))
    return kept.length ? [{ ...r, rules: kept }] : []
  })
  return { ...g, rules }
}
