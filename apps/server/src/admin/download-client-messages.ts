// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client (ADR 0021), in the prototype's copy
// (design/prototypes/src/admin/settings/reference.tsx). Added here: the default seeding rule's
// group, which no prototype screen has, the later-update line for encryption and UPnP, and the
// field errors.
import { defineMessages } from '@highsea/i18n'

export const downloadClient = defineMessages({
  what: 'these settings',
  saved: 'Settings saved',
  saveError: 'Couldn’t save',
  'vpn.title': 'VPN',
  'vpn.settings': 'VPN settings',
  'connections.title': 'Connections',
  port: 'Listening port',
  portInvalid: 'Use a port from 1024 to 65535.',
  encryption: 'Encryption',
  'encryption.require': 'Require',
  'encryption.prefer': 'Prefer',
  'encryption.allow': 'Allow',
  maxActive: 'Downloading at once',
  maxActiveHint: 'The rest wait in the queue.',
  maxActiveInvalid: 'Use a whole number from 1 to 20.',
  upnp: 'Open the port with UPnP',
  upnpHint: 'Off behind a VPN: forward the port there instead.',
  later: 'Encryption and UPnP take effect in a later update. highsea keeps your choice until then.',
  'seeding.title': 'Seeding',
  'seeding.description':
    'When a torrent stops seeding: at the ratio or the time, whichever comes first. An indexer’s own rule comes before this one.',
  seedRatio: 'Ratio',
  seedRatioHint: 'Uploaded divided by size. Empty: no limit.',
  seedRatioInvalid: 'Use a number from 0 to 100, or leave it empty.',
  seedHours: 'Time, in hours',
  seedHoursHint: 'Empty: no limit.',
  seedHoursInvalid: 'Use a number of hours up to a year, or leave it empty.',
  'elsewhere.before': 'Speed limits are on',
  'elsewhere.link': 'Downloads',
})
