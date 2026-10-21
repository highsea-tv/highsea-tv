// SPDX-License-Identifier: AGPL-3.0-only
// The server's settings pages (A15, `/settings/*`): what each holds, with Harbor's values. The
// reference pages edit these as plain values; Phase 3 gives each section its own schema.
import { defaultQualitySizes, type QualitySize } from '@highsea/quality'
import type { ImportList } from './types.ts'
import { defaultVpnSettings, type VpnSettings } from './vpn.ts'

export type GeneralSettings = {
  language: string
  timeZone: string
  updateChannel: 'stable' | 'beta'
  autoUpdate: boolean
  analytics: boolean
  logLevel: 'debug' | 'info' | 'warn'
}

export type MediaSettings = {
  rename: boolean
  fileFormat: string
  folderFormat: string
  hardlinks: boolean
  nfo: boolean
  chmod: string
  recycleBin: string
  unmonitorDeleted: boolean
}

export type DownloadClientSettings = {
  port: number
  encryption: 'require' | 'prefer' | 'allow'
  upnp: boolean
  maxActive: number
}

export type NetworkSettings = {
  externalUrl: string
  trustedProxies: string
  proxyHeaders: boolean
  tls: 'proxy' | 'built-in' | 'off'
  discovery: boolean
}

export type SecuritySettings = {
  /** Require two-step for the owner and admins, the only people who open the admin. */
  twoFactor: boolean
  passkeys: boolean
  oidc: { enabled: boolean; name: string; issuer: string; clientId: string }
  sessionDays: number
}

export type BackupSettings = {
  schedule: 'daily' | 'weekly' | 'off'
  time: string
  keep: number
  location: string
}

export type NotificationKind =
  | 'discord'
  | 'slack'
  | 'telegram'
  | 'ntfy'
  | 'gotify'
  | 'pushover'
  | 'email'
  | 'webhook'
  | 'apprise'

export type Connection = {
  id: string
  kind: NotificationKind
  name: string
  events: ('grab' | 'import' | 'upgrade' | 'health' | 'update')[]
  enabled: boolean
}

/** MiB per minute of runtime: below `min` or above `max` a release is rejected (@highsea/quality). */
export type { QualitySize }

export type Settings = {
  general: GeneralSettings
  media: MediaSettings
  downloadClient: DownloadClientSettings
  vpn: VpnSettings
  network: NetworkSettings
  security: SecuritySettings
  backups: BackupSettings
  connections: Connection[]
  importLists: ImportList[]
  qualitySizes: QualitySize[]
}

export type SettingsSection = keyof Settings

export const defaultSettings = (kind: 'populated' | 'empty' = 'populated'): Settings => ({
  general: {
    language: 'en-GB',
    timeZone: 'Europe/Lisbon',
    updateChannel: 'stable',
    autoUpdate: false,
    analytics: false,
    logLevel: 'info',
  },
  media: {
    rename: true,
    fileFormat: '{Movie Title} ({Release Year}) {Quality Full}',
    folderFormat: '{Movie Title} ({Release Year})',
    hardlinks: true,
    nfo: false,
    chmod: '755',
    recycleBin: '',
    unmonitorDeleted: true,
  },
  downloadClient: {
    port: 6881,
    encryption: 'prefer',
    upnp: false,
    maxActive: 3,
  },
  vpn: defaultVpnSettings(kind),
  network: {
    externalUrl: 'https://harbor.example.net',
    trustedProxies: '172.18.0.0/16',
    proxyHeaders: true,
    tls: 'proxy',
    discovery: true,
  },
  security: {
    twoFactor: true,
    passkeys: true,
    oidc: {
      enabled: true,
      name: 'Authentik',
      issuer: 'https://auth.example.net/application/o/highsea/',
      clientId: 'highsea',
    },
    sessionDays: 30,
  },
  backups: { schedule: 'daily', time: '03:30', keep: 14, location: '/config/backups' },
  connections: [
    {
      id: 'n-discord',
      kind: 'discord',
      name: 'Household Discord',
      events: ['import', 'health'],
      enabled: true,
    },
    {
      id: 'n-ntfy',
      kind: 'ntfy',
      name: 'Ines’s phone',
      events: ['grab', 'import', 'health', 'update'],
      enabled: true,
    },
  ],
  importLists: [
    {
      id: 'il-trakt',
      kind: 'trakt',
      name: 'Ines’s Trakt watchlist',
      enabled: true,
      lastSync: null,
      items: 18,
      search: true,
      profileId: 'qp-uhd',
    },
    {
      id: 'il-letterboxd',
      kind: 'letterboxd',
      name: 'Silent cinema essentials',
      enabled: false,
      lastSync: null,
      items: 42,
      search: false,
      profileId: 'qp-hd',
    },
  ],
  qualitySizes: defaultQualitySizes(),
})
