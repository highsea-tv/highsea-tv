// SPDX-License-Identifier: AGPL-3.0-only
// Which way the phone's screens turn (HT-58): the app is portrait, as mobile.md draws it, and the
// player turns with the phone (player.md › Mobile, as built in 4.5a). Each screen says so with
// react-native-screens' `orientation` (https://docs.expo.dev/router/advanced/stack/ ›
// screenOptions, https://reactnavigation.org/docs/native-stack-navigator/#orientation), which
// rotates the window when a screen with another one comes or goes, so leaving the player in
// landscape turns the app back upright. iOS lets a screen turn only to the orientations the app
// declares (`UISupportedInterfaceOrientations`; "the system intersects the view controller's
// supported orientations with the app's supported orientations",
// https://developer.apple.com/documentation/uikit/uiviewcontroller/supportedinterfaceorientations),
// so app.config.ts declares them all and these narrow them. The TV and the web ignore them.

/** Every screen but the player: upright only (Android's `portrait`, iOS's portrait mask). */
export const APP_ORIENTATION = 'portrait_up' as const

/**
 * The player: portrait and both landscapes, not upside down (iOS's AllButUpsideDown mask). On
 * Android `default` is SCREEN_ORIENTATION_UNSPECIFIED, which follows the sensor within the
 * person's auto-rotate setting, where `all` (FULL_SENSOR) would turn even with rotation locked
 * (https://developer.android.com/reference/android/R.attr#screenOrientation); iOS turns a screen
 * only while rotation lock is off in any case.
 */
export const PLAYER_ORIENTATION = 'default' as const
