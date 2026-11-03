// SPDX-License-Identifier: AGPL-3.0-only
// The remote's Back on tvOS and Android TV: react-native-tvos turns the Siri Remote's Menu and
// Android TV's Back into BackHandler's `hardwareBackPress`
// (https://github.com/react-native-tvos/react-native-tvos#readme). On tvOS the Menu press reaches
// the app only once `TVEventControl.enableTVMenuKey()` is called, and leaves it (to the Apple TV's
// home screen) while it's disabled, as apps/tv's Remote does. The handler answers whether it took
// the press; one that didn't lets the platform have it: Android TV leaves the app, and on tvOS
// useLeaveOnBack lets the press go where nothing handles it. In a browser, ./back-key.web.ts hears
// the keyboard's Escape and Backspace in its place. Whether the Menu key is held is ../back.tsx's
// BackKeys' to say (holdMenuKey), from the screens at their root, so one place decides it.
import { useEffect, useRef } from 'react'
import { BackHandler, Platform, TVEventControl } from 'react-native'

export function useBackKey(handler: () => boolean) {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => latest.current())
    return () => sub.remove()
  }, [])
}

/**
 * Holds the Menu key for highsea (`held`), or lets it go so Back leaves to the Apple TV's home
 * screen. Only tvOS has it; Android TV leaves when the handler passes.
 */
export function holdMenuKey(held: boolean) {
  // react-native-tvos's own test for tvOS (its README's Platform.isTVOS), which its types leave out
  if (!(Platform as { isTVOS?: boolean }).isTVOS) return
  if (held) TVEventControl.enableTVMenuKey()
  else TVEventControl.disableTVMenuKey()
}
