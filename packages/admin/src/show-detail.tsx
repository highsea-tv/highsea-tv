'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A show's page (docs/product/shows.md#show-page), moved from the prototype with D3 of the one
// client platform (one-client-platform-d.md, answer 5) and laid out as a movie's is: the summary
// with the path and Monitored, then tabs. Seasons is Sonarr's series page: each season with its
// monitor switch, its episode count and Search, and each episode with its own switch, number,
// title, air date, state, file and Search. Files lists every file once, a double episode's file
// noted. Search, Edit, and More (Refresh metadata, Remove) are in the header.
//
// Drawn only when the server serves shows (`Served`, serves.tsx), on the drafted `series` routes
// the mock answers and the server answers 501.
import type {
  SeriesDetail,
  SeriesEpisode,
  SeriesSeason,
  SeriesUpdate,
} from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Menu,
  ProgressBar,
  QualityTag,
  Select,
  Switch,
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
  Tooltip,
  toast,
  tokens,
} from '@highsea-tv/ui/native'
import { type ComponentRef, type ReactNode, useRef, useState } from 'react'
import { View } from 'react-native'
import { useShowOptions } from './add-show-dialog.tsx'
import { FormError } from './collections-rules.tsx'
import { Loadable } from './loadable.tsx'
import { MediaSummary, SummarySkeleton } from './media-sections.tsx'
import { useRouter } from './navigation.tsx'
import { Served } from './serves.tsx'
import { AdminPage } from './shell.tsx'
import {
  airDate,
  basename,
  dirname,
  episodeCode,
  episodeStatus,
  SHOW_TABS,
  type ShowTab,
  seasonFigures,
  showPath,
  showState,
  wanted,
} from './show-data.ts'
import { SHOWS_TOPICS } from './shows-library.tsx'
import { shows as messages } from './shows-messages.ts'
import { useTabAddress } from './tabs.ts'

const s = tokens.space
const FIGURE = tokens.adminText.figure
type Scope = { season?: number; episode?: string }

/** `/shows/{id}`, Files at `/shows/{id}/files`. */
export function ShowDetail({ id, tab = 'seasons' }: { id: string; tab?: ShowTab }) {
  return (
    <Served source="shows">
      <Page id={id} tab={SHOW_TABS.includes(tab) ? tab : 'seasons'} />
    </Served>
  )
}

function Page({ id, tab }: { id: string; tab: ShowTab }) {
  const t = useT(messages)
  const router = useRouter()
  const show = useQuery(`admin-show:${id}`, (c) => c.series.get({ params: { id } }), SHOWS_TOPICS)
  const profiles = useQuery('quality-profiles', (c) => c.quality.profiles())
  const setTab = useTabAddress<ShowTab>(showPath(id), 'seasons')
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [menu, setMenu] = useState(false)
  const more = useRef<ComponentRef<typeof View>>(null)

  const edit = useAction((c, body: SeriesUpdate) => c.series.update({ params: { id }, body }))
  const search = useAction((c, body: Scope) => c.series.search({ params: { id }, body }))
  const monitorSeason = useAction((c, season: number, monitored: boolean) =>
    c.series.monitorSeason({ params: { id, season }, body: { monitored } }),
  )
  const monitorEpisode = useAction((c, episodeId: string, monitored: boolean) =>
    c.series.monitorEpisode({ params: { id, episodeId }, body: { monitored } }),
  )
  const remove = useAction((c, files: boolean) =>
    c.series.remove({ params: { id }, query: { deleteFiles: files ? 'true' : 'false' } }),
  )

  const sh = show.data
  const fail = (title: string) => (e: Error) => toast.error(title, { description: e.message })

  /** Search for the show, a season or an episode, and say what it found to look for. */
  const look = (scope: Scope, what: string) =>
    search.run(scope).then(
      (r) =>
        r.found > 0
          ? toast({
              title: t('searching.title', { what }),
              description: t('searching.body', { count: r.found }),
            })
          : toast({ title: t('nothing.title', { what }), description: t('nothing.body') }),
      fail(t('searchFailed')),
    )

  const actions = sh ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
      <Button
        variant="primary"
        icon="search"
        loading={search.pending}
        disabled={!sh.monitored || !sh.seasonList.some((x) => x.episodes.some(wanted))}
        onPress={() => look({}, sh.title)}
      >
        {t('search')}
      </Button>
      <Button icon="edit" onPress={() => setEditing(true)}>
        {t('edit')}
      </Button>
      <Button
        ref={more}
        variant="ghost"
        iconOnly
        icon="more"
        accessibilityLabel={t('moreActions')}
        hasPopup="menu"
        accessibilityState={{ expanded: menu }}
        onPress={() => setMenu(true)}
      />
      <Menu
        title={t('moreActions')}
        open={menu}
        onClose={() => setMenu(false)}
        anchor={more}
        items={[
          {
            label: t('refresh'),
            icon: 'refresh',
            onSelect: () => toast({ title: t('refreshed') }),
          },
          { label: t('removeFromLibrary'), icon: 'delete', onSelect: () => setRemoving(true) },
        ]}
      />
    </View>
  ) : undefined

  const profileName = (pid: string) => profiles.data?.find((p) => p.id === pid)?.name ?? pid
  const closeRemove = () => {
    setRemoving(false)
    setDeleteFiles(false)
  }

  return (
    <AdminPage title={sh?.title ?? t('show')} actions={actions}>
      {show.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="tv"
          title={show.error.message}
          action={<Button href="/shows">{t('missing.go')}</Button>}
        >
          {t('missing.body')}
        </EmptyState>
      ) : !sh ? (
        <SummarySkeleton />
      ) : (
        <>
          <Summary
            show={sh}
            profile={profileName(sh.qualityProfileId)}
            onMonitor={(monitored) => edit.run({ monitored }).catch(fail(t('saveFailed')))}
          />
          <View>
            <Tabs<ShowTab>
              variant="line"
              aria-label={t('sections')}
              value={tab}
              onValueChange={setTab}
              options={SHOW_TABS.map((value) => ({ value, label: t(`tab.${value}`) }))}
            />
            <View
              role="tabpanel"
              aria-label={t(`tab.${tab}`)}
              style={{ paddingTop: s['5'], gap: s['4'], minWidth: 0 }}
            >
              {tab === 'seasons' ? (
                <Seasons
                  show={sh}
                  searching={search.pending}
                  onSearch={look}
                  onMonitorSeason={(n, on) => monitorSeason.run(n, on).catch(fail(t('saveFailed')))}
                  onMonitorEpisode={(e, on) =>
                    monitorEpisode.run(e, on).catch(fail(t('saveFailed')))
                  }
                />
              ) : (
                <Files show={sh} />
              )}
            </View>
          </View>
        </>
      )}
      {sh && editing && <EditShowDialog show={sh} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={removing}
        onClose={closeRemove}
        title={t('remove.title', { title: sh?.title ?? t('remove.this') })}
        description={
          <View style={{ gap: s['3'] }}>
            <Text
              size={tokens.adminText.form.size}
              leading={tokens.adminText.form.leading}
              color="text-2"
            >
              {t('remove.body')}
            </Text>
            <Checkbox
              label={t('remove.files')}
              checked={deleteFiles}
              onCheckedChange={setDeleteFiles}
            />
          </View>
        }
        confirmLabel={t('remove')}
        destructive
        onConfirm={() =>
          remove.run(deleteFiles).then(
            () => {
              toast.success(t('removed', { title: sh?.title ?? '' }))
              router.push('/shows')
            },
            fail(t('removeFailed')),
          )
        }
      />
    </AdminPage>
  )
}

// ---------------------------------------------------------------- summary

/** A run of caption-sized parts with a dot between each (the prototype's summary line). */
function Line({ children }: { children: ReactNode[] }) {
  const parts = children.filter(Boolean)
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: s['2'] }}
    >
      {parts.flatMap((p, i) =>
        i === 0
          ? [p]
          : [
              // biome-ignore lint/suspicious/noArrayIndexKey: the dots sit between fixed parts
              <Text key={`dot-${i}`} variant="caption" color="text-2" aria-hidden>
                ·
              </Text>,
              p,
            ],
      )}
    </View>
  )
}

function Summary({
  show: sh,
  profile,
  onMonitor,
}: {
  show: SeriesDetail
  profile: string
  onMonitor: (on: boolean) => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const state = showState(sh)
  return (
    <MediaSummary
      item={sh}
      badges={
        <>
          <Badge tone={state.tone}>{t(state.label)}</Badge>
          <QualityTag overlay={false}>{profile}</QualityTag>
        </>
      }
    >
      <Line>
        {[
          sh.endYear ? (
            <Text key="years" variant="caption" color="text-2" mono>
              {t('years', { from: sh.year, to: sh.endYear })}
            </Text>
          ) : null,
          sh.network ? (
            <Text key="network" variant="caption" color="text-2">
              {sh.network}
            </Text>
          ) : null,
          <Text key="seasons" variant="caption" color="text-2">
            {t('seasons', { count: sh.seasons })}
          </Text>,
          <Text key="episodes" variant="caption" color="text-2">
            <Text variant="caption" color="text-2" mono>
              {t('episodesLine', sh.episodes)}
            </Text>
            {` ${t('episodes.word')}`}
          </Text>,
          <Text key="size" variant="caption" color="text-2" mono>
            {bytes(sh.size)}
          </Text>,
        ]}
      </Line>
      {sh.nextAiring && (
        <Text variant="caption" color="text-2">
          {t('next', {
            code: sh.nextAiring.code,
            title: sh.nextAiring.title,
            date: airDate(sh.nextAiring.aired, locale),
          })}
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: s['6'],
          rowGap: s['2'],
        }}
      >
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant="caption" color="text-3" mono style={{ wordBreak: 'break-all' } as object}>
            {sh.path}
          </Text>
        </View>
        <View>
          <Switch label={t('monitored')} checked={sh.monitored} onCheckedChange={onMonitor} />
        </View>
      </View>
    </MediaSummary>
  )
}

// ---------------------------------------------------------------- seasons

function Seasons({
  show: sh,
  searching,
  onSearch,
  onMonitorSeason,
  onMonitorEpisode,
}: {
  show: SeriesDetail
  searching: boolean
  onSearch: (scope: Scope, what: string) => void
  onMonitorSeason: (season: number, on: boolean) => void
  onMonitorEpisode: (episode: string, on: boolean) => void
}) {
  const t = useT(messages)
  // the latest season starts open, as Sonarr's page does; the rest one press away
  const latest = Math.max(0, ...sh.seasonList.map((x) => x.number))
  const [open, setOpen] = useState<Set<number>>(() => new Set([latest]))
  const toggle = (n: number) => {
    const next = new Set(open)
    if (next.has(n)) next.delete(n)
    else next.add(n)
    setOpen(next)
  }
  if (sh.seasonList.length === 0)
    return (
      <EmptyState icon="tv" title={t('noSeasons.title')}>
        {t('noSeasons.body')}
      </EmptyState>
    )
  return sh.seasonList.map((season) => (
    <SeasonSection
      key={season.number}
      show={sh}
      season={season}
      open={open.has(season.number)}
      onToggle={() => toggle(season.number)}
      searching={searching}
      onSearch={onSearch}
      onMonitor={(on) => onMonitorSeason(season.number, on)}
      onMonitorEpisode={onMonitorEpisode}
    />
  ))
}

function SeasonSection({
  show: sh,
  season,
  open,
  onToggle,
  searching,
  onSearch,
  onMonitor,
  onMonitorEpisode,
}: {
  show: SeriesDetail
  season: SeriesSeason
  open: boolean
  onToggle: () => void
  searching: boolean
  onSearch: (scope: Scope, what: string) => void
  onMonitor: (on: boolean) => void
  onMonitorEpisode: (episode: string, on: boolean) => void
}) {
  const t = useT(messages)
  const f = seasonFigures(season)
  const episodes = [...season.episodes].sort((a, b) => a.number - b.number)
  const what = t('what.season', { show: sh.title, season: season.title })
  return (
    <View role="region" aria-label={season.title}>
      <TableFrame>
        <TableToolbar>
          <View role="heading" aria-level={3} style={{ minWidth: 0, flexShrink: 1 }}>
            {/* the season's title opens and closes its episodes; the chevron says which */}
            <Button
              variant="ghost"
              size="sm"
              icon={open ? 'chevron-down' : 'chevron-right'}
              accessibilityState={{ expanded: open }}
              onPress={onToggle}
            >
              {season.title}
            </Button>
          </View>
          <Text
            size={FIGURE.size}
            leading={FIGURE.leading}
            mono
            color="text-3"
            accessibilityLabel={t('season.figures', { ...f, size: bytes(f.size) })}
          >
            {`${t('episodesLine', f)} · ${bytes(f.size)}`}
          </Text>
          <View
            style={{
              marginStart: 'auto',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: s['3'],
            }}
          >
            {/* its name is Monitored inside the season's region, as the prototype's was */}
            <Switch label={t('monitored')} checked={season.monitored} onCheckedChange={onMonitor} />
            <Button
              size="sm"
              icon="search"
              accessibilityLabel={t('season.search', { season: season.title })}
              disabled={searching || !sh.monitored || !season.episodes.some(wanted)}
              onPress={() => onSearch({ season: season.number }, what)}
            >
              {t('search')}
            </Button>
          </View>
        </TableToolbar>
        {open &&
          (episodes.length === 0 ? (
            <View style={{ paddingHorizontal: CELL_X, paddingVertical: s['8'] }}>
              <Text variant="caption" color="text-3" align="center">
                {t('noEpisodes')}
              </Text>
            </View>
          ) : (
            <Table label={t('episodes.table', { season: season.title })}>
              <TableHeader>
                <TableRow>
                  <TableHead width={56} hidden>
                    {t('monitored')}
                  </TableHead>
                  <TableHead numeric width={40}>
                    {t('col.number')}
                  </TableHead>
                  <TableHead>{t('col.title')}</TableHead>
                  <TableHead>{t('col.aired')}</TableHead>
                  <TableHead>{t('col.status')}</TableHead>
                  <TableHead>{t('col.file')}</TableHead>
                  <TableHead width={48} hidden>
                    {t('col.search')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {episodes.map((e) => (
                  <EpisodeRow
                    key={e.id}
                    episode={e}
                    searching={searching}
                    onMonitor={(on) => onMonitorEpisode(e.id, on)}
                    onSearch={() =>
                      onSearch(
                        { episode: e.id },
                        t('what.episode', {
                          show: sh.title,
                          code: episodeCode(e.season, [e.number]),
                        }),
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          ))}
      </TableFrame>
    </View>
  )
}

function EpisodeRow({
  episode: e,
  searching,
  onMonitor,
  onSearch,
}: {
  episode: SeriesEpisode
  searching: boolean
  onMonitor: (on: boolean) => void
  onSearch: () => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const st = episodeStatus[e.status]
  const label = `${episodeCode(e.season, [e.number])} ${e.title}`
  return (
    <TableRow>
      <TableCell>
        <Switch
          label={t('episode.monitor', { label })}
          hideLabel
          checked={e.monitored}
          onCheckedChange={onMonitor}
        />
      </TableCell>
      <TableCell numeric>{String(e.number)}</TableCell>
      <TableCell>
        <Text size={tokens.adminText.ui.size} color={e.monitored ? 'text' : 'text-3'}>
          {e.title}
        </Text>
      </TableCell>
      <TableCell>
        <Text size={tokens.adminText.ui.size} color={e.monitored ? 'text-2' : 'text-3'}>
          {airDate(e.aired, locale)}
        </Text>
      </TableCell>
      <TableCell>
        <View style={{ gap: s['1'], minWidth: 96, alignItems: 'flex-start' }}>
          <Badge tone={st.tone}>{t(st.label)}</Badge>
          {e.status === 'downloading' && (
            <View style={{ alignSelf: 'stretch' }}>
              <ProgressBar
                value={e.progress ?? 0}
                look="panel"
                label={t('episode.progress', { label })}
              />
            </View>
          )}
        </View>
      </TableCell>
      <TableCell maxWidth={320}>
        <EpisodeFile episode={e} />
      </TableCell>
      <TableCell align="end">
        <Tooltip content={t('episode.searchHint')}>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon="search"
            accessibilityLabel={t('episode.search', { label })}
            disabled={searching || !wanted(e)}
            onPress={onSearch}
          />
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

function EpisodeFile({ episode: e }: { episode: SeriesEpisode }) {
  const t = useT(messages)
  const f = e.file
  if (!f)
    return (
      <Text size={tokens.adminText.ui.size} color="text-3">
        {t('none')}
      </Text>
    )
  return (
    <View style={{ gap: s['0.5'], minWidth: 0 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}>
        <QualityTag overlay={false}>{f.quality}</QualityTag>
        <Text size={FIGURE.size} leading={FIGURE.leading} mono color="text-2">
          {bytes(f.size)}
        </Text>
        {f.releaseGroup && (
          <Text variant="caption" color="text-3">
            {f.releaseGroup}
          </Text>
        )}
      </View>
      <Text
        size={tokens.adminText.release.size}
        leading={tokens.adminText.release.leading}
        mono
        color="text-3"
        numberOfLines={1}
        accessibilityLabel={f.path}
      >
        {basename(f.path)}
      </Text>
      {f.episodes.length > 1 && (
        <Text variant="caption" color="text-3">
          {t('episode.oneFile', { code: episodeCode(e.season, f.episodes) })}
        </Text>
      )}
    </View>
  )
}

// ---------------------------------------------------------------- files

function Files({ show: sh }: { show: SeriesDetail }) {
  const t = useT(messages)
  const files = [
    ...new Map(
      sh.seasonList
        .flatMap((x) => x.episodes)
        .flatMap((e) =>
          e.file ? [[e.file.path, { file: e.file, season: e.season }] as const] : [],
        ),
    ).values(),
  ].sort((a, b) => a.season - b.season || (a.file.episodes[0] ?? 0) - (b.file.episodes[0] ?? 0))
  if (files.length === 0)
    return (
      <EmptyState icon="folder" title={t('noFiles.title')}>
        {t('noFiles.body', { path: sh.path })}
      </EmptyState>
    )
  return (
    <TableFrame>
      <TableToolbar>
        <Text size={tokens.adminText.ui.size} color="text-2">
          {t('files', { count: files.length, size: bytes(sh.size) })}
        </Text>
      </TableToolbar>
      <Table label={t('tab.files')}>
        <TableHeader>
          <TableRow>
            <TableHead>{t('col.episodesOf')}</TableHead>
            <TableHead>{t('col.file')}</TableHead>
            <TableHead>{t('col.quality')}</TableHead>
            <TableHead>{t('col.group')}</TableHead>
            <TableHead numeric>{t('col.size')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map(({ file: f, season }) => (
            <TableRow key={f.path}>
              <TableCell tall>
                <Text size={tokens.adminText.ui.size} mono>
                  {episodeCode(season, f.episodes)}
                </Text>
              </TableCell>
              <TableCell tall truncate>
                <TitleCell title={basename(f.path)} detail={dirname(f.path)} />
              </TableCell>
              <TableCell tall>
                <QualityTag overlay={false}>{f.quality}</QualityTag>
              </TableCell>
              <TableCell tall>
                <Text size={tokens.adminText.ui.size} color="text-2">
                  {f.releaseGroup ?? t('none')}
                </Text>
              </TableCell>
              <TableCell tall numeric>
                {bytes(f.size)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

// ---------------------------------------------------------------- edit

function EditShowDialog({ show: sh, onClose }: { show: SeriesDetail; onClose: () => void }) {
  const t = useT(messages)
  const options = useShowOptions()
  const [form, setForm] = useState({
    monitored: sh.monitored,
    qualityProfileId: sh.qualityProfileId,
    rootFolder: sh.rootFolder,
    seasonFolders: sh.seasonFolders,
  })
  const save = useAction((c) => c.series.update({ params: { id: sh.id }, body: form }))
  const submit = () =>
    save.run().then(
      () => {
        onClose()
        toast.success(t('saved', { title: sh.title }))
      },
      () => {
        // the error shows in the dialog
      },
    )
  return (
    <Dialog
      open
      onClose={onClose}
      closable
      size="md"
      title={t('edit.title', { title: sh.title })}
      description={t('edit.body')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            loading={save.pending}
            disabled={options.status !== 'success'}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <View style={{ gap: s['4'] }}>
        <Loadable query={options} what={t('edit.what')}>
          {(o) =>
            o && (
              <View style={{ gap: s['4'] }}>
                <Switch
                  label={t('monitored')}
                  hint={t('edit.monitored.hint')}
                  checked={form.monitored}
                  onCheckedChange={(monitored) => setForm({ ...form, monitored })}
                />
                <Field label={t('qualityProfile')}>
                  <Select
                    value={form.qualityProfileId}
                    onValueChange={(qualityProfileId) => setForm({ ...form, qualityProfileId })}
                    options={o.quality.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </Field>
                <Field
                  label={t('rootFolder')}
                  hint={
                    form.rootFolder === sh.rootFolder
                      ? undefined
                      : t('rootFolder.moves', {
                          folder: form.rootFolder,
                          title: sh.title,
                          year: sh.year,
                        })
                  }
                >
                  <Select
                    value={form.rootFolder}
                    onValueChange={(rootFolder) => setForm({ ...form, rootFolder })}
                    options={o.folders.map((f) => ({ value: f, label: f }))}
                  />
                </Field>
                <Switch
                  label={t('seasonFolders')}
                  hint={t('seasonFolders.hint')}
                  checked={form.seasonFolders}
                  onCheckedChange={(seasonFolders) => setForm({ ...form, seasonFolders })}
                />
              </View>
            )
          }
        </Loadable>
        {save.error && <FormError>{save.error.message}</FormError>}
      </View>
    </Dialog>
  )
}

/** A table cell's side padding (the web's px-3.5). */
const CELL_X = 14
