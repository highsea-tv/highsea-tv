// SPDX-License-Identifier: AGPL-3.0-only
// A part as big as its content (a badge, a button, a chip, a link), wherever it stands: it neither
// stretches across a column nor stands at the top of a row that centres its items.
// - In a browser, its width and height are `fit-content`: a flex item stretches only when its
//   cross size is `auto` (CSS Flexbox 1 § 8.3, https://www.w3.org/TR/css-flexbox-1/#align-items-property;
//   CSS Box Alignment 3's `stretch`, which falls back to `flex-start` otherwise), so a column leaves
//   it its own width, and its `align-self` stays `auto`, so it follows its row's `alignItems`
//   (https://reactnative.dev/docs/layout-props#alignself: `auto` takes the parent's). It was
//   `alignSelf: 'flex-start'`, which a column needs and a row's `alignItems: 'center'` can't
//   override, so every badge, button and link in a centred row sat at the row's top (HT-4).
// - React Native's sizes are numbers, percentages or `auto` (DimensionValue,
//   https://reactnative.dev/docs/layout-props#width), with no `fit-content`, so on the phone and
//   the TV it keeps `alignSelf: 'flex-start'`.
import { Platform, type ViewStyle } from 'react-native'

export const OWN_SIZE: ViewStyle =
  Platform.OS === 'web'
    ? ({ width: 'fit-content', height: 'fit-content' } as unknown as ViewStyle)
    : { alignSelf: 'flex-start' }
