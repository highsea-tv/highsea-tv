// SPDX-License-Identifier: AGPL-3.0-only
// Music's sizes that the tokens have no step for yet, as the prototypes draw them
// (design/prototypes/src/{web,mobile,tv}/music.tsx, album.tsx, artist.tsx, playlist.tsx and
// home.tsx, removed in B3). The phone's are in points; the TV's in its unit (1u = 1cqw). One place
// for them, until docs/design-language/platforms/ names them.

/** The phone's and the pointer's. */
export const MUSIC = {
  /** A song's cover's corner (`rounded-[6px]`). */
  coverRadius: 6,
  /** The phone's artist under an album's title (`text-[17px]`, mobile/album.tsx). */
  phoneAlbumArtist: 17,
  /** The phone's meta lines under a title, and an album's release lines (`text-[13px]`). */
  phoneMeta: 13,
  /** The phone's artist name (`text-[28px]`, mobile/artist.tsx). */
  phoneArtistName: 28,
} as const

/** The TV's, in its unit. */
export const TV_MUSIC = {
  /** Between a page's title and its choices, and its gaps (tv/music.tsx). */
  headGap: 2,
  pageGap: 1.6,
  /** A tile's name under it (`mt-[1cqw]`). */
  tileGap: 1,
  /** An album's and a playlist's left column (`w-[24cqw]`), and the cover in it (`18cqw`). */
  column: 24,
  cover: 18,
  /** An album's title (`text-[2.4cqw]`). */
  title: 2.4,
  /** Between the left column and the songs (`gap-[4cqw]`). */
  columnsGap: 4,
  /** The left column's gap (`gap-[0.9cqw]`), and the room under its cover (`mb-[0.6cqw]`). */
  columnGap: 0.9,
  coverBelow: 0.6,
  /** Play and Shuffle under the words: their gap and the room above (`gap-[0.8cqw] pt-[0.6cqw]`). */
  actionsGap: 0.8,
  actionsAbove: 0.6,
  /** Score from's line: its icon (`size-[1.1cqw]`) and the gap after it (`gap-[0.5cqw]`). */
  filmIcon: 1.1,
  filmGap: 0.5,
  /** A quiet link in the column (the artist, Score from): its padding, kept off the edge, and corner. */
  quiet: { x: 0.6, y: 0.2, radius: 0.4 },
  /** The songs' frame, pulled under the column by its own inset (`-ml-[1cqw] pl-[1cqw] pt-[1cqw]`). */
  songsInset: 1,
  /** Between the songs (`gap-[0.2cqw]`). */
  songsGap: 0.2,
  /**
   * A song's row: its number's column (`2.6cqw`, as tall as its line) or its cover (`3.2cqw`), its gap and padding
   * (`gap-[1cqw] px-[1cqw]`, `py-[0.8cqw]` numbered, `py-[0.6cqw]` with the cover), its corner
   * (`rounded-[0.5cqw]`) and the cover's (`rounded-[0.4cqw]`).
   */
  row: { number: 2.6, cover: 3.2, gap: 1, x: 1, yNumbered: 0.8, y: 0.6, radius: 0.5 },
  coverRadius: 0.4,
  /** An artist's head: its gap (`gap-[3cqw]`) and the words' width (`max-w-[48cqw]`). */
  artistGap: 3,
  artistWords: 48,
  /** An artist's name (`text-[3.4cqw]`). */
  artistName: 3.4,
  /** The art behind a page, a little larger than the screen so its blurred edge falls outside. */
  artScale: 1.1,
  /** Home's music tiles: an album's (`w-[12cqw]`) and an artist's (`w-[10cqw]`). */
  homeAlbum: 12,
  homeArtist: 10,
} as const

/**
 * The black under the scrims over art and the mosaic's shadow: the prototypes' `bg-black/50`,
 * `bg-black/60` and `rgba(0,0,0,0.35)`, which no theme's colours have, since they darken art
 * whatever the theme.
 */
export const BLACK = '#000000'
