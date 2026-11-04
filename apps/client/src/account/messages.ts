// SPDX-License-Identifier: AGPL-3.0-only
// The account's words (ADR 0021): Connect a device (pairing a TV, connectivity.md#pairing-a-tv-
// from-the-phone), Profile (client-settings.md › C8) with the pointer's account menu, and Get the
// apps (desktop-app.md). They're the prototypes' (web/link.tsx, mobile/pair.tsx, web/settings.tsx,
// web/shell.tsx, client/get-the-apps.tsx) and the old phone app's `pair`.
import { defineMessages } from '@highsea-tv/i18n'

export const pairMessages = defineMessages({
  title: 'Connect a device',
  servers: 'Servers',
  hint: 'Type the code your TV or app shows. It works for 10 minutes.',
  scanHint: 'Point your camera at the code on the TV.',
  typeHint: 'Type the code your TV or app shows.',
  camera: 'The camera, looking for the TV’s code',
  looking: 'Looking for a code…',
  typeInstead: 'Enter the code instead',
  scanInstead: 'Scan the code instead',
  code: 'Code',
  continue: 'Continue',
  cameraOff:
    'highsea can’t use the camera. Allow it in Settings › highsea, or enter the code instead.',
  allowCamera: 'Allow the camera',
  missingTitle: 'That code isn’t waiting',
  missingBody: 'Check it on the TV, or start again there for a new one.',
  tryAgain: 'Try again',
  question: 'Sign in {device}?',
  // the phone's Settings is its You tab (the shell's tabs), as the prototype's words have it
  detail:
    '{app} at {address} signs in as you. It stays signed in until you sign it out from Settings › Devices.',
  detailPhone:
    '{app} at {address} signs in as you. It stays signed in until you sign it out from You › Devices.',
  expires: 'Code {code} · it expires in {minutes, plural, one {# minute} other {# minutes}}.',
  'app.tvos': 'highsea for Apple TV',
  'app.androidtv': 'highsea for Android TV',
  'app.ios': 'highsea for iPhone',
  'app.android': 'highsea for Android',
  'app.desktop': 'highsea for computers',
  'app.other': 'A highsea app',
  approve: 'Sign it in',
  cancel: 'Cancel',
  doneTitle: '{device} is signed in',
  doneBody: 'It opens Home on the TV now. Sign it out from Settings › Devices whenever you like.',
  doneBodyPhone: 'It opens Home on the TV now. Sign it out from You › Devices whenever you like.',
  done: 'Done',
  failed: 'Couldn’t sign it in. {message}',
})

export const profileMessages = defineMessages({
  title: 'Account',
  // what the server knows of the person: their role on it (the prototype's "owner of Harbor")
  'line.owner': '@{username} · owner of {server}',
  'line.admin': '@{username} · admin of {server}',
  'line.user': '@{username} · on {server}',
  account: 'Account',
  server: 'Server',
  twoStep: 'Two-step verification',
  on: 'On',
  off: 'Off',
  libraries: 'Libraries',
  all: 'All',
  some: '{count, plural, one {# library} other {# libraries}}',
  changePassword: 'Change password',
  passkey: 'Set up a passkey',
  settings: 'Settings',
  settingsHint: 'Theme, sounds, home screen',
  devices: 'Your devices',
  devicesHint: 'Where you’re signed in',
  downloads: 'Downloads',
  downloadsHint: 'Movies kept on this computer',
  links: 'More',
  // the pointer's account menu (the prototype's web/shell.tsx Profile)
  menu: '{name}: profile and settings',
})

export const appsMessages = defineMessages({
  title: 'Get the apps',
  list: 'Desktop apps',
  mac: 'macOS',
  macDetail: 'Apple silicon and Intel',
  windows: 'Windows',
  windowsDetail: 'Windows 10 and 11, 64-bit',
  // the installer is unsigned until 1.0 (phase-4-checkpoint-4.md, answer 6)
  windowsNote:
    'Windows may say it doesn’t recognise the installer. Choose More info, then Run anyway.',
  linux: 'Linux',
  linuxDetail: 'Ubuntu, Debian, Fedora and others',
  thisComputer: 'This computer',
  download: 'Download {file}',
  downloadFile: 'Download {file} for {os}',
  address:
    'The app finds {server} on this network by itself. Anywhere else, add it by this address:',
  copy: 'Copy',
  copyAddress: 'Copy the address',
  copied: 'Address copied',
  notCopied: 'Couldn’t copy the address',
})
