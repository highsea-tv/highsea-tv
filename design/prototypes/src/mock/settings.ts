// SPDX-License-Identifier: AGPL-3.0-only
// The server's settings pages (A15, `/settings/*`): what each holds, with Harbor's values. The
// reference pages edit these as plain values; Phase 3 gives each section its own schema.
import type { ImportList } from './types.ts'

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
  bindInterface: string
  killSwitch: boolean
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
  twoFactor: 'everyone' | 'staff' | 'optional'
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

/** MB per minute of runtime: below `min` or above `max` a release is rejected. */
export type QualitySize = { quality: string; min: number; preferred: number; max: number }

export type Settings = {
  general: GeneralSettings
  media: MediaSettings
  downloadClient: DownloadClientSettings
  network: NetworkSettings
  security: SecuritySettings
  backups: BackupSettings
  connections: Connection[]
  importLists: ImportList[]
  qualitySizes: QualitySize[]
}

export type SettingsSection = keyof Settings

export const defaultSettings = (): Settings => ({
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
    port: 51413,
    encryption: 'prefer',
    bindInterface: 'wg0',
    killSwitch: true,
    upnp: false,
    maxActive: 3,
  },
  network: {
    externalUrl: 'https://harbor.example.net',
    trustedProxies: '172.18.0.0/16',
    proxyHeaders: true,
    tls: 'proxy',
    discovery: true,
  },
  security: {
    twoFactor: 'staff',
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
  qualitySizes: [
    { quality: 'SDTV', min: 2, preferred: 10, max: 20 },
    { quality: 'DVD', min: 4, preferred: 15, max: 30 },
    { quality: 'WEB 720p', min: 6, preferred: 20, max: 40 },
    { quality: 'Bluray 720p', min: 8, preferred: 25, max: 50 },
    { quality: 'WEB 1080p', min: 10, preferred: 40, max: 80 },
    { quality: 'Bluray 1080p', min: 15, preferred: 60, max: 120 },
    { quality: 'WEB 2160p', min: 25, preferred: 120, max: 250 },
    { quality: 'Bluray 2160p', min: 35, preferred: 200, max: 400 },
  ],
})
