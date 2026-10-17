// SPDX-License-Identifier: AGPL-3.0-only
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm'

const base =
  'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent font-medium transition-press focus-visible:scale-(--scale-button) motion-safe:active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0'

export const buttonVariants: Record<ButtonVariant, string> = {
  // one per view (color.md): the accent fill with a 600 label, no subpixel thinning
  primary:
    'bg-accent-fill font-semibold text-on-accent [-webkit-font-smoothing:auto] hover:brightness-108',
  secondary: 'border-line-strong bg-s2 text-text hover:bg-s3',
  ghost: 'bg-transparent text-text-2 hover:bg-s2 hover:text-text',
  danger:
    'bg-danger-fill font-semibold text-on-danger [-webkit-font-smoothing:auto] hover:brightness-110',
}

export const buttonSizes: Record<ButtonSize, { box: string; icon: string; glyph: number }> = {
  md: { box: 'h-(--size-control) px-4 text-form', icon: 'w-(--size-control) px-0', glyph: 16 },
  sm: { box: 'h-(--size-control-sm) px-3 text-ui', icon: 'w-(--size-control-sm) px-0', glyph: 16 },
}

export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** An icon before the label. */
  icon?: IconName
  /** An icon after the label. */
  iconEnd?: IconName
  /** Square, icon-only. Needs an `aria-label`. */
  iconOnly?: boolean
  /** Shows a spinner in place of the icon and marks the button busy. */
  loading?: boolean
  /** Renders the child element (a link) with button styling. */
  asChild?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  iconOnly = false,
  loading = false,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const s = buttonSizes[size]
  const lead = loading ? (
    <Icon name="loading" size={s.glyph} className="motion-safe:animate-spin" />
  ) : icon ? (
    <Icon name={icon} size={s.glyph} />
  ) : null
  const classes = cn(base, buttonVariants[variant], s.box, iconOnly && s.icon, className)
  if (asChild)
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    )
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {lead}
      {children}
      {iconEnd && <Icon name={iconEnd} size={s.glyph} />}
    </button>
  )
}
