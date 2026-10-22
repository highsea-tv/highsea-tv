'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A person's page (docs/product/media-pages.md#person-page), ported from the prototype's
// media/person.tsx: portrait, biography, their best-known titles, then the filmography marked by
// library state, with Add for what isn't here yet. `/people/{tmdbId}` (ADR 0014, amended).
//
// What real TMDB data changes (each listed in the checkpoint report):
// - TMDB gives one credit per job, so a director who also wrote a film has two; the filmography
//   shows one row per title with every role in it, and Known for counts each title once;
// - Known for is their titles with the most votes, not the highest rating: TMDB's averages on a
//   handful of votes would put obscure titles first;
// - a department filter over TMDB's 12 departments, listing the ones this person has credits in;
// - died shows the date alone (TMDB has no place of death); born's place may be missing.

import {
  DEPARTMENTS,
  type Department,
  type DiscoverMovie,
  type Person,
  type PersonCredit,
} from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  CarouselRow,
  Poster,
  Select,
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
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { AddMovieDialog } from './add-dialog.tsx'
import { moviePath } from './media-links.ts'
import {
  MetadataError,
  SummarySkeleton,
  TitlePoster,
  titleItem,
  useLongDate,
} from './media-sections.tsx'
import { media } from './media-sections-messages.ts'
import { parseTmdbId } from './movie-detail.tsx'
import { person as messages } from './person-messages.ts'
import { AdminPage } from './shell.tsx'

/** One title in a filmography, with every credit the person has on it. */
export type FilmographyRow = Omit<PersonCredit, 'creditId' | 'role' | 'department'> & {
  credits: Pick<PersonCredit, 'creditId' | 'role' | 'department'>[]
}

/** Credits grouped by title, in the server's order (newest first). */
export function byTitle(credits: PersonCredit[]): FilmographyRow[] {
  const rows = new Map<number, FilmographyRow>()
  for (const { creditId, role, department, ...movie } of credits) {
    const row = rows.get(movie.id)
    if (row) row.credits.push({ creditId, role, department })
    else rows.set(movie.id, { ...movie, credits: [{ creditId, role, department }] })
  }
  return [...rows.values()]
}

/** "Director, Screenplay": the roles in a row, once each. */
const roles = (row: FilmographyRow) =>
  [...new Set(row.credits.map((c) => c.role).filter(Boolean))].join(', ')

export function PersonPage({ id: raw }: { id: string }) {
  const id = parseTmdbId(raw)
  const t = useT(messages)
  if (id === null)
    return (
      <AdminPage title={t('person')}>
        <MetadataError
          error={Object.assign(new Error(''), { status: 404 })}
          icon="user"
          unknown={{ title: t('unknown.title'), body: t('unknown.body') }}
        />
      </AdminPage>
    )
  return <PersonById id={id} />
}

function PersonById({ id }: { id: number }) {
  const t = useT(messages)
  // refetched as titles are added, so the filmography's badges follow
  const person = useQuery(`person:${id}`, (c) => c.metadata.person({ params: { id } }), [
    'movies.updated',
    'metadata.updated',
  ])
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const p = person.data

  return (
    <AdminPage title={p?.name ?? t('person')}>
      {person.status === 'error' ? (
        <MetadataError
          error={person.error}
          icon="user"
          unknown={{ title: t('unknown.title'), body: t('unknown.body') }}
        />
      ) : !p ? (
        <SummarySkeleton />
      ) : (
        <>
          <Summary person={p} />
          <KnownFor credits={p.credits} />
          <Filmography person={p} onAdd={(m) => setAdding([m])} />
        </>
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </AdminPage>
  )
}

function Summary({ person: p }: { person: Person }) {
  const t = useT(messages)
  const long = useLongDate()
  const count = new Set(p.credits.map((c) => c.id)).size
  return (
    <section
      aria-label={t('summary')}
      className="grid gap-5 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[9rem_minmax(0,1fr)] medium:p-5"
    >
      <Poster title={p.name} src={p.photo ?? undefined} className="w-32 medium:w-full" />
      <div className="grid grid-cols-1 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {p.knownFor && (
            <Badge tone="neutral" dot={false}>
              {t(`knownFor.${p.knownFor}`)}
            </Badge>
          )}
          <span className="text-caption text-text-3">{t('titles', { count })}</span>
        </div>
        {(p.born || p.died) && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-caption">
            {p.born && (
              <>
                <dt className="text-text-3">{t('born')}</dt>
                <dd className="text-text-2">
                  {p.born.date && p.born.place
                    ? t('bornAt', { date: long(p.born.date), place: p.born.place })
                    : p.born.date
                      ? long(p.born.date)
                      : p.born.place}
                </dd>
              </>
            )}
            {p.died && (
              <>
                <dt className="text-text-3">{t('died')}</dt>
                <dd className="text-text-2">{long(p.died.date)}</dd>
              </>
            )}
          </dl>
        )}
        <p className="max-w-[65ch] whitespace-pre-line text-body text-text-2">
          {p.bio ?? t('noBio', { name: p.name })}
        </p>
      </div>
    </section>
  )
}

/** Their titles with the most votes. Left out when the filmography is short enough to read. */
function KnownFor({ credits }: { credits: PersonCredit[] }) {
  const t = useT(messages)
  const titles = byTitle(credits)
  if (titles.length < 3) return null
  const best = [...titles].sort((a, b) => b.voteCount - a.voteCount).slice(0, 8)
  return (
    <CarouselRow flush title={t('knownFor')} itemClassName={titleItem}>
      {best.map((m) => (
        <TitlePoster key={m.id} t={m} />
      ))}
    </CarouselRow>
  )
}

type Filter = 'all' | 'in' | 'out'
const ALL = 'all'

function Filmography({
  person: p,
  onAdd,
}: {
  person: Person
  onAdd: (movie: DiscoverMovie) => void
}) {
  const t = useT(messages)
  const tm = useT(media)
  const [filter, setFilter] = useState<Filter>('all')
  const [department, setDepartment] = useState<Department | typeof ALL>(ALL)
  const departments = DEPARTMENTS.filter((d) => p.credits.some((c) => c.department === d))
  const inDepartment =
    department === ALL ? p.credits : p.credits.filter((c) => c.department === department)
  const rows = byTitle(inDepartment)
  const counts = {
    all: rows.length,
    in: rows.filter((r) => r.inLibrary).length,
    out: rows.filter((r) => !r.inLibrary).length,
  }
  const shown = rows.filter((r) =>
    filter === 'all' ? true : filter === 'in' ? r.inLibrary : !r.inLibrary,
  )
  // the add dialog takes the movie, without the person's part in it
  const movie = ({ credits: _, ...m }: FilmographyRow): DiscoverMovie => m
  return (
    <section aria-labelledby="filmography" className="grid gap-3">
      <h2 id="filmography" className="text-title text-text">
        {t('filmography')}
      </h2>
      <TableFrame>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TableToolbar>
            <TabsList aria-label={t('filter')} className="max-w-full overflow-x-auto">
              <TabsTrigger value="all" count={counts.all}>
                {t('filter.all')}
              </TabsTrigger>
              <TabsTrigger value="in" count={counts.in}>
                {t('filter.in')}
              </TabsTrigger>
              <TabsTrigger value="out" count={counts.out}>
                {t('filter.out')}
              </TabsTrigger>
            </TabsList>
            {departments.length > 1 && (
              <Select
                aria-label={t('department')}
                value={department}
                onValueChange={(v) => setDepartment(v as Department | typeof ALL)}
                options={[
                  { value: ALL, label: t('department.all') },
                  ...departments.map((d) => ({ value: d, label: tm(`department.${d}`) })),
                ]}
                className="ms-auto w-48"
              />
            )}
          </TableToolbar>
          <TabsContent value={filter}>
            {shown.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-caption text-text-3">{t('nothing')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('title')}</TableHead>
                    <TableHead>{t('role')}</TableHead>
                    <TableHead className="w-40">{t('library')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => (
                    <TableRow key={r.id}>
                      <TitleCell
                        art={r.art.poster ?? ''}
                        title={
                          <a href={moviePath(r.id)} className="hover:underline">
                            {r.title}
                          </a>
                        }
                        detail={r.year === null ? undefined : String(r.year)}
                      />
                      <TableCell className="text-text-2">{roles(r) || '—'}</TableCell>
                      <TableCell>
                        {r.inLibrary ? (
                          <a
                            href={moviePath(r.id)}
                            aria-label={t('inLibrary.label', { title: r.title })}
                          >
                            <Badge tone="success">{t('inLibrary')}</Badge>
                          </a>
                        ) : (
                          <Button
                            size="sm"
                            icon="add"
                            onClick={() => onAdd(movie(r))}
                            aria-label={t('add.label', { title: r.title })}
                          >
                            {t('add')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </TableFrame>
    </section>
  )
}
