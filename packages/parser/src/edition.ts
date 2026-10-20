// SPDX-License-Identifier: AGPL-3.0-only
// Editions: the cut or release of the film a name says it is. The tags are the scene's (2020 x265
// rules 17.2: ALTERNATIVE.CUT, COLORIZED, DC, EXTENDED, REMASTERED, RESTORED, THEATRICAL, UNCENSORED,
// UNCUT, UNRATED, and a version or cut title where none fits) and the editions TRaSH's formats
// recognise (MIT: IMAX, IMAX Enhanced, Criterion, Special Edition, Theatrical Cut, Remaster, Open
// Matte, Masters of Cinema, Vinegar Syndrome). Radarr matches its Edition condition against what it
// parses, case-insensitively (Servarr wiki, Radarr › Settings › Custom Format Conditions), so the
// edition is kept as written, separators made spaces.
import { all, type Hit, SEP, token, words } from './tokens.ts'

const S = SEP
const KIND = [
  'Extended',
  'Ultimate',
  'Special',
  `Collector'?s`,
  'Definitive',
  'Diamond',
  'Platinum',
  'Signature',
  'Deluxe',
  'Limited',
  'Final',
  'Theatrical',
  `Director'?s`,
  `Producer'?s`,
  'International',
  'Assembly',
  'Rogue',
  `Alternat(?:e|ive)`,
  `Super${S}Duper`,
  'Despecialized',
  'Fan',
  'Uncut',
  'Unrated',
  'Remastered',
  'Restored',
  'IMAX',
  'Criterion',
  `Open${S}?Matte`,
  `Black${S}(?:and|&|n)${S}(?:White|Chrome)`,
  'Redux',
  'Anniversary',
].join('|')

const ORDINAL = `(?:\\d{1,3}(?:st|nd|rd|th)${S})?`

const EDITION = token(
  [
    // "Director's Cut", "Final Cut", "25th Anniversary Edition", "Extended Cut".
    `${ORDINAL}(?:${KIND})${S}(?:Cut|Editions?|Version)`,
    `${ORDINAL}Anniversary`,
    `Criterion${S}Collection`,
    // French for Extended ("Version longue") and an abbreviated "Extended Ed.".
    `Version${S}Longue`,
    `Extended${S}Ed\\.?(?=${S}|$)`,
    `Director${S}s${S}Cut`,
    `Masters${S}?of${S}?Cinema`,
    `Vinegar${S}Syndrome`,
    `IMAX(?:${S}Enhanced)?`,
    `(?:4K${S})?Remaster(?:ed)?`,
    'Extended|Uncut|Unrated|Uncensored|Theatrical|Restored|Colori[sz]ed|Despecialized|Redux',
    `Open${S}?Matte`,
    `Fan${S}?Edit`,
    `Alternative${S}Cut`,
    'Criterion',
    'Directors',
    `Special${S}Edition`,
    // French: remastered, restored, uncensored version, and Criterion's short form.
    'Remasteris[ée]e?|Restaur[ée]e?|Crit',
    `Version${S}Non${S}Censur[ée]e`,
  ].join('|'),
)
// Edition phrases strong enough to end a title even before its year ("Blade Runner Final Cut
// 1982"): no film title is likely to carry them in the middle.
const PRE_YEAR = token(
  [
    `${ORDINAL}(?:${KIND})${S}(?:Cut|Editions?|Version)`,
    // After " - ", the P2P way of appending a tag ("Ghostbusters - Extended (2016)"), or right
    // before the year ("Aliens Uncut 1986", "Dawn of the Dead (Uncut) 1978").
    `(?<=\\s-\\s)(?:Extended|Theatrical|Uncut|Unrated|Remastered)`,
    `[([]?(?:Extended|Theatrical|Uncut|Unrated|Remastered)[)\\]]?(?=[ ._]+(?:DC[ ._]+)?[([]?(?:18|19|20)\\d\\d(?![\\p{L}\\p{N}]))`,
    `Criterion${S}Collection`,
    `Version${S}Longue`,
    `Extended${S}Ed\\.?(?=${S}|$)`,
    `Director${S}s${S}Cut`,
    `4K${S}Remaster(?:ed)?`,
    `Open${S}?Matte`,
  ].join('|'),
)
// The scene's abbreviation for Director's Cut, in capitals only.
const DC = token('DC', true)
// French abbreviations in capitals: VL (version longue) and RM (remastered).
const FR_CAPS = token('VL|RM', true)

/** Every edition tag from `from` onwards, in order. */
export function editionHits(s: string, from = 0): Hit[] {
  return [...all(EDITION, s, from), ...all(DC, s, from), ...all(FR_CAPS, s, from)].sort(
    (a, b) => a.index - b.index,
  )
}

/** The edition from `from` onwards, its tags joined by spaces ("Extended Directors Cut"). */
export function readEdition(s: string, from = 0): string | null {
  const hits = editionHits(s, from)
  if (hits.length === 0) return null
  return hits.map((h) => words(h.text.replace(/-/g, ' '))).join(' ')
}

export { DC as DC_MARKER, EDITION as EDITION_MARKER, PRE_YEAR as PRE_YEAR_EDITION }
