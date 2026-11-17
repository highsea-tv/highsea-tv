// SPDX-License-Identifier: AGPL-3.0-only
// The dot on a bell while something is new: the web prototype's, on the button's top end corner.
// The client's top bar draws it on Alerts, and the admin's curation preview on the same bell, so
// the two can't drift. The TV's head draws its own in units (tv/head.tsx's `dot`).
import { View } from 'react-native'
import { tokens, useTheme } from './theme.tsx'

const sp = tokens.space
const DOT = sp['2'] + sp['0.5']
const DOT_AT = sp['1'] + sp['0.5']

/** Laid over its parent's top end corner; the parent names what's new in its label. */
export function NewDot() {
  const theme = useTheme()
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: DOT_AT,
        end: DOT_AT,
        width: DOT,
        height: DOT,
        borderRadius: tokens.radius.pill,
        borderWidth: sp['0.5'],
        borderColor: theme.colors.bg,
        backgroundColor: theme.colors.accent,
      }}
    />
  )
}
