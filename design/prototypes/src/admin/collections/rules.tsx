// SPDX-License-Identifier: AGPL-3.0-only
// The rule builder (docs/product/collections.md#rules): Match all or any of a list of conditions,
// each a field, a comparison and a value, and groups one level deep. Fields come from the server
// with their comparisons and choices; watch state shows, disabled, until playback brings it.
import {
  Button,
  Input,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuTrigger,
  Select,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import type {
  RuleCondition,
  RuleField,
  RuleFieldInfo,
  RuleGroup,
  RuleOp,
  RuleValue,
} from '../../mock/types.ts'

const opLabels: Record<RuleOp, string> = {
  contains: 'contains',
  is: 'is',
  isNot: 'is not',
  between: 'between',
  before: 'before',
  after: 'after',
  inLast: 'in the last',
  atLeast: 'at least',
  atMost: 'at most',
  oneOf: 'is one of',
  notOneOf: 'is not one of',
  includes: 'includes',
  excludes: 'doesn’t include',
  only: 'only',
  anyOf: 'includes any of',
  allOf: 'includes all of',
  noneOf: 'includes none of',
}

let next = 0
/** A new id for a condition or a group, unique within the page. */
export const ruleId = (kind: 'c' | 'g') => `${kind}-${Date.now().toString(36)}-${next++}`

const matchOptions = [
  { value: 'all', label: 'all' },
  { value: 'any', label: 'any' },
]

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
  const first = info.options?.[0]?.value ?? ''
  if (info.type === 'person') return []
  if (info.type === 'text') return ''
  if (info.type === 'choice') return first
  if (info.type === 'list') return op === 'is' || op === 'isNot' ? first : []
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
export function conditionError(c: RuleCondition): string | undefined {
  if (Array.isArray(c.value) && c.value.length === 0) return 'Choose at least one.'
  if (typeof c.value === 'string' && !c.value.trim()) return 'Fill this in.'
  if (typeof c.value === 'number' && Number.isNaN(c.value)) return 'Enter a number.'
  return undefined
}

export function ruleErrors(g: RuleGroup): boolean {
  return g.rules.some((r) => (r.kind === 'group' ? ruleErrors(r) : !!conditionError(r)))
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
  const offered = fields.filter((f) => !f.disabled)
  const first = offered.find((f) => f.field === 'year') ?? offered[0]
  const add = (g: RuleGroup, r: RuleCondition | RuleGroup): RuleGroup => ({
    ...g,
    rules: [...g.rules, r],
  })
  const setAt = (at: number, r: RuleCondition | RuleGroup | null) =>
    onChange({
      ...rules,
      rules: r
        ? rules.rules.map((x, i) => (i === at ? r : x))
        : rules.rules.filter((_, i) => i !== at),
    })
  return (
    <div className="grid gap-3">
      <MatchLine
        label="Match"
        value={rules.match}
        onChange={(match) => onChange({ ...rules, match })}
        what="of these conditions"
        aria="Match all or any of the rules"
      />
      {rules.rules.length === 0 ? (
        <p className="rounded-md border border-line border-dashed p-3 text-caption text-text-3">
          No conditions yet, so every film is in it. Add one to narrow it down.
        </p>
      ) : (
        <ol aria-label="Rules" className="grid gap-2">
          {rules.rules.map((r, at) =>
            r.kind === 'group' ? (
              <li key={r.id} className="grid gap-2 rounded-md border border-line bg-s2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <MatchLine
                    label={`Group ${at + 1}: match`}
                    value={r.match}
                    onChange={(match) => setAt(at, { ...r, match })}
                    what="of these"
                    aria={`Group ${at + 1}: match all or any`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon="delete"
                    className="ms-auto"
                    aria-label={`Remove group ${at + 1}`}
                    onClick={() => setAt(at, null)}
                  />
                </div>
                <ol
                  aria-label={`Group ${at + 1}`}
                  className="grid gap-2 border-line border-s-2 ps-3"
                >
                  {r.rules.map((c, j) =>
                    c.kind === 'condition' ? (
                      <li key={c.id}>
                        <ConditionRow
                          name={`Condition ${at + 1}.${j + 1}`}
                          condition={c}
                          fields={fields}
                          now={now}
                          tried={tried}
                          onChange={(x) =>
                            setAt(at, {
                              ...r,
                              rules: x
                                ? r.rules.map((y, k) => (k === j ? x : y))
                                : r.rules.filter((_, k) => k !== j),
                            })
                          }
                        />
                      </li>
                    ) : null,
                  )}
                </ol>
                {first && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="add"
                    className="justify-self-start"
                    onClick={() => setAt(at, add(r, newCondition(first, now)))}
                  >
                    Add a condition to group {at + 1}
                  </Button>
                )}
              </li>
            ) : (
              <li key={r.id} className="rounded-md border border-line bg-s1 p-3">
                <ConditionRow
                  name={`Condition ${at + 1}`}
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
            onClick={() => onChange(add(rules, newCondition(first, now)))}
          >
            Add a condition
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="add"
            onClick={() =>
              onChange(
                add(rules, {
                  kind: 'group',
                  id: ruleId('g'),
                  match: rules.match === 'all' ? 'any' : 'all',
                  rules: [newCondition(first, now)],
                }),
              )
            }
          >
            Add a group
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
  return (
    <div className="flex flex-wrap items-center gap-2 text-text-2 text-ui">
      <span>{label}</span>
      <Select
        aria-label={aria}
        value={value}
        onValueChange={(v) => onChange(v as 'all' | 'any')}
        options={matchOptions}
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
  const info = fields.find((f) => f.field === c.field)
  const error = tried ? conditionError(c) : undefined
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 medium:grid-cols-[12rem_10rem_minmax(0,1fr)_auto] medium:items-start">
        <Select
          aria-label={`${name}: field`}
          value={c.field}
          onValueChange={(field) => {
            const next = fields.find((f) => f.field === field)
            if (next) onChange({ ...newCondition(next, now), id: c.id })
          }}
          options={fields.map((f) => ({
            value: f.field,
            label: f.disabled ? `${f.label} · ${f.disabled.toLowerCase()}` : f.label,
            disabled: !!f.disabled,
          }))}
        />
        <Select
          aria-label={`${name}: comparison`}
          value={c.op}
          onValueChange={(op) =>
            info && onChange({ ...c, op: op as RuleOp, value: carry(info, c, op as RuleOp, now) })
          }
          options={(info?.ops ?? [c.op]).map((op) => ({ value: op, label: opLabels[op] }))}
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
          aria-label={`Remove ${name.toLowerCase()}`}
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
  const multi = (o: RuleOp) => !['is', 'isNot', 'contains'].includes(o)
  if (info.type === 'list') {
    if (multi(op) === multi(c.op)) return c.value
    const xs = [c.value].flat().map(String)
    return multi(op) ? xs.filter(Boolean) : (xs[0] ?? info.options?.[0]?.value ?? '')
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
  info,
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
  const label = `${name}: value`
  const set = (value: RuleValue) => onChange({ ...c, value })
  const unit = info.unit === 'stars' ? '★' : info.unit
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
      end={unit && info.field !== 'year' ? <span className="text-caption">{unit}</span> : undefined}
    />
  )

  if (info.type === 'text')
    return (
      <Input
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={String(c.value)}
        onChange={(e) => set(e.target.value)}
        placeholder="Caminandes"
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
          end={<span className="text-caption">{info.field === 'year' ? 'years' : 'days'}</span>}
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
          {number(lo, `${name}: from`, (n) => set([n, hi]))}
          <span className="text-caption text-text-3">and</span>
          {number(hi, `${name}: to`, (n) => set([lo, n]))}
        </div>
      )
    }
    return number(Number(c.value), label, set)
  }
  if (info.type === 'choice' || (info.type === 'list' && (c.op === 'is' || c.op === 'isNot')))
    return (
      <Select
        aria-label={label}
        value={String(c.value)}
        onValueChange={set}
        options={info.options ?? []}
      />
    )
  if (info.type === 'person')
    return (
      <PersonSearch
        label={label}
        info={info}
        value={c.value as string[]}
        onChange={set}
        invalid={invalid}
      />
    )
  return <Choices label={label} info={info} value={[c.value].flat().map(String)} onChange={set} />
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
  const names = value.map((v) => info.options?.find((o) => o.value === v)?.label ?? v)
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          aria-label={`${label}: ${names.join(', ') || 'none chosen'}`}
          iconEnd="chevron-down"
          className="min-w-0 justify-between"
        >
          <span className="truncate">{names.length ? names.join(', ') : 'Choose…'}</span>
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

/** People: search everyone in that role in the library, and keep the ones chosen. */
function PersonSearch({
  label,
  info,
  value,
  onChange,
  invalid,
}: {
  label: string
  info: RuleFieldInfo
  value: string[]
  onChange: (v: string[]) => void
  invalid: boolean
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const options = info.options ?? []
  const nameOf = (id: string) => options.find((o) => o.value === id)?.label ?? id
  const matches = q
    ? options
        .filter((o) => !value.includes(o.value) && o.label.toLowerCase().includes(q))
        .slice(0, 6)
    : []
  return (
    <div className="grid min-w-0 gap-2">
      {value.length > 0 && (
        <ul aria-label={`${label}: chosen`} className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1 rounded-full border border-line bg-s2 ps-3 text-text text-ui"
            >
              {nameOf(id)}
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="close"
                aria-label={`Remove ${nameOf(id)}`}
                onClick={() => onChange(value.filter((x) => x !== id))}
                className="rounded-full"
              />
            </li>
          ))}
        </ul>
      )}
      <Input
        icon="search"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${options.length} ${info.label === 'Anyone in the cast and crew' ? 'people' : `${info.label.toLowerCase()}s`}`}
      />
      {q && (
        <ul aria-label={`${label}: matches`} aria-live="polite" className="grid gap-1">
          {matches.length === 0 ? (
            <li className="px-1 text-caption text-text-3">
              No one in the library matches “{query}”.
            </li>
          ) : (
            matches.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...value, o.value])
                    setQuery('')
                  }}
                  className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-start text-ui outline-none hover:bg-s2 focus-visible:ring-focus"
                >
                  <span className="truncate text-text">{o.label}</span>
                  <span className="text-accent-text text-caption">Add</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
