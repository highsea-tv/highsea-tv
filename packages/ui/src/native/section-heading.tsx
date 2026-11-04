// SPDX-License-Identifier: AGPL-3.0-only
// A section's title, which a Row, a FilmRow and Search's sections share, so each draws the same
// title at each form factor (the prototypes' row and section headings: web/film-row.tsx,
// web/search.tsx, mobile/home.tsx, mobile/more.tsx, tv/kit.tsx and tv/search.tsx):
// - touch: the phone's section title, semibold at the locked prototype's 17 (`text-[17px]`) on
//   the body step's other measures. The phone's type scale (mobileText) has no 17, so it's a
//   literal named once here (PHONE_SECTION_TITLE), which FactsCard's touch title shares, listed in
//   scripts/one-place-exceptions.json for the owner to give the scale a step or not;
// - a pointer: the web's title (19);
// - the TV: its row title (1.2u).
// A suffix (a row's "from your list") follows in `text-2`, and a count (Search's results in a
// section) in `text-3`, both at the title's size in the regular weight, as the prototypes' spans.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Text, type Variant } from './text.tsx'
import { useTheme } from './theme.tsx'

/** The phone's section title's size, the prototypes' `text-[17px]`, which no type step has. */
export const PHONE_SECTION_TITLE = 17

/** The height a heading keeps beside its action, so a button fits it (the phone's Row). */
const ACTION_HEIGHT = 28

export type SectionHeadingProps = {
  title: string
  /** Words after the title, quieter (`text-2`): a row's "from your list". */
  suffix?: string | null
  /** A number after the title and any suffix, quieter still (`text-3`): a section's results. */
  count?: number | null
  /** At its end, such as See all. */
  action?: ReactNode
  /** Its inset from the screen's edge, as a style's padding (the page's gutter, or the TV's inset). */
  inset?: number
  /**
   * Its level, 1 to 6 (default 2), as `aria-level`: react-native-web maps `accessibilityRole="header"`
   * to the heading role and draws it as that level's element, and as an <h1> without one (https://reactnative.dev/docs/accessibility#aria-level).
   */
  level?: 1 | 2 | 3 | 4 | 5 | 6
}

const VARIANT: Record<'pointer' | 'touch' | 'tv', Variant> = {
  touch: 'body',
  pointer: 'title',
  tv: 'rowTitle',
}

export function SectionHeading({
  title,
  suffix,
  count,
  action,
  inset = 0,
  level = 2,
}: SectionHeadingProps) {
  const input = useTheme().formFactor.input
  const variant = VARIANT[input]
  const size = input === 'touch' ? PHONE_SECTION_TITLE : undefined
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: inset,
        minHeight: action && input !== 'tv' ? ACTION_HEIGHT : undefined,
      }}
    >
      <Text
        variant={variant}
        size={size}
        weight={600}
        accessibilityRole="header"
        aria-level={level}
        style={{ flex: 1 }}
      >
        {title}
        {suffix ? (
          <Text variant={variant} size={size} weight={400} color="text-2">
            {` ${suffix}`}
          </Text>
        ) : null}
        {count !== undefined && count !== null ? (
          <Text variant={variant} size={size} weight={400} color="text-3">
            {` ${count}`}
          </Text>
        ) : null}
      </Text>
      {action}
    </View>
  )
}
