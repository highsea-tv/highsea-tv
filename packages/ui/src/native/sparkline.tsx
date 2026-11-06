// SPDX-License-Identifier: AGPL-3.0-only
// A small line graph for live rates (the Network widget), as the web renderer's
// (web/components/sparkline.tsx), in react-native-svg (https://github.com/software-mansion/react-native-svg).
// Decorative: the figures beside it carry the values, so the graph is hidden from assistive
// technology. New samples redraw in place, with no tween (admin.md#status-and-live-data).
import type { ColorRole } from '@highsea-tv/tokens'
import { View } from 'react-native'
import Svg, { G, Path } from 'react-native-svg'
import { useTheme } from './theme.tsx'

export type SparkSeries = { values: number[]; color: ColorRole; fill?: boolean }

const W = 100
const H = 32

export function Sparkline({ series, height = 48 }: { series: SparkSeries[]; height?: number }) {
  const theme = useTheme()
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const path = (values: number[]) =>
    values
      .map((v, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * W : 0
        const y = H - 1 - (v / max) * (H - 2)
        return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  return (
    <View
      style={{ height, width: '100%' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {series.map((s) => (
          <G key={`${s.color}-${s.fill ? 1 : 0}`}>
            {s.fill && s.values.length > 1 ? (
              <Path
                d={`${path(s.values)} L${W} ${H} L0 ${H} Z`}
                fill={theme.colors[s.color]}
                opacity={0.1}
              />
            ) : null}
            <Path
              d={path(s.values)}
              fill="none"
              stroke={theme.colors[s.color]}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </G>
        ))}
      </Svg>
    </View>
  )
}
