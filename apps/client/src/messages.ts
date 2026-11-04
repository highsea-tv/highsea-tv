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

// The words for an address that leads nowhere.
export const notFound = defineMessages({
  title: 'There’s nothing here',
  body: 'It may have moved.',
  home: 'Go home',
})

/**
 * The owner's announcements, which the shell shows on every destination (connectivity.md ›
 * Announcements, client-home.md › Announcements): the dialog or the TV's screen for one that must
 * be acknowledged, and the toast.
 */
export const announcements = defineMessages({
  announcement: 'Announcement',
  fromOwner: 'From the server’s owner',
  gotIt: 'Got it',
  notHeard: 'Couldn’t tell the server. Try Got it again.',
})

/** The phone's header (the prototype's mobile/shell.tsx Header) and its sheet of servers. */
export const header = defineMessages({
  servers: 'Servers',
  here: 'On this network',
  away: 'Connected remotely',
  unreachable: 'Can’t reach it right now',
  switcher: '{name}, switch server',
})
