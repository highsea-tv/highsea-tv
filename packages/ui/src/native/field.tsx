// SPDX-License-Identifier: AGPL-3.0-only
// Fields (controls.md), as the web's field.tsx: a label, the control, a hint or an error under it.
// Inputs, text areas and search fields are the spec's field look: `s1` with the `control-edge`
// edge (3:1, so the field can be found), `focus` while focused and `danger` when invalid, at the
// control's height, its field padding and its text (16 on the phone, so iOS never zooms). The
// focused edge is drawn as a ring outside the 1pt edge, so the text never moves
// (https://reactnative.dev/docs/view-style-props#boxshadow). The input inside a Field takes its
// label as its accessibility label and the label's own text is hidden from VoiceOver, so it's read
// once, on the input (React Native has no <label for>:
// https://reactnative.dev/docs/accessibility#accessibilitylabel).
import { type ComponentProps, createContext, type ReactNode, useContext, useState } from 'react'
import { TextInput, View, type ViewStyle } from 'react-native'
import type { ControlSize, FieldCommon } from '../shared/controls.ts'
import { ControlPress } from './control.tsx'
import { family } from './fonts.ts'
import { Icon, type IconName } from './icon.tsx'
import type { ControlPoints } from './metrics.ts'
import { Text } from './text.tsx'
import { type Theme, tokens, useControl, useTheme } from './theme.tsx'

/** What a Field tells the control inside it. */
type FieldState = { label: string; size?: ControlSize; invalid: boolean; disabled?: boolean }
const FieldContext = createContext<FieldState | null>(null)

export function useField() {
  return useContext(FieldContext)
}

export function Field({
  label,
  hint,
  error,
  hideLabel,
  size,
  disabled,
  children,
}: FieldCommon & { children: ReactNode }) {
  const theme = useTheme()
  const m = useControl(size)
  return (
    <View style={{ gap: m.gap }}>
      {hideLabel ? null : (
        <Text
          variant="callout"
          weight={500}
          color="text-2"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {label}
        </Text>
      )}
      <FieldContext.Provider value={{ label, size, invalid: !!error, disabled }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <View
          style={{ flexDirection: 'row', gap: m.gap, alignItems: 'center' }}
          accessibilityLiveRegion="polite"
        >
          <Icon name="alert" size={m.icon / theme.u} color="badge-danger" />
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

/** The field look's box: fill, edge and corner, by state. */
export function fieldBox(theme: Theme, m: ControlPoints, focused: boolean, invalid: boolean) {
  const looks = tokens.controls.looks
  const look = invalid ? looks.fieldInvalid : focused ? looks.fieldFocused : looks.field
  const edge = theme.colors[look.edge]
  return {
    minHeight: m.height,
    borderRadius: m.radius,
    borderWidth: 1,
    borderColor: edge,
    backgroundColor: theme.colors[look.fill],
    boxShadow: focused || invalid ? `0 0 0 1px ${edge}` : undefined,
  } satisfies ViewStyle
}

type InputOwn = Pick<FieldCommon, 'size' | 'disabled'> & {
  /** Monospace, for codes and addresses. */
  mono?: boolean
  /** The danger edge; a Field with an error sets it. */
  invalid?: boolean
}

export type InputProps = ComponentProps<typeof TextInput> & InputOwn

function useInput({ size, disabled, invalid, mono, onFocus, onBlur }: InputProps) {
  const theme = useTheme()
  const field = useField()
  const m = useControl(size ?? field?.size)
  const [focused, setFocused] = useState(false)
  const off = disabled ?? field?.disabled
  return {
    theme,
    m,
    focused,
    off,
    bad: invalid ?? field?.invalid ?? false,
    common: {
      accessibilityLabel: field?.label,
      editable: !off,
      placeholderTextColor: theme.colors[tokens.controls.looks.placeholder.label],
      selectionColor: theme.colors.accent,
      keyboardAppearance: 'dark' as const,
      maxFontSizeMultiplier: 2,
      onFocus: (e: Parameters<NonNullable<InputProps['onFocus']>>[0]) => {
        setFocused(true)
        onFocus?.(e)
      },
      onBlur: (e: Parameters<NonNullable<InputProps['onBlur']>>[0]) => {
        setFocused(false)
        onBlur?.(e)
      },
    },
    text: {
      color: theme.colors.text,
      fontFamily: family(m.weight, mono ? 'mono' : 'sans'),
      fontSize: m.text,
    },
  }
}

export function Input(props: InputProps) {
  const {
    style,
    mono: _m,
    invalid: _i,
    size: _s,
    disabled: _d,
    onFocus: _f,
    onBlur: _b,
    ...rest
  } = props
  const { theme, m, focused, off, bad, common, text } = useInput(props)
  return (
    <TextInput
      {...common}
      style={[
        fieldBox(theme, m, focused, bad),
        text,
        {
          paddingHorizontal: m.fieldPad,
          // room for text grown by Dynamic Type; at the default size the height wins
          paddingVertical: m.inset,
          opacity: off ? tokens.controls.disabledOpacity : 1,
        },
        style,
      ]}
      {...rest}
    />
  )
}

/** Several lines of text: three lines tall to start, growing with what's typed. */
export function Textarea(props: InputProps) {
  const {
    style,
    mono: _m,
    invalid: _i,
    size: _s,
    disabled: _d,
    onFocus: _f,
    onBlur: _b,
    ...rest
  } = props
  const { theme, m, focused, off, bad, common, text } = useInput(props)
  const line = Math.round(m.text * m.leading)
  return (
    <TextInput
      {...common}
      multiline
      textAlignVertical="top"
      style={[
        fieldBox(theme, m, focused, bad),
        text,
        {
          minHeight: line * 3 + m.fieldPad * 2,
          lineHeight: line,
          paddingHorizontal: m.fieldPad,
          paddingVertical: m.fieldPad - m.inset,
          opacity: off ? tokens.controls.disabledOpacity : 1,
        },
        style,
      ]}
      {...rest}
    />
  )
}

/**
 * A search field: the field look with a magnifier before the text and a clear button after it
 * once something's typed. Its label is read, not shown.
 */
export function SearchField({
  label,
  clearLabel = 'Clear',
  icon = 'search',
  ...props
}: Omit<InputProps, 'accessibilityLabel'> & {
  label: string
  /** The clear button's name for VoiceOver. */
  clearLabel?: string
  icon?: IconName
}) {
  const {
    style,
    mono: _m,
    invalid: _i,
    size: _s,
    disabled: _d,
    onFocus: _f,
    onBlur: _b,
    ...rest
  } = props
  const { theme, m, focused, off, bad, common, text } = useInput(props)
  const iconSize = m.icon / theme.u
  const filled = !!props.value
  return (
    <View
      style={[
        fieldBox(theme, m, focused, bad),
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: m.gap,
          paddingLeft: m.fieldPad,
          opacity: off ? tokens.controls.disabledOpacity : 1,
        },
      ]}
    >
      <Icon name={icon} size={iconSize} color="text-3" />
      <TextInput
        {...common}
        accessibilityLabel={label}
        returnKeyType="search"
        style={[
          text,
          {
            flex: 1,
            alignSelf: 'stretch',
            paddingVertical: m.inset,
            paddingRight: filled ? 0 : m.fieldPad,
          },
          style,
        ]}
        {...rest}
      />
      {filled ? (
        <ControlPress
          accessibilityLabel={clearLabel}
          radius={m.radius}
          haptic={false}
          slop={{ height: m.height, width: m.height }}
          onPress={() => props.onChangeText?.('')}
          style={{
            width: m.height,
            height: m.height,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="close" size={iconSize} color="text-3" />
        </ControlPress>
      ) : null}
    </View>
  )
}
