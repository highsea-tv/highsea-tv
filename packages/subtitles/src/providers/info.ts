// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea-tv/subtitles/providers/info`: what A10 shows about each provider, without the adapters,
// so a browser or the prototypes' mock can import it (the adapters read zips through node:zlib).
import type { ProviderId } from '../shared/types.ts'

export type ProviderField = { key: 'username' | 'password' | 'apiKey'; secret: boolean }

export type ProviderInfo = {
  id: ProviderId
  name: string
  url: string
  fields: ProviderField[]
  /** The line free keys must show where subtitles are searched or picked, or null. */
  attribution: string | null
  /** What A10's bar counts: downloads (OpenSubtitles.com's own count) or highsea's own count of requests. */
  counts: 'downloads' | 'requests'
  /** The documented daily limit where the provider doesn't report one. */
  dailyLimit: number | null
}

/** Ties go in this order. */
export const PROVIDER_ORDER: ProviderId[] = ['opensubtitles', 'subdl', 'subsource']

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  opensubtitles: {
    id: 'opensubtitles',
    name: 'OpenSubtitles.com',
    url: 'https://www.opensubtitles.com',
    fields: [
      { key: 'username', secret: false },
      { key: 'password', secret: true },
    ],
    // Terms of use for integrators: free keys show this wherever subtitles are searched or picked.
    attribution: 'Subtitles provided by OpenSubtitles.com',
    counts: 'downloads',
    dailyLimit: null,
  },
  subdl: {
    id: 'subdl',
    name: 'Subdl',
    url: 'https://subdl.com',
    fields: [{ key: 'apiKey', secret: true }],
    attribution: null,
    counts: 'requests',
    // 2,000 requests a day for a free key (https://subdl.com/api-doc).
    dailyLimit: 2000,
  },
  subsource: {
    id: 'subsource',
    name: 'SubSource',
    url: 'https://subsource.net',
    fields: [{ key: 'apiKey', secret: true }],
    attribution: null,
    counts: 'requests',
    // 7,200 requests a day for a free key (https://subsource.net/api-docs).
    dailyLimit: 7200,
  },
}
