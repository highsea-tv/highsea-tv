// SPDX-License-Identifier: AGPL-3.0-only
// The pointer's keyboard shortcuts outside the player (desktop-web.md › Keyboard, design language
// v1.0): `/` opens Search with its field focused, and `?` lists the shortcuts in the library's
// Dialog, with Close (the owner's decision of 2026-11-15). Neither fires while typing in a field,
// with Ctrl, ⌘ or Alt held, or while a dialog is open; the player (/play, outside this shell) keeps
// its own keys, which the list names too (player/pointer.tsx). Only the web and the desktop app
// have a keyboard here, so off the web it listens to nothing (./page-keys).
import { SEEK_S } from '@highsea-tv/client/player'
import { useT } from '@highsea-tv/i18n/react'
import { Button, Dialog, Kbd, Text, tokens } from '@highsea-tv/ui'
import { type Href, router, usePathname } from 'expo-router'
import { useRef, useState } from 'react'
import { View } from 'react-native'
import { usePageKeys } from './page-keys'
import { shortcutsMessages } from './shortcuts-messages.ts'

const { space } = tokens

/** What a key press does here, or nothing: the rules above, apart so they can be tested alone. */
export function shortcutOf(e: KeyboardEvent): 'search' | 'list' | null {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return null
  const target = e.target as Element | null
  if (target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
    return null
  if (typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]')) return null
  return e.key === '/' ? 'search' : e.key === '?' ? 'list' : null
}

/** Focuses Search's field: as Search opens its field takes focus itself (search.tsx's autoFocus). */
function focusSearch(pathname: string) {
  if (pathname !== '/search') return router.navigate('/search' as Href)
  if (typeof document === 'undefined') return
  document.querySelector<HTMLElement>('[role="searchbox"]')?.focus()
}

/** The shortcuts and their list, mounted once in the pointer's shell. */
export function PointerShortcuts() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const here = useRef(pathname)
  here.current = pathname
  usePageKeys((e) => {
    const s = shortcutOf(e)
    if (!s) return
    // the key isn't typed into the field it focuses
    e.preventDefault()
    if (s === 'search') focusSearch(here.current)
    else setOpen(true)
  })
  return <ShortcutsDialog open={open} onClose={() => setOpen(false)} />
}

type Shortcut = { keys: string[]; name: string; action: string }

/** The list: two groups, each a key or two and what it does. */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(shortcutsMessages)
  const groups: { title: string; items: Shortcut[] }[] = [
    {
      title: t('anywhere'),
      items: [
        { keys: ['/'], name: t('key.slash'), action: t('search') },
        { keys: ['?'], name: t('key.question'), action: t('list') },
      ],
    },
    {
      title: t('player'),
      items: [
        { keys: ['Space'], name: t('key.space'), action: t('playPause') },
        { keys: ['←', '→'], name: t('key.arrows'), action: t('seek', { seconds: SEEK_S }) },
        { keys: ['M'], name: t('key.m'), action: t('mute') },
        { keys: ['F'], name: t('key.f'), action: t('fullScreen') },
        { keys: ['esc'], name: t('key.escape'), action: t('leave') },
      ],
    },
  ]
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('title')}
      size="sm"
      footer={
        <Button variant="primary" onPress={onClose}>
          {t('close')}
        </Button>
      }
    >
      <View style={{ gap: space['5'] }}>
        {groups.map((g) => (
          <View key={g.title} style={{ gap: space['2'] }}>
            <Text variant="label" color="text-3" accessibilityRole="header" aria-level={3}>
              {g.title}
            </Text>
            <View role="list" style={{ gap: space['2'] }}>
              {g.items.map((s) => (
                <View
                  key={s.name}
                  role="listitem"
                  accessible
                  accessibilityLabel={t('row', { keys: s.name, action: s.action })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'] }}
                >
                  <View style={{ flexDirection: 'row', gap: space['1'], minWidth: space['16'] }}>
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </View>
                  <Text variant="body" color="text-2">
                    {s.action}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </Dialog>
  )
}
