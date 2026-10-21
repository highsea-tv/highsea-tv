'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Media management (settings.md), ported from the signed-off prototype's
// MediaManagement (design/prototypes/src/admin/settings/reference.tsx). Naming: rename, the folder
// and file formats with what Sintel's would become, named by the import's own functions
// (@highsea/media/naming), and the tokens. Importing: hardlinks, NFO files, stop monitoring deleted
// files, folder permissions and the recycle bin; then the root folders checkpoint 4 built, where
// the plan manages them (Admin › Root folders): each with its free space and how many movies are
// filed under it (the API's device is a filesystem id for matching disks, not a name, so it isn't
// shown); adding checks the folder exists and the server can write to it; removing leaves the
// disk alone. Folders are immediate actions, as lists are
// elsewhere in Settings, so the save bar is the settings' only. The settings the prototype doesn't
// show and the API has, colon replacement, whether to set permissions at all and how long the
// recycle bin keeps files, join the groups they belong to. A refused save names its field
// (`details.reason`), and the server's sentence shows under it.
import {
  COLON_REPLACEMENTS,
  type MediaManagementSettings,
  type RootFolder,
} from '@highsea/api-contract'
import { bytes } from '@highsea/core/format'
import { useT } from '@highsea/i18n/react'
import { buildFileName, buildFolderName, PREVIEW_FILE, PREVIEW_MOVIE } from '@highsea/media/naming'
import type { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
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
} from '@highsea/ui-web'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Loadable } from './loadable.tsx'
import { media as messages } from './media-management-messages.ts'
import { errorReason } from './metadata-locale.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'

const TOPICS = ['settings.updated', 'movies.updated']

/**
 * The prototype's common tokens. Its `{Edition}` is Radarr's `{Edition Tags}`: the naming engine
 * knows no `{Edition}`, and the server would refuse a format using it.
 */
const TOKENS = ['Movie Title', 'Release Year', 'Quality Full', 'Movie CleanTitle', 'Edition Tags']
  .map((token) => `{${token}}`)
  .join(' ')

type Draft = Omit<MediaManagementSettings, 'recycleBinDays'> & { recycleBinDays: string }

const draftOf = (s: MediaManagementSettings): Draft => ({
  ...s,
  recycleBinDays: String(s.recycleBinDays),
})

export function MediaManagement() {
  const t = useT(messages)
  const data = useQuery('settings:media-management', (c) => c.settings.mediaManagement(), [
    'settings.updated',
  ])
  const folders = <RootFolders />
  return (
    <AreaPage id="media">
      {data.status === 'success' ? (
        // a fresh draft whenever the saved settings change
        <Form
          key={JSON.stringify(data.data)}
          loaded={data.data}
          reload={data.refetch}
          folders={folders}
        />
      ) : (
        <>
          <Loadable query={data} what={t('what')}>
            {() => null}
          </Loadable>
          <Group title={t('importing.title')}>{folders}</Group>
        </>
      )}
    </AreaPage>
  )
}

function Form({
  loaded,
  reload,
  folders,
}: {
  loaded: MediaManagementSettings
  reload: () => void
  folders: ReactNode
}) {
  const t = useT(messages)
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
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  // the import's own naming, so the preview and the files it names never disagree
  const naming = { colonReplacement: v.colonReplacement }

  const submit = async () => {
    const days = v.recycleBinDays.trim()
    const recycleBinDays = Number(days)
    const problems: typeof errors = {}
    if (!/^[0-7]{3}$/.test(v.chmod.trim())) problems.chmod = t('chmod.invalid')
    if (!/^\d+$/.test(days) || recycleBinDays > 3650) problems.recycleBinDays = t('days.invalid')
    if (!v.folderFormat.trim()) problems.folderFormat = t('format.missing')
    if (!v.fileFormat.trim()) problems.fileFormat = t('format.missing')
    if (Object.keys(problems).length) return setErrors(problems)
    try {
      await save.run({ ...v, chmod: v.chmod.trim(), recycleBinDays })
    } catch (e) {
      const reason = errorReason(e)
      if (reason && reason in v) setErrors({ [reason]: (e as Error).message })
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      <Group title={t('naming.title')} description={t('naming.description')}>
        <Field inline label={t('rename')}>
          <Switch checked={v.rename} onCheckedChange={(rename) => set({ rename })} />
        </Field>
        <Field
          label={t('folder')}
          hint={
            <>
              {t('becomes')}{' '}
              <span className="font-mono text-text-2">
                {buildFolderName(v.folderFormat, PREVIEW_MOVIE, naming)}
              </span>
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
          label={t('file')}
          hint={
            <>
              {t('becomes')}{' '}
              <span className="font-mono text-text-2">
                {buildFileName(v.fileFormat, PREVIEW_MOVIE, PREVIEW_FILE, naming)}.mkv
              </span>
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
        <p className="text-caption text-text-3">
          {t('tokens')} {TOKENS}
        </p>
        <div className="grid gap-4 medium:grid-cols-2">
          <Field label={t('colon')} hint={t('colonHint')}>
            <Select
              value={v.colonReplacement}
              disabled={!v.rename}
              onValueChange={(c) => set({ colonReplacement: c as Draft['colonReplacement'] })}
              options={COLON_REPLACEMENTS.map((c) => ({ value: c, label: t(`colon.${c}`) }))}
            />
          </Field>
        </div>
      </Group>
      <Group title={t('importing.title')}>
        <Field inline label={t('hardlinks')} hint={t('hardlinksHint')}>
          <Switch checked={v.hardlinks} onCheckedChange={(hardlinks) => set({ hardlinks })} />
        </Field>
        <Field inline label={t('nfo')} hint={t('nfoHint')}>
          <Switch checked={v.nfo} onCheckedChange={(nfo) => set({ nfo })} />
        </Field>
        <Field inline label={t('unmonitorDeleted')} hint={t('unmonitorDeletedHint')}>
          <Switch
            checked={v.unmonitorDeleted}
            onCheckedChange={(unmonitorDeleted) => set({ unmonitorDeleted })}
          />
        </Field>
        <Field inline label={t('permissions')} hint={t('permissionsHint')}>
          <Switch checked={v.permissions} onCheckedChange={(permissions) => set({ permissions })} />
        </Field>
        <div className="grid gap-4 medium:grid-cols-2">
          <Field label={t('chmod')} hint={t('chmodHint')} error={errors.chmod}>
            <Input
              value={v.chmod}
              disabled={!v.permissions}
              inputMode="numeric"
              maxLength={3}
              onChange={(e) => set({ chmod: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label={t('recycleBin')} hint={t('recycleBinHint')} error={errors.recycleBin}>
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
            label={t('days')}
            hint={t('daysHint')}
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

function RootFolders() {
  const t = useT(messages)
  const folders = useQuery('settings:root-folders', (c) => c.rootFolders.list(), TOPICS)
  const [removing, setRemoving] = useState<RootFolder | null>(null)
  const remove = useAction((c, id: string) => c.rootFolders.remove({ params: { id } }))
  return (
    <div className="grid gap-4">
      <div className="grid gap-0.5">
        <h3 className="font-semibold text-text text-ui">{t('folders.title')}</h3>
        <p className="text-caption text-text-3">{t('folders.description')}</p>
      </div>
      <Loadable query={folders} what={t('folders.what')}>
        {(fs) =>
          fs.length === 0 ? (
            <p className="rounded-md border border-line bg-s2 p-4 text-center text-caption text-text-3">
              {t('folders.none')}
            </p>
          ) : (
            <ul aria-label={t('folders.title')} className="grid gap-2">
              {fs.map((f) => (
                <Folder key={f.id} folder={f} onRemove={() => setRemoving(f)} />
              ))}
            </ul>
          )
        }
      </Loadable>
      <AddFolder onAdded={folders.refetch} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('folders.removeTitle', { path: removing?.path ?? '' })}
        description={t('folders.removeBody')}
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
    </div>
  )
}

function Folder({ folder: f, onRemove }: { folder: RootFolder; onRemove: () => void }) {
  const t = useT(messages)
  const inUse = f.movies > 0
  return (
    <li className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center">
      <div className="grid min-w-0 gap-1">
        <p className="flex min-w-0 items-center gap-2">
          <Icon name="folder" size={16} className="shrink-0 text-text-3" />
          <span className="min-w-0 font-mono text-mono text-text [overflow-wrap:anywhere]">
            {f.path}
          </span>
          {!f.accessible && <Badge tone="warning">{t('folders.unreadable')}</Badge>}
        </p>
        <p className="text-caption text-text-3">
          {[
            f.free !== null && f.total !== null
              ? t('folders.free', { free: bytes(f.free), total: bytes(f.total) })
              : null,
            t('folders.movies', { count: f.movies }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {inUse && (
          <p id={`in-use-${f.id}`} className="text-caption text-text-3">
            {t('folders.inUse', { count: f.movies })}
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="danger"
        className="justify-self-start medium:justify-self-end"
        aria-label={t('folders.removeLabel', { path: f.path })}
        aria-describedby={inUse ? `in-use-${f.id}` : undefined}
        disabled={inUse}
        onClick={onRemove}
      >
        {t('folders.remove')}
      </Button>
    </li>
  )
}

function AddFolder({ onAdded }: { onAdded: () => void }) {
  const t = useT(messages)
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAction((c, p: string) => c.rootFolders.add({ body: { path: p } }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const p = path.trim()
    if (!p) return setError(t('add.missing'))
    if (!p.startsWith('/')) return setError(t('add.notAbsolute'))
    try {
      await add.run(p)
    } catch (err) {
      const reason = errorReason(err)
      return setError(
        reason === 'not-absolute'
          ? t('add.notAbsolute')
          : reason === 'not-found'
            ? t('add.notFound')
            : reason === 'not-writable'
              ? t('add.notWritable')
              : (err as ApiError).code === 'conflict'
                ? t('add.conflict')
                : (err as Error).message,
      )
    }
    setPath('')
    setError(null)
    toast.success(t('add.added', { path: p }))
    onAdded()
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <Field label={t('add.label')} hint={t('add.hint')} error={error ?? undefined}>
        <div className="flex gap-2">
          <Input
            value={path}
            icon="folder"
            placeholder={t('add.placeholder')}
            spellCheck={false}
            autoCapitalize="none"
            className="flex-1 font-mono"
            onChange={(e) => {
              setError(null)
              setPath(e.target.value)
            }}
          />
          <Button type="submit" icon="add" loading={add.pending}>
            {t('add.submit')}
          </Button>
        </div>
      </Field>
    </form>
  )
}
