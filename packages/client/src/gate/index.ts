// SPDX-License-Identifier: AGPL-3.0-only
// The gate every client opens on (connectivity.md, one-client-platform.md › A): Choose a server,
// signing in, and forgetting a server. What the phone's, the TV's and the web's screens share
// besides drawing: the addresses to try for what someone typed, how an address is shown, single
// sign-on's start and its reasons, the TV's pairing link, and the words, one catalog per step.
// Pure.
import { defineMessages } from '@highsea-tv/i18n'
import type { Address } from '@highsea-tv/sdk'
import { normalize } from '../servers/index.ts'

/** An address without its scheme or trailing slash, as a row shows it: `192.168.1.20:3000`. */
export const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

/**
 * The addresses to try for what someone typed: normalize's guess, then the other scheme, unless
 * they wrote one. Null when it can't be an address.
 */
export function candidates(typed: string): string[] | null {
  const n = normalize(typed)
  if (!n) return null
  if (/^https?:\/\//i.test(typed.trim())) return [n]
  return [n, n.startsWith('https:') ? n.replace(/^https:/, 'http:') : n.replace(/^http:/, 'https:')]
}

/** Whether the address in use is one of the server's remote ones: "Remotely, through …". */
export function reachedRemotely(addresses: readonly Address[], base: string) {
  return addresses.find((a) => base.startsWith(a.url))?.kind === 'remote'
}

/** `now` within a minute, for "just now"; otherwise the time, for `relative`. */
export const seenWhen = (lastSeen: number, now: number) =>
  now - lastSeen < 60_000 ? ('now' as const) : new Date(lastSeen).toISOString()

/** The `reason` an API error carries in its details, as sign-in's refusals have one. */
export const reasonOf = (e: unknown) =>
  ((e as { details?: unknown } | null)?.details as { reason?: string } | undefined)?.reason

/** Where single sign-on comes back to the apps (RFC 8252's private-use scheme, ADR 0024). */
export const OIDC_REDIRECT = 'highsea://oidc'

/** The refusals single sign-on words on its own; anything else is `oidc.other`. */
export const OIDC_REASONS = ['oidc-unknown', 'oidc-denied', 'challenge-expired'] as const

/** The sign-in message for a single sign-on refusal. */
export const oidcMessage = (reason: string | undefined) =>
  reason && (OIDC_REASONS as readonly string[]).includes(reason)
    ? (`oidc.${reason}` as `oidc.${(typeof OIDC_REASONS)[number]}`)
    : ('oidc.other' as const)

/** The server's OIDC start for an app, with its PKCE challenge (ADR 0024). */
export const oidcStart = (base: string, app: string, challenge: string) =>
  `${base}/api/v1/auth/oidc/start?app=${encodeURIComponent(app)}&challenge=${encodeURIComponent(challenge)}`

/** The TV's QR: the phone app opened straight at the question (connectivity.md › Sign in a TV). */
export const pairingLink = (serverId: string, code: string) =>
  `highsea://link?server=${encodeURIComponent(serverId)}&code=${encodeURIComponent(code)}`

/** The pairing page's address as typed by hand: the QR carries the code, the page asks for it. */
export const pairingPage = (url: string) => url.split('?')[0] ?? url

// ---------------------------------------------------------------------------------------------
// The words. A server's public info doesn't name its owner, so its rows give its address where
// the prototype has "Ines's server".

/** Words more than one step of the gate says, each written once and reused by the catalogs below. */
const gateWords = defineMessages({
  anotherServer: 'Another server',
  addServer: 'Add a server',
  looking: 'Looking…',
  cancel: 'Cancel',
  tryAgain: 'Try again',
  servers: 'Servers',
  useRecovery: 'Use a recovery code',
})

/** A password sign-in's words, the same on the phone, the web and the TV. */
const accountWords = defineMessages({
  username: 'Username',
  password: 'Password',
  signIn: 'Sign in',
  verify: 'Verify',
  codeDetail: 'Enter the 6-digit code from your authenticator app.',
})

/** The navigation's destinations, by the names every app gives them. */
export const destinationMessages = defineMessages({
  main: 'Main',
  home: 'Home',
  search: 'Search',
  library: 'Library',
  movies: 'Movies',
  collections: 'Collections',
  shows: 'Shows',
  music: 'Music',
  offline: 'Offline',
  you: 'You',
  alerts: 'Alerts',
  settings: 'Settings',
})

/**
 * The navigation's words besides the destinations: the server at its start, the account and
 * Alerts at its end, and the screen a server that doesn't answer shows in place of the others.
 */
export const shellMessages = defineMessages({
  ...destinationMessages,
  remotely: 'Connected remotely',
  switchServer: 'Switch server',
  addServer: gateWords.addServer,
  anotherServer: gateWords.anotherServer,
  account: '{name}, settings',
  alertsNew: 'Alerts, {count, plural, one {# new} other {# new}}',
  unreachableTitle: 'Can’t reach {name}',
  unreachableBody:
    'highsea tried {name} on this network and at its remote address. It may be off, or the network may be down.',
  tryAgain: gateWords.tryAgain,
  comingBody: 'This part of highsea comes with the next screens.',
})

/** Choose a server on the phone and the web. */
export const connectMessages = defineMessages({
  title: 'Choose a server',
  back: 'Back',
  yourServers: 'Your servers',
  knownLine:
    '{address} · {signedIn, select, true {signed in} other {signed out}} · {when, select, now {just now} other {{when}}}',
  nearby: 'On this network',
  looking: gateWords.looking,
  waiting: 'Waiting for your iPhone…',
  lookAgain: 'Look again',
  asking:
    'Your iPhone is asking whether highsea may find devices on your local network. Choose Allow to look for servers.',
  refused:
    'highsea can’t look on this network. Allow it in Settings › Privacy & Security › Local Network, or add the server by address.',
  onlyKnown: 'Only servers you already use answered.',
  none: 'No servers answered. They may be on another network, or discovery may be off: add one by address.',
  addLabel: 'Add a server by address',
  addHint: 'Its name or IP, with the port if it isn’t 443: harbor.example.net, 192.168.1.20:3000.',
  addPlaceholder: 'harbor.example.net',
  connect: 'Connect',
  unreachable:
    'Nothing answered at {address}. Check the address, and that the server is running and reachable from here.',
  invalid: 'That doesn’t look like an address. Try harbor.example.net or 192.168.1.20.',
  notSetUp: '{name} isn’t set up yet. Its owner sets it up in a browser, at {address}.',
  cloud: 'Find my servers with a highsea account',
  cloudDetail:
    'Optional. If your server’s owner turned on highsea cloud, signing in with your highsea account lists every server shared with you, and connects through the relay when there’s no other way in. Your media never passes through it unless that’s the only route.',
})

/** Forgetting a server, from Choose a server, its sign-in, Unreachable and Settings › Servers. */
export const forgetMessages = defineMessages({
  forget: 'Forget {name}',
  short: 'Forget',
  thisServer: 'Forget this server',
  confirm: 'Forget {name}?',
  detail:
    '{device, select, tv {This TV} web {This browser} other {This phone}} signs out of it and stops listing it. You can add it again later.',
  cancel: gateWords.cancel,
})

/** Signing in on the phone and the web: a password, two-step verification and single sign-on. */
export const signInMessages = defineMessages({
  ...accountWords,
  title: 'Sign in to {name}',
  servers: gateWords.servers,
  remoteAt: 'Remotely, through {address}',
  localAt: 'On this network, at {address}',
  or: 'or',
  oidc: 'Sign in with {provider}',
  oidcWait: 'Finish signing in with {provider}. highsea opens again when you’re done.',
  'oidc.oidc-unknown': 'There’s no account on {name} for you yet. Ask its owner for an invite.',
  'oidc.oidc-denied': '{provider} didn’t sign you in. Try again, or sign in with a password.',
  'oidc.challenge-expired': 'That sign-in took too long or was already used. Start again.',
  'oidc.other': 'Signing in with {provider} didn’t work. Try again.',
  codeTitle: 'Two-step verification',
  codeLabel: 'Code',
  recoveryTitle: gateWords.useRecovery,
  recoveryDetail:
    'Enter one of the recovery codes you saved when you set up two-step verification.',
  recoveryLabel: 'Recovery code',
  useRecovery: gateWords.useRecovery,
  useApp: 'Use the authenticator app',
  otherAccount: 'Use another account',
  setupTitle: 'Set up two-step verification',
  setupDetail:
    '{name} asks for two-step verification. Set it up on its sign-in page in a browser, then come back here.',
  setupAction: 'Set it up in Safari',
  setupActionWeb: 'Open its sign-in page',
  localOff: 'Signing in with a password is off on {name}.',
  failed: 'Couldn’t load the sign-in. {message}',
  tryAgain: gateWords.tryAgain,
  keychain: 'highsea couldn’t keep your sign-in in this iPhone’s keychain. Try again.',
  noToken: '{name} signed you in but sent no sign-in for this device to keep. Try again.',
})

/** The TV's Choose a server and sign-in: by code first, a password on the remote's keys after. */
export const tvConnectMessages = defineMessages({
  ...accountWords,
  codeTitle: 'Sign in with your phone',
  step1: '1. On your phone or computer, go to {url}, or scan the code.',
  step2: '2. Enter {code} and approve this TV.',
  waiting: 'Waiting for approval. The code works for 10 minutes.',
  approved: 'Approved. Signing in…',
  expired: 'That code ran out. Here’s a new one.',
  usePassword: 'Use a password',
  anotherServer: gateWords.anotherServer,
  scan: 'Scan with your phone’s camera',
  qrLabel: 'QR code for the sign-in link',
  passwordTitle: signInMessages.title,
  code: signInMessages.codeLabel,
  setup:
    '{name} asks for two-step verification. Set it up on its sign-in page in a browser, then sign in here by code.',
  delete: 'Delete',
  next: 'Next',
  signingIn: 'Signing in…',
  useCode: 'Use a code instead',
  serversTitle: 'Servers on this network',
  serverLine: '{address}',
  looking: gateWords.looking,
  answered:
    '{count, plural, one {# answered} other {# answered}}. Add one by address from the highsea app on your phone.',
  failed: 'Couldn’t reach {name}. {message}',
  codeFailed: 'Couldn’t get a code from {name}. {message} Trying again in a moment.',
  keychain: 'highsea couldn’t keep your sign-in on this TV. Try again.',
  noToken: signInMessages.noToken,
  notSetUp: connectMessages.notSetUp,
})
