// SPDX-License-Identifier: AGPL-3.0-only
// A `title` the web keeps: the browser's tooltip with a part's full words (the admin's Figure, cut
// short to one line). react-native-web writes only the props it documents onto the element, and
// `title` isn't one of View's or Text's (https://necolas.github.io/react-native-web/docs/view/,
// https://necolas.github.io/react-native-web/docs/text/), so it's dropped. Its View and Text hand
// their ref to the element they render, so the title is set on that element there; iOS, Android
// and the TV have no hover tooltip, so nothing is set.
import { Platform } from 'react-native'

/** A ref that writes `title` onto the element on the web, or nothing elsewhere or without one. */
export function webTitle(title: string | undefined): ((node: unknown) => void) | undefined {
  if (Platform.OS !== 'web' || !title) return undefined
  return (node) => {
    const element = node as { setAttribute?: (name: string, value: string) => void } | null
    element?.setAttribute?.('title', title)
  }
}
