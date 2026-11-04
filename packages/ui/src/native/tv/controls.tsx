// SPDX-License-Identifier: AGPL-3.0-only
// The TV's own parts beside the controls. The TV's buttons and chips are the library's Button and
// Chip at the TV's rule (controls.md; design system 1.1), not components of their own. What stays
// here: a key on the on-screen keyboard, a grid cell at the control's height and corner that fills
// with `text` when focused, and a message that fills the screen with its actions.
import type { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import { ControlText } from '../control.tsx'
import { Text } from '../text.tsx'
import { useControl, useTheme } from '../theme.tsx'
import { Focusable, type ViewHandle } from './focusable.tsx'

export { alpha } from '../alpha.ts'

/** A key on the on-screen keyboard: a grid cell that fills with `text` on focus. */
export function TvKey({
  children,
  onPress,
  onFocus,
  width,
  preferred,
  label,
  ref,
}: {
  children: string
  onPress: () => void
  onFocus?: () => void
  width: number
  preferred?: boolean
  label?: string
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const m = useControl()
  return (
    <Focusable
      ref={ref}
      onPress={onPress}
      onFocus={onFocus}
      preferred={preferred}
      label={label ?? children}
      ring={false}
      width={width}
      radius={m.radius}
    >
      {(focused) => (
        <View
          style={{
            height: m.height,
            borderRadius: m.radius,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: focused ? theme.colors.text : theme.colors['control-overlay'],
          }}
        >
          <ControlText m={m} weight={m.weight} color={theme.colors[focused ? 'bg' : 'text']}>
            {children}
          </ControlText>
        </View>
      )}
    </Focusable>
  )
}

/** A full-screen message (unreachable, nothing here yet), with its actions. */
export function TvMessage({
  title,
  children,
  actions,
  level = 1,
}: {
  title: string
  children?: ReactNode
  actions: ReactNode
  /** Its title's heading level: 1, as it's all the screen holds, unless the screen has its own. */
  level?: number
}) {
  const u = useTheme().u
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ maxWidth: 46 * u, alignItems: 'center', gap: 1.4 * u }}>
        <Text
          variant="heroTitle"
          size={2.4}
          align="center"
          accessibilityRole="header"
          aria-level={level}
        >
          {title}
        </Text>
        {children ? (
          <Text variant="synopsis" color="text-2" align="center">
            {children}
          </Text>
        ) : null}
        <View style={{ marginTop: 1 * u, flexDirection: 'row', gap: 1 * u }}>{actions}</View>
      </View>
    </View>
  )
}
