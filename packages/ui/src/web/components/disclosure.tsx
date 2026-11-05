'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A disclosure: a row that shows and hides what's under it (an accordion's row), with its title, an
// optional detail and a chevron that turns when open. On Radix's Collapsible, which wires
// `aria-expanded` and `aria-controls` and the Enter and Space keys
// (https://www.radix-ui.com/primitives/docs/components/collapsible, the APG's disclosure pattern:
// https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).
import { Collapsible } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import type { DisclosureCommon } from '../../shared/controls.ts'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { controlHit, controlShape, controlSizes } from '../lib/control.ts'

export type DisclosureProps = Omit<ComponentProps<'div'>, keyof DisclosureCommon | 'children'> &
  DisclosureCommon<IconName> & {
    children: ReactNode
  }

export function Disclosure({
  title,
  icon,
  detail,
  open,
  defaultOpen,
  onOpenChange,
  className,
  children,
  ...props
}: DisclosureProps) {
  const s = controlSizes.md
  return (
    <Collapsible.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      data-control="disclosure"
      className={cn('group/disclosure min-w-0', className)}
      {...props}
    >
      <Collapsible.Trigger
        className={cn(
          controlShape,
          controlHit,
          s.minH,
          s.fieldPad,
          s.gap,
          s.text,
          'flex w-full cursor-pointer items-center py-2 text-start text-text transition-tint hover:bg-s2 focus-visible:outline-offset-0',
        )}
      >
        {icon && <Icon name={icon} className={cn(s.icon, 'shrink-0 text-text-2')} />}
        {/* the title and detail wrap, as the native renderer's do: a truncated line would widen
            whatever sizes to its content and hide words at 200% text (WCAG 1.4.4, 1.4.10) */}
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="block font-medium">{title}</span>
          {detail && <span className="block text-caption text-text-3">{detail}</span>}
        </span>
        <Icon
          name="chevron-down"
          className={cn(
            s.icon,
            'shrink-0 text-text-3 transition-press group-data-[state=open]/disclosure:rotate-180',
          )}
        />
      </Collapsible.Trigger>
      <Collapsible.Content className={cn(s.fieldPad, 'min-w-0 pt-1 pb-2')}>
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
