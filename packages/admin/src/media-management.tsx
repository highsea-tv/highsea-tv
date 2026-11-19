'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Media management (settings.md), ported from the signed-off prototype's
// MediaManagement (design/prototypes/src/admin/settings/reference.tsx). Naming: rename, the folder
// and file formats with what Sintel's would become, named by the import's own functions
// (@highsea-tv/media/naming), and the tokens. Importing: hardlinks, NFO files, stop monitoring deleted
// files, folder permissions and the recycle bin; then the root folders checkpoint 4 built, where
// the plan manages them (Admin › Root folders): each with its free space and how many movies are
// filed under it (the API's device is a filesystem id for matching disks, not a name, so it isn't
// shown); adding checks the folder exists and the server can write to it; removing leaves the
// disk alone. Folders are immediate actions, as lists are
// elsewhere in Settings, so the save bar is the settings' only. The settings the prototype doesn't
// show and the API has, colon replacement, whether to set permissions at all and how long the
// recycle bin keeps files, join the groups they belong to. A refused save names its field
// (`details.reason`), and the server's sentence shows under it.
//
// Checkpoint 8c adds two things the prototype has no design for: each folder's default subtitle
// languages, a select on its row that saves at once, as Remove does (the add dialog starts on it,
// and lists, the library import and migration use it); and Tags, a group of their own below
// (tag-settings.tsx).
//
// Drawn with the library's native renderer since D3 (one-client-platform-d.md), on the web through
// react-native-web, with the same parts, words and behaviour as the web renderer's. A hint that
// isn't only words (what Sintel's names would become, in mono) is drawn under the field's input,
// as the library's Field draws a string hint, and gives way to an error as it does.
//
// Episode naming (the prototype's stage 6, Sonarr's formats) joins Naming when the server serves
// shows (`useServes`, D3's answer 5): its own drafted route (series-settings.ts), drafted with the
// rest, so one save bar saves both, as the prototype's does. A real server doesn't serve shows yet,
// so its page is as before.
//
// Music (HT-68, Phase 5's part D) joins the same way when the server serves music: track naming
// (Lidarr's formats, music-library.ts's drafted route) beside episode naming under the one save
// bar, and each Music folder's figures and Scan now, as a Movies folder has them.
import {
  COLON_REPLACEMENTS,
  type EpisodeNaming,
  type LanguageProfile,
  type LibraryKind,
  type MediaManagementSettings,
  MULTI_EPISODE_STYLES,
  type MusicFolder,
  type RootFolder,
  type TrackNaming,
} from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import {
  buildFileName,
  buildFolderName,
  PREVIEW_FILE,
  PREVIEW_MOVIE,
} from '@highsea-tv/media/naming'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { line } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Icon,
  Input,
  Select,
  Switch,
  Text,
  toast,
  tokens,
  useRegularWindow,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import {
  checkEpisodeNaming,
  type MultiEpisodeStyle,
  previewEpisodeFile,
  previewSeasonFolder,
  previewSeriesFolder,
} from './episode-naming.ts'
import { Loadable } from './loadable.tsx'
import { media as messages } from './media-management-messages.ts'
import { errorReason } from './metadata-locale.ts'
import { useServes } from './serves.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { Card, Cards, Note, WRAP_ANYWHERE } from './settings-card.tsx'
import { TagSettings } from './tag-settings.tsx'
import {
  checkTrackNaming,
  previewArtistFolder,
  previewTrackFile,
  TRACK_TOKENS,
} from './track-naming.ts'

const s = tokens.space
const ui = tokens.adminText.ui
const TOPICS = ['settings.updated', 'movies.updated']

/**
 * The prototype's common tokens. Its `{Edition}` is Radarr's `{Edition Tags}`: the naming engine
 * knows no `{Edition}`, and the server would refuse a format using it.
 */
const TOKENS = ['Movie Title', 'Release Year', 'Quality Full', 'Movie CleanTitle', 'Edition Tags']
  .map((token) => `{${token}}`)
  .join(' ')

/** Sonarr's tokens, the ones the episode previews know (episode-naming.ts). */
const EPISODE_TOKENS = [
  'Series Title',
  'Series TitleYear',
  'Series CleanTitle',
  'season:00',
  'episode:00',
  'Episode Title',
  'Air-Date',
  'Quality Full',
  'Release Group',
]
  .map((token) => `{${token}}`)
  .join(' ')

type Naming = typeof EpisodeNaming._output
type NamingErrors = Partial<Record<keyof Naming, string>>

/** Episode naming as loaded, when the server serves shows. */
type Episodes = { loaded: Naming; reload: () => void }
/** Track naming as loaded, when the server serves music. */
type Tracks = { loaded: TrackNaming; reload: () => void }
type TrackErrors = Partial<Record<keyof TrackNaming, string>>

type Draft = Omit<MediaManagementSettings, 'recycleBinDays'> & { recycleBinDays: string }

const draftOf = (s: MediaManagementSettings): Draft => ({
  ...s,
  recycleBinDays: String(s.recycleBinDays),
})

/** Two columns in a regular window, 16 apart (the web's `grid gap-4 regular:grid-cols-2`). */
function Columns({ children }: { children: ReactNode }) {
  const regular = useRegularWindow()
  return (
    <View
      style={
        {
          display: 'grid',
          gridTemplateColumns: regular ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
          gap: s['4'],
        } as unknown as ViewStyle
      }
    >
      {children}
    </View>
  )
}

/** A name the import would give, in mono `text-2` inside a hint. */
function Name({ children }: { children: ReactNode }) {
  return (
    <Text variant="caption" mono color="text-2">
      {children}
    </Text>
  )
}

export function MediaManagement() {
  const t = useT(messages)
  const data = useQuery('settings:media-management', (c) => c.settings.mediaManagement(), [
    'settings.updated',
  ])
  const shows = useServes('shows')
  const music = useServes('music')
  const folders = <RootFolders />
  const page = (episodes?: Episodes, tracks?: Tracks) =>
    data.status === 'success' ? (
      // a fresh draft whenever the saved settings change
      <Form
        key={JSON.stringify([data.data, episodes?.loaded, tracks?.loaded])}
        loaded={data.data}
        reload={data.refetch}
        folders={folders}
        episodes={episodes}
        tracks={tracks}
      />
    ) : (
      <>
        <Loadable query={data} what={t('what')}>
          {() => null}
        </Loadable>
        <Group title={t('importing.title')}>{folders}</Group>
      </>
    )
  return (
    <AreaPage id="media">
      {(() => {
        const withTracks = (episodes?: Episodes) =>
          music ? <WithTracks>{(tracks) => page(episodes, tracks)}</WithTracks> : page(episodes)
        return shows ? <WithEpisodes>{withTracks}</WithEpisodes> : withTracks()
      })()}
      <TagSettings />
    </AreaPage>
  )
}

/** Reads episode naming; until it's loaded (or if it fails) the films' form is drawn without it. */
function WithEpisodes({ children }: { children: (episodes?: Episodes) => ReactNode }) {
  const q = useQuery('settings:episode-naming', (c) => c.series.naming(), ['settings.updated'])
  return <>{children(q.status === 'success' ? { loaded: q.data, reload: q.refetch } : undefined)}</>
}

/** Reads track naming; until it's loaded (or if it fails) the form is drawn without it. */
function WithTracks({ children }: { children: (tracks?: Tracks) => ReactNode }) {
  const q = useQuery('settings:track-naming', (c) => c.musicLibrary.naming(), ['settings.updated'])
  return <>{children(q.status === 'success' ? { loaded: q.data, reload: q.refetch } : undefined)}</>
}

function Form({
  loaded,
  reload,
  folders,
  episodes,
  tracks,
}: {
  loaded: MediaManagementSettings
  reload: () => void
  folders: ReactNode
  episodes?: Episodes
  tracks?: Tracks
}) {
  const t = useT(messages)
  const theme = useTheme()
  const regular = useRegularWindow()
  const initial = draftOf(loaded)
  const [v, setDraft] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const save = useAction((c, body: MediaManagementSettings) =>
    c.settings.saveMediaManagement({ body }),
  )
  const set = (patch: Partial<Draft>) => {
    setErrors({})
    setDraft((d) => ({ ...d, ...patch }))
  }
  const [ep, setEp] = useState(episodes?.loaded ?? null)
  const [epErrors, setEpErrors] = useState<NamingErrors>({})
  const saveEpisodes = useAction((c, body: Naming) => c.series.saveNaming({ body }))
  const setEpisodes = (patch: Partial<Naming>) => {
    setEpErrors({})
    setEp((d) => (d ? { ...d, ...patch } : d))
  }
  const epDirty = JSON.stringify(ep) !== JSON.stringify(episodes?.loaded ?? null)
  const [tr, setTr] = useState(tracks?.loaded ?? null)
  const [trErrors, setTrErrors] = useState<TrackErrors>({})
  const saveTracks = useAction((c, body: TrackNaming) => c.musicLibrary.saveNaming({ body }))
  const setTracks = (patch: Partial<TrackNaming>) => {
    setTrErrors({})
    setTr((d) => (d ? { ...d, ...patch } : d))
  }
  const trDirty = JSON.stringify(tr) !== JSON.stringify(tracks?.loaded ?? null)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || epDirty || trDirty
  // the import's own naming, so the preview and the files it names never disagree
  const naming = { colonReplacement: v.colonReplacement }
  const file = buildFileName(v.fileFormat, PREVIEW_MOVIE, PREVIEW_FILE, naming)

  const submit = async () => {
    const days = v.recycleBinDays.trim()
    const recycleBinDays = Number(days)
    const problems: typeof errors = {}
    if (!/^[0-7]{3}$/.test(v.chmod.trim())) problems.chmod = t('chmod.invalid')
    if (!/^\d+$/.test(days) || recycleBinDays > 3650) problems.recycleBinDays = t('days.invalid')
    if (!v.folderFormat.trim()) problems.folderFormat = t('format.missing')
    if (!v.fileFormat.trim()) problems.fileFormat = t('format.missing')
    const epProblems: NamingErrors = {}
    if (ep)
      for (const [k, why] of Object.entries(checkEpisodeNaming(ep)))
        epProblems[k as keyof Naming] =
          why === 'blank'
            ? t('format.missing')
            : t('episodes.needsEpisode', {
                token: why === 'needsEpisode' ? '{episode:00}' : '{Air-Date}',
              })
    setEpErrors(epProblems)
    const trProblems: TrackErrors = {}
    if (tr)
      for (const [k, why] of Object.entries(checkTrackNaming(tr)))
        trProblems[k as keyof TrackNaming] =
          why === 'blank' ? t('format.missing') : t('tracks.needsTrack', { token: '{track:00}' })
    setTrErrors(trProblems)
    if (
      Object.keys(problems).length ||
      Object.keys(epProblems).length ||
      Object.keys(trProblems).length
    )
      return setErrors(problems)
    try {
      await save.run({ ...v, chmod: v.chmod.trim(), recycleBinDays })
    } catch (e) {
      const reason = errorReason(e)
      if (reason && reason in v) setErrors({ [reason]: (e as Error).message })
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    if (ep && epDirty)
      try {
        await saveEpisodes.run(ep)
      } catch (e) {
        const reason = errorReason(e)
        if (reason && reason in ep) setEpErrors({ [reason]: (e as Error).message })
        return toast.error(t('saveError'), { description: (e as Error).message })
      }
    if (tr && trDirty)
      try {
        await saveTracks.run(tr)
      } catch (e) {
        const reason = errorReason(e)
        if (reason && reason in tr) setTrErrors({ [reason]: (e as Error).message })
        return toast.error(t('saveError'), { description: (e as Error).message })
      }
    toast.success(t('saved'))
    reload()
    if (epDirty) episodes?.reload()
    if (trDirty) tracks?.reload()
  }

  return (
    <>
      <Group title={t('naming.title')} description={t('naming.description')}>
        <Switch
          label={t('rename')}
          checked={v.rename}
          onCheckedChange={(rename) => set({ rename })}
        />
        <Field label={t('folder')} error={errors.folderFormat}>
          <Input
            value={v.folderFormat}
            disabled={!v.rename}
            mono
            spellCheck={false}
            autoCapitalize="none"
            onChangeText={(folderFormat) => set({ folderFormat })}
          />
          {errors.folderFormat ? null : (
            <Note>
              {t('becomes')} <Name>{buildFolderName(v.folderFormat, PREVIEW_MOVIE, naming)}</Name>
            </Note>
          )}
        </Field>
        <Field label={t('file')} error={errors.fileFormat}>
          <Input
            value={v.fileFormat}
            disabled={!v.rename}
            mono
            spellCheck={false}
            autoCapitalize="none"
            onChangeText={(fileFormat) => set({ fileFormat })}
          />
          {errors.fileFormat ? null : (
            <Note>
              {t('becomes')} <Name>{file}.mkv</Name>
              {' · '}
              {/* a subtitle keeps the video's name, then its language: sidecarPath in
                  @highsea-tv/subtitles/shared, which reads node:path, so it isn't imported here */}
              <Name>{file}.en.srt</Name>
            </Note>
          )}
        </Field>
        <Note>
          {t('tokens')} {TOKENS}
        </Note>
        <Columns>
          <Field label={t('colon')} hint={t('colonHint')} disabled={!v.rename}>
            <Select
              value={v.colonReplacement}
              disabled={!v.rename}
              onValueChange={(c) => set({ colonReplacement: c as Draft['colonReplacement'] })}
              options={COLON_REPLACEMENTS.map((c) => ({ value: c, label: t(`colon.${c}`) }))}
            />
          </Field>
        </Columns>
      </Group>
      {ep ? <EpisodeNamingGroup v={ep} set={setEpisodes} errors={epErrors} /> : null}
      {tr ? <TrackNamingGroup v={tr} set={setTracks} errors={trErrors} /> : null}
      <Group title={t('importing.title')}>
        <Switch
          label={t('hardlinks')}
          hint={t('hardlinksHint')}
          checked={v.hardlinks}
          onCheckedChange={(hardlinks) => set({ hardlinks })}
        />
        <Switch
          label={t('nfo')}
          hint={t('nfoHint')}
          checked={v.nfo}
          onCheckedChange={(nfo) => set({ nfo })}
        />
        <Switch
          label={t('unmonitorDeleted')}
          hint={t('unmonitorDeletedHint')}
          checked={v.unmonitorDeleted}
          onCheckedChange={(unmonitorDeleted) => set({ unmonitorDeleted })}
        />
        <Switch
          label={t('permissions')}
          hint={t('permissionsHint')}
          checked={v.permissions}
          onCheckedChange={(permissions) => set({ permissions })}
        />
        <Columns>
          <Field label={t('chmod')} hint={t('chmodHint')} error={errors.chmod}>
            <Input
              value={v.chmod}
              disabled={!v.permissions}
              mono
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={3}
              onChangeText={(chmod) => set({ chmod })}
            />
          </Field>
          <Field label={t('recycleBin')} hint={t('recycleBinHint')} error={errors.recycleBin}>
            <Input
              value={v.recycleBin}
              placeholder="/data/.recycle"
              mono
              spellCheck={false}
              autoCapitalize="none"
              onChangeText={(recycleBin) => set({ recycleBin })}
            />
          </Field>
          <View style={regular ? ({ gridColumnStart: 2 } as unknown as ViewStyle) : undefined}>
            <Field label={t('days')} hint={t('daysHint')} error={errors.recycleBinDays}>
              <Input
                inputMode="numeric"
                keyboardType="number-pad"
                value={v.recycleBinDays}
                disabled={!v.recycleBin.trim()}
                onChangeText={(recycleBinDays) => set({ recycleBinDays })}
              />
            </Field>
          </View>
        </Columns>
        <View
          style={{
            gap: s['4'],
            paddingTop: s['4'],
            borderTopWidth: line.thin,
            borderTopColor: theme.colors.line,
          }}
        >
          {folders}
        </View>
      </Group>
      <SaveBar
        dirty={dirty}
        saving={save.pending || saveEpisodes.pending || saveTracks.pending}
        onSave={submit}
        onDiscard={() => {
          setErrors({})
          setDraft(initial)
          setEpErrors({})
          setEp(episodes?.loaded ?? null)
          setTrErrors({})
          setTr(tracks?.loaded ?? null)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------- episode naming

function EpisodeNamingGroup({
  v,
  set,
  errors,
}: {
  v: Naming
  set: (patch: Partial<Naming>) => void
  errors: NamingErrors
}) {
  const t = useT(messages)
  const format = (key: keyof Naming, label: string, preview: ReactNode) => (
    <Field label={label} error={errors[key]}>
      <Input
        value={v[key] as string}
        disabled={!v.rename}
        mono
        spellCheck={false}
        autoCapitalize="none"
        onChangeText={(text) => set({ [key]: text })}
      />
      {errors[key] ? null : preview}
    </Field>
  )
  const style = v.multiEpisodeStyle as MultiEpisodeStyle
  return (
    <Group title={t('episodes.title')} description={t('episodes.description')}>
      <Switch
        label={t('episodes.rename')}
        checked={v.rename}
        onCheckedChange={(rename) => set({ rename })}
      />
      {format(
        'standardFormat',
        t('episodes.standard'),
        <View style={{ gap: s['0.5'] }}>
          <Note style={WRAP_ANYWHERE}>
            {t('becomes')} <Name>{previewEpisodeFile(v.standardFormat, style)}.mkv</Name>
          </Note>
          <Note style={WRAP_ANYWHERE}>
            {t('episodes.multiPreview')}{' '}
            <Name>{previewEpisodeFile(v.standardFormat, style, true)}.mkv</Name>
          </Note>
        </View>,
      )}
      {format(
        'dailyFormat',
        t('episodes.daily'),
        <Note style={WRAP_ANYWHERE}>
          {t('episodes.dailyHint')} <Name>{previewEpisodeFile(v.dailyFormat, style)}.mkv</Name>
        </Note>,
      )}
      <Columns>
        {format(
          'seriesFolderFormat',
          t('episodes.series'),
          <Note style={WRAP_ANYWHERE}>
            {t('becomes')} <Name>{previewSeriesFolder(v.seriesFolderFormat)}</Name>
          </Note>,
        )}
        {format(
          'seasonFolderFormat',
          t('episodes.season'),
          <Note style={WRAP_ANYWHERE}>
            {t('becomes')} <Name>{previewSeasonFolder(v.seasonFolderFormat)}</Name>.{' '}
            {t('episodes.specials')}
          </Note>,
        )}
      </Columns>
      <Field label={t('episodes.multi')} hint={t('episodes.multiHint')} disabled={!v.rename}>
        <Select
          value={v.multiEpisodeStyle}
          disabled={!v.rename}
          onValueChange={(m) => set({ multiEpisodeStyle: m as MultiEpisodeStyle })}
          options={MULTI_EPISODE_STYLES.map((m) => ({
            value: m,
            label: t(`episodes.multi.${m}`),
          }))}
        />
      </Field>
      <Note>
        {t('tokens')} {EPISODE_TOKENS}
      </Note>
    </Group>
  )
}

// ---------------------------------------------------------------- track naming

/** Music's naming, as Lidarr's (HT-68): a track's file, one on a disc of several, an artist's folder. */
function TrackNamingGroup({
  v,
  set,
  errors,
}: {
  v: TrackNaming
  set: (patch: Partial<TrackNaming>) => void
  errors: TrackErrors
}) {
  const t = useT(messages)
  const format = (key: Exclude<keyof TrackNaming, 'rename'>, label: string, preview: ReactNode) => (
    <Field label={label} error={errors[key]}>
      <Input
        value={v[key]}
        disabled={!v.rename}
        mono
        spellCheck={false}
        autoCapitalize="none"
        onChangeText={(text) => set({ [key]: text })}
      />
      {errors[key] ? null : preview}
    </Field>
  )
  return (
    <Group title={t('tracks.title')} description={t('tracks.description')}>
      <Switch
        label={t('tracks.rename')}
        hint={t('tracks.renameHint')}
        checked={v.rename}
        onCheckedChange={(rename) => set({ rename })}
      />
      {format(
        'standardFormat',
        t('tracks.standard'),
        <Note style={WRAP_ANYWHERE}>
          {t('becomes')} <Name>{previewTrackFile(v.standardFormat)}.flac</Name>
        </Note>,
      )}
      {format(
        'multiDiscFormat',
        t('tracks.multiDisc'),
        <Note style={WRAP_ANYWHERE}>
          {t('tracks.multiDiscHint')} <Name>{previewTrackFile(v.multiDiscFormat, true)}.flac</Name>
        </Note>,
      )}
      {format(
        'artistFolderFormat',
        t('tracks.artist'),
        <Note style={WRAP_ANYWHERE}>
          {t('becomes')} <Name>{previewArtistFolder(v.artistFolderFormat)}</Name>
        </Note>,
      )}
      <Note>
        {t('tokens')} {TRACK_TOKENS}
      </Note>
    </Group>
  )
}

/** Each kind's section: its icon, and the placeholder of its Add field (the stage-6 prototype). */
const KIND: Record<LibraryKind, { icon: 'movie' | 'series' | 'music'; placeholder: string }> = {
  movies: { icon: 'movie', placeholder: '/data/media/movies' },
  shows: { icon: 'series', placeholder: '/data/media/tv' },
  music: { icon: 'music', placeholder: '/data/media/music' },
}
const KINDS = ['movies', 'shows', 'music'] as const satisfies readonly LibraryKind[]

function RootFolders() {
  const t = useT(messages)
  const theme = useTheme()
  const folders = useQuery('settings:root-folders', (c) => c.rootFolders.list(), TOPICS)
  const languages = useQuery('language-profiles', (c) => c.subtitles.languageProfiles(), [
    'subtitles.updated',
  ])
  const [removing, setRemoving] = useState<RootFolder | null>(null)
  const remove = useAction((c, id: string) => c.rootFolders.remove({ params: { id } }))
  const music = useServes('music')
  return (
    <View style={{ gap: s['4'] }}>
      <View style={{ gap: s['0.5'] }}>
        <Text size={ui.size} leading={ui.leading} weight={600} role="heading" aria-level={3}>
          {t('folders.title')}
        </Text>
        <Note>{t('folders.description')}</Note>
      </View>
      <Loadable query={folders} what={t('folders.what')}>
        {(fs) => (
          <WithMusicFigures on={music}>
            {(figures) => (
              <View style={{ gap: s['5'] }}>
                {KINDS.map((kind, i) => {
                  const mine = fs.filter((f) => f.kind === kind)
                  return (
                    <View
                      key={kind}
                      style={[
                        { gap: s['3'] },
                        i > 0 && {
                          borderTopWidth: line.thin,
                          borderColor: theme.colors.line,
                          paddingTop: s['5'],
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
                        <Icon name={KIND[kind].icon} size={tokens.icon.size.sm} color="text-3" />
                        <Text
                          size={ui.size}
                          leading={ui.leading}
                          weight={600}
                          role="heading"
                          aria-level={4}
                        >
                          {t(`folders.kind.${kind}`)}
                        </Text>
                      </View>
                      {/* music's folders are read once it's served; shows' are since Phase 5 B */}
                      {kind === 'music' && !music ? <Note>{t('folders.later.music')}</Note> : null}
                      {mine.length === 0 ? (
                        <View
                          style={{
                            padding: s['4'],
                            borderWidth: line.thin,
                            borderColor: theme.colors.line,
                            borderRadius: tokens.radius.md,
                            backgroundColor: theme.colors.s2,
                          }}
                        >
                          <Note style={{ textAlign: 'center' }}>{t(`folders.none.${kind}`)}</Note>
                        </View>
                      ) : (
                        <Cards label={t('folders.list', { kind: t(`folders.kind.${kind}`) })}>
                          {mine.map((f) => (
                            <Folder
                              key={f.id}
                              folder={f}
                              languages={languages.data ?? []}
                              figures={figures.find((x) => x.id === f.id)}
                              onRemove={() => setRemoving(f)}
                              onSaved={folders.refetch}
                            />
                          ))}
                        </Cards>
                      )}
                      <AddFolder kind={kind} onAdded={folders.refetch} />
                    </View>
                  )
                })}
              </View>
            )}
          </WithMusicFigures>
        )}
      </Loadable>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t('folders.removeTitle', { path: removing?.path ?? '' })}
        description={t(`folders.removeBody.${removing?.kind ?? 'movies'}`)}
        confirmLabel={t('folders.removeConfirm')}
        cancelLabel={t('folders.keep')}
        destructive
        onConfirm={() => {
          const f = removing
          if (f)
            remove.run(f.id).then(
              () => {
                toast({ title: t('folders.removed', { path: f.path }) })
                folders.refetch()
              },
              (e: Error) => toast.error(t('folders.removeFailed'), { description: e.message }),
            )
        }}
      />
    </View>
  )
}

/** Each Music folder's artists, albums and folders set aside, when the server serves music. */
function WithMusicFigures({
  on,
  children,
}: {
  on: boolean
  children: (figures: MusicFolder[]) => ReactNode
}) {
  return on ? <MusicFigures>{children}</MusicFigures> : children(NO_FIGURES)
}

function MusicFigures({ children }: { children: (figures: MusicFolder[]) => ReactNode }) {
  const q = useQuery('music:folders', (c) => c.musicLibrary.folders(), ['music.updated'])
  return <>{children(q.data ?? NO_FIGURES)}</>
}

const NO_FIGURES: MusicFolder[] = []
const NO_LANGUAGES = 'none'
/** The languages select's width in a regular window (the web's `regular:w-56`). */
const LANGUAGES_WIDTH = s['16'] * 3 + s['8']

function Folder({
  folder: f,
  languages,
  figures,
  onRemove,
  onSaved,
}: {
  folder: RootFolder
  languages: LanguageProfile[]
  /** A Music folder's figures, when the server serves music (HT-68). */
  figures?: MusicFolder
  onRemove: () => void
  onSaved: () => void
}) {
  const t = useT(messages)
  const regular = useRegularWindow()
  const movies = f.kind === 'movies'
  const shows = f.kind === 'shows'
  const music = f.kind === 'music' && figures !== undefined
  const inUse = f.movies > 0
  const save = useAction((c, languageProfileId: string | null) =>
    c.rootFolders.update({ params: { id: f.id }, body: { languageProfileId } }),
  )
  const setReadOnly = useAction((c, readOnly: boolean) =>
    c.rootFolders.update({ params: { id: f.id }, body: { readOnly } }),
  )
  const scan = useAction((c) => c.rootFolders.scan({ params: { id: f.id } }))
  const setLanguages = (v: string) =>
    save.run(v === NO_LANGUAGES ? null : v).then(
      () => {
        toast.success(t('folders.languagesSaved', { path: f.path }))
        onSaved()
      },
      (e: Error) => toast.error(t('folders.languagesFailed'), { description: e.message }),
    )
  const toggleReadOnly = (readOnly: boolean) =>
    setReadOnly.run(readOnly).then(
      () => {
        toast.success(
          t(readOnly ? 'folders.readOnlySaved' : 'folders.managedSaved', { path: f.path }),
        )
        onSaved()
      },
      (e: Error) => toast.error(t('folders.readOnlyFailed'), { description: e.message }),
    )
  return (
    <Card
      gap={s['2']}
      style={regular ? { flexDirection: 'row', alignItems: 'center', gap: s['2'] } : undefined}
    >
      <View style={{ flex: regular ? 1 : undefined, minWidth: 0, gap: s['1'] }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: s['2'],
            minWidth: 0,
          }}
        >
          {/* the icon stays with the path; the badges wrap below a long one */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s['2'],
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            <View style={{ flexShrink: 0 }}>
              <Icon name="folder" size={tokens.icon.size.sm} color="text-3" />
            </View>
            <Text
              size={ui.size}
              leading={ui.leading}
              mono
              style={[{ flexShrink: 1, minWidth: 0 }, WRAP_ANYWHERE]}
            >
              {f.path}
            </Text>
          </View>
          {f.readOnly ? <Badge tone="info">{t('folders.readOnlyBadge')}</Badge> : null}
          {f.accessible ? null : <Badge tone="warning">{t('folders.unreadable')}</Badge>}
        </View>
        <Note>
          {[
            f.free !== null && f.total !== null
              ? t('folders.free', { free: bytes(f.free), total: bytes(f.total) })
              : null,
            movies ? t('folders.movies', { count: f.movies }) : null,
            music ? t('folders.artists', { count: figures.artists }) : null,
            music ? t('folders.albums', { count: figures.albums }) : null,
            music && figures.unmatched > 0
              ? t('folders.unmatched', { count: figures.unmatched })
              : null,
            // the library scan's new folders it couldn't match surely (4.1a's review)
            f.waiting > 0 ? t('folders.waiting', { count: f.waiting }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Note>
        {inUse ? <Note>{t('folders.inUse', { count: f.movies })}</Note> : null}
        {/* ADR 0063: the owner's other apps manage it, and highsea only reads it */}
        <Switch
          label={t('folders.readOnly')}
          hint={
            f.mountedReadOnly
              ? t('folders.mountedReadOnly')
              : f.readOnly
                ? t(`folders.readOnlyHint.${f.kind}`)
                : t('folders.managedHint')
          }
          checked={f.readOnly}
          disabled={setReadOnly.pending || f.mountedReadOnly}
          onCheckedChange={toggleReadOnly}
        />
        {movies ? (
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}
          >
            <Text variant="caption" color="text-3" aria-hidden>
              {t('folders.languages')}
            </Text>
            <View style={regular ? { width: LANGUAGES_WIDTH } : { width: '100%' }}>
              <Select
                aria-label={t('folders.languagesLabel', { path: f.path })}
                value={f.languageProfileId ?? NO_LANGUAGES}
                disabled={save.pending}
                onValueChange={setLanguages}
                options={[
                  { value: NO_LANGUAGES, label: t('folders.languagesNone') },
                  ...languages.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </View>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
        {movies || shows || music ? (
          <Button
            size="sm"
            variant="ghost"
            icon="refresh"
            loading={scan.pending}
            disabled={!f.accessible}
            accessibilityLabel={t('folders.scanLabel', { path: f.path })}
            onPress={() =>
              scan.run().then(
                () =>
                  toast({
                    title: t('folders.scanning', { path: f.path }),
                    description: t(
                      music
                        ? 'folders.scanningMusic'
                        : shows
                          ? 'folders.scanningShows'
                          : 'folders.scanningBody',
                    ),
                  }),
                (e: Error) => toast.error(t('folders.scanFailed'), { description: e.message }),
              )
            }
          >
            {t('folders.scan')}
          </Button>
        ) : null}
        {/* Library import matches movies and shows; music's comes with part D */}
        {movies || shows ? (
          <Button
            size="sm"
            variant="ghost"
            icon="import"
            href={`/activity/import?mode=library&root=${encodeURIComponent(f.path)}`}
            accessibilityLabel={t('folders.importExistingLabel', { path: f.path })}
          >
            {t('folders.importExisting')}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="danger"
          accessibilityLabel={t('folders.removeLabel', { path: f.path })}
          // the line above says why; React Native has no aria-describedby, so it's the hint
          accessibilityHint={inUse ? t('folders.inUse', { count: f.movies }) : undefined}
          disabled={inUse}
          onPress={onRemove}
        >
          {t('folders.remove')}
        </Button>
      </View>
    </Card>
  )
}

function AddFolder({ kind, onAdded }: { kind: LibraryKind; onAdded: () => void }) {
  const t = useT(messages)
  const [path, setPath] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = useAction((c, p: string) => c.rootFolders.add({ body: { path: p, kind, readOnly } }))

  const submit = async () => {
    const p = path.trim()
    if (!p) return setError(t('add.missing'))
    if (!p.startsWith('/')) return setError(t('add.notAbsolute'))
    let added: RootFolder
    try {
      added = await add.run(p)
    } catch (err) {
      const reason = errorReason(err)
      return setError(
        reason === 'not-absolute'
          ? t('add.notAbsolute')
          : reason === 'not-found'
            ? t('add.notFound')
            : reason === 'not-readable'
              ? t('add.notReadable')
              : reason === 'not-writable'
                ? t('add.notWritable')
                : (err as ApiError).code === 'conflict'
                  ? t('add.conflict')
                  : (err as Error).message,
      )
    }
    setPath('')
    setReadOnly(false)
    setError(null)
    toast.success(t('add.added', { path: p }), {
      description:
        kind === 'music'
          ? t('folders.later.music')
          : kind === 'shows'
            ? t('add.addedScanningShows')
            : added.readOnly
              ? t('add.addedReadOnly')
              : t('add.addedScanning'),
    })
    onAdded()
  }

  return (
    <View style={{ gap: s['2'] }}>
      <Field
        label={t(`add.label.${kind}`)}
        hint={readOnly ? t('add.hintReadOnly') : t('add.hint')}
        error={error ?? undefined}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: s['12'] * 4, minWidth: 0 }}>
            <Input
              value={path}
              icon="folder"
              mono
              placeholder={KIND[kind].placeholder}
              spellCheck={false}
              autoCapitalize="none"
              onChangeText={(v) => {
                setError(null)
                setPath(v)
              }}
              onSubmitEditing={submit}
            />
          </View>
          <Button icon="add" loading={add.pending} onPress={submit}>
            {t('add.submit')}
          </Button>
        </View>
      </Field>
      <Switch
        label={t('add.readOnly')}
        hint={t('add.readOnlyHint')}
        checked={readOnly}
        onCheckedChange={(v) => {
          setError(null)
          setReadOnly(v)
        }}
      />
    </View>
  )
}
