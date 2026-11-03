// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Media management (settings.md), as apps/server built it (media-management.tsx).
// Naming: rename, the folder and file formats with what Sintel's would become, named by the
// import's own functions (../naming.ts over @highsea-tv/media/naming), colons, and the tokens.
// Importing: hardlinks, NFO files, stop monitoring deleted files, folder permissions and the
// recycle bin with its days; then the root folders, each with its free space, how many movies are
// filed under it, how many new folders wait for a match, its default subtitle languages (saved at
// once) and Remove. Adding checks the folder exists and the server can write to it; removing leaves
// the disk alone. Tags are a group of their own below (tags.tsx). Folders and tags are immediate
// actions, so the save bar is the settings' only.
//
// Stage 6 of prototype-gaps.md, drawn for the TV series phase: Episode naming (Sonarr's formats,
// with previews from ../naming.ts, which draws them ahead of the server), and the root folders as
// one list per kind (Movies, Shows, Music), each folder with Scan now and its count of titles.
import { bytes } from '@highsea-tv/core/format'
import {
  COLON_REPLACEMENTS,
  type ColonReplacement,
  type EpisodeNaming,
  LIBRARY_KINDS,
  type LibraryKind,
  type MediaSettings,
  MULTI_EPISODE_STYLES,
  type MultiEpisodeStyle,
  type RootFolderRow,
} from '@highsea-tv/mock/settings'
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Icon,
  Input,
  Select,
  Switch,
  toast,
} from '@highsea-tv/ui'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import { Loadable } from '../loadable.tsx'
import {
  previewEpisodeFile,
  previewFile,
  previewFolder,
  previewSeasonFolder,
  previewSeriesFolder,
} from '../naming.ts'
import { adminHref } from '../shell.tsx'
import { reasonOf } from './parts.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { TagSettings } from './tags.tsx'

/**
 * The common tokens. The prototype's `{Edition}` is Radarr's `{Edition Tags}`: the naming engine
 * knows no `{Edition}`, and the server would refuse a format using it.
 */
const TOKENS = ['Movie Title', 'Release Year', 'Quality Full', 'Movie CleanTitle', 'Edition Tags']
  .map((token) => `{${token}}`)
  .join(' ')

const COLONS: Record<ColonReplacement, string> = {
  delete: 'Delete them',
  dash: 'Replace with a dash',
  'space-dash': 'Replace with a space and a dash',
  'space-dash-space': 'Replace with a dash between spaces',
  smart: 'Smart: a dash, with spaces where the title has them',
}

/** Sonarr's tokens, the ones the previews know (../naming.ts). */
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

/** Each style with what S01E01 to E03 in one file becomes. */
const MULTI: Record<MultiEpisodeStyle, string> = {
  extend: 'Extend: S01E01-02-03',
  duplicate: 'Duplicate: S01E01 - S01E02 - S01E03',
  repeat: 'Repeat: S01E01E02E03',
  scene: 'Scene: S01E01-E02-E03',
  range: 'Range: S01E01-03',
  'prefixed-range': 'Prefixed range: S01E01-E03',
}

type Draft = Omit<MediaSettings, 'recycleBinDays'> & { recycleBinDays: string }
type EpisodeErrors = Partial<Record<keyof EpisodeNaming, string>>

const draftOf = (s: MediaSettings): Draft => ({ ...s, recycleBinDays: String(s.recycleBinDays) })

export function MediaManagement() {
  const data = useQuery(
    'settings:media',
    (c) => c.settings.get('media') as Promise<MediaSettings>,
    ['settings.updated'],
  )
  const folders = <RootFolders />
  return (
    <AreaPage id="media">
      {data.status === 'success' ? (
        // a fresh draft whenever the saved settings change
        <Form key={JSON.stringify(data.data)} loaded={data.data} folders={folders} />
      ) : (
        <>
          <Loadable query={data} what="these settings">
            {() => null}
          </Loadable>
          <Group title="Root folders">{folders}</Group>
        </>
      )}
      <TagSettings />
    </AreaPage>
  )
}

function Form({ loaded, folders }: { loaded: MediaSettings; folders: ReactNode }) {
  const initial = draftOf(loaded)
  const [v, setDraft] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [episodeErrors, setEpisodeErrors] = useState<EpisodeErrors>({})
  const save = useAction((c, body: MediaSettings) => c.settings.save('media', body))
  const set = (patch: Partial<Draft>) => {
    setErrors({})
    setEpisodeErrors({})
    setDraft((d) => ({ ...d, ...patch }))
  }
  const setEpisodes = (patch: Partial<EpisodeNaming>) =>
    set({ episodes: { ...v.episodes, ...patch } })
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)

  const submit = async () => {
    const days = v.recycleBinDays.trim()
    const recycleBinDays = Number(days)
    const problems: typeof errors = {}
    if (!/^[0-7]{3}$/.test(v.chmod.trim()))
      problems.chmod = 'Use three digits from 0 to 7, like 755.'
    if (!/^\d+$/.test(days) || recycleBinDays > 3650)
      problems.recycleBinDays = 'Use a whole number of days up to 3650.'
    if (!v.folderFormat.trim()) problems.folderFormat = 'Enter a format.'
    if (!v.fileFormat.trim()) problems.fileFormat = 'Enter a format.'
    const episodes: EpisodeErrors = {}
    for (const k of [
      'standardFormat',
      'dailyFormat',
      'seriesFolderFormat',
      'seasonFolderFormat',
    ] as const)
      if (!v.episodes[k].trim()) episodes[k] = 'Enter a format.'
    if (v.episodes.standardFormat.trim() && !/\{episode(:0+)?\}/i.test(v.episodes.standardFormat))
      episodes.standardFormat = 'The format needs {episode:00}, so episodes can be told apart.'
    if (v.episodes.dailyFormat.trim() && !/\{air[- .]?date\}/i.test(v.episodes.dailyFormat))
      episodes.dailyFormat = 'The format needs {Air-Date}, so episodes can be told apart.'
    setEpisodeErrors(episodes)
    if (Object.keys(problems).length || Object.keys(episodes).length) return setErrors(problems)
    try {
      await save.run({ ...v, chmod: v.chmod.trim(), recycleBinDays })
    } catch (e) {
      const reason = reasonOf(e)
      if (reason && reason in v) setErrors({ [reason]: (e as Error).message })
      return toast.error('Couldn’t save', { description: (e as Error).message })
    }
    toast.success('Settings saved')
  }

  const file = previewFile(v.fileFormat)
  return (
    <>
      <Group title="Naming" description="How highsea names what it imports.">
        <Field inline label="Rename movies">
          <Switch checked={v.rename} onCheckedChange={(rename) => set({ rename })} />
        </Field>
        <Field
          label="Folder"
          hint={
            <>
              Becomes <span className="font-mono text-text-2">{previewFolder(v.folderFormat)}</span>
            </>
          }
          error={errors.folderFormat}
        >
          <Input
            value={v.folderFormat}
            disabled={!v.rename}
            spellCheck={false}
            onChange={(e) => set({ folderFormat: e.target.value })}
            className="font-mono"
          />
        </Field>
        <Field
          label="File"
          hint={
            <>
              Becomes <span className="font-mono text-text-2">{file}.mkv</span>
              {' · '}
              {/* a subtitle keeps the video's name, then its language (the server's sidecarPath) */}
              <span className="font-mono text-text-2">{file}.en.srt</span>
            </>
          }
          error={errors.fileFormat}
        >
          <Input
            value={v.fileFormat}
            disabled={!v.rename}
            spellCheck={false}
            onChange={(e) => set({ fileFormat: e.target.value })}
            className="font-mono"
          />
        </Field>
        <p className="text-caption text-text-3">Tokens: {TOKENS}</p>
        <div className="grid gap-4 medium:grid-cols-2">
          <Field label="Colons" hint="A file name can’t carry one, as in Dune: Part Two.">
            <Select
              value={v.colonReplacement}
              disabled={!v.rename}
              onValueChange={(c) => set({ colonReplacement: c as ColonReplacement })}
              options={COLON_REPLACEMENTS.map((c) => ({ value: c, label: COLONS[c] }))}
            />
          </Field>
        </div>
      </Group>
      <EpisodeNamingGroup v={v.episodes} set={setEpisodes} errors={episodeErrors} />
      <Group title="Importing">
        <Field
          inline
          label="Use hardlinks"
          hint="Imports take no extra space and torrents keep seeding."
        >
          <Switch checked={v.hardlinks} onCheckedChange={(hardlinks) => set({ hardlinks })} />
        </Field>
        <Field
          inline
          label="Write NFO files"
          hint="For other media players reading the same folders."
        >
          <Switch checked={v.nfo} onCheckedChange={(nfo) => set({ nfo })} />
        </Field>
        <Field
          inline
          label="Stop monitoring movies and episodes whose files I delete"
          hint="Otherwise highsea downloads them again."
        >
          <Switch
            checked={v.unmonitorDeleted}
            onCheckedChange={(unmonitorDeleted) => set({ unmonitorDeleted })}
          />
        </Field>
        <Field
          inline
          label="Set folder permissions"
          hint="Off: folders get what the server’s user gives them."
        >
          <Switch checked={v.permissions} onCheckedChange={(permissions) => set({ permissions })} />
        </Field>
        <div className="grid gap-4 medium:grid-cols-2">
          <Field
            label="Folder permissions"
            hint="chmod, for folders highsea makes."
            error={errors.chmod}
          >
            <Input
              value={v.chmod}
              disabled={!v.permissions}
              inputMode="numeric"
              maxLength={3}
              onChange={(e) => set({ chmod: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field
            label="Recycle bin"
            hint="Deleted files go here first. Empty: delete straight away."
            error={errors.recycleBin}
          >
            <Input
              value={v.recycleBin}
              placeholder="/data/.recycle"
              spellCheck={false}
              autoCapitalize="none"
              onChange={(e) => set({ recycleBin: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field
            label="Keep deleted files for"
            hint="Days. 0 keeps them until you empty the bin."
            error={errors.recycleBinDays}
            className="medium:col-start-2"
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={3650}
              value={v.recycleBinDays}
              disabled={!v.recycleBin.trim()}
              onChange={(e) => set({ recycleBinDays: e.target.value })}
            />
          </Field>
        </div>
      </Group>
      <Group
        title="Root folders"
        description="The folders each library is filed under. A movie, a show or an artist lives in a folder of its own inside one."
      >
        {folders}
      </Group>
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onSave={submit}
        onDiscard={() => {
          setErrors({})
          setEpisodeErrors({})
          setDraft(initial)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------- episode naming

/** "Becomes …" under a format. */
function Becomes({ children }: { children: ReactNode }) {
  return <span className="font-mono text-text-2 [overflow-wrap:anywhere]">{children}</span>
}

function EpisodeNamingGroup({
  v,
  set,
  errors,
}: {
  v: EpisodeNaming
  set: (patch: Partial<EpisodeNaming>) => void
  errors: EpisodeErrors
}) {
  const format = (key: keyof EpisodeNaming, label: string, hint: ReactNode) => (
    <Field label={label} hint={hint} error={errors[key]}>
      <Input
        value={v[key] as string}
        disabled={!v.rename}
        spellCheck={false}
        onChange={(e) => set({ [key]: e.target.value })}
        className="font-mono"
      />
    </Field>
  )
  return (
    <Group title="Episode naming" description="How highsea names the shows it imports.">
      <Field inline label="Rename episodes">
        <Switch checked={v.rename} onCheckedChange={(rename) => set({ rename })} />
      </Field>
      {format(
        'standardFormat',
        'Episode',
        <span className="grid gap-0.5">
          <span>
            Becomes{' '}
            <Becomes>{previewEpisodeFile(v.standardFormat, v.multiEpisodeStyle)}.mkv</Becomes>
          </span>
          <span>
            Three episodes in one file:{' '}
            <Becomes>{previewEpisodeFile(v.standardFormat, v.multiEpisodeStyle, true)}.mkv</Becomes>
          </span>
        </span>,
      )}
      {format(
        'dailyFormat',
        'Daily episode',
        <>
          For shows numbered by date, like a talk show. Becomes{' '}
          <Becomes>{previewEpisodeFile(v.dailyFormat, v.multiEpisodeStyle)}.mkv</Becomes>
        </>,
      )}
      <div className="grid gap-4 medium:grid-cols-2">
        {format(
          'seriesFolderFormat',
          'Show folder',
          <>
            Becomes <Becomes>{previewSeriesFolder(v.seriesFolderFormat)}</Becomes>
          </>,
        )}
        {format(
          'seasonFolderFormat',
          'Season folder',
          <>
            Becomes <Becomes>{previewSeasonFolder(v.seasonFolderFormat)}</Becomes>. Specials go in
            Specials.
          </>,
        )}
        <Field
          label="Several episodes in one file"
          hint="How the episode numbers are written."
          className="medium:col-span-2"
        >
          <Select
            value={v.multiEpisodeStyle}
            disabled={!v.rename}
            onValueChange={(s) => set({ multiEpisodeStyle: s as MultiEpisodeStyle })}
            options={MULTI_EPISODE_STYLES.map((s) => ({ value: s, label: MULTI[s] }))}
          />
        </Field>
      </div>
      <p className="text-caption text-text-3">Tokens: {EPISODE_TOKENS}</p>
    </Group>
  )
}

// ---------------------------------------------------------------- root folders

const KIND: Record<
  LibraryKind,
  { title: string; icon: 'movie' | 'series' | 'music'; empty: string; placeholder: string }
> = {
  movies: {
    title: 'Movies',
    icon: 'movie',
    empty: 'No Movies folders yet. Add the folder your movies live in.',
    placeholder: '/data/media/movies',
  },
  shows: {
    title: 'Shows',
    icon: 'series',
    empty: 'No Shows folders yet. Add the folder your shows live in.',
    placeholder: '/data/media/tv',
  },
  music: {
    title: 'Music',
    icon: 'music',
    empty: 'No Music folders yet. Add the folder your music lives in.',
    placeholder: '/data/media/music',
  },
}

const count = (n: number, one: string, many: string) =>
  `${n === 0 ? 'No' : n} ${n === 1 ? one : many}`

/** "24 movies", "12 shows", "30 albums by 12 artists". */
function titlesOf(f: RootFolderRow) {
  if (f.kind === 'movies') return count(f.titles, 'movie', 'movies')
  if (f.kind === 'shows') return count(f.titles, 'show', 'shows')
  return f.titles === 0
    ? 'No albums'
    : `${count(f.titles, 'album', 'albums')} by ${count(f.artists, 'artist', 'artists').toLowerCase()}`
}

/** "1 movie is", "3 shows are", "30 albums are". */
function filed(f: RootFolderRow) {
  const [one, many] =
    f.kind === 'movies'
      ? ['movie', 'movies']
      : f.kind === 'shows'
        ? ['show', 'shows']
        : ['album', 'albums']
  return f.titles === 1 ? `1 ${one} is` : `${f.titles} ${many} are`
}

function RootFolders() {
  const folders = useQuery('settings:root-folders', (c) => c.rootFolders.list(), [
    'settings.updated',
    'movies.updated',
    'shows.updated',
    'music.updated',
  ])
  const languages = useQuery('language-profiles', (c) => c.movies.languageProfiles(), [
    'subtitles.updated',
    'settings.updated',
  ])
  const [removing, setRemoving] = useState<RootFolderRow | null>(null)
  const remove = useAction((c, id: string) => c.rootFolders.remove(id))
  return (
    <div className="grid gap-6">
      <Loadable query={folders} what="the root folders">
        {(fs) =>
          LIBRARY_KINDS.map((kind, i) => {
            const mine = fs.filter((f) => f.kind === kind)
            return (
              <section
                key={kind}
                aria-labelledby={`folders-${kind}`}
                className={i > 0 ? 'grid gap-3 border-line border-t pt-5' : 'grid gap-3'}
              >
                <h3
                  id={`folders-${kind}`}
                  className="flex items-center gap-2 font-semibold text-text text-ui"
                >
                  <Icon name={KIND[kind].icon} size={16} className="text-text-3" />
                  {KIND[kind].title}
                </h3>
                {mine.length === 0 ? (
                  <p className="rounded-md border border-line bg-s2 p-4 text-center text-caption text-text-3">
                    {KIND[kind].empty}
                  </p>
                ) : (
                  <ul aria-label={`${KIND[kind].title} folders`} className="grid gap-2">
                    {mine.map((f) => (
                      <Folder
                        key={f.id}
                        folder={f}
                        languages={languages.data ?? []}
                        onRemove={() => setRemoving(f)}
                      />
                    ))}
                  </ul>
                )}
                <AddFolder kind={kind} />
              </section>
            )
          })
        }
      </Loadable>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.path ?? ''}?`}
        description={`highsea stops using it for new ${removing?.kind ?? 'movies'}. Nothing on disk changes, and you can add it again later.`}
        confirmLabel="Remove folder"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          const f = removing
          if (f)
            remove.run(f.id).then(
              () => toast({ title: `${f.path} removed` }),
              (e: Error) => toast.error('Couldn’t remove the folder', { description: e.message }),
            )
        }}
      />
    </div>
  )
}

const NO_LANGUAGES = 'none'

function Folder({
  folder: f,
  languages,
  onRemove,
}: {
  folder: RootFolderRow
  languages: { id: string; name: string }[]
  onRemove: () => void
}) {
  const inUse = f.titles > 0
  const save = useAction((c, languageProfileId: string | null) =>
    c.rootFolders.update(f.id, { languageProfileId }),
  )
  const scan = useAction((c) => c.rootFolders.scan(f.id))
  const setLanguages = (v: string) =>
    save.run(v === NO_LANGUAGES ? null : v).then(
      () => toast.success(`Subtitle languages saved for ${f.path}`),
      (e: Error) => toast.error('Couldn’t save the subtitle languages', { description: e.message }),
    )
  const what = f.kind === 'movies' ? 'movies' : f.kind === 'shows' ? 'shows' : 'albums'
  return (
    <li className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center">
      <div className="grid min-w-0 gap-1">
        <p className="flex min-w-0 items-center gap-2">
          <Icon name="folder" size={16} className="shrink-0 text-text-3" />
          <span className="min-w-0 font-mono text-mono text-text [overflow-wrap:anywhere]">
            {f.path}
          </span>
          {!f.accessible && <Badge tone="warning">Can’t be read now</Badge>}
        </p>
        <p className="text-caption text-text-3">
          {[
            f.free !== null && f.total !== null
              ? `${bytes(f.free)} free of ${bytes(f.total)}`
              : null,
            titlesOf(f),
            // the library scan's new folders it couldn't match surely
            f.waiting > 0
              ? `${f.waiting} ${f.waiting === 1 ? 'folder needs' : 'folders need'} a match in Library import`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {inUse && (
          <p id={`in-use-${f.id}`} className="text-caption text-text-3">
            {filed(f)} filed under it. Move them to another folder first.
          </p>
        )}
        {f.kind !== 'music' && (
          <div className="flex flex-wrap items-center gap-2 text-caption text-text-3">
            <span aria-hidden>Subtitle languages for {f.kind} added here</span>
            <Select
              aria-label={`Subtitle languages for ${f.kind} added to ${f.path}`}
              value={f.languageProfileId ?? NO_LANGUAGES}
              disabled={save.pending}
              onValueChange={setLanguages}
              options={[
                { value: NO_LANGUAGES, label: 'None' },
                ...languages.map((p) => ({ value: p.id, label: p.name })),
              ]}
              className="w-full medium:w-56"
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-self-start medium:justify-self-end">
        <Button
          size="sm"
          variant="ghost"
          icon="refresh"
          loading={scan.pending}
          disabled={!f.accessible}
          aria-label={`Scan ${f.path} now`}
          onClick={() =>
            scan.run().then(
              () =>
                toast({
                  title: `Scanning ${f.path}`,
                  description: `New ${what} are added as they’re found.`,
                }),
              (e: Error) => toast.error('Couldn’t scan the folder', { description: e.message }),
            )
          }
        >
          Scan now
        </Button>
        {/* Library import matches movies only until the TV series and music phases */}
        {f.kind === 'movies' && (
          <Button size="sm" variant="ghost" icon="import" asChild>
            <a
              href={adminHref('/activity/import')}
              aria-label={`Import what’s already in ${f.path}`}
            >
              Import what’s already here
            </a>
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          aria-label={`Remove ${f.path}`}
          aria-describedby={inUse ? `in-use-${f.id}` : undefined}
          disabled={inUse}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
    </li>
  )
}

function AddFolder({ kind }: { kind: LibraryKind }) {
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAction((c, p: string) => c.rootFolders.add(p, kind))
  const what = kind === 'music' ? 'Music' : kind === 'shows' ? 'Shows' : 'Movies'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const p = path.trim()
    if (!p) return setError('Enter the folder’s path.')
    if (!p.startsWith('/')) return setError('Use the full path, starting with /.')
    try {
      await add.run(p)
    } catch (err) {
      const reason = reasonOf(err)
      return setError(
        reason === 'not-absolute'
          ? 'Use the full path, starting with /.'
          : reason === 'not-found'
            ? 'That folder doesn’t exist on the server.'
            : reason === 'not-writable'
              ? 'highsea can’t write to that folder. Check its permissions.'
              : (err as { code?: string }).code === 'conflict'
                ? 'That folder is a root folder already, or inside or around one.'
                : (err as Error).message,
      )
    }
    setPath('')
    setError(null)
    toast.success(`${p} added`, {
      description: `${kind === 'music' ? 'Albums' : what} already in it are added as they’re found.`,
    })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <Field
        label={`Add a ${what} folder`}
        hint="A folder on the server, not on this device. highsea checks it exists and can write to it."
        error={error ?? undefined}
      >
        <div className="flex flex-wrap gap-2">
          <Input
            value={path}
            icon="folder"
            placeholder={KIND[kind].placeholder}
            spellCheck={false}
            autoCapitalize="none"
            className="min-w-0 flex-1 basis-48 font-mono"
            onChange={(e) => {
              setError(null)
              setPath(e.target.value)
            }}
          />
          <Button type="submit" icon="add" loading={add.pending}>
            Add folder
          </Button>
        </div>
      </Field>
    </form>
  )
}
