// SPDX-License-Identifier: AGPL-3.0-only
// The words of Get the apps (ADR 0021), apart from its drawing so a catalog check can read them
// without React Native.
import { defineMessages } from '@highsea-tv/i18n'

export const getTheAppsMessages = defineMessages({
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
