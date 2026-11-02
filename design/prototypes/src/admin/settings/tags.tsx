// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Media management › Tags, as apps/server built it (tag-settings.tsx): each tag with
// what carries it, Rename and Remove, and a field to add one. Changes are immediate actions, as
// root folders are; removing asks first and says what the tag comes off. A refused label shows the
// server's sentence under its field.
import { Button, ConfirmDialog, Dialog, DialogContent, Field, Input, toast } from '@highsea-tv/ui'
import { type FormEvent, useState } from 'react'
import { useAction } from '../../mock/hooks.tsx'
import type { Tag } from '../../mock/settings.ts'
import { Loadable } from '../loadable.tsx'
import { useTags } from './parts.tsx'
import { Group } from './settings.tsx'

const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`

/** "3 movies · 1 indexer, list or connection", as the server's catalog words it. */
function usage(t: Tag) {
  const others = t.usage.indexers + t.usage.lists + t.usage.connections
  return `${t.usage.movies === 0 ? 'No movies' : plural(t.usage.movies, 'movie', 'movies')} · ${
    others === 0
      ? 'nothing else'
      : plural(others, 'indexer, list or connection', 'indexers, lists or connections')
  }`
}

export function TagSettings() {
  const tags = useTags()
  const [renaming, setRenaming] = useState<Tag | null>(null)
  const [removing, setRemoving] = useState<Tag | null>(null)
  const remove = useAction((c, id: string) => c.tags.remove(id))
  return (
    <div id="tags" className="scroll-mt-20">
      <Group
        title="Tags"
        description="Tags tie movies to the indexers, lists and connections that should serve them. An indexer or connection with tags works only for movies sharing one; a list’s tags go on every movie it adds."
      >
        <Loadable query={tags} what="the tags">
          {(all) =>
            all.length === 0 ? (
              <p className="rounded-md border border-line bg-s2 p-4 text-center text-caption text-text-3">
                No tags yet.
              </p>
            ) : (
              <ul aria-label="Tags" className="grid gap-2">
                {all.map((tag) => (
                  <li
                    key={tag.id}
                    className="grid gap-2 rounded-md border border-line bg-s2 p-3 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center"
                  >
                    <div className="grid min-w-0 gap-1">
                      <p className="min-w-0 font-medium text-text text-ui [overflow-wrap:anywhere]">
                        {tag.label}
                      </p>
                      <p className="text-caption text-text-3">{usage(tag)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-self-start medium:justify-self-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="edit"
                        aria-label={`Rename ${tag.label}`}
                        onClick={() => setRenaming(tag)}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Remove ${tag.label}`}
                        onClick={() => setRemoving(tag)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Loadable>
        <AddTag />
      </Group>
      <RenameDialog tag={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.label ?? ''}?`}
        description="It comes off every movie, indexer, list and connection that has it. An indexer or connection left with no tags works for every movie again."
        confirmLabel="Remove tag"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          const tag = removing
          if (tag)
            remove.run(tag.id).then(
              () => toast({ title: `${tag.label} removed` }),
              (e: Error) => toast.error('Couldn’t save the tag', { description: e.message }),
            )
        }}
      />
    </div>
  )
}

function AddTag() {
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAction((c, l: string) => c.tags.add(l))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const l = label.trim()
    if (!l) return setError('Enter a label.')
    try {
      await add.run(l)
    } catch (err) {
      return setError((err as Error).message)
    }
    setLabel('')
    setError(null)
    toast.success(`${l} added`)
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <Field label="New tag" error={error ?? undefined}>
        <div className="flex flex-wrap gap-2">
          <Input
            value={label}
            maxLength={40}
            placeholder="kids"
            autoCapitalize="none"
            className="min-w-0 flex-1 basis-48"
            onChange={(e) => {
              setError(null)
              setLabel(e.target.value)
            }}
          />
          <Button type="submit" icon="add" loading={add.pending}>
            Add tag
          </Button>
        </div>
      </Field>
    </form>
  )
}

function RenameDialog({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const [label, setLabel] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  // each opening starts from the tag's label
  if (tag && shown !== tag.id) {
    setShown(tag.id)
    setLabel(tag.label)
  }
  const rename = useAction((c, id: string, l: string) => c.tags.rename(id, l))
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
    toast.success(`Renamed to ${l}`)
    close()
  }
  return (
    <Dialog open={!!tag} onOpenChange={(o) => !o && close()}>
      <DialogContent
        size="sm"
        title={`Rename ${tag?.label ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => submit()}
              loading={rename.pending}
              disabled={!label.trim()}
            >
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={submit} noValidate>
          <Field label="Label" error={rename.error?.message}>
            <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
