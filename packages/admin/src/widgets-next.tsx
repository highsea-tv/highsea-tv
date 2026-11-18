'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard widgets at every size, for review: a page only the prototype routes to
// (`#/admin/widgets-next`), never the server. It began as HT-47's drafts; with HT-60 they're the
// dashboard's own widgets, so what's left is the registry's widgets drawn at any size the grid
// allows, so one that cuts its content off shows. Recently added's look and whether Weather has a
// place are the widgets' own settings, set here as the settings sheet would. The address can open
// it at a state (`?span=2&rows=3&editing=1&variant=list&place=none`); the controls then hold it.

import { useT } from '@highsea-tv/i18n/react'
import {
  MAX_ROWS,
  RECENT_VARIANTS,
  type WidgetSpan,
  widgetDefinitions,
} from '@highsea-tv/personalization/widgets'
import { SegmentedControl, Text, tokens, WidgetGrid } from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { useSearchParams } from './navigation.tsx'
import { AdminPage } from './shell.tsx'
import { widgetRenderers } from './widgets.tsx'
import { widgetsNext as messages } from './widgets-next-messages.ts'

const s = tokens.space
const SPANS = ['1', '2', '3', '4'] as const
const MIN_ROWS = Math.min(...widgetDefinitions.map((d) => d.height[0]))
const ROWS = Array.from({ length: MAX_ROWS - MIN_ROWS + 1 }, (_, i) => String(MIN_ROWS + i))
const PLACES = ['set', 'none'] as const
/** The place the review page's Weather shows: the mock's (packages/mock/src/admin/dashboard.ts). */
const PLACE = { name: 'Lisbon', detail: 'Lisbon, Portugal', latitude: 38.72, longitude: -9.14 }

const clamp = (n: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, n))
const pick = <T extends string>(all: readonly T[], value: string | null): T =>
  all.includes(value as T) ? (value as T) : (all[0] as T)

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

export function WidgetsNext() {
  const t = useT(messages)
  const query = useSearchParams()
  const [span, setSpan] = useState(() => clamp(Number(query.get('span') ?? 2), [1, 4]))
  const [rows, setRows] = useState(() =>
    clamp(Number(query.get('rows') ?? 3), [MIN_ROWS, MAX_ROWS]),
  )
  const [editing, setEditing] = useState(() => query.get('editing') === '1')
  // Featured first: the owner's pick of 2026-11-17
  const [variant, setVariant] = useState(() =>
    pick(RECENT_VARIANTS, query.get('variant') ?? 'featured'),
  )
  const [place, setPlace] = useState(() => pick(PLACES, query.get('place')))
  const settings: Record<string, Record<string, unknown>> = {
    'recently-added': { variant },
    weather: { place: place === 'set' ? PLACE : null },
  }
  const row = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['4'] } as const
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <View style={{ gap: s['4'] }}>
        <View style={row}>
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
          <Control label={t('variant.label')}>
            <SegmentedControl
              aria-label={t('variant.label')}
              size="sm"
              value={variant}
              onValueChange={(v) => setVariant(pick(RECENT_VARIANTS, v))}
              options={RECENT_VARIANTS.map((v) => ({ value: v, label: t(`variant.${v}`) }))}
            />
          </Control>
          <Control label={t('place.label')}>
            <SegmentedControl
              aria-label={t('place.label')}
              size="sm"
              value={place}
              onValueChange={(v) => setPlace(pick(PLACES, v))}
              options={PLACES.map((v) => ({ value: v, label: t(`place.${v}`) }))}
            />
          </Control>
        </View>
        <Text variant="caption" color="text-2">
          {t('sizes.note')}
        </Text>
        <WidgetGrid rows>
          {widgetDefinitions.map((d) => {
            const Render = widgetRenderers[d.kind]
            return (
              <Render
                key={d.kind}
                settings={d.settings.parse(settings[d.kind] ?? {})}
                frame={{
                  span: clamp(span, d.width) as WidgetSpan,
                  rows: clamp(rows, d.height),
                  editing,
                }}
              />
            )
          })}
        </WidgetGrid>
      </View>
    </AdminPage>
  )
}
