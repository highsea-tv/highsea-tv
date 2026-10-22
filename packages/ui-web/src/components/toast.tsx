'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Toasts: level 3 (elevation.md), announced politely, paused on hover and focus. Toasts with an
// action stay at least 10s (accessibility.md#operable). Toasts never play sounds themselves.
import { Toast as ToastPrimitive } from 'radix-ui'
import { type ReactNode, useSyncExternalStore } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { Button } from './button.tsx'

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export type ToastOptions = {
  title: ReactNode
  description?: ReactNode
  tone?: ToastTone
  action?: { label: string; onClick: () => void; altText?: string }
  /** ms. Default 5s, or 10s with an action. */
  duration?: number
}

type Entry = ToastOptions & { id: number; open: boolean }

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
  entries = [...entries, { ...options, id, open: true }].slice(-MAX_VISIBLE * 2)
  emit()
  return id
}

function close(id: number) {
  entries = entries.map((e) => (e.id === id ? { ...e, open: false } : e))
  emit()
  // drop it once the exit fade is done
  setTimeout(() => {
    entries = entries.filter((e) => e.id !== id)
    emit()
  }, 400)
}

/** Shows a toast and returns its id. Mount one `<Toaster />` near the root. */
export const toast = Object.assign(show, {
  success: (title: ReactNode, o: Omit<ToastOptions, 'title' | 'tone'> = {}) =>
    show({ ...o, title, tone: 'success' }),
  error: (title: ReactNode, o: Omit<ToastOptions, 'title' | 'tone'> = {}) =>
    show({ ...o, title, tone: 'danger' }),
  dismiss: close,
  /** Removes every toast immediately (tests, sign-out). */
  clear: () => {
    entries = []
    emit()
  },
})

const toneIcon: Record<ToastTone, { icon: IconName; className: string }> = {
  neutral: { icon: 'info', className: 'bg-s4 text-text-2' },
  info: { icon: 'info', className: 'bg-badge-info-bg text-info' },
  success: { icon: 'success', className: 'bg-badge-success-bg text-success' },
  warning: { icon: 'warning', className: 'bg-badge-warning-bg text-warning' },
  danger: { icon: 'error', className: 'bg-badge-danger-bg text-danger' },
}

function ToastItem({ entry }: { entry: Entry }) {
  const tone = toneIcon[entry.tone ?? 'neutral']
  return (
    <ToastPrimitive.Root
      type="background"
      open={entry.open}
      onOpenChange={(open) => {
        if (!open) close(entry.id)
      }}
      duration={entry.duration ?? (entry.action ? ACTION_MS : DEFAULT_MS)}
      className="grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md border border-line-strong bg-s3 px-3.5 py-3 shadow-3 data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[state=closed]:animate-fade-out data-[state=open]:animate-toast-in data-[swipe=cancel]:transition-lift data-[swipe=end]:animate-fade-out"
    >
      <span
        aria-hidden
        className={cn('grid size-8 place-items-center rounded-full', tone.className)}
      >
        <Icon name={tone.icon} size={16} />
      </span>
      <div className="min-w-0">
        <ToastPrimitive.Title className="font-semibold text-form text-text">
          {entry.title}
        </ToastPrimitive.Title>
        {entry.description && (
          <ToastPrimitive.Description className="text-caption text-text-2">
            {entry.description}
          </ToastPrimitive.Description>
        )}
      </div>
      <div className="flex items-center gap-1">
        {entry.action && (
          <ToastPrimitive.Action altText={entry.action.altText ?? entry.action.label} asChild>
            <Button size="sm" variant="secondary" onClick={entry.action.onClick}>
              {entry.action.label}
            </Button>
          </ToastPrimitive.Action>
        )}
        <ToastPrimitive.Close asChild>
          <Button size="sm" variant="ghost" iconOnly icon="close" aria-label="Dismiss" />
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  )
}

/**
 * Renders the toast stack, bottom-right (bottom-center on compact screens). Radix keeps two labels:
 * `label` is read before each toast as it's announced, and `regionLabel` names the region, where
 * Radix fills in `{hotkey}` (https://www.radix-ui.com/primitives/docs/components/toast#api-reference).
 */
export function Toaster({
  label = 'Notification',
  regionLabel = 'Notifications ({hotkey})',
}: {
  label?: string
  regionLabel?: string
}) {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => entries,
    () => entries,
  )
  return (
    <ToastPrimitive.Provider swipeDirection="right" label={label}>
      {list.slice(-MAX_VISIBLE).map((e) => (
        <ToastItem key={e.id} entry={e} />
      ))}
      <ToastPrimitive.Viewport
        label={regionLabel}
        className="fixed inset-x-0 bottom-0 z-[60] m-0 flex list-none flex-col gap-2 p-4 outline-none medium:start-auto medium:w-[26.25rem] medium:p-6"
      />
    </ToastPrimitive.Provider>
  )
}
