// SPDX-License-Identifier: AGPL-3.0-only
// A colour well beside a colour's hex field (Settings › Appearance's accent and a theme's colours):
// in a browser, HTML's `color` input with the browser's own picker (color-well.web.tsx;
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/color), which
// react-native-web's TextInput can't be. React Native has no colour picker
// (https://reactnative.dev/docs/components-and-apis), so here it's the colour shown in the field
// look, and the hex field beside it is how the colour is changed. The admin, the one place it's
// drawn, runs in a browser.
import { View } from 'react-native'
import type { FieldCommon } from '../shared/controls.ts'
import { fieldBox } from './field.tsx'
import { tokens, useControl, useTheme } from './theme.tsx'

export type ColorWellProps = Pick<FieldCommon, 'size' | 'disabled'> & {
  /** `#rrggbb`, the form HTML's colour input takes. */
  value: string
  onChange: (value: string) => void
  /** Its name, read out (the well has no label of its own). */
  'aria-label': string
}

/** The well's inset round the colour, as the web's `p-1`. */
const WELL_INSET = tokens.space['1']
/** Its width, as the web's `w-12`. */
const WELL_WIDTH = tokens.space['12']

export function ColorWell({ value, size, disabled, 'aria-label': label }: ColorWellProps) {
  const theme = useTheme()
  const m = useControl(size)
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${value}`}
      style={[
        fieldBox(theme, m, false, false),
        {
          width: WELL_WIDTH,
          padding: WELL_INSET,
          opacity: disabled ? tokens.controls.disabledOpacity : 1,
        },
      ]}
    >
      <View style={{ flex: 1, borderRadius: m.radius / 2, backgroundColor: value }} />
    </View>
  )
}
