// SPDX-License-Identifier: AGPL-3.0-only
// A4 Discover → add movie (docs/product/movies.md#discover). Trending from the metadata source
// until you type, then instant results. Adding opens one dialog with the folder, both profiles,
// monitoring, minimum availability and "Search now", which hands the movie to the pipeline.
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Poster,
  Rating,
  Select,
  Switch,
  toast,
} from '@highsea/ui-web'
import { useDeferredValue, useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { DiscoverMovie, MinimumAvailability } from '../../mock/types.ts'
import { Loadable, PosterSkeletons } from '../loadable.tsx'
import { isStaff } from '../nav.ts'
import { AdminPage, adminHref, useShell } from '../shell.tsx'

const availability: { value: MinimumAvailability; label: string }[] = [
  { value: 'announced', label: 'Announced' },
  { value: 'in-cinemas', label: 'In cinemas' },
  { value: 'released', label: 'Released' },
]

/** The library id a discover result maps to, for the "In library" link. */
const libraryId = (m: DiscoverMovie) => m.id.replace(/^disc-lib-/, '')

export function Discover() {
  const { role } = useShell()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query.trim())
  const results = useQuery(`discover:${deferred}`, (c) => c.movies.discover(deferred), [
    'movies.updated',
  ])
  const [adding, setAdding] = useState<DiscoverMovie | null>(null)

  return (
    <AdminPage
      title="Discover"
      description="Find a movie and add it. highsea searches your indexers and takes it from there."
    >
      <div className="grid max-w-xl gap-1.5">
        <Input
          type="search"
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, year or genre"
          aria-label="Search for a movie"
          spellCheck={false}
        />
      </div>
      <h2 className="text-title text-text">
        {deferred ? `Results for “${deferred}”` : 'Trending this week'}
      </h2>
      <Loadable query={results} what="results" skeleton={<PosterSkeletons />}>
        {(movies) =>
          movies.length === 0 ? (
            deferred ? (
              <EmptyState icon="search" title={`Nothing matches “${deferred}”`}>
                Try the original title, or just the year.
              </EmptyState>
            ) : (
              <EmptyState icon="discover" title="Nothing trending right now">
                The metadata source didn’t return anything. Search for a title instead.
              </EmptyState>
            )
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-5">
              {movies.map((m) => (
                <li key={m.id} className="grid content-start gap-2">
                  <Poster title={`${m.title} (${m.year})`} src={m.art.poster} />
                  <div className="grid gap-0.5">
                    <span className="line-clamp-2 text-text text-ui">{m.title}</span>
                    <span className="flex items-center gap-2 text-caption text-text-3">
                      {m.year}
                      {m.rating > 0 && <Rating value={m.rating} size={11} />}
                    </span>
                  </div>
                  {m.inLibrary ? (
                    <a
                      href={adminHref(`/movies/${libraryId(m)}`)}
                      className="justify-self-start"
                      aria-label={`${m.title}: in the library`}
                    >
                      <Badge tone="success">In library</Badge>
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      icon="add"
                      onClick={() => setAdding(m)}
                      disabled={!isStaff(role)}
                      aria-label={`Add ${m.title}`}
                      className="justify-self-start"
                    >
                      Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </Loadable>
      {!isStaff(role) && results.status === 'success' && (
        <p className="text-caption text-text-3">
          Only owners and admins can add movies. Ask the server’s owner for one you want.
        </p>
      )}
      <AddMovieDialog movie={adding} onOpenChange={(o) => !o && setAdding(null)} />
    </AdminPage>
  )
}

export function AddMovieDialog({
  movie,
  onOpenChange,
}: {
  movie: DiscoverMovie | null
  onOpenChange: (open: boolean) => void
}) {
  const [, navigate] = useLocation()
  const options = useQuery('add-options', async (c) => {
    const [folders, quality, language] = await Promise.all([
      c.movies.rootFolders(),
      c.movies.qualityProfiles(),
      c.movies.languageProfiles(),
    ])
    return { folders, quality, language }
  })
  const [form, setForm] = useState({
    rootFolder: '/data/media/movies',
    qualityProfileId: 'qp-hd',
    languageProfileId: 'lp-en',
    monitored: true,
    minimumAvailability: 'released' as MinimumAvailability,
    searchNow: true,
  })
  const add = useAction((c, m: DiscoverMovie) =>
    c.movies.add({ tmdbId: m.tmdbId, title: m.title, year: m.year, ...form }),
  )

  const submit = async () => {
    if (!movie) return
    try {
      const item = await add.run(movie)
      onOpenChange(false)
      toast.success(`${movie.title} added`, {
        description: form.searchNow
          ? 'Searching your indexers now. Follow it in Activity.'
          : 'It’s monitored. highsea grabs it when a release turns up.',
        action: { label: 'Open', onClick: () => navigate(`/movies/${item.id}`) },
      })
    } catch {
      // the error shows in the dialog
    }
  }

  return (
    <Dialog open={!!movie} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={movie ? `Add ${movie.title} (${movie.year})` : 'Add a movie'}
        description="You can change all of this later on the movie’s page."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="add"
              onClick={submit}
              loading={add.pending}
              disabled={options.status !== 'success'}
            >
              {form.searchNow ? 'Add and search' : 'Add movie'}
            </Button>
          </>
        }
      >
        {movie && (
          <div className="grid gap-4">
            <p className="line-clamp-3 text-body text-text-2">{movie.synopsis}</p>
            <Loadable query={options} what="the profiles">
              {(o) => (
                <div className="grid gap-4 medium:grid-cols-2">
                  <Field label="Folder" className="medium:col-span-2">
                    <Select
                      value={form.rootFolder}
                      onValueChange={(rootFolder) => setForm({ ...form, rootFolder })}
                      options={o.folders.map((f) => ({ value: f, label: f }))}
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Quality profile">
                    <Select
                      value={form.qualityProfileId}
                      onValueChange={(qualityProfileId) => setForm({ ...form, qualityProfileId })}
                      options={o.quality.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </Field>
                  <Field label="Subtitle languages">
                    <Select
                      value={form.languageProfileId}
                      onValueChange={(languageProfileId) => setForm({ ...form, languageProfileId })}
                      options={o.language.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </Field>
                  <Field
                    label="Minimum availability"
                    hint="Don’t grab before this. Released avoids cam copies."
                    className="medium:col-span-2"
                  >
                    <Select
                      value={form.minimumAvailability}
                      onValueChange={(v) =>
                        setForm({ ...form, minimumAvailability: v as MinimumAvailability })
                      }
                      options={availability}
                    />
                  </Field>
                  <Field
                    inline
                    label="Monitored"
                    hint="Grab it when a release turns up, and upgrade it until the profile’s cutoff."
                    className="medium:col-span-2"
                  >
                    <Switch
                      checked={form.monitored}
                      onCheckedChange={(monitored) => setForm({ ...form, monitored })}
                    />
                  </Field>
                  <Field
                    inline
                    label="Search now"
                    hint="Otherwise the next RSS sync picks it up."
                    className="medium:col-span-2"
                  >
                    <Checkbox
                      checked={form.searchNow}
                      onCheckedChange={(v) => setForm({ ...form, searchNow: v === true })}
                    />
                  </Field>
                </div>
              )}
            </Loadable>
            {add.error && (
              <p role="alert" className="text-caption text-danger">
                {add.error.message}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
