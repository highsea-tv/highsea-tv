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
// Drawn with the library's native renderer since D2 (one-client-platform-d.md).

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
  Details,
  Poster,
  Row,
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
  Text,
  TitleCell,
  TitleLink,
  tokens,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { AddMovieDialog } from './add-dialog.tsx'
import { moviePath } from './media-links.ts'
import {
  InLibraryLink,
  MetadataError,
  SummaryCard,
  SummarySkeleton,
  TitlePoster,
  useLongDate,
  useTitleWidth,
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
  const facts = [
    ...(p.born
      ? [
          {
            term: t('born'),
            value:
              p.born.date && p.born.place
                ? t('bornAt', { date: long(p.born.date), place: p.born.place })
                : p.born.date
                  ? long(p.born.date)
                  : (p.born.place ?? ''),
          },
        ]
      : []),
    ...(p.died ? [{ term: t('died'), value: long(p.died.date) }] : []),
  ]
  return (
    <SummaryCard
      label={t('summary')}
      poster={(width) => <Poster title={p.name} src={p.photo ?? undefined} width={width} />}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: tokens.space['2'],
        }}
      >
        {p.knownFor && (
          <Badge tone="neutral" dot={false}>
            {t(`knownFor.${p.knownFor}`)}
          </Badge>
        )}
        <Text variant="caption" color="text-3">
          {t('titles', { count })}
        </Text>
      </View>
      {facts.length > 0 && (
        <Details
          rows={facts.map(({ term, value }) => ({
            term,
            value: (
              <Text variant="caption" color="text-2">
                {value}
              </Text>
            ),
          }))}
          gap={tokens.space['1']}
        />
      )}
      {/* the biography keeps TMDB's paragraphs: a Text keeps its newlines, as pre-line did */}
      <Text variant="body" color="text-2" style={{ maxWidth: 600 }}>
        {p.bio ?? t('noBio', { name: p.name })}
      </Text>
    </SummaryCard>
  )
}

/** Their titles with the most votes. Left out when the filmography is short enough to read. */
function KnownFor({ credits }: { credits: PersonCredit[] }) {
  const t = useT(messages)
  const width = useTitleWidth()
  const titles = byTitle(credits)
  if (titles.length < 3) return null
  const best = [...titles].sort((a, b) => b.voteCount - a.voteCount).slice(0, 8)
  return (
    <Row
      inset={0}
      title={t('knownFor')}
      items={best}
      keyOf={(m) => m.id}
      render={(m) => <TitlePoster t={m} width={width} />}
    />
  )
}

type Filter = 'all' | 'in' | 'out'
const ALL = 'all'

/** The department filter's width (the web's w-48). */
const DEPARTMENT_WIDTH = 192

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
    <View role="region" aria-label={t('filmography')} style={{ gap: tokens.space['3'] }}>
      <Text variant="title" role="heading" aria-level={2}>
        {t('filmography')}
      </Text>
      <TableFrame>
        <TableToolbar>
          <Tabs
            aria-label={t('filter')}
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'all', label: t('filter.all'), count: counts.all },
              { value: 'in', label: t('filter.in'), count: counts.in },
              { value: 'out', label: t('filter.out'), count: counts.out },
            ]}
          />
          {departments.length > 1 && (
            <View style={{ marginStart: 'auto', width: DEPARTMENT_WIDTH }}>
              <Select
                aria-label={t('department')}
                value={department}
                onValueChange={(v) => setDepartment(v as Department | typeof ALL)}
                options={[
                  { value: ALL, label: t('department.all') },
                  ...departments.map((d) => ({ value: d, label: tm(`department.${d}`) })),
                ]}
              />
            </View>
          )}
        </TableToolbar>
        {shown.length === 0 ? (
          <View style={{ paddingHorizontal: 14, paddingVertical: tokens.space['8'] }}>
            <Text variant="caption" color="text-3" align="center">
              {t('nothing')}
            </Text>
          </View>
        ) : (
          <Table label={t('filmography')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('title')}</TableHead>
                <TableHead>{t('role')}</TableHead>
                <TableHead width={160}>{t('library')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id}>
                  <TableCell tall>
                    <TitleCell
                      art={r.art.poster ?? ''}
                      title={<TitleLink href={moviePath(r.id)}>{r.title}</TitleLink>}
                      detail={r.year === null ? undefined : String(r.year)}
                    />
                  </TableCell>
                  <TableCell>
                    <Text size={tokens.adminText.ui.size} color="text-2">
                      {roles(r) || '—'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {r.inLibrary ? (
                      <InLibraryLink
                        href={moviePath(r.id)}
                        label={t('inLibrary.label', { title: r.title })}
                        text={t('inLibrary')}
                      />
                    ) : (
                      <Button
                        size="sm"
                        icon="add"
                        onPress={() => onAdd(movie(r))}
                        accessibilityLabel={t('add.label', { title: r.title })}
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
      </TableFrame>
    </View>
  )
}
