// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client (ADR 0021), in the prototype's copy
// (design/prototypes/src/admin/settings/reference.tsx). Added here: the default seeding rule's
// group, which no prototype screen has, the field errors, and 6b's IP blocklist field and uTP
// switch.
import { defineMessages } from '@highsea-tv/i18n'

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
  blocklist: 'IP blocklist',
  blocklistHint:
    'An address or a file in the config folder, in P2P, DAT or P2B format. highsea updates it daily and never connects to the addresses on it. Empty: off.',
  blocklistPlaceholder: 'https://… or blocklist.p2p',
  blocklistInvalid: 'Use an http or https address, or a file in the config folder.',
  utp: 'Connect to peers over uTP',
  utpHint:
    'Lighter on your connection than TCP. highsea uses TCP with peers that don’t support it.',
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
