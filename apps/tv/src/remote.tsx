// SPDX-License-Identifier: AGPL-3.0-only
// The remote (tv.md#remote-keys), the same on Apple TV and Android TV: react-native-tvos turns the
// Siri Remote's Menu and Android TV's Back into BackHandler's `hardwareBackPress`, and each press
// and move into useTVEventHandler's events (https://github.com/react-native-tvos/react-native-tvos#readme).
// Back runs the screen's registered handler (back.ts), else goes Home. Every key plays its sound
// from the device's pack (sound.md), on by default on a TV.
//
// tvOS leaves for the Home screen on Menu only while the app isn't taking the key, and an app
// can't leave by itself, so at Home's root, with focus on the first item, the key is let go
// (TVEventControl.disableTVMenuKey) and the next Menu leaves. Android TV leaves when no handler
// takes the press.
import { useDevicePrefs } from '@highsea-tv/client/prefs'
import { useSounds } from '@highsea-tv/native/sound'
import { remoteKey } from '@highsea-tv/ui-native/tv'
import { router, usePathname } from 'expo-router'
import { type ReactNode, useCallback, useEffect, useMemo } from 'react'
import { BackHandler, Platform, TVEventControl, useTVEventHandler } from 'react-native'
import { BackContext, type BackRegistry } from './back.ts'

/** `signedIn`: the sounds follow the person's preferences; before that, the TV's default. */
export function Remote({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const registry = useMemo<BackRegistry>(() => ({ current: null }), [])
  const pathname = usePathname()

  useEffect(() => {
    TVEventControl.enableTVMenuKey()
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (registry.current) {
        registry.current()
        return true
      }
      if (pathname !== '/') {
        router.dismissTo('/')
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [registry, pathname])

  return (
    <BackContext.Provider value={registry}>
      {signedIn ? <PreferredSounds /> : <Sounds on volume={0.8} />}
      {children}
    </BackContext.Provider>
  )
}

/** The device's interface sounds, once signed in (the preferences live on the server). */
function PreferredSounds() {
  const { current } = useDevicePrefs()
  return <Sounds on={current?.sound ?? true} volume={current?.volume ?? 0.8} />
}

function Sounds({ on, volume }: { on: boolean; volume: number }) {
  const play = useSounds({ on, volume })
  const onEvent = useCallback(
    (evt: { eventType: string }) => {
      const key = remoteKey(evt.eventType)
      if (key) play(key.sound)
    },
    [play],
  )
  useTVEventHandler(onEvent)
  return null
}

/**
 * Lets Back leave highsea while `atRoot` (Home, focus on its first item): on tvOS by letting the
 * Menu key go, on Android TV by leaving when Back comes.
 */
export function useLeaveOnBack(atRoot: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (atRoot) TVEventControl.disableTVMenuKey()
    else TVEventControl.enableTVMenuKey()
    return () => TVEventControl.enableTVMenuKey()
  }, [atRoot])
  return () => {
    if (Platform.OS === 'android') BackHandler.exitApp()
  }
}
