// SPDX-License-Identifier: AGPL-3.0-only
// A segmented control (segmented.tsx in ui-web): a few exclusive choices on s2, the chosen one
// raised on s4. Each segment is a 44pt target.
import { View } from 'react-native'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  const theme = useTheme()
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        padding: 3,
        gap: 3,
        borderRadius: tokens.radius.sm + 2,
        backgroundColor: theme.colors.s2,
      }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <Press
            key={o.value}
            haptic
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: tokens.targets.touch - 6,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: tokens.radius.sm,
              backgroundColor: on ? theme.colors.s4 : 'transparent',
            }}
          >
            <Text variant="callout" weight={on ? 600 : 500} color={on ? 'text' : 'text-2'}>
              {o.label}
            </Text>
          </Press>
        )
      })}
    </View>
  )
}
