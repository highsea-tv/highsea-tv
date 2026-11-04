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
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, PanResponder, StyleSheet, View } from 'react-native'
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
}

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
  const move = (from: number, to: number) => {
    const item = items[from]
    if (item === undefined || to === from || to < 0 || to >= items.length) return
    const next = [...items]
    next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
    AccessibilityInfo.announceForAccessibility(messages.moved(label(item), to + 1, items.length))
  }
  return (
    <View accessibilityLabel={accessibilityLabel} style={{ gap: look === 'line' ? 0 : GAP }}>
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
            lifted={drag?.from === i}
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
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={messages.move(name)}
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
