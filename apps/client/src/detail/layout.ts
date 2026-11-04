// SPDX-License-Identifier: AGPL-3.0-only
// The film's and the person's pages' own measures, which their pages and skeletons share so a page
// lands where its skeleton stood. The TV's are in screen units (tv.md#units), the phone's in points.
import { BACKDROP_HEIGHT, tokens } from '@highsea-tv/ui'
import { TV_HEAD_HEIGHT, TV_ROW_GAP } from '@highsea-tv/ui/tv'

const { space } = tokens

/**
 * A film's page on the TV (tv/detail.tsx): the words' block is the first screen less the next row's
 * title, which peeks under it (h-[40.5cqw]), under the head and a row's gap (the prototype's TvHead
 * and its grid's gap-[1.6cqw]); the rest is its skeleton's lines (DetailSkeleton).
 */
export const FILM_TV = {
  top: TV_HEAD_HEIGHT + TV_ROW_GAP,
  words: BACKDROP_HEIGHT * 0.72,
  title: 7,
  titleWidth: 26,
  line: 1.05,
  metaWidth: 22,
  creditsGap: 0.5,
  castWidth: 24,
  directorWidth: 16,
  picks: 0.95,
  picksWidth: 18,
}

/**
 * A person's page on the TV (tv/person.tsx): the portrait beside the words, 3u apart, the name at
 * 3.6u (text-[3.6cqw], tv.md's person page), the words no wider than 48u; and its skeleton's lines.
 */
export const PERSON_TV = {
  portrait: 13,
  portraitGap: 3,
  name: 3.6,
  wordsWidth: 44,
  wordsMax: 48,
  nameLine: 3.4,
  nameWidth: 28,
  line: 1.05,
  lineWidth: 16,
}

/**
 * A person's page on the phone (mobile/person.tsx): 56 under the status bar (pt-14), the portrait
 * 20 above the name (mb-3 and the header's gap-2), the sections 28 apart (gap-7), and the
 * biography in text-2 at 15 on 1.45.
 */
export const PHONE_PERSON = {
  top: space['12'] + space['2'],
  portrait: space['16'] * 2,
  portraitGap: space['5'],
  sections: space['6'] + space['1'],
  bio: { size: 15, leading: 1.45 },
}

/**
 * A person's page's art behind them by touch and with a pointer: their best-rated film's
 * backdrop, blurred (blur-[40px]), at 45%, and drawn larger than its frame so the blur's soft edge
 * falls outside it (mobile/person.tsx's scale-125, web/person.tsx's scale-110).
 */
export const PERSON_ART = {
  opacity: 0.45,
  blur: space['10'],
  scale: { touch: 1.25, pointer: 1.1 },
}
