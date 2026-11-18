'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard's Network (HT-60, drafted in HT-47 at `#/admin/widgets-next`): the whole network's
// activity in one chart and its legend. Downloads and uploads are the torrent client's rates;
// streams are what `/stream` sends to players, direct play and transcodes alike. The legend is the
// filter: All, or one series. Each series has its own colour in the data-visualisation order
// (color.md › Data visualisation: `accent`, `accent-2`, `info`) and its own line (solid, dashed,
// dotted), so none is told from another by colour alone.

import { DOWNLOAD_TOPICS } from '@highsea-tv/api-contract'
import { rate, rateParts } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import { widgetDefinition } from '@highsea-tv/personalization/widgets'
import { useQuery } from '@highsea-tv/sdk/react'
import { admin, type ColorRole, line } from '@highsea-tv/tokens'
import {
  Press,
  Sparkline,
  type SparkSeries,
  Text,
  tokens,
  useSize,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { widgets as messages } from './dashboard-messages.ts'
import { Fig, Ui, Widget, type WidgetProps } from './widget-parts.tsx'

const s = tokens.space
const figure = tokens.adminText.figure

/** The rates have no event of their own: the widget asks again this often. */
const NETWORK_INTERVAL = 2_000

const SERIES = ['down', 'up', 'streams'] as const
type SeriesKey = (typeof SERIES)[number]
type Filter = 'all' | SeriesKey

const LOOK: Record<SeriesKey, { color: ColorRole; dash?: SparkSeries['dash'] }> = {
  down: { color: 'accent' },
  up: { color: 'accent-2', dash: 'dashed' },
  streams: { color: 'info', dash: 'dotted' },
}

/** The legend's column beside the chart: a name and a figure. */
const LEGEND = admin.widgets.metaMax + s['12']

const minutesOf = (settings: Record<string, unknown>) =>
  Number(settings.minutes ?? widgetDefinition('network').settings.parse({}).minutes)

/** A series' line as the legend shows it: solid, dashed or dotted, as the chart draws it. */
function Swatch({ series }: { series?: SeriesKey }) {
  const theme = useTheme()
  const h = s['0.5']
  const bar = (key: string, width: number, color: ColorRole) => (
    <View
      key={key}
      style={{ width, height: h, borderRadius: h / 2, backgroundColor: theme.colors[color] }}
    />
  )
  const look = series ? LOOK[series] : null
  return (
    <View
      aria-hidden
      style={{
        width: s['4'],
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['0.5'],
      }}
    >
      {look === null
        ? SERIES.map((k) => bar(k, 4, LOOK[k].color))
        : look.dash === 'dashed'
          ? [bar('a', 7, look.color), bar('b', 7, look.color)]
          : look.dash === 'dotted'
            ? [0, 1, 2, 3].map((i) => bar(String(i), 2.5, look.color))
            : bar('a', 16, look.color)}
    </View>
  )
}

export function NetworkWidget(props: WidgetProps) {
  const t = useT(messages)
  const minutes = minutesOf(props.settings)
  const [filter, setFilter] = useState<Filter>('all')
  const { onLayout, width, height } = useSize()
  const query = useQuery(
    `widget:network:${minutes}`,
    (c) => c.widgets.network({ query: { minutes } }),
    [],
    { interval: NETWORK_INTERVAL },
  )
  // the kill switch stops every torrent while the VPN is down: the downloads' caption says why
  const vpn = useQuery('widget:network-vpn', (c) => c.vpn.status(), [DOWNLOAD_TOPICS.vpn])
  const vpnDown = vpn.data?.state === 'down' || vpn.data?.state === 'failed'
  return (
    <Widget {...props} kind="network" query={query} meta={() => t('network.meta', { minutes })}>
      {(activity) => {
        const latest = activity.samples[activity.samples.length - 1]
        const now = {
          down: latest?.down ?? 0,
          up: latest?.up ?? 0,
          streams: latest?.streams ?? 0,
        }
        const values: Record<SeriesKey, number[]> = {
          down: activity.samples.map((x) => x.down),
          up: activity.samples.map((x) => x.up),
          streams: activity.samples.map((x) => x.streams),
        }
        // a line needs two points: a server that just started has none yet
        for (const k of SERIES) if (values[k].length < 2) values[k] = [now[k], now[k]]
        const drawn = SERIES.filter((k) => filter === 'all' || filter === k)
        const peak = Math.max(0, ...drawn.flatMap((k) => values[k]))
        const playing = activity.streams.local + activity.streams.remote
        const captions: Record<Filter, string> = {
          all: t('network.allCaption'),
          down: vpnDown
            ? t('network.vpnDown')
            : t('network.downCaption', { count: activity.downloads }),
          up: t('network.upCaption', { count: activity.seeding }),
          streams: playing ? t('network.streamsCaption', activity.streams) : t('network.noStreams'),
        }
        const rates: Record<Filter, number> = { all: now.down + now.up + now.streams, ...now }
        // beside the chart where there's room for both, above it in a narrow widget
        const beside = width >= 440
        // a caption under each label where the height has room for four of them
        const roomy = beside && height >= 4 * 44
        // the smallest widget: the four lines close up and the chart gives its axis line away
        const dense = !beside && height > 0 && height < 170
        const item = (f: Filter) => {
          const on = filter === f
          const [value, unit] = rateParts(rates[f])
          return (
            <Press
              key={f}
              role="radio"
              aria-checked={on}
              onPress={() => setFilter(f)}
              style={{ borderRadius: tokens.radius.sm, minWidth: 0 }}
            >
              {({ hovered }) => (
                <SeriesRow
                  on={on}
                  hovered={hovered}
                  dense={dense}
                  swatch={<Swatch series={f === 'all' ? undefined : f} />}
                  label={t(`network.${f}`)}
                  caption={roomy ? captions[f] : undefined}
                  value={value}
                  unit={unit}
                />
              )}
            </Press>
          )
        }
        return (
          <View
            onLayout={onLayout}
            style={{
              flex: 1,
              minHeight: 0,
              flexDirection: beside ? 'row' : 'column',
              gap: beside ? s['4'] : s['2'],
            }}
          >
            <View
              role="radiogroup"
              aria-label={t('network.filter')}
              style={{
                width: beside ? LEGEND : undefined,
                flexShrink: 0,
                gap: dense ? 0 : s['0.5'],
              }}
            >
              {(['all', ...SERIES] as const).map(item)}
            </View>
            <View
              role="img"
              aria-label={t('network.chart', {
                minutes,
                down: rate(now.down),
                up: rate(now.up),
                streams: rate(now.streams),
              })}
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: admin.widgets.graphMin,
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <View style={{ flex: 1, minHeight: 0 }}>
                <Sparkline
                  height={'100%' as unknown as number}
                  series={drawn.map((k) => ({
                    values: values[k],
                    color: LOOK[k].color,
                    dash: LOOK[k].dash,
                    fill: k === 'down' || drawn.length === 1,
                  }))}
                />
              </View>
              {dense ? null : (
                <Axis
                  start={t('network.ago', { minutes })}
                  middle={t('network.peak', { rate: rate(peak) })}
                  end={t('network.now')}
                />
              )}
            </View>
          </View>
        )
      }}
    </Widget>
  )
}

/** Under the chart: when it starts, its tallest point, and now. Mono caption in `text-3`. */
function Axis({ start, middle, end }: { start: string; middle: string; end: string }) {
  const theme = useTheme()
  return (
    <View
      aria-hidden
      style={{
        flexShrink: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: s['2'],
        paddingTop: s['0.5'],
        borderTopWidth: line.thin,
        borderTopColor: theme.colors.line,
      }}
    >
      <Fig numberOfLines={1}>{start}</Fig>
      <Fig numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>
        {middle}
      </Fig>
      <Fig numberOfLines={1}>{end}</Fig>
    </View>
  )
}

/** A legend entry: its line, its name and what it's doing now. Chosen, it's tinted and bolder. */
function SeriesRow({
  on,
  dense,
  hovered,
  swatch,
  label,
  caption,
  value,
  unit,
}: {
  on: boolean
  dense: boolean
  hovered: boolean
  swatch: ReactNode
  label: string
  caption?: string
  value: string
  unit: string
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['2'],
        paddingHorizontal: s['1.5'],
        paddingVertical: dense ? 0 : s['0.5'] + line.thin,
        borderRadius: tokens.radius.sm,
        backgroundColor: on ? theme.colors.s3 : hovered ? theme.colors.s2 : 'transparent',
      }}
    >
      {swatch}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Ui weight={on ? 600 : 400} color={on ? 'text' : 'text-2'} numberOfLines={1}>
          {label}
        </Ui>
        {caption ? (
          <Text variant="caption" color="text-3" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
      <Text size={figure.size} leading={figure.leading} mono color={on ? 'text' : 'text-2'}>
        {value}
        <Text size={figure.size} leading={figure.leading} mono color="text-3">
          {` ${unit}`}
        </Text>
      </Text>
    </View>
  )
}
