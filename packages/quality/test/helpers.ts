// SPDX-License-Identifier: AGPL-3.0-only
// Parsed releases written by hand, so these tests don't depend on the parser.
import type { ParsedQuality, ParsedRelease, Revision } from '@highsea/parser'

export const revision = (r: Partial<Revision> = {}): Revision => ({
  version: 1,
  real: 0,
  proper: false,
  repack: false,
  ...r,
})

export function release(
  name: string,
  r: Partial<Omit<ParsedRelease, 'quality'>> & { quality?: Partial<ParsedQuality> } = {},
): ParsedRelease {
  const { quality, ...rest } = r
  // The spread of a Partial widens each field to `| undefined`; the defaults above it fill them.
  return {
    name,
    title: 'Sintel',
    year: 2010,
    edition: null,
    languages: [],
    multi: false,
    subtitles: [],
    releaseGroup: null,
    hardcodedSubs: null,
    ids: { imdb: null, tmdb: null },
    codec: null,
    hdr: [],
    threeD: false,
    ...rest,
    quality: {
      source: 'bluray',
      resolution: 1080,
      modifier: 'none',
      revision: revision(),
      ...quality,
    },
  } as ParsedRelease
}

export const GB = 1e9
