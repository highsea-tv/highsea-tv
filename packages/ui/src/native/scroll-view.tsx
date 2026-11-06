// SPDX-License-Identifier: AGPL-3.0-only
// The library's ScrollView: React Native's, with the web's scrollbar drawn over it (./scrollbar,
// a platform pair) so a scroller on the web looks as the web's pages do, with no column of its own.
// The phone and the TV keep the platform's own indicator. It forwards its ref to React Native's
// ScrollView. Each is a scroll source (./virtual.tsx), so a `Virtual` list inside it draws only
// the items near the screen.
import { type ComponentRef, type Ref, useRef } from 'react'
import { ScrollView as RNScrollView, type ScrollViewProps as RNScrollViewProps } from 'react-native'
import { OWN_SCROLLBAR, Scrollbar } from './scrollbar'
import { ScrollSourceProvider, useScrollSource } from './virtual.tsx'

type Handle = ComponentRef<typeof RNScrollView>

export type ScrollViewProps = RNScrollViewProps & { ref?: Ref<Handle> }

export function ScrollView({
  ref,
  showsVerticalScrollIndicator,
  onLayout,
  onScroll,
  onContentSizeChange,
  scrollEventThrottle,
  children,
  ...props
}: ScrollViewProps) {
  const own = useRef<Handle | null>(null)
  const remeasure = useRef<(() => void) | null>(null)
  // a vertical scroller whose caller hasn't turned the indicator off
  const draws = OWN_SCROLLBAR && !props.horizontal && showsVerticalScrollIndicator !== false
  const { source, props: reports } = useScrollSource(Boolean(props.horizontal), {
    ref: (node: Handle | null) => {
      own.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    scrollEventThrottle,
    onScroll,
    onContentSizeChange,
    // the scroller's own size changed (a sibling grew, a sheet opened), which no scroll or
    // window resize reports
    onLayout: (e) => {
      remeasure.current?.()
      onLayout?.(e)
    },
  })
  return (
    <>
      <RNScrollView
        {...props}
        {...reports}
        showsVerticalScrollIndicator={draws ? false : showsVerticalScrollIndicator}
      >
        <ScrollSourceProvider value={source}>{children}</ScrollSourceProvider>
      </RNScrollView>
      {draws ? <Scrollbar target={own} remeasure={remeasure} /> : null}
    </>
  )
}
