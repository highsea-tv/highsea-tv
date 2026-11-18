'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard widgets' next round, for the owner's review (HT-47): a page only the prototype
// routes to (`#/admin/widgets-next`), never the server. Two views. "New and redrawn" has the
// drafts (widgets-next-drafts.tsx): Recently added three ways, the network's whole activity, the
// date and time, and the weather. "Every widget at one size" draws the registry's widgets at any
// size the grid allows, so one that cuts its content off shows. The address can open it at a
// state (`?tab=sizes&span=2&rows=3&editing=1&variant=list&pattern=idle&temperature=fahrenheit&wind=mph`); the controls then hold it.

import { useT } from '@highsea-tv/i18n/react'
import { MAX_ROWS, type WidgetSpan, widgetDefinitions } from '@highsea-tv/personalization/widgets'
import { SegmentedControl, Text, tokens, WidgetGrid } from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { useSearchParams } from './navigation.tsx'
import { AdminPage } from './shell.tsx'
import { useNow } from './time.ts'
import { widgetRenderers } from './widgets.tsx'
import {
  CLOCK_SIZE,
  ClockDraft,
  type DraftSize,
  NETWORK_SIZE,
  type NetworkActivity,
  NetworkDraft,
  RECENT_SIZE,
  RECENT_VARIANTS,
  RecentDraft,
  type RecentVariant,
  TEMPERATURE_UNITS,
  WEATHER_SIZE,
  type Weather,
  WeatherDraft,
  type WeatherUnits,
  WIND_UNITS,
} from './widgets-next-drafts.tsx'
import { widgetsNext as messages } from './widgets-next-messages.ts'

const s = tokens.space
const SPANS = ['1', '2', '3', '4'] as const
const MIN_ROWS = Math.min(...widgetDefinitions.map((d) => d.height[0]))
const ROWS = Array.from({ length: MAX_ROWS - MIN_ROWS + 1 }, (_, i) => String(MIN_ROWS + i))
const TABS = ['drafts', 'sizes'] as const
export const ACTIVITY_PATTERNS = ['mixed', 'busy', 'idle'] as const
export type ActivityPattern = (typeof ACTIVITY_PATTERNS)[number]

/**
 * What the drafts without a route are drawn from: the host makes it (the prototype, from
 * @highsea-tv/mock), since a screen here asks only the API and the API has neither yet.
 */
export type DraftData = {
  networkActivity: (now: number, minutes: number, pattern: ActivityPattern) => NetworkActivity
  weather: (now: number) => Weather
}

const clamp = (n: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, n))
const pick = <T extends string>(all: readonly T[], value: string | null): T =>
  all.includes(value as T) ? (value as T) : (all[0] as T)

type Size = { span: number; rows: number; editing: boolean }

const frameOf = ({ span, rows, editing }: Size, size: DraftSize) => ({
  span: clamp(span, size.width) as WidgetSpan,
  rows: clamp(rows, size.height),
  editing,
})

/** Every widget of the registry at one size, each kept within its own range. */
function Sizes(size: Size) {
  return (
    <WidgetGrid rows>
      {widgetDefinitions.map((d) => {
        const Render = widgetRenderers[d.kind]
        return <Render key={d.kind} settings={d.settings.parse({})} frame={frameOf(size, d)} />
      })}
    </WidgetGrid>
  )
}

const NETWORK_MINUTES = 10

/** The drafts at one size. The network's samples move as the clock does. */
function Drafts({
  size,
  variant,
  pattern,
  units,
  data,
}: {
  size: Size
  variant: RecentVariant
  pattern: ActivityPattern
  units: WeatherUnits
  data: DraftData
}) {
  const now = useNow(2_000)
  return (
    <WidgetGrid rows>
      <RecentDraft variant={variant} frame={frameOf(size, RECENT_SIZE)} />
      <NetworkDraft
        frame={frameOf(size, NETWORK_SIZE)}
        minutes={NETWORK_MINUTES}
        activity={data.networkActivity(now, NETWORK_MINUTES, pattern)}
      />
      <ClockDraft frame={frameOf(size, CLOCK_SIZE)} />
      <WeatherDraft frame={frameOf(size, WEATHER_SIZE)} weather={data.weather(now)} units={units} />
    </WidgetGrid>
  )
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
      <Text variant="caption" color="text-2">
        {label}
      </Text>
      {children}
    </View>
  )
}

export function WidgetsNext({ data }: { data: DraftData }) {
  const t = useT(messages)
  const query = useSearchParams()
  const [tab, setTab] = useState(() => pick(TABS, query.get('tab')))
  const [span, setSpan] = useState(() => clamp(Number(query.get('span') ?? 2), [1, 4]))
  const [rows, setRows] = useState(() =>
    clamp(Number(query.get('rows') ?? 3), [MIN_ROWS, MAX_ROWS]),
  )
  const [editing, setEditing] = useState(() => query.get('editing') === '1')
  const [variant, setVariant] = useState(() =>
    // Featured first: the owner's pick of 2026-11-17
    pick(RECENT_VARIANTS, query.get('variant') ?? 'featured'),
  )
  const [pattern, setPattern] = useState(() => pick(ACTIVITY_PATTERNS, query.get('pattern')))
  const [temperature, setTemperature] = useState(() =>
    pick(TEMPERATURE_UNITS, query.get('temperature')),
  )
  const [wind, setWind] = useState(() => pick(WIND_UNITS, query.get('wind')))
  const size = { span, rows, editing }
  const row = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['4'] } as const
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <View style={{ gap: s['4'] }}>
        <View style={row}>
          <SegmentedControl
            aria-label={t('tab.label')}
            size="sm"
            value={tab}
            onValueChange={(v) => setTab(pick(TABS, v))}
            options={TABS.map((v) => ({ value: v, label: t(`tab.${v}`) }))}
          />
          <Control label={t('sizes.width')}>
            <SegmentedControl
              aria-label={t('sizes.width')}
              size="sm"
              value={String(span)}
              onValueChange={(v) => setSpan(Number(v))}
              options={SPANS.map((v) => ({ value: v, label: v }))}
            />
          </Control>
          <Control label={t('sizes.height')}>
            <SegmentedControl
              aria-label={t('sizes.height')}
              size="sm"
              value={String(rows)}
              onValueChange={(v) => setRows(Number(v))}
              options={ROWS.map((v) => ({ value: v, label: v }))}
            />
          </Control>
          <SegmentedControl
            aria-label={t('sizes.mode')}
            size="sm"
            value={editing ? '1' : '0'}
            onValueChange={(v) => setEditing(v === '1')}
            options={[
              { value: '0', label: t('sizes.viewing') },
              { value: '1', label: t('sizes.customizing') },
            ]}
          />
        </View>
        {tab === 'drafts' ? (
          <>
            <View style={row}>
              <Control label={t('variant.label')}>
                <SegmentedControl
                  aria-label={t('variant.label')}
                  size="sm"
                  value={variant}
                  onValueChange={(v) => setVariant(pick(RECENT_VARIANTS, v))}
                  options={RECENT_VARIANTS.map((v) => ({ value: v, label: t(`variant.${v}`) }))}
                />
              </Control>
              <Control label={t('pattern.label')}>
                <SegmentedControl
                  aria-label={t('pattern.label')}
                  size="sm"
                  value={pattern}
                  onValueChange={(v) => setPattern(pick(ACTIVITY_PATTERNS, v))}
                  options={ACTIVITY_PATTERNS.map((v) => ({ value: v, label: t(`pattern.${v}`) }))}
                />
              </Control>
              <Control label={t('units.temperature')}>
                <SegmentedControl
                  aria-label={t('units.temperature')}
                  size="sm"
                  value={temperature}
                  onValueChange={(v) => setTemperature(pick(TEMPERATURE_UNITS, v))}
                  options={TEMPERATURE_UNITS.map((v) => ({ value: v, label: t(`units.${v}`) }))}
                />
              </Control>
              <Control label={t('units.wind')}>
                <SegmentedControl
                  aria-label={t('units.wind')}
                  size="sm"
                  value={wind}
                  onValueChange={(v) => setWind(pick(WIND_UNITS, v))}
                  options={WIND_UNITS.map((v) => ({ value: v, label: t(`units.${v}`) }))}
                />
              </Control>
            </View>
            <Text variant="caption" color="text-2">
              {`${t(`variant.${variant}For`)} ${t('sizes.note')}`}
            </Text>
            <Drafts
              size={size}
              variant={variant}
              pattern={pattern}
              units={{ temperature, wind }}
              data={data}
            />
          </>
        ) : (
          <>
            <Text variant="caption" color="text-2">
              {t('sizes.note')}
            </Text>
            <Sizes {...size} />
          </>
        )}
      </View>
    </AdminPage>
  )
}
