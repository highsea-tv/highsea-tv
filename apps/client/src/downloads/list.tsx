// SPDX-License-Identifier: AGPL-3.0-only
// The downloads list (C8; client-settings.md#offline), from the prototype's client/offline-list.tsx,
// on the phone's Offline and the desktop app's Downloads: the space they take, then each download
// with where it's got to and what can be done about it, then the quality new downloads use and the
// app's own setting under it (Wi-Fi only on a phone, Kept in on a computer). A film is a row with
// its still; episodes sit under their show and season, and songs under their album, each group
// with its size and Remove (their sources come with shows and music, B3). The still's column is
// the prototype's min(7rem, 35%), 10rem from medium.
import {
  downloadsMessages,
  entriesOf,
  groupLine,
  isKept,
  isMoving,
  type Offline,
  type OfflineApp,
  type OfflineGroup,
  type OfflineQuality,
  qualityOptions,
  sizeLine,
  spaceLine,
  stateLine,
  whereOf,
} from '@highsea-tv/client/downloads'
import { playPath } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Poster,
  Press,
  ProgressBar,
  Select,
  Text,
  tokens,
  useFormFactor,
  useTheme,
} from '@highsea-tv/ui'
import { type Href, router } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSay, useServerName } from '../kit.tsx'
import type { Downloads } from './store.ts'

const { space } = tokens

/** The still's column: the prototype's 7rem (at most 35% of the row), 10rem from medium. */
const STILL = { compact: space['16'] + space['12'], medium: space['16'] * 2 + space['8'] }
/** The progress bar's widest, and the settings': the prototype's 24rem and 32rem. */
const BAR_MAX = space['16'] * 6
const SETTINGS_MAX = space['16'] * 8
/** A group's rows' widest: the prototype's 44rem. */
const GROUP_MAX = space['16'] * 11

function useStillWidth(width: number) {
  const window = useWindowDimensions().width
  if (window >= breakpoints.medium) return STILL.medium
  // before the row has measured itself, the compact column
  return width === 0 ? STILL.compact : Math.min(STILL.compact, width * 0.35)
}

export function OfflineList({
  app,
  d,
  settings,
}: {
  app: OfflineApp
  d: Downloads
  /** The app's own settings under Quality: Wi-Fi only on a phone, the folder on a computer. */
  settings?: ReactNode
}) {
  const t = useT(downloadsMessages)
  const touch = useFormFactor().input === 'touch'
  const space_ = spaceLine(app, d.items, t)
  return (
    <View style={{ gap: space['5'] }}>
      <View style={{ gap: space['1'] + space['0.5'] }}>
        <ProgressBar value={space_.fraction * 100} label={t('spaceUsed')} />
        <Text variant="caption" color="text-3">
          {space_.line}
        </Text>
      </View>
      {d.items.length === 0 ? (
        <EmptyState icon="download" title={t('emptyTitle')}>
          {t(touch ? 'emptyTouch' : 'emptyPointer', { where: whereOf(app, t) })}
        </EmptyState>
      ) : (
        <View role="list" accessibilityLabel={t('list')} style={{ gap: space['4'] }}>
          {entriesOf(d.items).map((e) =>
            e.kind === 'item' ? (
              <Row key={e.item.id} x={e.item} d={d} />
            ) : (
              <Group key={e.group.id} group={e.group} items={e.items} d={d} />
            ),
          )}
        </View>
      )}
      <View
        role="region"
        accessibilityLabel={t('settings')}
        style={{ maxWidth: SETTINGS_MAX, gap: space['4'] }}
      >
        <Field label={t('quality')} hint={t('qualityHint')}>
          <Select<OfflineQuality>
            value={d.quality}
            onValueChange={(q) => d.store.setQuality(q)}
            options={qualityOptions(t)}
          />
        </Field>
        {settings}
      </View>
    </View>
  )
}

/** Where a kept film or episode plays; songs play in the music player (B3). */
const playOf = (x: Offline) => (x.kind === 'song' ? undefined : playPath(x.id))

/** A row's actions, each a small quiet button, Remove or Cancel last. */
function useActions(x: Offline, d: Downloads) {
  const t = useT(downloadsMessages)
  const say = useSay()
  const server = useServerName()
  const kept = isKept(x)
  const remove = (
    <Button
      key="remove"
      size="sm"
      variant="ghost"
      icon="delete"
      onPress={() => {
        d.store.remove(x.id)
        say({
          title: kept ? t('removed', { title: x.title }) : t('cancelled'),
          body: t('stillPlays', { server }),
        })
      }}
    >
      {kept ? t('remove') : t('cancel')}
    </Button>
  )
  switch (x.state) {
    case 'downloading':
      return [
        <Button
          key="pause"
          size="sm"
          variant="ghost"
          icon="pause"
          onPress={() => d.store.pause(x.id)}
        >
          {t('pause')}
        </Button>,
        remove,
      ]
    case 'paused':
      return [
        <Button
          key="resume"
          size="sm"
          variant="ghost"
          icon="download"
          onPress={() => d.store.resume(x.id)}
        >
          {t('resume')}
        </Button>,
        remove,
      ]
    case 'waiting-wifi':
      return [
        <Button
          key="data"
          size="sm"
          variant="ghost"
          icon="download"
          onPress={() => d.store.resume(x.id)}
        >
          {t('useData')}
        </Button>,
        remove,
      ]
    case 'failed':
      return [
        <Button key="retry" size="sm" icon="refresh" onPress={() => d.store.retry(x.id)}>
          {t('tryAgain')}
        </Button>,
        remove,
      ]
    default:
      return [remove]
  }
}

function StateBadge({ x }: { x: Offline }) {
  const t = useT(downloadsMessages)
  if (x.state === 'failed') return <Badge tone="danger">{t('stopped')}</Badge>
  if (x.state === 'expired') return <Badge tone="warning">{t('expired')}</Badge>
  return null
}

function Bar({ x }: { x: Offline }) {
  const t = useT(downloadsMessages)
  return (
    <View style={{ maxWidth: BAR_MAX }}>
      <ProgressBar
        value={x.progress * 100}
        showValue
        tone={x.state === 'paused' ? 'neutral' : 'accent'}
        label={t('downloadingOf', { title: x.title })}
      />
    </View>
  )
}

/** A film's row: its still (playing it once it's kept), its title, where it's got to, its actions. */
function Row({ x, d }: { x: Offline; d: Downloads }) {
  const t = useT(downloadsMessages)
  const server = useServerName()
  const media = useMedia()
  const [width, setWidth] = useWidth()
  const still = useStillWidth(width)
  const to = x.state === 'done' ? playOf(x) : undefined
  const actions = useActions(x, d)
  return (
    <View
      role="listitem"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'] }}
    >
      <View style={{ width: still }}>
        <Poster
          title={x.title}
          src={media(x.still)}
          aspect="still"
          showTitle={false}
          width={still}
          onPress={to ? () => router.push(to as Href) : undefined}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space['1'] }}>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space['2'] }}
        >
          <Text variant="body" weight={600} numberOfLines={1} style={{ flexShrink: 1 }}>
            {x.title}
          </Text>
          <StateBadge x={x} />
        </View>
        {isMoving(x) ? <Bar x={x} /> : null}
        <Text variant="caption" color={x.state === 'failed' ? 'badge-danger' : 'text-3'}>
          {stateLine(x, server, t)}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: space['1'],
            marginStart: -space['2'],
          }}
        >
          {actions}
        </View>
      </View>
    </View>
  )
}

/** A show's season or an album: its art, name and size, Remove, then each episode or song. */
function Group({ group: g, items, d }: { group: OfflineGroup; items: Offline[]; d: Downloads }) {
  const t = useT(downloadsMessages)
  const say = useSay()
  const server = useServerName()
  const media = useMedia()
  const [width, setWidth] = useWidth()
  const still = useStillWidth(width)
  const line = useTheme().colors.line
  const name = g.kind === 'season' ? `${g.show.title}, ${g.title}` : g.title
  return (
    <View
      role="listitem"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ gap: space['2'] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'] }}>
        <View style={{ width: still }}>
          {/* a season's poster at 60% of the column, an album's cover at 56.25%: the still's height */}
          <Poster
            title={name}
            src={media(g.kind === 'season' ? g.poster : g.cover)}
            showTitle={false}
            width={still * (g.kind === 'season' ? 0.6 : 0.5625)}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: space['1'] }}>
          <Text variant="body" weight={600} numberOfLines={1}>
            {g.kind === 'season' ? g.show.title : g.title}
          </Text>
          <Text variant="caption" color="text-2" numberOfLines={1}>
            {g.kind === 'season' ? g.title : g.artist}
          </Text>
          <Text variant="caption" color="text-3">
            {groupLine(g, items, t)}
          </Text>
          <View style={{ flexDirection: 'row', marginStart: -space['2'] }}>
            <Button
              size="sm"
              variant="ghost"
              icon="delete"
              onPress={() => {
                d.store.remove(items.map((x) => x.id))
                say({ title: t('removed', { title: name }), body: t('stillPlays', { server }) })
              }}
            >
              {t('remove')}
            </Button>
          </View>
        </View>
      </View>
      <View
        role="list"
        accessibilityLabel={name}
        style={{
          marginStart: still + space['3'],
          maxWidth: GROUP_MAX,
          gap: space['2'] + space['0.5'],
          borderStartWidth: StyleSheet.hairlineWidth,
          borderColor: line,
          paddingStart: space['3'],
        }}
      >
        {items.map((x) => (
          <GroupRow key={x.id} x={x} d={d} />
        ))}
      </View>
    </View>
  )
}

/** An episode or a song in its group: no art, its code or number before its title. */
function GroupRow({ x, d }: { x: Offline; d: Downloads }) {
  const t = useT(downloadsMessages)
  const server = useServerName()
  const to = x.state === 'done' ? playOf(x) : undefined
  const actions = useActions(x, d)
  const title = (
    <Text variant="body" weight={600} numberOfLines={1} style={{ flexShrink: 1 }}>
      {x.title}
    </Text>
  )
  return (
    <View
      role="listitem"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: space['3'],
        rowGap: space['1'],
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: space['0.5'] }}>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space['2'] }}
        >
          {x.caption ? (
            <Text variant="caption" color="text-3" mono>
              {x.caption}
            </Text>
          ) : null}
          {to ? (
            <Press accessibilityRole="link" onPress={() => router.push(to as Href)}>
              {title}
            </Press>
          ) : (
            title
          )}
          <StateBadge x={x} />
        </View>
        {isMoving(x) ? <Bar x={x} /> : null}
        <Text variant="caption" color={x.state === 'failed' ? 'badge-danger' : 'text-3'}>
          {x.state === 'done' ? sizeLine(x, t) : stateLine(x, server, t)}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: space['1'],
        }}
      >
        {actions}
      </View>
    </View>
  )
}

/** A row's own width, for the still's 35%, kept to whole points. */
function useWidth() {
  const [n, setN] = useState(0)
  return [n, (v: number) => setN((x) => (Math.abs(x - v) < 1 ? x : v))] as const
}
