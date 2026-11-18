'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// A3 Dashboard › a widget's settings (HT-60). HT-47's review page had controls of its own standing
// in for these (Recently added's variant, the weather's units); on the dashboard they're the
// widget's settings, in a side sheet opened from its header while customizing, or from Weather's
// "Choose a place". Save hands the settings back; the dashboard keeps them in its draft while
// customizing and saves the layout at once otherwise.
//
// The place comes from Open-Meteo's place search, run by the server when Search is pressed (never
// as each letter is typed), or from typed coordinates. The browser's location is never asked for.

import type { WeatherPlaceResult } from '@highsea-tv/api-contract'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import {
  RECENT_VARIANTS,
  TEMPERATURE_UNITS,
  type WeatherPlace,
  WIND_UNITS,
  type WidgetKind,
  type WidgetPlacement,
  widgetDefinition,
  widgetMessages,
} from '@highsea-tv/personalization/widgets'
import { useAction } from '@highsea-tv/sdk/react'
import { line } from '@highsea-tv/tokens'
import {
  Button,
  Dense,
  Field,
  Input,
  Press,
  SearchField,
  SegmentedControl,
  Sheet,
  Text,
  tokens,
  useTheme,
} from '@highsea-tv/ui/native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { widgetSettings as messages } from './widget-settings-messages.ts'

const s = tokens.space
const ui = tokens.adminText.ui

/** The widgets with settings someone changes here. */
export const CONFIGURABLE: readonly WidgetKind[] = ['recently-added', 'weather']
export const configurable = (kind: WidgetKind) => CONFIGURABLE.includes(kind)

type Settings = Record<string, unknown>

export function WidgetSettingsSheet({
  widget,
  onClose,
  onSave,
  saving,
}: {
  /** The placement being set, or null while the sheet is closed. */
  widget: WidgetPlacement | null
  onClose: () => void
  onSave: (settings: Settings) => void
  saving?: boolean
}) {
  const t = useT(messages)
  const tw = useT(widgetMessages)
  const [draft, setDraft] = useState<Settings>({})
  // each opening starts from the widget's own settings, filled from its defaults
  useEffect(() => {
    if (widget) setDraft(widgetDefinition(widget.kind).settings.parse(widget.settings ?? {}))
  }, [widget])
  const set = (patch: Settings) => setDraft((d) => ({ ...d, ...patch }))
  return (
    <Sheet
      open={widget !== null}
      onClose={onClose}
      side="right"
      title={widget ? t('title', { widget: tw(`${widget.kind}.title`) }) : ''}
      description={t('description')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" loading={saving} onPress={() => onSave(draft)}>
            {t('save')}
          </Button>
        </>
      }
    >
      <Dense>
        {widget?.kind === 'recently-added' ? (
          <RecentSettings value={draft} set={set} />
        ) : widget?.kind === 'weather' ? (
          <WeatherSettings value={draft} set={set} />
        ) : null}
      </Dense>
    </Sheet>
  )
}

function RecentSettings({ value, set }: { value: Settings; set: (p: Settings) => void }) {
  const t = useT(messages)
  const variant = (value.variant as (typeof RECENT_VARIANTS)[number]) ?? 'featured'
  return (
    <Field label={t('recent.variant')} hint={t(`recent.${variant}Hint`)}>
      <SegmentedControl
        aria-label={t('recent.variant')}
        value={variant}
        onValueChange={(v) => set({ variant: v })}
        options={RECENT_VARIANTS.map((v) => ({ value: v, label: t(`recent.${v}`) }))}
      />
    </Field>
  )
}

const inRange = (n: number, most: number) => Number.isFinite(n) && Math.abs(n) <= most
/** Two decimals, as the server rounds them before they leave it. */
const round = (n: number) => Math.round(n * 100) / 100

function WeatherSettings({ value, set }: { value: Settings; set: (p: Settings) => void }) {
  const t = useT(messages)
  const locale = useLocale()
  const theme = useTheme()
  const place = (value.place as WeatherPlace | null) ?? null
  const [name, setName] = useState('')
  const [found, setFound] = useState<WeatherPlaceResult[] | null>(null)
  const [searchError, setSearchError] = useState(false)
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [badCoordinates, setBadCoordinates] = useState(false)
  const search = useAction((c, q: string) =>
    c.widgets.places({ query: { name: q, language: locale.slice(0, 2).toLowerCase() } }),
  )
  const find = async () => {
    const q = name.trim()
    if (q.length < 2) return
    setSearchError(false)
    try {
      setFound(await search.run(q))
    } catch {
      setFound(null)
      setSearchError(true)
    }
  }
  const useCoordinates = () => {
    const latitude = Number(lat.replace(',', '.'))
    const longitude = Number(lon.replace(',', '.'))
    if (!lat.trim() || !lon.trim() || !inRange(latitude, 90) || !inRange(longitude, 180))
      return setBadCoordinates(true)
    setBadCoordinates(false)
    const r = { latitude: round(latitude), longitude: round(longitude) }
    set({ place: { name: t('weather.coordinatesName', r), detail: '', ...r } })
  }
  return (
    <View style={{ gap: s['5'] }}>
      <View style={{ gap: s['2'] }}>
        <Text size={ui.size} leading={ui.leading} weight={500} color="text-2">
          {t('weather.place')}
        </Text>
        {place ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s['2'],
              padding: s['3'],
              borderRadius: tokens.radius.md,
              borderWidth: line.thin,
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.s2,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text size={ui.size} leading={ui.leading} weight={600} numberOfLines={1}>
                {place.name}
              </Text>
              <Text variant="caption" color="text-3" numberOfLines={1}>
                {[place.detail, `${place.latitude}, ${place.longitude}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Button variant="ghost" size="sm" onPress={() => set({ place: null })}>
              {t('weather.forget')}
            </Button>
          </View>
        ) : (
          <Text variant="caption" color="text-3">
            {t('weather.none')}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: s['2'], alignItems: 'center' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SearchField
              label={t('weather.search')}
              clearLabel={t('weather.clear')}
              placeholder={t('weather.search')}
              value={name}
              onChangeText={(v) => {
                setName(v)
                setFound(null)
              }}
              onSubmitEditing={find}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
          <Button onPress={find} loading={search.pending} disabled={name.trim().length < 2}>
            {t('weather.searchButton')}
          </Button>
        </View>
        {searchError ? (
          <Text variant="caption" color="badge-danger" role="alert">
            {t('weather.searchError')}
          </Text>
        ) : found?.length === 0 ? (
          <Text variant="caption" color="text-3" role="status">
            {t('weather.noResults')}
          </Text>
        ) : found ? (
          <View role="list" aria-label={t('weather.results')} style={{ gap: s['1'] }}>
            {found.map((p) => (
              <View key={`${p.latitude},${p.longitude}`} role="listitem">
                <Press
                  onPress={() => {
                    set({ place: p })
                    setFound(null)
                    setName('')
                  }}
                  style={({ hovered }) => ({
                    paddingVertical: s['2'],
                    paddingHorizontal: s['3'],
                    borderRadius: tokens.radius.md,
                    backgroundColor: hovered ? theme.colors.s3 : 'transparent',
                  })}
                >
                  <Text size={ui.size} leading={ui.leading}>
                    {p.name}
                  </Text>
                  <Text variant="caption" color="text-3">
                    {p.detail}
                  </Text>
                </Press>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ gap: s['2'] }}>
        <Text size={ui.size} leading={ui.leading} weight={500} color="text-2">
          {t('weather.coordinates')}
        </Text>
        <View style={{ flexDirection: 'row', gap: s['2'], alignItems: 'flex-end' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Field label={t('weather.latitude')}>
              <Input
                value={lat}
                onChangeText={setLat}
                inputMode="decimal"
                mono
                invalid={badCoordinates}
              />
            </Field>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Field label={t('weather.longitude')}>
              <Input
                value={lon}
                onChangeText={setLon}
                inputMode="decimal"
                mono
                invalid={badCoordinates}
              />
            </Field>
          </View>
          <Button onPress={useCoordinates}>{t('weather.useCoordinates')}</Button>
        </View>
        {badCoordinates ? (
          <Text variant="caption" color="badge-danger" role="alert">
            {t('weather.badCoordinates')}
          </Text>
        ) : null}
      </View>
      <Field label={t('weather.temperature')}>
        <SegmentedControl
          aria-label={t('weather.temperature')}
          value={(value.temperature as string) ?? 'celsius'}
          onValueChange={(v) => set({ temperature: v })}
          options={TEMPERATURE_UNITS.map((v) => ({ value: v, label: t(`weather.${v}`) }))}
        />
      </Field>
      <Field label={t('weather.wind')}>
        <SegmentedControl
          aria-label={t('weather.wind')}
          value={(value.wind as string) ?? 'kmh'}
          onValueChange={(v) => set({ wind: v })}
          options={WIND_UNITS.map((v) => ({ value: v, label: t(`weather.${v}`) }))}
        />
      </Field>
      <Text variant="caption" color="text-3">
        {t('weather.privacy')}
      </Text>
    </View>
  )
}
