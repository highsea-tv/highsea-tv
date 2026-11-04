// SPDX-License-Identifier: AGPL-3.0-only
// The TV's focus engine behind Focusable and the TV's parts (one-client-platform.md › A, question
// 5): on tvOS and Android TV, react-native-tvos's own. Focus moves by the platform's engine, a
// stop asks for it with `hasTVPreferredFocus` or `requestTVFocus()`, regions steer it with
// TVFocusGuideView, the remote's presses arrive through useTVEventHandler, and a scroll view
// follows focus by its children's `scrollSnapOffset`
// (https://github.com/react-native-tvos/react-native-tvos#readme). In a browser, ./engine.web.tsx
// gives the same names the spatial focus engine (./spatial), so the parts are written once. The
// parts import this pair as `./engine`, without its extension, so Metro picks the platform's file
// (apps/client/README.md › Platform files).
import type { ComponentProps, ReactNode, Ref } from 'react'
import {
  type PressableProps,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  TVFocusGuideView,
  useTVEventHandler,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import { useMotionReduced } from '../theme.tsx'
import type { ViewHandle } from './focusable.tsx'

/** What a stop asks of the engine. */
export type StopOptions = { preferred?: boolean; disabled?: boolean }

/** What the engine adds to a stop's Pressable: its ref, its props and a style. */
export type Stop = {
  ref: Ref<ViewHandle> | undefined
  props: PressableProps
  style: StyleProp<ViewStyle>
}

/**
 * A focus stop's part of the engine: tvOS's preferred focus as the stop appears, and a disabled
 * stop out of the engine's reach.
 */
export function useStop(
  ref: Ref<ViewHandle> | undefined,
  { preferred, disabled }: StopOptions,
): Stop {
  return { ref, props: { hasTVPreferredFocus: preferred, focusable: !disabled }, style: undefined }
}

/**
 * Moves focus to a mounted stop: react-native-tvos gives every host view `requestTVFocus()` on both
 * TVs (its View.js), which its types don't list.
 */
export function requestFocus(handle: ViewHandle | null | undefined) {
  ;(handle as unknown as { requestTVFocus?: () => void } | null)?.requestTVFocus?.()
}

/**
 * TVFocusGuideView's props, which the parts use: `destinations` (where focus arriving from outside
 * goes), `autoFocus` (coming back lands on the stop last focused in it), the `trapFocus*` four, and
 * `onFocusEnter` and `onFocusLeave`.
 */
export type FocusGuideProps = ComponentProps<typeof TVFocusGuideView>

/** A region that steers focus: react-native-tvos's TVFocusGuideView. */
export function FocusGuide(props: FocusGuideProps) {
  return <TVFocusGuideView {...props} />
}

/** A press or move of the remote, as useTVEventHandler reports it: `up`, `select`, `menu`… */
export type RemotePress = { eventType: string }

/**
 * The remote's presses and moves (model.ts's remoteKey names the ones highsea answers): the
 * Siri Remote's and Android TV's, through useTVEventHandler.
 */
export function useRemote(handler: (event: RemotePress) => void) {
  useTVEventHandler(handler)
}

export type TvScrollProps = {
  horizontal?: boolean
  /** Where the focused stop lands: its centre this share of the way across (or down) the view. */
  keep: number
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
  /**
   * The view scrolled: ScrollView's own event, so a page can hand its scroll to the shell's
   * chrome (https://reactnative.dev/docs/scrollview#onscroll). In a browser the track moves by
   * transform, so it's called with the offset each time the engine moves it.
   */
  onScroll?: ScrollViewProps['onScroll']
  /** How often onScroll fires while scrolling, in ms (https://reactnative.dev/docs/scrollview#scrolleventthrottle). */
  scrollEventThrottle?: number
  children: ReactNode
}

/**
 * A scroller that follows focus (tv.md › Scrolling): a scroll view, so tvOS's focus engine reaches
 * what's past the screen's edge, landing each child at its `scrollSnapOffset`
 * (`snapToAlignment="item"`), which the parts work out from `keep` (model.ts's keptAt).
 */
export function TvScroll({
  horizontal,
  style,
  contentContainerStyle,
  onScroll,
  scrollEventThrottle,
  children,
}: TvScrollProps) {
  const reduced = useMotionReduced()
  return (
    <ScrollView
      horizontal={horizontal}
      snapToAlignment="item"
      scrollAnimationEnabled={!reduced}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      style={style}
      contentContainerStyle={contentContainerStyle}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle}
    >
      {children}
    </ScrollView>
  )
}

/**
 * What marks a TvPage's Kept part for the engine, resting at the top or landing at its own `keep`
 * when it has one: nothing on the TVs, where its offset does.
 */
export function keptProps(_rest: boolean, _keep?: number): ViewProps {
  return {}
}
