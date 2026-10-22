'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Choosing tags (checkpoint 8c), in the movie's, an indexer's, a list's and a connection's edit
// dialogs. The prototypes have no tag control, so this is the smallest one the design system
// makes: the chosen tags as badges, and a menu of every tag with a check beside each (Radix's
// DropdownMenu.CheckboxItem, kept open while choosing by preventing `onSelect`'s close, as Radix's
// docs describe: https://www.radix-ui.com/primitives/docs/components/dropdown-menu#checkboxitem).
// Tags are made in Settings › Media management, which the empty menu links to.
import type { Tag } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  useFieldControl,
} from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
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

export function TagBadges({ tags, ids }: { tags: readonly Tag[] | undefined; ids: string[] }) {
  const t = useT(messages)
  const labels = labelsOf(tags, ids)
  return labels.length ? (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <Badge key={l}>{l}</Badge>
      ))}
    </span>
  ) : (
    <span className="text-text-3">{t('none')}</span>
  )
}

export function TagPicker({
  value,
  onChange,
  name,
  id,
  describedBy,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  /** What's being tagged, for the button's accessible name outside a `Field`. */
  name?: string
  id?: string
  describedBy?: string
}) {
  const t = useT(messages)
  const router = useRouter()
  const tags = useTags()
  // inside a Field, its label names the button and its hint describes it
  const control = useFieldControl({ id, 'aria-describedby': describedBy })
  const all = tags.data ?? []
  const toggle = (tagId: string, on: boolean) =>
    onChange(on ? [...new Set([...value, tagId])] : value.filter((v) => v !== tagId))
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <TagBadges tags={all} ids={value} />
      <Menu>
        <MenuTrigger asChild>
          <Button
            id={control.id}
            size="sm"
            variant="ghost"
            iconEnd="chevron-down"
            aria-label={name ? t('chooseFor', { name }) : undefined}
            aria-describedby={control['aria-describedby']}
            loading={tags.status === 'loading'}
          >
            {t('choose')}
          </Button>
        </MenuTrigger>
        <MenuContent>
          {all.length === 0 ? (
            <MenuItem disabled>{t('empty')}</MenuItem>
          ) : (
            all.map((tag) => (
              <MenuCheckboxItem
                key={tag.id}
                checked={value.includes(tag.id)}
                onCheckedChange={(on) => toggle(tag.id, on === true)}
                onSelect={(e) => e.preventDefault()}
              >
                {tag.label}
              </MenuCheckboxItem>
            ))
          )}
          <MenuSeparator />
          <MenuItem icon="settings" onSelect={() => router.push(TAG_SETTINGS)}>
            {t('manage')}
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  )
}
