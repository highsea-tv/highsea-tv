'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client's Categories group (checkpoint 6b, answer 5): new layout, since no
// prototype screen manages categories. It follows Media management's root folders: a list, each
// with its folder and how many torrents use it, Remove asked first and disabled while torrents use
// it, and a form below to add one or change a folder. Changes save at once, through
// `downloads.saveCategory` and `removeCategory`, not the page's save bar.
// Since D3 (one-client-platform-d.md) it's drawn with the library's native renderer, on the web
// through react-native-web, with the same parts, words and behaviour as the web renderer's.
import type { TorrentCategory } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Icon,
  Input,
  Text,
  toast,
  tokens,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { categories as messages } from './download-categories-messages.ts'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { Card, Cards, WRAP_ANYWHERE } from './settings-card.tsx'
import { Columns } from './settings-columns.tsx'

export const CATEGORY_TOPICS = ['torrents.updated']

const s = tokens.space
const ui = tokens.adminText.ui

export function Categories() {
  const t = useT(messages)
  const list = useQuery('torrents:categories', (c) => c.downloads.categories(), CATEGORY_TOPICS)
  const [removing, setRemoving] = useState<TorrentCategory | null>(null)
  const remove = useAction((c, name: string) => c.downloads.removeCategory({ params: { name } }))
  return (
    <Group title={t('title')} description={t('description')}>
      <Loadable query={list} what={t('what')}>
        {(cs) => (
          <Cards label={t('title')}>
            {cs.map((c) => (
              <Category key={c.name} category={c} onRemove={() => setRemoving(c)} />
            ))}
          </Cards>
        )}
      </Loadable>
      <AddCategory onSaved={list.refetch} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
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
  const medium = useWindowAtLeast(breakpoints.medium)
  const inUse = c.torrents > 0
  return (
    <Card
      gap={s['2']}
      style={{
        flexDirection: medium ? 'row' : 'column',
        alignItems: medium ? 'center' : 'stretch',
      }}
    >
      <View style={{ flex: medium ? 1 : undefined, minWidth: 0, gap: s['1'] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}>
          <Text size={ui.size} leading={ui.leading} weight={500}>
            {c.name}
          </Text>
          {c.fixed && <Badge tone="neutral">{t('builtIn')}</Badge>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'], minWidth: 0 }}>
          <Icon name="folder" size={16} color="text-3" />
          <Text
            variant="mono"
            color="text-2"
            style={[{ flexShrink: 1, minWidth: 0 }, WRAP_ANYWHERE]}
          >
            {c.folder}
          </Text>
        </View>
        <Text variant="caption" color="text-3">
          {inUse && !c.fixed
            ? t('inUse', { count: c.torrents })
            : t('torrents', { count: c.torrents })}
        </Text>
      </View>
      {!c.fixed && (
        <View style={{ alignSelf: medium ? 'center' : 'flex-start' }}>
          <Button
            size="sm"
            variant="danger"
            accessibilityLabel={t('removeLabel', { name: c.name })}
            accessibilityHint={inUse ? t('inUse', { count: c.torrents }) : undefined}
            disabled={inUse}
            onPress={onRemove}
          >
            {t('remove')}
          </Button>
        </View>
      )}
    </Card>
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

  const submit = async () => {
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
    <View style={{ gap: s['3'] }}>
      <Columns shares={[1, 2]}>
        <Field label={t('name')} hint={t('nameHint')} error={errors.name}>
          <Input
            value={name}
            maxLength={40}
            spellCheck={false}
            autoCapitalize="none"
            onSubmitEditing={() => void submit()}
            onChangeText={(v) => {
              setErrors({})
              setName(v)
            }}
          />
        </Field>
        <Field label={t('folder')} hint={t('folderHint')} error={errors.folder}>
          <Input
            value={folder}
            icon="folder"
            mono
            placeholder={t('folderPlaceholder')}
            spellCheck={false}
            autoCapitalize="none"
            onSubmitEditing={() => void submit()}
            onChangeText={(v) => {
              setErrors({})
              setFolder(v)
            }}
          />
        </Field>
      </Columns>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button icon="add" loading={save.pending} onPress={() => void submit()}>
          {t('save')}
        </Button>
      </View>
    </View>
  )
}
