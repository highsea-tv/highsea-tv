// SPDX-License-Identifier: AGPL-3.0-only
// The TV app's words (ADR 0021), a catalog per screen, as the prototype has them
// (design/prototypes/src/tv). A server's public info doesn't name its owner, so a server's line
// gives its address where the prototype has "Ines's server".
import { defineMessages } from '@highsea-tv/i18n'

export const shell = defineMessages({
  main: 'Main',
  home: 'Home',
  search: 'Search',
  library: 'Library',
  settings: 'Settings',
  remotely: 'Connected remotely',
  onServer: 'On {name}',
  announcement: 'Announcement',
  fromOwner: 'From the server’s owner',
  gotIt: 'Got it',
  unreachableTitle: 'Can’t reach {name}',
  unreachableBody:
    'highsea tried {name} on this network and at its remote address. It may be off, or the network may be down.',
  tryAgain: 'Try again',
  anotherServer: 'Another server',
  notFoundTitle: 'There’s nothing here',
  notFoundBody: 'It may have moved.',
  goHome: 'Go home',
})

export const connect = defineMessages({
  codeTitle: 'Sign in with your phone',
  step1: '1. On your phone or computer, go to {url}, or scan the code.',
  step2: '2. Enter {code} and approve this TV.',
  waiting: 'Waiting for approval. The code works for 10 minutes.',
  approved: 'Approved. Signing in…',
  expired: 'That code ran out. Here’s a new one.',
  usePassword: 'Use a password',
  anotherServer: 'Another server',
  scan: 'Scan with your phone’s camera',
  qrLabel: 'QR code for the sign-in link',
  passwordTitle: 'Sign in to {name}',
  username: 'Username',
  password: 'Password',
  code: 'Code',
  codeDetail: 'Enter the 6-digit code from your authenticator app.',
  setup:
    '{name} asks for two-step verification. Set it up on its sign-in page in a browser, then sign in here by code.',
  delete: 'Delete',
  next: 'Next',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  verify: 'Verify',
  useCode: 'Use a code instead',
  serversTitle: 'Servers on this network',
  serverLine: '{address}',
  looking: 'Looking…',
  answered:
    '{count, plural, one {# answered} other {# answered}}. Add one by address from the highsea app on your phone.',
  failed: 'Couldn’t reach {name}. {message}',
  keychain: 'highsea couldn’t keep your sign-in on this TV. Try again.',
})

/** Forgetting a server, from the foot of sign-in and of Unreachable, as on the phone. */
export const forget = defineMessages({
  thisServer: 'Forget this server',
  confirm: 'Forget {name}?',
  detail: 'This TV signs out of it and stops listing it. You can add it again later.',
  forget: 'Forget {name}',
  cancel: 'Cancel',
})

export const home = defineMessages({
  continue: 'Continue watching',
  recent: 'Recently added',
  play: 'Play',
  resume: 'Resume',
  details: 'Details',
  left: '{time} left',
  failed: 'Couldn’t load the home screen',
  emptyTitle: 'Nothing to watch yet',
  emptyBody: 'When the server’s owner adds movies, they show up here.',
  tryAgain: 'Try again',
})
