'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The add dialog (docs/product/movies.md#discover-a4), ported from the prototype and shared by
// Discover, the movie page, person pages and collections: the folder, both profiles, monitoring,
// minimum availability and Search now. Given several movies (a collection's missing parts), it
// adds each with the same options.
//
// What real data changes:
// - the movie's one version is labelled with its quality profile's name (AddMovieInput.versions);
// - Search now is shown but disabled and off while no indexer is enabled (checkpoint 4 plan,
//   decision 2); with one, adding queues a search (checkpoint 5);
// - the last-used folder, profiles, availability and Search now are remembered per person, as the
//   preference `admin.addMovie.defaults` (movies.md › Decisions; ADR 0027);
// - no folder yet, or no TMDB key, says so and links to where it's fixed.
import type {
  DiscoverMovie,
  MinimumAvailability,
  Movie,
  QualityProfile,
} from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
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
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { addDialog as messages } from './add-dialog-messages.ts'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import {
  type AddForm,
  type AddOptions,
  AVAILABILITY,
  addInput,
  defaultsOf,
  folderLanguageOf,
  initialForm,
  isNoMetadataKey,
  MEDIA_SETTINGS,
  METADATA_SETTINGS,
} from './movie-data.ts'

// for the movie pages that import the dialog
export { isNoMetadataKey, METADATA_SETTINGS } from './movie-data.ts'

export function AddMovieDialog({
  movies,
  onOpenChange,
  onAdded,
}: {
  /** One movie, or several (a collection's missing parts). Empty closes the dialog. */
  movies: DiscoverMovie[]
  onOpenChange: (open: boolean) => void
  /** Instead of the toast's Open: the caller shows the added movie itself. */
  onAdded?: (items: Movie[]) => void
}) {
  const t = useT(messages)
  const router = useRouter()
  const open = movies.length > 0
  const movie = movies.length === 1 ? movies[0] : undefined
  const options = useQuery(
    `add-options:${open}`,
    async (c): Promise<AddOptions | null> => {
      if (!open) return null
      const [folders, quality, language, prefs, indexers] = await Promise.all([
        c.rootFolders.list(),
        c.quality.profiles(),
        c.subtitles.languageProfiles(),
        c.preferences.get(),
        c.indexers.list(),
      ])
      return {
        folders,
        quality,
        language,
        defaults: prefs.values['admin.addMovie.defaults'],
        canSearch: indexers.some((i) => i.enabled),
      }
    },
    ['preferences.updated', 'indexers.updated'],
  )
  // what the person changed; the rest comes from the remembered values
  const [edits, setEdits] = useState<Partial<AddForm>>({})
  const form = options.data ? { ...initialForm(options.data), ...edits } : null
  const set = (patch: Partial<AddForm>) => setEdits((e) => ({ ...e, ...patch }))

  const add = useAction(async (c, f: AddForm, quality: QualityProfile[], ms: DiscoverMovie[]) => {
    const items: Movie[] = []
    // one at a time: adding is idempotent (200 for one already added), so a retry after a failure
    // part-way through picks up where it stopped
    for (const m of ms) items.push(await c.movies.add({ body: addInput(m.id, f, quality) }))
    // remembering is a convenience: a failure here doesn't undo the add
    await c.preferences
      .save({ body: { layer: 'user', values: { 'admin.addMovie.defaults': defaultsOf(f) } } })
      .catch(() => {})
    return items
  })

  const close = (o: boolean) => {
    if (!o) {
      setEdits({})
      add.reset()
    }
    onOpenChange(o)
  }

  const submit = async () => {
    if (!form || !options.data || movies.length === 0) return
    try {
      const items = await add.run(form, options.data.quality, movies)
      close(false)
      const first = items[0]
      const one = movies.length === 1
      toast.success(
        movie ? t('toast.one', { title: movie.title }) : t('toast.many', { count: movies.length }),
        {
          description: form.searchNow
            ? t('toast.searching')
            : form.monitored
              ? t(one ? 'toast.monitored.one' : 'toast.monitored.many')
              : t(one ? 'toast.unmonitored.one' : 'toast.unmonitored.many'),
          action:
            onAdded || !first || !movie
              ? undefined
              : { label: t('toast.open'), onClick: () => router.push(moviePath(first.id)) },
        },
      )
      onAdded?.(items)
    } catch {
      // the error shows in the dialog
    }
  }

  const noFolders = options.data?.folders.length === 0
  const ready = options.status === 'success' && form && !noFolders && form.qualityProfileId !== ''

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="md"
        title={
          movie
            ? movie.year
              ? t('title.one', { title: movie.title, year: movie.year })
              : t('title.oneNoYear', { title: movie.title })
            : movies.length > 1
              ? t('title.many', { count: movies.length })
              : t('title.none')
        }
        description={movie ? t('description.one') : t('description.many')}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              icon="add"
              onClick={submit}
              loading={add.pending}
              disabled={!ready}
            >
              {form?.searchNow ? t('add.search') : t(movie ? 'add.one' : 'add.many')}
            </Button>
          </>
        }
      >
        {open && (
          <div className="grid gap-4">
            {movie ? (
              <p className="line-clamp-3 text-body text-text-2">{movie.synopsis}</p>
            ) : (
              <ul className="grid gap-1 text-body text-text-2">
                {movies.map((m) => (
                  <li key={m.id}>
                    {m.title} {m.year && <span className="font-mono text-text-3">({m.year})</span>}
                  </li>
                ))}
              </ul>
            )}
            <Loadable query={options} what={t('what')}>
              {(o) =>
                o &&
                form && (
                  <div className="grid gap-4 medium:grid-cols-2">
                    <Field
                      label={t('folder')}
                      className="medium:col-span-2"
                      error={
                        noFolders ? (
                          <>
                            {t('folder.none')}{' '}
                            <a href={MEDIA_SETTINGS} className="underline">
                              {t('folder.add')}
                            </a>
                          </>
                        ) : undefined
                      }
                    >
                      <Select
                        value={form.rootFolder || undefined}
                        disabled={noFolders}
                        onValueChange={(rootFolder) => {
                          // a folder with its own default language brings it along (checkpoint 8c)
                          const languageProfileId = folderLanguageOf(
                            o.folders,
                            o.language,
                            rootFolder,
                          )
                          set(
                            languageProfileId ? { rootFolder, languageProfileId } : { rootFolder },
                          )
                        }}
                        options={o.folders.map((f) => ({ value: f.path, label: f.path }))}
                        className="font-mono"
                      />
                    </Field>
                    <Field label={t('qualityProfile')}>
                      <Select
                        value={form.qualityProfileId || undefined}
                        onValueChange={(qualityProfileId) => set({ qualityProfileId })}
                        options={o.quality.map((p) => ({ value: p.id, label: p.name }))}
                      />
                    </Field>
                    <Field label={t('languageProfile')}>
                      <Select
                        value={form.languageProfileId ?? 'none'}
                        onValueChange={(v) => set({ languageProfileId: v === 'none' ? null : v })}
                        options={
                          o.language.length
                            ? o.language.map((p) => ({ value: p.id, label: p.name }))
                            : [{ value: 'none', label: t('languageProfile.none') }]
                        }
                      />
                    </Field>
                    <Field
                      label={t('availability')}
                      hint={t('availability.hint')}
                      className="medium:col-span-2"
                    >
                      <Select
                        value={form.minimumAvailability}
                        onValueChange={(v) =>
                          set({ minimumAvailability: v as MinimumAvailability })
                        }
                        options={AVAILABILITY.map((value) => ({
                          value,
                          label: t(`availability.${value}`),
                        }))}
                      />
                    </Field>
                    <Field
                      inline
                      label={t('monitored')}
                      hint={t('monitored.hint')}
                      className="medium:col-span-2"
                    >
                      <Switch
                        checked={form.monitored}
                        onCheckedChange={(monitored) => set({ monitored })}
                      />
                    </Field>
                    <Field
                      inline
                      label={t('searchNow')}
                      hint={o.canSearch ? t('searchNow.hint') : t('searchNow.noIndexers')}
                      className="medium:col-span-2"
                    >
                      {/* decision 2: shown, disabled and off while no indexer is enabled */}
                      <Checkbox
                        checked={form.searchNow}
                        disabled={!o.canSearch}
                        onCheckedChange={(v) => set({ searchNow: v === true })}
                      />
                    </Field>
                  </div>
                )
              }
            </Loadable>
            {add.error && (
              <p role="alert" className="text-caption text-danger">
                {isNoMetadataKey(add.error) ? (
                  <>
                    {t('noKey')}{' '}
                    <a href={METADATA_SETTINGS} className="underline">
                      {t('noKey.link')}
                    </a>
                  </>
                ) : (
                  add.error.message
                )}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
