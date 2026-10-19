// SPDX-License-Identifier: AGPL-3.0-only
// Tabs in two styles: `segmented` (a pill track with a raised thumb, for filters and views) and
// `line` (an underline, for page sections). The indicator slides with spring.quick.
import { motion } from 'motion/react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useState,
} from 'react'
import { cn } from '../lib/cn.ts'
import { springQuick } from '../lib/motion.ts'

type Variant = 'segmented' | 'line'
const TabsContext = createContext<{ value: string; variant: Variant; id: string }>({
  value: '',
  variant: 'segmented',
  id: '',
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
  const id = useId()
  return (
    <TabsContext.Provider value={{ value, variant, id }}>
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
  segmented: 'inline-flex gap-0.5 rounded-sm bg-s2 p-[3px]',
  // The baseline is an inset shadow, not a border, so the indicator sits on it without
  // overhanging the list. That lets a long list scroll sideways with no vertical scroll.
  line: 'flex max-w-full gap-5 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const { variant } = useContext(TabsContext)
  return <TabsPrimitive.List className={cn(lists[variant], className)} {...props} />
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
  const active = ctx.value === value
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
      {active && (
        <motion.span
          layoutId={`${ctx.id}-indicator`}
          transition={springQuick}
          aria-hidden
          className={
            ctx.variant === 'segmented'
              ? 'absolute inset-0 rounded-[5px] bg-s4 shadow-2'
              : 'absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent'
          }
        />
      )}
      <span className="relative">{children}</span>
      {count != null && <span className="relative font-mono text-[11px] text-text-3">{count}</span>}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('outline-none focus-visible:outline-none', className)}
      {...props}
    />
  )
}
