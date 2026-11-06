// SPDX-License-Identifier: AGPL-3.0-only
// A vertical list reordered by a drag handle, as the web's SortableList (sortable-list.tsx) and
// the prototype's Settings › Home screen draw it: each row a card (s1, `line`, radius-md, 56 tall,
// 8 apart) with the handle first; while it moves, the row lifts with an accent edge and follows the
// finger, and the rows it passes slide aside. Built on React Native's own PanResponder and Animated
// (https://reactnative.dev/docs/panresponder, https://reactnative.dev/docs/animated), so it needs
// no gesture library and the TV's bundle can carry it too. The handle claims the gesture and keeps
// it from the page's ScrollView (`onPanResponderTerminationRequest`). Rows are taken as one height,
// which a settings list's rows are. VoiceOver moves a row with the handle's actions, Move up and
// Move down, and hears where it landed (AccessibilityInfo.announceForAccessibility).
// With a keyboard on the web the handle is a tab stop and works as the web renderer's does
// (web/components/sortable-list.tsx, after dnd-kit's keyboard sensor): Space or Enter picks the
// row up, Up and Down move it, Space or Enter drops it, and Escape puts it back where it was.
// react-native-web forwards `onKeyDown` and `focusable` to the element
// (https://necolas.github.io/react-native-web/docs/view/), and focus goes back to the handle after
// each move, as moving a node in the document drops it.
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, PanResponder, Platform, StyleSheet, View } from 'react-native'
import { Icon } from './icon.tsx'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'

/** Rows keep 8 apart (the prototype's `gap-2`). */
const GAP = tokens.space['2']

export type SortableListMessages = {
  /** The handle's name: "Move Staff picks". */
  move: (name: string) => string
  moveUp: (name: string) => string
  moveDown: (name: string) => string
  /** Said once a row lands: "Staff picks moved to 3 of 8." */
  moved: (name: string, index: number, count: number) => string
  /** The keyboard's: said as Space picks a row up ("Staff picks picked up, 3 of 8."). */
  pickedUp?: (name: string, index: number, count: number) => string
  /** The keyboard's: said as Space drops it. */
  dropped?: (name: string, index: number, count: number) => string
  /** The keyboard's: said as Escape puts it back. */
  cancelled?: (name: string) => string
}

const web = Platform.OS === 'web'
/** The handle's element on the web, which can take focus. */
type Focusable = { focus?: () => void }

export type SortableListProps<T> = {
  items: readonly T[]
  id: (item: T) => string
  /** The row's name, for the handle and what VoiceOver hears. */
  label: (item: T) => string
  onChange: (next: T[]) => void
  accessibilityLabel: string
  messages: SortableListMessages
  disabled?: boolean
  /**
   * `card` (the default): each row a card, 8 apart, as a settings list's. `line`: rows touching,
   * each over a hairline in `line`, as a playlist's songs are (web/playlist.tsx's border-b rows).
   */
  look?: 'card' | 'line'
  /** The row's content; put `handle` first. */
  children: (item: T, handle: ReactNode) => ReactNode
}

export function SortableList<T>({
  items,
  id,
  label,
  onChange,
  accessibilityLabel,
  messages,
  disabled,
  look = 'card',
  children,
}: SortableListProps<T>) {
  const [drag, setDrag] = useState<{ from: number; to: number; step: number } | null>(null)
  // the row the keyboard holds, and the order to go back to on Escape
  const [held, setHeld] = useState<{ id: string; origin: T[] } | null>(null)
  const handles = useRef(new Map<string, Focusable>())
  const refocus = useRef<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: after every draw a move asked for
  useEffect(() => {
    if (!refocus.current) return
    handles.current.get(refocus.current)?.focus?.()
    refocus.current = null
  })
  const say = (words: string | undefined) => {
    if (words) AccessibilityInfo.announceForAccessibility(words)
  }
  const move = (from: number, to: number) => {
    const item = items[from]
    if (item === undefined || to === from || to < 0 || to >= items.length) return
    const next = [...items]
    next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
    AccessibilityInfo.announceForAccessibility(messages.moved(label(item), to + 1, items.length))
  }
  /** A key on row `i`'s handle; true when it was the list's. */
  const onKey = (i: number, key: string): boolean => {
    const item = items[i]
    if (item === undefined || disabled) return false
    const rowId = id(item)
    const name = label(item)
    const mine = held?.id === rowId
    if (key === ' ' || key === 'Enter') {
      if (mine) {
        setHeld(null)
        say(messages.dropped?.(name, i + 1, items.length))
      } else {
        setHeld({ id: rowId, origin: [...items] })
        say(messages.pickedUp?.(name, i + 1, items.length))
      }
      return true
    }
    if (!mine || !held) return false
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const to = i + (key === 'ArrowUp' ? -1 : 1)
      if (to >= 0 && to < items.length) {
        refocus.current = rowId
        move(i, to)
      }
      return true
    }
    if (key === 'Escape') {
      refocus.current = rowId
      setHeld(null)
      onChange([...held.origin])
      say(messages.cancelled?.(name))
      return true
    }
    return false
  }
  return (
    <View
      role="group"
      accessibilityLabel={accessibilityLabel}
      style={{ gap: look === 'line' ? 0 : GAP }}
    >
      {items.map((item, i) => {
        // the rows between where the dragged one started and where it is now step aside
        const shift =
          !drag || i === drag.from
            ? 0
            : drag.from < drag.to && i > drag.from && i <= drag.to
              ? -drag.step
              : drag.from > drag.to && i >= drag.to && i < drag.from
                ? drag.step
                : 0
        return (
          <SortableRow
            key={id(item)}
            index={i}
            count={items.length}
            name={label(item)}
            shift={shift}
            lifted={drag?.from === i || held?.id === id(item)}
            onKey={(key) => onKey(i, key)}
            onBlur={() => {
              // a move blurs the handle as its node moves; leaving the handle drops the row
              if (!refocus.current && held?.id === id(item)) setHeld(null)
            }}
            handleRef={(el) => {
              if (el) handles.current.set(id(item), el)
              else handles.current.delete(id(item))
            }}
            disabled={disabled}
            look={look}
            messages={messages}
            onDrag={(to, step) => setDrag({ from: i, to, step })}
            onDrop={(to) => {
              setDrag(null)
              move(i, to)
            }}
            onMove={(by) => move(i, i + by)}
          >
            {(handle) => children(item, handle)}
          </SortableRow>
        )
      })}
    </View>
  )
}

function SortableRow({
  index,
  count,
  name,
  shift,
  lifted,
  disabled,
  look,
  messages,
  onDrag,
  onDrop,
  onMove,
  onKey,
  onBlur,
  handleRef,
  children,
}: {
  index: number
  count: number
  name: string
  shift: number
  lifted: boolean
  disabled?: boolean
  look: 'card' | 'line'
  messages: SortableListMessages
  onDrag: (to: number, step: number) => void
  onDrop: (to: number) => void
  onMove: (by: -1 | 1) => void
  onKey: (key: string) => boolean
  onBlur: () => void
  handleRef: (el: Focusable | null) => void
  children: (handle: ReactNode) => ReactNode
}) {
  const theme = useTheme()
  const reduced = useMotionReduced()
  const follow = useRef(new Animated.Value(0)).current
  const aside = useRef(new Animated.Value(0)).current
  const height = useRef(56)
  // the responder is made once, so it reads the latest props through this
  const latest = useRef({ index, count, onDrag, onDrop, look })
  latest.current = { index, count, onDrag, onDrop, look }
  const target = (dy: number) => {
    const { index: i, count: n } = latest.current
    const step = height.current + (latest.current.look === 'line' ? 0 : GAP)
    return { to: Math.max(0, Math.min(n - 1, i + Math.round(dy / step))), step }
  }

  useEffect(() => {
    if (reduced) aside.setValue(shift)
    else
      Animated.spring(aside, {
        toValue: shift,
        ...tokens.springs.quick,
        useNativeDriver: true,
      }).start()
  }, [shift, reduced, aside])

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const { step } = target(0)
        latest.current.onDrag(latest.current.index, step)
      },
      onPanResponderMove: (_, g) => {
        follow.setValue(g.dy)
        const { to, step } = target(g.dy)
        latest.current.onDrag(to, step)
      },
      onPanResponderRelease: (_, g) => {
        follow.setValue(0)
        latest.current.onDrop(target(g.dy).to)
      },
      onPanResponderTerminate: () => {
        follow.setValue(0)
        latest.current.onDrop(latest.current.index)
      },
    }),
  ).current

  const handle = (
    <View
      {...(disabled ? {} : responder.panHandlers)}
      {...((web
        ? {
            ref: handleRef,
            focusable: !disabled,
            onBlur,
            onKeyDown: (e: { key: string; preventDefault: () => void }) => {
              if (onKey(e.key)) e.preventDefault()
            },
          }
        : {}) as object)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={messages.move(name)}
      // a slider's value (https://www.w3.org/TR/wai-aria-1.2/#slider): the row's place in the list
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={index + 1}
      accessibilityActions={[
        { name: 'increment', label: messages.moveDown(name) },
        { name: 'decrement', label: messages.moveUp(name) },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && index < count - 1) onMove(1)
        if (e.nativeEvent.actionName === 'decrement' && index > 0) onMove(-1)
      }}
      // the handle is 28 drawn, as the web's size-7, with the touch target grown to 44 around it
      hitSlop={8}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: lifted ? theme.colors['accent-soft'] : 'transparent',
        opacity: disabled ? tokens.controls.disabledOpacity : 1,
      }}
    >
      <Icon name="drag" size={tokens.icon.size.sm} color={lifted ? 'accent-text' : 'text-3'} />
    </View>
  )

  return (
    <Animated.View
      onLayout={(e) => {
        height.current = e.nativeEvent.layout.height
      }}
      style={[
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space['3'],
          paddingHorizontal: tokens.space['3'],
          paddingVertical: 10,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: theme.colors[lifted ? 'accent' : 'line'],
          backgroundColor: theme.colors.s1,
          zIndex: lifted ? 10 : 0,
          boxShadow: lifted ? tokens.elevation[3].boxShadow : undefined,
          transform: [{ translateY: lifted ? follow : aside }],
        },
        look === 'line' && {
          minHeight: tokens.space['12'],
          gap: tokens.space['1'],
          paddingHorizontal: 0,
          paddingVertical: 0,
          borderRadius: lifted ? tokens.radius.sm : 0,
          borderWidth: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.line,
          backgroundColor: lifted ? theme.colors.s1 : 'transparent',
        },
      ]}
    >
      {children(handle)}
    </Animated.View>
  )
}
