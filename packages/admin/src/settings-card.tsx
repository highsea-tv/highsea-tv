'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The small parts Settings › Connections, Import lists and Migration share, drawn with the library's
// native renderer since D3 (one-client-platform-d.md): a row's card on `s2` (the web's
// `rounded-md border border-line bg-s2 p-3`), a caption, a dialog form's two columns from medium
// widths (the web's `grid gap-4 medium:grid-cols-2`, a field `medium:col-span-2` unless it's a half),
// and a group of checkboxes with its legend (the web's `<fieldset>`), named by its legend as
// WAI-ARIA's group is (https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/).
import type { ColorRole } from '@highsea-tv/tokens'
import { breakpoints } from '@highsea-tv/tokens'
import { Text, tokens, useTheme, useWindowAtLeast } from '@highsea-tv/ui/native'
import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'

const s = tokens.space
const ui = tokens.adminText.ui

/** Text that breaks anywhere rather than overflowing (CSS's `overflow-wrap: anywhere`). */
export const WRAP_ANYWHERE = { overflowWrap: 'anywhere' } as object
/** A path or address that breaks at any character (CSS's `word-break: break-all`). */
export const BREAK_ALL = { wordBreak: 'break-all' } as object

/** A row's card: `s2` with a line round it, the medium corner and 12 of padding. */
export function Card({
  children,
  gap = s['3'],
  label,
  role = 'listitem',
  style,
}: {
  children: ReactNode
  gap?: number
  /** Its region's name, when it's a region. */
  label?: string
  role?: 'listitem' | 'region' | 'alert' | 'status'
  style?: ViewStyle
}) {
  const theme = useTheme()
  return (
    <View
      role={role}
      aria-label={label}
      style={[
        {
          gap,
          padding: s['3'],
          borderWidth: 1,
          borderColor: theme.colors.line,
          borderRadius: tokens.radius.md,
          backgroundColor: theme.colors.s2,
          minWidth: 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** A list of cards, 8 apart. */
export function Cards({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View role="list" aria-label={label} style={{ gap: s['2'] }}>
      {children}
    </View>
  )
}

/** The caption style, in text-3 unless told. */
export function Note({
  children,
  color = 'text-3',
  role,
  mono,
  style,
}: {
  children: ReactNode
  color?: ColorRole
  role?: 'status' | 'alert'
  mono?: boolean
  style?: object
}) {
  return (
    <Text variant="caption" color={color} role={role} mono={mono} style={style}>
      {children}
    </Text>
  )
}

/** The admin's ui type (13), in text unless told; a heading when given its role and level. */
export function Line({
  children,
  color = 'text',
  weight,
  role,
  style,
  ...aria
}: {
  children: ReactNode
  color?: ColorRole
  weight?: 500 | 600
  role?: 'heading'
  'aria-level'?: number
  'aria-hidden'?: boolean
  style?: object
}) {
  return (
    <Text
      size={ui.size}
      leading={ui.leading}
      color={color}
      weight={weight}
      role={role}
      style={style}
      {...aria}
    >
      {children}
    </Text>
  )
}

/** A dialog's form: its fields in two columns from medium widths, 16 apart. */
export function FormGrid({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: s['4'], rowGap: s['4'] }}>
      {children}
    </View>
  )
}

/** One of a FormGrid's cells: the whole row, or half of it from medium widths. */
export function Cell({ half = false, children }: { half?: boolean; children: ReactNode }) {
  const medium = useWindowAtLeast(breakpoints.medium)
  return (
    <View
      style={
        half && medium
          ? { flexGrow: 1, flexBasis: 0, minWidth: '40%' }
          : { width: '100%', minWidth: 0 }
      }
    >
      {children}
    </View>
  )
}

/**
 * A group of checkboxes with its legend and a hint under it, the checkboxes in a box on `s2`, in two
 * columns from medium widths.
 */
export function CheckGroup({
  legend,
  hint,
  children,
}: {
  legend: string
  hint?: string
  children: ReactNode
}) {
  const theme = useTheme()
  const medium = useWindowAtLeast(breakpoints.medium)
  return (
    <View role="group" aria-label={legend} style={{ gap: s['2'] }}>
      {/* the legend: the group is named by it, so it's read once, as the group's name */}
      <Text
        size={ui.size}
        leading={ui.leading}
        weight={500}
        aria-hidden
        style={{ marginBottom: s['1'] }}
      >
        {legend}
      </Text>
      {hint ? <Note>{hint}</Note> : null}
      <View
        style={
          {
            display: 'grid',
            gridTemplateColumns: medium ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
            gap: s['2'],
            padding: s['3'],
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.md,
            backgroundColor: theme.colors.s2,
          } as unknown as ViewStyle
        }
      >
        {children}
      </View>
    </View>
  )
}
