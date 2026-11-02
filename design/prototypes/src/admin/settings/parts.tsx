// SPDX-License-Identifier: AGPL-3.0-only
// What the Settings areas share: an area backed by one settings section with its save bar, the
// tag picker every edit dialog uses (apps/server's tag-picker.tsx), and reading a refused call's
// field or reason (the server's `details`).
import { relative } from '@highsea-tv/core/format'
import {
  Badge,
  Button,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  toast,
  useFieldControl,
} from '@highsea-tv/ui-web'
import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import { useNow, useQuery } from '../../mock/hooks.tsx'
import type { Settings as AllSettings, SettingsSection, Tag } from '../../mock/settings.ts'
import { AreaPage, SaveBar, useSettingsDraft } from './settings.tsx'

/** An area backed by one settings section: loads it, keeps a draft, and shows the save bar. */
export function Area<K extends SettingsSection>({
  id,
  section,
  actions,
  children,
}: {
  id: string
  section: K
  actions?: ReactNode
  children: (
    value: AllSettings[K],
    set: (patch: Partial<AllSettings[K]>) => void,
    replace: (v: AllSettings[K]) => void,
  ) => ReactNode
}) {
  const s = useSettingsDraft(section)
  return (
    <AreaPage id={id} actions={actions}>
      {s.query.status === 'error' ? (
        <p className="text-badge-danger text-ui">
          Couldn’t load these settings. {s.query.error.message}
        </p>
      ) : !s.draft ? (
        <p aria-busy className="text-caption text-text-3">
          Loading…
        </p>
      ) : (
        <>
          {children(s.draft, s.set, s.replace)}
          <SaveBar
            dirty={s.dirty}
            saving={s.saving}
            onDiscard={s.discard}
            onSave={() =>
              s
                .save()
                .then(() => toast.success('Settings saved'))
                .catch((e: Error) => toast.error('Couldn’t save', { description: e.message }))
            }
          />
        </>
      )}
    </AreaPage>
  )
}

export const options = (xs: [string, string][]) => xs.map(([value, label]) => ({ value, label }))

/** "3 hours ago", on the simulated clock. */
export function useAgo() {
  const now = useNow()
  return (iso: string) => relative(iso, now)
}

/** The field a refused call names (`details.field`), without its `settings.` prefix. */
export function fieldOf(error: unknown): string | undefined {
  const field = (error as { details?: { field?: unknown } } | null)?.details?.field
  return typeof field === 'string' ? field.replace(/^settings\./, '') : undefined
}

/** Why a call was refused (`details.reason`), when the server says. */
export function reasonOf(error: unknown): string | undefined {
  const reason = (error as { details?: { reason?: unknown } } | null)?.details?.reason
  return typeof reason === 'string' ? reason : undefined
}

// ---------------------------------------------------------------- tags

/** Every tag, kept current: the pickers and Media management's list share it. */
export function useTags() {
  return useQuery('tags', (c) => c.tags.list(), ['settings.updated'])
}

export function TagBadges({ tags, ids }: { tags: readonly Tag[] | undefined; ids: string[] }) {
  const labels = (tags ?? []).filter((t) => ids.includes(t.id)).map((t) => t.label)
  return labels.length ? (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <Badge key={l}>{l}</Badge>
      ))}
    </span>
  ) : (
    <span className="text-text-3">None</span>
  )
}

/**
 * Choosing tags in an edit dialog: the chosen ones as badges, and a menu of every tag with a check
 * beside each, kept open while choosing. Tags are made in Media management, which the menu links to.
 */
export function TagPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const [, navigate] = useLocation()
  const tags = useTags()
  // inside a Field, its label names the button and its hint describes it
  const control = useFieldControl({})
  const all = tags.data ?? []
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...new Set([...value, id])] : value.filter((v) => v !== id))
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
            aria-describedby={control['aria-describedby']}
            loading={tags.status === 'loading'}
          >
            Choose tags
          </Button>
        </MenuTrigger>
        <MenuContent>
          {all.length === 0 ? (
            <MenuItem disabled>No tags yet.</MenuItem>
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
          <MenuItem icon="settings" onSelect={() => navigate('/settings/media')}>
            Manage tags
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  )
}
