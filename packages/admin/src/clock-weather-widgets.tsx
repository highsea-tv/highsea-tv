'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard's Date and time and Weather (HT-60, drafted in HT-47 at `#/admin/widgets-next`).
//
// Date and time is the server's, in its language and time zone (Settings › General), with the
// viewer's own time when their zone differs. One widget, not two: the smallest cell holds both and
// they come from the same two settings.
//
// Weather is Open-Meteo's, asked by the server for the place in the widget's settings and never by
// the browser; with no place it asks nothing and says so. The figures arrive metric and are written
// in the widget's own units. An icon and words name each condition, never the icon alone, and the
// credit Open-Meteo's licence asks for sits under it (https://open-meteo.com/en/licence).

import type { Weather } from '@highsea-tv/api-contract'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import {
  type TemperatureUnit,
  type WeatherPlace,
  type WindUnit,
  widgetDefinition,
} from '@highsea-tv/personalization/widgets'
import { useQuery } from '@highsea-tv/sdk/react'
import { admin, line } from '@highsea-tv/tokens'
import {
  Button,
  Icon,
  Stat,
  Text,
  TextLink,
  tokens,
  useClip,
  useSize,
  useTheme,
} from '@highsea-tv/ui/native'
import { View } from 'react-native'
import { widgets as messages } from './dashboard-messages.ts'
import { useNow, useRelative } from './time.ts'
import {
  Empty,
  Fig,
  fill,
  LIST_ROWS,
  Static,
  Ui,
  Widget,
  type WidgetProps,
} from './widget-parts.tsx'

const s = tokens.space

// ---------------------------------------------------------------- date and time

/** "UTC+1", from the zone's own offset at that moment. */
function offsetOf(at: number, timeZone: string) {
  const part = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value
  return (part ?? 'UTC').replace('GMT', 'UTC')
}

/** The ISO week's number of a date, read on the zone's own calendar. */
function weekOf(at: number, timeZone: string) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone }).format(at).split('-').map(Number)
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  // the Thursday of this week decides its year (ISO 8601)
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  const first = Date.UTC(day.getUTCFullYear(), 0, 1)
  return Math.ceil(((day.getTime() - first) / 86_400_000 + 1) / 7)
}

export function ClockWidget(props: WidgetProps) {
  const t = useT(messages)
  const query = useQuery('settings:general', (c) => c.settings.general())
  // a second's tick, so the minute turns when it does
  const now = useNow(1000)
  return (
    <Widget {...props} kind="clock" query={query} meta={(g) => offsetOf(now, g.timeZone)}>
      {(g) => {
        const fmt = (o: Intl.DateTimeFormatOptions) =>
          new Intl.DateTimeFormat(g.language, { timeZone: g.timeZone, ...o }).format(now)
        const time = fmt({ hour: 'numeric', minute: '2-digit' })
        const date = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        const here = Intl.DateTimeFormat().resolvedOptions().timeZone
        const yours =
          offsetOf(now, here) === offsetOf(now, g.timeZone)
            ? null
            : new Intl.DateTimeFormat(g.language, { hour: 'numeric', minute: '2-digit' }).format(
                now,
              )
        const tall = (props.frame.rows ?? 2) >= 3
        return (
          <View
            aria-label={t('clock.label', { time, date })}
            style={{ flex: 1, minHeight: 0, gap: s['1.5'] }}
          >
            <Stat value={time} caption={date} />
            <Text variant="caption" color="text-3" numberOfLines={1}>
              {t('clock.zone', {
                zone: g.timeZone.replaceAll('_', ' '),
                week: weekOf(now, g.timeZone),
              })}
            </Text>
            {yours && tall ? (
              <Text variant="caption" color="text-3" numberOfLines={1}>
                {t('clock.yours', { time: yours })}
              </Text>
            ) : null}
          </View>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- weather

/** How often the widget asks again: the server keeps a reading this long (runtime/weather.ts). */
const WEATHER_INTERVAL = 15 * 60_000

/** Each wind unit as Intl names it, and how many of it a kilometre an hour is. */
const WIND = {
  kmh: { unit: 'kilometer-per-hour', per: 1 },
  mph: { unit: 'mile-per-hour', per: 0.621371 },
  ms: { unit: 'meter-per-second', per: 1 / 3.6 },
} as const

/** How wide the days' list is before it has room for the chance of rain beside the words. */
const DAYS_WITH_RAIN = s['12'] * 7

/** The current conditions' column beside the days: as wide as the Network's legend. */
const BESIDE = admin.widgets.metaMax + s['12']

type WeatherSettings = {
  place: WeatherPlace | null
  temperature: TemperatureUnit
  wind: WindUnit
}

export const weatherSettings = (settings: Record<string, unknown>) =>
  widgetDefinition('weather').settings.parse(settings) as WeatherSettings

export function WeatherWidget(props: WidgetProps) {
  const t = useT(messages)
  const settings = weatherSettings(props.settings)
  if (!settings.place)
    return (
      <Static {...props} kind="weather">
        <Empty
          size="sm"
          icon="weather-partly-cloudy"
          level={4}
          title={t('weather.none')}
          action={
            props.configure ? (
              <Button size="sm" onPress={props.configure}>
                {t('weather.choose')}
              </Button>
            ) : undefined
          }
        >
          {t('weather.noneBody')}
        </Empty>
      </Static>
    )
  return <WeatherAt {...props} settings={settings} place={settings.place} />
}

function WeatherAt({
  place,
  settings,
  ...props
}: Omit<WidgetProps, 'settings'> & { place: WeatherPlace; settings: WeatherSettings }) {
  const { latitude, longitude } = place
  const query = useQuery(
    `widget:weather:${latitude},${longitude}`,
    (c) => c.widgets.weather({ query: { latitude, longitude } }),
    [],
    { interval: WEATHER_INTERVAL },
  )
  return (
    <Widget {...props} kind="weather" query={query} meta={() => place.name}>
      {(w) => <WeatherBody weather={w} settings={settings} />}
    </Widget>
  )
}

function WeatherBody({ weather, settings }: { weather: Weather; settings: WeatherSettings }) {
  const t = useT(messages)
  const locale = useLocale()
  const theme = useTheme()
  const { seen } = useRelative()
  const clip = useClip(LIST_ROWS)
  const { onLayout, width } = useSize()
  // the days' list: the chance of rain only where it leaves the condition's words room
  const list = useSize()
  const rainy = list.width >= DAYS_WITH_RAIN
  const degrees = (n: number) =>
    `${Math.round(settings.temperature === 'fahrenheit' ? (n * 9) / 5 + 32 : n)}°`
  const wind = WIND[settings.wind]
  // a day on the place's own calendar, named at noon so no zone moves it
  const day = (iso: string, i: number) =>
    i === 0
      ? t('weather.today')
      : new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(`${iso}T12:00:00Z`),
        )
  const now = weather.current
  const today = weather.days[0]
  const wide = width >= 440
  const details = [
    t('weather.feels', { temperature: degrees(now.feelsLike) }),
    today ? t('weather.range', { high: degrees(today.high), low: degrees(today.low) }) : null,
  ].filter(Boolean)
  const more = [
    t('weather.wind', {
      speed: new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: wind.unit,
        maximumFractionDigits: 0,
      }).format(now.wind * wind.per),
    }),
    t('weather.humidity', { percent: `${Math.round(now.humidity)}%` }),
  ]
  return (
    <View style={{ flex: 1, minHeight: 0, gap: s['2'] }}>
      <View
        onLayout={onLayout}
        style={{
          flex: 1,
          minHeight: 0,
          flexDirection: wide ? 'row' : 'column',
          gap: wide ? s['5'] : s['2'],
        }}
      >
        <View style={{ flexShrink: 0, gap: s['1'], width: wide ? BESIDE : undefined }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s['2.5'] }}>
            <View style={{ paddingTop: s['1'] }}>
              <Icon name={`weather-${now.condition}`} size={tokens.icon.size.lg} color="text-2" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Stat
                value={degrees(now.temperature)}
                unit={t(`weather.condition.${now.condition}`)}
                caption={details.join(' · ')}
              />
            </View>
          </View>
          {weather.stale ? (
            <Text variant="caption" color="text-2" role="status">
              {t('weather.stale', { when: seen(weather.updatedAt) })}
            </Text>
          ) : wide ? (
            <Text variant="caption" color="text-3">
              {t('weather.updated', { when: seen(weather.updatedAt) })}
            </Text>
          ) : null}
          {wide ? (
            <Text variant="caption" color="text-3">
              {more.join(' · ')}
            </Text>
          ) : null}
        </View>
        <View
          ref={clip.ref}
          onLayout={list.onLayout}
          role="list"
          aria-label={t('weather.days')}
          style={[{ minWidth: 0 }, fill]}
        >
          {weather.days.slice(wide ? 0 : 1).map((d, i) => (
            <View
              key={d.day}
              role="listitem"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s['2'],
                paddingVertical: s['1'],
                borderTopWidth: line.thin,
                borderTopColor: theme.colors.line,
              }}
            >
              <Ui
                color="text-2"
                style={{ width: wide ? s['12'] + s['1'] : s['8'] + s['1'] }}
                numberOfLines={1}
              >
                {day(d.day, wide ? i : i + 1)}
              </Ui>
              <Icon name={`weather-${d.condition}`} size={tokens.icon.size.sm} color="text-2" />
              <Ui numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                {t(`weather.condition.${d.condition}`)}
              </Ui>
              {rainy && d.rain >= 30 ? (
                <Fig>{t('weather.rain', { percent: `${Math.round(d.rain)}%` })}</Fig>
              ) : null}
              <Fig color="text-2">{`${degrees(d.high)} / ${degrees(d.low)}`}</Fig>
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
        <TextLink href="https://open-meteo.com/">{t('weather.credit')}</TextLink>
      </View>
    </View>
  )
}
