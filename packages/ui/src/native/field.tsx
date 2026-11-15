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

import { line } from '@highsea-tv/tokens'
import { type ComponentProps, createContext, type ReactNode, useContext, useState } from 'react'
import { Platform, TextInput, type TextStyle, View, type ViewStyle } from 'react-native'
import type { ControlSize, FieldCommon } from '../shared/controls.ts'
import { ControlPress } from './control.tsx'
import { useDense } from './dense.tsx'
import { family, smoothing } from './fonts.ts'
import { Icon, type IconName } from './icon.tsx'
import type { ControlPoints } from './metrics.ts'
import { Text } from './text.tsx'
import {
  fontScaleFor,
  MAX_FONT_MULTIPLIER,
  type Theme,
  tokens,
  useControl,
  useTheme,
} from './theme.tsx'

/** What a Field tells the control inside it. */
type FieldState = { label: string; size?: ControlSize; invalid: boolean; disabled?: boolean }
const FieldContext = createContext<FieldState | null>(null)

export function useField() {
  return useContext(FieldContext)
}

/**
 * The admin's field labels (inside Dense): its ui type (13, medium) and 6 above its control and
 * hint, as the admin's signed-off forms drew them (the web's Label, `text-[13px] font-medium`, in
 * a `gap-1.5` grid), where a client's label is its scale's callout, a step larger (the owner's
 * answer of 2026-11-06 at HT-4).
 */
const DENSE = {
  ...tokens.adminText.ui,
  weight: 500 as const,
  gap: tokens.space['1'] + tokens.space['0.5'],
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
  const dense = useDense()
  return (
    <View style={{ gap: dense ? DENSE.gap : m.gap }}>
      {hideLabel ? null : (
        <Text
          variant="callout"
          size={dense ? DENSE.size : undefined}
          leading={dense ? DENSE.leading : undefined}
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
/** The field look's edge: a thin line (elevation.md › Lines). */
const EDGE = line.thin

export function fieldBox(theme: Theme, m: ControlPoints, focused: boolean, invalid: boolean) {
  const looks = tokens.controls.looks
  const look = invalid ? looks.fieldInvalid : focused ? looks.fieldFocused : looks.field
  const edge = theme.colors[look.edge]
  return {
    minHeight: m.height,
    borderRadius: m.radius,
    borderWidth: EDGE,
    borderColor: edge,
    backgroundColor: theme.colors[look.fill],
    boxShadow: focused || invalid ? `0 0 0 1px ${edge}` : undefined,
  } satisfies ViewStyle
}

/**
 * In a browser, the field look's edge is what shows focus, so the <input> or <textarea> inside
 * draws no outline of its own. react-native-web 0.21's TextInput resets the element's border,
 * background and appearance but not its outline (exports/TextInput's `textinput$raw`), so the
 * browser's `:focus-visible` outline was drawn inside the field's edge, and inside a search field
 * it cut the clear button off into a box of its own. That outline's style is `auto`, which ignores
 * a width, so only `none` removes it (CSS UI 4 § outline-style), as the TV's web engine does
 * (tv/engine.web.tsx). React Native's types list only the outline styles it draws itself
 * (https://reactnative.dev/docs/view-style-props#outlinestyle); react-native-web passes this one
 * on, and the native platforms never get it.
 */
const NO_BROWSER_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle
// a field box drawn around its input is one control: react-native-web writes `data-control`
const FIELD_MARK = { dataSet: { control: 'field' } } as object

type InputOwn = Pick<FieldCommon, 'size' | 'disabled'> & {
  /** Monospace, for codes and addresses. */
  mono?: boolean
  /** The danger edge; a Field with an error sets it. */
  invalid?: boolean
  /**
   * A word inside the field's end, after what's typed: a unit ("days", "KB/s"), as the web's
   * Input `end`. It's part of the field's look, so the focus edge goes round it too; the field's
   * label should say the unit as well, since it isn't read with the value.
   */
  end?: string
  /** An icon inside the field's start, before what's typed (a folder field's), as the web's Input `icon`. */
  icon?: IconName
}

export type InputProps = ComponentProps<typeof TextInput> & InputOwn

function useInput({
  size,
  disabled,
  invalid,
  mono,
  onFocus,
  onBlur,
  maxFontSizeMultiplier,
}: InputProps) {
  const cap = maxFontSizeMultiplier ?? MAX_FONT_MULTIPLIER
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
      // read-only alone reads as a field that can't be changed but still counts; an off field is
      // inactive, as the web's `disabled` said (WCAG 1.4.3 exempts inactive controls' contrast,
      // https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
      'aria-disabled': off || undefined,
      placeholderTextColor: theme.colors[tokens.controls.looks.placeholder.label],
      selectionColor: theme.colors.accent,
      keyboardAppearance: 'dark' as const,
      maxFontSizeMultiplier: cap,
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
      // the ThemeProvider's fontScale, as the OS's text size would grow it, to the same cap
      fontSize: m.text * fontScaleFor(theme, cap),
      ...NO_BROWSER_OUTLINE,
      ...smoothing(),
    },
    scale: fontScaleFor(theme, cap),
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
    end,
    icon,
    ...rest
  } = props
  const { theme, m, focused, off, bad, common, text } = useInput(props)
  if (end || icon)
    return (
      <View
        // measured by the sweeps' row check as its box, not the input inside it
        {...FIELD_MARK}
        style={[
          fieldBox(theme, m, focused, bad),
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: m.gap,
            paddingStart: icon ? m.fieldPad : 0,
            paddingEnd: end ? m.fieldPad : 0,
            opacity: off ? tokens.controls.disabledOpacity : 1,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={m.icon / theme.u} color="text-3" /> : null}
        <TextInput
          {...common}
          style={[
            text,
            {
              flex: 1,
              minWidth: 0,
              alignSelf: 'stretch',
              paddingStart: icon ? 0 : m.fieldPad,
              paddingEnd: end ? 0 : m.fieldPad,
              // the box's edge is inside its height, so the input inside it is that much shorter
              paddingVertical: m.inset - EDGE,
            },
            style,
          ]}
          {...rest}
        />
        {end ? (
          <Text
            aria-hidden
            size={m.text}
            color="text-3"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_MULTIPLIER}
          >
            {end}
          </Text>
        ) : null}
      </View>
    )
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
  const { theme, m, focused, off, bad, common, text, scale } = useInput(props)
  const line = Math.round(m.text * scale * m.leading)
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
      // measured by the sweeps' row check as its box, not the input inside it
      {...FIELD_MARK}
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
            // the box's edge is inside its height (as Input with `end`)
            paddingVertical: m.inset - EDGE,
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
          // square inside the box's edge, so a filled field is the height an empty one is
          style={{
            width: m.height - EDGE * 2,
            height: m.height - EDGE * 2,
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
