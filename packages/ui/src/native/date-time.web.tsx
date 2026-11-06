// SPDX-License-Identifier: AGPL-3.0-only
// The date and time field in a browser: HTML's `datetime-local` input, with the browser's own
// picker (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/datetime-local),
// which react-native-web's TextInput can't be (it sets the input's `type` from `keyboardType`
// and `secureTextEntry` alone). Drawn in the field look as Input is (field.tsx's fieldBox), with
// the browser's outline off, since the edge shows focus. Its name is the Field's label.
import { useState } from 'react'
import type { DateTimeInput as Native } from './date-time.tsx'
import { fieldBox, useField } from './field.tsx'
import { family } from './fonts.ts'
import { tokens, useControl, useTheme } from './theme.tsx'

export const DateTimeInput: typeof Native = ({ value, onChange, size, disabled, invalid }) => {
  const theme = useTheme()
  const field = useField()
  const m = useControl(size ?? field?.size)
  const [focused, setFocused] = useState(false)
  const off = disabled ?? field?.disabled
  const box = fieldBox(theme, m, focused, invalid ?? field?.invalid ?? false)
  return (
    <input
      type="datetime-local"
      aria-label={field?.label}
      aria-invalid={invalid ?? field?.invalid ?? undefined}
      value={value}
      disabled={off}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        minHeight: box.minHeight,
        borderRadius: box.borderRadius,
        border: `${box.borderWidth}px solid ${box.borderColor}`,
        backgroundColor: box.backgroundColor,
        boxShadow: box.boxShadow,
        outline: 'none',
        paddingInline: m.fieldPad,
        paddingBlock: m.inset,
        color: theme.colors.text,
        colorScheme: 'dark',
        fontFamily: family(m.weight),
        fontSize: m.text,
        opacity: off ? tokens.controls.disabledOpacity : 1,
      }}
    />
  )
}
