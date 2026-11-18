// SPDX-License-Identifier: AGPL-3.0-only
// Which way the phone's screens turn (src/orientation.ts, HT-58): the phone's build declares every
// orientation in Info.plist, as Expo's config plugin writes it, since iOS turns a screen only to
// orientations the app declares; the screens then narrow it, the app upright and the player
// turning with the phone. The Apple TV's build is left as it was.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { IOSConfig } from 'expo/config-plugins'
import { APP_ORIENTATION, PLAYER_ORIENTATION } from '../src/orientation.ts'

const config = async (tv: boolean) => {
  const before = process.env.EXPO_TV
  if (tv) process.env.EXPO_TV = '1'
  else delete process.env.EXPO_TV
  try {
    // a fresh copy each time, since the config reads EXPO_TV as it loads
    return (await import(`../app.config.ts?tv=${tv}`)).default
  } finally {
    if (before === undefined) delete process.env.EXPO_TV
    else process.env.EXPO_TV = before
  }
}

describe('which way the phone turns', () => {
  test('the phone’s Info.plist declares portrait and both landscapes', async () => {
    const plist = IOSConfig.Orientation.setOrientation(await config(false), {})
    expect(plist.UISupportedInterfaceOrientations).toEqual(
      expect.arrayContaining([
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ]),
    )
  })

  test('every screen is upright but the player, which turns with the phone', () => {
    expect(APP_ORIENTATION).toBe('portrait_up')
    expect(PLAYER_ORIENTATION).toBe('default')
    // the root stack's options and the player's (src/app/_layout.tsx)
    const layout = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8')
    expect(layout).toContain('orientation: APP_ORIENTATION')
    expect(layout).toContain('orientation: PLAYER_ORIENTATION')
  })

  test('the Apple TV’s build sets no orientation', async () => {
    expect((await config(true)).orientation).toBeUndefined()
  })
})

// Now Playing's poster (packages/native/src/now-playing.ts): expo-video takes it as a file URL
// only with highsea's patch, and the patch reaches the iPhone only when expo-video is built from
// source rather than from Expo's precompiled framework
// (https://docs.expo.dev/guides/prebuilt-expo-modules/)
describe('Now Playing’s artwork on the iPhone', () => {
  test('expo-video is patched to take a file URL and built from source', () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(read('../../../patches/expo-video@58.0.11.patch')).toContain(
      '+    guard let data, response is HTTPURLResponse || url.isFileURL else {',
    )
    const pkg = JSON.parse(read('../package.json'))
    expect(pkg.expo.autolinking.ios.buildFromSource).toContain('expo-video')
    expect(pkg.dependencies['expo-video']).toBe('58.0.11')
  })
})
