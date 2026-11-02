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
import { bytes } from '@highsea-tv/core/format'
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
} from '@highsea-tv/ui-web'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import {
  COLON_REPLACEMENTS,
  type ColonReplacement,
  type MediaSettings,
  type RootFolderRow,
} from '../../mock/settings.ts'
import { Loadable } from '../loadable.tsx'
import { previewFile, previewFolder } from '../naming.ts'
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

type Draft = Omit<MediaSettings, 'recycleBinDays'> & { recycleBinDays: string }

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
          <Group title="Importing">{folders}</Group>
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
  const save = useAction((c, body: MediaSettings) => c.settings.save('media', body))
  const set = (patch: Partial<Draft>) => {
    setErrors({})
    setDraft((d) => ({ ...d, ...patch }))
  }
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
    if (Object.keys(problems).length) return setErrors(problems)
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
          label="Stop monitoring movies whose files I delete"
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
        <div className="grid gap-4 border-line border-t pt-4">{folders}</div>
      </Group>
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onSave={submit}
        onDiscard={() => {
          setErrors({})
          setDraft(initial)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------- root folders

function RootFolders() {
  const folders = useQuery('settings:root-folders', (c) => c.rootFolders.list(), [
    'settings.updated',
    'movies.updated',
  ])
  const languages = useQuery('language-profiles', (c) => c.movies.languageProfiles(), [
    'subtitles.updated',
    'settings.updated',
  ])
  const [removing, setRemoving] = useState<RootFolderRow | null>(null)
  const remove = useAction((c, id: string) => c.rootFolders.remove(id))
  return (
    <div className="grid gap-4">
      <div className="grid gap-0.5">
        <h3 className="font-semibold text-text text-ui">Root folders</h3>
        <p className="text-caption text-text-3">
          The folders movies are filed under. Each movie lives in a folder of its own inside one.
        </p>
      </div>
      <Loadable query={folders} what="the root folders">
        {(fs) =>
          fs.length === 0 ? (
            <p className="rounded-md border border-line bg-s2 p-4 text-center text-caption text-text-3">
              No root folders yet. Add the folder your movies live in.
            </p>
          ) : (
            <ul aria-label="Root folders" className="grid gap-2">
              {fs.map((f) => (
                <Folder
                  key={f.id}
                  folder={f}
                  languages={languages.data ?? []}
                  onRemove={() => setRemoving(f)}
                />
              ))}
            </ul>
          )
        }
      </Loadable>
      <AddFolder />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.path ?? ''}?`}
        description="highsea stops using it for new movies. Nothing on disk changes, and you can add it again later."
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
  const inUse = f.movies > 0
  const save = useAction((c, languageProfileId: string | null) =>
    c.rootFolders.update(f.id, { languageProfileId }),
  )
  const setLanguages = (v: string) =>
    save.run(v === NO_LANGUAGES ? null : v).then(
      () => toast.success(`Subtitle languages saved for ${f.path}`),
      (e: Error) => toast.error('Couldn’t save the subtitle languages', { description: e.message }),
    )
  const movies = f.movies === 0 ? 'No movies' : f.movies === 1 ? '1 movie' : `${f.movies} movies`
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
            movies,
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
            {f.movies === 1 ? '1 movie is' : `${f.movies} movies are`} filed under it. Move them to
            another folder first.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-caption text-text-3">
          <span aria-hidden>Subtitle languages for movies added here</span>
          <Select
            aria-label={`Subtitle languages for movies added to ${f.path}`}
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
      </div>
      <div className="flex flex-wrap gap-2 justify-self-start medium:justify-self-end">
        <Button size="sm" variant="ghost" icon="import" asChild>
          <a href={adminHref('/activity/import')} aria-label={`Import what’s already in ${f.path}`}>
            Import what’s already here
          </a>
        </Button>
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

function AddFolder() {
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAction((c, p: string) => c.rootFolders.add(p))

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
    toast.success(`${p} added`, { description: 'Movies already in it are added as they’re found.' })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <Field
        label="Add a root folder"
        hint="A folder on the server, not on this device. highsea checks it exists and can write to it."
        error={error ?? undefined}
      >
        <div className="flex flex-wrap gap-2">
          <Input
            value={path}
            icon="folder"
            placeholder="/data/media/movies"
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
