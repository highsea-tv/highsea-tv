'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Media management › Tags (checkpoint 8c). The prototypes have no tag list, so this is
// laid out as the root folders above it are: each tag with what carries it, Rename and Remove, and
// a field to add one. Changes are immediate actions, as folders are; removing asks first and says
// what the tag comes off. A refused label (`exists`) shows the server's sentence under its field.
import type { Tag } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { useAction } from '@highsea/sdk/react'
import { Button, ConfirmDialog, Dialog, DialogContent, Field, Input, toast } from '@highsea/ui-web'
import { type FormEvent, useState } from 'react'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { useTags } from './tag-picker.tsx'
import { tagsMessages as messages } from './tags-messages.ts'

export function TagSettings() {
  const t = useT(messages)
  const tags = useTags()
  const [renaming, setRenaming] = useState<Tag | null>(null)
  const [removing, setRemoving] = useState<Tag | null>(null)
  const remove = useAction((c, id: string) => c.tags.remove({ params: { id } }))
  return (
    <div id="tags" className="scroll-mt-20">
      <Group title={t('title')} description={t('description')}>
        <Loadable query={tags} what={t('what')}>
          {(all) =>
            all.length === 0 ? (
              <p className="rounded-md border border-line bg-s2 p-4 text-center text-caption text-text-3">
                {t('list.none')}
              </p>
            ) : (
              <ul aria-label={t('title')} className="grid gap-2">
                {all.map((tag) => (
                  <li
                    key={tag.id}
                    className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center"
                  >
                    <div className="grid min-w-0 gap-1">
                      <p className="min-w-0 font-medium text-text text-ui [overflow-wrap:anywhere]">
                        {tag.label}
                      </p>
                      <p className="text-caption text-text-3">
                        {t('usage', {
                          movies: tag.usage.movies,
                          others: tag.usage.indexers + tag.usage.lists + tag.usage.connections,
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-self-start medium:justify-self-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="edit"
                        aria-label={t('renameLabel', { label: tag.label })}
                        onClick={() => setRenaming(tag)}
                      >
                        {t('rename')}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={t('removeLabel', { label: tag.label })}
                        onClick={() => setRemoving(tag)}
                      >
                        {t('remove')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Loadable>
        <AddTag onAdded={tags.refetch} />
      </Group>
      <RenameDialog tag={renaming} onClose={() => setRenaming(null)} onSaved={tags.refetch} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('remove.title', { label: removing?.label ?? '' })}
        description={t('remove.body')}
        confirmLabel={t('remove.confirm')}
        cancelLabel={t('remove.keep')}
        destructive
        onConfirm={() => {
          const tag = removing
          if (tag)
            remove.run(tag.id).then(
              () => {
                toast({ title: t('remove.done', { label: tag.label }) })
                tags.refetch()
              },
              (e: Error) => toast.error(t('failed'), { description: e.message }),
            )
        }}
      />
    </div>
  )
}

function AddTag({ onAdded }: { onAdded: () => void }) {
  const t = useT(messages)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAction((c, l: string) => c.tags.add({ body: { label: l } }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const l = label.trim()
    if (!l) return setError(t('add.missing'))
    try {
      await add.run(l)
    } catch (err) {
      return setError((err as Error).message)
    }
    setLabel('')
    setError(null)
    toast.success(t('add.added', { label: l }))
    onAdded()
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <Field label={t('add.label')} error={error ?? undefined}>
        <div className="flex gap-2">
          <Input
            value={label}
            maxLength={40}
            placeholder={t('add.placeholder')}
            autoCapitalize="none"
            className="flex-1"
            onChange={(e) => {
              setError(null)
              setLabel(e.target.value)
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

function RenameDialog({
  tag,
  onClose,
  onSaved,
}: {
  tag: Tag | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT(messages)
  const [label, setLabel] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  // each opening starts from the tag's label
  if (tag && shown !== tag.id) {
    setShown(tag.id)
    setLabel(tag.label)
  }
  const rename = useAction((c, id: string, l: string) =>
    c.tags.rename({ params: { id }, body: { label: l } }),
  )
  const close = () => {
    setShown(null)
    rename.reset()
    onClose()
  }
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!tag) return
    const l = label.trim()
    if (!l) return
    try {
      await rename.run(tag.id, l)
    } catch {
      return
    }
    toast.success(t('rename.saved', { label: l }))
    onSaved()
    close()
  }
  return (
    <Dialog open={!!tag} onOpenChange={(o) => !o && close()}>
      <DialogContent
        size="sm"
        title={t('rename.title', { label: tag?.label ?? '' })}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('rename.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => submit()}
              loading={rename.pending}
              disabled={!label.trim()}
            >
              {t('rename.save')}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} noValidate>
          <Field label={t('rename.field')} error={rename.error?.message}>
            <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
