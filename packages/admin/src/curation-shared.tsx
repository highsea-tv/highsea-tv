'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// What both composers and the lists share (curation.md), ported from the prototype's
// curation/shared.tsx: who sees it (audience), when (schedule), the status badge, and one-line
// summaries for the lists.
import type {
  Audience,
  ClientType,
  CurationStatus,
  FeaturedSource,
  User,
} from '@highsea-tv/api-contract'
import type { T as Translate } from '@highsea-tv/i18n'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { type Query, useQuery } from '@highsea-tv/sdk/react'
import { admin, line } from '@highsea-tv/tokens'
import {
  Badge,
  type BadgeTone,
  Checkbox,
  DateTimeInput,
  Field,
  SegmentedControl,
  Text,
  tokens,
  useRegularWindow,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { curation as messages } from './curation-messages.ts'

export type T = Translate<typeof messages>

export const useCurationT = () => useT(messages)

// ---------------------------------------------------------------- status

const statusTone: Record<CurationStatus, BadgeTone> = {
  live: 'success',
  scheduled: 'info',
  draft: 'neutral',
  ended: 'neutral',
}

export function StatusBadge({ status }: { status: CurationStatus }) {
  const t = useCurationT()
  return <Badge tone={statusTone[status]}>{t(`status.${status}`)}</Badge>
}

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO → the value a `datetime-local` input takes, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (value: string) => new Date(value).toISOString()

/** "Fri 24 Oct, 20:00", in the admin's language. */
export function useDateTime() {
  const locale = useLocale()
  const format = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (iso: string) => format.format(new Date(iso))
}

/** "Since Fri 17 Oct · until Thu 30 Oct", "From Mon 20 Oct", "Ended Sun 19 Oct". */
export function useScheduleSummary() {
  const t = useCurationT()
  const when = useDateTime()
  return (schedule: { start: string; end: string | null }, status: CurationStatus): string => {
    if (status === 'ended')
      return t('schedule.ended', { when: when(schedule.end ?? schedule.start) })
    const since =
      status === 'scheduled'
        ? t('schedule.from', { when: when(schedule.start) })
        : t('schedule.since', { when: when(schedule.start) })
    return schedule.end ? t('schedule.until', { since, when: when(schedule.end) }) : since
  }
}

// ---------------------------------------------------------------- audience

const ROLES: User['role'][] = ['owner', 'admin', 'user']

/** The apps an owner can address, in groups a person thinks in. */
export const appGroups: { id: 'tv' | 'phone' | 'web' | 'admin'; clients: ClientType[] }[] = [
  { id: 'tv', clients: ['tvos', 'androidtv', 'webos', 'tizen'] },
  { id: 'phone', clients: ['ios', 'android'] },
  { id: 'web', clients: ['web', 'desktop'] },
  { id: 'admin', clients: ['admin'] },
]

/** Everyone accepted on the server: the audience's people, the preview's viewers. */
export const usePeople = () => useQuery('curation:people', (c) => c.users.list(), ['users.updated'])

/** "Everyone", "Owners and admins", "Ruth and Sam", "TVs; Phones and tablets". */
export function useAudienceSummary() {
  const t = useCurationT()
  const list = (xs: string[]) =>
    xs.length <= 1
      ? (xs[0] ?? '')
      : t('audience.and', { list: xs.slice(0, -1).join(', '), last: xs[xs.length - 1] ?? '' })
  return (audience: Audience, users: User[] = []): string => {
    if (audience.kind === 'everyone') return t('audience.everyone')
    if (audience.kind === 'roles') {
      const s = list(audience.roles.map((r) => t(`roles.${r}`)))
      return s.charAt(0).toUpperCase() + s.slice(1)
    }
    if (audience.kind === 'users')
      return list(
        audience.userIds.map(
          (id) => users.find((u) => u.id === id)?.displayName ?? t('audience.someone'),
        ),
      )
    const groups = appGroups.filter((g) => g.clients.some((c) => audience.clients.includes(c)))
    if (groups.length === appGroups.length) return t('audience.everyApp')
    if (groups.length === appGroups.length - 1 && !audience.clients.includes('admin'))
      return t('audience.everyAppButAdmin')
    // "TVs; Phones and tablets": the labels have their own "and"s
    return groups.map((g) => t(`apps.${g.id}`)).join('; ')
  }
}

/**
 * "Picked by hand", "Genre: Comedy". A collection shows its name: the server's own (`sc-…`, 8d)
 * from the collections list, TMDB's from the rule options.
 */
export function useSourceSummary() {
  const t = useCurationT()
  return (
    source: FeaturedSource,
    collections: { id: number | string; name: string }[] = [],
  ): string => {
    if (source.kind === 'manual') return t('source.manual')
    const { rule, value } = source
    if (rule === 'recently-added')
      return t('source.recently-added', { days: value.replace('d', '') })
    if (rule === 'collection')
      return t('source.collection', {
        value: collections.find((c) => String(c.id) === value)?.name ?? value,
      })
    return t(`source.${rule}`, { value })
  }
}

function toggle<T>(xs: T[], x: T, on: boolean): T[] {
  return on ? [...xs.filter((y) => y !== x), x] : xs.filter((y) => y !== x)
}

const s = tokens.space
const ui = tokens.adminText.ui
/** A group's name to its fields (the web's legend, mb-1.5). */
const LEGEND_GAP = tokens.space['1.5']

/**
 * A group of the composer's fields under its name (the web's fieldset and legend): a group named
 * by its label, which is shown in the admin's ui type at 500.
 */
export function FieldGroup({
  label,
  gap = s['2'],
  children,
}: {
  label: string
  gap?: number
  children: ReactNode
}) {
  return (
    <View role="group" aria-label={label} style={{ gap: LEGEND_GAP }}>
      <Text size={ui.size} leading={ui.leading} weight={500} aria-hidden>
        {label}
      </Text>
      <View style={{ gap }}>{children}</View>
    </View>
  )
}

/** A line under a group or field: the caption in text-3. */
export function Hint({ children }: { children: string }) {
  return (
    <Text variant="caption" color="text-3">
      {children}
    </Text>
  )
}

/** A group's own error, read out as it appears. */
export function GroupError({ children }: { children: string | undefined }) {
  if (!children) return null
  return (
    <Text variant="caption" color="badge-danger" role="alert">
      {children}
    </Text>
  )
}

/** Choices in a well (s2, a line round it). */
export function ChoiceWell({
  children,
  columns = 2,
}: {
  children: ReactNode[]
  /** One column always, or two in a regular window (by default). */
  columns?: 1 | 2
}) {
  const theme = useTheme()
  const medium = useRegularWindow()
  const two = columns === 2 && medium
  return (
    <View
      style={{
        flexDirection: two ? 'row' : 'column',
        flexWrap: 'wrap',
        rowGap: s['2'],
        columnGap: s['2'],
        padding: s['3'],
        borderRadius: tokens.radius.md,
        borderWidth: line.thin,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.s2,
      }}
    >
      {children.map((child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the choices are fixed, in order
        <View key={i} style={two ? { flexBasis: '48%', flexGrow: 1, minWidth: 0 } : undefined}>
          {child}
        </View>
      ))}
    </View>
  )
}

/** Two columns side by side in a regular window (the web's medium:grid-cols-2). */
export function Pair({ first, second }: { first: ReactNode; second: ReactNode }) {
  const two = useRegularWindow()
  const column = two ? { flex: 1, flexBasis: 0, minWidth: 0, gap: s['2'] } : { gap: s['2'] }
  return (
    <View style={{ flexDirection: two ? 'row' : 'column', gap: s['3'] }}>
      <View style={column}>{first}</View>
      <View style={column}>{second}</View>
    </View>
  )
}

/** The form's column in a regular window (the web's min(28rem, 50%)). */
const FORM_WIDTH = admin.curationShared.formWidth

/**
 * A composer: its form, and beside it in a regular window the client preview, held in view as
 * the page scrolls (the web's sticky top-4); one column below that.
 */
export function ComposerColumns({
  label,
  form,
  preview,
}: {
  /** The form's name. */
  label: string
  form: ReactNode
  preview: ReactNode
}) {
  const side = useRegularWindow()
  return (
    <View
      style={{
        flexDirection: side ? 'row' : 'column',
        alignItems: side ? 'flex-start' : 'stretch',
        gap: s['6'],
      }}
    >
      <View
        role="form"
        aria-label={label}
        style={[
          { gap: s['6'], minWidth: 0 },
          side && { flexBasis: FORM_WIDTH, flexShrink: 0, maxWidth: '50%' },
        ]}
      >
        {form}
      </View>
      <View
        style={[{ minWidth: 0 }, side && { flex: 1, position: 'sticky' as never, top: s['4'] }]}
      >
        {preview}
      </View>
    </View>
  )
}

/** A composer's buttons, over a line. */
export function ComposerActions({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: s['2'],
        borderTopWidth: line.thin,
        borderColor: theme.colors.line,
        paddingTop: s['4'],
      }}
    >
      {children}
    </View>
  )
}

/** Everyone, some roles, some people or some apps. An empty choice is an error the form shows. */
export function AudienceField({
  value,
  onChange,
  error,
}: {
  value: Audience
  onChange: (a: Audience) => void
  error?: string
}) {
  const t = useCurationT()
  const people = usePeople()
  const choices = (
    items: { id: string; label: string; checked: boolean; on: (c: boolean) => void }[],
  ) => (
    <ChoiceWell>
      {items.map((i) => (
        <Checkbox key={i.id} label={i.label} checked={i.checked} onCheckedChange={i.on} />
      ))}
    </ChoiceWell>
  )
  return (
    <FieldGroup label={t('whoSees')}>
      <SegmentedControl
        aria-label={t('audience')}
        size="sm"
        value={value.kind}
        onValueChange={(k) =>
          onChange(
            k === 'roles'
              ? { kind: 'roles', roles: ['owner', 'admin'] }
              : k === 'users'
                ? { kind: 'users', userIds: [] }
                : k === 'clients'
                  ? { kind: 'clients', clients: appGroups[0]?.clients ?? [] }
                  : { kind: 'everyone' },
          )
        }
        options={[
          { value: 'everyone', label: t('audience.everyone') },
          { value: 'roles', label: t('audience.roles') },
          { value: 'users', label: t('audience.users') },
          { value: 'clients', label: t('audience.clients') },
        ]}
      />
      {value.kind === 'roles' &&
        choices(
          ROLES.map((r) => ({
            id: r,
            label: t(`role.${r}`),
            checked: value.roles.includes(r),
            on: (c) => onChange({ kind: 'roles', roles: toggle(value.roles, r, c) }),
          })),
        )}
      {value.kind === 'users' &&
        choices(
          (people.data ?? [])
            .filter((u) => !u.invited)
            .map((u) => ({
              id: u.id,
              label: u.displayName,
              checked: value.userIds.includes(u.id),
              on: (c) => onChange({ kind: 'users', userIds: toggle(value.userIds, u.id, c) }),
            })),
        )}
      {value.kind === 'clients' &&
        choices(
          appGroups.map((g) => ({
            id: g.id,
            label: t(`apps.${g.id}`),
            checked: g.clients.every((c) => value.clients.includes(c)),
            on: (on) =>
              onChange({
                kind: 'clients',
                clients: on
                  ? [...new Set([...value.clients, ...g.clients])]
                  : value.clients.filter((c) => !g.clients.includes(c)),
              }),
          })),
        )}
      <GroupError>{error}</GroupError>
    </FieldGroup>
  )
}

/** The audience's own error, if it picks nobody. */
export function audienceError(a: Audience, t: T): string | undefined {
  if (a.kind === 'roles' && !a.roles.length) return t('error.roles')
  if (a.kind === 'users' && !a.userIds.length) return t('error.users')
  if (a.kind === 'clients' && !a.clients.length) return t('error.clients')
  return undefined
}

/** Start now or later; end never or at a time. */
export function ScheduleField({
  value,
  onChange,
  now,
}: {
  value: { start: string; end: string | null }
  onChange: (s: { start: string; end: string | null }) => void
  now: number
}) {
  const t = useCurationT()
  const later = Date.parse(value.start) > now + 60_000
  const endError =
    value.end && Date.parse(value.end) <= Date.parse(value.start)
      ? t('error.endBeforeStart')
      : undefined
  return (
    <FieldGroup label={t('when')} gap={s['3']}>
      <Pair
        first={[
          <SegmentedControl
            key="start"
            aria-label={t('start')}
            size="sm"
            value={later ? 'later' : 'now'}
            onValueChange={(v) =>
              onChange({
                ...value,
                start: new Date(v === 'now' ? now : now + 86_400_000).toISOString(),
              })
            }
            options={[
              { value: 'now', label: t('startNow') },
              { value: 'later', label: t('startLater') },
            ]}
          />,
          later ? (
            <Field key="starts" label={t('starts')}>
              <DateTimeInput
                value={toLocalInput(value.start)}
                onChange={(v) => onChange({ ...value, start: fromLocalInput(v) })}
              />
            </Field>
          ) : null,
        ]}
        second={[
          <SegmentedControl
            key="end"
            aria-label={t('end')}
            size="sm"
            value={value.end ? 'at' : 'never'}
            onValueChange={(v) =>
              onChange({
                ...value,
                end:
                  v === 'never'
                    ? null
                    : new Date(
                        Math.max(now, Date.parse(value.start)) + 7 * 86_400_000,
                      ).toISOString(),
              })
            }
            options={[
              { value: 'never', label: t('noEnd') },
              { value: 'at', label: t('endAt') },
            ]}
          />,
          value.end ? (
            <Field key="ends" label={t('ends')} error={endError}>
              <DateTimeInput
                value={toLocalInput(value.end)}
                onChange={(v) => onChange({ ...value, end: fromLocalInput(v) })}
              />
            </Field>
          ) : null,
        ]}
      />
    </FieldGroup>
  )
}

// ---------------------------------------------------------------- the composers' live reads

/** The value once it has stopped changing for a moment: a draft as the person pauses typing. */
export function useSettled<V>(value: V, ms = 150): V {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

/**
 * A query whose key follows the draft. While a changed one loads, it keeps showing what the last
 * one returned, so the form and the preview don't collapse and jump on every keystroke.
 */
export function useKept<T>(query: Query<T>): Query<T> {
  const last = useRef<T | undefined>(undefined)
  if (query.status === 'success') last.current = query.data
  return query.status === 'loading' && last.current !== undefined
    ? { ...query, status: 'success', data: last.current, error: undefined }
    : query
}
