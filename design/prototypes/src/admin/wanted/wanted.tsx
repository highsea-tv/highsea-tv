// SPDX-License-Identifier: AGPL-3.0-only
// A14 Wanted and calendar (reference, docs/product/wanted.md): monitored movies with nothing yet,
// ones below their profile's cutoff, and what's coming out, by month, with an iCal feed.
import {
  Button,
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
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type { MediaItem } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'

export type WantedTab = 'missing' | 'cutoff' | 'calendar'

const useMovies = () =>
  useQuery('wanted:movies', (c) => c.movies.list(), ['movies.updated', 'queue.updated'])

export function Wanted({ tab = 'missing' }: { tab?: WantedTab }) {
  const [, navigate] = useLocation()
  const movies = useMovies()
  const count = (s: MediaItem['status']) =>
    (movies.data ?? []).filter((m) => m.monitored && m.status === s).length || undefined
  return (
    <AdminPage
      title="Wanted"
      description="Monitored movies highsea is still looking for, and what’s coming out."
    >
      <Tabs
        value={tab}
        onValueChange={(v) => navigate(v === 'missing' ? '/wanted' : `/wanted/${v}`)}
        variant="line"
      >
        <TabsList aria-label="Wanted sections">
          <TabsTrigger value="missing" count={count('missing')}>
            Missing
          </TabsTrigger>
          <TabsTrigger value="cutoff" count={count('cutoff-unmet')}>
            Cutoff unmet
          </TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="missing" className="pt-5">
          <List status="missing" />
        </TabsContent>
        <TabsContent value="cutoff" className="pt-5">
          <List status="cutoff-unmet" />
        </TabsContent>
        <TabsContent value="calendar" className="pt-5">
          <Calendar />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

const released = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function List({ status }: { status: 'missing' | 'cutoff-unmet' }) {
  const movies = useMovies()
  const profiles = useQuery('wanted:profiles', (c) => c.movies.qualityProfiles())
  const search = useAction((c, ids: string[]) => c.movies.bulkSearch(ids))
  const cutoff = status === 'cutoff-unmet'
  return (
    <Loadable query={movies} what="the wanted list">
      {(all) => {
        const xs = all.filter((m) => m.monitored && m.status === status)
        if (xs.length === 0)
          return (
            <EmptyState
              icon="success"
              title={cutoff ? 'Everything meets its cutoff' : 'Nothing missing'}
            >
              {cutoff
                ? 'Every movie is at the quality its profile asks for.'
                : 'Every released, monitored movie has a file.'}
            </EmptyState>
          )
        const go = (ids: string[], what: string) =>
          search
            .run(ids)
            .then(() =>
              toast({ title: `Searching for ${what}`, description: 'Results land in Activity.' }),
            )
        return (
          <TableFrame>
            <TableToolbar>
              <span className="me-auto text-caption text-text-3">
                {cutoff
                  ? 'highsea upgrades these when a better release turns up. Search now to look today.'
                  : 'highsea checks RSS every 15 minutes. Search now to look through every indexer.'}
              </span>
              <Button
                size="sm"
                icon="search"
                loading={search.pending}
                onClick={() =>
                  go(
                    xs.map((m) => m.id),
                    `${xs.length} movies`,
                  )
                }
              >
                Search all {xs.length}
              </Button>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Movie</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead>{cutoff ? 'Has · wants' : 'Profile'}</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.map((m) => {
                  const p = profiles.data?.find((x) => x.id === m.versions[0]?.qualityProfileId)
                  return (
                    <TableRow key={m.id}>
                      <TitleCell
                        art={m.art.poster}
                        title={
                          <a href={adminHref(`/movies/${m.id}`)} className="hover:underline">
                            {m.title} ({m.year})
                          </a>
                        }
                      />
                      <TableCell className="text-text-2">
                        {released.format(new Date(m.releaseDate))}
                      </TableCell>
                      <TableCell className="text-text-2">
                        {cutoff
                          ? `${m.quality[0] ?? 'Unknown'} · ${p?.cutoff ?? '—'}`
                          : (p?.name ?? '—')}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          icon="search"
                          aria-label={`Search for ${m.title}`}
                          onClick={() => go([m.id], m.title)}
                        >
                          Search
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- calendar

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const tone = (m: MediaItem) =>
  m.status === 'available'
    ? 'border-success/40 text-text'
    : m.status === 'downloading' || m.status === 'queued'
      ? 'border-accent/50 text-text'
      : 'border-line-strong text-text-2'

function Calendar() {
  const movies = useMovies()
  const now = useNow()
  const [offset, setOffset] = useState(0)
  const today = new Date(now)
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const feed = 'https://harbor.example.net/feed/v1/calendar.ics?key=hs_7Kq2…'
  return (
    <Loadable query={movies} what="the calendar">
      {(all) => {
        const inMonth = all.filter((m) => {
          const d = new Date(m.releaseDate)
          return (
            m.monitored &&
            d.getFullYear() === first.getFullYear() &&
            d.getMonth() === first.getMonth()
          )
        })
        const on = (day: number) => inMonth.filter((m) => new Date(m.releaseDate).getDate() === day)
        return (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="chevron-left"
                aria-label="Previous month"
                onClick={() => setOffset(offset - 1)}
              />
              <h2
                className="min-w-40 text-center font-semibold text-text text-title"
                aria-live="polite"
              >
                {monthName.format(first)}
              </h2>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="chevron-right"
                aria-label="Next month"
                onClick={() => setOffset(offset + 1)}
              />
              {offset !== 0 && (
                <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
                  This month
                </Button>
              )}
              <span className="ms-auto flex flex-wrap gap-3 text-caption text-text-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full border border-success" /> In the library
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full border border-accent" /> Downloading
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full border border-line-strong" /> Wanted
                </span>
              </span>
            </div>
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
                  const date = new Date(first.getFullYear(), first.getMonth(), day)
                  const xs = on(day)
                  return (
                    <li
                      key={day}
                      aria-label={`${day} ${monthName.format(first)}${xs.length ? `: ${xs.map((m) => m.title).join(', ')}` : ''}`}
                      className="grid min-h-24 content-start gap-1 border-line border-e border-b p-1.5"
                    >
                      <span
                        className={cn(
                          'grid size-6 place-items-center rounded-full font-mono text-figure',
                          sameDay(date, today) ? 'bg-accent-fill text-on-accent' : 'text-text-3',
                        )}
                      >
                        {day}
                      </span>
                      {xs.map((m) => (
                        <a
                          key={m.id}
                          href={adminHref(`/movies/${m.id}`)}
                          className={cn(
                            'truncate rounded-sm border px-1.5 py-0.5 text-caption outline-none hover:bg-s2 focus-visible:ring-focus',
                            tone(m),
                          )}
                        >
                          {m.title}
                        </a>
                      ))}
                    </li>
                  )
                })}
              </ol>
            </div>
            <ul
              aria-label={`Releases in ${monthName.format(first)}`}
              className="grid gap-2 medium:hidden"
            >
              {inMonth.length === 0 ? (
                <li className="text-caption text-text-3">
                  Nothing monitored comes out this month.
                </li>
              ) : (
                [...inMonth]
                  .sort((a, b) => Date.parse(a.releaseDate) - Date.parse(b.releaseDate))
                  .map((m) => (
                    <li key={m.id}>
                      <a
                        href={adminHref(`/movies/${m.id}`)}
                        className={cn(
                          'flex items-center gap-3 rounded-md border bg-s1 p-3 text-ui',
                          tone(m),
                        )}
                      >
                        <span className="w-12 font-mono text-figure text-text-3">
                          {new Date(m.releaseDate).getDate()}{' '}
                          {first.toLocaleString('en-GB', { month: 'short' })}
                        </span>
                        {m.title}
                      </a>
                    </li>
                  ))
              )}
            </ul>
            <Field
              label="Subscribe in your calendar app"
              hint="An iCal feed of monitored releases. It carries a read-only key: revoke it in Users and devices › API keys."
            >
              <div className="flex gap-2">
                <Input readOnly value={feed} className="font-mono" />
                <Button
                  icon="copy"
                  onClick={() => {
                    navigator.clipboard?.writeText(feed).catch(() => {})
                    toast({ title: 'Feed link copied' })
                  }}
                >
                  Copy
                </Button>
              </div>
            </Field>
          </div>
        )
      }}
    </Loadable>
  )
}
