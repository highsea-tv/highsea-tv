// SPDX-License-Identifier: AGPL-3.0-only
// A page of highsea's own drawn in place, inert, at a size of its own and scaled to fit: the
// admin's client preview (curation.md › Client preview), which draws a home screen in a frame at
// the app's width so its breakpoints apply as on the device. A frame is a browser's (page-frame.web.tsx);
// the native apps never draw one, so here it's an empty box of the frame's drawn size.
import type { Ref } from 'react'
import { View } from 'react-native'

/** The frame's window, as far as the preview uses it (a DOM `Window`, which React Native's types leave out). */
export type PageFrameHandle = {
  contentWindow: { postMessage(message: unknown, targetOrigin: string): void } | null
}

export type PageFrameProps = {
  src: string
  /** What the frame is read as. */
  title: string
  /** The page's own size, before `scale`. */
  width: number
  height: number
  /** Drawn at this scale from its top left (1 by default). */
  scale?: number
  /** The frame, for posting to its page. */
  ref?: Ref<PageFrameHandle | null>
}

export function PageFrame({ width, height, scale = 1 }: PageFrameProps) {
  return <View style={{ width: width * scale, height: height * scale }} />
}
