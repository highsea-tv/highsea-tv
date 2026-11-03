// SPDX-License-Identifier: AGPL-3.0-only
// The client's words (ADR 0021). The gate's, the navigation's and Settings' are every client's, in
// @highsea-tv/client (gate and prefs), which the phone and the TV apps take too: this file only
// gathers them and adds what's the client's own.
import {
  connectMessages,
  forgetMessages,
  shellMessages,
  signInMessages,
  tvConnectMessages,
} from '@highsea-tv/client/gate'
import { settingsMessages, settingsPageMessages } from '@highsea-tv/client/prefs'
import { defineMessages } from '@highsea-tv/i18n'

export {
  connectMessages as connect,
  forgetMessages as forget,
  settingsMessages as sections,
  settingsPageMessages as settings,
  shellMessages as shell,
  signInMessages as signIn,
  tvConnectMessages as tvConnect,
}

// A copy of apps/mobile's and apps/tv's not-found words until part B, when those apps go and this
// is the one catalog.
export const notFound = defineMessages({
  title: 'There’s nothing here',
  body: 'It may have moved.',
  home: 'Go home',
})
