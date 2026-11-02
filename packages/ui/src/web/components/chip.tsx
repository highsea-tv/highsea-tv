'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A chip: a filter or a choice in a row of them (controls.md). One design on every platform: a pill
// at the control's height, `s2` with the `line-strong` edge and a `text-2` label; chosen, it's
// `control-selected` with a `text` label at 600. Chips are the one control that is a pill. A chip
// that toggles says so with `aria-pressed` (https://www.w3.org/WAI/ARIA/apg/patterns/button/).
import type { ComponentProps } from 'react'
import type { ChipCommon } from '../../shared/controls.ts'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { controlDisabled, controlHit, controlPress, controlSizes } from '../lib/control.ts'

export type ChipProps = Omit<ComponentProps<'button'>, keyof ChipCommon> &
  ChipCommon<IconName> & {
    /** The remove mark's name, read after the label. */
    removeLabel?: string
  }

const base = `inline-flex max-w-full shrink-0 cursor-pointer select-none items-center whitespace-nowrap rounded-full border border-line-strong bg-s2 font-medium text-text-2 transition-press hover:text-text aria-pressed:border-transparent aria-pressed:bg-control-selected aria-pressed:font-semibold aria-pressed:text-text ${controlHit} ${controlPress} ${controlDisabled}`

export function Chip({
  selected,
  icon,
  removable = false,
  removeLabel = 'Remove',
  size = 'md',
  className,
  children,
  type,
  ...props
}: ChipProps) {
  const s = controlSizes[size]
  return (
    <button
      type={type ?? 'button'}
      data-control="chip"
      // a chip that can be chosen is a toggle button; one that only removes is a plain button
      aria-pressed={selected === undefined ? undefined : selected}
      className={cn(base, s.h, s.pad, s.gap, s.text, className)}
      {...props}
    >
      {icon && <Icon name={icon} className={s.icon} />}
      <span className="truncate">{children}</span>
      {removable && (
        <>
          <Icon name="close" className={s.icon} />
          <span className="sr-only">{removeLabel}</span>
        </>
      )}
    </button>
  )
}
