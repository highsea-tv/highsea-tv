// SPDX-License-Identifier: AGPL-3.0-only
// How every title and name is folded for sorting and matching, pure and browser-safe: names.ts
// re-exports it for the server, and `@highsea-tv/media/search` hands it to the clients' mock.

/** Lowercase without accents (`Amélie` → `amelie`): Unicode compatibility decomposition, marks removed. */
export const fold = (s: string) =>
  s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * What Title sorts on: the title folded, without a leading English article ("The", "A", "An"), as
 * Radarr and Plex sort by default. Other languages' articles are left alone: the metadata language
 * is the server's, and a wrong guess would misfile titles.
 */
export function sortTitleOf(title: string): string {
  const folded = fold(title)
  const stripped = folded.replace(/^(the|a|an)\s+(?=\S)/, '')
  return stripped || folded
}
