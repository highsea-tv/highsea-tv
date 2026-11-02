// SPDX-License-Identifier: AGPL-3.0-only
// A14 Wanted and calendar (reference, docs/product/wanted.md): monitored movies and episodes with
// nothing yet, ones below their profile's cutoff, and what's coming out or airing, by month, with
// an iCal feed. Episodes joined the films in stage 6 of the prototypes' gaps: one table per tab,
// with a filter for the kind, and the calendar's entries for both.
import {
  Button,
  cn,
  EmptyState,
  Field,
  Input,
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
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
  toast,
} from '@highsea-tv/ui'
import { type ReactNode, useState } from 'react'
import type { HighseaClient } from '../../mock/client.ts'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import {
  byDate,
  type Dated,
  episodeCode,
  episodeDated,
  localDay,
  movieDated,
  showHref,
} from '../episodes.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'
import { useTabAddress } from '../tabs.ts'

export const wantedTabs = ['missing', 'cutoff', 'calendar'] as const
export type WantedTab = (typeof wantedTabs)[number]

type Status = 'missing' | 'cutoff-unmet'

const useMovies = () =>
  useQuery('wanted:movies', (c) => c.movies.list(), ['movies.updated', 'queue.updated'])

const useEpisodes = (status: Status) =>
  useQuery(`wanted:episodes:${status}`, (c) => c.shows.wanted(status), ['shows.updated'])

export function Wanted({ tab = 'missing' }: { tab?: WantedTab }) {
  const setTab = useTabAddress<WantedTab>('/wanted', 'missing')
  const movies = useMovies()
  const missing = useEpisodes('missing')
  const cutoff = useEpisodes('cutoff-unmet')
  const count = (s: Status) =>
    (movies.data ?? []).filter((m) => m.monitored && m.status === s).length +
      ((s === 'missing' ? missing : cutoff).data?.length ?? 0) || undefined
  return (
    <AdminPage
      title="Wanted"
      description="Monitored movies and episodes highsea is still looking for, and what’s coming out."
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as WantedTab)} variant="line">
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

type Kind = 'all' | 'movies' | 'episodes'

/** One row of either kind: a film, or an episode with its show. */
type Row = {
  key: string
  kind: 'movie' | 'episode'
  art: string
  title: ReactNode
  /** The row's name in words, for Search's label and the toast. */
  name: string
  date: Date
  /** Missing: the profile. Cutoff unmet: what it has and what the profile wants. */
  quality: string
  target: { movie: string } | { show: string; episode: string }
}

/** What Search and Search all ask for: films by id, episodes by show. */
type Targets = Row['target'][]

async function searchFor(c: HighseaClient, targets: Targets) {
  const movies = targets.flatMap((t) => ('movie' in t ? [t.movie] : []))
  if (movies.length) await c.movies.bulkSearch(movies)
  for (const t of targets) if ('show' in t) await c.shows.search(t.show, { episode: t.episode })
}

function List({ status }: { status: Status }) {
  const movies = useMovies()
  const episodes = useEpisodes(status)
  const profiles = useQuery('wanted:profiles', (c) => c.movies.qualityProfiles())
  const search = useAction(searchFor)
  const [kind, setKind] = useState<Kind>('all')
  const cutoff = status === 'cutoff-unmet'
  const profile = (id: string | undefined) => profiles.data?.find((x) => x.id === id)
  return (
    <Loadable query={movies} what="the wanted list">
      {(all) => {
        const films: Row[] = all
          .filter((m) => m.monitored && m.status === status)
          .map((m) => {
            const p = profile(m.versions[0]?.qualityProfileId)
            return {
              key: m.id,
              kind: 'movie',
              art: m.art.poster,
              title: (
                <a href={adminHref(`/movies/${m.id}`)} className="hover:underline">
                  {m.title} ({m.year})
                </a>
              ),
              name: m.title,
              date: localDay(m.releaseDate),
              quality: cutoff
                ? `${m.quality[0] ?? 'Unknown'} · ${p?.cutoff ?? '—'}`
                : (p?.name ?? '—'),
              target: { movie: m.id },
            }
          })
        const eps: Row[] = (episodes.data ?? []).map(({ show, episode: e }) => {
          const p = profile(show.qualityProfileId)
          const code = episodeCode(e.season, e.number)
          return {
            key: e.id,
            kind: 'episode',
            art: show.art.poster,
            title: (
              <>
                <a href={showHref(show.id)} className="hover:underline">
                  {show.title}
                </a>
                <span className="text-text-2">
                  {' '}
                  · {code} · {e.title}
                </span>
              </>
            ),
            name: `${show.title} ${code}`,
            date: localDay(e.aired),
            quality: cutoff
              ? `${e.file?.quality ?? 'Unknown'} · ${p?.cutoff ?? '—'}`
              : (p?.name ?? '—'),
            target: { show: show.id, episode: e.id },
          }
        })
        if (films.length + eps.length === 0)
          return (
            <EmptyState
              icon="success"
              title={cutoff ? 'Everything meets its cutoff' : 'Nothing missing'}
            >
              {cutoff
                ? 'Every movie and episode is at the quality its profile asks for.'
                : 'Every released movie and aired episode that’s monitored has a file.'}
            </EmptyState>
          )
        const xs = kind === 'movies' ? films : kind === 'episodes' ? eps : [...films, ...eps]
        const what = (rows: Row[]) => {
          const n = rows.filter((r) => r.kind === 'movie').length
          const e = rows.length - n
          return [
            n ? `${n} ${n === 1 ? 'movie' : 'movies'}` : '',
            e ? `${e} ${e === 1 ? 'episode' : 'episodes'}` : '',
          ]
            .filter(Boolean)
            .join(' and ')
        }
        const go = (rows: Row[], label: string) =>
          search
            .run(rows.map((r) => r.target))
            .then(() =>
              toast({ title: `Searching for ${label}`, description: 'Results land in Activity.' }),
            )
        return (
          <TableFrame>
            <TableToolbar>
              <SegmentedControl
                aria-label="Show"
                size="sm"
                value={kind}
                onValueChange={(v) => setKind(v as Kind)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'movies', label: `Movies · ${films.length}` },
                  { value: 'episodes', label: `Episodes · ${eps.length}` },
                ]}
              />
              <span className="me-auto text-caption text-text-3">
                {cutoff
                  ? 'highsea upgrades these when a better release turns up. Search now to look today.'
                  : 'highsea checks RSS every 15 minutes. Search now to look through every indexer.'}
              </span>
              <Button
                size="sm"
                icon="search"
                loading={search.pending}
                disabled={xs.length === 0}
                onClick={() => go(xs, what(xs))}
              >
                Search all {xs.length}
              </Button>
            </TableToolbar>
            {xs.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-caption text-text-3">
                {kind === 'movies'
                  ? cutoff
                    ? 'Every movie meets its cutoff.'
                    : 'No movies are missing.'
                  : cutoff
                    ? 'Every episode meets its cutoff.'
                    : 'No episodes are missing.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Released or aired</TableHead>
                    <TableHead>{cutoff ? 'Has · wants' : 'Profile'}</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {xs.map((r) => (
                    <TableRow key={r.key}>
                      <TitleCell art={r.art} title={r.title} />
                      <TableCell className="text-text-2">{released.format(r.date)}</TableCell>
                      <TableCell className="text-text-2">{r.quality}</TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          icon="search"
                          aria-label={`Search for ${r.name}`}
                          onClick={() => go([r], r.name)}
                        >
                          Search
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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

const tone: Record<Dated['state'], string> = {
  available: 'border-success/40 text-text',
  downloading: 'border-accent/50 text-text',
  wanted: 'border-line-strong text-text-2',
}

function Calendar() {
  const movies = useMovies()
  const now = useNow()
  const [offset, setOffset] = useState(0)
  const today = new Date(now)
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1)
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  // a day either side, so an air date read in another time zone still lands in the month
  const episodes = useQuery(
    `wanted:airing:${first.getFullYear()}-${first.getMonth()}`,
    (c) => c.shows.airing(first.getTime() - 86_400_000, next.getTime() + 86_400_000),
    ['shows.updated'],
  )
  const feed = 'https://harbor.example.net/feed/v1/calendar.ics?key=hs_7Kq2…'
  return (
    <Loadable query={movies} what="the calendar">
      {(all) => {
        const inMonth = [
          ...all.filter((m) => m.monitored).map(movieDated),
          ...(episodes.data ?? []).map(episodeDated),
        ]
          .filter(
            (x) =>
              x.date.getFullYear() === first.getFullYear() &&
              x.date.getMonth() === first.getMonth(),
          )
          .sort(byDate)
        const on = (day: number) => inMonth.filter((x) => x.date.getDate() === day)
        return (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
                className="min-w-[min(10rem,100%)] text-center font-semibold text-text text-title"
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
            {/* a month grid from medium; a list of release and air days on a phone */}
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
                      aria-label={`${day} ${monthName.format(first)}${xs.length ? `: ${xs.map((x) => x.name).join('; ')}` : ''}`}
                      className="grid min-h-24 min-w-0 content-start gap-1 border-line border-e border-b p-1.5"
                    >
                      <span
                        className={cn(
                          'grid size-6 place-items-center rounded-full font-mono text-figure',
                          sameDay(date, today) ? 'bg-accent-fill text-on-accent' : 'text-text-3',
                        )}
                      >
                        {day}
                      </span>
                      {xs.map((x) => (
                        <a
                          key={x.key}
                          href={x.href}
                          title={x.name}
                          className={cn(
                            'truncate rounded-sm border px-1.5 py-0.5 text-caption outline-none hover:bg-s2 focus-visible:ring-focus',
                            tone[x.state],
                          )}
                        >
                          {x.label}
                        </a>
                      ))}
                    </li>
                  )
                })}
              </ol>
            </div>
            <ul
              aria-label={`Releases and episodes in ${monthName.format(first)}`}
              className="grid gap-2 medium:hidden"
            >
              {inMonth.length === 0 ? (
                <li className="text-caption text-text-3">
                  Nothing monitored comes out or airs this month.
                </li>
              ) : (
                inMonth.map((x) => (
                  <li key={x.key}>
                    <a
                      href={x.href}
                      className={cn(
                        'flex items-center gap-3 rounded-md border bg-s1 p-3 text-ui',
                        tone[x.state],
                      )}
                    >
                      <span className="w-12 shrink-0 font-mono text-figure text-text-3">
                        {x.date.getDate()} {first.toLocaleString('en-GB', { month: 'short' })}
                      </span>
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {x.label}
                        {x.kind === 'episode' && (
                          <span className="block text-caption text-text-3">{x.detail}</span>
                        )}
                      </span>
                    </a>
                  </li>
                ))
              )}
            </ul>
            <Field
              label="Subscribe in your calendar app"
              hint="An iCal feed of monitored releases and episodes’ air dates. It carries a read-only key: revoke it in Users and devices › API keys."
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
