// SPDX-License-Identifier: AGPL-3.0-only
// Download for a group (C8; client-detail.md#download): every song on an album or every episode in
// a season, from the prototype's GroupDownload in client/download-button.tsx. It reads Download,
// then how far the group has got with Cancel, then Downloaded with its size and Remove; with part
// of the group kept it offers the rest. As with the film's Download (button.tsx), only the apps
// that keep downloads draw it (the phone and the desktop app), and only once downloading is built,
// which until 4.6 means a mock build (store.ts). Its sources come from
// `@highsea-tv/client/downloads`: `songSource` for an album, an episode's for a season.
import {
  downloadsMessages,
  groupState,
  type OfflineApp,
  type OfflineSource,
  whereOf,
} from '@highsea-tv/client/downloads'
import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import { Button, Icon, ProgressBar, Text, tokens } from '@highsea-tv/ui'
import { View } from 'react-native'
import { useSay, useServerName } from '../kit.tsx'
import { useDownloads, useDownloadsBuilt, useOfflineApp } from './store.ts'

const { space } = tokens

/** The bar's width while the group downloads: the prototype's w-40. */
const BAR_WIDTH = space['16'] * 2.5

export type GroupDownloadProps = {
  /** Every song or episode in the group, in order. */
  sources: readonly OfflineSource[]
  /** What the words call it: the album's title, or "Season 2 of The Long Way North". */
  name: string
  /** Download's words: "Download" by default, or "Download season". */
  label?: string
  /** Across the width, as on the phone's album page. */
  wide?: boolean
  /** Quiet, beside a season's Mark season as watched. */
  ghost?: boolean
  /** The buttons' size beside it: `md` in a page's head (the default), `sm` in a season's. */
  size?: 'sm' | 'md'
}

/** A group's Download, or nothing where downloads aren't kept. */
export function GroupDownload(props: GroupDownloadProps) {
  const app = useOfflineApp()
  const built = useDownloadsBuilt()
  if (!app || !built || props.sources.length === 0) return null
  return <Group {...props} app={app} />
}

const row = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space['2'],
} as const

function Group({
  sources,
  name,
  label,
  wide = false,
  ghost = false,
  size = 'md',
  app,
}: GroupDownloadProps & { app: OfflineApp }) {
  const t = useT(downloadsMessages)
  const say = useSay()
  const server = useServerName()
  const d = useDownloads(app)
  const kept = (id: string) => d.items.find((x) => x.id === id)
  const g = groupState(sources.map((x) => kept(x.id)))
  const ids = sources.map((x) => x.id)
  const remove = () => {
    d.store.remove(ids)
    say({ title: t('removed', { title: name }), body: t('stillPlays', { server }) })
  }

  if (g.going)
    return (
      <View style={row}>
        <View style={{ width: BAR_WIDTH }}>
          <ProgressBar
            value={g.progress * 100}
            showValue
            label={t('downloadingOf', { title: name })}
          />
        </View>
        <Text variant="caption" color="text-3">
          {t('groupDone', { done: g.done, count: sources.length })}
        </Text>
        <Button size={size} variant="ghost" onPress={remove}>
          {t('cancel')}
        </Button>
      </View>
    )

  if (g.all)
    return (
      <View style={row}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] + space['0.5'] }}
        >
          <Icon name="check" size={tokens.icon.size.sm} color="accent-text" />
          <Text variant="caption" color="text-2">
            {t('groupKept', { size: bytes(g.kept.reduce((s, x) => s + x.bytes, 0)) })}
          </Text>
        </View>
        <Button size={size} variant="ghost" icon="delete" onPress={remove}>
          {t('remove')}
        </Button>
      </View>
    )

  const rest = sources.filter((x) => !kept(x.id))
  const download = label ?? t('download')
  return (
    <Button
      size={size}
      variant={ghost ? 'ghost' : 'secondary'}
      icon="download"
      block={wide}
      onPress={() => {
        d.store.start(rest)
        const unit = rest[0]?.kind === 'song' ? 'songs' : 'episodes'
        say({
          title: t('downloadingTo', { title: name }),
          body: t('groupTo', {
            count: t(unit, { count: rest.length }),
            where: whereOf(app, t),
          }),
        })
      }}
    >
      {g.none ? download : t('groupRest', { label: download })}
    </Button>
  )
}
