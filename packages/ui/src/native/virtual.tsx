// SPDX-License-Identifier: AGPL-3.0-only
// The library's one virtualizer (the owner's decision of 2026-11-06, one-client-platform-d.md ›
// D3): a long list draws only what's near the screen, on every target, through TanStack Virtual's
// core (@tanstack/virtual-core, https://tanstack.com/virtual/latest/docs/api/virtualizer), which
// needs no DOM. A clients' library of thousands of films, the admin's tables and the phone's rows
// all use it, in place of React Native's FlatList.
// - A scroller is a source (`useScrollSource`): it reports its offset, its size and its content's
//   from ScrollView's own events (onScroll, onLayout, onContentSizeChange) and scrolls by
//   `scrollTo` (https://reactnative.dev/docs/scrollview#methods). The core takes these through its
//   documented seams, `observeElementRect`, `observeElementOffset` and `scrollToFn`, over a small
//   object shaped as the scroll element it reads (scrollTop, scrollHeight, clientHeight and their
//   sideways twins, and `window` for its animation frames). The same code runs on the phone, the
//   TV and the web, where react-native-web reports the same events.
// - `Virtual` draws its items in the flow between two spacers, so a table keeps CSS's table
//   layout and a list its roles; its start in the scroller is the core's `scrollMargin`, measured
//   against the scroller's content (`measureLayout` with the ScrollView's inner view,
//   https://reactnative.dev/docs/the-new-architecture/layout-measurements), so a table under a
//   page's header virtualizes in the page's own scroller.
// - Items are measured as they lay out (`resizeItem`), from an estimate until then.
// - The hook follows @tanstack/react-virtual's own (useVirtualizerBase): one instance, its options
//   set each render, `_didMount` once and `_willUpdate` after each render.
// - Until the scroller has laid out (and on the server) the viewport is taken as INITIAL_VIEWPORT,
//   the same on both sides so hydration matches, so the first screen's items are in the server's
//   HTML.
import { type Rect, type VirtualItem, Virtualizer } from '@tanstack/virtual-core'
import {
  type ComponentRef,
  createContext,
  Fragment,
  type ReactNode,
  type Ref,
  type RefCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  View,
} from 'react-native'

type Handle = ComponentRef<typeof ScrollView>
type ViewNode = ComponentRef<typeof View>
type Size = { width: number; height: number }

/** The viewport taken until a scroller has laid out: a laptop's, on the server and at first. */
export const INITIAL_VIEWPORT: Size = { width: 1280, height: 800 }
/** How long after the last scroll event the scroller counts as still. */
const STILL_AFTER = 150

/** A scroller as the virtualizer sees it. */
export type ScrollSource = {
  readonly horizontal: boolean
  offset: number
  viewport: Size | null
  content: Size
  node: Handle | null
  /** Called whenever any of them changes. */
  listen(change: () => void): () => void
  emit(): void
}

function createSource(horizontal: boolean): ScrollSource {
  const listeners = new Set<() => void>()
  return {
    horizontal,
    offset: 0,
    viewport: null,
    content: { width: 0, height: 0 },
    node: null,
    listen(change) {
      listeners.add(change)
      return () => listeners.delete(change)
    },
    emit() {
      for (const change of listeners) change()
    },
  }
}

const SourceContext = createContext<ScrollSource | null>(null)

/** Hands a scroller's source to the virtual lists inside it. */
export const ScrollSourceProvider = SourceContext.Provider

/** The nearest scroller's source, or null outside one. */
export function useScrollSourceOrNull(): ScrollSource | null {
  return useContext(SourceContext)
}

/** What a ScrollView takes to report to its source, with the caller's own handlers kept. */
export type ScrollSourceProps = {
  ref: RefCallback<Handle>
  scrollEventThrottle: number
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
  onLayout: (e: LayoutChangeEvent) => void
  onContentSizeChange: (width: number, height: number) => void
}

type Own = {
  ref?: Ref<Handle>
  scrollEventThrottle?: number
  onScroll?: ((e: NativeSyntheticEvent<NativeScrollEvent>) => void) | null
  onLayout?: ((e: LayoutChangeEvent) => void) | null
  onContentSizeChange?: ((width: number, height: number) => void) | null
}

/**
 * A scroller's source, and the props that feed it: spread them on a ScrollView (after the
 * caller's own, which they call too) and wrap its content in `ScrollSourceProvider`. The
 * library's ScrollView does both, so any of its scrollers can hold a `Virtual`.
 */
export function useScrollSource(
  horizontal = false,
  own: Own = {},
): { source: ScrollSource; props: ScrollSourceProps } {
  const [source] = useState(() => createSource(horizontal))
  const props: ScrollSourceProps = {
    ref: (node) => {
      source.node = node
      const { ref } = own
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    scrollEventThrottle: own.scrollEventThrottle ?? 16,
    onScroll: (e) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
      source.offset = horizontal ? contentOffset.x : contentOffset.y
      // happy-dom and a scroller not laid out yet report none
      if (contentSize?.height)
        source.content = { width: contentSize.width, height: contentSize.height }
      if (layoutMeasurement?.height)
        source.viewport = { width: layoutMeasurement.width, height: layoutMeasurement.height }
      source.emit()
      own.onScroll?.(e)
    },
    onLayout: (e) => {
      const { width, height } = e.nativeEvent.layout
      source.viewport = { width, height }
      source.emit()
      own.onLayout?.(e)
    },
    onContentSizeChange: (width, height) => {
      source.content = { width, height }
      source.emit()
      own.onContentSizeChange?.(width, height)
    },
  }
  return { source, props }
}

/** The scroll element the core reads, over a source. */
function elementOf(source: ScrollSource) {
  const viewport = () => source.viewport ?? INITIAL_VIEWPORT
  return {
    get scrollTop() {
      return source.horizontal ? 0 : source.offset
    },
    get scrollLeft() {
      return source.horizontal ? source.offset : 0
    },
    get scrollHeight() {
      return Math.max(source.content.height, viewport().height)
    },
    get scrollWidth() {
      return Math.max(source.content.width, viewport().width)
    },
    get clientHeight() {
      return viewport().height
    },
    get clientWidth() {
      return viewport().width
    },
    // the core's animation frames (React Native and the browser both have them)
    window: globalThis,
  }
}

// the core is typed for the DOM's elements; it reads only what elementOf gives it
type Core = Virtualizer<globalThis.Element, globalThis.Element>

export type VirtualOptions = {
  count: number
  /** Each item's size along the scroller before it's measured. */
  estimateSize: (index: number) => number
  getKey?: (index: number) => string | number
  /** Space between items, which the spacers keep. */
  gap?: number
  /** Items drawn past each end of the screen: the TV's focus moves onto them. */
  overscan?: number
}

export type VirtualList = {
  items: VirtualItem[]
  /** Room before the first drawn item, and after the last. */
  before: number
  after: number
  /** Report an item's laid-out size. */
  measure: (index: number) => (e: LayoutChangeEvent) => void
  /** Where the list starts in its scroller, measured from this element. */
  anchor: Ref<ViewNode>
  /** Where an item starts in the scroller's content, from its measured or estimated size. */
  offsetOf: (index: number) => number | undefined
  scrollToIndex: (index: number, options?: { animated?: boolean; offset?: number }) => void
}

/** A virtual list in the nearest scroll source. */
export function useVirtual({
  count,
  estimateSize,
  getKey,
  gap = 0,
  overscan = 4,
}: VirtualOptions): VirtualList {
  const source = useContext(SourceContext)
  if (!source) throw new Error('useVirtual needs a scroller: a ScrollView from @highsea-tv/ui')
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const anchor = useRef<ViewNode>(null)
  const [margin, setMargin] = useState(0)
  const [element] = useState(() => elementOf(source))
  const horizontal = source.horizontal
  const options = {
    count,
    estimateSize,
    getItemKey: getKey ?? ((i: number) => i),
    gap,
    overscan,
    horizontal,
    scrollMargin: margin,
    initialRect: source.viewport ?? INITIAL_VIEWPORT,
    getScrollElement: () => element as unknown as globalThis.Element,
    onChange: () => rerender(),
    observeElementRect: (_: Core, change: (rect: Rect) => void) => {
      const report = () => change(source.viewport ?? INITIAL_VIEWPORT)
      report()
      return source.listen(report)
    },
    observeElementOffset: (_: Core, change: (offset: number, scrolling: boolean) => void) => {
      let last = source.offset
      let still: ReturnType<typeof setTimeout> | undefined
      change(last, false)
      const off = source.listen(() => {
        if (source.offset === last) return
        last = source.offset
        change(last, true)
        clearTimeout(still)
        still = setTimeout(() => change(source.offset, false), STILL_AFTER)
      })
      return () => {
        clearTimeout(still)
        off()
      }
    },
    scrollToFn: (
      offset: number,
      {
        adjustments = 0,
        behavior,
      }: { adjustments?: number; behavior?: 'auto' | 'smooth' | 'instant' },
    ) => {
      const to = offset + adjustments
      source.node?.scrollTo(
        horizontal
          ? { x: to, animated: behavior === 'smooth' }
          : { y: to, animated: behavior === 'smooth' },
      )
    },
  }
  const [core] = useState<Core>(() => new Virtualizer(options))
  core.setOptions(options)
  useLayoutEffect(() => core._didMount(), [core])
  // after every render, as react-virtual does: the core checks its scroll element is the same
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each render on purpose
  useLayoutEffect(() => core._willUpdate())
  // the list's start in the scroller's content, again whenever the content changes size (a
  // header above it grew)
  useEffect(() => {
    const measureStart = () => {
      const node = anchor.current as unknown as {
        measureLayout?: (
          to: unknown,
          done: (x: number, y: number) => void,
          fail?: () => void,
        ) => void
      } | null
      const inner = (
        source.node as unknown as { getInnerViewNode?: () => unknown } | null
      )?.getInnerViewNode?.()
      if (!node?.measureLayout || !inner) return
      node.measureLayout(
        inner,
        (x, y) =>
          setMargin((was) =>
            Math.abs((horizontal ? x : y) - was) < 0.5 ? was : horizontal ? x : y,
          ),
        () => {},
      )
    }
    measureStart()
    let size = horizontal ? source.content.width : source.content.height
    return source.listen(() => {
      const now = horizontal ? source.content.width : source.content.height
      if (now === size) return
      size = now
      measureStart()
    })
  }, [source, horizontal])
  const items = core.getVirtualItems()
  const total = core.getTotalSize()
  const first = items[0]
  const last = items[items.length - 1]
  return {
    items,
    before: first ? Math.max(0, first.start - margin) : 0,
    // the core's items start after the margin; its total doesn't count it
    after: last ? Math.max(0, total - (last.end - margin)) : 0,
    measure: (index) => (e) => {
      const { width, height } = e.nativeEvent.layout
      const size = horizontal ? width : height
      if (size > 0) core.resizeItem(index, size)
    },
    anchor,
    offsetOf: (index) => core.getOffsetForIndex(index, 'start')?.[0],
    scrollToIndex: (index, { animated = false, offset = 0 } = {}) => {
      const at = core.getOffsetForIndex(index, 'start')
      if (!at) return
      core.scrollToOffset(Math.max(0, at[0] - offset), {
        behavior: animated ? 'smooth' : 'auto',
      })
    },
  }
}

export type VirtualProps = VirtualOptions & {
  /** An item, with the handler that measures it: put it on the item's outermost view. */
  render: (index: number, onLayout: (e: LayoutChangeEvent) => void) => ReactNode
  /** The room before and after the drawn items (a table draws it as a row). */
  spacer?: (size: number, ref?: Ref<ViewNode>) => ReactNode
  ref?: Ref<VirtualList>
}

const defaultSpacer = (horizontal: boolean) => (size: number, ref?: Ref<ViewNode>) => (
  <View
    ref={ref}
    aria-hidden
    pointerEvents="none"
    style={horizontal ? { width: size, alignSelf: 'stretch' } : { height: size }}
  />
)

/**
 * A long list in its scroller that draws only the items near the screen, each keyed by its key so
 * it keeps its state as the window moves, with the gap drawn between them.
 */
export function Virtual({ render, spacer, ref, ...options }: VirtualProps) {
  const list = useVirtual(options)
  const horizontal = useContext(SourceContext)?.horizontal ?? false
  const draw = spacer ?? defaultSpacer(horizontal)
  const gap = options.gap ?? 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: the handle is this render's list
  useImperativeHandle(ref, () => list)
  return (
    <>
      {draw(list.before, list.anchor)}
      {list.items.map((item, i) => (
        <Fragment key={item.key}>
          {i > 0 && gap > 0 ? draw(gap) : null}
          {render(item.index, list.measure(item.index))}
        </Fragment>
      ))}
      {draw(list.after)}
    </>
  )
}
