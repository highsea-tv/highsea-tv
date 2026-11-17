'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Small parts the work screens' tables share (Activity, Downloads, Now playing), on the library's
// native renderer: the line a filter that shows nothing leaves, a toolbar's figure at its end, a
// row's More menu, and a cell's quieter text.
import { Button, Menu, type MenuOption, Text, Tooltip, tokens } from '@highsea-tv/ui/native'
import { type ComponentRef, type ReactNode, useRef, useState } from 'react'
import { View } from 'react-native'

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure

/** A line in place of a table whose filter shows nothing (the web's px-3.5 py-8 caption). */
export function NoneShown({ children }: { children: string }) {
  return (
    <View style={{ paddingHorizontal: s['3'] + s['0.5'], paddingVertical: s['8'] }}>
      <Text variant="caption" color="text-3" align="center">
        {children}
      </Text>
    </View>
  )
}

/** A figure at a toolbar's end (the web's ms-auto font-mono text-figure text-3). */
export function ToolbarFigure({ children }: { children: string }) {
  return (
    <Text
      size={figure.size}
      leading={figure.leading}
      mono
      color="text-3"
      style={{ marginStart: 'auto' }}
    >
      {children}
    </Text>
  )
}

/** A row's More button and its menu, hung from the button. */
export function RowMenu({ label, items }: { label: string; items: MenuOption[] }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<ComponentRef<typeof View>>(null)
  return (
    <>
      <Button
        ref={anchor}
        size="sm"
        variant="ghost"
        iconOnly
        icon="more"
        accessibilityLabel={label}
        hasPopup="menu"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
      />
      <Menu
        title={label}
        items={items}
        open={open}
        anchor={anchor}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

/** Text in a cell in `text-2` (the web's TableCell className="text-text-2"). */
export function Muted({ children }: { children: ReactNode }) {
  return (
    <Text size={ui.size} leading={ui.leading} color="text-2" numberOfLines={1}>
      {children}
    </Text>
  )
}

/** A path or release name in mono at the admin's `release` size, cut to one line, whole in a tooltip when cut. */
export function Release({
  children,
  color = 'text-2',
}: {
  children: string
  color?: 'text' | 'text-2' | 'text-3'
}) {
  const release = tokens.adminText.release
  return (
    <Tooltip content={children} whenTruncated>
      <Text size={release.size} leading={release.leading} mono color={color} numberOfLines={1}>
        {children}
      </Text>
    </Tooltip>
  )
}
