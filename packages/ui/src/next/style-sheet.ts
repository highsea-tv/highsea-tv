// SPDX-License-Identifier: AGPL-3.0-only
// react-native-web's one style sheet, for a Next.js host to write into its server's HTML
// (apps/server's style-registry.tsx). Its `getSheet` is react-native-web's own, outside React
// Native's types (https://necolas.github.io/react-native-web/docs/rendering/).
import { StyleSheet } from 'react-native'

export type StyleSheetText = { id: string; textContent: string }

/** The sheet's element id and every rule written so far. */
export function styleSheetText(): StyleSheetText {
  return (StyleSheet as unknown as { getSheet: () => StyleSheetText }).getSheet()
}
