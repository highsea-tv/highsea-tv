// SPDX-License-Identifier: AGPL-3.0-only
// Offline and Downloads (C8; client-settings.md#offline), one screen at two addresses: the phone's
// Offline tab (/offline, the prototype's mobile/more.tsx MobileOffline) and Downloads on the web
// and in the desktop app (/downloads, web/settings.tsx's WebDownloads and DesktopDownloads), which
// the account menu opens. Which it draws is the device's, not the address's:
// - the phone and the desktop app, which keep downloads: the title, then the list
//   (./list.tsx), with Download on Wi-Fi only on the phone and Kept in on a computer under it; or,
//   before downloading is built (4.6), "Nothing downloaded" and that it comes in the next update
//   (client-settings.md#offline-before-downloads, the 4.5a prototype). The phone's title is
//   Offline, under its own header, and pulling it down asks the server again, which renews what
//   had expired;
// - a browser: "Downloads live in the desktop app", with Get the desktop app opening Get the apps
//   (desktop-app.md#get-the-apps);
// - the TV keeps none, so either address goes Home.
import { downloadsMessages } from '@highsea-tv/client/downloads'
import { useT } from '@highsea-tv/i18n/react'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  EmptyState,
  ScrollView,
  Switch,
  Text,
  tokens,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { RefreshControl, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ServerAppsDialog } from '../account/get-the-apps.tsx'
import { KeptIn } from '../desktop/kept-in.tsx'
import { TouchHeader } from '../kit.tsx'
import { OfflineList } from './list.tsx'
import { useDownloads, useDownloadsBuilt, useOfflineApp } from './store.ts'

const { space } = tokens

export function DownloadsScreen() {
  const input = useFormFactor().input
  const app = useOfflineApp()
  if (input === 'tv') return <Redirect href="/" />
  if (!app) return <BrowserDownloads />
  return input === 'touch' ? <PhoneOffline /> : <ComputerDownloads />
}

/** The phone's Offline: its header, then the list or what's coming, pulled down to renew. */
function PhoneOffline() {
  const t = useT(downloadsMessages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const gutter = usePageGutter()
  const built = useDownloadsBuilt()
  const d = useDownloads('mobile')
  const [wifi, setWifi] = useState(true)
  // pulling asks the server again, which renews what had expired; the refresh ends at once, as the
  // renewal is the device's own
  const renew = () => {
    for (const x of d.items) if (x.state === 'expired') d.store.renew(x.id)
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      refreshControl={
        built ? (
          <RefreshControl refreshing={false} tintColor={theme.colors['text-3']} onRefresh={renew} />
        ) : undefined
      }
      contentContainerStyle={{
        // the prototype's pt-1 under the status bar, and gap-5
        paddingTop: insets.top + space['1'],
        paddingBottom: space['8'],
        gap: space['5'],
      }}
    >
      <TouchHeader title={t('offline')} />
      <View style={{ paddingHorizontal: gutter }}>
        {built ? (
          <OfflineList
            app="mobile"
            d={d}
            settings={<Switch label={t('wifiOnly')} checked={wifi} onCheckedChange={setWifi} />}
          />
        ) : (
          // the prototype's py-6 around it
          <View style={{ paddingVertical: space['6'] }}>
            <EmptyState icon="download" title={t('emptyTitle')}>
              {t('laterPhone')}
            </EmptyState>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

/** The desktop app's Downloads: the title, then the list with the folder they're kept in. */
function ComputerDownloads() {
  const t = useT(downloadsMessages)
  const theme = useTheme()
  const gutter = usePageGutter()
  const built = useDownloadsBuilt()
  const d = useDownloads('desktop')
  // what's on this computer's disk now: the films that have started, by how far they've got
  const kept = d.items.filter((x) => x.progress > 0)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: web.maxWidth,
        alignSelf: 'center',
        // the prototype's pt-6 pb-16 gap-6
        paddingTop: space['6'],
        paddingBottom: space['16'],
        paddingHorizontal: gutter,
        gap: space['6'],
      }}
    >
      <Text variant="heading" accessibilityRole="header">
        {t('title')}
      </Text>
      {built ? (
        <OfflineList
          app="desktop"
          d={d}
          settings={
            <KeptIn
              kept={{
                count: kept.length,
                bytes: kept.reduce((n, x) => n + x.bytes * x.progress, 0),
              }}
            />
          }
        />
      ) : (
        <EmptyState icon="download" title={t('emptyTitle')}>
          {t('laterComputer')}
        </EmptyState>
      )}
    </ScrollView>
  )
}

/** A browser can't keep films: where to get the app that can. */
function BrowserDownloads() {
  const t = useT(downloadsMessages)
  const theme = useTheme()
  const gutter = usePageGutter()
  const [apps, setApps] = useState(false)
  const { height } = useWindowDimensions()
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
      }}
    >
      <View
        style={{
          // the prototype's min-h-[60vh] place-items-center: the words in the middle of its top part
          minHeight: height * 0.6,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: gutter,
        }}
      >
        <EmptyState
          icon="download"
          title={t('browserTitle')}
          action={
            <Button
              variant="primary"
              icon="laptop"
              hasPopup="dialog"
              accessibilityState={{ expanded: apps }}
              onPress={() => setApps(true)}
            >
              {t('getDesktop')}
            </Button>
          }
        >
          {t('browserBody')}
        </EmptyState>
        <ServerAppsDialog open={apps} onOpenChange={setApps} />
      </View>
    </View>
  )
}
