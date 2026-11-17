// SPDX-License-Identifier: AGPL-3.0-only
// The admin's toast stack (the web renderer's, web/components/toast.tsx), drawn by the native
// renderer since D2 (one-client-platform-d.md): `toast()` from anywhere, and one `<Toaster />`
// near the root that draws the last three, bottom end (bottom centre when compact), on `s3` edged
// in `line-strong` at level 3 (elevation.md), each with its tone's mark, its words, an action and
// Dismiss. Each is announced politely as it appears (./announce). It stays 5 s, or 10 s with an
// action (accessibility.md#operable, WCAG 2.2.1), and its time stops while a pointer is over it
// or focus is in it. Toasts never play sounds themselves. The phone and the TV have no stack:
// they show a Toast where they stand (toast.tsx).

import { useT } from '@highsea-tv/i18n/react'
import type { ColorRole } from '@highsea-tv/tokens'
import { line, overlay } from '@highsea-tv/tokens'
import { type ReactNode, useEffect, useRef, useSyncExternalStore } from 'react'
import { Platform, View, type ViewStyle } from 'react-native'
import { announce } from './announce'
import { Button } from './button.tsx'
import { Icon } from './icon.tsx'
import type { IconName } from './icons.ts'
import { uiMessages } from './messages.ts'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export type ToastOptions = {
  title: string
  description?: ReactNode
  tone?: ToastTone
  action?: { label: string; onClick: () => void }
  /** ms. Default 5 s, or 10 s with an action. */
  duration?: number
}

type Entry = ToastOptions & { id: number }

const DEFAULT_MS = 5000
const ACTION_MS = 10000
const MAX_VISIBLE = 3

let entries: Entry[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

function show(options: ToastOptions): number {
  const id = nextId++
  entries = [...entries, { ...options, id }].slice(-MAX_VISIBLE)
  emit()
  return id
}

function close(id: number) {
  entries = entries.filter((e) => e.id !== id)
  emit()
}

/** Shows a toast and returns its id. Mount one `<Toaster />` near the root. */
export const toast = Object.assign(show, {
  success: (title: string, o: Omit<ToastOptions, 'title' | 'tone'> = {}) =>
    show({ ...o, title, tone: 'success' }),
  error: (title: string, o: Omit<ToastOptions, 'title' | 'tone'> = {}) =>
    show({ ...o, title, tone: 'danger' }),
  dismiss: close,
  /** Removes every toast at once (tests, sign-out). */
  clear: () => {
    entries = []
    emit()
  },
})

const toneMark: Record<ToastTone, { icon: IconName; bg: ColorRole; fg: ColorRole }> = {
  neutral: { icon: 'info', bg: 's4', fg: 'text-2' },
  info: { icon: 'info', bg: 'badge-info-bg', fg: 'info' },
  success: { icon: 'success', bg: 'badge-success-bg', fg: 'success' },
  warning: { icon: 'warning', bg: 'badge-warning-bg', fg: 'warning' },
  danger: { icon: 'error', bg: 'badge-danger-bg', fg: 'danger' },
}

const words = (n: ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : ''

function ToastItem({ entry }: { entry: Entry }) {
  const theme = useTheme()
  const t = useT(uiMessages)
  const mark = toneMark[entry.tone ?? 'neutral']
  const ms = entry.duration ?? (entry.action ? ACTION_MS : DEFAULT_MS)
  const left = useRef(ms)
  const started = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pause = () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    left.current -= Date.now() - started.current
  }
  const run = () => {
    if (timer.current) return
    started.current = Date.now()
    timer.current = setTimeout(() => close(entry.id), Math.max(0, left.current))
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per toast
  useEffect(() => {
    const said = words(entry.description)
    announce(said ? `${entry.title}. ${said}` : entry.title)
    run()
    return pause
  }, [])
  const form = tokens.adminText.form
  const caption = tokens.text.web.caption
  return (
    <View
      role="status"
      {...({
        onPointerEnter: pause,
        onPointerLeave: run,
        onFocus: pause,
        onBlur: run,
      } as object)}
      style={
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space['3'],
          paddingHorizontal: tokens.space['3'] + tokens.space['0.5'],
          paddingVertical: tokens.space['3'],
          borderRadius: tokens.radius.md,
          borderWidth: line.thin,
          borderColor: theme.colors['line-strong'],
          backgroundColor: theme.colors.s3,
          boxShadow: tokens.elevation[3].boxShadow,
        } as ViewStyle
      }
    >
      <View
        aria-hidden
        style={{
          width: tokens.icon.disc.sm,
          height: tokens.icon.disc.sm,
          borderRadius: tokens.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors[mark.bg],
        }}
      >
        <Icon name={mark.icon} size={tokens.icon.size.sm} color={mark.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text size={form.size} leading={form.leading} weight={600}>
          {entry.title}
        </Text>
        {entry.description == null ? null : typeof entry.description === 'string' ? (
          <Text size={caption.size} leading={caption.leading} color="text-2">
            {entry.description}
          </Text>
        ) : (
          entry.description
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space['1'] }}>
        {entry.action ? (
          <Button
            size="sm"
            onPress={() => {
              entry.action?.onClick()
              close(entry.id)
            }}
          >
            {entry.action.label}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="close"
          accessibilityLabel={t('dismiss')}
          onPress={() => close(entry.id)}
        />
      </View>
    </View>
  )
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const read = () => entries

/** The stack, bottom end (bottom centre when compact), fixed over the page. */
// the server's snapshot is one array, so React sees the same value each time it asks
// (https://react.dev/reference/react/useSyncExternalStore#im-getting-an-error-the-result-of-getsnapshot-should-be-cached)
const NONE: Entry[] = []
const none = () => NONE

export function Toaster({ label = 'Notifications' }: { label?: string }) {
  const theme = useTheme()
  const list = useSyncExternalStore(subscribe, read, none)
  const compact = theme.formFactor.widthClass === 'compact'
  if (!list.length) return null
  return (
    <View
      role="region"
      aria-label={label}
      style={
        {
          position: Platform.OS === 'web' ? 'fixed' : 'absolute',
          bottom: 0,
          right: 0,
          left: compact ? 0 : undefined,
          width: compact ? undefined : overlay.toaster,
          zIndex: 60,
          gap: tokens.space['2'],
          padding: compact ? tokens.space['4'] : tokens.space['6'],
        } as unknown as ViewStyle
      }
    >
      {list.map((e) => (
        <ToastItem key={e.id} entry={e} />
      ))}
    </View>
  )
}
