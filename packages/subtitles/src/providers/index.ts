// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea-tv/subtitles/providers`: the three provider adapters (checkpoint 7's plan, "Providers"),
// what A10 shows about each, and the zip reader their downloads share.
import type { Provider, ProviderDeps, ProviderId } from '../shared/types.ts'
import { createOpenSubtitles } from './opensubtitles.ts'
import { createSubdl } from './subdl.ts'
import { createSubSource } from './subsource.ts'

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

export function createProvider(
  id: ProviderId,
  deps: ProviderDeps & { openSubtitlesKey: string | null },
): Provider {
  const { openSubtitlesKey, ...rest } = deps
  switch (id) {
    case 'opensubtitles':
      return createOpenSubtitles({ ...rest, apiKey: openSubtitlesKey })
    case 'subdl':
      return createSubdl(rest)
    case 'subsource':
      return createSubSource(rest)
  }
}

export { MAX_SUBTITLE_BYTES, readSubtitleZip } from './zip.ts'
export { createOpenSubtitles, createSubdl, createSubSource }
