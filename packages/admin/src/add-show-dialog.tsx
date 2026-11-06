'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Add a show (docs/product/shows.md#add-a-show), moved from the prototype with D3 of the one client
// platform (one-client-platform-d.md, answer 5) and laid out as Add a movie is (add-dialog.tsx):
// the folder, both profiles, which episodes to monitor (Sonarr's Monitor choice), season folders
// and "Start searching for missing episodes". On the drafted `series` routes, which the mock
// answers and the server answers 501 until it has shows.
import type { DiscoverSeries, ShowMonitor } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Select,
  Switch,
  Text,
  toast,
  tokens,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { Loadable } from './loadable.tsx'
import { useRouter } from './navigation.tsx'
import { MONITOR_OPTIONS, showPath } from './show-data.ts'
import { shows as messages } from './shows-messages.ts'

/** Folders, quality and subtitle profiles, for Add a show and a show's Edit. */
export const useShowOptions = (enabled = true) =>
  useQuery(`show-options:${enabled}`, async (c) => {
    if (!enabled) return null
    const [folders, quality, language] = await Promise.all([
      c.series.rootFolders(),
      c.quality.profiles(),
      c.subtitles.languageProfiles(),
    ])
    return { folders, quality, language }
  })

const INITIAL = {
  rootFolder: '/data/media/tv',
  qualityProfileId: 'qp-hd',
  languageProfileId: 'lp-en',
  monitor: 'all' as ShowMonitor,
  seasonFolders: true,
  search: true,
}

export function AddShowDialog({
  show,
  onOpenChange,
}: {
  /** The show to add; null closes the dialog. */
  show: DiscoverSeries | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useT(messages)
  const router = useRouter()
  const options = useShowOptions(show !== null)
  const [form, setForm] = useState(INITIAL)
  const add = useAction((c, s: DiscoverSeries) =>
    c.series.add({ body: { tmdbId: s.tmdbId, title: s.title, year: s.year, ...form } }),
  )
  // nothing to look for when nothing is monitored
  const searching = form.search && form.monitor !== 'none'
  const two = useWindowAtLeast(breakpoints.medium)

  const close = (o: boolean) => {
    if (!o) add.reset()
    onOpenChange(o)
  }

  const submit = async () => {
    if (!show) return
    try {
      const added = await add.run(show)
      close(false)
      toast.success(t('added.title', { title: show.title }), {
        description: searching
          ? t('added.searching')
          : form.monitor === 'none'
            ? t('added.none')
            : t('added.monitored'),
        action: { label: t('added.open'), onClick: () => router.push(showPath(added.id)) },
      })
    } catch {
      // the error shows in the dialog
    }
  }

  return (
    <Dialog
      open={show !== null}
      onClose={() => close(false)}
      closable
      size="md"
      title={show ? t('add.title', { title: show.title, year: show.year }) : t('add.titleNone')}
      description={t('add.body')}
      footer={
        <>
          <Button variant="ghost" onPress={() => close(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            icon="add"
            onPress={submit}
            loading={add.pending}
            disabled={options.status !== 'success'}
          >
            {searching ? t('add.submitSearch') : t('add.submit')}
          </Button>
        </>
      }
    >
      {show && (
        <View style={{ gap: tokens.space['4'] }}>
          <Text variant="body" color="text-2" numberOfLines={3}>
            {show.synopsis}
          </Text>
          <Loadable query={options} what={t('edit.what')}>
            {(o) =>
              o && (
                <View style={{ gap: tokens.space['4'] }}>
                  <Field label={t('folder')}>
                    <Select
                      value={form.rootFolder}
                      onValueChange={(rootFolder) => setForm({ ...form, rootFolder })}
                      options={o.folders.map((f) => ({ value: f, label: f }))}
                    />
                  </Field>
                  <View style={{ flexDirection: two ? 'row' : 'column', gap: tokens.space['4'] }}>
                    <View style={two ? HALF : undefined}>
                      <Field label={t('qualityProfile')}>
                        <Select
                          value={form.qualityProfileId}
                          onValueChange={(qualityProfileId) =>
                            setForm({ ...form, qualityProfileId })
                          }
                          options={o.quality.map((p) => ({ value: p.id, label: p.name }))}
                        />
                      </Field>
                    </View>
                    <View style={two ? HALF : undefined}>
                      <Field label={t('subtitleLanguages')}>
                        <Select
                          value={form.languageProfileId}
                          onValueChange={(languageProfileId) =>
                            setForm({ ...form, languageProfileId })
                          }
                          options={o.language.map((p) => ({ value: p.id, label: p.name }))}
                        />
                      </Field>
                    </View>
                  </View>
                  <Field label={t('monitor.label')} hint={t(`monitor.${form.monitor}.hint`)}>
                    <Select
                      value={form.monitor}
                      onValueChange={(v) => setForm({ ...form, monitor: v as ShowMonitor })}
                      options={MONITOR_OPTIONS.map((value) => ({
                        value,
                        label: t(`monitor.${value}`),
                      }))}
                    />
                  </Field>
                  <Switch
                    label={t('seasonFolders')}
                    hint={t('seasonFolders.hint')}
                    checked={form.seasonFolders}
                    onCheckedChange={(seasonFolders) => setForm({ ...form, seasonFolders })}
                  />
                  <Checkbox
                    label={t('searchNow')}
                    hint={form.monitor === 'none' ? t('searchNow.none') : t('searchNow.hint')}
                    checked={searching}
                    disabled={form.monitor === 'none'}
                    onCheckedChange={(search) => setForm({ ...form, search })}
                  />
                </View>
              )
            }
          </Loadable>
          {add.error && (
            <View role="alert">
              <Text variant="caption" color="badge-danger">
                {add.error.message}
              </Text>
            </View>
          )}
        </View>
      )}
    </Dialog>
  )
}

/** Two fields side by side from medium up (the web's medium:grid-cols-2). */
const HALF = { flex: 1, flexBasis: 0, minWidth: 0 } as const
