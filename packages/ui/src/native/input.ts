// SPDX-License-Identifier: AGPL-3.0-only
// The input this device is used with, for the form-factor rule (controls.md › The form factor): a
// TV's remote on a TV (`Platform.isTV`, react-native-tvos's), touch on iOS and Android, and on the
// web a pointer unless the primary pointer is coarse (`COARSE_POINTER`, as a phone's or a
// tablet's browser's is), followed as it changes. It's
// the one place the library asks the OS: screens ask `useFormFactor`. Internal to the library.
import { COARSE_POINTER, type Input } from '@highsea-tv/tokens'
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

/** The DOM's `matchMedia`, which React Native's types leave out: only the web has it. */
type MatchMedia = (query: string) => {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

const matchMedia = () => (globalThis as { matchMedia?: MatchMedia }).matchMedia

function subscribe(change: () => void) {
  const query = matchMedia()?.(COARSE_POINTER)
  query?.addEventListener('change', change)
  return () => query?.removeEventListener('change', change)
}

const coarse = () => matchMedia()?.(COARSE_POINTER).matches ?? false

/**
 * The device's input. A web page rendered ahead of time has a pointer, and the browser corrects it
 * as it hydrates.
 */
export function useDeviceInput(): Input {
  // subscribed everywhere, so the hooks run in one order: off the web there's nothing to follow
  const touch = useSyncExternalStore(subscribe, coarse, () => false)
  if (Platform.isTV) return 'tv'
  if (Platform.OS !== 'web') return 'touch'
  return touch ? 'touch' : 'pointer'
}
