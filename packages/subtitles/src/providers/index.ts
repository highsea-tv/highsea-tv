// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea-tv/subtitles/providers`: the three provider adapters (checkpoint 7's plan, "Providers"),
// what A10 shows about each (info.ts), and the zip reader their downloads share.
import type { Provider, ProviderDeps, ProviderId } from '../shared/types.ts'
import { createOpenSubtitles } from './opensubtitles.ts'
import { createSubdl } from './subdl.ts'
import { createSubSource } from './subsource.ts'

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

export { PROVIDER_INFO, PROVIDER_ORDER, type ProviderField, type ProviderInfo } from './info.ts'
export { MAX_SUBTITLE_BYTES, readSubtitleZip } from './zip.ts'
export { createOpenSubtitles, createSubdl, createSubSource }
