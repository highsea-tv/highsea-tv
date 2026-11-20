// SPDX-License-Identifier: AGPL-3.0-only
// A screen under the one on view keeps its scroll place in a browser (HT-116). React Navigation's
// native stack on the web keeps the screens below the top one mounted but hides them with
// `display: none` (@react-navigation/native-stack's web view), and a box that's not drawn has no
// scroll position: coming back, its scrollers are at the top (CSSOM View: an element without a
// layout box scrolls nowhere, https://drafts.csswg.org/cssom-view/#dom-element-scrolltop). So each
// scroller's place is noted as it scrolls, while it's drawn, and set again once the screen is back
// on view and drawn.
import { useEffect, useRef } from 'react'

/** What react-native-web's View hands its ref: the element it draws. */
type Drawn = HTMLElement

import type { useKeepScroll as native } from './keep-scroll.tsx'

export type { ScreenNavigation } from './keep-scroll.tsx'

/** How many frames a screen back on view is waited for to be drawn: about half a second. */
const RESTORE_FRAMES = 30

export const useKeepScroll: typeof native = (navigation) => {
  const ref = useRef<Drawn | null>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const places = new Map<Element, { top: number; left: number }>()
    let shown = true
    const note = (e: Event) => {
      const el = e.target
      // hiding the screen scrolls its scrollers to the top before its blur is heard: a scroller
      // that isn't drawn (no boxes) has nothing to note
      if (!shown || !(el instanceof Element) || el.getClientRects().length === 0) return
      places.set(el, { top: el.scrollTop, left: el.scrollLeft })
    }
    root.addEventListener('scroll', note, { capture: true, passive: true })
    const blur = navigation.addListener('blur', () => {
      shown = false
    })
    let frame = 0
    const focus = navigation.addListener('focus', () => {
      // once the screen is drawn again and its scrollers are long enough to reach their places,
      // which can be a few frames after its focus (its transition, a list laying itself out)
      let tries = RESTORE_FRAMES
      const restore = () => {
        let waiting = false
        for (const [el, place] of places) {
          if (!el.isConnected) {
            places.delete(el)
            continue
          }
          const reach = el.scrollHeight - el.clientHeight
          if (el.getClientRects().length === 0 || reach < place.top) waiting = true
          // set, not scrollTo(): react-native-web's ScrollView gives its node a scrollTo of its own
          if (el.getClientRects().length > 0) {
            el.scrollTop = Math.min(place.top, reach)
            el.scrollLeft = place.left
          }
        }
        if (waiting && tries-- > 0) frame = requestAnimationFrame(restore)
        else shown = true
      }
      frame = requestAnimationFrame(restore)
    })
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('scroll', note, { capture: true })
      blur()
      focus()
    }
  }, [navigation])
  return ref
}
