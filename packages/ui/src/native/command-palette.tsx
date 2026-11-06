// SPDX-License-Identifier: AGPL-3.0-only
// The command palette: ⌘K / Ctrl K anywhere (accessibility.md#operable). A searchable list of
// commands in a level-4 card over the scrim (./scrim.ts), drawn once for the native renderer
// (one-client-platform-d.md › D3) at the web renderer's sizes (web/components/command-palette.tsx).
// It keeps what the web's had from cmdk (https://github.com/pacocoursey/cmdk): each command matched
// by its label, its id and its keywords, ranked by command-score (./command-score.ts) with the
// commands that don't match hidden, groups ordered by their best command, the first command chosen
// whenever what's typed changes, and the arrows going round the list.
// It is WAI-ARIA's combobox with a listbox popup (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
// focus stays in the search field, which is the `combobox`, names the list it `aria-controls` and
// the chosen option by `aria-activedescendant`; Up and Down move the choice, going round, Home and
// End take the first and last, Enter runs it, and Escape closes the palette (react-native-web's
// Modal closes on Escape: exports/Modal/ModalContent.js). Each option is a Press with `role="option"`
// and `aria-selected` that takes no focus, so a pointer runs it and its hover chooses it.
// react-native-web writes `nativeID` as the element's `id` and forwards `onKeyPress` the browser's
// keydown (exports/TextInput's handleKeyDown), so the field's keys are its own.

import { useT } from '@highsea-tv/i18n/react'
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Modal, Platform, TextInput, type TextStyle, useWindowDimensions, View } from 'react-native'
import { Kbd } from './admin.tsx'
import { commandScore } from './command-score.ts'
import { family } from './fonts.ts'
import { Icon } from './icon.tsx'
import type { IconName } from './icons.ts'
import { uiMessages } from './messages.ts'
import { Press } from './press.tsx'
import { useScrimStyle } from './scrim.ts'
import { ScrollView } from './scroll-view.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export type CommandItem = {
  id: string
  label: string
  icon?: IconName
  /** Extra words that should match ("torrents" for Downloads). */
  keywords?: string[]
  shortcut?: string
  /** Secondary text, at the end. */
  hint?: ReactNode
  onSelect: () => void
}

export type CommandGroup = { heading: string; items: CommandItem[] }

export type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: CommandGroup[]
  placeholder?: string
  /** What shows when nothing matches. Default "Nothing matches that." */
  empty?: ReactNode
  /**
   * What's typed, as it changes: for results the caller looks up itself (a library too big to
   * list up front). Its items are filtered like any other, so give them the words they match by.
   */
  onSearchChange?: (search: string) => void
}

/** A key pressed, as the DOM's KeyboardEvent has it; React Native's types have no DOM. */
type KeyEvent = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  preventDefault: () => void
}
type KeyTarget = {
  addEventListener?: (type: 'keydown', listener: (e: KeyEvent) => void) => void
  removeEventListener?: (type: 'keydown', listener: (e: KeyEvent) => void) => void
}

/** Opens the palette on ⌘K / Ctrl K. Only the web has a window to listen to. */
export function useCommandPaletteShortcut(toggle: () => void): void {
  useEffect(() => {
    const target = (globalThis as { window?: KeyTarget }).window
    if (!target?.addEventListener) return
    const onKey = (e: KeyEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        toggle()
      }
    }
    target.addEventListener('keydown', onKey)
    return () => target.removeEventListener?.('keydown', onKey)
  }, [toggle])
}

/** The commands that match what's typed, best first, in groups ordered by their best (cmdk's). */
export function rankCommands(groups: CommandGroup[], typed: string): CommandGroup[] {
  const words = typed.trim()
  if (!words) return groups.filter((g) => g.items.length > 0)
  const ranked = groups
    .map((g) => {
      const items = g.items
        .map((item) => ({
          item,
          score: commandScore(`${item.label} ${item.id}`, words, item.keywords),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
      return { heading: g.heading, items, best: items[0]?.score ?? 0 }
    })
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.best - a.best)
  return ranked.map((g) => ({ heading: g.heading, items: g.items.map((x) => x.item) }))
}

/**
 * The field draws no browser outline: the palette's own line under it frames it, as the web's
 * `outline-none` did (field.tsx's NO_BROWSER_OUTLINE, which says why only `none` works).
 */
const NO_BROWSER_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle

/** react-native-web's props that React Native's types don't name. */
const web = (props: Record<string, unknown>) => (Platform.OS === 'web' ? (props as object) : null)

/** The chosen option scrolled into the list's view, on the web, where the list is the page's. */
function revealOption(id: string) {
  type Doc = { getElementById: (id: string) => { scrollIntoView?: (o: object) => void } | null }
  const doc = (globalThis as { document?: Doc }).document
  doc?.getElementById(id)?.scrollIntoView?.({ block: 'nearest' })
}

/** Its sizes, the web renderer's: px-4 header, h-12 field, min-h-9 rows, p-1.5 list. */
const SIZE = {
  width: 560,
  margin: tokens.space['4'],
  field: 48,
  row: 36,
  list: 360,
  // 1.5 and 2.5 steps of the 4px base, which tokens.space doesn't name
  listPad: 6,
  rowPad: 10,
  rowText: 13.5,
} as const

export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder = 'Search or jump to…',
  empty,
  onSearchChange,
}: CommandPaletteProps) {
  const theme = useTheme()
  const scrim = useScrimStyle()
  const t = useT(uiMessages)
  const window = useWindowDimensions()
  const [typed, setTyped] = useState('')
  const [chosen, setChosen] = useState(0)
  const base = useId().replace(/:/g, '')
  const listId = `${base}-list`
  const titleId = `${base}-title`
  const optionId = (i: number) => `${base}-option-${i}`
  const shown = useMemo(() => rankCommands(groups, typed), [groups, typed])
  const flat = useMemo(() => shown.flatMap((g) => g.items), [shown])
  const last = useRef(typed)

  // each search starts at its best command; the list changing under the same words keeps the
  // choice where it can (results the caller looks up arrive later)
  useEffect(() => {
    if (last.current !== typed) {
      last.current = typed
      setChosen(0)
    } else setChosen((c) => (c < flat.length ? c : 0))
  }, [typed, flat.length])

  // closed, it forgets what was typed, as the web's did when its dialog unmounted
  useEffect(() => {
    if (!open) {
      setTyped('')
      setChosen(0)
    }
  }, [open])

  const chosenId = flat.length > 0 ? optionId(chosen) : undefined
  useEffect(() => {
    if (open && chosenId) revealOption(chosenId)
  }, [open, chosenId])

  const type = (s: string) => {
    setTyped(s)
    onSearchChange?.(s)
  }
  const close = () => onOpenChange(false)
  const run = (item: CommandItem | undefined) => {
    if (!item) return
    close()
    item.onSelect()
  }
  const onKeyPress = (e: { nativeEvent: { key: string }; preventDefault: () => void }) => {
    const key = e.nativeEvent.key
    const n = flat.length
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault()
      if (n > 0) setChosen((c) => (c + (key === 'ArrowDown' ? 1 : -1) + n) % n)
    } else if (key === 'Home' || key === 'End') {
      e.preventDefault()
      if (n > 0) setChosen(key === 'Home' ? 0 : n - 1)
    } else if (key === 'Enter') {
      e.preventDefault()
      run(flat[chosen])
    }
  }

  const fieldText: TextStyle = {
    fontFamily: family(400, 'sans'),
    fontSize: tokens.adminText.form.size,
    lineHeight: tokens.adminText.form.size * tokens.adminText.form.leading,
    color: theme.colors.text,
  }
  let index = 0
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
      {...web({ 'aria-labelledby': titleId })}
    >
      <View style={{ flex: 1, alignItems: 'center', paddingTop: window.height * 0.12 }}>
        {/* the scrim closes it, as the web's overlay did */}
        <Press
          accessibilityLabel={t('close')}
          focusable={false}
          ring={false}
          onPress={close}
          style={{
            position: 'absolute',
            top: 0,
            start: 0,
            end: 0,
            bottom: 0,
            ...scrim,
          }}
        >
          {null}
        </Press>
        <View
          accessibilityViewIsModal
          style={{
            width: Math.min(SIZE.width, window.width - SIZE.margin * 2),
            overflow: 'hidden',
            borderRadius: tokens.radius.lg,
            backgroundColor: theme.colors.s3,
            boxShadow: tokens.elevation[4].boxShadow,
          }}
        >
          <View
            pointerEvents="none"
            style={{ position: 'absolute', width: 1, height: 1, margin: -1, overflow: 'hidden' }}
          >
            <Text accessibilityRole="header" aria-level={2} nativeID={titleId} numberOfLines={1}>
              {t('commandPalette')}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SIZE.rowPad,
              paddingHorizontal: tokens.space['4'],
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.line,
            }}
          >
            <Icon name="search" size={tokens.icon.size.sm} color="text-3" />
            <TextInput
              autoFocus
              value={typed}
              onChangeText={type}
              onKeyPress={onKeyPress}
              placeholder={placeholder}
              placeholderTextColor={theme.colors['text-3']}
              autoCorrect={false}
              autoCapitalize="none"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              {...web({
                'aria-activedescendant': chosenId,
              })}
              style={[
                fieldText,
                NO_BROWSER_OUTLINE,
                {
                  height: SIZE.field,
                  flex: 1,
                  minWidth: 0,
                },
              ]}
            />
            <Kbd>esc</Kbd>
          </View>
          <ScrollView
            style={{ maxHeight: Math.min(SIZE.list, window.height * 0.6) }}
            contentContainerStyle={{ padding: SIZE.listPad }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              // ARIA's listbox, which React Native's roles don't name; react-native-web writes it
              {...({ role: 'listbox' } as object)}
              nativeID={listId}
              aria-label={placeholder}
            >
              {flat.length === 0 ? (
                <View
                  style={{
                    paddingHorizontal: tokens.space['3'],
                    paddingVertical: tokens.space['8'],
                    alignItems: 'center',
                  }}
                >
                  <Text
                    size={tokens.adminText.ui.size}
                    leading={tokens.adminText.ui.leading}
                    color="text-2"
                    style={{ textAlign: 'center' }}
                  >
                    {empty ?? t('nothingMatches')}
                  </Text>
                </View>
              ) : (
                shown.map((group) => {
                  const headingId = `${base}-group-${group.heading.replace(/\W+/g, '-')}`
                  return (
                    <View key={group.heading} role="group" aria-labelledby={headingId}>
                      <View
                        style={{
                          paddingHorizontal: SIZE.rowPad,
                          paddingTop: tokens.space['2'],
                          paddingBottom: tokens.space['1'],
                        }}
                      >
                        <Text
                          variant="label"
                          nativeID={headingId}
                          color="text-3"
                          style={{ textTransform: 'uppercase' }}
                        >
                          {group.heading}
                        </Text>
                      </View>
                      {group.items.map((item) => {
                        const i = index++
                        const selected = i === chosen
                        return (
                          <Press
                            key={item.id}
                            nativeID={optionId(i)}
                            role="option"
                            aria-selected={selected}
                            focusable={false}
                            ring={false}
                            onHoverIn={() => setChosen(i)}
                            onPress={() => run(item)}
                            style={{
                              minHeight: SIZE.row,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: SIZE.rowPad,
                              paddingHorizontal: SIZE.rowPad,
                              borderRadius: tokens.radius.sm,
                              backgroundColor: selected ? theme.colors.s4 : 'transparent',
                            }}
                          >
                            {item.icon ? (
                              <Icon
                                name={item.icon}
                                size={tokens.icon.size.sm}
                                color={selected ? 'text' : 'text-2'}
                              />
                            ) : null}
                            <Text
                              size={SIZE.rowText}
                              color={selected ? 'text' : 'text-2'}
                              numberOfLines={1}
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {item.label}
                            </Text>
                            {item.hint ? (
                              <Text variant="caption" color={selected ? 'text' : 'text-2'}>
                                {item.hint}
                              </Text>
                            ) : null}
                            {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
                          </Press>
                        )
                      })}
                    </View>
                  )
                })
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
