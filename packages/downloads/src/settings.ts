// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client (settings.md): the listening port, encryption, downloading at once and
// UPnP, plus the speed limits A8's Limits dialog sets and the seeding rule an indexer without its
// own falls back to. Encryption and UPnP are stored now and take effect with 6b's engine work.
import { z } from 'zod'

export const DOWNLOAD_CLIENT_KEY = 'downloadClient'

export const downloadClientSchema = z.object({
  /** 1024 and up: the container runs unprivileged. */
  port: z.number().int().min(1024).max(65_535),
  encryption: z.enum(['require', 'prefer', 'allow']),
  upnp: z.boolean(),
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
  maxActive: 3,
  downloadRate: 0,
  uploadRate: 0,
  seedRatio: 2,
  seedMinutes: 7 * 24 * 60,
}
