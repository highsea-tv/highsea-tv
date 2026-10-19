// SPDX-License-Identifier: AGPL-3.0-only
// Tabs in two styles: `segmented` (a pill track with a raised thumb, for filters and views) and
// `line` (an underline, for page sections). The indicator slides with spring.quick, measured
// within the list so page scrolls and layout shifts never move it.
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
import { Indicator, useIndicator } from '../lib/indicator.tsx'

type Variant = 'segmented' | 'line'
const TabsContext = createContext<{ value: string; variant: Variant }>({
  value: '',
  variant: 'segmented',
})

export type TabsProps = ComponentProps<typeof TabsPrimitive.Root> & { variant?: Variant }

export function Tabs({
  variant = 'segmented',
  value: controlled,
  defaultValue = '',
  onValueChange,
  ...props
}: TabsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const value = controlled ?? uncontrolled
  return (
    <TabsContext.Provider value={{ value, variant }}>
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

const lists: Record<Variant, string> = {
  segmented: 'relative inline-flex gap-0.5 rounded-sm bg-s2 p-[3px]',
  // The baseline is an inset shadow, not a border, so the indicator sits on it without
  // overhanging the list. That lets a long list scroll sideways with no vertical scroll.
  line: 'relative flex max-w-full gap-5 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
}

const indicators: Record<Variant, string> = {
  segmented: 'inset-y-[3px] rounded-[5px] bg-s4 shadow-2',
  line: 'bottom-0 h-0.5 rounded-full bg-accent',
}

export function TabsList({
  className,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  const { variant, value } = useContext(TabsContext)
  const ref = useRef<HTMLDivElement>(null)
  const box = useIndicator(ref, value)
  return (
    <TabsPrimitive.List ref={ref} className={cn(lists[variant], className)} {...props}>
      <Indicator box={box} className={indicators[variant]} />
      {children}
    </TabsPrimitive.List>
  )
}

const triggers: Record<Variant, string> = {
  segmented:
    'relative h-7 rounded-[5px] px-2.5 text-[12px] text-text-3 hover:text-text-2 data-[state=active]:text-text',
  line: 'relative h-10 shrink-0 px-0.5 text-ui font-medium text-text-2 hover:text-text data-[state=active]:text-text',
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
        'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap transition-tint disabled:pointer-events-none disabled:opacity-45',
        triggers[ctx.variant],
        className,
      )}
      {...props}
    >
      <span className="relative">{children}</span>
      {count != null && <span className="relative font-mono text-[11px] text-text-3">{count}</span>}
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
