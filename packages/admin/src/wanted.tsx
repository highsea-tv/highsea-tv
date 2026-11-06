'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A14 Wanted (wanted.md), ported from the prototype with real data: monitored movies with nothing
// yet, ones under their profile's cutoff, and what's coming out, by month, with the iCal feed.
// What real data changes from the prototype:
// - the lists come a page at a time from Wanted's own routes, with Show more under them, and the
//   tabs count each list's total;
// - a movie doesn't carry its file's quality, so Cutoff unmet shows the profile and the quality it
//   wants;
// - each of a movie's dates is its own calendar entry (the owner's answer 2), labelled with which;
// - the feed's address is the person's own, made, replaced and turned off here, not in API keys.
import {
  type CalendarEntry,
  DOWNLOAD_TOPICS,
  MEDIA_TOPICS,
  type Movie,
  type MoviePage,
  WANTED_TOPICS,
  type WantedSearchInput,
} from '@highsea-tv/api-contract'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { HighseaClient } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Press,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  Text,
  TitleCell,
  TitleLink,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { AdminPage } from './shell.tsx'
import { useTabAddress } from './tabs.ts'
import { useNow } from './time.ts'
import { wanted as messages } from './wanted-messages.ts'

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure
/** react-native-web's link props, which React Native's types don't name (a Press as an `<a>`). */
const linkTo = (href: string) => ({ href }) as object

export type WantedTab = 'missing' | 'cutoff' | 'calendar'
type List = 'missing' | 'cutoff'

/** What changes the lists: the library, a grab, and RSS or the sweep (media's WANTED_TOPIC). */
const LIVE = [MEDIA_TOPICS.movies, DOWNLOAD_TOPICS.queue, WANTED_TOPICS.wanted]
const PAGE = 50

/** The first `pages` pages of a list, following the cursor. */
async function loadList(c: HighseaClient, list: List, pages: number) {
  const items: Movie[] = []
  let cursor: string | undefined
  let first: MoviePage | undefined
  for (let i = 0; i < pages; i++) {
    const query = { cursor, limit: PAGE }
    const page =
      list === 'missing' ? await c.wanted.missing({ query }) : await c.wanted.cutoff({ query })
    first ??= page
    items.push(...page.items)
    cursor = page.next ?? undefined
    if (!cursor) break
  }
  return { items, total: first?.total ?? 0, more: Boolean(cursor) }
}

const loadTotal = (c: HighseaClient, list: List) =>
  (list === 'missing'
    ? c.wanted.missing({ query: { limit: 1 } })
    : c.wanted.cutoff({ query: { limit: 1 } })
  ).then((p) => p.total)

/** Intl wants a full tag; the admin's `en` reads as the prototype's en-GB. */
const intlLocale = (locale: string) => (locale === 'en' ? 'en-GB' : locale)

export function Wanted({ tab = 'missing' }: { tab?: WantedTab }) {
  const t = useT(messages)
  const setTab = useTabAddress<WantedTab>('/wanted', 'missing')
  const missing = useQuery('wanted:total:missing', (c) => loadTotal(c, 'missing'), LIVE)
  const cutoff = useQuery('wanted:total:cutoff', (c) => loadTotal(c, 'cutoff'), LIVE)
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <Tabs
        variant="line"
        aria-label={t('sections')}
        value={tab}
        onValueChange={setTab}
        options={[
          { value: 'missing', label: t('tab.missing'), count: missing.data || undefined },
          { value: 'cutoff', label: t('tab.cutoff'), count: cutoff.data || undefined },
          { value: 'calendar', label: t('tab.calendar') },
        ]}
      />
      <View role="tabpanel" aria-label={t(`tab.${tab}`)} style={{ paddingTop: s['5'] }}>
        {tab === 'calendar' ? <Calendar /> : <WantedList key={tab} list={tab} />}
      </View>
    </AdminPage>
  )
}

function WantedList({ list }: { list: List }) {
  const t = useT(messages)
  const locale = intlLocale(useLocale())
  const [pages, setPages] = useState(1)
  const movies = useQuery(`wanted:${list}:${pages}`, (c) => loadList(c, list, pages), LIVE)
  const profiles = useQuery('quality-profiles', (c) => c.quality.profiles())
  const search = useAction((c, input: WantedSearchInput) => c.wanted.search({ body: input }))
  const cutoff = list === 'cutoff'
  const released = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  /** A movie's search names it; Search all counts what it queued. */
  const go = (input: WantedSearchInput, title?: string) =>
    search.run(input).then(
      ({ queued }) =>
        toast({
          title: title ? t('searching.one', { title }) : t('searching.all', { count: queued }),
          description: t('searching.body'),
        }),
      (e: Error) => toast.error(t('searching.failed'), { description: e.message }),
    )
  return (
    <Loadable query={movies} what={t('list.what')}>
      {({ items, total, more }) => {
        if (items.length === 0)
          return (
            <EmptyState icon="success" title={t(cutoff ? 'cutoff.empty' : 'missing.empty')}>
              {t(cutoff ? 'cutoff.emptyBody' : 'missing.emptyBody')}
            </EmptyState>
          )
        return (
          <View style={{ gap: s['4'] }}>
            <TableFrame>
              <TableToolbar>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="caption" color="text-3">
                    {t(cutoff ? 'cutoff.hint' : 'missing.hint')}
                  </Text>
                </View>
                <Button
                  size="sm"
                  icon="search"
                  loading={search.pending}
                  onPress={() => go({ all: list })}
                >
                  {t('searchAll', { count: total })}
                </Button>
              </TableToolbar>
              <Table label={t(`tab.${list}`)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('col.movie')}</TableHead>
                    <TableHead>{t('col.released')}</TableHead>
                    <TableHead>{t(cutoff ? 'col.wants' : 'col.profile')}</TableHead>
                    <TableHead hidden>{t('col.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((m) => {
                    const p = profiles.data?.find((x) => x.id === m.qualityProfileId)
                    return (
                      <TableRow key={m.id}>
                        <TableCell tall>
                          <TitleCell
                            art={m.art.poster ?? null}
                            title={
                              <TitleLink href={moviePath(m.id)}>
                                {m.year ? `${m.title} (${m.year})` : m.title}
                              </TitleLink>
                            }
                          />
                        </TableCell>
                        <TableCell tall>
                          <Quiet>
                            {m.releaseDate
                              ? released.format(new Date(m.releaseDate))
                              : t('unknown')}
                          </Quiet>
                        </TableCell>
                        <TableCell tall>
                          <Quiet>
                            {p ? (cutoff ? `${p.name} · ${p.cutoff}` : p.name) : t('unknown')}
                          </Quiet>
                        </TableCell>
                        <TableCell tall align="end">
                          <Button
                            size="sm"
                            icon="search"
                            accessibilityLabel={t('searchFor', { title: m.title })}
                            onPress={() => go({ ids: [m.id] }, m.title)}
                          >
                            {t('search')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableFrame>
            {more && (
              <View style={{ alignSelf: 'center' }}>
                <Button onPress={() => setPages(pages + 1)}>{t('more')}</Button>
              </View>
            )}
          </View>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- calendar

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

type Tone = 'library' | 'downloading' | 'wanted'

/** The prototype's tones: in the library, on its way, still wanted. */
const toneOf = (m: Movie): Tone =>
  m.status === 'available' ? 'library' : m.status === 'downloading' ? 'downloading' : 'wanted'

/** An entry's edge and words by its tone (the web's border-success/40, border-accent/50, border-line-strong). */
function useTones() {
  const { colors } = useTheme()
  return (tone: Tone) =>
    tone === 'library'
      ? { edge: alpha(colors.success, 0.4), words: 'text' as const, dot: colors.success }
      : tone === 'downloading'
        ? { edge: alpha(colors.accent, 0.5), words: 'text' as const, dot: colors.accent }
        : { edge: colors['line-strong'], words: 'text-2' as const, dot: colors['line-strong'] }
}

/** A table cell's words in `text-2`. */
function Quiet({ children }: { children: string }) {
  return (
    <Text size={ui.size} leading={ui.leading} color="text-2" numberOfLines={1}>
      {children}
    </Text>
  )
}

/** A day's cell: a seventh of the week (the web's grid-cols-7), at least 96 tall. */
const DAY = { width: `${100 / 7}%`, minHeight: 96 } as const

function Calendar() {
  const t = useT(messages)
  const theme = useTheme()
  const tones = useTones()
  const grid = useWindowAtLeast(breakpoints.medium)
  const locale = intlLocale(useLocale())
  const now = useNow()
  const [offset, setOffset] = useState(0)
  const today = new Date(now)
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const year = first.getFullYear()
  const month = first.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const from = isoDay(year, month, 1)
  const to = isoDay(year, month, days)
  const todayIso = isoDay(today.getFullYear(), today.getMonth(), today.getDate())
  const entries = useQuery(
    `calendar:${from}`,
    (c) => c.wanted.calendar({ query: { from, to } }),
    LIVE,
  )
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    first,
  )
  const dayName = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  // a week from a Monday, in the person's language
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)),
  )
  const kind = (e: CalendarEntry) => t(`kind.${e.kind}`)
  const line = theme.colors.line
  const legend = (tone: Tone, words: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['1'] + s['0.5'] }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: tokens.radius.pill,
          borderWidth: 1,
          borderColor: tones(tone).dot,
        }}
      />
      <Text variant="caption" color="text-3">
        {words}
      </Text>
    </View>
  )
  return (
    <View style={{ gap: s['4'] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="chevron-left"
          accessibilityLabel={t('calendar.previous')}
          onPress={() => setOffset(offset - 1)}
        />
        <View style={{ minWidth: 160 }}>
          <Text variant="title" align="center" role="heading" aria-level={2} aria-live="polite">
            {monthName}
          </Text>
        </View>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="chevron-right"
          accessibilityLabel={t('calendar.next')}
          onPress={() => setOffset(offset + 1)}
        />
        {offset !== 0 && (
          <Button size="sm" variant="ghost" onPress={() => setOffset(0)}>
            {t('calendar.thisMonth')}
          </Button>
        )}
        <View style={{ marginStart: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: s['3'] }}>
          {legend('library', t('calendar.library'))}
          {legend('downloading', t('calendar.downloading'))}
          {legend('wanted', t('calendar.wanted'))}
        </View>
      </View>
      <Loadable query={entries} what={t('calendar.what')}>
        {(all) => {
          const on = (day: number) => all.filter((e) => e.date === isoDay(year, month, day))
          // a month grid from medium; a list of release days on a phone
          return grid ? (
            <View
              style={{
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: line,
                borderRadius: tokens.radius.lg,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: 1,
                  borderBottomColor: line,
                  backgroundColor: theme.colors.s1,
                }}
              >
                {weekdays.map((d) => (
                  <View
                    key={d}
                    style={{ width: DAY.width, paddingHorizontal: s['2'], paddingVertical: 6 }}
                  >
                    <Text variant="label" color="text-3">
                      {d}
                    </Text>
                  </View>
                ))}
              </View>
              <View role="list" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {weekdays.slice(0, lead).map((d) => (
                  // the blank days before the 1st, keyed by weekday
                  <View
                    key={`lead-${d}`}
                    aria-hidden
                    style={{
                      ...DAY,
                      borderEndWidth: 1,
                      borderBottomWidth: 1,
                      borderColor: line,
                      backgroundColor: theme.colors.bg,
                    }}
                  />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const day = i + 1
                  const date = isoDay(year, month, day)
                  const xs = on(day)
                  const name = dayName.format(new Date(year, month, day))
                  const isToday = date === todayIso
                  return (
                    <View
                      key={day}
                      role="listitem"
                      aria-label={
                        xs.length
                          ? t('calendar.dayWith', {
                              date: name,
                              titles: xs
                                .map((e) =>
                                  t('entry.label', { title: e.movie.title, kind: kind(e) }),
                                )
                                .join(', '),
                            })
                          : name
                      }
                      style={{
                        ...DAY,
                        minWidth: 0,
                        gap: s['1'],
                        padding: 6,
                        borderEndWidth: 1,
                        borderBottomWidth: 1,
                        borderColor: line,
                      }}
                    >
                      <View
                        style={{
                          width: s['6'],
                          height: s['6'],
                          borderRadius: tokens.radius.pill,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isToday ? theme.colors['accent-fill'] : 'transparent',
                        }}
                      >
                        <Text
                          size={figure.size}
                          leading={figure.leading}
                          mono
                          color={isToday ? 'on-accent' : 'text-3'}
                        >
                          {String(day)}
                        </Text>
                      </View>
                      {xs.map((e) => {
                        const tone = tones(toneOf(e.movie))
                        const label = t('entry.label', { title: e.movie.title, kind: kind(e) })
                        return (
                          <Press
                            key={`${e.movie.id}-${e.kind}`}
                            role="link"
                            {...linkTo(moviePath(e.movie.id))}
                            {...({ title: label } as object)}
                            style={({ hovered }) => ({
                              paddingHorizontal: 6,
                              paddingVertical: s['0.5'],
                              borderWidth: 1,
                              borderColor: tone.edge,
                              borderRadius: tokens.radius.sm,
                              backgroundColor: hovered ? theme.colors.s2 : 'transparent',
                            })}
                          >
                            <Text variant="caption" color={tone.words} numberOfLines={1}>
                              {e.movie.title}
                              <Text variant="caption" color="text-3">
                                {` · ${kind(e)}`}
                              </Text>
                            </Text>
                          </Press>
                        )
                      })}
                    </View>
                  )
                })}
              </View>
            </View>
          ) : (
            <View
              role="list"
              aria-label={t('calendar.releases', { month: monthName })}
              style={{ gap: s['2'] }}
            >
              {all.length === 0 ? (
                <View role="listitem">
                  <Text variant="caption" color="text-3">
                    {t('calendar.none')}
                  </Text>
                </View>
              ) : (
                all.map((e) => {
                  const tone = tones(toneOf(e.movie))
                  return (
                    <View key={`${e.movie.id}-${e.kind}`} role="listitem">
                      <Press
                        role="link"
                        {...linkTo(moviePath(e.movie.id))}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: s['3'],
                          padding: s['3'],
                          borderWidth: 1,
                          borderColor: tone.edge,
                          borderRadius: tokens.radius.md,
                          backgroundColor: theme.colors.s1,
                        }}
                      >
                        <View style={{ width: 56, flexShrink: 0 }}>
                          <Text size={figure.size} leading={figure.leading} mono color="text-3">
                            {short.format(new Date(year, month, Number(e.date.slice(8))))}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text size={ui.size} leading={ui.leading} color={tone.words}>
                            {e.movie.title}
                          </Text>
                          <Text variant="caption" color="text-3">
                            {kind(e)}
                          </Text>
                        </View>
                      </Press>
                    </View>
                  )
                })
              )}
            </View>
          )
        }}
      </Loadable>
      <Feed />
    </View>
  )
}

/** The person's feed address: made, copied, replaced and turned off here. */
function Feed() {
  const t = useT(messages)
  const feed = useQuery('calendar-feed', (c) => c.wanted.feedKey())
  const make = useAction((c) => c.wanted.makeFeedKey())
  const revoke = useAction((c) => c.wanted.revokeFeedKey())
  const [confirm, setConfirm] = useState<'renew' | 'off' | null>(null)
  const failed = (e: Error) => toast.error(t('feed.failed'), { description: e.message })
  const renew = () => make.run().then(() => feed.refetch(), failed)
  const off = () => revoke.run().then(() => feed.refetch(), failed)
  return (
    <Field label={t('feed.label')} hint={t('feed.hint')}>
      <Loadable query={feed} what={t('feed.what')} skeleton={<View style={{ height: s['10'] }} />}>
        {({ url }) =>
          url ? (
            <View style={{ gap: s['2'] }}>
              <View style={{ flexDirection: 'row', gap: s['2'] }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Input editable={false} value={url} accessibilityLabel={t('feed.label')} mono />
                </View>
                <Button
                  icon="copy"
                  onPress={() => {
                    navigator.clipboard?.writeText(url).catch(() => {})
                    toast({ title: t('feed.copied') })
                  }}
                >
                  {t('feed.copy')}
                </Button>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="refresh"
                  loading={make.pending}
                  onPress={() => setConfirm('renew')}
                >
                  {t('feed.renew')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={revoke.pending}
                  onPress={() => setConfirm('off')}
                >
                  {t('feed.off')}
                </Button>
              </View>
            </View>
          ) : (
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['3'] }}
            >
              <Text variant="caption" color="text-3">
                {t('feed.none')}
              </Text>
              <Button size="sm" icon="calendar" loading={make.pending} onPress={renew}>
                {t('feed.make')}
              </Button>
            </View>
          )
        }
      </Loadable>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={t(confirm === 'off' ? 'feed.offTitle' : 'feed.renewTitle')}
        description={t(confirm === 'off' ? 'feed.offBody' : 'feed.renewBody')}
        confirmLabel={t(confirm === 'off' ? 'feed.offConfirm' : 'feed.renewConfirm')}
        destructive={confirm === 'off'}
        onConfirm={() => (confirm === 'off' ? off() : renew())}
      />
    </Field>
  )
}
