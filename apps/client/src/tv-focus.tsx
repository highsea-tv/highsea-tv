// SPDX-License-Identifier: AGPL-3.0-only
// Where focus lands as a TV screen comes on view, the shell's for every screen it shows (the
// navigator's `screenLayout`, "layout for all screens under this navigator"): the first time, on the
// stop the screen prefers (its `preferred` or `hasTVPreferredFocus`: Home's Play, a film's Resume,
// the first collection); coming back to it, on the stop that last had focus in it, the card the
// person opened. Until the person presses a key, focus is kept there.
//
// react-native-tvos asks for a preferred stop once, as the stop appears or its prop turns on
// (`hasTVPreferredFocus` and `requestTVFocus()` both reach RCTViewComponentView's `focusSelf`): it
// makes the stop the root view's preferred focus and asks the root for a focus update. tvOS then
// searches the root's preferred environments "until an eligible, focusable item is found"
// (UIFocusEnvironment's `preferredFocusEnvironments`,
// https://developer.apple.com/documentation/uikit/uifocusenvironment/preferredfocusenvironments),
// and the root's own default is the first stop in its tree: the head, drawn before the page, and
// its first stop, Search. So a stop that isn't eligible at that one moment (Home's hero, arriving
// with its data as the screen fades in) loses focus to Search, and a screen left under the next
// one stays mounted, so coming back to it nothing asks at all, and focus falls to Search again.
// So each screen keeps its own memory (the library's FocusMemory, which every stop tells) and asks
// again by `requestTVFocus()`, a few times while focus isn't on one of its stops. Once the person
// presses a key, what they do wins: picking a sort or a view keeps focus where they are (the
// owner's rule), as does going up to the head.
import {
  type FocusMemory,
  FocusMemoryContext,
  focusOn,
  useRemote,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { useIsFocused } from 'expo-router'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'

/**
 * After a screen comes on view, or its preferred stop appears, or focus leaves its stops before a
 * key: when it asks again for its stop, in ms. tvOS documents no moment its own focus update ends
 * (a screen's fade, the head's guide), so the asks go on for a second; a judgement call.
 */
const ASKS_MS = [0, 100, 250, 500, 1000]

/** The remote's keys that are the person's own doing; Menu brings a screen back, so isn't one. */
const KEYS = new Set(['up', 'down', 'left', 'right', 'select', 'longSelect', 'playPause'])

/** The shell's wrapper around each TV screen: its focus memory, and where focus lands. */
export function TvFocusScope({ children }: { children: ReactNode }) {
  const onView = useIsFocused()
  const s = useRef({
    /** On view now. */
    here: onView,
    /** The person has pressed a key since the screen came on view. */
    acted: false,
    /** The stop last focused in the screen, and the one it prefers. */
    last: null as ViewHandle | null,
    want: null as ViewHandle | null,
    /** A stop of the screen's has focus now. */
    inside: false,
    timers: [] as ReturnType<typeof setTimeout>[],
  }).current

  const land = useRef((_from = 0) => {})
  land.current = (from = 0) => {
    for (const t of s.timers) clearTimeout(t)
    s.timers = ASKS_MS.slice(from).map((ms) =>
      setTimeout(() => {
        const to = s.last ?? s.want
        if (s.here && !s.acted && !s.inside && to) focusOn(to)
      }, ms),
    )
  }

  const memory = useMemo<FocusMemory>(
    () => ({
      focused: (stop) => {
        s.last = stop
        s.inside = true
      },
      blurred: () => {
        s.inside = false
        // focus left the screen's stops before the person did anything: tvOS moved it. Not at
        // once: a key's event may come just after the move it made, and the key wins
        if (s.here && !s.acted) land.current(1)
      },
      preferred: (stop) => {
        s.want = stop
        if (s.here && !s.acted) land.current()
      },
      gone: (stop) => {
        if (s.last === stop) s.last = null
        if (s.want === stop) s.want = null
      },
    }),
    [s],
  )

  useRemote((e) => {
    if (s.here && KEYS.has(e.eventType)) {
      s.acted = true
      for (const t of s.timers) clearTimeout(t)
    }
  })

  useEffect(() => {
    s.here = onView
    if (!onView) {
      for (const t of s.timers) clearTimeout(t)
      return
    }
    s.acted = false
    land.current()
  }, [onView, s])

  useEffect(
    () => () => {
      for (const t of s.timers) clearTimeout(t)
    },
    [s],
  )

  return <FocusMemoryContext.Provider value={memory}>{children}</FocusMemoryContext.Provider>
}
