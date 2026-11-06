'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A19 Collections (collections.md#the-list; checkpoint 8d, ADR 0049), ported from the prototype's
// collections/collections.tsx: every collection the owner and admins made, smart or picked by hand,
// with its mosaic, what it holds now and who sees it. Each opens the editor. A collection a
// featured section draws on can't be deleted: the server refuses (409) and the toast names the
// section, from the list's `usedBy`.
import { COLLECTION_TOPICS, type CollectionSummary } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Press,
  Text,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { CollectionArt } from './collection-art.tsx'
import { collections as messages } from './collections-messages.ts'
import { useAudienceSummary, usePeople } from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { useRouter } from './navigation.tsx'
import { AdminPage } from './shell.tsx'

const s = tokens.space
const ui = tokens.adminText.ui

/** react-native-web's link props, which React Native's types don't name (a Press as an `<a>`). */
export const linkTo = (href: string) => ({ href }) as object

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
        <Button variant="primary" icon="add" onPress={() => router.push(collectionPath('new'))}>
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
                <Button variant="primary" onPress={() => router.push(collectionPath('new'))}>
                  {t('makeOne')}
                </Button>
              }
            >
              {t('noneBody')}
            </EmptyState>
          ) : (
            <View role="list" aria-label={t('label')} style={{ gap: s['3'] }}>
              {xs.map((c) => (
                <CollectionRow key={c.id} c={c} />
              ))}
            </View>
          )
        }
      </Loadable>
    </AdminPage>
  )
}

/** The poster's width in a row (the web's w-14). */
const ART = 56

function CollectionRow({ c }: { c: CollectionSummary }) {
  const t = useT(messages)
  const theme = useTheme()
  const people = usePeople()
  const audience = useAudienceSummary()
  const holds = useHolds()
  const remove = useAction((api) => api.collections.remove({ params: { id: c.id } }))
  const [confirm, setConfirm] = useState(false)
  // the actions beside the words from medium; under them, at the end, in a compact window
  const beside = useWindowAtLeast(breakpoints.medium)
  const actions = (
    <View
      style={{
        flexDirection: 'row',
        gap: s['1'],
        alignSelf: beside ? 'center' : 'flex-end',
        flexShrink: 0,
      }}
    >
      <Button
        size="sm"
        icon="edit"
        accessibilityLabel={t('editNamed', { name: c.name })}
        href={collectionPath(c.id)}
      >
        {t('edit')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="delete"
        accessibilityLabel={t('deleteNamed', { name: c.name })}
        onPress={() => setConfirm(true)}
      />
    </View>
  )
  return (
    <View
      role="listitem"
      style={{
        flexDirection: 'row',
        alignItems: beside ? 'center' : 'flex-start',
        columnGap: s['4'],
        padding: s['4'],
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
      }}
    >
      <CollectionArt poster={c.artwork} mosaic={c.mosaic} width={ART} radius={6} />
      <View style={{ flex: 1, minWidth: 0, gap: s['3'] }}>
        <View style={{ gap: s['1'], minWidth: 0 }}>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}
          >
            <Press
              role="link"
              {...linkTo(collectionPath(c.id))}
              style={{ borderRadius: tokens.radius.sm, flexShrink: 1, minWidth: 0 }}
            >
              {({ hovered }) => (
                <Text
                  size={ui.size}
                  leading={ui.leading}
                  weight={600}
                  style={[
                    { overflowWrap: 'anywhere' } as object,
                    hovered ? { textDecorationLine: 'underline' } : null,
                  ]}
                >
                  {c.name}
                </Text>
              )}
            </Press>
            {c.rules ? <Badge tone="accent">{t('smart')}</Badge> : <Badge>{t('picked')}</Badge>}
            {c.matched > 0 && c.playable === 0 && <Badge tone="warning">{t('hidden')}</Badge>}
          </View>
          {c.words ? (
            <Text variant="caption" color="text-2" numberOfLines={1}>
              {c.words}
            </Text>
          ) : null}
          <Text variant="caption" color="text-3">
            {`${holds(c)} · ${audience(c.audience, people.data)}`}
          </Text>
        </View>
        {beside ? null : actions}
      </View>
      {beside ? actions : null}
      <DeleteDialog
        collection={c}
        open={confirm}
        onClose={() => setConfirm(false)}
        remove={remove.run}
      />
    </View>
  )
}

/** Delete it; while a featured section draws on it, the server refuses and the toast says which. */
export function DeleteDialog({
  collection: c,
  open,
  onClose,
  remove,
  onDeleted,
}: {
  collection: { name: string; usedBy?: CollectionSummary['usedBy'] }
  open: boolean
  onClose: () => void
  remove: () => Promise<unknown>
  onDeleted?: () => void
}) {
  const t = useT(messages)
  const section = c.usedBy?.[0]
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
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
