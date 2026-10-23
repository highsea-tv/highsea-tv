'use client'
import type { TorrentCategory } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client's Categories group (checkpoint 6b, answer 5): new layout, since no
// prototype screen manages categories. It follows Media management's root folders: a list, each
// with its folder and how many torrents use it, Remove asked first and disabled while torrents use
// it, and a form below to add one or change a folder. Changes save at once, through
// `downloads.saveCategory` and `removeCategory`, not the page's save bar.
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { Badge, Button, ConfirmDialog, Field, Icon, Input, toast } from '@highsea-tv/ui-web'
import { type FormEvent, useState } from 'react'
import { categories as messages } from './download-categories-messages.ts'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'

export const CATEGORY_TOPICS = ['torrents.updated']

export function Categories() {
  const t = useT(messages)
  const list = useQuery('torrents:categories', (c) => c.downloads.categories(), CATEGORY_TOPICS)
  const [removing, setRemoving] = useState<TorrentCategory | null>(null)
  const remove = useAction((c, name: string) => c.downloads.removeCategory({ params: { name } }))
  return (
    <Group title={t('title')} description={t('description')}>
      <Loadable query={list} what={t('what')}>
        {(cs) => (
          <ul aria-label={t('title')} className="grid gap-2">
            {cs.map((c) => (
              <Category key={c.name} category={c} onRemove={() => setRemoving(c)} />
            ))}
          </ul>
        )}
      </Loadable>
      <AddCategory onSaved={list.refetch} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('removeTitle', { name: removing?.name ?? '' })}
        description={t('removeBody')}
        confirmLabel={t('removeConfirm')}
        cancelLabel={t('keep')}
        destructive
        onConfirm={() => {
          const c = removing
          if (c)
            remove.run(c.name).then(
              () => {
                toast({ title: t('removed', { name: c.name }) })
                list.refetch()
              },
              (e: Error) => toast.error(t('removeFailed'), { description: e.message }),
            )
        }}
      />
    </Group>
  )
}

function Category({ category: c, onRemove }: { category: TorrentCategory; onRemove: () => void }) {
  const t = useT(messages)
  const inUse = c.torrents > 0
  const id = `category-in-use-${c.name.replace(/\W/g, '-')}`
  return (
    <li className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center">
      <div className="grid min-w-0 gap-1">
        <p className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-text text-ui">{c.name}</span>
          {c.fixed && <Badge tone="neutral">{t('builtIn')}</Badge>}
        </p>
        <p className="flex min-w-0 items-center gap-2">
          <Icon name="folder" size={16} className="shrink-0 text-text-3" />
          <span className="min-w-0 font-mono text-mono text-text-2 [overflow-wrap:anywhere]">
            {c.folder}
          </span>
        </p>
        <p id={inUse && !c.fixed ? id : undefined} className="text-caption text-text-3">
          {inUse && !c.fixed
            ? t('inUse', { count: c.torrents })
            : t('torrents', { count: c.torrents })}
        </p>
      </div>
      {!c.fixed && (
        <Button
          size="sm"
          variant="danger"
          className="justify-self-start medium:justify-self-end"
          aria-label={t('removeLabel', { name: c.name })}
          aria-describedby={inUse ? id : undefined}
          disabled={inUse}
          onClick={onRemove}
        >
          {t('remove')}
        </Button>
      )}
    </li>
  )
}

function AddCategory({ onSaved }: { onSaved: () => void }) {
  const t = useT(messages)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [errors, setErrors] = useState<{ name?: string; folder?: string }>({})
  const save = useAction((c, body: { name: string; folder: string | null }) =>
    c.downloads.saveCategory({ body }),
  )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setErrors({ name: t('missing') })
    try {
      const saved = await save.run({ name: n, folder: folder.trim() || null })
      setName('')
      setFolder('')
      setErrors({})
      toast.success(t('saved', { name: saved.name }))
      onSaved()
    } catch (err) {
      const field = ((err as ApiError).details as { field?: string } | undefined)?.field
      setErrors(
        field === 'folder' ? { folder: (err as Error).message } : { name: (err as Error).message },
      )
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      <div className="grid items-start gap-4 medium:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label={t('name')} hint={t('nameHint')} error={errors.name}>
          <Input
            value={name}
            maxLength={40}
            spellCheck={false}
            autoCapitalize="none"
            onChange={(e) => {
              setErrors({})
              setName(e.target.value)
            }}
          />
        </Field>
        <Field label={t('folder')} hint={t('folderHint')} error={errors.folder}>
          <Input
            value={folder}
            icon="folder"
            placeholder={t('folderPlaceholder')}
            spellCheck={false}
            autoCapitalize="none"
            className="font-mono"
            onChange={(e) => {
              setErrors({})
              setFolder(e.target.value)
            }}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" icon="add" loading={save.pending}>
          {t('save')}
        </Button>
      </div>
    </form>
  )
}
