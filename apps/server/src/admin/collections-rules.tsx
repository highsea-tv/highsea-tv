'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The rule builder (collections.md#rules; checkpoint 8d), ported from the prototype's
// collections/rules.tsx: Match all or any of a list of conditions, each a field, a comparison and
// a value, and groups one level deep. The server says which fields there are, their comparisons
// and the library's choices (`GET /curation/collections/fields`); the admin names and groups them.
// Watch state shows, disabled, until playback brings it.
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
import {
  Button,
  Input,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuTrigger,
  Select,
  SelectGroup,
  SelectItem,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
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
  const offered = fields.filter((f) => !f.disabled)
  const first = offered.find((f) => f.field === 'year') ?? offered[0]
  const setAt = (at: number, r: RuleCondition | Subgroup | null) =>
    onChange({
      ...rules,
      rules: r
        ? rules.rules.map((x, i) => (i === at ? r : x))
        : rules.rules.filter((_, i) => i !== at),
    })
  return (
    <div className="grid gap-3">
      <MatchLine
        label={t('match')}
        value={rules.match}
        onChange={(match) => onChange({ ...rules, match })}
        what={t('ofThese')}
        aria={t('matchAria')}
      />
      {rules.rules.length === 0 ? (
        <p className="rounded-md border border-line border-dashed p-3 text-caption text-text-3">
          {t('noRules')}
        </p>
      ) : (
        <ol aria-label={t('rules')} className="grid gap-2">
          {rules.rules.map((r, at) =>
            r.kind === 'group' ? (
              <li key={r.id} className="grid gap-2 rounded-md border border-line bg-s2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <MatchLine
                    label={t('group.match', { n: at + 1 })}
                    value={r.match}
                    onChange={(match) => setAt(at, { ...r, match })}
                    what={t('group.of')}
                    aria={t('group.matchAria', { n: at + 1 })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon="delete"
                    className="ms-auto"
                    aria-label={t('group.remove', { n: at + 1 })}
                    onClick={() => setAt(at, null)}
                  />
                </div>
                <ol
                  aria-label={t('group', { n: at + 1 })}
                  className="grid gap-2 border-line border-s-2 ps-3"
                >
                  {r.rules.map((c, j) => (
                    <li key={c.id}>
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
                    </li>
                  ))}
                </ol>
                {first && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="add"
                    className="justify-self-start"
                    onClick={() =>
                      setAt(at, { ...r, rules: [...r.rules, newCondition(first, now)] })
                    }
                  >
                    {t('group.add', { n: at + 1 })}
                  </Button>
                )}
              </li>
            ) : (
              <li key={r.id} className="rounded-md border border-line bg-s1 p-3">
                <ConditionRow
                  name={t('condition', { n: at + 1 })}
                  condition={r}
                  fields={fields}
                  now={now}
                  tried={tried}
                  onChange={(x) => setAt(at, x)}
                />
              </li>
            ),
          )}
        </ol>
      )}
      {first && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon="add"
            onClick={() =>
              onChange({ ...rules, rules: [...rules.rules, newCondition(first, now)] })
            }
          >
            {t('addCondition')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="add"
            onClick={() =>
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
        </div>
      )}
    </div>
  )
}

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
    <div className="flex flex-wrap items-center gap-2 text-text-2 text-ui">
      <span>{label}</span>
      <Select
        aria-label={aria}
        value={value}
        onValueChange={(v) => onChange(v as 'all' | 'any')}
        options={[
          { value: 'all', label: t('match.all') },
          { value: 'any', label: t('match.any') },
        ]}
        className="w-24"
      />
      <span>{what}</span>
    </div>
  )
}

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
  const info = fields.find((f) => f.field === c.field)
  const error = tried ? conditionError(c, t) : undefined
  const known = new Set(fields.map((f) => f.field))
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 medium:grid-cols-[12rem_10rem_minmax(0,1fr)_auto] medium:items-start">
        <Select
          aria-label={t('condition.field', { name })}
          value={c.field}
          onValueChange={(field) => {
            const next = fields.find((f) => f.field === field)
            if (next) onChange({ ...newCondition(next, now), id: c.id })
          }}
        >
          {Object.entries(FIELD_GROUPS).map(([group, members]) => {
            const shown = members.filter((f) => known.has(f))
            return shown.length ? (
              <SelectGroup
                key={group}
                label={t(`fieldGroup.${group as keyof typeof FIELD_GROUPS}`)}
              >
                {shown.map((f) => {
                  const disabled = fields.find((x) => x.field === f)?.disabled
                  return (
                    <SelectItem key={f} value={f} disabled={!!disabled}>
                      {disabled
                        ? `${t(`field.${f}`)} · ${t('comesWithPlayback')}`
                        : t(`field.${f}`)}
                    </SelectItem>
                  )
                })}
              </SelectGroup>
            ) : null
          })}
        </Select>
        <Select
          aria-label={t('condition.op', { name })}
          value={c.op}
          onValueChange={(op) =>
            info && onChange({ ...c, op: op as RuleOp, value: carry(info, c, op as RuleOp, now) })
          }
          options={(info?.ops ?? [c.op]).map((op) => ({ value: op, label: t(`op.${op}`) }))}
        />
        {info ? (
          <ValueControl
            name={name}
            info={info}
            condition={c}
            onChange={onChange}
            invalid={!!error}
          />
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="close"
          aria-label={t('condition.remove', { name: name.toLowerCase() })}
          onClick={() => onChange(null)}
          className="justify-self-end"
        />
      </div>
      {error && (
        <p role="alert" className="text-badge-danger text-caption">
          {error}
        </p>
      )}
    </div>
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
      type="number"
      aria-label={aria}
      aria-invalid={invalid || undefined}
      value={Number.isNaN(v) ? '' : v}
      step={info.field === 'rating' ? 0.5 : 1}
      min={0}
      max={info.field === 'rating' ? 5 : undefined}
      onChange={(e) => onValue(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      end={unit ? <span className="text-caption">{t(`unit.${unit}`)}</span> : undefined}
    />
  )

  if (info.type === 'text')
    return (
      <Input
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={String(c.value)}
        onChange={(e) => set(e.target.value)}
        placeholder={t('textPlaceholder')}
      />
    )
  if (info.type === 'number' || info.type === 'date') {
    if (c.op === 'inLast')
      return (
        <Input
          type="number"
          aria-label={label}
          min={1}
          value={Number.isNaN(Number(c.value)) ? '' : Number(c.value)}
          onChange={(e) => set(e.target.value === '' ? Number.NaN : Number(e.target.value))}
          end={
            <span className="text-caption">{info.field === 'year' ? t('years') : t('days')}</span>
          }
        />
      )
    if (info.type === 'date')
      return (
        <Input
          type="date"
          aria-label={label}
          value={String(c.value)}
          onChange={(e) => set(e.target.value)}
        />
      )
    if (c.op === 'between') {
      const [lo, hi] = Array.isArray(c.value) ? (c.value as [number, number]) : [0, 0]
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          {number(lo, t('condition.from', { name }), (n) => set([n, hi]))}
          <span className="text-caption text-text-3">{t('and')}</span>
          {number(hi, t('condition.to', { name }), (n) => set([lo, n]))}
        </div>
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
    <Choices
      label={label}
      info={info}
      value={[c.value].flat().map(String)}
      onChange={(v) => set(v as RuleValue)}
    />
  )
}

/** Several choices from a short list: a menu of checkboxes, its button naming what's chosen. */
function Choices({
  label,
  info,
  value,
  onChange,
}: {
  label: string
  info: RuleFieldInfo
  value: string[]
  onChange: (v: string[]) => void
}) {
  const t = useT(messages)
  const names = value.map((v) => info.options?.find((o) => o.value === v)?.label ?? v)
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          aria-label={`${label}: ${names.join(', ') || t('condition.none')}`}
          iconEnd="chevron-down"
          className="min-w-0 justify-between"
        >
          <span className="truncate">{names.length ? names.join(', ') : t('choose')}</span>
        </Button>
      </MenuTrigger>
      <MenuContent align="start" className="max-h-80 overflow-y-auto">
        {(info.options ?? []).map((o) => (
          <MenuCheckboxItem
            key={o.value}
            checked={value.includes(o.value)}
            // keep the menu open to choose several
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) =>
              onChange(on ? [...value, o.value] : value.filter((v) => v !== o.value))
            }
          >
            {o.label}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
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
    <li className="flex items-center gap-1 rounded-full border border-line bg-s2 ps-3 text-text text-ui">
      {name}
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="close"
        aria-label={t('removePerson', { name })}
        onClick={onRemove}
        className="rounded-full"
      />
    </li>
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
    <div className="grid min-w-0 gap-2">
      {value.length > 0 && (
        <ul aria-label={t('condition.chosen', { label })} className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <PersonChip
              key={id}
              id={id}
              known={names[id]}
              onRemove={() => onChange(value.filter((x) => x !== id))}
            />
          ))}
        </ul>
      )}
      <Input
        icon="search"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          field === 'person'
            ? t('searchPeople')
            : t('searchPeople.role', { role: t(`field.${field}`).toLowerCase() })
        }
      />
      {q && search.status === 'success' && (
        <ul aria-label={t('matches', { label })} aria-live="polite" className="grid gap-1">
          {matches.length === 0 ? (
            <li className="px-1 text-caption text-text-3">{t('noPerson', { query: q })}</li>
          ) : (
            matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setNames((n) => ({ ...n, [String(p.id)]: p.name }))
                    onChange([...value, String(p.id)])
                    setQuery('')
                  }}
                  className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-start text-ui outline-none hover:bg-s2 focus-visible:ring-focus"
                >
                  <span className="truncate text-text">{p.name}</span>
                  <span className="text-accent-text text-caption">{t('add')}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
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
