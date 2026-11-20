'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A14 Wanted (wanted.md), ported from the prototype with real data: monitored movies with nothing
// yet, ones under their profile's cutoff, and what's coming out, by month, with the iCal feed.
// Episodes (stage 6 of the prototypes' gaps, built with HT-109) share each table, with a filter
// for the kind, and the calendar, as the stage drew them.
// What real data changes from the prototype:
// - the lists come a page at a time from Wanted's own routes, with Show more under them, and the
//   tabs count each list's total;
// - a movie doesn't carry its file's quality, so Cutoff unmet shows the profile and the quality it
//   wants;
// - each of a movie's dates is its own calendar entry (the owner's answer 2), labelled with which;
// - the feed's address is the person's own, made, replaced and turned off here, not in API keys;
// - movies and episodes come from their own lists, a page of each at a time, films first in All;
// - a movie's Cutoff unmet row shows its profile and cutoff (a movie carries no file quality), an
//   episode's its file's quality and the cutoff, as drawn.
import {
  type CalendarEntry,
  DOWNLOAD_TOPICS,
  DRAFT_TOPICS,
  MEDIA_TOPICS,
  type Movie,
  type MoviePage,
  WANTED_TOPICS,
  type WantedEpisode,
  type WantedEpisodePage,
  type WantedSearchInput,
} from '@highsea-tv/api-contract'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { HighseaClient } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { admin, line } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Press,
  SegmentedControl,
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
  useRegularWindow,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { AdminPage } from './shell.tsx'
import { showPath } from './show-data.ts'
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
const LIVE = [
  MEDIA_TOPICS.movies,
  // episodes' lists follow the shows too (HT-109)
  DRAFT_TOPICS.shows,
  DOWNLOAD_TOPICS.queue,
  WANTED_TOPICS.wanted,
]
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

/** The same for a list's episodes (HT-109). */
async function loadEpisodes(c: HighseaClient, list: List, pages: number) {
  const items: WantedEpisode[] = []
  let cursor: string | undefined
  let first: WantedEpisodePage | undefined
  for (let i = 0; i < pages; i++) {
    const query = { cursor, limit: PAGE }
    const page =
      list === 'missing'
        ? await c.wanted.missingEpisodes({ query })
        : await c.wanted.cutoffEpisodes({ query })
    first ??= page
    items.push(...page.items)
    cursor = page.next ?? undefined
    if (!cursor) break
  }
  return { items, total: first?.total ?? 0, more: Boolean(cursor) }
}

/** A tab's count: its movies and its episodes. */
const loadTotal = (c: HighseaClient, list: List) =>
  Promise.all([
    list === 'missing'
      ? c.wanted.missing({ query: { limit: 1 } })
      : c.wanted.cutoff({ query: { limit: 1 } }),
    list === 'missing'
      ? c.wanted.missingEpisodes({ query: { limit: 1 } })
      : c.wanted.cutoffEpisodes({ query: { limit: 1 } }),
  ]).then(([m, e]) => m.total + e.total)

/** Intl wants a full tag; the admin's `en` reads as the prototype's en-GB. */
const intlLocale = (locale: string) => (locale === 'en' ? 'en-GB' : locale)

/** "S03E05", as the admin writes an episode's place. */
const episodeCode = (season: number, n: number) => `S${pad(season)}E${pad(n)}`

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

type Kind = 'all' | 'movies' | 'episodes'

/** One row of either kind: a film, or an episode with its show (stage 6). */
type Row = {
  key: string
  art: string | null
  title: ReactNode
  /** The row's name in words, for Search's label and the toast. */
  name: string
  date: string | null
  /** Missing: the profile. Cutoff unmet: what it has (an episode's file) and what it wants. */
  quality: string
  search: WantedSearchInput
}

function WantedList({ list }: { list: List }) {
  const t = useT(messages)
  const locale = intlLocale(useLocale())
  const [pages, setPages] = useState(1)
  const [kind, setKind] = useState<Kind>('all')
  const both = useQuery(
    `wanted:${list}:${pages}`,
    (c) =>
      Promise.all([loadList(c, list, pages), loadEpisodes(c, list, pages)]).then(
        ([movies, episodes]) => ({ movies, episodes }),
      ),
    LIVE,
  )
  const profiles = useQuery('quality-profiles', (c) => c.quality.profiles())
  const search = useAction((c, input: WantedSearchInput) => c.wanted.search({ body: input }))
  const cutoff = list === 'cutoff'
  const released = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  /** A row's search names it; Search all counts what it queued, movies and episodes. */
  const go = (input: WantedSearchInput, title?: string) =>
    search.run(input).then(
      ({ queued, episodes: found = 0 }) =>
        toast({
          title: title
            ? t('searching.one', { title })
            : queued && found
              ? t('searching.both', { movies: queued, episodes: found })
              : found
                ? t('searching.episodes', { count: found })
                : t('searching.all', { count: queued }),
          description: t('searching.body'),
        }),
      (e: Error) => toast.error(t('searching.failed'), { description: e.message }),
    )
  return (
    <Loadable query={both} what={t('list.what')}>
      {(data) => {
        const m = data.movies
        const e = data.episodes
        if (m.items.length + e.items.length === 0)
          return (
            <EmptyState icon="success" title={t(cutoff ? 'cutoff.empty' : 'missing.empty')}>
              {t(cutoff ? 'cutoff.emptyBody' : 'missing.emptyBody')}
            </EmptyState>
          )
        const profile = (id: string) => profiles.data?.find((x) => x.id === id)
        const films: Row[] = m.items.map((x) => {
          const p = profile(x.qualityProfileId)
          return {
            key: `movie:${x.id}`,
            art: x.art.poster ?? null,
            title: (
              <TitleLink href={moviePath(x.id)}>
                {x.year ? `${x.title} (${x.year})` : x.title}
              </TitleLink>
            ),
            name: x.title,
            date: x.releaseDate,
            quality: p ? (cutoff ? `${p.name} · ${p.cutoff}` : p.name) : t('unknown'),
            search: { ids: [x.id] },
          }
        })
        const eps: Row[] = e.items.map(({ show, episode: x }) => {
          const p = profile(show.qualityProfileId)
          const code = episodeCode(x.season, x.number)
          return {
            key: `episode:${x.id}`,
            art: show.poster,
            title: (
              <Text size={ui.size} leading={ui.leading} numberOfLines={1}>
                <TitleLink href={showPath(show.id)}>{show.title}</TitleLink>
                <Text size={ui.size} leading={ui.leading} color="text-2">
                  {` · ${code}${x.title ? ` · ${x.title}` : ''}`}
                </Text>
              </Text>
            ),
            name: t('episode', { show: show.title, code }),
            date: x.aired,
            quality: p
              ? cutoff
                ? `${x.quality ?? t('unknown')} · ${p.cutoff}`
                : p.name
              : t('unknown'),
            search: {
              episodes: [{ show: show.id, season: x.season, episode: x.number }],
            },
          }
        })
        const rows = kind === 'movies' ? films : kind === 'episodes' ? eps : [...films, ...eps]
        const count =
          kind === 'movies' ? m.total : kind === 'episodes' ? e.total : m.total + e.total
        const more = (kind !== 'episodes' && m.more) || (kind !== 'movies' && e.more)
        return (
          <View style={{ gap: s['4'] }}>
            <TableFrame>
              <TableToolbar>
                <SegmentedControl
                  aria-label={t('kinds')}
                  size="sm"
                  value={kind}
                  onValueChange={setKind}
                  options={[
                    { value: 'all', label: t('kind.all') },
                    { value: 'movies', label: t('kind.movies', { count: m.total }) },
                    { value: 'episodes', label: t('kind.episodes', { count: e.total }) },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="caption" color="text-3">
                    {t(cutoff ? 'cutoff.hint' : 'missing.hint')}
                  </Text>
                </View>
                <Button
                  size="sm"
                  icon="search"
                  loading={search.pending}
                  disabled={count === 0}
                  onPress={() => go({ all: list, ...(kind === 'all' ? {} : { kind }) })}
                >
                  {t('searchAll', { count })}
                </Button>
              </TableToolbar>
              {rows.length === 0 ? (
                <View style={{ paddingVertical: s['8'], paddingHorizontal: s['3'] }}>
                  <Text variant="caption" color="text-3" align="center">
                    {t(
                      kind === 'movies'
                        ? cutoff
                          ? 'kind.moviesMet'
                          : 'kind.noMovies'
                        : cutoff
                          ? 'kind.episodesMet'
                          : 'kind.noEpisodes',
                    )}
                  </Text>
                </View>
              ) : (
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
                    {rows.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell tall truncate>
                          <TitleCell art={r.art} title={r.title} />
                        </TableCell>
                        <TableCell tall>
                          <Quiet>{r.date ? released.format(new Date(r.date)) : t('unknown')}</Quiet>
                        </TableCell>
                        <TableCell tall>
                          <Quiet>{r.quality}</Quiet>
                        </TableCell>
                        <TableCell tall align="end">
                          <Button
                            size="sm"
                            icon="search"
                            accessibilityLabel={t('searchFor', { title: r.name })}
                            onPress={() => go(r.search, r.name)}
                          >
                            {t('search')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
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
const toneOf = (e: CalendarEntry): Tone => {
  const status = 'movie' in e ? e.movie.status : e.episode.episode.status
  return status === 'available' || status === 'cutoff-unmet'
    ? 'library'
    : status === 'downloading'
      ? 'downloading'
      : 'wanted'
}

/**
 * An entry as the calendar shows it: a film's title and which date it is, or (stage 6) an
 * episode's show and place, its title as the chip's tooltip.
 */
const entryOf = (e: CalendarEntry) =>
  'movie' in e
    ? {
        key: `${e.movie.id}-${e.kind}`,
        href: moviePath(e.movie.id),
        title: e.movie.title,
        tooltip: null as string | null,
      }
    : {
        key: `episode-${e.episode.episode.id}`,
        href: showPath(e.episode.show.id),
        title: `${e.episode.show.title} · ${episodeCode(e.episode.episode.season, e.episode.episode.number)}`,
        tooltip: e.episode.episode.title || null,
      }

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
const DAY = { width: `${100 / 7}%`, minHeight: admin.wanted.day.minHeight } as const

function Calendar() {
  const t = useT(messages)
  const theme = useTheme()
  const tones = useTones()
  const grid = useRegularWindow()
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
  /** A chip's words for screen readers: a film says which date, an episode its title. */
  const labelOf = (e: CalendarEntry) => {
    const x = entryOf(e)
    return 'movie' in e
      ? t('entry.label', { title: x.title, kind: kind(e) })
      : x.tooltip
        ? t('entry.label', { title: x.title, kind: x.tooltip })
        : x.title
  }
  const lineColor = theme.colors.line
  const legend = (tone: Tone, words: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['1'] + s['0.5'] }}>
      <View
        style={{
          width: admin.wanted.dot,
          height: admin.wanted.dot,
          borderRadius: tokens.radius.pill,
          borderWidth: line.thin,
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
        <View style={{ minWidth: admin.wanted.monthLabel }}>
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
          // a month grid in a regular window; a list of release days on a phone
          return grid ? (
            <View
              style={{
                overflow: 'hidden',
                borderWidth: line.thin,
                borderColor: lineColor,
                borderRadius: tokens.radius.lg,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: line.thin,
                  borderBottomColor: lineColor,
                  backgroundColor: theme.colors.s1,
                }}
              >
                {weekdays.map((d) => (
                  <View
                    key={d}
                    style={{
                      width: DAY.width,
                      paddingHorizontal: s['2'],
                      paddingVertical: s['1.5'],
                    }}
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
                      borderEndWidth: line.thin,
                      borderBottomWidth: line.thin,
                      borderColor: lineColor,
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
                              titles: xs.map(labelOf).join(', '),
                            })
                          : name
                      }
                      style={{
                        ...DAY,
                        minWidth: 0,
                        gap: s['1'],
                        padding: s['1.5'],
                        borderEndWidth: line.thin,
                        borderBottomWidth: line.thin,
                        borderColor: lineColor,
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
                        const tone = tones(toneOf(e))
                        const x = entryOf(e)
                        return (
                          <Press
                            key={x.key}
                            role="link"
                            {...linkTo(x.href)}
                            {...({ title: x.tooltip ?? labelOf(e) } as object)}
                            style={({ hovered }) => ({
                              paddingHorizontal: s['1.5'],
                              paddingVertical: s['0.5'],
                              borderWidth: line.thin,
                              borderColor: tone.edge,
                              borderRadius: tokens.radius.sm,
                              backgroundColor: hovered ? theme.colors.s2 : 'transparent',
                            })}
                          >
                            <Text variant="caption" color={tone.words} numberOfLines={1}>
                              {x.title}
                              {'movie' in e && (
                                <Text variant="caption" color="text-3">
                                  {` · ${kind(e)}`}
                                </Text>
                              )}
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
                  const tone = tones(toneOf(e))
                  const x = entryOf(e)
                  return (
                    <View key={x.key} role="listitem">
                      <Press
                        role="link"
                        {...linkTo(x.href)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: s['3'],
                          padding: s['3'],
                          borderWidth: line.thin,
                          borderColor: tone.edge,
                          borderRadius: tokens.radius.md,
                          backgroundColor: theme.colors.s1,
                        }}
                      >
                        <View style={{ width: admin.wanted.timeColumn, flexShrink: 0 }}>
                          <Text size={figure.size} leading={figure.leading} mono color="text-3">
                            {short.format(new Date(year, month, Number(e.date.slice(8))))}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text size={ui.size} leading={ui.leading} color={tone.words}>
                            {x.title}
                          </Text>
                          <Text variant="caption" color="text-3">
                            {'movie' in e ? kind(e) : (x.tooltip ?? kind(e))}
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
