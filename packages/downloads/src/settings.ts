// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client (settings.md): the listening port, encryption, downloading at once and
// UPnP, plus the speed limits A8's Limits dialog sets and the seeding rule an indexer without its
// own falls back to. 6b gives encryption and UPnP their effect and adds the IP blocklist. The watch
// folder (6b) is off by default, as in qBittorrent and Transmission (`watch-dir-enabled`).
import { z } from 'zod'

export const DOWNLOAD_CLIENT_KEY = 'downloadClient'

export const BLOCKLIST_SOURCE_INVALID =
  'Use an http or https address, or a file in the config folder.'

/** Empty, an http(s) address, or a path: anything with another scheme (`ftp:`, `file:`) isn't. */
export function blocklistSourceValid(source: string): boolean {
  const s = source.trim()
  if (!s) return true
  if (/^https?:\/\//i.test(s)) return URL.canParse(s)
  return !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.includes('\0')
}

export const downloadClientSchema = z.object({
  /** 1024 and up: the container runs unprivileged. */
  port: z.number().int().min(1024).max(65_535),
  encryption: z.enum(['require', 'prefer', 'allow']),
  upnp: z.boolean(),
  /** uTP (BEP 29) for peers beside TCP (6b); on by default, as in libtorrent and qBittorrent. */
  utp: z.boolean(),
  /** Downloading at once; seeding torrents don't count (activity-downloads.md). */
  maxActive: z.number().int().min(1).max(20),
  /** Bytes per second, every torrent together; 0 is no limit. */
  downloadRate: z.number().int().min(0),
  uploadRate: z.number().int().min(0),
  /** The seeding rule for an indexer that has none: a ratio or a time, whichever comes first. */
  seedRatio: z.number().min(0).max(100).nullable(),
  seedMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 365)
    .nullable(),
  /** The watch folder (6b): a `.torrent` dropped here is added; null is off. */
  watchFolder: z.string().min(1).max(4096).nullable(),
  /** The category the watch folder's torrents go in. */
  watchCategory: z.string().min(1).max(40),
  /**
   * The IP blocklist (6b): an http(s) address, fetched daily, or a file in the config folder, in
   * P2P, DAT or P2B format, maybe gzipped. Empty is off.
   */
  blocklistUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(blocklistSourceValid, BLOCKLIST_SOURCE_INVALID)
    .default(''),
})

export type DownloadClientSettings = z.infer<typeof downloadClientSchema>

/**
 * The prototype's defaults (port 6881, encryption preferred, UPnP off, three at once). The seeding
 * default is the spec's own example, a ratio of 2 or 7 days (activity-downloads.md, Seeding tab).
 */
export const DEFAULT_DOWNLOAD_CLIENT: DownloadClientSettings = {
  port: 6881,
  encryption: 'prefer',
  upnp: false,
  utp: true,
  maxActive: 3,
  downloadRate: 0,
  uploadRate: 0,
  seedRatio: 2,
  seedMinutes: 7 * 24 * 60,
  watchFolder: null,
  watchCategory: 'manual',
  blocklistUrl: '',
}
