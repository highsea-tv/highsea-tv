// SPDX-License-Identifier: AGPL-3.0-only
// A labelled field (field.tsx in ui-web): the label, the input, a hint or an error under it. The
// input is 44pt high on s2 with the strong line, the focus ring on focus. The input inside takes
// the label as its accessibility label, and the label's own text is hidden from VoiceOver, so it's
// read once, on the field (React Native has no <label for>:
// https://reactnative.dev/docs/accessibility#accessibilitylabel).
import { type ComponentProps, createContext, type ReactNode, useContext, useState } from 'react'
import { TextInput, View } from 'react-native'
import { family } from './fonts.ts'
import { Icon } from './icon.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

const FieldLabel = createContext<string | undefined>(undefined)

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: 6 * theme.u }}>
      <Text
        variant="callout"
        weight={500}
        color="text-2"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </Text>
      <FieldLabel.Provider value={label}>{children}</FieldLabel.Provider>
      {error ? (
        <View
          style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
          accessibilityLiveRegion="polite"
        >
          <Icon name="alert" size={14} color="badge-danger" />
          <Text variant="caption" color="badge-danger">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" color="text-3">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

export function Input({
  style,
  mono,
  invalid,
  onFocus,
  onBlur,
  ...props
}: ComponentProps<typeof TextInput> & { mono?: boolean; invalid?: boolean }) {
  const theme = useTheme()
  const label = useContext(FieldLabel)
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={theme.colors['text-3']}
      selectionColor={theme.colors.accent}
      keyboardAppearance="dark"
      maxFontSizeMultiplier={2}
      onFocus={(e) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        onBlur?.(e)
      }}
      style={[
        {
          minHeight: tokens.targets.touch * theme.u,
          paddingHorizontal: 12 * theme.u,
          // room around text grown by Dynamic Type; at the default size the touch height wins
          paddingVertical: 8 * theme.u,
          borderRadius: tokens.radius.sm * theme.u,
          borderWidth: focused ? 2 : 1,
          borderColor: invalid
            ? theme.colors.danger
            : focused
              ? theme.colors.focus
              : theme.colors['line-strong'],
          backgroundColor: theme.colors.s2,
          color: theme.colors.text,
          fontFamily: family(400, mono ? 'mono' : 'sans'),
          fontSize: 16 * theme.u,
        },
        style,
      ]}
      {...props}
    />
  )
}
