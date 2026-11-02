// SPDX-License-Identifier: AGPL-3.0-only
// Add a show (docs/product/shows.md#add-a-show), shared by Discover, the Shows page and person
// pages: the folder, both profiles, which episodes to monitor (Sonarr's Monitor choice), season
// folders and "Start searching for missing episodes". Laid out as Add a movie is.
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
import type { AdminShowDetail, DiscoverShow, ShowMonitor } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { showPath } from '../media/links.ts'

export const monitorOptions: { value: ShowMonitor; label: string; hint: string }[] = [
  { value: 'all', label: 'All episodes', hint: 'Every episode, aired or still to come.' },
  {
    value: 'future',
    label: 'Future episodes',
    hint: 'Only episodes that haven’t aired yet.',
  },
  { value: 'missing', label: 'Missing episodes', hint: 'Episodes without a file.' },
  { value: 'first-season', label: 'First season', hint: 'Season 1 only.' },
  { value: 'none', label: 'None', hint: 'Nothing is grabbed until you monitor a season.' },
]

/** Folders, quality and subtitle profiles, for Add a show and a show's Edit. */
export const useShowOptions = () =>
  useQuery('show-options', async (c) => {
    const [folders, quality, language] = await Promise.all([
      c.shows.rootFolders(),
      c.movies.qualityProfiles(),
      c.movies.languageProfiles(),
    ])
    return { folders, quality, language }
  })

export function AddShowDialog({
  show,
  onOpenChange,
}: {
  /** The show to add; null closes the dialog. */
  show: DiscoverShow | null
  onOpenChange: (open: boolean) => void
}) {
  const [, navigate] = useLocation()
  const options = useShowOptions()
  const [form, setForm] = useState({
    rootFolder: '/data/media/tv',
    qualityProfileId: 'qp-hd',
    languageProfileId: 'lp-en',
    monitor: 'all' as ShowMonitor,
    seasonFolders: true,
    search: true,
  })
  const add = useAction(
    (c, s: DiscoverShow): Promise<AdminShowDetail> =>
      c.shows.add({ tmdbId: s.tmdbId, title: s.title, year: s.year, ...form }),
  )
  // nothing to look for when nothing is monitored
  const searching = form.search && form.monitor !== 'none'

  const submit = async () => {
    if (!show) return
    try {
      const added = await add.run(show)
      onOpenChange(false)
      toast.success(`${show.title} added`, {
        description: searching
          ? 'Searching your indexers for its missing episodes. Follow it in Activity.'
          : form.monitor === 'none'
            ? 'Nothing is monitored yet. Monitor a season on its page.'
            : 'It’s monitored. highsea grabs each episode when a release turns up.',
        action: { label: 'Open', onClick: () => navigate(showPath(added)) },
      })
    } catch {
      // the error shows in the dialog
    }
  }

  return (
    <Dialog open={show !== null} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={show ? `Add ${show.title} (${show.year})` : 'Add a show'}
        description="You can change all of this later on the show’s page."
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
              {searching ? 'Add and search' : 'Add show'}
            </Button>
          </>
        }
      >
        {show && (
          <div className="grid gap-4">
            <p className="line-clamp-3 text-body text-text-2">{show.synopsis}</p>
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
                    label="Monitor"
                    hint={monitorOptions.find((m) => m.value === form.monitor)?.hint}
                    className="medium:col-span-2"
                  >
                    <Select
                      value={form.monitor}
                      onValueChange={(v) => setForm({ ...form, monitor: v as ShowMonitor })}
                      options={monitorOptions.map(({ value, label }) => ({ value, label }))}
                    />
                  </Field>
                  <Field
                    inline
                    label="Season folders"
                    hint="Each season’s files go in a folder of their own, such as Season 01."
                    className="medium:col-span-2"
                  >
                    <Switch
                      checked={form.seasonFolders}
                      onCheckedChange={(seasonFolders) => setForm({ ...form, seasonFolders })}
                    />
                  </Field>
                  <Field
                    inline
                    label="Start searching for missing episodes"
                    hint={
                      form.monitor === 'none'
                        ? 'Nothing is monitored, so there’s nothing to look for yet.'
                        : 'Otherwise the next RSS sync picks up new episodes as they air.'
                    }
                    className="medium:col-span-2"
                  >
                    <Checkbox
                      checked={searching}
                      disabled={form.monitor === 'none'}
                      onCheckedChange={(v) => setForm({ ...form, search: v === true })}
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
