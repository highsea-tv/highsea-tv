'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Tabs in two styles (controls.md › Rules): `segmented` (the segmented control's one look, for
// filters and views in a toolbar) and `line` (an underline under a page's title, for its
// sections), both at the control's height and text. The indicator slides with spring.quick,
// measured within the list so page scrolls and layout shifts never move it.
import { Tabs as TabsPrimitive } from 'radix-ui'
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from 'react'
import { cn } from '../lib/cn.ts'
import {
  type ControlSize,
  controlHit,
  controlSizes,
  segmentedItem,
  segmentedThumb,
  segmentedTrack,
} from '../lib/control.ts'
import { Indicator, useIndicator } from '../lib/indicator.tsx'

type Variant = 'segmented' | 'line'
const TabsContext = createContext<{ value: string; variant: Variant; size: ControlSize }>({
  value: '',
  variant: 'segmented',
  size: 'md',
})

export type TabsProps = ComponentProps<typeof TabsPrimitive.Root> & {
  variant?: Variant
  /** 36, or 30 in dense places (controls.md). */
  size?: ControlSize
}

export function Tabs({
  variant = 'segmented',
  size = 'md',
  value: controlled,
  defaultValue = '',
  onValueChange,
  ...props
}: TabsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const value = controlled ?? uncontrolled
  return (
    <TabsContext.Provider value={{ value, variant, size }}>
      <TabsPrimitive.Root
        value={value}
        onValueChange={(next) => {
          setUncontrolled(next)
          onValueChange?.(next)
        }}
        {...props}
      />
    </TabsContext.Provider>
  )
}

// The line's baseline is an inset shadow, not a border, so the indicator sits on it without
// overhanging the list. That lets a long list scroll sideways with no vertical scroll.
const line =
  'relative flex max-w-full gap-5 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

const lineIndicator = 'bottom-0 h-0.5 rounded-full bg-accent'

export function TabsList({
  className,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  const { variant, value, size } = useContext(TabsContext)
  const ref = useRef<HTMLDivElement>(null)
  const box = useIndicator(ref, value)
  return (
    <TabsPrimitive.List
      ref={ref}
      data-control="tabs"
      className={cn(
        variant === 'line'
          ? line
          : // wider than its column (200% text on a phone), it scrolls rather than pushing the
            // page, as the segmented control does
            cn(segmentedTrack[size], 'gap-0.5 overflow-x-auto [scrollbar-width:none]'),
        className,
      )}
      {...props}
    >
      <Indicator box={box} className={variant === 'line' ? lineIndicator : segmentedThumb} />
      {children}
    </TabsPrimitive.List>
  )
}

const lineTrigger: Record<ControlSize, string> = {
  md: `${controlSizes.md.h} ${controlSizes.md.gap} ${controlSizes.md.text} relative shrink-0 px-0.5 font-medium text-text-2 hover:text-text data-[state=active]:text-text`,
  sm: `${controlSizes.sm.h} ${controlSizes.sm.gap} ${controlSizes.sm.text} relative shrink-0 px-0.5 font-medium text-text-2 hover:text-text data-[state=active]:text-text`,
}

export type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** A count after the label, in mono. */
  count?: ReactNode
}

export function TabsTrigger({ className, children, count, value, ...props }: TabsTriggerProps) {
  const ctx = useContext(TabsContext)
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'group/tab inline-flex cursor-pointer items-center whitespace-nowrap transition-tint disabled:pointer-events-none disabled:opacity-45',
        controlHit,
        ctx.variant === 'line'
          ? lineTrigger[ctx.size]
          : cn(
              segmentedItem[ctx.size],
              'data-[state=active]:font-semibold data-[state=active]:text-text',
            ),
        className,
      )}
      {...props}
    >
      <span className="relative">{children}</span>
      {/* on the chosen tab's `control-selected` thumb only `text` reaches 4.5:1 (text-3 is near 2:1) */}
      {count != null && (
        <span className="relative font-mono text-[11px] text-text-3 group-data-[state=active]/tab:text-text">
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  )
}

/** The panel is a tab stop (Tab from the list lands in it), so it shows the focus ring too. */
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('rounded-sm outline-none focus-visible:ring-focus', className)}
      {...props}
    />
  )
}
