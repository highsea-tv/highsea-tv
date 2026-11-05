// SPDX-License-Identifier: AGPL-3.0-only
// Which app keeps downloads, whether they're built, and its store (client-settings.md#offline):
// the phone's Offline and the desktop app's Downloads each keep their own, on the device; the TV
// and a browser keep none. Downloading comes with checkpoint 4.6, so a real build says it comes in
// the next update, as the old phone app's Offline and apps/web's desktop Downloads did; a mock build draws
// the list as the prototype does (the toolbar's Downloads, `?downloads=later`, shows the phone's
// before). The logic is @highsea-tv/client/downloads'.
import { readLibrary } from '@highsea-tv/client/data'
import {
  createDownloads,
  type DownloadsStore,
  type OfflineApp,
  seedFilms,
  useDownloadsSnapshot,
} from '@highsea-tv/client/downloads'
import { useClient } from '@highsea-tv/sdk/react'
import { useEffect } from 'react'
import { useFrameState } from '../frame-channel.ts'
import { useDesktopApp, useDevice } from '../host'
import { mock } from '../transport.ts'

/** One store per app, for as long as the client runs: downloads live on the device. */
const stores: Record<OfflineApp, DownloadsStore> = {
  mobile: createDownloads(),
  desktop: createDownloads(),
}

/** The app that keeps downloads here: the desktop app, the phone, or none (a browser, the TV). */
export function useOfflineApp(): OfflineApp | null {
  const desktop = useDesktopApp()
  const device = useDevice()
  if (desktop) return 'desktop'
  return device === 'phone' ? 'mobile' : null
}

/**
 * Whether downloading is built: only a mock build draws it until 4.6, unless the toolbar says
 * the phone's isn't yet.
 */
export function useDownloadsBuilt(): boolean {
  const toolbar = useFrameState()
  return mock !== undefined && toolbar.downloads !== 'later'
}

/**
 * An app's downloads, and what can be done with them. In a mock build the first look seeds what
 * the device downloaded earlier from the server's library, as the prototype's did; it waits while
 * the server can't be reached and tries again on the next look.
 */
export function useDownloads(app: OfflineApp) {
  const store = stores[app]
  const client = useClient()
  const built = useDownloadsBuilt()
  useEffect(() => {
    if (!built || store.seeded()) return
    let gone = false
    readLibrary(client).then(
      (films) => {
        if (!gone) store.seed(seedFilms(app, films))
      },
      () => {},
    )
    return () => {
      gone = true
    }
  }, [built, store, client, app])
  const snap = useDownloadsSnapshot(store)
  return { ...snap, store }
}

export type Downloads = ReturnType<typeof useDownloads>
