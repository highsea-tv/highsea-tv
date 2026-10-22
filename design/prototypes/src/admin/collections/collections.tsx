// SPDX-License-Identifier: AGPL-3.0-only
// Collections (docs/product/collections.md#the-list): every collection the owner and admins made,
// smart or picked by hand, with its mosaic, what it holds now and who sees it. Each opens the
// editor, where rules, exceptions and the live result sit side by side.
import { Badge, Button, ConfirmDialog, EmptyState, toast } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { CollectionArt } from '../../kit/collection-art.tsx'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { CollectionSummary } from '../../mock/types.ts'
import { audienceSummary, useUsers } from '../curation/shared.tsx'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'

/** "4 match · 3 in the apps", or how many are picked. */
export function holds(c: Pick<CollectionSummary, 'matched' | 'playable'>): string {
  if (c.matched === 0) return 'Nothing matches yet'
  const films = `${c.matched} ${c.matched === 1 ? 'film' : 'films'}`
  return c.playable === c.matched
    ? `${films}, all in the apps`
    : `${films}, ${c.playable} in the apps`
}

export function Collections() {
  const [, navigate] = useLocation()
  const list = useQuery('collections', (c) => c.collections.list(), [
    'collections.updated',
    'movies.updated',
  ])
  return (
    <AdminPage
      title="Collections"
      description="Films grouped by rules that keep themselves up to date, or picked by hand. They show in every app’s library."
      actions={
        <Button variant="primary" icon="add" onClick={() => navigate('/collections/new')}>
          New collection
        </Button>
      }
    >
      <Loadable query={list} what="the collections">
        {(xs) =>
          xs.length === 0 ? (
            <EmptyState
              icon="library"
              title="No collections yet"
              action={
                <Button variant="primary" onClick={() => navigate('/collections/new')}>
                  Make one
                </Button>
              }
            >
              Describe the films you want, say from the 2010s, rated 4.5 or more, in English, and
              the collection keeps up as the library changes. Or pick films by hand.
            </EmptyState>
          ) : (
            <ul aria-label="Collections" className="grid gap-3">
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
  const users = useUsers()
  const remove = useAction((api) => api.collections.remove(c.id))
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[3.5rem_minmax(0,1fr)_auto] medium:items-center">
      <CollectionArt poster={c.artwork} mosaic={c.mosaic} className="w-14 rounded-[6px]" />
      <div className="grid min-w-0 gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <a
            href={adminHref(`/collections/${c.id}`)}
            className="font-semibold text-text text-ui outline-none hover:underline focus-visible:ring-focus"
          >
            {c.name}
          </a>
          {c.rules ? <Badge tone="accent">Smart</Badge> : <Badge>Picked</Badge>}
          {c.matched > 0 && c.playable === 0 && <Badge tone="warning">Hidden in the apps</Badge>}
        </p>
        {c.words && <p className="truncate text-caption text-text-2">{c.words}</p>}
        <p className="text-caption text-text-3">
          {holds(c)} · {audienceSummary(c.audience, users.data)}
        </p>
      </div>
      <div className="col-start-2 flex gap-1 justify-self-end medium:col-start-auto">
        <Button size="sm" icon="edit" asChild>
          <a href={adminHref(`/collections/${c.id}`)} aria-label={`Edit ${c.name}`}>
            Edit
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="delete"
          aria-label={`Delete ${c.name}`}
          onClick={() => setConfirm(true)}
        />
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${c.name}”?`}
        description="It leaves every app’s library. The films in it stay in the library."
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          remove
            .run()
            .then(() => toast({ title: `“${c.name}” deleted` }))
            .catch((e: Error) =>
              toast.error('Couldn’t delete the collection', { description: e.message }),
            )
        }
      />
    </li>
  )
}
