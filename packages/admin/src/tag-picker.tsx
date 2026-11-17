'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Choosing tags (checkpoint 8c), in the movie's, an indexer's, a list's and a connection's edit
// dialogs. The prototypes have no tag control, so this is the smallest one the design system
// makes: the chosen tags as badges, and a menu of every tag with a check beside each, kept open
// while choosing (the native Menu's `checked` and `keepsOpen` items, menuitemcheckbox: WAI-ARIA's
// menu button pattern, https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/). Drawn with the
// library's native renderer since D2 (one-client-platform-d.md). Tags are made in Settings › Media
// management, which the menu's last item opens.
import type { Tag } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useQuery } from '@highsea-tv/sdk/react'
import { Badge, Button, Menu, Text, tokens, useField } from '@highsea-tv/ui/native'
import { type ComponentRef, useRef, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from './navigation.tsx'
import { tagsMessages as messages } from './tags-messages.ts'

/** Where tags are made. */
export const TAG_SETTINGS = '/settings/media#tags'

/** Every tag, kept current: the pickers and the library's filter share it. */
export function useTags() {
  return useQuery('tags', (c) => c.tags.list(), ['tags.updated'])
}

/** The labels of `ids`, A to Z as the server orders them; unknown ids are left out. */
export const labelsOf = (tags: readonly Tag[] | undefined, ids: readonly string[]) =>
  (tags ?? []).filter((t) => ids.includes(t.id)).map((t) => t.label)

const ui = tokens.adminText.ui

export function TagBadges({ tags, ids }: { tags: readonly Tag[] | undefined; ids: string[] }) {
  const t = useT(messages)
  const labels = labelsOf(tags, ids)
  return labels.length ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space['1'] }}>
      {labels.map((l) => (
        <Badge key={l}>{l}</Badge>
      ))}
    </View>
  ) : (
    <Text size={ui.size} leading={ui.leading} color="text-3">
      {t('none')}
    </Text>
  )
}

export function TagPicker({
  value,
  onChange,
  name,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  /** What's being tagged, for the button's accessible name; inside a `Field`, its label. */
  name?: string
}) {
  const t = useT(messages)
  const router = useRouter()
  const tags = useTags()
  const field = useField()
  const anchor = useRef<ComponentRef<typeof View>>(null)
  const [open, setOpen] = useState(false)
  const all = tags.data ?? []
  const toggle = (tagId: string, on: boolean) =>
    onChange(on ? [...new Set([...value, tagId])] : value.filter((v) => v !== tagId))
  const named = name ?? field?.label
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: tokens.space['2'],
        minWidth: 0,
      }}
    >
      <TagBadges tags={all} ids={value} />
      <Button
        ref={anchor}
        size="sm"
        variant="ghost"
        iconEnd="chevron-down"
        accessibilityLabel={named ? t('chooseFor', { name: named }) : undefined}
        hasPopup="menu"
        accessibilityState={{ expanded: open }}
        loading={tags.status === 'loading'}
        onPress={() => setOpen(true)}
      >
        {t('choose')}
      </Button>
      <Menu
        title={t('label')}
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        items={[
          ...(all.length === 0
            ? [{ label: t('empty'), group: t('label'), disabled: true, onSelect: () => {} }]
            : all.map((tag) => {
                const on = value.includes(tag.id)
                return {
                  label: tag.label,
                  // a heading, so Manage tags stands apart below a line
                  group: t('label'),
                  checked: on,
                  keepsOpen: true,
                  onSelect: () => toggle(tag.id, !on),
                }
              })),
          {
            label: t('manage'),
            icon: 'settings' as const,
            closes: 'leave' as const,
            onSelect: () => router.push(TAG_SETTINGS),
          },
        ]}
      />
    </View>
  )
}
