// SPDX-License-Identifier: AGPL-3.0-only
// The Bonjour browser's JavaScript side (../ios/HighseaDiscoveryModule.swift, on iOS and tvOS): start, stop, and the
// servers and states it sends as it goes.
import { type EventSubscription, requireNativeModule } from 'expo-modules-core'

export type Found = { id: string; name: string; host: string; port: number }
export type BrowseState = { state: 'browsing' | 'refused' | 'failed'; message?: string }

type Native = {
  start(): void
  stop(): void
  addListener(event: 'onFound', listener: (f: Found) => void): EventSubscription
  addListener(event: 'onState', listener: (s: BrowseState) => void): EventSubscription
}

const native = requireNativeModule<Native>('HighseaDiscovery')

/** Browses until the returned function is called. */
export function browse(on: { found: (f: Found) => void; state: (s: BrowseState) => void }) {
  const a = native.addListener('onFound', on.found)
  const b = native.addListener('onState', on.state)
  native.start()
  return () => {
    native.stop()
    a.remove()
    b.remove()
  }
}
