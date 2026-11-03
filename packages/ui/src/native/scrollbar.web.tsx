// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./scrollbar.tsx: the web's PageScrollbar (src/web) for a ScrollView, drawn over
// the scroller rather than beside it. react-native-web draws a ScrollView as a scrolling element
// with the browser's own bar, which takes a column of its own, or none when the indicator is off
// (`scrollbar-width: none`, react-native-web's ScrollViewBase.js). So ScrollView turns it off and
// this thin handle draws over the scroller's end edge (its right, or its left right to left), in the same measures and colours as
// PageScrollbar (src/shared/scrollbar.ts). Scrolling stays the browser's: the wheel, keys and the
// trackpad are untouched, and the bar is only a pointer handle, hidden from assistive tech as the
// browser's is. It's ScrollView's sibling, positioned over it: an absolutely positioned child of
// the parent takes no part in its flex layout, so the page's gaps don't move.
import { type ComponentRef, useEffect, useRef, useState } from 'react'
import { PanResponder, View, type ViewStyle } from 'react-native'
import { SCROLLBAR } from '../shared/scrollbar.ts'
import type {
  OWN_SCROLLBAR as nativeOwn,
  Scrollbar as nativeScrollbar,
  ScrollbarProps,
} from './scrollbar.tsx'
import { tokens, useTheme } from './theme.tsx'
import { alpha } from './tv/controls.tsx'

export type { ScrollbarProps }

export const OWN_SCROLLBAR: typeof nativeOwn = true

/** The DOM's parts of a scrolling element that the bar reads; React Native's types have no DOM. */
type Scroller = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  offsetTop: number
  offsetLeft: number
  offsetWidth: number
  firstElementChild: unknown
  addEventListener(type: string, listener: () => void, options?: { passive: boolean }): void
  removeEventListener(type: string, listener: () => void): void
  getBoundingClientRect(): { top: number }
}
type Styles = (node: unknown) => { direction?: string }
type Observer = { observe(target: unknown): void; disconnect(): void }
type Strip = { getBoundingClientRect(): { top: number } }

const { inset, handle, handleActive, reach, minThumb } = SCROLLBAR

/** The scrolling element of react-native-web's ScrollView (its `getScrollableNode`). */
function scrollerOf(target: unknown): Scroller | null {
  const view = target as { getScrollableNode?: () => unknown } | null
  return (view?.getScrollableNode?.() as Scroller | undefined) ?? null
}

type Metrics = {
  top: number
  left: number
  height: number
  thumbTop: number
  thumb: number
  rtl: boolean
}

const WIDTH = inset + handle + reach

/** Right to left puts the bar at the scroller's left, as the browser's own bar and PageScrollbar's `end-0` do. */
function isRtl(node: Scroller): boolean {
  const styles = (globalThis as { getComputedStyle?: Styles }).getComputedStyle
  return styles?.(node).direction === 'rtl'
}

function measure(node: Scroller): Metrics | null {
  const view = node.clientHeight
  const total = node.scrollHeight
  if (!node.offsetWidth || total <= view + 1) return null
  const track = view - inset * 2
  const thumb = Math.max(minThumb, (track * view) / total)
  const rtl = isRtl(node)
  return {
    rtl,
    top: node.offsetTop + inset,
    left: rtl ? node.offsetLeft : node.offsetLeft + node.offsetWidth - WIDTH,
    height: track,
    thumbTop: (node.scrollTop / (total - view)) * (track - thumb),
    thumb,
  }
}

export const Scrollbar: typeof nativeScrollbar = ({ target, remeasure }) => {
  const theme = useTheme()
  const [m, setM] = useState<Metrics | null>(null)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const strip = useRef<ComponentRef<typeof View>>(null)
  const latest = useRef<Metrics | null>(null)
  latest.current = m

  useEffect(() => {
    const node = scrollerOf(target.current)
    if (!node) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setM(measure(node)))
    }
    update()
    remeasure.current = update
    node.addEventListener('scroll', update, { passive: true })
    globalThis.addEventListener?.('resize', update)
    // the content grows and shrinks as rows load; the scroller itself as the window does
    const Resize = (globalThis as { ResizeObserver?: new (cb: () => void) => Observer })
      .ResizeObserver
    const observer = Resize ? new Resize(update) : undefined
    observer?.observe(node)
    if (node.firstElementChild) observer?.observe(node.firstElementChild)
    return () => {
      cancelAnimationFrame(frame)
      node.removeEventListener('scroll', update)
      globalThis.removeEventListener?.('resize', update)
      observer?.disconnect()
      remeasure.current = null
    }
  }, [target, remeasure])

  const drag = useRef<{ scroll: number } | null>(null)
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const node = scrollerOf(target.current)
        const now = latest.current
        const el = strip.current as unknown as Strip | null
        if (!node || !now || !el) return
        const y = e.nativeEvent.pageY - el.getBoundingClientRect().top
        if (y >= now.thumbTop && y <= now.thumbTop + now.thumb) {
          drag.current = { scroll: node.scrollTop }
          setDragging(true)
        } else {
          // a press on the track pages towards it, as the browser's bar does
          const page = node.clientHeight * SCROLLBAR.page
          node.scrollTop += y < now.thumbTop ? -page : page
        }
      },
      onPanResponderMove: (_e, g) => {
        const node = scrollerOf(target.current)
        const now = latest.current
        if (!drag.current || !node || !now) return
        // pixels of content per pixel of track the handle travels
        const ratio = (node.scrollHeight - node.clientHeight) / (now.height - now.thumb)
        node.scrollTop = drag.current.scroll + g.dy * ratio
      },
      onPanResponderRelease: () => {
        drag.current = null
        setDragging(false)
      },
      onPanResponderTerminate: () => {
        drag.current = null
        setDragging(false)
      },
    }),
  )

  if (!m) return null
  const active = hovered || dragging
  return (
    <View
      ref={strip}
      aria-hidden
      {...pan.panHandlers}
      // a pointer over the strip widens the handle, as PageScrollbar's group hover does
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={[
        {
          position: 'absolute',
          top: m.top,
          left: m.left,
          height: m.height,
          width: WIDTH,
        },
        // react-native-web's style, so a drag never selects the page's text
        { userSelect: 'none' } as ViewStyle,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          top: m.thumbTop,
          ...(m.rtl ? { left: inset } : { right: inset }),
          height: m.thumb,
          width: active ? handleActive : handle,
          borderRadius: tokens.radius.pill,
          backgroundColor: alpha(
            theme.colors['text-3'],
            active ? SCROLLBAR.alphaActive : SCROLLBAR.alpha,
          ),
        }}
      />
    </View>
  )
}
