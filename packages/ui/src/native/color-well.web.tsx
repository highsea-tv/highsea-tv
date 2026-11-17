// SPDX-License-Identifier: AGPL-3.0-only
// The colour well in a browser: HTML's `color` input, with the browser's own picker
// (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/color), which
// react-native-web's TextInput can't be (it sets the input's `type` from `keyboardType` and
// `secureTextEntry` alone). Drawn in the field look as Input is (field.tsx's fieldBox), at the
// control's height, as the web renderer's admin drew it (`w-12 p-1`), with the browser's outline
// off while the edge shows focus.
import { useState } from 'react'
import type { ColorWell as Native } from './color-well.tsx'
import { fieldBox } from './field.tsx'
import { tokens, useControl, useTheme } from './theme.tsx'

/** The well's inset round the colour and its width, as color-well.tsx's (`p-1`, `w-12`). */
const WELL_INSET = tokens.space['1']
const WELL_WIDTH = tokens.space['12']

export const ColorWell: typeof Native = ({
  value,
  onChange,
  size,
  disabled,
  'aria-label': label,
}) => {
  const theme = useTheme()
  const m = useControl(size)
  const [focused, setFocused] = useState(false)
  const box = fieldBox(theme, m, focused, false)
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        boxSizing: 'border-box',
        flexShrink: 0,
        width: WELL_WIDTH,
        height: box.minHeight,
        borderRadius: box.borderRadius,
        border: `${box.borderWidth}px solid ${box.borderColor}`,
        backgroundColor: box.backgroundColor,
        boxShadow: box.boxShadow,
        outline: 'none',
        padding: WELL_INSET,
        // an input keeps the browser's own type size (13.33px) unless it's set, which the row
        // check counts as a field of another size beside its neighbours; it draws no text
        fontSize: m.text,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? tokens.controls.disabledOpacity : 1,
      }}
    />
  )
}
