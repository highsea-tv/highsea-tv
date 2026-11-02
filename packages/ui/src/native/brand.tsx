// SPDX-License-Identifier: AGPL-3.0-only
// The highsea mark (docs/brand/logo.md), drawn live from @highsea-tv/brand's geometry so it takes
// the theme's accent, and the avatar: the person's initial on accent-soft.
import { MARK_GRID, MARK_SMALL_BELOW, markGeometry } from '@highsea-tv/brand'
import { useId } from 'react'
import { View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg'
import { Text } from './text.tsx'
import { useTheme } from './theme.tsx'

export function Mark({ size = 24, label }: { size?: number; label?: string }) {
  const theme = useTheme()
  const id = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const g = markGeometry
  const px = size * theme.u
  const cut = px < MARK_SMALL_BELOW ? g.cutSmall : g.cut
  return (
    <Svg
      width={px}
      height={px}
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      accessible={!!label}
      accessibilityLabel={label}
    >
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.colors.accent} />
          <Stop offset="1" stopColor={theme.colors['accent-2']} />
        </LinearGradient>
        <Mask
          id={`${id}m`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={MARK_GRID}
          height={MARK_GRID}
        >
          <Rect width={MARK_GRID} height={MARK_GRID} fill="#fff" />
          {g.swells.map((d) => (
            <Path key={d} d={d} stroke="#000" strokeWidth={cut} fill="none" strokeLinecap="round" />
          ))}
        </Mask>
      </Defs>
      <Circle
        cx={g.disc.cx}
        cy={g.disc.cy}
        r={g.disc.r}
        fill={`url(#${id}g)`}
        mask={`url(#${id}m)`}
      />
    </Svg>
  )
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const theme = useTheme()
  const px = size * theme.u
  return (
    <View
      style={{
        width: px,
        height: px,
        borderRadius: px / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors['accent-soft'],
      }}
    >
      <Text size={size * 0.42} weight={600} color="accent-text">
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  )
}
