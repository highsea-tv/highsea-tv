// SPDX-License-Identifier: AGPL-3.0-only
// Download on a film's page (C8; client-detail.md#download), from the prototype's
// client/download-button.tsx: Download, then where it's got to, then Downloaded with Remove. Only
// the apps that keep downloads draw it, the phone across the width under Play and the desktop app
// beside the page's actions; a browser and the TV have none (a page can't keep a film for
// offline, client-settings.md#offline), and neither does an app before downloading is built
// ("The item page has no Download button until then"). A season's and an album's, and an
// episode's ring, come with shows and music (B3).
import type { ClientItem } from '@highsea-tv/api-contract'
import { downloadsMessages, filmSource, whereOf } from '@highsea-tv/client/downloads'
import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import { Button, ProgressBar, Text, tokens } from '@highsea-tv/ui'
import { View } from 'react-native'
import { useSay, useServerName } from '../kit.tsx'
import { useDownloads, useDownloadsBuilt, useOfflineApp } from './store.ts'

const { space } = tokens

/** The bar's widest: the prototype's 24rem. */
const BAR_MAX = space['16'] * 6

/** The film page's Download, or nothing where downloads aren't kept. */
export function DownloadButton({
  item,
  wide = false,
  start = 0,
}: {
  item: ClientItem
  wide?: boolean
  /** Room before it: the desktop app's, beside the round actions (the prototype's ms-2). */
  start?: number
}) {
  const app = useOfflineApp()
  const built = useDownloadsBuilt()
  if (!app || !built) return null
  const button = <Download item={item} app={app} wide={wide} />
  return start ? <View style={{ marginStart: start }}>{button}</View> : button
}

const row = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space['2'],
} as const

function Download({
  item,
  app,
  wide,
}: {
  item: ClientItem
  app: 'mobile' | 'desktop'
  /** The phone's, across the width under Play. */
  wide: boolean
}) {
  const t = useT(downloadsMessages)
  const say = useSay()
  const server = useServerName()
  const d = useDownloads(app)
  const x = d.items.find((y) => y.id === String(item.id))

  if (!x)
    return (
      <Button
        icon="download"
        block={wide}
        onPress={() => {
          d.store.start(filmSource(item))
          say({
            title: t('downloadingTo', { title: item.title }),
            body: t('to', { where: whereOf(app, t) }),
          })
        }}
      >
        {t('download')}
      </Button>
    )

  if (x.state === 'downloading' || x.state === 'paused') {
    const paused = x.state === 'paused'
    return (
      <View style={{ width: '100%', maxWidth: BAR_MAX, gap: space['1'] }}>
        <ProgressBar
          value={x.progress * 100}
          showValue
          tone={paused ? 'neutral' : 'accent'}
          label={t('downloadingOf', { title: item.title })}
        />
        {/* Pause wraps under the line when both don't fit (200% text on a phone) */}
        <View style={{ ...row, justifyContent: 'space-between' }}>
          <Text variant="caption" color="text-3" style={{ flexShrink: 1 }}>
            {paused
              ? t('pausedLine', { done: bytes(x.bytes * x.progress), size: bytes(x.bytes) })
              : t('downloadingButton', {
                  speed: bytes(x.speed),
                  left: bytes(x.bytes * (1 - x.progress)),
                })}
          </Text>
          <Button
            variant="ghost"
            icon={paused ? 'download' : 'pause'}
            onPress={() => (paused ? d.store.resume(x.id) : d.store.pause(x.id))}
          >
            {paused ? t('resume') : t('pause')}
          </Button>
        </View>
      </View>
    )
  }

  if (x.state === 'queued' || x.state === 'waiting-wifi')
    return (
      <View style={row}>
        <Text variant="body" color="text-2">
          {t(x.state === 'queued' ? 'waiting' : 'waitingWifi')}
        </Text>
        <Button variant="ghost" onPress={() => d.store.remove(x.id)}>
          {t('cancel')}
        </Button>
      </View>
    )

  if (x.state === 'failed')
    return (
      <View style={row}>
        <Text variant="body" color="badge-danger">
          {t('stoppedButton')}
        </Text>
        <Button icon="download" onPress={() => d.store.retry(x.id)}>
          {t('tryAgain')}
        </Button>
      </View>
    )

  return (
    <View style={row}>
      <Text variant="body" color="text-2" style={{ flexShrink: 1 }}>
        {x.state === 'expired'
          ? t('downloadedExpired', { server })
          : t('downloaded', { days: x.daysLeft })}
      </Text>
      <Button
        variant="ghost"
        icon="delete"
        onPress={() => {
          d.store.remove(x.id)
          say({ title: t('removed', { title: item.title }), body: t('stillPlays', { server }) })
        }}
      >
        {t('remove')}
      </Button>
    </View>
  )
}
