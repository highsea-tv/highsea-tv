'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Media management (settings.md). Checkpoint 4 builds the Importing group's root
// folders, where the plan manages them (Admin › Root folders): each with its free space and how
// many movies are filed under it (the API's device is a filesystem id for matching disks, not a
// name, so it isn't shown); adding checks the folder exists and the server can write
// to it; removing leaves the disk alone. They're immediate actions, as lists are elsewhere in
// Settings, so there's no save bar. Naming and the other Importing settings have no API yet.
import type { RootFolder } from '@highsea/api-contract'
import { bytes } from '@highsea/core/format'
import { useT } from '@highsea/i18n/react'
import type { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import { Badge, Button, ConfirmDialog, Field, Icon, Input, toast } from '@highsea/ui-web'
import { type FormEvent, useState } from 'react'
import { Loadable } from './loadable.tsx'
import { media as messages } from './media-management-messages.ts'
import { errorReason } from './metadata-locale.ts'
import { AreaPage, Group } from './settings.tsx'

const TOPICS = ['settings.updated', 'movies.updated']

export function MediaManagement() {
  const t = useT(messages)
  return (
    <AreaPage id="media">
      <Group title={t('importing.title')}>
        <RootFolders />
      </Group>
      <p className="text-caption text-text-3">{t('later')}</p>
    </AreaPage>
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
