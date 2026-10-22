// SPDX-License-Identifier: AGPL-3.0-only
// @highsea/parser: release names into their parts: title, year, edition, quality, revision,
// languages, group, hardcoded subs and ids. Pure: no database, no clock, no I/O.
export { readEdition } from './edition.ts'
export { ISO_639_1, iso6391Of, streamLanguage } from './iso639.ts'
export { languageCode, readLanguages } from './languages.ts'
export { parse, parseLanguages, parseQuality } from './parse.ts'
export { DEFAULT_REVISION, readQuality } from './quality.ts'
export type * from './types.ts'
