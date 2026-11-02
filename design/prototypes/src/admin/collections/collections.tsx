// SPDX-License-Identifier: AGPL-3.0-only
// Collections (docs/product/collections.md#the-list): every collection the owner and admins made,
// smart or picked by hand, with its mosaic, what it holds now (films and shows, counted as the apps
// count them) and who sees it. Each opens the editor, where rules, exceptions and the live result
// sit side by side.
import { Badge, Button, ConfirmDialog, EmptyState, toast } from '@highsea-tv/ui'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { titlesHere } from '../../client/data.ts'
import { CollectionArt } from '../../kit/collection-art.tsx'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { CollectionSummary } from '../../mock/types.ts'
import { audienceSummary, useUsers } from '../curation/shared.tsx'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'

/** "6 movies and 1 show, all in the apps", or how many of them the apps show. */
export function holds(
  c: Pick<CollectionSummary, 'matched' | 'playable' | 'showsHere' | 'showsPlayable'>,
): string {
  const all = c.matched + c.showsHere
  if (all === 0) return 'Nothing matches yet'
  const what = titlesHere(c.matched, c.showsHere)
  const shown = c.playable + c.showsPlayable
  return shown === all ? `${what}, all in the apps` : `${what}, ${shown} in the apps`
}

/** Something in it, and none of it in the apps yet. */
const hidden = (c: CollectionSummary) =>
  c.matched + c.showsHere > 0 && c.playable + c.showsPlayable === 0

export function Collections() {
  const [, navigate] = useLocation()
  const list = useQuery('collections', (c) => c.collections.list(), [
    'collections.updated',
    'movies.updated',
    'shows.updated',
  ])
  return (
    <AdminPage
      title="Collections"
      description="Films grouped by rules that keep themselves up to date, or films and shows picked by hand. They show in every app’s library."
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
              the collection keeps up as the library changes. Or pick films and shows by hand.
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
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 [overflow-wrap:anywhere]">
        <p className="flex flex-wrap items-center gap-2">
          <a
            href={adminHref(`/collections/${c.id}`)}
            className="font-semibold text-text text-ui outline-none hover:underline focus-visible:ring-focus"
          >
            {c.name}
          </a>
          {c.rules ? <Badge tone="accent">Smart</Badge> : <Badge>Picked</Badge>}
          {hidden(c) && <Badge tone="warning">Hidden in the apps</Badge>}
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
        description="It leaves every app’s library. What’s in it stays in the library."
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
