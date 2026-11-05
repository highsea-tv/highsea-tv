// SPDX-License-Identifier: AGPL-3.0-only
// The system browser, for single sign-on and a page opened outside the app: expo-web-browser on the
// phone and the web (ASWebAuthenticationSession, Custom Tabs, a window). tvOS has no browser and
// expo-web-browser no tvOS module (https://docs.expo.dev/versions/latest/sdk/webbrowser/ lists
// Android, iOS and Web), so the TV never loads it: requiring it there throws "Cannot find native
// module 'ExpoWebBrowser'". The TV signs in from the phone, by code, so it never needs one.
import type * as WebBrowserModule from 'expo-web-browser'
import { Platform } from 'react-native'
import { desktop } from './desktop/app.ts'

type WebBrowser = typeof WebBrowserModule

let loaded: WebBrowser | null | undefined

/** expo-web-browser, or null on the TV, which has no browser. Loaded when first asked for. */
function browser(): WebBrowser | null {
  if (loaded === undefined)
    loaded = Platform.isTV ? null : (require('expo-web-browser') as WebBrowser)
  return loaded
}

/**
 * Opens a page in the system browser; nothing on the TV. The desktop app opens it through Tauri's
 * opener plugin, since a webview's window.open isn't the system browser.
 */
export async function openBrowser(url: string) {
  if (desktop) return desktop.openBrowser(url)
  await browser()?.openBrowserAsync(url)
}

/**
 * Single sign-on in the system's authentication session, back at `redirect`. On the TV, which has
 * none, it's dismissed at once, as a person closing the session would be.
 */
export async function openAuthSession(
  url: string,
  redirect: string,
): Promise<WebBrowserModule.WebBrowserAuthSessionResult> {
  const b = browser()
  if (!b) return { type: 'dismiss' as WebBrowserModule.WebBrowserResultType }
  return b.openAuthSessionAsync(url, redirect)
}
