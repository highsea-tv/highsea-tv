// SPDX-License-Identifier: AGPL-3.0-only
// The TV's library sizes that the tokens have no step for yet, in the TV's unit (1u = 1cqw), as the
// prototypes draw them (design/prototypes/src/tv/library.tsx, collections.tsx, collection.tsx). One
// place for them, until docs/design-language/platforms/ names them.
export const TV_LIBRARY = {
  /** A library page's gaps: under the head, between the choices and the grid (`gap-[1.6cqw]`). */
  pageGap: 1.6,
  /** Between a page's title and its choices (`gap-[2cqw]`). */
  headGap: 2,
  /** A page's title, half the hero's (`text-[2.6cqw]`). */
  pageTitle: 2.6,
  /** Inside a Collections section, between its heading and its grid (`gap-[1cqw]`). */
  sectionGap: 1,
  /** A collection's page: between the words and the films (`gap-[1.6cqw]`). */
  collectionGap: 1.6,
  /** A collection's page: between its words (`gap-[1cqw]`). */
  collectionWordsGap: 1,
  /** A collection's name (`text-[3.6cqw]`). */
  collectionTitle: 3.6,
  /** How wide a collection's words go (`max-w-[60cqw]`). */
  collectionWords: 60,
  /** How wide its overview goes (`max-w-[44cqw]`). */
  overview: 44,
  /** An empty library or no match: its width, gap and the room above (TvEmptyLibrary). */
  emptyWidth: 46,
  emptyGap: 0.8,
  emptyTop: 2,
  /** Show everything's room above it (`mt-[0.6cqw]`). */
  emptyAction: 0.6,
  /**
   * A collection's page while it loads: the kind's and the count's lines (`h-[1.05cqw]`, 10 and 16
   * wide, `my-[0.15cqw]`), the name's (`h-[3.4cqw] w-[32cqw]`, `my-[0.2cqw]`, its corner 0.5), and
   * the overview's two (`h-[1.1cqw]`, 0.6 apart, `py-[0.2cqw]`).
   */
  skeleton: {
    meta: 1.05,
    metaMargin: 0.15,
    kind: 10,
    here: 16,
    title: 3.4,
    titleMargin: 0.2,
    titleWidth: 32,
    titleRadius: 0.5,
    line: 1.1,
    lineGap: 0.6,
  },
} as const
