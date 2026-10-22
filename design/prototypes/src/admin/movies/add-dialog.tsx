// SPDX-License-Identifier: AGPL-3.0-only
// The add dialog (docs/product/movies.md#discover-a4), shared by Discover, media pages, person
// pages and collections: the folder, both profiles, monitoring, minimum availability and "Search
// now", which hands the movie to the pipeline. Given several movies, it adds each with the same
// options.
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  Field,
  Select,
  Switch,
  toast,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { DiscoverMovie, MediaItem, MinimumAvailability } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'

const availability: { value: MinimumAvailability; label: string }[] = [
  { value: 'announced', label: 'Announced' },
  { value: 'in-cinemas', label: 'In cinemas' },
  { value: 'released', label: 'Released' },
]

export function AddMovieDialog({
  movies,
  onOpenChange,
  onAdded,
}: {
  /** One movie, or several (a collection's missing parts). Empty closes the dialog. */
  movies: DiscoverMovie[]
  onOpenChange: (open: boolean) => void
  /** Instead of the toast's Open: the caller shows the added movie itself. */
  onAdded?: (items: MediaItem[]) => void
}) {
  const movie = movies.length === 1 ? movies[0] : undefined
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
  const add = useAction(async (c, ms: DiscoverMovie[]) => {
    const items: MediaItem[] = []
    for (const m of ms)
      items.push(await c.movies.add({ tmdbId: m.tmdbId, title: m.title, year: m.year, ...form }))
    return items
  })

  const submit = async () => {
    if (movies.length === 0) return
    try {
      const items = await add.run(movies)
      onOpenChange(false)
      const first = items[0]
      toast.success(movie ? `${movie.title} added` : `${movies.length} movies added`, {
        description: form.searchNow
          ? 'Searching your indexers now. Follow it in Activity.'
          : movie
            ? 'It’s monitored. highsea grabs it when a release turns up.'
            : 'They’re monitored. highsea grabs each one when a release turns up.',
        action:
          onAdded || !first || !movie
            ? undefined
            : { label: 'Open', onClick: () => navigate(`/movies/${first.id}`) },
      })
      onAdded?.(items)
    } catch {
      // the error shows in the dialog
    }
  }

  return (
    <Dialog open={movies.length > 0} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={
          movie
            ? `Add ${movie.title} (${movie.year})`
            : movies.length > 1
              ? `Add ${movies.length} movies`
              : 'Add a movie'
        }
        description={
          movie
            ? 'You can change all of this later on the movie’s page.'
            : 'They’re added with the same options. You can change each one later.'
        }
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
              {form.searchNow ? 'Add and search' : movie ? 'Add movie' : 'Add movies'}
            </Button>
          </>
        }
      >
        {movies.length > 0 && (
          <div className="grid gap-4">
            {movie ? (
              <p className="line-clamp-3 text-body text-text-2">{movie.synopsis}</p>
            ) : (
              <ul className="grid gap-1 text-body text-text-2">
                {movies.map((m) => (
                  <li key={m.id}>
                    {m.title} <span className="font-mono text-text-3">({m.year})</span>
                  </li>
                ))}
              </ul>
            )}
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
