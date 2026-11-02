// SPDX-License-Identifier: AGPL-3.0-only
// A person's page (docs/product/media-pages.md#person-page): portrait, biography, their best-known
// titles, then the filmography marked by library state, with Add for what isn't here yet. Since
// stage 6 their shows follow the films (shows.md#person-page), with Add a show.
import {
  Badge,
  Button,
  CarouselRow,
  EmptyState,
  Poster,
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
import { useLocation, useParams } from 'wouter'
import { useQuery } from '../../mock/hooks.tsx'
import type { DiscoverMovie, DiscoverShow, Person, PersonShowCredit } from '../../mock/types.ts'
import { AddMovieDialog } from '../movies/add-dialog.tsx'
import { AdminPage } from '../shell.tsx'
import { AddShowDialog } from '../shows/add-dialog.tsx'
import { movieHref, showHref } from './links.ts'
import { longDate, SummarySkeleton, titleItem } from './sections.tsx'

const departmentLabel = {
  Acting: 'Acting',
  Directing: 'Directing',
  Writing: 'Writing',
  Production: 'Production',
  Sound: 'Music',
  Camera: 'Cinematography',
  Editing: 'Editing',
} as const

export function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const person = useQuery(`person:${id}`, (c) => c.metadata.person(id), [
    'movies.updated',
    'shows.updated',
  ])
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const [addingShow, setAddingShow] = useState<DiscoverShow | null>(null)
  const p = person.data

  return (
    <AdminPage title={p?.name ?? 'Person'}>
      {person.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="user"
          title={person.error.message}
          action={<Button onClick={() => navigate('/discover')}>Go to Discover</Button>}
        >
          They may have been merged with another entry.
        </EmptyState>
      ) : !p ? (
        <SummarySkeleton />
      ) : (
        <>
          <Summary person={p} />
          <KnownFor person={p} />
          {(p.credits.length > 0 || !p.shows?.length) && (
            <Filmography person={p} onAdd={(m) => setAdding([m])} />
          )}
          {p.shows && p.shows.length > 0 && <Shows shows={p.shows} onAdd={setAddingShow} />}
        </>
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
      <AddShowDialog show={addingShow} onOpenChange={(o) => !o && setAddingShow(null)} />
    </AdminPage>
  )
}

function Summary({ person: p }: { person: Person }) {
  const titles = p.credits.length + (p.shows?.length ?? 0)
  return (
    <section
      aria-label="Summary"
      className="grid gap-5 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[9rem_minmax(0,1fr)] medium:p-5"
    >
      <Poster title={p.name} src={p.photo} className="w-32 medium:w-full" />
      <div className="grid grid-cols-1 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" dot={false}>
            {departmentLabel[p.knownFor]}
          </Badge>
          <span className="text-caption text-text-3">
            {titles} {titles === 1 ? 'title' : 'titles'}
          </span>
        </div>
        {(p.born || p.died) && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-caption">
            {p.born && (
              <>
                <dt className="text-text-3">Born</dt>
                <dd className="text-text-2">
                  {longDate(p.born.date)}, {p.born.place}
                </dd>
              </>
            )}
            {p.died && (
              <>
                <dt className="text-text-3">Died</dt>
                <dd className="text-text-2">
                  {longDate(p.died.date)}, {p.died.place}
                </dd>
              </>
            )}
          </dl>
        )}
        <p className="max-w-[65ch] text-body text-text-2">
          {p.bio ?? `TMDB has no biography for ${p.name} yet.`}
        </p>
      </div>
    </section>
  )
}

/**
 * Their most-rated titles, films and shows together. Left out when there are few enough to read
 * at a glance. A show not in the library has no admin page yet, so its poster doesn't link.
 */
function KnownFor({ person: p }: { person: Person }) {
  const titles = [
    ...p.credits.map((t) => ({ ...t, href: movieHref(t) as string | undefined })),
    ...(p.shows ?? []).map((t) => ({ ...t, href: t.inLibrary ? showHref(t) : undefined })),
  ]
  if (titles.length < 3) return null
  const best = titles.sort((a, b) => b.rating - a.rating).slice(0, 8)
  return (
    <CarouselRow flush title="Known for" itemClassName={titleItem}>
      {best.map((t) => (
        <Poster
          key={t.id}
          title={t.title}
          src={t.art.poster}
          href={t.href}
          showTitle
          caption={t.year}
          status={
            t.inLibrary && (
              <Badge overlay tone="success">
                In library
              </Badge>
            )
          }
        />
      ))}
    </CarouselRow>
  )
}

type Filter = 'all' | 'in' | 'out'

function Filmography({
  person: p,
  onAdd,
}: {
  person: Person
  onAdd: (movie: DiscoverMovie) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const counts = {
    all: p.credits.length,
    in: p.credits.filter((c) => c.inLibrary).length,
    out: p.credits.filter((c) => !c.inLibrary).length,
  }
  const shown = p.credits.filter((c) =>
    filter === 'all' ? true : filter === 'in' ? c.inLibrary : !c.inLibrary,
  )
  return (
    <section aria-labelledby="filmography" className="grid gap-3">
      <h2 id="filmography" className="text-title text-text">
        Filmography
      </h2>
      <TableFrame>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TableToolbar>
            <TabsList aria-label="Filter the filmography" className="max-w-full overflow-x-auto">
              <TabsTrigger value="all" count={counts.all}>
                All
              </TabsTrigger>
              <TabsTrigger value="in" count={counts.in}>
                In the library
              </TabsTrigger>
              <TabsTrigger value="out" count={counts.out}>
                Not in the library
              </TabsTrigger>
            </TabsList>
          </TableToolbar>
          <TabsContent value={filter}>
            {shown.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-caption text-text-3">Nothing here yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-40">Library</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((c) => (
                    <TableRow key={c.id}>
                      <TitleCell
                        art={c.art.poster}
                        title={
                          <a href={movieHref(c)} className="hover:underline">
                            {c.title}
                          </a>
                        }
                        detail={String(c.year)}
                      />
                      <TableCell className="text-text-2">{c.role}</TableCell>
                      <TableCell>
                        {c.inLibrary ? (
                          <a href={movieHref(c)} aria-label={`In library: ${c.title}`}>
                            <Badge tone="success">In library</Badge>
                          </a>
                        ) : (
                          <Button
                            size="sm"
                            icon="add"
                            onClick={() => onAdd(c)}
                            aria-label={`Add ${c.title}`}
                          >
                            Add
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

/** Their shows, newest first, marked by library state, with Add a show for the rest. */
function Shows({
  shows,
  onAdd,
}: {
  shows: PersonShowCredit[]
  onAdd: (show: DiscoverShow) => void
}) {
  return (
    <section aria-labelledby="shows" className="grid gap-3">
      <h2 id="shows" className="text-title text-text">
        Shows
      </h2>
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-40">Library</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shows.map((c) => (
              <TableRow key={c.id}>
                <TitleCell
                  art={c.art.poster}
                  title={
                    c.inLibrary ? (
                      <a href={showHref(c)} className="hover:underline">
                        {c.title}
                      </a>
                    ) : (
                      c.title
                    )
                  }
                  detail={c.endYear ? `${c.year}–${c.endYear}` : `${c.year}–`}
                />
                <TableCell className="text-text-2">{c.role}</TableCell>
                <TableCell>
                  {c.inLibrary ? (
                    <a href={showHref(c)} aria-label={`In library: ${c.title}`}>
                      <Badge tone="success">In library</Badge>
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      icon="add"
                      onClick={() => onAdd(c)}
                      aria-label={`Add ${c.title}`}
                    >
                      Add
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </section>
  )
}
