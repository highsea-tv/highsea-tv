// SPDX-License-Identifier: AGPL-3.0-only
// A small line graph for live rates (the Network widget). Decorative: the figures beside it carry
// the values, so the graph is hidden from assistive technology. New samples redraw in place, with
// no tween (admin.md#status-and-live-data).
import { cn } from '../lib/cn.ts'

export type SparkSeries = { values: number[]; className: string; fill?: boolean }

export function Sparkline({ series, className }: { series: SparkSeries[]; className?: string }) {
  const W = 100
  const H = 32
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
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('block h-12 w-full overflow-visible', className)}
    >
      {series.map((s) => (
        <g key={s.className}>
          {s.fill && s.values.length > 1 && (
            <path
              d={`${path(s.values)} L${W} ${H} L0 ${H} Z`}
              className={cn(s.className, 'opacity-10')}
              fill="currentColor"
            />
          )}
          <path
            d={path(s.values)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className={s.className}
          />
        </g>
      ))}
    </svg>
  )
}
