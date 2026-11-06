// SPDX-License-Identifier: AGPL-3.0-only
// A tooltip with a pointer (the web renderer's, web/components/tooltip.tsx): level 3
// (elevation.md), `s4` with `text` in caption type, shown above its trigger after a pointer rests
// on it for 700 ms (Radix's default delay, https://www.radix-ui.com/primitives/docs/components/tooltip#provider)
// or at once when focus comes into it, and gone on Escape, leaving or blur
// (https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/). It's drawn `position: fixed` at the
// trigger's place in the window, so a scroller or a frame that clips can't cut it off
// (https://drafts.csswg.org/css-position/#fixed-pos). Touch and the TV have no hover: there it
// draws only its trigger, and the trigger's own label carries what it says.
import { type ComponentRef, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { Platform, View, type ViewStyle } from 'react-native'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

const DELAY_MS = 700
const GAP = 6
const EDGE = 8

export type TooltipProps = {
  content: string
  /** Turns it off. */
  disabled?: boolean
  /**
   * The wrapper takes focus itself: for a disabled trigger, which takes none, so a keyboard can
   * still reach the reason (Radix's documented wrapper for a disabled trigger).
   */
  focusable?: boolean
  children: ReactNode
}

type Place = { left: number; top: number; width: number }

/** The DOM's window and an element's box, which React Native's types leave out: only the web draws a tooltip. */
type Listen = (type: string, listener: (e: { key?: string }) => void, capture?: boolean) => void
const win = globalThis as unknown as { addEventListener: Listen; removeEventListener: Listen }
type Box = { getBoundingClientRect?: () => { left: number; top: number; width: number } }

export function Tooltip({ content, disabled, focusable, children }: TooltipProps) {
  const theme = useTheme()
  const pointer = theme.formFactor.input === 'pointer' && Platform.OS === 'web'
  const ref = useRef<ComponentRef<typeof View>>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const id = useId()
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const show = () => {
    clear()
    const el = ref.current as unknown as Box | null
    const r = el?.getBoundingClientRect?.()
    if (r) setPlace({ left: r.left + r.width / 2, top: r.top, width: r.width })
  }
  const hide = () => {
    clear()
    setPlace(null)
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: hide is the same each render's
  useEffect(() => {
    if (!place) return
    const key = (e: { key?: string }) => {
      if (e.key === 'Escape') hide()
    }
    win.addEventListener('keydown', key)
    win.addEventListener('scroll', hide, true)
    return () => {
      win.removeEventListener('keydown', key)
      win.removeEventListener('scroll', hide, true)
    }
  }, [place])
  // biome-ignore lint/correctness/useExhaustiveDependencies: the timer's ref, cleared once on unmount
  useEffect(() => clear, [])
  if (!pointer || disabled) {
    return focusable ? (
      <View focusable role="group" aria-label={content} style={{ alignSelf: 'flex-start' }}>
        {children}
      </View>
    ) : (
      <>{children}</>
    )
  }
  const caption = tokens.text.web.caption
  return (
    <View
      ref={ref}
      focusable={focusable}
      aria-describedby={place ? id : undefined}
      {...({
        onPointerEnter: () => {
          clear()
          timer.current = setTimeout(show, DELAY_MS)
        },
        onPointerLeave: hide,
        onFocus: show,
        onBlur: hide,
      } as object)}
      style={{ alignSelf: 'flex-start', borderRadius: tokens.radius.sm }}
    >
      {children}
      {place ? (
        <View
          nativeID={id}
          role="tooltip"
          pointerEvents="none"
          style={
            {
              position: 'fixed',
              left: Math.max(EDGE, place.left),
              top: place.top - GAP,
              transform: 'translate(-50%, -100%)',
              zIndex: 70,
              maxWidth: 256,
              paddingHorizontal: tokens.space['2'] + tokens.space['0.5'],
              paddingVertical: tokens.space['1'] + tokens.space['0.5'],
              borderRadius: tokens.radius.sm,
              backgroundColor: theme.colors.s4,
              boxShadow: tokens.elevation[3].boxShadow,
            } as unknown as ViewStyle
          }
        >
          <Text size={caption.size} leading={caption.leading}>
            {content}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
