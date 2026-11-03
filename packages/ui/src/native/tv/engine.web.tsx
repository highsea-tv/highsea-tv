// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./engine.tsx: the TV's focus in a browser (one-client-platform.md › A,
// question 5), for the client's web build on the TV's form factor and a webOS or Tizen build
// (ADR 0008). react-native-web has no focus engine of its own, no TVFocusGuideView and no
// useTVEventHandler, so the spatial focus engine the TV prototype signed off (./spatial) moves
// focus here behind the same names: the stops and regions mark themselves in the DOM
// (react-native-web's `dataSet` becomes `data-*` attributes), and one navigator on the document
// moves focus by the arrow keys while any stop is mounted. Each mapping, from react-native-tvos's
// readme (https://github.com/react-native-tvos/react-native-tvos#readme):
// - a stop is `[data-focusable]`, `hasTVPreferredFocus` takes focus as the stop appears (or as the
//   prop turns on) and marks `[data-initial]`, and `requestTVFocus()` is the element's `focus()`;
// - TVFocusGuideView's `autoFocus` is a `[data-group]`, where the navigator remembers the stop last
//   focused, its `trapFocus*` a `[data-trap]`, and its `destinations` a `[data-guide]` whose
//   destinations the navigator reads from here;
// - useTVEventHandler's events are the keyboard's: the arrows, Enter for `select`, Escape and
//   Backspace for `menu` (Back), and the media key for `playPause`;
// - a scroller that follows focus is a track the navigator moves by transform, landing the focused
//   stop (or its Kept part) at `keep`, as the prototype's rows and pages do.
// What a stop draws on focus (the lift, the ring and their colours) is Focusable's, the same on
// every platform; only this engine differs.
import { springs, springToCss } from '@highsea-tv/tokens'
import { type Ref, useCallback, useEffect, useId, useRef } from 'react'
import { type PressableProps, View, type ViewProps, type ViewStyle } from 'react-native'
import { useMotionReduced } from '../theme.tsx'
import type {
  FocusGuide as nativeFocusGuide,
  keptProps as nativeKeptProps,
  requestFocus as nativeRequestFocus,
  TvScroll as nativeTvScroll,
  useRemote as nativeUseRemote,
  useStop as nativeUseStop,
} from './engine.tsx'
import type { ViewHandle } from './focusable.tsx'
import { createSpatialNavigator, type SpatialNavigator } from './spatial/navigator.ts'

export type { FocusGuideProps, RemotePress, Stop, StopOptions, TvScrollProps } from './engine.tsx'

/** react-native-web's `dataSet`, which its types (React Native's) don't list. */
type Marked = { dataSet?: Record<string, string> }

/** Only the attributes that are on: react-native-web writes every key it's given. */
const marks = (all: Record<string, string | false | undefined>) => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(all)) if (typeof v === 'string') out[k] = v
  return out
}

/** Each guide's destinations, by its element, for the navigator's `destinations`. */
const guides = new WeakMap<HTMLElement, readonly unknown[]>()
const elements = (all: readonly unknown[] | undefined) =>
  (all ?? []).filter((d): d is HTMLElement => d instanceof HTMLElement)

const quick = springToCss(springs.quick)
const base = springToCss(springs.base)

/** The one navigator, on the document while any stop is mounted. */
let navigator: SpatialNavigator | null = null
let stops = 0
let onResize: (() => void) | null = null

/**
 * A focused stop that unmounts leaves focus on nothing, where tvOS's engine would find the screen
 * another. So when focus leaves for nowhere (a null `relatedTarget`) and the stop it left has gone
 * from the document, the stop marked preferred (`[data-initial]`) takes it, or the first stop. A
 * pointer's click on the page's background also loses focus to nothing, but leaves its stop in
 * place, so it isn't taken back. Browsers differ on whether removing the focused element fires
 * focusout (the HTML standard's focus fixup fires nothing), so the stop's ref asks too.
 */
function refocusIfGone(left: EventTarget | null) {
  requestAnimationFrame(() => {
    if (!(left instanceof HTMLElement) || left.isConnected) return
    const active = document.activeElement
    if (active && active !== document.body) return
    const next =
      document.querySelector<HTMLElement>('[data-initial]') ??
      document.querySelector<HTMLElement>('[data-focusable]')
    next?.focus({ preventScroll: true })
  })
}
const onFocusOut = (e: FocusEvent) => {
  if (e.relatedTarget === null) refocusIfGone(e.target)
}

/**
 * Select presses a stop on the TVs whatever its role. react-native-web presses on Enter's keyup
 * only for elements the browser doesn't click by itself, and counts `role="link"` among those
 * (its PressResponder), but a link without an address is a <div>, which the browser never clicks.
 * So Enter clicks it, which react-native-web's onClick turns into onPress. Every other role is
 * pressed by react-native-web's own keyup, so this leaves them alone: one press each.
 */
function clickLink(this: HTMLElement, e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.target !== this || this.tagName === 'A') return
  if (this.getAttribute('role') === 'link') this.click()
}

/**
 * Whether the tracks slide or jump: the theme's answer (useMotionReduced, which takes a
 * ThemeProvider's override, such as the prototypes' Reduced motion, over the OS's), as the last
 * stop drawn read it. The navigator is one for the document, so it reads this rather than a hook.
 */
let motionReduced = false

function useNavigator() {
  motionReduced = useMotionReduced()
  useEffect(() => {
    stops += 1
    if (!navigator) {
      const nav = createSpatialNavigator(document.body, {
        reducedMotion: () => motionReduced,
        destinations: (guide) => elements(guides.get(guide)),
        // a row slides on spring.quick and a page on spring.base, as the prototype's do
        transition: (axis) => {
          const s = axis === 'x' ? quick : base
          return `transform ${s.duration}ms ${s.easing}`
        },
      })
      navigator = nav
      onResize = () => nav.refresh()
      window.addEventListener('resize', onResize)
      document.addEventListener('focusout', onFocusOut)
    }
    return () => {
      stops -= 1
      if (stops === 0 && navigator) {
        navigator.destroy()
        navigator = null
        if (onResize) window.removeEventListener('resize', onResize)
        document.removeEventListener('focusout', onFocusOut)
        onResize = null
      }
    }
  }, [])
}

/** Sets a ref of any kind, as React does. */
function assign<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as { current: T | null }).current = value
}

export const useStop: typeof nativeUseStop = (ref, { preferred, disabled }) => {
  useNavigator()
  const node = useRef<HTMLElement | null>(null)
  const merged = useCallback(
    (value: ViewHandle | null) => {
      const was = node.current
      const el = value as unknown as HTMLElement | null
      if (was && was !== el) {
        was.removeEventListener('keyup', clickLink)
        if (was === document.activeElement) refocusIfGone(was)
      }
      // in the ref, so a stop's new element after a remount has it too
      el?.addEventListener('keyup', clickLink)
      node.current = el
      assign(ref, value)
    },
    [ref],
  )
  // tvOS's preferred focus takes focus as the stop appears, or as the prop turns on
  useEffect(() => {
    if (preferred && !disabled) node.current?.focus({ preventScroll: true })
  }, [preferred, disabled])
  const props: PressableProps & Marked = {
    focusable: !disabled,
    dataSet: marks({ focusable: !disabled && '', initial: preferred && !disabled && '' }),
  }
  // the ring is Focusable's, so the browser's own outline is left off: its `:focus-visible` outline
  // is `auto`, which ignores a width, so only `none` removes it (CSS UI 4 § outline-style). React
  // Native's types list only the styles it draws itself; react-native-web passes this one on.
  return { ref: merged, props, style: { outlineStyle: 'none' } as unknown as ViewStyle }
}

export const requestFocus: typeof nativeRequestFocus = (handle) => {
  ;(handle as unknown as HTMLElement | null)?.focus?.({ preventScroll: true })
}

export const FocusGuide: typeof nativeFocusGuide = ({
  destinations,
  autoFocus,
  trapFocusUp,
  trapFocusDown,
  trapFocusLeft,
  trapFocusRight,
  onFocusEnter,
  onFocusLeave,
  // the TVs' own: whether the region takes focus at all, and its safe-area padding
  focusable: _focusable,
  enabled: _enabled,
  safePadding: _safePadding,
  children,
  ...props
}) => {
  const group = useId()
  const node = useRef<HTMLElement | null>(null)
  const enter = useRef(onFocusEnter)
  const leave = useRef(onFocusLeave)
  enter.current = onFocusEnter
  leave.current = onFocusLeave
  useEffect(() => {
    const el = node.current
    if (!el) return
    guides.set(el, destinations ?? [])
  })
  // tvOS's onFocusEnter and onFocusLeave: focus coming into the region from outside, or leaving it
  useEffect(() => {
    const el = node.current
    if (!el) return
    const outside = (target: EventTarget | null) => !(target instanceof Node && el.contains(target))
    const onIn = (e: FocusEvent) => {
      // react-native-tvos hands its focus event on, which no part reads
      if (outside(e.relatedTarget)) enter.current?.(e as never)
    }
    const onOut = (e: FocusEvent) => {
      if (outside(e.relatedTarget)) leave.current?.(e as never)
    }
    el.addEventListener('focusin', onIn)
    el.addEventListener('focusout', onOut)
    return () => {
      el.removeEventListener('focusin', onIn)
      el.removeEventListener('focusout', onOut)
    }
  }, [])
  const trap = [
    trapFocusUp && 'up',
    trapFocusDown && 'down',
    trapFocusLeft && 'left',
    trapFocusRight && 'right',
  ].filter(Boolean)
  const marked: Marked = {
    dataSet: marks({
      group: autoFocus && group,
      trap: trap.length > 0 && trap.join(' '),
      guide: (destinations ?? []).some(Boolean) && '',
    }),
  }
  return (
    <View
      {...props}
      {...marked}
      ref={(value) => {
        node.current = value as unknown as HTMLElement | null
      }}
    >
      {children}
    </View>
  )
}

/** The keyboard's keys as the remote's events. */
const REMOTE: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  Escape: 'menu',
  Backspace: 'menu',
  MediaPlayPause: 'playPause',
}

export const useRemote: typeof nativeUseRemote = (handler) => {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // the navigator's modifiers: a key with any of them isn't the remote's
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const eventType = REMOTE[e.key]
      if (!eventType) return
      // a text field keeps its keys, Escape aside
      const typing = (e.target as HTMLElement | null)?.closest?.(
        'input, textarea, select, [contenteditable="true"]',
      )
      if (typing && eventType !== 'menu') return
      if (typing && e.key === 'Backspace') return
      latest.current({ eventType })
    }
    // In the capture phase: react-native-web's PressResponder stops Enter's keydown on a focused
    // stop (`isValidKeyPress`, then `stopPropagation`), which would keep `select` from a listener
    // on the way up. Listening here neither presses the stop nor stops the key, so the stop is
    // still pressed once, on keyup, as on the TVs, where Select both presses and reaches the
    // handler (https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#capture).
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])
}

export const TvScroll: typeof nativeTvScroll = ({
  horizontal,
  keep,
  style,
  contentContainerStyle,
  children,
}) => {
  const track: Marked = { dataSet: { scroll: horizontal ? 'x' : 'y', keep: String(keep) } }
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <View
        {...track}
        // a sideways track is as wide as its stops, so the navigator reads where it ends
        style={[
          horizontal && { flexDirection: 'row', alignSelf: 'flex-start' },
          contentContainerStyle,
        ]}
      >
        {children}
      </View>
    </View>
  )
}

export const keptProps: typeof nativeKeptProps = (rest) =>
  ({ dataSet: { kept: rest ? 'rest' : 'center' } }) as Marked as ViewProps
