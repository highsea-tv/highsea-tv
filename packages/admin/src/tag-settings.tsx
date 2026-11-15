'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Media management › Tags (checkpoint 8c). The prototypes have no tag list, so this is
// laid out as the root folders above it are: each tag with what carries it, Rename and Remove, and
// a field to add one. Changes are immediate actions, as folders are; removing asks first and says
// what the tag comes off. A refused label (`exists`) shows the server's sentence under its field.
// Drawn with the library's native renderer since D3 (one-client-platform-d.md), on the web through
// react-native-web, with the same parts, words and behaviour as the web renderer's.
import type { Tag } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction } from '@highsea-tv/sdk/react'
import { line } from '@highsea-tv/tokens'
import {
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  toast,
  tokens,
  useRegularWindow,
  useTheme,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { Card, Cards, Line, Note, WRAP_ANYWHERE } from './settings-card.tsx'
import { useTags } from './tag-picker.tsx'
import { tagsMessages as messages } from './tags-messages.ts'

const s = tokens.space

export function TagSettings() {
  const t = useT(messages)
  const theme = useTheme()
  const medium = useRegularWindow()
  const tags = useTags()
  const [renaming, setRenaming] = useState<Tag | null>(null)
  const [removing, setRemoving] = useState<Tag | null>(null)
  const remove = useAction((c, id: string) => c.tags.remove({ params: { id } }))
  return (
    // the page's #tags anchor (the web's `scroll-mt-20`: the sticky top bar's 80 above it)
    <View nativeID="tags" style={{ scrollMarginTop: s['16'] + s['4'] } as object}>
      <Group title={t('title')} description={t('description')}>
        <Loadable query={tags} what={t('what')}>
          {(all) =>
            all.length === 0 ? (
              <View
                style={{
                  padding: s['4'],
                  borderWidth: line.thin,
                  borderColor: theme.colors.line,
                  borderRadius: tokens.radius.md,
                  backgroundColor: theme.colors.s2,
                }}
              >
                <Note style={{ textAlign: 'center' }}>{t('list.none')}</Note>
              </View>
            ) : (
              <Cards label={t('title')}>
                {all.map((tag) => (
                  <Card
                    key={tag.id}
                    gap={s['2']}
                    style={
                      medium
                        ? { flexDirection: 'row', alignItems: 'center', gap: s['2'] }
                        : undefined
                    }
                  >
                    <View style={{ flex: medium ? 1 : undefined, minWidth: 0, gap: s['1'] }}>
                      <Line weight={500} style={WRAP_ANYWHERE}>
                        {tag.label}
                      </Line>
                      <Note>
                        {t('usage', {
                          movies: tag.usage.movies,
                          others: tag.usage.indexers + tag.usage.lists + tag.usage.connections,
                        })}
                      </Note>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="edit"
                        accessibilityLabel={t('renameLabel', { label: tag.label })}
                        onPress={() => setRenaming(tag)}
                      >
                        {t('rename')}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        accessibilityLabel={t('removeLabel', { label: tag.label })}
                        onPress={() => setRemoving(tag)}
                      >
                        {t('remove')}
                      </Button>
                    </View>
                  </Card>
                ))}
              </Cards>
            )
          }
        </Loadable>
        <AddTag onAdded={tags.refetch} />
      </Group>
      <RenameDialog tag={renaming} onClose={() => setRenaming(null)} onSaved={tags.refetch} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
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
    </View>
  )
}

function AddTag({ onAdded }: { onAdded: () => void }) {
  const t = useT(messages)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAction((c, l: string) => c.tags.add({ body: { label: l } }))
  const submit = async () => {
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
    <Field label={t('add.label')} error={error ?? undefined}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: s['12'] * 4, minWidth: 0 }}>
          <Input
            value={label}
            maxLength={40}
            placeholder={t('add.placeholder')}
            autoCapitalize="none"
            onChangeText={(v) => {
              setError(null)
              setLabel(v)
            }}
            onSubmitEditing={submit}
          />
        </View>
        <Button icon="add" loading={add.pending} onPress={submit}>
          {t('add.submit')}
        </Button>
      </View>
    </Field>
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
  const submit = async () => {
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
    <Dialog
      open={!!tag}
      onClose={close}
      size="sm"
      title={t('rename.title', { label: tag?.label ?? '' })}
      footer={
        <>
          <Button variant="ghost" onPress={close}>
            {t('rename.cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            loading={rename.pending}
            disabled={!label.trim()}
          >
            {t('rename.save')}
          </Button>
        </>
      }
    >
      <Field label={t('rename.field')} error={rename.error?.message}>
        <Input value={label} maxLength={40} onChangeText={setLabel} onSubmitEditing={submit} />
      </Field>
    </Dialog>
  )
}
