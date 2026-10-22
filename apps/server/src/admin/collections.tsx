'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A19 Collections (collections.md#the-list; checkpoint 8d, ADR 0049), ported from the prototype's
// collections/collections.tsx: every collection the owner and admins made, smart or picked by hand,
// with its mosaic, what it holds now and who sees it. Each opens the editor. A collection a
// featured section draws on can't be deleted: the server refuses (409) and the toast names the
// section, from the list's `usedBy`.
import { COLLECTION_TOPICS, type CollectionSummary } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import { Badge, Button, ConfirmDialog, EmptyState, toast } from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CollectionArt } from './collection-art.tsx'
import { collections as messages } from './collections-messages.ts'
import { useAudienceSummary, usePeople } from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { AdminPage } from './shell.tsx'

export const collectionPath = (id: string) => `/collections/${id}`

/** The list's own changes, and the library's, which change what each holds. */
export const COLLECTION_LIST_TOPICS = [COLLECTION_TOPICS.collections, 'movies.updated']

/** "4 films, 3 in the apps", or nothing yet. */
export function useHolds() {
  const t = useT(messages)
  return (c: Pick<CollectionSummary, 'matched' | 'playable'>): string =>
    c.matched === 0
      ? t('holds.none')
      : c.playable === c.matched
        ? t('holds.all', { count: c.matched })
        : t('holds.some', { count: c.matched, playable: c.playable })
}

export function Collections() {
  const t = useT(messages)
  const router = useRouter()
  const list = useQuery('collections', (c) => c.collections.list(), COLLECTION_LIST_TOPICS)
  return (
    <AdminPage
      title={t('title')}
      description={t('description')}
      actions={
        <Button variant="primary" icon="add" onClick={() => router.push(collectionPath('new'))}>
          {t('new')}
        </Button>
      }
    >
      <Loadable query={list} what={t('what')}>
        {(xs) =>
          xs.length === 0 ? (
            <EmptyState
              icon="library"
              title={t('none')}
              action={
                <Button variant="primary" onClick={() => router.push(collectionPath('new'))}>
                  {t('makeOne')}
                </Button>
              }
            >
              {t('noneBody')}
            </EmptyState>
          ) : (
            <ul aria-label={t('label')} className="grid gap-3">
              {xs.map((c) => (
                <CollectionRow key={c.id} c={c} />
              ))}
            </ul>
          )
        }
      </Loadable>
    </AdminPage>
  )
}

function CollectionRow({ c }: { c: CollectionSummary }) {
  const t = useT(messages)
  const people = usePeople()
  const audience = useAudienceSummary()
  const holds = useHolds()
  const remove = useAction((api) => api.collections.remove({ params: { id: c.id } }))
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[3.5rem_minmax(0,1fr)_auto] medium:items-center">
      <CollectionArt poster={c.artwork} mosaic={c.mosaic} className="w-14 rounded-[6px]" />
      <div className="grid min-w-0 gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <a
            href={collectionPath(c.id)}
            className="font-semibold text-text text-ui outline-none hover:underline focus-visible:ring-focus"
          >
            {c.name}
          </a>
          {c.rules ? <Badge tone="accent">{t('smart')}</Badge> : <Badge>{t('picked')}</Badge>}
          {c.matched > 0 && c.playable === 0 && <Badge tone="warning">{t('hidden')}</Badge>}
        </p>
        {c.words && <p className="truncate text-caption text-text-2">{c.words}</p>}
        <p className="text-caption text-text-3">
          {holds(c)} · {audience(c.audience, people.data)}
        </p>
      </div>
      <div className="col-start-2 flex gap-1 justify-self-end medium:col-start-auto">
        <Button size="sm" icon="edit" asChild>
          <a href={collectionPath(c.id)} aria-label={t('editNamed', { name: c.name })}>
            {t('edit')}
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="delete"
          aria-label={t('deleteNamed', { name: c.name })}
          onClick={() => setConfirm(true)}
        />
      </div>
      <DeleteDialog collection={c} open={confirm} onOpenChange={setConfirm} remove={remove.run} />
    </li>
  )
}

/** Delete it; while a featured section draws on it, the server refuses and the toast says which. */
export function DeleteDialog({
  collection: c,
  open,
  onOpenChange,
  remove,
  onDeleted,
}: {
  collection: { name: string; usedBy?: CollectionSummary['usedBy'] }
  open: boolean
  onOpenChange: (open: boolean) => void
  remove: () => Promise<unknown>
  onDeleted?: () => void
}) {
  const t = useT(messages)
  const section = c.usedBy?.[0]
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('deleteTitle', { name: c.name })}
      description={t('deleteBody')}
      confirmLabel={t('delete')}
      destructive
      onConfirm={() =>
        remove()
          .then(() => {
            toast({ title: t('deleted', { name: c.name }) })
            onDeleted?.()
          })
          .catch((e: Error) =>
            toast.error(t('deleteFailed'), {
              description:
                e instanceof ApiError && e.code === 'conflict' && section
                  ? t('inUse', { title: section.title })
                  : e.message,
            }),
          )
      }
    />
  )
}
