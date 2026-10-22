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
} from '@highsea/api-contract'
import { useLocale, useT } from '@highsea/i18n/react'
import type { HighseaClient } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Button,
  ConfirmDialog,
  cn,
  EmptyState,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
  toast,
} from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { AdminPage } from './shell.tsx'
import { useNow } from './time.ts'
import { wanted as messages } from './wanted-messages.ts'

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
  const router = useRouter()
  const missing = useQuery('wanted:total:missing', (c) => loadTotal(c, 'missing'), LIVE)
  const cutoff = useQuery('wanted:total:cutoff', (c) => loadTotal(c, 'cutoff'), LIVE)
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <Tabs
        value={tab}
        onValueChange={(v) => router.push(v === 'missing' ? '/wanted' : `/wanted/${v}`)}
        variant="line"
      >
        <TabsList aria-label={t('sections')}>
          <TabsTrigger value="missing" count={missing.data || undefined}>
            {t('tab.missing')}
          </TabsTrigger>
          <TabsTrigger value="cutoff" count={cutoff.data || undefined}>
            {t('tab.cutoff')}
          </TabsTrigger>
          <TabsTrigger value="calendar">{t('tab.calendar')}</TabsTrigger>
        </TabsList>
        <TabsContent value="missing" className="pt-5">
          {tab === 'missing' && <WantedList list="missing" />}
        </TabsContent>
        <TabsContent value="cutoff" className="pt-5">
          {tab === 'cutoff' && <WantedList list="cutoff" />}
        </TabsContent>
        <TabsContent value="calendar" className="pt-5">
          {tab === 'calendar' && <Calendar />}
        </TabsContent>
      </Tabs>
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
          <div className="grid gap-4">
            <TableFrame>
              <TableToolbar>
                <span className="me-auto text-caption text-text-3">
                  {t(cutoff ? 'cutoff.hint' : 'missing.hint')}
                </span>
                <Button
                  size="sm"
                  icon="search"
                  loading={search.pending}
                  onClick={() => go({ all: list })}
                >
                  {t('searchAll', { count: total })}
                </Button>
              </TableToolbar>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('col.movie')}</TableHead>
                    <TableHead>{t('col.released')}</TableHead>
                    <TableHead>{t(cutoff ? 'col.wants' : 'col.profile')}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t('col.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((m) => {
                    const p = profiles.data?.find((x) => x.id === m.qualityProfileId)
                    return (
                      <TableRow key={m.id}>
                        <TitleCell
                          art={m.art.poster ?? undefined}
                          title={
                            <a href={moviePath(m.id)} className="hover:underline">
                              {m.year ? `${m.title} (${m.year})` : m.title}
                            </a>
                          }
                        />
                        <TableCell className="text-text-2">
                          {m.releaseDate ? released.format(new Date(m.releaseDate)) : t('unknown')}
                        </TableCell>
                        <TableCell className="text-text-2">
                          {p ? (cutoff ? `${p.name} · ${p.cutoff}` : p.name) : t('unknown')}
                        </TableCell>
                        <TableCell className="text-end">
                          <Button
                            size="sm"
                            icon="search"
                            aria-label={t('searchFor', { title: m.title })}
                            onClick={() => go({ ids: [m.id] }, m.title)}
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
              <Button className="justify-self-center" onClick={() => setPages(pages + 1)}>
                {t('more')}
              </Button>
            )}
          </div>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- calendar

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** The prototype's tones: in the library, on its way, still wanted. */
const tone = (m: Movie) =>
  m.status === 'available'
    ? 'border-success/40 text-text'
    : m.status === 'downloading'
      ? 'border-accent/50 text-text'
      : 'border-line-strong text-text-2'

function Calendar() {
  const t = useT(messages)
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
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="chevron-left"
          aria-label={t('calendar.previous')}
          onClick={() => setOffset(offset - 1)}
        />
        <h2 className="min-w-40 text-center font-semibold text-text text-title" aria-live="polite">
          {monthName}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="chevron-right"
          aria-label={t('calendar.next')}
          onClick={() => setOffset(offset + 1)}
        />
        {offset !== 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
            {t('calendar.thisMonth')}
          </Button>
        )}
        <span className="ms-auto flex flex-wrap gap-3 text-caption text-text-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-success" /> {t('calendar.library')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-accent" />{' '}
            {t('calendar.downloading')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-line-strong" />{' '}
            {t('calendar.wanted')}
          </span>
        </span>
      </div>
      <Loadable query={entries} what={t('calendar.what')}>
        {(all) => {
          const on = (day: number) => all.filter((e) => e.date === isoDay(year, month, day))
          return (
            <>
              {/* a month grid from medium; a list of release days on a phone */}
              <div className="hidden overflow-hidden rounded-lg border border-line medium:block">
                <div className="grid grid-cols-7 border-line border-b bg-s1">
                  {weekdays.map((d) => (
                    <div key={d} className="px-2 py-1.5 font-mono text-label text-text-3 uppercase">
                      {d}
                    </div>
                  ))}
                </div>
                <ol className="grid grid-cols-7">
                  {weekdays.slice(0, lead).map((d) => (
                    // the blank days before the 1st, keyed by weekday
                    <li
                      key={`lead-${d}`}
                      aria-hidden
                      className="min-h-24 border-line border-e border-b bg-bg"
                    />
                  ))}
                  {Array.from({ length: days }, (_, i) => {
                    const day = i + 1
                    const date = isoDay(year, month, day)
                    const xs = on(day)
                    const name = dayName.format(new Date(year, month, day))
                    return (
                      <li
                        key={day}
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
                        className="grid min-h-24 min-w-0 content-start gap-1 border-line border-e border-b p-1.5"
                      >
                        <span
                          className={cn(
                            'grid size-6 place-items-center rounded-full font-mono text-figure',
                            date === todayIso ? 'bg-accent-fill text-on-accent' : 'text-text-3',
                          )}
                        >
                          {day}
                        </span>
                        {xs.map((e) => (
                          <a
                            key={`${e.movie.id}-${e.kind}`}
                            href={moviePath(e.movie.id)}
                            title={t('entry.label', { title: e.movie.title, kind: kind(e) })}
                            className={cn(
                              'truncate rounded-sm border px-1.5 py-0.5 text-caption outline-none hover:bg-s2 focus-visible:ring-focus',
                              tone(e.movie),
                            )}
                          >
                            {e.movie.title}
                            <span className="text-text-3"> · {kind(e)}</span>
                          </a>
                        ))}
                      </li>
                    )
                  })}
                </ol>
              </div>
              <ul
                aria-label={t('calendar.releases', { month: monthName })}
                className="grid gap-2 medium:hidden"
              >
                {all.length === 0 ? (
                  <li className="text-caption text-text-3">{t('calendar.none')}</li>
                ) : (
                  all.map((e) => (
                    <li key={`${e.movie.id}-${e.kind}`}>
                      <a
                        href={moviePath(e.movie.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-md border bg-s1 p-3 text-ui',
                          tone(e.movie),
                        )}
                      >
                        <span className="w-14 shrink-0 font-mono text-figure text-text-3">
                          {short.format(new Date(year, month, Number(e.date.slice(8))))}
                        </span>
                        <span className="min-w-0">
                          {e.movie.title}
                          <span className="block text-caption text-text-3">{kind(e)}</span>
                        </span>
                      </a>
                    </li>
                  ))
                )}
              </ul>
            </>
          )
        }}
      </Loadable>
      <Feed />
    </div>
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
      <Loadable query={feed} what={t('feed.what')} skeleton={<div className="h-10" />}>
        {({ url }) =>
          url ? (
            <div className="grid gap-2">
              <div className="flex gap-2">
                <Input readOnly value={url} aria-label={t('feed.label')} className="font-mono" />
                <Button
                  icon="copy"
                  onClick={() => {
                    navigator.clipboard?.writeText(url).catch(() => {})
                    toast({ title: t('feed.copied') })
                  }}
                >
                  {t('feed.copy')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  icon="refresh"
                  loading={make.pending}
                  onClick={() => setConfirm('renew')}
                >
                  {t('feed.renew')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={revoke.pending}
                  onClick={() => setConfirm('off')}
                >
                  {t('feed.off')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-caption text-text-3">{t('feed.none')}</span>
              <Button size="sm" icon="calendar" loading={make.pending} onClick={renew}>
                {t('feed.make')}
              </Button>
            </div>
          )
        }
      </Loadable>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t(confirm === 'off' ? 'feed.offTitle' : 'feed.renewTitle')}
        description={t(confirm === 'off' ? 'feed.offBody' : 'feed.renewBody')}
        confirmLabel={t(confirm === 'off' ? 'feed.offConfirm' : 'feed.renewConfirm')}
        destructive={confirm === 'off'}
        onConfirm={() => (confirm === 'off' ? off() : renew())}
      />
    </Field>
  )
}
